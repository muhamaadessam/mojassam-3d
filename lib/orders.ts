import { randomUUID } from 'node:crypto';
import { getDb } from './auth';
import { estimateCustomPrint, findColor, findDesign, getReadyPrice, isMaterial, MATERIALS } from './catalog';

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
  created_at: string;
};

const ORDER_FIELDS = 'id, design_id, design_name, status, material, color, infill, estimated_hours, estimated_price, created_at';
const round = (value: number) => Math.round(value * 100) / 100;

export function listOrders(userId: string) {
  return getDb().prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 200`).all(userId) as unknown as OrderRow[];
}

const finiteInRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/**
 * Builds an order from what the customer chose. Prices and hours are always computed here,
 * never taken from the request.
 */
export function createOrder(userId: string, body: Record<string, unknown>) {
  const color = findColor(body.colorId);
  if (!color) throw new Error('Invalid color');
  let values: { designId: string; designName: string; material: string; infill: number; hours: number; price: number };

  if (body.kind === 'ready') {
    const design = findDesign(body.designId);
    if (!design) throw new Error('Unknown design');
    values = { designId: design.id, designName: design.nameAr, material: MATERIALS[design.material].label, infill: design.infill, hours: design.printHours, price: getReadyPrice(design) };
  } else if (body.kind === 'custom') {
    const { material, infill, volumeMm3, dimensionsMm, fileName } = body as Record<string, unknown> & { dimensionsMm?: Record<string, unknown> };
    if (!isMaterial(material) || !finiteInRange(infill, 10, 100)) throw new Error('Invalid settings');
    // An uploaded file never leaves the device, so its measurements come from the browser.
    // They are bounded to a realistic printer size, and the order stays "pending" until reviewed.
    if (!finiteInRange(volumeMm3, 0.001, 1e9) || !dimensionsMm || typeof dimensionsMm !== 'object') throw new Error('Invalid model');
    const dims = { x: dimensionsMm.x, y: dimensionsMm.y, z: dimensionsMm.z };
    if (![dims.x, dims.y, dims.z].every((value) => finiteInRange(value, 0.001, 2000))) throw new Error('Invalid model');
    const estimate = estimateCustomPrint(volumeMm3, dims as { x: number; y: number; z: number }, infill, material);
    const name = typeof fileName === 'string' && fileName.trim() ? fileName.trim().slice(0, 160) : 'Custom design';
    values = { designId: '', designName: name, material: MATERIALS[material].label, infill, hours: estimate.hours, price: estimate.price };
  } else {
    throw new Error('Invalid order');
  }

  const id = randomUUID();
  const db = getDb();
  db.prepare('INSERT INTO orders(id,user_id,design_id,design_name,material,color,infill,estimated_hours,estimated_price,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .run(id, userId, values.designId, values.designName, values.material, color.id, values.infill, round(values.hours), round(values.price), new Date().toISOString());
  return db.prepare(`SELECT ${ORDER_FIELDS} FROM orders WHERE id=? AND user_id=?`).get(id, userId) as unknown as OrderRow;
}
