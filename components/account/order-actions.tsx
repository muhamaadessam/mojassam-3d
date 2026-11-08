'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import OrderExtras, { type OrderExtrasValue } from '@/components/order-extras';
import { ACCOUNT_COPY, COPY } from '@/lib/copy';
import type { LanguageKey } from '@/lib/language-config';
import { formatNumber } from '@/lib/model-file';
import { MAX_QUANTITY, type PrintColor } from '@/lib/catalog';

type EditableItem = { id: string; name: string; color: string | null; quantity: number; unitPrice: number };
type Props = {
  language: LanguageKey;
  order: { id: string; name: string; phone: string; note: string };
  /** The order's designs, each with the price of one piece, so the dialog can show the new total as quantities change. */
  items: EditableItem[];
  colors: PrintColor[];
  fees: { setupFee: number; minimum: number };
};

const clampQuantity = (value: number) => Math.min(MAX_QUANTITY, Math.max(1, Math.round(value) || 1));

/** Edit and delete buttons on a customer's order while the shop has not started on it. */
export default function OrderActions({ language, order, items, colors, fees }: Props) {
  const router = useRouter();
  const text = ACCOUNT_COPY[language];
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(items);
  const [extras, setExtras] = useState<OrderExtrasValue>({ quantity: 1, phone: order.phone, note: order.note });
  const [busy, setBusy] = useState<'' | 'saving' | 'deleting'>('');
  const [error, setError] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const currency = language === 'ar' ? 'ج.م' : 'EGP';
  const total = Math.max(fees.minimum, draft.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) + fees.setupFee);
  const change = (id: string, patch: Partial<EditableItem>) => setDraft(draft.map((item) => (item.id === id ? { ...item, ...patch } : item)));

  const send = async (method: 'PATCH' | 'DELETE', body?: unknown) => {
    const response = await fetch(`/api/orders/${order.id}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(response.status === 409 && result.error ? result.error : text.genericError);
  };

  const open = () => {
    setDraft(items);
    setExtras({ quantity: 1, phone: order.phone, note: order.note });
    setError('');
    dialogRef.current?.showModal();
  };

  const save = async () => {
    setBusy('saving');
    setError('');
    try {
      await send('PATCH', {
        phone: extras.phone,
        note: extras.note,
        items: draft.map((item, index) => ({ id: item.id, quantity: item.quantity, ...(item.color !== items[index].color ? { colorId: item.color } : {}) })),
      });
      dialogRef.current?.close();
      router.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : text.genericError);
    } finally {
      setBusy('');
    }
  };

  const remove = async () => {
    if (!window.confirm(text.confirmDelete(order.name))) return;
    setBusy('deleting');
    setDeleteError('');
    try {
      await send('DELETE');
      router.refresh();
    } catch (problem) {
      setDeleteError(problem instanceof Error ? problem.message : text.genericError);
      setBusy('');
    }
  };

  return (
    <div className="order-actions">
      <button type="button" className="ghost-button compact" onClick={open} disabled={Boolean(busy)}>{text.editOrder}</button>
      <button type="button" className="ghost-button compact danger" onClick={remove} disabled={Boolean(busy)}>{busy === 'deleting' ? text.deleting : text.deleteOrder}</button>
      {deleteError && <p className="order-actions-error" role="alert">{deleteError}</p>}

      <dialog ref={dialogRef} className="order-dialog" aria-labelledby={`edit-${order.id}`} onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
        <div className="order-dialog-body">
          <header className="order-dialog-head">
            <div>
              <p className="eyebrow accent">{text.editOrderTitle}</p>
              <h2 id={`edit-${order.id}`}><bdi>{order.name}</bdi></h2>
              <p>{text.editableHint}</p>
            </div>
            <button type="button" className="order-dialog-close" onClick={() => dialogRef.current?.close()} aria-label={text.close}>×</button>
          </header>

          {draft.map((item) => (
            <div className={`edit-item ${draft.length > 1 ? 'boxed' : ''}`} key={item.id}>
              {draft.length > 1 && <strong className="edit-item-name" dir="auto">{item.name}</strong>}
              <div className="color-picker order-color-picker">
                <span>{COPY[language].printColor}</span>
                <div className="color-swatches" role="radiogroup" aria-label={`${COPY[language].printColor}: ${item.name}`}>
                  {colors.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      className={`color-swatch ${item.color === color.id ? 'selected' : ''}`}
                      style={{ backgroundColor: color.hex }}
                      onClick={() => change(item.id, { color: color.id })}
                      aria-label={language === 'ar' ? color.ar : color.en}
                      role="radio"
                      aria-checked={item.color === color.id}
                    />
                  ))}
                </div>
              </div>
              <label className="order-extras-qty edit-item-qty">
                <span>{text.quantity}</span>
                <span className="qty-stepper">
                  <button type="button" onClick={() => change(item.id, { quantity: clampQuantity(item.quantity - 1) })} disabled={item.quantity <= 1} aria-label="−">−</button>
                  <input type="number" min={1} max={MAX_QUANTITY} value={item.quantity} onChange={(event) => change(item.id, { quantity: clampQuantity(Number(event.target.value)) })} />
                  <button type="button" onClick={() => change(item.id, { quantity: clampQuantity(item.quantity + 1) })} disabled={item.quantity >= MAX_QUANTITY} aria-label="+">+</button>
                </span>
              </label>
            </div>
          ))}
          <OrderExtras text={COPY[language]} value={extras} onChange={setExtras} hideQuantity />

          <footer className="order-dialog-foot">
            <div>
              <span>{text.newTotal}</span>
              <strong>{formatNumber(total)} <small>{currency}</small></strong>
            </div>
            <button type="button" className="primary-button" disabled={Boolean(busy)} onClick={save}>{busy === 'saving' ? text.saving : text.saveOrder}</button>
          </footer>
          {error && <p className="order-dialog-notice error" role="alert">{error}</p>}
        </div>
      </dialog>
    </div>
  );
}
