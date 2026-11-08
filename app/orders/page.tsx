import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { anyColor, anyDesign, publicCatalog } from '@/lib/catalog';
import { getPricing } from '@/lib/settings';
import { ACCOUNT_COPY, ORDER_STATUS } from '@/lib/copy';
import { LANGUAGE_COOKIE, type LanguageKey } from '@/lib/language-config';
import { EDITABLE_STATUS, itemUnitCost, listOrders } from '@/lib/orders';
import { formatDate, formatNumber } from '@/lib/model-file';
import OrdersHeader from '@/components/account/orders-header';
import OrderThumb from '@/components/order-thumb';
import OrderActions from '@/components/account/order-actions';

export const metadata: Metadata = { title: 'طلباتي', robots: { index: false, follow: false } };

export default async function OrdersPage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/orders');
  const language: LanguageKey = (await cookies()).get(LANGUAGE_COOKIE)?.value === 'en' ? 'en' : 'ar';
  const text = ACCOUNT_COPY[language];
  const orders = listOrders(user.id);
  const pricing = getPricing();
  const currency = language === 'ar' ? 'ج.م' : 'EGP';
  const { colors } = publicCatalog(pricing);

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
          const fileUrl = (id: string) => `/api/orders/${order.id}/files/${id}`;
          const items = order.items.map((item) => {
            const design = anyDesign(pricing, item.design_id);
            const color = anyColor(pricing, item.color);
            return {
              item,
              design,
              color,
              name: design ? (language === 'ar' ? design.nameAr : design.nameEn) : item.name,
              // Older orders stored the color name itself rather than its id.
              colorName: color ? (language === 'ar' ? color.ar : color.en) : item.color || text.defaultColor,
              models: item.files.filter((file) => file.kind === 'model'),
            };
          });
          const [first] = items;
          const single = items.length === 1;
          const title = single ? `${first.name}${first.item.quantity > 1 ? ` × ${first.item.quantity}` : ''}` : text.designsCount(items.length);
          const specs = (entry: (typeof items)[number]) => `${entry.item.material} · ${entry.colorName} · ${text.infill} ${entry.item.infill}%${entry.models.length > 1 ? ` · ${text.partsCount(entry.models.length)}` : ''}`;
          const modelChips = (entry: (typeof items)[number]) => entry.models.length > 0 && <div className="order-file-photos">{entry.models.map((file) => <a key={file.id} className="order-file-chip" href={fileUrl(file.id)} download={file.name} dir="ltr">{file.name}</a>)}</div>;
          return (
            <article className="order-card" key={order.id}>
              {first && <OrderThumb orderId={order.id} files={first.item.files} color={first.color?.hex} image={first.design?.images[0]} label={first.name} linked />}
              <div className="order-card-info">
                <span className={`order-status status-${order.status}`}>{ORDER_STATUS[language][order.status] ?? order.status}</span>
                <h2>{title}</h2>
                {single && <><p>{specs(first)}</p>{modelChips(first)}</>}
                {!single && (
                  <ul className="order-items">
                    {items.map((entry) => (
                      <li key={entry.item.id}>
                        <OrderThumb orderId={order.id} files={entry.item.files} color={entry.color?.hex} image={entry.design?.images[0]} label={entry.name} linked small />
                        <div><strong dir="auto">{entry.name}{entry.item.quantity > 1 ? ` × ${entry.item.quantity}` : ''}</strong><p>{specs(entry)}</p>{modelChips(entry)}</div>
                      </li>
                    ))}
                  </ul>
                )}
                {order.admin_note && <p className="order-admin-note"><b>{text.shopNote}:</b> {order.admin_note}</p>}
                {order.files.length > 0 && <div className="order-file-photos">{order.files.map((file) => <a key={file.id} href={fileUrl(file.id)} target="_blank" rel="noreferrer"><img src={fileUrl(file.id)} alt="" loading="lazy" /></a>)}</div>}
                {order.status === EDITABLE_STATUS && (
                  <OrderActions
                    language={language}
                    colors={colors}
                    order={{ id: order.id, name: single ? first.name : text.designsCount(items.length), phone: order.phone, note: order.customer_note }}
                    items={items.map((entry) => ({ id: entry.item.id, name: entry.name, color: entry.item.color, quantity: entry.item.quantity, unitPrice: itemUnitCost(entry.item, order, pricing).unitPrice }))}
                    fees={{ setupFee: pricing.setupFee, minimum: pricing.minimumPrice }}
                  />
                )}
              </div>
              <div className="order-metrics">{order.final_price != null ? <><strong>{`${formatNumber(order.final_price, 2)} ${currency}`}</strong><small>{text.finalPrice}</small></> : <><strong>{order.estimated_price ? `${formatNumber(order.estimated_price, 2)} ${currency}` : '—'}</strong><small>{text.estimatedPrice}</small></>}<span>{order.estimated_hours ? `${formatNumber(order.estimated_hours, 2)} ${language === 'ar' ? 'ساعة' : 'h'}` : '—'}</span><small><bdi>{formatDate(order.created_at, language)}</bdi></small></div>
            </article>
          );
        }) : <div className="empty-orders"><p>{text.noOrders}</p><Link className="primary-button compact" href="/#store">{text.browseDesigns}</Link></div>}
        </section>
      </div>
    </main>
  );
}
