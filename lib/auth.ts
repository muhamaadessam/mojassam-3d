import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { cookies } from 'next/headers';

const scrypt = promisify(scryptCallback);
let database: DatabaseSync | null = null;

/** Opens the database on first use, so importing this module (e.g. during `next build`) has no side effects. */
export function getDb() {
  if (database) return database;
  const databasePath = resolve(process.env.DATA_DIRECTORY || '.data', 'mojassam.sqlite');
  mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL, avatar_url TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attempts (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), design_id TEXT, design_name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', material TEXT, color TEXT, infill REAL, estimated_hours REAL, estimated_price REAL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS orders_user_created ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS orders_created ON orders(created_at);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS order_files (id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE, kind TEXT NOT NULL, name TEXT NOT NULL, stored TEXT NOT NULL, size INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS order_files_order ON order_files(order_id);`);
  // Columns added after the first release; ALTER fails harmlessly once they exist.
  for (const column of ['quantity INTEGER NOT NULL DEFAULT 1', "phone TEXT NOT NULL DEFAULT ''", "customer_note TEXT NOT NULL DEFAULT ''", 'final_price REAL', "admin_note TEXT NOT NULL DEFAULT ''", 'updated_at TEXT', 'unit_price REAL', 'unit_hours REAL']) {
    try { db.exec(`ALTER TABLE orders ADD COLUMN ${column}`); } catch { /* already added */ }
  }
  database = db;
  return db;
}

export type User = { id: string; email: string; first_name: string; last_name: string; avatar_url: string; is_admin: boolean };

/** Shop owners: comma-separated emails in ADMIN_EMAILS. They must still sign in with their own password. */
export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());
}

export async function getAdmin() {
  const user = await getUser();
  return user?.is_admin ? user : null;
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const cookieName = 'mojassam_session';

export class RateLimitError extends Error {
  constructor() { super('محاولات كثيرة. حاول بعد 15 دقيقة.'); }
}

export async function getUser(): Promise<User | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  const user = getDb().prepare('SELECT u.id, u.email, u.first_name, u.last_name, u.avatar_url FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?').get(hash(token), Date.now()) as Omit<User, 'is_admin'> | undefined;
  return user ? { ...user, is_admin: isAdminEmail(user.email) } : null;
}

/** Fixed 15-minute window counter. Throws RateLimitError once `maximum` is exceeded. */
export function limitAttempts(key: string, maximum: number) {
  const db = getDb();
  const now = Date.now();
  db.prepare('DELETE FROM attempts WHERE expires<?').run(now);
  const row = db.prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').get(hash(key), now + 15 * 60_000);
  if (Number(row?.count) > maximum) throw new RateLimitError();
}

export function clearAttempts(key: string) {
  getDb().prepare('DELETE FROM attempts WHERE key=?').run(hash(key));
}

/**
 * The visitor's IP. Passenger/Apache appends the real client address as the last
 * X-Forwarded-For entry; earlier entries can be forged by the client, so they are ignored.
 */
export function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',').map((part) => part.trim()).filter(Boolean);
  return forwarded?.at(-1) || request.headers.get('x-real-ip') || 'local';
}

export async function register(email: string, password: string, first: string, last: string) {
  const salt = randomBytes(16).toString('hex');
  const derived = await scrypt(password, salt, 64) as Buffer;
  const id = randomUUID();
  try {
    getDb().prepare('INSERT INTO users(id,email,password,first_name,last_name) VALUES(?,?,?,?,?)').run(id, email, `${salt}:${derived.toString('hex')}`, first, last);
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE')) throw new Error('تعذر إنشاء الحساب بهذه البيانات. جرّب تسجيل الدخول.');
    throw error;
  }
  return id;
}

export async function authenticate(email: string, password: string) {
  const user = getDb().prepare('SELECT id,password FROM users WHERE email=?').get(email);
  // Hash against a dummy value when the user does not exist, so timing does not reveal registered emails.
  const stored = String(user?.password || `${'0'.repeat(32)}:${'0'.repeat(128)}`);
  const [salt, expected] = stored.split(':');
  const actual = await scrypt(password, salt, 64) as Buffer;
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (!user || expectedBuffer.length !== actual.length || !timingSafeEqual(actual, expectedBuffer)) throw new Error('البريد الإلكتروني أو كلمة المرور غير صحيحة.');
  return String(user.id);
}

export async function startSession(id: string) {
  const db = getDb();
  const jar = await cookies();
  const old = jar.get(cookieName)?.value;
  if (old) db.prepare('DELETE FROM sessions WHERE token=?').run(hash(old));
  const token = randomBytes(32).toString('hex');
  db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token), id, Date.now() + 30 * 86400_000);
  jar.set(cookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 30 * 86400 });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(cookieName)?.value;
  if (token) getDb().prepare('DELETE FROM sessions WHERE token=?').run(hash(token));
  jar.delete(cookieName);
}

let warnedMissingOrigin = false;
export function sameOrigin(request: Request) {
  let expected = process.env.APP_ORIGIN;
  if (!expected) {
    if (process.env.NODE_ENV === 'production') {
      // Behind a proxy request.url is the internal address, so guessing would silently reject every request.
      if (!warnedMissingOrigin) console.error('APP_ORIGIN is not set; rejecting all state-changing requests.');
      warnedMissingOrigin = true;
      return false;
    }
    expected = new URL(request.url).origin;
  }
  return request.headers.get('origin') === expected;
}

export async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('الطلب غير صالح.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 150_000) { await reader.cancel(); throw new Error('حجم الطلب أكبر من المسموح.'); }
    chunks.push(value);
  }
  let body: unknown;
  try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('الطلب غير صالح.'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('الطلب غير صالح.');
  return body as Record<string, unknown>;
}
