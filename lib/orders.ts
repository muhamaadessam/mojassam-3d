import { randomUUID } from 'node:crypto';
import { getDb } from './auth';
import { estimateCustomPrint, findColor, findDesign, findMaterial, getReadyPrice, MAX_QUANTITY, orderTotal } from './catalog';
import { getPricing } from './settings';

export const ORDER_STATUSES = ['pending', 'confirmed', 'printing', 'ready', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderRow = {
  id: string;
  design_id: string | null;
  design_name: string;
  status: string;
  material: string | null;
  color: string | null;
  infill: number | null;
  estimated_hours: number | null;
  estimated_price: number | null;
  quantity: number;
  phone: string;
  customer_note: string;
  final_price: number | null;
  admin_note: string;
  created_at: string;
  updated_at: string | null;
};
export type AdminOrderRow = OrderRow & { user_id: string; email: string; first_name: string; last_name: string };

const ORDER_FIELDS = 'id, design_id, design_name, status, material, color, infill, estimated_hours, estimated_price, quantity, phone, customer_note, final_price, admin_note, created_at, updated_at';
const round = (value: number) => Math.round(value * 100) / 100;

export class OrderError extends Error {}

export function listOrders(userId: string) {
  return getDb().prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).all(userId) as unknown as OrderRow[];
}

const finiteInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const optionalText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Builds an order from what the customer chose. Prices and hours are always computed here
 * from the current pricing settings, never taken from the request.
 */
export function createOrder(userId: string, body: Record<string, unknown>) {
  const pricing = getPricing();
  if (!pricing.acceptingOrders) throw new OrderError(pricing.notice || 'الطلبات متوقفة مؤقتًا.');
  const color = findColor(pricing, body.colorId);
  if (!color) throw new Error('Invalid color');
  const quantity = body.quantity === undefined ? 1 : body.quantity;
  if (!Number.isInteger(quantity) || !finiteInRange(quantity, 1, MAX_QUANTITY)) throw new Error('Invalid quantity');
  const phone = optionalText(body.phone, 30);
  if (phone && !/^\+?[\d\s-]{6,20}$/.test(phone)) throw new Error('Invalid phone');
  let values: { designId: string; designName: string; material: string; infill: number; hours: number; unitPrice: number };

  if (body.kind === 'ready') {
    const design = findDesign(pricing, body.designId);
    if (!design) throw new Error('Unknown design');
    const material = pricing.materials.find((item) => item.id === design.material)!;
    values = { designId: design.id, designName: design.nameAr, material: material.label, infill: design.infill, hours: design.printHours, unitPrice: getReadyPrice(design, pricing) };
  } else if (body.kind === 'custom') {
    const { infill, volumeMm3, dimensionsMm, fileName } = body as Record<string, unknown> & { dimensionsMm?: Record<string, unknown> };
    const material = findMaterial(pricing, body.material);
    if (!material || !finiteInRange(infill, 10, 100)) throw new Error('Invalid settings');
    // An uploaded file never leaves the device, so its measurements come from the browser.
    // They are bounded to a realistic printer size, and the order stays "pending" until reviewed.
    if (!finiteInRange(volumeMm3, 0.001, 1e9) || !dimensionsMm || typeof dimensionsMm !== 'object') throw new Error('Invalid model');
    const dims = { x: dimensionsMm.x, y: dimensionsMm.y, z: dimensionsMm.z };
    if (![dims.x, dims.y, dims.z].every((value) => finiteInRange(value, 0.001, 2000))) throw new Error('Invalid model');
    const estimate = estimateCustomPrint(volumeMm3, dims as { x: number; y: number; z: number }, infill, material, pricing);
    const name = typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 160) : 'Custom design';
    values = { designId: '', designName: name, material: material.label, infill, hours: estimate.hours, unitPrice: estimate.price };
  } else {
    throw new Error('Invalid order');
  }

  const id = randomUUID();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO orders(id,user_id,design_id,design_name,material,color,infill,estimated_hours,estimated_price,quantity,phone,customer_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, userId, values.designId, values.designName, values.material, color.id, values.infill, round(values.hours * quantity), round(orderTotal(pricing, values.unitPrice, quantity)), quantity, phone, optionalText(body.note, 500), now, now);
  return db.prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE id=? AND user_id=?`).get(id, userId) as unknown as OrderRow;
}

// ---------- Admin ----------

export function listAllOrders() {
  const rows = getDb().prepare(`SELECT ${ORDER_FIELDS.split(', ').map((field) => `o.${field}`).join(', ')}, o.user_id, u.email, u.first_name, u.last_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 2000`).all();
  // node:sqlite rows have a null prototype, which cannot be passed to client components.
  return rows.map((row) => ({ ...row })) as unknown as AdminOrderRow[];
}

/** Admin edits: status, the confirmed final price (or null to clear it), and a note the customer can see. */
export function updateOrder(body: Record<string, unknown>) {
  const db = getDb();
  if (typeof body.id !== 'string') throw new OrderError('الطلب غير موجود.');
  const current = db.prepare('SELECT status, final_price, admin_note FROM orders WHERE id=?').get(body.id) as { status: string; final_price: number | null; admin_note: string } | undefined;
  if (!current) throw new OrderError('الطلب غير موجود.');
  const status = body.status ?? current.status;
  if (!ORDER_STATUSES.includes(status as OrderStatus)) throw new OrderError('حالة غير صالحة.');
  let finalPrice = current.final_price;
  if (body.finalPrice === null || body.finalPrice === '') finalPrice = null;
  else if (body.finalPrice !== undefined) {
    if (!finiteInRange(body.finalPrice, 0, 10_000_000)) throw new OrderError('السعر النهائي غير صالح.');
    finalPrice = round(body.finalPrice);
  }
  const adminNote = body.adminNote === undefined ? current.admin_note : optionalText(body.adminNote, 1000);
  db.prepare('UPDATE orders SET status=?, final_price=?, admin_note=?, updated_at=? WHERE id=?').run(status as string, finalPrice, adminNote, new Date().toISOString(), body.id);
  return listAllOrders().find((order) => order.id === body.id)!;
}

export function deleteOrder(id: unknown) {
  if (typeof id !== 'string') throw new OrderError('الطلب غير موجود.');
  if (!getDb().prepare('DELETE FROM orders WHERE id=?').run(id).changes) throw new OrderError('الطلب غير موجود.');
}
