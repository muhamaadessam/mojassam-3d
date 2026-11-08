import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { getDb } from './auth';
import { MAX_DESIGN_IMAGES, MAX_FILE_SIZE, MAX_IMAGE_BYTES, MAX_ORDER_IMAGES } from './catalog';

export { MAX_DESIGN_IMAGES, MAX_IMAGE_BYTES };
/** Largest multipart body accepted for an order: the model, its photos, and the form fields. */
export const MAX_ORDER_BODY = MAX_FILE_SIZE + MAX_ORDER_IMAGES * MAX_IMAGE_BYTES + 1024 * 1024;

/** `preview` is a picture of the model drawn in the customer's browser; `image` is a reference photo. */
export type OrderFile = { id: string; kind: 'model' | 'image' | 'preview'; name: string; size: number };

export class UploadError extends Error {}

const root = () => resolve(process.env.DATA_DIRECTORY || '.data', 'uploads');
const orderDir = (orderId: string) => resolve(root(), 'orders', orderId);
const designDir = () => resolve(root(), 'designs');
const MODEL_EXTENSIONS = ['stl', 'obj', '3mf'] as const;
const DESIGN_IMAGE_NAME = /^[0-9a-f-]{36}\.webp$/;
const UUID = /^[0-9a-f-]{36}$/;

function isWebp(bytes: Uint8Array) {
  const text = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  return bytes.length > 12 && text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
}

async function readImage(file: File) {
  if (file.size === 0 || file.size > MAX_IMAGE_BYTES) throw new UploadError('حجم الصورة غير مسموح.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebp(bytes)) throw new UploadError('الصور لازم تكون WebP.');
  return bytes;
}

const cleanName = (name: string) => name.replace(/[\\/\0-\x1f]/g, '_').trim().slice(0, 160) || 'file';

/** Checks the customer's attachments before an order is created, so a bad file never leaves a half-saved order. */
export async function prepareOrderFiles(model: File | null, images: File[], preview: File | null = null) {
  if (images.length > MAX_ORDER_IMAGES) throw new UploadError(`الحد الأقصى ${MAX_ORDER_IMAGES} صور.`);
  let modelFile: { name: string; ext: string; bytes: Uint8Array } | null = null;
  if (model) {
    const ext = model.name.split('.').pop()?.toLowerCase() ?? '';
    if (!MODEL_EXTENSIONS.includes(ext as (typeof MODEL_EXTENSIONS)[number])) throw new UploadError('نوع الملف غير مدعوم.');
    if (model.size === 0 || model.size > MAX_FILE_SIZE) throw new UploadError('حجم الملف أكبر من 50MB.');
    modelFile = { name: cleanName(model.name), ext, bytes: new Uint8Array(await model.arrayBuffer()) };
  }
  const imageFiles = await Promise.all(images.map(async (image) => ({ name: cleanName(image.name), bytes: await readImage(image) })));
  const previewBytes = preview && modelFile ? await readImage(preview) : null;
  return { model: modelFile, images: imageFiles, preview: previewBytes };
}
export type PreparedOrderFiles = Awaited<ReturnType<typeof prepareOrderFiles>>;

export async function saveOrderFiles(orderId: string, files: PreparedOrderFiles) {
  const entries = [
    ...(files.model ? [{ kind: 'model', name: files.model.name, ext: files.model.ext, bytes: files.model.bytes }] : []),
    ...files.images.map((image) => ({ kind: 'image', name: image.name, ext: 'webp', bytes: image.bytes })),
    ...(files.preview ? [{ kind: 'preview', name: 'preview.webp', ext: 'webp', bytes: files.preview }] : []),
  ];
  if (!entries.length) return;
  const dir = orderDir(orderId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const db = getDb();
  const insert = db.prepare('INSERT INTO order_files(id,order_id,kind,name,stored,size,created_at) VALUES(?,?,?,?,?,?,?)');
  const now = new Date().toISOString();
  for (const entry of entries) {
    const id = randomUUID();
    const stored = `${id}.${entry.ext}`;
    await writeFile(resolve(dir, stored), entry.bytes, { mode: 0o600 });
    insert.run(id, orderId, entry.kind, entry.name, stored, entry.bytes.byteLength, now);
  }
}

export async function deleteOrderFiles(orderId: string) {
  if (UUID.test(orderId)) await rm(orderDir(orderId), { recursive: true, force: true });
}

/** Files of the given orders, grouped by order id. */
export function filesByOrder(orderIds: string[]) {
  const grouped = new Map<string, OrderFile[]>();
  if (!orderIds.length) return grouped;
  const rows = getDb().prepare(`SELECT id, order_id, kind, name, size FROM order_files WHERE order_id IN (${orderIds.map(() => '?').join(',')}) ORDER BY kind DESC, created_at`).all(...orderIds) as unknown as (OrderFile & { order_id: string })[];
  for (const { order_id: orderId, ...file } of rows) grouped.set(orderId, [...(grouped.get(orderId) ?? []), { ...file }]);
  return grouped;
}

function streamFile(path: string, size: number, headers: Record<string, string>) {
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: { 'Content-Length': String(size), 'X-Content-Type-Options': 'nosniff', ...headers },
  });
}

/** Serves one order attachment to its owner or an admin. Returns null when it does not exist or is not theirs. */
export async function orderFileResponse(orderId: string, fileId: string, viewer: { id: string; is_admin: boolean }) {
  const row = getDb().prepare('SELECT f.kind, f.name, f.stored, o.user_id FROM order_files f JOIN orders o ON o.id=f.order_id WHERE f.id=? AND f.order_id=?').get(fileId, orderId) as { kind: string; name: string; stored: string; user_id: string } | undefined;
  if (!row || (!viewer.is_admin && row.user_id !== viewer.id)) return null;
  const path = resolve(orderDir(orderId), row.stored);
  const info = await stat(path).catch(() => null);
  if (!info) return null;
  const image = row.kind !== 'model';
  return streamFile(path, info.size, {
    'Content-Type': image ? 'image/webp' : 'application/octet-stream',
    'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(row.name)}`,
    'Cache-Control': 'private, max-age=86400',
  });
}

/** Stores product photos uploaded from the dashboard and returns their public URLs. */
export async function saveDesignImages(images: File[]) {
  if (!images.length || images.length > MAX_DESIGN_IMAGES) throw new UploadError(`ارفع من 1 لـ ${MAX_DESIGN_IMAGES} صور.`);
  const prepared = await Promise.all(images.map(readImage));
  await mkdir(designDir(), { recursive: true, mode: 0o700 });
  return Promise.all(prepared.map(async (bytes) => {
    const name = `${randomUUID()}.webp`;
    await writeFile(resolve(designDir(), name), bytes, { mode: 0o600 });
    return `/api/files/designs/${name}`;
  }));
}

export async function designImageResponse(name: string) {
  if (!DESIGN_IMAGE_NAME.test(name)) return null;
  const path = resolve(designDir(), name);
  const info = await stat(path).catch(() => null);
  if (!info) return null;
  // Every upload gets a new name, so the file behind a URL never changes.
  return streamFile(path, info.size, { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' });
}

/** Reads a multipart body without accepting more than `limit` bytes when the size is declared up front. */
export async function readForm(request: Request, limit: number) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > limit) throw new UploadError('حجم الملفات أكبر من المسموح.');
  try {
    return await request.formData();
  } catch {
    throw new UploadError('تعذر قراءة الملفات المرفوعة.');
  }
}
