import { NextResponse } from 'next/server';
import { getUser, readBody, sameOrigin } from '@/lib/auth';
import { createOrder, listOrders, OrderError } from '@/lib/orders';
import { MAX_ORDER_BODY, prepareOrderFiles, readForm, UploadError } from '@/lib/uploads';
import { MAX_ORDER_ITEMS } from '@/lib/catalog';

export const runtime = 'nodejs';

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.json({ orders: listOrders(user.id) }, { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Ready designs post JSON. Uploaded models post multipart: an `order` JSON field listing its designs in `items`,
 * then for design i its part files as `model-i` and an optional picture of it as `preview-i`, and optional
 * reference photos for the whole order as `images`. The older single-design shape (`model`, `preview`) still works.
 */
async function readOrder(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) return { body: await readBody(request), files: undefined };
  const form = await readForm(request, MAX_ORDER_BODY);
  let body: unknown;
  try { body = JSON.parse(String(form.get('order') ?? '')); } catch { throw new Error('Invalid order'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('Invalid order');
  const order = body as Record<string, unknown>;
  const fileList = (name: string) => form.getAll(name).filter((item): item is File => item instanceof File);
  const count = Array.isArray(order.items) ? Math.min(order.items.length, MAX_ORDER_ITEMS + 1) : 1;
  const items = Array.from({ length: count }, (_, index) => {
    const legacy = !Array.isArray(order.items);
    return { models: fileList(legacy ? 'model' : `model-${index}`), preview: fileList(legacy ? 'preview' : `preview-${index}`)[0] ?? null };
  });
  return { body: order, files: await prepareOrderFiles(items, fileList('images')) };
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
