import { NextResponse } from 'next/server';
import { getAdmin, readBody, sameOrigin } from '@/lib/auth';
import { getPricing, isSettingsError, savePricing } from '@/lib/settings';

export const runtime = 'nodejs';

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ pricing: getPricing() }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    return NextResponse.json({ pricing: savePricing(await readBody(request)) });
  } catch (error) {
    const message = isSettingsError(error) ? error.message : 'تعذر حفظ الإعدادات.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
