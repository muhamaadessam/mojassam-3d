import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { anyColor, anyDesign } from '@/lib/catalog';
import { getPricing } from '@/lib/settings';
import { ACCOUNT_COPY, ORDER_STATUS } from '@/lib/copy';
import { LANGUAGE_COOKIE, type LanguageKey } from '@/lib/language-config';
import { listOrders } from '@/lib/orders';
import OrdersHeader from '@/components/account/orders-header';

export const metadata: Metadata = { title: 'طلباتي', robots: { index: false, follow: false } };

export default async function OrdersPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/orders');
  const language: LanguageKey = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'en' ? 'en' : 'ar';
  const text = ACCOUNT_COPY[language];
  const orders = listOrders(user.id);
  const pricing = getPricing();
  const locale = language === 'ar' ? 'ar-EG' : 'en-GB';
  const currency = language === 'ar' ? 'ج.م' : 'EGP';

  return (
    <main className="app-shell orders-shell">
      <OrdersHeader language={language} />
      <div className="orders-page">
        <header className="orders-page-header">
          <div>
            <h1>{text.ordersTitle}</h1>
            <p>{text.ordersIntro}</p>
          </div>
          {orders.length > 0 && <span className="orders-count">{text.ordersCount(orders.length)}</span>}
        </header>
        <section className="orders-list" aria-label={text.ordersTitle}>
        {orders.length ? orders.map((order) => {
          const design = anyDesign(pricing, order.design_id);
          const color = anyColor(pricing, order.color);
          const name = design ? (language === 'ar' ? design.nameAr : design.nameEn) : order.design_name;
          // Older orders stored the color name itself rather than its id.
          const colorName = color ? (language === 'ar' ? color.ar : color.en) : order.color || text.defaultColor;
          return (
            <article className="order-card" key={order.id}>
              <div><span className={`order-status status-${order.status}`}>{ORDER_STATUS[language][order.status] ?? order.status}</span><h2>{name}{order.quantity > 1 ? ` × ${order.quantity}` : ''}</h2><p>{order.material} · {colorName} · {text.infill} {order.infill}%</p>{order.admin_note && <p className="order-admin-note"><b>{text.shopNote}:</b> {order.admin_note}</p>}</div>
              <div className="order-metrics">{order.final_price != null ? <><strong>{`${Number(order.final_price).toFixed(2)} ${currency}`}</strong><small>{text.finalPrice}</small></> : <><strong>{order.estimated_price ? `${Number(order.estimated_price).toFixed(2)} ${currency}` : '—'}</strong><small>{text.estimatedPrice}</small></>}<span>{order.estimated_hours ? `${Number(order.estimated_hours).toFixed(2)} ${language === 'ar' ? 'ساعة' : 'h'}` : '—'}</span><small>{new Date(order.created_at).toLocaleDateString(locale)}</small></div>
            </article>
          );
        }) : <div className="empty-orders"><p>{text.noOrders}</p><Link className="primary-button compact" href="/#store">{text.browseDesigns}</Link></div>}
        </section>
      </div>
    </main>
  );
}
