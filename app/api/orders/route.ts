import { NextResponse } from 'next/server';
import { getUser, readBody, sameOrigin } from '@/lib/auth';
import { createOrder, listOrders, OrderError } from '@/lib/orders';
import { MAX_ORDER_BODY, prepareOrderFiles, readForm, UploadError } from '@/lib/uploads';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.json({ orders: listOrders(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

/** Ready designs post JSON. Uploaded models post multipart: an `order` JSON field, the `model` file, and optional `images`. */
async function readOrder(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return { body: await readBody(request), files: undefined };
  const form = await readForm(request, MAX_ORDER_BODY);
  let body: unknown;
  try { body = JSON.parse(String(form.get('order') ?? '')); } catch { throw new Error('Invalid order'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid order');
  const model = form.get('model');
  const images = form.getAll('images').filter((item): item is File => item instanceof File);
  return { body: body as Record<string, unknown>, files: await prepareOrderFiles(model instanceof File ? model : null, images) };
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const { body, files } = await readOrder(request);
    return NextResponse.json({ order: await createOrder(user.id, body, files) }, { status: 201 });
  } catch (error) {
    if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof UploadError) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
  }
}
