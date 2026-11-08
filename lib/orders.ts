import { randomUUID } from 'node:crypto';
import { getDb } from './auth';
import { anyDesign, estimateCustomPrint, findColor, findDesign, findMaterial, getReadyPrice, MAX_QUANTITY, orderTotal } from './catalog';
import { getPricing } from './settings';
import type { Pricing } from './catalog';
import { deleteOrderFiles, filesByOrder, saveOrderFiles, type OrderFile, type PreparedOrderFiles } from './uploads';

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
  /** Price and print hours of one piece when the order was placed; null on older orders. */
  unit_price: number | null;
  unit_hours: number | null;
  created_at: string;
  updated_at: string | null;
  files: OrderFile[];
};
export type AdminOrderRow = OrderRow & { user_id: string; email: string; first_name: string; last_name: string };

const ORDER_FIELDS = 'id, design_id, design_name, status, material, color, infill, estimated_hours, estimated_price, quantity, phone, customer_note, final_price, admin_note, unit_price, unit_hours, created_at, updated_at';
const round = (value: number) => Math.round(value * 100) / 100;

export class OrderError extends Error {}
/** The order does not exist or belongs to someone else; both look the same to the caller. */
export class NotFound extends Error {}

/** Adds each order's attachments. node:sqlite rows have a null prototype, so they are copied into plain objects. */
function withFiles<T extends { id: string }>(rows: T[]) {
  const files = filesByOrder(rows.map((row) => row.id));
  return rows.map((row) => ({ ...row, files: files.get(row.id) ?? [] }));
}

export function listOrders(userId: string) {
  return withFiles(getDb().prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).all(userId) as unknown as Omit<OrderRow, 'files'>[]) as OrderRow[];
}

const finiteInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const optionalText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Builds an order from what the customer chose. Prices and hours are always computed here
 * from the current pricing settings, never taken from the request.
 */
export async function createOrder(userId: string, body: Record<string, unknown>, files: PreparedOrderFiles = { model: null, images: [], preview: null }) {
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
    const { infill, volumeMm3, dimensionsMm } = body as Record<string, unknown> & { dimensionsMm?: Record<string, unknown> };
    const material = findMaterial(pricing, body.material);
    if (!material || !finiteInRange(infill, 10, 100)) throw new Error('Invalid settings');
    if (!files.model) throw new OrderError('ارفع ملف التصميم مع الطلب.');
    // The browser measures the model while previewing it. The measurements are bounded to a
    // realistic printer size, and the shop reviews the attached file before confirming the price.
    if (!finiteInRange(volumeMm3, 0.001, 1e9) || !dimensionsMm || typeof dimensionsMm !== 'object') throw new Error('Invalid model');
    const dims = { x: dimensionsMm.x, y: dimensionsMm.y, z: dimensionsMm.z };
    if (![dims.x, dims.y, dims.z].every((value) => finiteInRange(value, 0.001, 2000))) throw new Error('Invalid model');
    const estimate = estimateCustomPrint(volumeMm3, dims as { x: number; y: number; z: number }, infill, material, pricing);
    values = { designId: '', designName: files.model.name, material: material.label, infill, hours: estimate.hours, unitPrice: estimate.price };
  } else {
    throw new Error('Invalid order');
  }

  const id = randomUUID();
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare('INSERT INTO orders(id,user_id,design_id,design_name,material,color,infill,estimated_hours,estimated_price,quantity,phone,customer_note,unit_price,unit_hours,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, userId, values.designId, values.designName, values.material, color.id, values.infill, round(values.hours * quantity), round(orderTotal(pricing, values.unitPrice, quantity)), quantity, phone, optionalText(body.note, 500), values.unitPrice, values.hours, now, now);
  try {
    await saveOrderFiles(id, files);
  } catch (error) {
    // Never keep an order whose file could not be stored: the shop would have nothing to print.
    db.prepare('DELETE FROM orders WHERE id=?').run(id);
    await deleteOrderFiles(id);
    throw error;
  }
  return withFiles([db.prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE id=? AND user_id=?`).get(id, userId) as unknown as Omit<OrderRow, 'files'>])[0] as OrderRow;
}

// ---------- Customer changes ----------

/** Customers may change or delete an order only until the shop starts on it. */
export const EDITABLE_STATUS = 'pending';
const LOCKED = 'الطلب ده الورشة بدأت فيه، ومينفعش يتعدّل أو يتحذف دلوقتي.';

/** Price and hours of one piece. Older orders did not store them, so they are worked back from the totals. */
export function unitCost(order: Pick<OrderRow, 'design_id' | 'quantity' | 'estimated_price' | 'estimated_hours' | 'unit_price' | 'unit_hours'>, pricing: Pricing) {
  const pieces = Math.max(1, order.quantity);
  const design = order.design_id ? anyDesign(pricing, order.design_id) : undefined;
  return {
    unitPrice: order.unit_price ?? (design ? getReadyPrice(design, pricing) : Math.max(0, (order.estimated_price ?? 0) - pricing.setupFee) / pieces),
    unitHours: order.unit_hours ?? (order.estimated_hours ?? 0) / pieces,
  };
}

type StoredOrder = { status: string; design_id: string | null; quantity: number; estimated_price: number | null; estimated_hours: number | null; unit_price: number | null; unit_hours: number | null; color: string | null; phone: string; customer_note: string };

/**
 * Changes the color, quantity, phone, or note of a customer's own order while it is still pending.
 * The price of one piece stays what it was when the order was placed; only the quantity changes the total.
 */
export function editOrder(userId: string, id: unknown, body: Record<string, unknown>) {
  const db = getDb();
  if (typeof id !== 'string') throw new OrderError('الطلب غير موجود.');
  const current = db.prepare('SELECT status, design_id, quantity, estimated_price, estimated_hours, unit_price, unit_hours, color, phone, customer_note FROM orders WHERE id=? AND user_id=?').get(id, userId) as StoredOrder | undefined;
  if (!current) throw new NotFound();
  if (current.status !== EDITABLE_STATUS) throw new OrderError(LOCKED);
  const pricing = getPricing();

  let color = current.color;
  if (body.colorId !== undefined && body.colorId !== current.color) {
    const chosen = findColor(pricing, body.colorId);
    if (!chosen) throw new Error('Invalid color');
    color = chosen.id;
  }
  const quantity = body.quantity === undefined ? current.quantity : body.quantity;
  if (!Number.isInteger(quantity) || !finiteInRange(quantity, 1, MAX_QUANTITY)) throw new Error('Invalid quantity');
  const phone = body.phone === undefined ? current.phone : optionalText(body.phone, 30);
  if (phone && !/^\+?[\d\s-]{6,20}$/.test(phone)) throw new Error('Invalid phone');
  const note = body.note === undefined ? current.customer_note : optionalText(body.note, 500);

  const { unitPrice, unitHours } = unitCost(current, pricing);

  const changed = db.prepare('UPDATE orders SET color=?, quantity=?, phone=?, customer_note=?, estimated_price=?, estimated_hours=?, unit_price=?, unit_hours=?, updated_at=? WHERE id=? AND user_id=? AND status=?')
    .run(color, quantity, phone, note, round(orderTotal(pricing, unitPrice, quantity)), round(unitHours * quantity), unitPrice, unitHours, new Date().toISOString(), id, userId, EDITABLE_STATUS).changes;
  // The shop may have picked the order up between the read and the write.
  if (!changed) throw new OrderError(LOCKED);
  return listOrders(userId).find((order) => order.id === id)!;
}

/** Deletes a customer's own order, with its files, while it is still pending. */
export async function deleteOwnOrder(userId: string, id: unknown) {
  if (typeof id !== 'string') throw new OrderError('الطلب غير موجود.');
  const db = getDb();
  if (!db.prepare('DELETE FROM orders WHERE id=? AND user_id=? AND status=?').run(id, userId, EDITABLE_STATUS).changes) {
    if (!db.prepare('SELECT 1 FROM orders WHERE id=? AND user_id=?').get(id, userId)) throw new NotFound();
    throw new OrderError(LOCKED);
  }
  await deleteOrderFiles(id);
}

// ---------- Admin ----------

export function listAllOrders() {
  const rows = getDb().prepare(`SELECT ${ORDER_FIELDS.split(', ').map((field) => `o.${field}`).join(', ')}, o.user_id, u.email, u.first_name, u.last_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 2000`).all() as unknown as Omit<AdminOrderRow, 'files'>[];
  return withFiles(rows) as AdminOrderRow[];
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

export async function deleteOrder(id: unknown) {
  if (typeof id !== 'string') throw new OrderError('الطلب غير موجود.');
  if (!getDb().prepare('DELETE FROM orders WHERE id=?').run(id).changes) throw new OrderError('الطلب غير موجود.');
  await deleteOrderFiles(id);
}
