import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import SignOutButton from './sign-out-button';
import ProfileForm from './profile-form';

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const metadata = user.user_metadata as Record<string, string | undefined>;
  const firstName = metadata.first_name || '';
  const lastName = metadata.last_name || '';
  const displayName = metadata.full_name || [firstName, lastName].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Account';
  const avatarUrl = metadata.avatar_url || metadata.picture || '';

  const { data: orders } = await supabase
    .from('orders')
    .select('id, design_name, status, material, color, infill, estimated_hours, estimated_price, created_at')
    .order('created_at', { ascending: false });

  return (
    <main className="account-page">
      <header className="account-header">
        <div className="account-heading"><a className="auth-back" href="/">← العودة للموقع</a><div className="account-title-row">{avatarUrl ? <img className="account-page-avatar" src={avatarUrl} alt="" referrerPolicy="no-referrer" /> : <span className="account-page-avatar account-avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}<div><p className="eyebrow accent">MY ACCOUNT</p><h1>{displayName}</h1><p>{user.email}</p></div></div></div>
        <SignOutButton />
      </header>
      <ProfileForm firstName={firstName} lastName={lastName} avatarUrl={avatarUrl} />
      <section className="orders-list" id="orders">
        {orders?.length ? orders.map((order) => (
          <article className="order-card" key={order.id}>
            <div><span className="order-status">{order.status}</span><h2>{order.design_name}</h2><p>{order.material} · {order.color || 'default'} · infill {order.infill}%</p></div>
            <div className="order-metrics"><strong>{order.estimated_price ? `${Number(order.estimated_price).toFixed(2)} EGP` : '—'}</strong><span>{order.estimated_hours ? `${Number(order.estimated_hours).toFixed(2)} h` : '—'}</span><small>{new Date(order.created_at).toLocaleDateString('en-GB')}</small></div>
          </article>
        )) : <div className="empty-orders">لا توجد طلبات حتى الآن. ابدأ من التصميمات الجاهزة.</div>}
      </section>
    </main>
  );
}
