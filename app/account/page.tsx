import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { findColor, findDesign } from '@/lib/catalog';
import { ACCOUNT_COPY, ORDER_STATUS } from '@/lib/copy';
import { LANGUAGE_COOKIE, type LanguageKey } from '@/lib/language-config';
import { listOrders } from '@/lib/orders';
import DocumentLanguage from './document-language';
import SignOutButton from './sign-out-button';
import ProfileForm from './profile-form';

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect('/login');
  const language: LanguageKey = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'en' ? 'en' : 'ar';
  const text = ACCOUNT_COPY[language];
  const displayName = `${user.first_name} ${user.last_name}`.trim() || user.email.split('@')[0];
  const orders = listOrders(user.id);
  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';
  const currency = language === 'ar' ? 'ج.م' : 'EGP';

  return (
    <main className="account-page">
      <DocumentLanguage language={language} />
      <header className="account-header">
        <div className="account-heading"><Link className="auth-back" href="/">{text.back}</Link><div className="account-title-row">{user.avatar_url ? <img className="account-page-avatar" src={user.avatar_url} alt="" /> : <span className="account-page-avatar account-avatar-fallback">{displayName.slice(0, 1).toUpperCase()}</span>}<div><p className="eyebrow accent">MY ACCOUNT</p><h1>{displayName}</h1><p>{user.email}</p></div></div></div>
        <SignOutButton label={text.signOut} />
      </header>
      <ProfileForm language={language} firstName={user.first_name} lastName={user.last_name} avatarUrl={user.avatar_url} />
      <section className="orders-list" id="orders">
        {orders.length ? orders.map((order) => {
          const design = findDesign(order.design_id);
          const color = findColor(order.color);
          const name = design ? (language === 'ar' ? design.nameAr : design.nameEn) : order.design_name;
          // Older orders stored the color name itself rather than its id.
          const colorName = color ? (language === 'ar' ? color.ar : color.en) : order.color || text.defaultColor;
          return (
            <article className="order-card" key={order.id}>
              <div><span className="order-status">{ORDER_STATUS[language][order.status] ?? order.status}</span><h2>{name}</h2><p>{order.material} · {colorName} · {text.infill} {order.infill}%</p></div>
              <div className="order-metrics"><strong>{order.estimated_price ? `${Number(order.estimated_price).toFixed(2)} ${currency}` : '—'}</strong><span>{order.estimated_hours ? `${Number(order.estimated_hours).toFixed(2)} ${language === 'ar' ? 'ساعة' : 'h'}` : '—'}</span><small>{new Date(order.created_at).toLocaleDateString(locale)}</small></div>
            </article>
          );
        }) : <div className="empty-orders">{text.noOrders}</div>}
      </section>
    </main>
  );
}
