import { NextResponse } from 'next/server';
import { designImageResponse } from '@/lib/uploads';

export const runtime = 'nodejs';

/** Public product photos uploaded from the dashboard. */
export async function GET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  return (await designImageResponse((await params).name)) ?? NextResponse.json({ error: 'Not found' }, { status: 404 });
}
