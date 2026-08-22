import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ORDER_FIELDS = 'id, design_id, design_name, status, material, color, infill, estimated_hours, estimated_price, created_at';

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { data, error } = await supabase
      .from('orders')
      .select(ORDER_FIELDS)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: 'Could not load orders' }, { status: 500 });
    return NextResponse.json({ orders: data });
  } catch {
    return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const body = await request.json();
    const order = {
      user_id: user.id,
      design_id: typeof body.designId === 'string' ? body.designId.slice(0, 100) : null,
      design_name: typeof body.designName === 'string' ? body.designName.slice(0, 160) : 'Custom design',
      material: typeof body.material === 'string' ? body.material.slice(0, 40) : 'PLA',
      color: typeof body.color === 'string' ? body.color.slice(0, 40) : null,
      infill: Math.min(100, Math.max(0, Number(body.infill) || 0)),
      estimated_hours: Number.isFinite(Number(body.estimatedHours)) ? Number(body.estimatedHours) : null,
      estimated_price: Number.isFinite(Number(body.estimatedPrice)) ? Number(body.estimatedPrice) : null,
    };

    const { data, error } = await supabase.from('orders').insert(order).select(ORDER_FIELDS).single();
    if (error) return NextResponse.json({ error: 'Could not create order' }, { status: 500 });
    return NextResponse.json({ order: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Invalid request or missing Supabase configuration' }, { status: 400 });
  }
}
