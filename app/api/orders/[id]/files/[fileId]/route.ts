import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { orderFileResponse } from '@/lib/uploads';

export const runtime = 'nodejs';

/** An order attachment, for the customer who placed the order or an admin. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { id, fileId } = await params;
  return (await orderFileResponse(id, fileId, user)) ?? NextResponse.json({ error: 'Not found' }, { status: 404 });
}
