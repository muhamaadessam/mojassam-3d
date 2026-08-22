import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  if (!code) return NextResponse.redirect(new URL('/login', url.origin));
  const { error } = await (await createClient()).auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(error ? '/login' : '/account', url.origin));
}
