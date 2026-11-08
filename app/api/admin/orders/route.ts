import { NextResponse } from 'next/server';
import { getAdmin, readBody, sameOrigin } from '@/lib/auth';
import { deleteOrder, listAllOrders, OrderError, updateOrder } from '@/lib/orders';

export const runtime = 'nodejs';

const noStore = { 'Cache-Control': 'no-store' };

export async function GET() {
  if (!(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  return NextResponse.json({ orders: listAllOrders() }, { headers: noStore });
}

export async function POST(request: Request) {
  if (!sameOrigin(request) || !(await getAdmin())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const body = await readBody(request);
    if (body.action === 'delete') {
      await deleteOrder(body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ order: updateOrder(body) });
  } catch (error) {
    const message = error instanceof OrderError ? error.message : 'تعذر تحديث الطلب.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
