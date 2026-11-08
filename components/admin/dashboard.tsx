'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import LogoMark from '@/components/logo-mark';
import { toWebp } from '@/lib/image-webp';
import { formatBytes, formatDate, formatNumber } from '@/lib/model-file';
import { estimateCustomPrint, getReadyPrice, MAX_DESIGN_IMAGES, orderTotal, type Material, type Pricing, type PrintColor, type ReadyDesign } from '@/lib/catalog';
import { ORDER_STATUS } from '@/lib/copy';
import type { AdminOrderRow } from '@/lib/orders';

const STATUSES = ['pending', 'confirmed', 'printing', 'ready', 'completed', 'cancelled'] as const;
const STATUS_AR = ORDER_STATUS.ar;
type Tab = 'orders' | 'pricing' | 'catalog';

const money = (value: number | null | undefined) => (value == null ? '—' : `${formatNumber(value, 2)} ج.م`);
const date = (iso: string) => formatDate(iso, 'ar', true);
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;
/** Customer-facing amount: the confirmed price if set, otherwise the estimate. */
const amount = (order: AdminOrderRow) => order.final_price ?? order.estimated_price ?? 0;

async function post(url: string, body: unknown) {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'تعذر تنفيذ الطلب.');
  return result;
}

export default function AdminDashboard({ initialOrders, initialPricing, adminEmail }: { initialOrders: AdminOrderRow[]; initialPricing: Pricing; adminEmail: string }) {
  const [tab, setTab] = useState<Tab>('orders');
  const [orders, setOrders] = useState(initialOrders);
  const [saved, setSaved] = useState(initialPricing);
  const [draft, setDraft] = useState(initialPricing);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  const savePricing = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { pricing } = await post('/api/admin/settings', draft);
      setSaved(pricing);
      setDraft(pricing);
      setMessage({ kind: 'ok', text: 'تم حفظ الإعدادات. الأسعار الجديدة ظاهرة للعملاء دلوقتي.' });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'تعذر الحفظ.' });
    } finally {
      setSaving(false);
    }
  };

  const refreshOrders = async () => {
    const response = await fetch('/api/admin/orders', { cache: 'no-store' });
    if (response.ok) setOrders((await response.json()).orders);
  };

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <Link className="brand-lockup" href="/" aria-label="Mojassam 3D">
          <span className="brand-mark" aria-hidden="true"><LogoMark size={26} /></span>
          <span className="brand-text"><span className="eyebrow" lang="en">ADMIN</span><span className="brand-name">لوحة التحكم</span></span>
        </Link>
        <nav className="admin-tabs" role="tablist">
          {([['orders', 'الطلبات'], ['pricing', 'الأسعار والوقت'], ['catalog', 'الألوان والتصميمات']] as const).map(([key, label]) => (
            <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
              {label}{key === 'orders' && orders.some((order) => order.status === 'pending') ? <i className="admin-dot" aria-label="طلبات جديدة" /> : null}
            </button>
          ))}
        </nav>
        <div className="admin-user"><span dir="ltr">{adminEmail}</span><Link className="ghost-button" href="/">الموقع</Link></div>
      </header>

      {tab === 'orders' && <OrdersPanel orders={orders} pricing={saved} onChange={setOrders} onRefresh={refreshOrders} />}
      {tab === 'pricing' && <PricingPanel draft={draft} setDraft={setDraft} />}
      {tab === 'catalog' && <CatalogPanel draft={draft} setDraft={setDraft} />}

      {tab !== 'orders' && (
        <div className={`admin-savebar ${dirty ? 'dirty' : ''}`}>
          <span>{message ? <span className={message.kind === 'error' ? 'admin-error' : 'admin-ok'}>{message.text}</span> : dirty ? 'فيه تغييرات لم تُحفظ.' : 'كل التغييرات محفوظة.'}</span>
          <div>
            <button className="ghost-button" disabled={!dirty || saving} onClick={() => { setDraft(saved); setMessage(null); }}>تراجع</button>
            <button className="primary-button compact" disabled={!dirty || saving} onClick={savePricing}>{saving ? 'جارٍ الحفظ…' : 'حفظ التغييرات'}</button>
          </div>
        </div>
      )}
    </main>
  );
}

// ---------------- Orders ----------------

function OrdersPanel({ orders, pricing, onChange, onRefresh }: { orders: AdminOrderRow[]; pricing: Pricing; onChange: (orders: AdminOrderRow[]) => void; onRefresh: () => Promise<void> }) {
  const [filter, setFilter] = useState<string>('active');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const stats = useMemo(() => {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const delivered = orders.filter((order) => order.status === 'completed');
    const open = orders.filter((order) => !['completed', 'cancelled'].includes(order.status));
    return {
      pending: orders.filter((order) => order.status === 'pending').length,
      inProgress: orders.filter((order) => ['confirmed', 'printing'].includes(order.status)).length,
      ready: orders.filter((order) => order.status === 'ready').length,
      revenue: delivered.reduce((sum, order) => sum + amount(order), 0),
      pipeline: open.reduce((sum, order) => sum + amount(order), 0),
      month: orders.filter((order) => order.created_at >= monthStart).length,
      hours: open.reduce((sum, order) => sum + (order.estimated_hours ?? 0), 0),
    };
  }, [orders]);

  const visible = orders.filter((order) => {
    if (filter === 'active' && ['completed', 'cancelled'].includes(order.status)) return false;
    if (filter !== 'active' && filter !== 'all' && order.status !== filter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [order.design_name, order.email, order.first_name, order.last_name, order.phone, order.id].some((value) => value?.toLowerCase().includes(q));
  });

  const exportCsv = () => {
    const header = ['id', 'created_at', 'status', 'customer', 'email', 'phone', 'design', 'quantity', 'material', 'color', 'infill', 'hours', 'estimated_price', 'final_price', 'customer_note', 'admin_note'];
    const rows = visible.map((order) => [order.id, order.created_at, STATUS_AR[order.status] ?? order.status, `${order.first_name} ${order.last_name}`, order.email, order.phone, order.design_name, order.quantity, order.material, order.color, order.infill, order.estimated_hours, order.estimated_price, order.final_price, order.customer_note, order.admin_note]);
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = `mojassam-orders-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const count = (status: string) => orders.filter((order) => order.status === status).length;

  return (
    <section className="admin-panel">
      <div className="admin-stats">
        <Stat label="طلبات جديدة" value={String(stats.pending)} accent={stats.pending > 0} />
        <Stat label="قيد التنفيذ" value={String(stats.inProgress)} hint={`${formatNumber(stats.hours, 1)} ساعة طباعة مفتوحة`} />
        <Stat label="جاهز للاستلام" value={String(stats.ready)} />
        <Stat label="طلبات الشهر" value={String(stats.month)} />
        <Stat label="قيمة الطلبات المفتوحة" value={money(stats.pipeline)} />
        <Stat label="إيراد الطلبات المُسلّمة" value={money(stats.revenue)} />
      </div>

      <div className="admin-toolbar">
        <div className="admin-chips" role="tablist" aria-label="تصفية حسب الحالة">
          {[['active', 'المفتوحة', orders.length - count('completed') - count('cancelled')], ['all', 'الكل', orders.length], ...STATUSES.map((status) => [status, STATUS_AR[status], count(status)] as const)].map(([key, label, n]) => (
            <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(String(key))}>{label} <b>{n}</b></button>
          ))}
        </div>
        <div className="admin-toolbar-actions">
          <input type="search" placeholder="بحث بالاسم، البريد، الموبايل، التصميم…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button className="ghost-button" disabled={refreshing} onClick={async () => { setRefreshing(true); await onRefresh().finally(() => setRefreshing(false)); }}>{refreshing ? '…' : 'تحديث'}</button>
          <button className="ghost-button" onClick={exportCsv} disabled={!visible.length}>تصدير CSV</button>
        </div>
      </div>

      <div className="admin-orders">
        {visible.length ? visible.map((order) => (
          <OrderRow
            // Remount when the server copy changes, so the edit form never shows stale values.
            key={`${order.id}-${order.updated_at}`}
            order={order}
            pricing={pricing}
            open={openId === order.id}
            onToggle={() => setOpenId(openId === order.id ? null : order.id)}
            onSaved={(next) => onChange(orders.map((item) => (item.id === next.id ? next : item)))}
            onDeleted={() => onChange(orders.filter((item) => item.id !== order.id))}
          />
        )) : <div className="empty-orders">لا توجد طلبات بهذا الفلتر.</div>}
      </div>
    </section>
  );
}

function Stat({ label, value, hint, accent }: { label: string; value: string; hint?: string; accent?: boolean }) {
  return <div className={`admin-stat ${accent ? 'accent' : ''}`}><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

function OrderRow({ order, pricing, open, onToggle, onSaved, onDeleted }: { order: AdminOrderRow; pricing: Pricing; open: boolean; onToggle: () => void; onSaved: (order: AdminOrderRow) => void; onDeleted: () => void }) {
  const [status, setStatus] = useState(order.status);
  const [finalPrice, setFinalPrice] = useState(order.final_price == null ? '' : String(order.final_price));
  const [note, setNote] = useState(order.admin_note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const color = pricing.colors.find((item) => item.id === order.color);
  const customer = `${order.first_name} ${order.last_name}`.trim() || order.email;
  const phoneDigits = order.phone.replace(/[^\d]/g, '');
  const whatsapp = phoneDigits ? `https://wa.me/${phoneDigits.startsWith('0') ? `2${phoneDigits}` : phoneDigits}` : '';
  const changed = status !== order.status || finalPrice !== (order.final_price == null ? '' : String(order.final_price)) || note !== order.admin_note;

  const save = async (overrides: { status?: string } = {}) => {
    setBusy(true);
    setError('');
    try {
      const { order: next } = await post('/api/admin/orders', { id: order.id, status: overrides.status ?? status, finalPrice: finalPrice === '' ? null : Number(finalPrice), adminNote: note });
      setStatus(next.status);
      onSaved(next);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'تعذر الحفظ.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`حذف طلب "${order.design_name}" نهائيًا؟ لا يمكن التراجع.`)) return;
    setBusy(true);
    try {
      await post('/api/admin/orders', { action: 'delete', id: order.id });
      onDeleted();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'تعذر الحذف.');
      setBusy(false);
    }
  };

  const nextStatus = STATUSES[STATUSES.indexOf(order.status as (typeof STATUSES)[number]) + 1];

  return (
    <article className={`admin-order ${open ? 'open' : ''}`}>
      <button className="admin-order-head" onClick={onToggle} aria-expanded={open}>
        <span className={`order-status status-${order.status}`}>{STATUS_AR[order.status] ?? order.status}</span>
        <span className="admin-order-title"><strong>{order.design_name}{order.quantity > 1 ? ` × ${order.quantity}` : ''}</strong><small><bdi>{customer}</bdi> · <bdi>{date(order.created_at)}</bdi></small></span>
        <span className="admin-order-spec">{color && <i className="admin-swatch" style={{ background: color.hex }} />}{order.material} · {order.infill}%</span>
        <span className="admin-order-price">{order.final_price != null ? money(order.final_price) : <>{money(order.estimated_price)} <small>مبدئي</small></>}</span>
      </button>
      {open && (
        <div className="admin-order-body">
          <dl className="admin-order-facts">
            <div><dt>العميل</dt><dd>{customer}<br /><a href={`mailto:${order.email}`} dir="ltr">{order.email}</a></dd></div>
            <div><dt>الموبايل</dt><dd>{order.phone ? <><a href={`tel:${order.phone}`} dir="ltr">{order.phone}</a>{whatsapp && <> · <a href={whatsapp} target="_blank" rel="noreferrer">واتساب</a></>}</> : '—'}</dd></div>
            <div><dt>المواصفات</dt><dd>{order.material} · {color ? color.ar : order.color} · حشو {order.infill}% · {order.quantity} قطعة</dd></div>
            <div><dt>وقت الطباعة المتوقع</dt><dd>{order.estimated_hours == null ? '—' : `${formatNumber(order.estimated_hours, 2)} ساعة`}</dd></div>
            <div><dt>السعر المبدئي</dt><dd>{money(order.estimated_price)}</dd></div>
            <div><dt>نوع الطلب</dt><dd>{order.design_id ? 'تصميم جاهز' : order.files.some((file) => file.kind === 'model') ? 'ملف مرفوع' : 'ملف مرفوع — طلب قديم بدون ملف، اطلبه من العميل'}</dd></div>
            {order.customer_note && <div className="wide"><dt>ملاحظة العميل</dt><dd>{order.customer_note}</dd></div>}
            {order.files.length > 0 && <div className="wide"><dt>المرفقات</dt><dd><OrderFiles order={order} /></dd></div>}
            {order.updated_at && order.updated_at !== order.created_at && <div><dt>آخر تحديث</dt><dd><bdi>{date(order.updated_at)}</bdi></dd></div>}
          </dl>
          <div className="admin-order-edit">
            <label>الحالة<select value={status} onChange={(event) => setStatus(event.target.value)}>{STATUSES.map((item) => <option key={item} value={item}>{STATUS_AR[item]}</option>)}</select></label>
            <label>السعر النهائي (ج.م)<input type="number" min={0} step="0.5" value={finalPrice} placeholder={String(order.estimated_price ?? '')} onChange={(event) => setFinalPrice(event.target.value)} /></label>
            <label className="wide">رسالة للعميل (تظهر في حسابه)<textarea rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} placeholder="مثال: الطلب جاهز، الاستلام من 12 لـ 6" /></label>
          </div>
          <div className="admin-order-actions">
            <button className="ghost-button danger" onClick={remove} disabled={busy}>حذف</button>
            {error && <span className="admin-error">{error}</span>}
            {nextStatus && order.status !== 'cancelled' && !changed && <button className="ghost-button" disabled={busy} onClick={() => save({ status: nextStatus })}>نقل إلى «{STATUS_AR[nextStatus]}»</button>}
            <button className="primary-button compact" disabled={busy || !changed} onClick={() => save()}>{busy ? 'جارٍ الحفظ…' : 'حفظ'}</button>
          </div>
        </div>
      )}
    </article>
  );
}

/** The customer's model (download) and reference photos (open full size). */
function OrderFiles({ order }: { order: { id: string; files: AdminOrderRow['files'] } }) {
  const href = (fileId: string) => `/api/orders/${order.id}/files/${fileId}`;
  const model = order.files.filter((file) => file.kind === 'model');
  const photos = order.files.filter((file) => file.kind === 'image');
  return (
    <div className="order-files">
      {model.map((file) => <a key={file.id} className="order-file-download" href={href(file.id)} download={file.name}><span dir="ltr">{file.name}</span><small dir="ltr">{formatBytes(file.size)}</small><b>تحميل</b></a>)}
      {photos.length > 0 && <div className="order-file-photos">{photos.map((file) => <a key={file.id} href={href(file.id)} target="_blank" rel="noreferrer"><img src={href(file.id)} alt={file.name} loading="lazy" /></a>)}</div>}
    </div>
  );
}

// ---------------- Pricing & time ----------------

type SetDraft = (update: (pricing: Pricing) => Pricing) => void;
type DraftProps = { draft: Pricing; setDraft: (pricing: Pricing | ((pricing: Pricing) => Pricing)) => void };

function NumberField({ label, value, onChange, step = 1, min = 0, suffix, hint }: { label: string; value: number; onChange: (value: number) => void; step?: number; min?: number; suffix?: string; hint?: string }) {
  return (
    <label className="admin-field">
      <span>{label}</span>
      <span className="admin-input-wrap"><input type="number" step={step} min={min} value={Number.isFinite(value) ? value : ''} onChange={(event) => onChange(event.target.value === '' ? NaN : Number(event.target.value))} />{suffix && <em>{suffix}</em>}</span>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function PricingPanel({ draft, setDraft }: DraftProps) {
  const set: SetDraft = (update) => setDraft(update);
  const updateMaterial = (index: number, patch: Partial<Material>) => set((pricing) => ({ ...pricing, materials: pricing.materials.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const [sample, setSample] = useState({ volumeCm3: 50, size: 80, infill: 20 });
  const firstMaterial = draft.materials.find((material) => material.enabled) ?? draft.materials[0];
  const preview = firstMaterial ? estimateCustomPrint(sample.volumeCm3 * 1000, { x: sample.size, y: sample.size, z: sample.size }, sample.infill, firstMaterial, draft) : null;

  return (
    <section className="admin-panel admin-settings">
      <div className="admin-card">
        <h2>استقبال الطلبات</h2>
        <label className="admin-toggle"><input type="checkbox" checked={draft.acceptingOrders} onChange={(event) => set((pricing) => ({ ...pricing, acceptingOrders: event.target.checked }))} /><span>{draft.acceptingOrders ? 'بنستقبل طلبات جديدة' : 'الطلبات متوقفة — العملاء مش هيقدروا يطلبوا'}</span></label>
        <label className="admin-field wide"><span>رسالة تظهر للعملاء أعلى الصفحة (اختياري)</span><input type="text" maxLength={300} value={draft.notice} placeholder="مثال: إجازة العيد — التسليم بعد يوم 15" onChange={(event) => set((pricing) => ({ ...pricing, notice: event.target.value }))} /></label>
      </div>

      <div className="admin-card">
        <h2>الوقت والتسعير العام</h2>
        <div className="admin-grid">
          <NumberField label="سعر ساعة تشغيل الماكينة" suffix="ج.م / ساعة" value={draft.machineHourlyRate} onChange={(value) => set((pricing) => ({ ...pricing, machineHourlyRate: value }))} />
          <NumberField label="معامل وقت الطباعة" step={0.05} min={0.1} suffix="×" value={draft.timeMultiplier} hint="1 = الوقت المحسوب. 1.3 = الماكينة أبطأ بـ 30%." onChange={(value) => set((pricing) => ({ ...pricing, timeMultiplier: value }))} />
          <NumberField label="رسوم تجهيز ثابتة لكل طلب" suffix="ج.م" value={draft.setupFee} onChange={(value) => set((pricing) => ({ ...pricing, setupFee: value }))} />
          <NumberField label="الحد الأدنى لسعر الطلب" suffix="ج.م" value={draft.minimumPrice} onChange={(value) => set((pricing) => ({ ...pricing, minimumPrice: value }))} />
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-head"><h2>الخامات وسعر الجرام</h2><button className="ghost-button" onClick={() => set((pricing) => ({ ...pricing, materials: [...pricing.materials, { id: newId('mat'), label: 'خامة جديدة', density: 1.2, rate: 6, enabled: false }] }))}>+ إضافة خامة</button></div>
        <div className="admin-table" role="table">
          <div className="admin-table-row head" role="row"><span>الاسم</span><span>سعر الجرام</span><span>الكثافة g/cm³</span><span>مفعّلة</span><span /></div>
          {draft.materials.map((material, index) => (
            <div className="admin-table-row" role="row" key={material.id}>
              <input aria-label="اسم الخامة" value={material.label} onChange={(event) => updateMaterial(index, { label: event.target.value })} />
              <span className="admin-input-wrap"><input aria-label="سعر الجرام" type="number" step={0.25} min={0} value={material.rate} onChange={(event) => updateMaterial(index, { rate: Number(event.target.value) })} /><em>ج.م</em></span>
              <input aria-label="الكثافة" type="number" step={0.01} min={0.5} value={material.density} onChange={(event) => updateMaterial(index, { density: Number(event.target.value) })} />
              <input aria-label="مفعّلة" type="checkbox" checked={material.enabled} onChange={(event) => updateMaterial(index, { enabled: event.target.checked })} />
              <button className="ghost-button danger" aria-label={`حذف ${material.label}`} disabled={draft.designs.some((design) => design.material === material.id)} title={draft.designs.some((design) => design.material === material.id) ? 'مستخدمة في تصميم جاهز' : ''} onClick={() => set((pricing) => ({ ...pricing, materials: pricing.materials.filter((_, i) => i !== index) }))}>حذف</button>
            </div>
          ))}
        </div>
      </div>

      <div className="admin-card">
        <h2>تجربة السعر قبل الحفظ</h2>
        <p className="admin-muted">مجسم بحجم {sample.volumeCm3} سم³ وأكبر بُعد {sample.size} مم، بخامة {firstMaterial?.label}:</p>
        <div className="admin-grid">
          <NumberField label="حجم المجسم" suffix="سم³" value={sample.volumeCm3} onChange={(value) => setSample({ ...sample, volumeCm3: value || 1 })} />
          <NumberField label="أكبر بُعد" suffix="مم" value={sample.size} onChange={(value) => setSample({ ...sample, size: value || 1 })} />
          <NumberField label="نسبة الحشو" suffix="%" step={5} min={10} value={sample.infill} onChange={(value) => setSample({ ...sample, infill: Math.min(100, Math.max(10, value || 10)) })} />
        </div>
        {preview && Number.isFinite(preview.price) && (
          <div className="admin-preview">
            <span>الوزن <b>{formatNumber(preview.weightGrams, 1)} جم</b></span>
            <span>الوقت <b>{formatNumber(preview.hours, 2)} ساعة</b></span>
            <span>الخامة <b>{money(preview.materialCost)}</b></span>
            <span>الماكينة <b>{money(preview.machineCost)}</b></span>
            <span className="total">السعر للعميل <b>{money(orderTotal(draft, preview.price))}</b></span>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------- Colors & ready designs ----------------

function CatalogPanel({ draft, setDraft }: DraftProps) {
  const set: SetDraft = (update) => setDraft(update);
  const updateColor = (index: number, patch: Partial<PrintColor>) => set((pricing) => ({ ...pricing, colors: pricing.colors.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));
  const updateDesign = (index: number, patch: Partial<ReadyDesign>) => set((pricing) => ({ ...pricing, designs: pricing.designs.map((item, i) => (i === index ? { ...item, ...patch } : item)) }));

  return (
    <section className="admin-panel admin-settings">
      <div className="admin-card">
        <div className="admin-card-head"><h2>ألوان الطباعة</h2><button className="ghost-button" onClick={() => set((pricing) => ({ ...pricing, colors: [...pricing.colors, { id: newId('color'), ar: 'لون جديد', en: 'New color', hex: '#888888', enabled: true }] }))}>+ إضافة لون</button></div>
        <div className="admin-colors">
          {draft.colors.map((color, index) => (
            <div className={`admin-color ${color.enabled ? '' : 'disabled'}`} key={color.id}>
              <input type="color" aria-label="اللون" value={color.hex} onChange={(event) => updateColor(index, { hex: event.target.value })} />
              <div>
                <input aria-label="الاسم بالعربي" value={color.ar} onChange={(event) => updateColor(index, { ar: event.target.value })} />
                <input aria-label="الاسم بالإنجليزي" dir="ltr" value={color.en} onChange={(event) => updateColor(index, { en: event.target.value })} />
              </div>
              <label className="admin-mini-toggle"><input type="checkbox" checked={color.enabled} onChange={(event) => updateColor(index, { enabled: event.target.checked })} />متاح</label>
              <button className="ghost-button danger" aria-label={`حذف ${color.ar}`} onClick={() => set((pricing) => ({ ...pricing, colors: pricing.colors.filter((_, i) => i !== index) }))}>×</button>
            </div>
          ))}
        </div>
        <p className="admin-muted">اللون غير المتاح يختفي من الموقع، والطلبات القديمة تفضل محتفظة باسمه. الأفضل إلغاء التفعيل بدل الحذف.</p>
      </div>

      <div className="admin-card">
        <div className="admin-card-head"><h2>التصميمات الجاهزة</h2><button className="ghost-button" onClick={() => set((pricing) => ({ ...pricing, designs: [...pricing.designs, { id: newId('design'), nameAr: 'تصميم جديد', nameEn: 'New design', descriptionAr: '', descriptionEn: '', categoryAr: '', categoryEn: '', material: pricing.materials[0]?.id ?? 'pla', infill: 20, weightGrams: 50, printHours: 2, artClass: 'organizer', images: [], enabled: false }] }))}>+ إضافة تصميم</button></div>
        <div className="admin-designs">
          {draft.designs.map((design, index) => (
            <details className={`admin-design ${design.enabled ? '' : 'disabled'}`} key={design.id}>
              <summary>
                <strong>{design.nameAr}</strong>
                <span>{draft.materials.find((material) => material.id === design.material)?.label} · {design.weightGrams} جم · {design.printHours} ساعة</span>
                <b>{money(orderTotal(draft, getReadyPrice(design, draft)))}</b>
                {!design.enabled && <em>مخفي</em>}
              </summary>
              <div className="admin-grid">
                <label className="admin-field"><span>الاسم بالعربي</span><input value={design.nameAr} onChange={(event) => updateDesign(index, { nameAr: event.target.value })} /></label>
                <label className="admin-field"><span>الاسم بالإنجليزي</span><input dir="ltr" value={design.nameEn} onChange={(event) => updateDesign(index, { nameEn: event.target.value })} /></label>
                <label className="admin-field"><span>التصنيف</span><input value={design.categoryAr} onChange={(event) => updateDesign(index, { categoryAr: event.target.value })} /></label>
                <label className="admin-field"><span>التصنيف بالإنجليزي</span><input dir="ltr" value={design.categoryEn} onChange={(event) => updateDesign(index, { categoryEn: event.target.value })} /></label>
                <label className="admin-field wide"><span>الوصف</span><input value={design.descriptionAr} onChange={(event) => updateDesign(index, { descriptionAr: event.target.value })} /></label>
                <label className="admin-field wide"><span>الوصف بالإنجليزي</span><input dir="ltr" value={design.descriptionEn} onChange={(event) => updateDesign(index, { descriptionEn: event.target.value })} /></label>
                <label className="admin-field"><span>الخامة</span><select value={design.material} onChange={(event) => updateDesign(index, { material: event.target.value })}>{draft.materials.map((material) => <option key={material.id} value={material.id}>{material.label}</option>)}</select></label>
                <NumberField label="الوزن" suffix="جم" step={1} value={design.weightGrams} onChange={(value) => updateDesign(index, { weightGrams: value })} />
                <NumberField label="وقت الطباعة" suffix="ساعة" step={0.25} value={design.printHours} onChange={(value) => updateDesign(index, { printHours: value })} />
                <NumberField label="نسبة الحشو" suffix="%" step={5} min={5} value={design.infill} onChange={(value) => updateDesign(index, { infill: value })} />
                <DesignImages images={design.images} onChange={(images) => updateDesign(index, { images })} />
              </div>
              <div className="admin-design-actions">
                <label className="admin-toggle"><input type="checkbox" checked={design.enabled} onChange={(event) => updateDesign(index, { enabled: event.target.checked })} /><span>{design.enabled ? 'ظاهر في المتجر' : 'مخفي من المتجر'}</span></label>
                <button className="ghost-button danger" onClick={() => set((pricing) => ({ ...pricing, designs: pricing.designs.filter((_, i) => i !== index) }))}>حذف التصميم</button>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Product photos: upload several at once (converted to WebP first), remove, or pick the cover. */
function DesignImages({ images, onChange }: { images: string[]; onChange: (images: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (files: File[]) => {
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      for (const file of files.slice(0, MAX_DESIGN_IMAGES - images.length)) {
        const webp = await toWebp(file);
        form.append('images', webp, webp.name);
      }
      const response = await fetch('/api/admin/uploads', { method: 'POST', body: form });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'تعذر رفع الصور.');
      onChange([...images, ...result.urls]);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'تعذر رفع الصور.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-field wide design-images">
      <span>صور المنتج <small>{images.length}/{MAX_DESIGN_IMAGES} · أول صورة هي الغلاف · بتتحول تلقائيًا لـ WebP مضغوط</small></span>
      <div className="image-picker-grid">
        {images.map((src, index) => (
          <figure key={src} className={index === 0 ? 'cover' : ''}>
            <img src={src} alt="" />
            {index > 0 && <button type="button" className="make-cover" onClick={() => onChange([src, ...images.filter((item) => item !== src)])}>غلاف</button>}
            <button type="button" onClick={() => onChange(images.filter((item) => item !== src))} aria-label="حذف الصورة">×</button>
          </figure>
        ))}
        {images.length < MAX_DESIGN_IMAGES && (
          <label className={`image-picker-add ${busy ? 'busy' : ''}`}>
            <input type="file" accept="image/*" multiple disabled={busy} onChange={(event) => { const files = Array.from(event.target.files ?? []); event.target.value = ''; if (files.length) void upload(files); }} />
            <span>{busy ? 'جارٍ الرفع…' : '+ رفع صور'}</span>
          </label>
        )}
      </div>
      {error && <small className="image-picker-error" role="alert">{error}</small>}
      <small>بعد الرفع اضغط «حفظ التغييرات» عشان الصور تظهر في المتجر.</small>
    </div>
  );
}
