import { NextResponse } from 'next/server';
import { getUser, readBody, sameOrigin } from '@/lib/auth';
import { createOrder, listOrders, OrderError } from '@/lib/orders';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.json({ orders: listOrders(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    return NextResponse.json({ order: createOrder(user.id, await readBody(request)) }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  }
}
