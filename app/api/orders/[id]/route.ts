import { NextResponse } from 'next/server';
import { getUser, readBody, sameOrigin } from '@/lib/auth';
import { deleteOwnOrder, editOrder, NotFound, OrderError } from '@/lib/orders';

export const runtime = 'nodejs';

type Context = { params: Promise<{ id: string }> };

async function guard(request: Request) {
  if (!sameOrigin(request)) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  const user = await getUser();
  if (!user) return { response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) };
  return { user };
}

function failure(error: unknown) {
  if (error instanceof NotFound) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  // 409: the shop has already started on the order.
  if (error instanceof OrderError) return NextResponse.json({ error: error.message }, { status: 409 });
  return NextResponse.json({ error: 'Invalid order' }, { status: 400 });
}

/** The customer changes color, quantity, phone, or note of their own order while it is still pending. */
export async function PATCH(request: Request, { params }: Context) {
  const { user, response } = await guard(request);
  if (!user) return response;
  try {
    return NextResponse.json({ order: editOrder(user.id, (await params).id, await readBody(request)) });
  } catch (error) {
    return failure(error);
  }
}

/** The customer deletes their own order while it is still pending. */
export async function DELETE(request: Request, { params }: Context) {
  const { user, response } = await guard(request);
  if (!user) return response;
  try {
    await deleteOwnOrder(user.id, (await params).id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
