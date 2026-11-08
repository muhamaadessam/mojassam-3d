'use client';

import { MAX_QUANTITY } from '@/lib/catalog';
import type { Copy } from '@/lib/copy';

export type OrderExtrasValue = { quantity: number; phone: string; note: string };
export const EMPTY_EXTRAS: OrderExtrasValue = { quantity: 1, phone: '', note: '' };

/** Quantity, contact phone, and a free-text note — sent with every order. `hideQuantity` leaves the quantity out, for orders that set it per design. */
export default function OrderExtras({ text, value, onChange, hideQuantity = false }: { text: Copy; value: OrderExtrasValue; onChange: (value: OrderExtrasValue) => void; hideQuantity?: boolean }) {
  const setQuantity = (next: number) => onChange({ ...value, quantity: Math.min(MAX_QUANTITY, Math.max(1, Math.round(next) || 1)) });
  return (
    <div className={`order-extras ${hideQuantity ? 'no-qty' : ''}`}>
      {!hideQuantity && <label className="order-extras-qty">
        <span>{text.quantity}</span>
        <span className="qty-stepper">
          <button type="button" onClick={() => setQuantity(value.quantity - 1)} disabled={value.quantity <= 1} aria-label="−">−</button>
          <input type="number" min={1} max={MAX_QUANTITY} value={value.quantity} onChange={(event) => setQuantity(Number(event.target.value))} />
          <button type="button" onClick={() => setQuantity(value.quantity + 1)} disabled={value.quantity >= MAX_QUANTITY} aria-label="+">+</button>
        </span>
      </label>}
      <label>
        <span>{text.phone}</span>
        <input type="tel" inputMode="tel" dir="ltr" maxLength={20} value={value.phone} onChange={(event) => onChange({ ...value, phone: event.target.value })} placeholder="01xxxxxxxxx" />
      </label>
      <label className="order-extras-note">
        <span>{text.note}</span>
        <textarea rows={2} maxLength={500} value={value.note} onChange={(event) => onChange({ ...value, note: event.target.value })} placeholder={text.notePlaceholder} />
      </label>
    </div>
  );
}
