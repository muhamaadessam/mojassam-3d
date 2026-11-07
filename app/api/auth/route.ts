import { NextResponse } from 'next/server';
import { authenticate, clearAttempts, clientIp, endSession, getDb, getUser, limitAttempts, RateLimitError, readBody, register, sameOrigin, startSession } from '@/lib/auth';

export const runtime = 'nodejs';

// Attempts allowed per 15 minutes.
const LIMIT_PER_IP = 30; // one visitor trying many accounts
const LIMIT_PER_IP_AND_EMAIL = 10; // one visitor guessing one password
const LIMIT_PER_EMAIL = 100; // many visitors guessing one password; high so a single attacker cannot lock a customer out

const validName = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 80;

export async function GET() {
  return NextResponse.json({ user: await getUser() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await readBody(request);
    if (body.action === 'logout') {
      await endSession();
      return NextResponse.json({ ok: true });
    }
    if (body.action === 'profile') {
      const user = await getUser();
      if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
      const { first_name: first, last_name: last, avatar_url: avatar } = body;
      if (!validName(first) || !validName(last) || typeof avatar !== 'string' || (avatar !== '' && !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(avatar))) throw new Error('بيانات الحساب غير صالحة.');
      getDb().prepare('UPDATE users SET first_name=?, last_name=?, avatar_url=? WHERE id=?').run(first.trim(), last.trim(), avatar, user.id);
      return NextResponse.json({ user: await getUser() });
    }
    if (body.action !== 'login' && body.action !== 'signup') throw new Error('الطلب غير صالح.');
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = body.password;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof password !== 'string' || password.length < 8 || password.length > 128) throw new Error('أدخل بريدًا صحيحًا وكلمة مرور من 8 إلى 128 حرفًا.');

    const ip = clientIp(request);
    const pairKey = `pair:${ip}:${email}`;
    limitAttempts(`ip:${ip}`, LIMIT_PER_IP);
    limitAttempts(pairKey, LIMIT_PER_IP_AND_EMAIL);
    limitAttempts(`email:${email}`, LIMIT_PER_EMAIL);

    let id: string;
    if (body.action === 'signup') {
      if (!validName(body.firstName) || !validName(body.lastName)) throw new Error('أدخل الاسم الأول واسم العائلة.');
      id = await register(email, password, body.firstName.trim(), body.lastName.trim());
    } else {
      id = await authenticate(email, password);
    }
    clearAttempts(pairKey);
    await startSession(id);
    return NextResponse.json({ user: await getUser() });
  } catch (error) {
    console.error('Authentication request failed:', error instanceof Error ? error.name : 'Unknown error');
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message }, { status: 429 });
    const message = error instanceof Error && /[؀-ۿ]/.test(error.message) ? error.message : 'تعذر تنفيذ الطلب الآن.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
