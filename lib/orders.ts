import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { getDb } from './auth';
import { anyDesign, estimateCustomPrint, findColor, findDesign, findMaterial, getReadyPrice, MAX_ITEM_PARTS, MAX_ORDER_ITEMS, MAX_QUANTITY, orderTotal, type Pricing } from './catalog';
import { getPricing } from './settings';
import { deleteOrderFiles, filesByOrder, NO_FILES, saveOrderFiles, type OrderFile, type PreparedOrderFiles } from './uploads';

export const ORDER_STATUSES = ['pending', 'confirmed', 'printing', 'ready', 'completed', 'cancelled'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** One design in an order, with its own settings. `files` are its part files and its preview picture. */
export type OrderItem = {
  id: string;
  design_id: string | null;
  name: string;
  material: string | null;
  color: string | null;
  infill: number | null;
  quantity: number;
  /** Price and print hours of one piece when the order was placed; null on orders from before they were stored. */
  unit_price: number | null;
  unit_hours: number | null;
  files: OrderFile[];
};

/**
 * An order. The design fields on the order itself summarise its items (the first item's color and infill,
 * every material, the total number of pieces) for lists, search and the CSV export.
 * `files` holds only the reference photos for the whole order.
 */
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
  items: OrderItem[];
  files: OrderFile[];
};
export type AdminOrderRow = OrderRow & { user_id: string; email: string; first_name: string; last_name: string };

const ORDER_FIELDS = 'id, design_id, design_name, status, material, color, infill, estimated_hours, estimated_price, quantity, phone, customer_note, final_price, admin_note, created_at, updated_at';
const ITEM_FIELDS = 'id, order_id, design_id, name, material, color, infill, quantity, unit_price, unit_hours';
const round = (value: number) => Math.round(value * 100) / 100;

export class OrderError extends Error {}
/** The order does not exist or belongs to someone else; both look the same to the caller. */
export class NotFound extends Error {}

/** Adds each order's items and files. node:sqlite rows have a null prototype, so they are copied into plain objects. */
function withDetails<T extends { id: string }>(rows: T[]) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const files = filesByOrder(ids);
  const items = new Map<string, OrderItem[]>();
  const itemRows = getDb().prepare(`SELECT ${ITEM_FIELDS} FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY position`).all(...ids) as unknown as (Omit<OrderItem, 'files'> & { order_id: string })[];
  for (const { order_id: orderId, ...item } of itemRows) {
    const own = (files.get(orderId) ?? []).filter((file) => file.item_id === item.id);
    items.set(orderId, [...(items.get(orderId) ?? []), { ...item, files: own }]);
  }
  return rows.map((row) => ({ ...row, items: items.get(row.id) ?? [], files: (files.get(row.id) ?? []).filter((file) => !file.item_id) }));
}

export function listOrders(userId: string) {
  return withDetails(getDb().prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).all(userId) as unknown as Omit<OrderRow, 'items' | 'files'>[]) as OrderRow[];
}

const finiteInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

const optionalText = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

function readQuantity(value: unknown, fallback = 1) {
  const quantity = value === undefined ? fallback : value;
  if (!Number.isInteger(quantity) || !finiteInRange(quantity, 1, MAX_QUANTITY)) throw new Error('Invalid quantity');
  return quantity;
}

function readPhone(value: unknown) {
  const phone = optionalText(value, 30);
  if (phone && !/^\+?[\d\s-]{6,20}$/.test(phone)) throw new Error('Invalid phone');
  return phone;
}

type ItemSpec = { designId: string; name: string; material: string; color: string; infill: number; quantity: number; unitPrice: number; unitHours: number };

/** The order's own design fields and totals, worked out from its items. */
function summarise(items: Pick<ItemSpec, 'designId' | 'name' | 'material' | 'color' | 'infill' | 'quantity' | 'unitPrice' | 'unitHours'>[], pricing: Pricing) {
  const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  return {
    designId: items.length === 1 ? items[0].designId : '',
    name: items.map((item) => item.name).join(' + ').slice(0, 300),
    material: [...new Set(items.map((item) => item.material))].join(' + '),
    color: items[0].color,
    infill: items[0].infill,
    quantity: items.reduce((sum, item) => sum + item.quantity, 0),
    hours: round(items.reduce((sum, item) => sum + item.unitHours * item.quantity, 0)),
    // The setup fee and the minimum apply once per order, not once per design.
    price: round(orderTotal(pricing, subtotal, 1)),
  };
}

function transaction<T>(db: DatabaseSync, run: () => T) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/** One part file as the browser measured it while previewing it. */
function readPart(part: unknown) {
  const { volumeMm3, dimensionsMm } = (part ?? {}) as { volumeMm3?: unknown; dimensionsMm?: Record<string, unknown> };
  // Measurements are bounded to a realistic printer size; the shop reviews the files before confirming the price.
  if (!finiteInRange(volumeMm3, 0.001, 1e9) || !dimensionsMm || typeof dimensionsMm !== 'object') throw new Error('Invalid model');
  const dims = { x: dimensionsMm.x, y: dimensionsMm.y, z: dimensionsMm.z };
  if (![dims.x, dims.y, dims.z].every((value) => finiteInRange(value, 0.001, 2000))) throw new Error('Invalid model');
  return { volumeMm3, dims: dims as { x: number; y: number; z: number } };
}

/**
 * Custom orders list their designs in `items`, each with its settings and the measurements of its parts.
 * Orders sent in the older single-design shape are read as one item with one part.
 */
function customItems(body: Record<string, unknown>) {
  if (Array.isArray(body.items)) return body.items as Record<string, unknown>[];
  return [{ ...body, parts: [{ volumeMm3: body.volumeMm3, dimensionsMm: body.dimensionsMm }] }];
}

/**
 * Builds an order from what the customer chose. Prices and hours are always computed here
 * from the current pricing settings, never taken from the request.
 */
export async function createOrder(userId: string, body: Record<string, unknown>, files: PreparedOrderFiles = NO_FILES) {
  const pricing = getPricing();
  if (!pricing.acceptingOrders) throw new OrderError(pricing.notice || 'الطلبات متوقفة مؤقتًا.');
  const phone = readPhone(body.phone);
  let specs: ItemSpec[];

  if (body.kind === 'ready') {
    const design = findDesign(pricing, body.designId);
    if (!design) throw new Error('Unknown design');
    const color = findColor(pricing, body.colorId);
    if (!color) throw new Error('Invalid color');
    const material = pricing.materials.find((item) => item.id === design.material)!;
    specs = [{ designId: design.id, name: design.nameAr, material: material.label, color: color.id, infill: design.infill, quantity: readQuantity(body.quantity), unitPrice: getReadyPrice(design, pricing), unitHours: design.printHours }];
    files = { items: [], images: files.images };
  } else if (body.kind === 'custom') {
    const raw = customItems(body);
    if (!raw.length || raw.length > MAX_ORDER_ITEMS) throw new Error('Invalid order');
    specs = raw.map((item, index) => {
      const models = files.items[index]?.models ?? [];
      if (!models.length) throw new OrderError('ارفع ملف التصميم مع الطلب.');
      const material = findMaterial(pricing, item.material);
      const color = findColor(pricing, item.colorId);
      if (!material || !color || !finiteInRange(item.infill, 10, 100)) throw new Error('Invalid settings');
      const parts = Array.isArray(item.parts) ? item.parts : [];
      if (parts.length !== models.length || parts.length > MAX_ITEM_PARTS) throw new Error('Invalid model');
      // Each part prints on its own, so one piece of the design costs the sum of its parts.
      const estimates = parts.map(readPart).map((part) => estimateCustomPrint(part.volumeMm3, part.dims, item.infill as number, material, pricing));
      return {
        designId: '',
        name: models[0].name,
        material: material.label,
        color: color.id,
        infill: item.infill as number,
        quantity: readQuantity(item.quantity),
        unitPrice: estimates.reduce((sum, estimate) => sum + estimate.price, 0),
        unitHours: estimates.reduce((sum, estimate) => sum + estimate.hours, 0),
      };
    });
    if (files.items.length !== specs.length) throw new Error('Invalid order');
  } else {
    throw new Error('Invalid order');
  }

  const id = randomUUID();
  const itemIds = specs.map(() => randomUUID());
  const db = getDb();
  const now = new Date().toISOString();
  const total = summarise(specs, pricing);
  transaction(db, () => {
    db.prepare('INSERT INTO orders(id,user_id,design_id,design_name,material,color,infill,estimated_hours,estimated_price,quantity,phone,customer_note,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(id, userId, total.designId, total.name, total.material, total.color, total.infill, total.hours, total.price, total.quantity, phone, optionalText(body.note, 500), now, now);
    const insert = db.prepare(`INSERT INTO order_items(id,order_id,position,design_id,name,material,color,infill,quantity,unit_price,unit_hours) VALUES(?,?,?,?,?,?,?,?,?,?,?)`);
    specs.forEach((spec, index) => insert.run(itemIds[index], id, index, spec.designId, spec.name, spec.material, spec.color, spec.infill, spec.quantity, spec.unitPrice, spec.unitHours));
  });
  try {
    await saveOrderFiles(id, itemIds, files);
  } catch (error) {
    // Never keep an order whose files could not be stored: the shop would have nothing to print.
    db.prepare('DELETE FROM orders WHERE id=?').run(id);
    await deleteOrderFiles(id);
    throw error;
  }
  return withDetails([db.prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE id=? AND user_id=?`).get(id, userId) as unknown as Omit<OrderRow, 'items' | 'files'>])[0] as OrderRow;
}

// ---------- Customer changes ----------

/** Customers may change or delete an order only until the shop starts on it. */
export const EDITABLE_STATUS = 'pending';
const LOCKED = 'الطلب ده الورشة بدأت فيه، ومينفعش يتعدّل أو يتحذف دلوقتي.';

/**
 * Price and hours of one piece of an item. Orders from before these were stored have a single item,
 * so they are worked back from the order's totals.
 */
export function itemUnitCost(item: Pick<OrderItem, 'design_id' | 'quantity' | 'unit_price' | 'unit_hours'>, order: Pick<OrderRow, 'estimated_price' | 'estimated_hours'>, pricing: Pricing) {
  const pieces = Math.max(1, item.quantity);
  const design = item.design_id ? anyDesign(pricing, item.design_id) : undefined;
  return {
    unitPrice: item.unit_price ?? (design ? getReadyPrice(design, pricing) : Math.max(0, (order.estimated_price ?? 0) - pricing.setupFee) / pieces),
    unitHours: item.unit_hours ?? (order.estimated_hours ?? 0) / pieces,
  };
}

/**
 * Changes the color and quantity of each design, and the phone or note, of a customer's own order while it is
 * still pending. `items` is a list of `{ id, colorId?, quantity? }`; for an order with one design, `colorId` and
 * `quantity` may also be sent on their own. The price of one piece stays what it was when the order was placed.
 */
export function editOrder(userId: string, id: unknown, body: Record<string, unknown>) {
  const db = getDb();
  if (typeof id !== 'string') throw new NotFound();
  const order = listOrders(userId).find((row) => row.id === id);
  if (!order) throw new NotFound();
  if (order.status !== EDITABLE_STATUS) throw new OrderError(LOCKED);
  const pricing = getPricing();

  const changes = new Map<string, Record<string, unknown>>();
  if (Array.isArray(body.items)) {
    for (const change of body.items as Record<string, unknown>[]) {
      if (!change || typeof change.id !== 'string' || !order.items.some((item) => item.id === change.id)) throw new Error('Unknown item');
      changes.set(change.id, change);
    }
  } else if (order.items.length === 1 && (body.colorId !== undefined || body.quantity !== undefined)) {
    changes.set(order.items[0].id, { colorId: body.colorId, quantity: body.quantity });
  }

  const items = order.items.map((item) => {
    const change = changes.get(item.id) ?? {};
    let color = item.color ?? '';
    if (change.colorId !== undefined && change.colorId !== item.color) {
      const chosen = findColor(pricing, change.colorId);
      if (!chosen) throw new Error('Invalid color');
      color = chosen.id;
    }
    const { unitPrice, unitHours } = itemUnitCost(item, order, pricing);
    return { id: item.id, designId: item.design_id ?? '', name: item.name, material: item.material ?? '', color, infill: item.infill ?? 0, quantity: readQuantity(change.quantity, item.quantity), unitPrice, unitHours };
  });
  const phone = body.phone === undefined ? order.phone : readPhone(body.phone);
  const note = body.note === undefined ? order.customer_note : optionalText(body.note, 500);
  const total = summarise(items, pricing);

  transaction(db, () => {
    // The status check is part of the write: the shop may have picked the order up a moment ago.
    const changed = db.prepare('UPDATE orders SET color=?, quantity=?, phone=?, customer_note=?, estimated_price=?, estimated_hours=?, updated_at=? WHERE id=? AND user_id=? AND status=?')
      .run(total.color, total.quantity, phone, note, total.price, total.hours, new Date().toISOString(), id, userId, EDITABLE_STATUS).changes;
    if (!changed) throw new OrderError(LOCKED);
    const update = db.prepare('UPDATE order_items SET color=?, quantity=?, unit_price=?, unit_hours=? WHERE id=? AND order_id=?');
    for (const item of items) update.run(item.color, item.quantity, item.unitPrice, item.unitHours, item.id, id);
  });
  return listOrders(userId).find((row) => row.id === id)!;
}

/** Deletes a customer's own order, with its files, while it is still pending. */
export async function deleteOwnOrder(userId: string, id: unknown) {
  if (typeof id !== 'string') throw new NotFound();
  const db = getDb();
  if (!db.prepare('DELETE FROM orders WHERE id=? AND user_id=? AND status=?').run(id, userId, EDITABLE_STATUS).changes) {
    if (!db.prepare('SELECT 1 FROM orders WHERE id=? AND user_id=?').get(id, userId)) throw new NotFound();
    throw new OrderError(LOCKED);
  }
  await deleteOrderFiles(id);
}

// ---------- Admin ----------

export function listAllOrders() {
  const rows = getDb().prepare(`SELECT ${ORDER_FIELDS.split(', ').map((field) => `o.${field}`).join(', ')}, o.user_id, u.email, u.first_name, u.last_name FROM orders o JOIN users u ON u.id=o.user_id ORDER BY o.created_at DESC LIMIT 2000`).all() as unknown as Omit<AdminOrderRow, 'items' | 'files'>[];
  return withDetails(rows) as AdminOrderRow[];
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
