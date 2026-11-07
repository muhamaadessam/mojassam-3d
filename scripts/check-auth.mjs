// End-to-end checks against a running server: `npm run build && npm start`, then `npm run test:auth`.
// Use a throwaway DATA_DIRECTORY; this script creates accounts and orders.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = process.env.TEST_ORIGIN || 'http://localhost:3188';
const suffix = randomUUID();
const password = randomUUID();
let fakeIp = 0;
// Each logical visitor gets its own forwarded IP so the per-IP limits do not interfere between steps.
const visitor = () => `203.0.113.${++fakeIp}`;
async function request(path, body, cookie = '', { requestOrigin = origin, ip = '198.51.100.1' } = {}) {
  const response = await fetch(`${origin}${path}`, { method: body ? 'POST' : 'GET', headers: { Origin: requestOrigin, Cookie: cookie, 'Content-Type': 'application/json', 'X-Forwarded-For': ip }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] || cookie };
}

assert.equal((await request('/api/orders')).status, 401);
assert.equal((await request('/api/auth', { action: 'signup' }, '', { requestOrigin: 'https://evil.example' })).status, 403);
const first = await request('/api/auth', { action: 'signup', email: `a-${suffix}@example.test`, password, firstName: 'Test', lastName: 'One' });
assert.equal(first.status, 200);
assert.ok(first.cookie);
assert.equal(first.body.user.password, undefined);

// Ready designs: the server sets the price; anything the client sends is ignored.
const ready = await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue', estimatedPrice: 1, infill: 99 }, first.cookie);
assert.equal(ready.status, 201);
assert.equal(ready.body.order.estimated_price, 54 * 6 + 1.75 * 15);
assert.equal(ready.body.order.infill, 25);
assert.equal(ready.body.order.color, 'blue');
assert.equal((await request('/api/orders', { kind: 'ready', designId: 'nope', colorId: 'blue' }, first.cookie)).status, 400);
assert.equal((await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'gold' }, first.cookie)).status, 400);
// Custom files: priced on the server from measurements, which must be realistic.
const custom = await request('/api/orders', { kind: 'custom', fileName: 'part.stl', material: 'petg', infill: 20, colorId: 'black', volumeMm3: 10000, dimensionsMm: { x: 20, y: 20, z: 25 }, estimatedPrice: 1 }, first.cookie);
assert.equal(custom.status, 201);
assert.ok(custom.body.order.estimated_price > 1);
assert.equal((await request('/api/orders', { kind: 'custom', material: 'pla', infill: 20, colorId: 'black', volumeMm3: -5, dimensionsMm: { x: 1, y: 1, z: 1 } }, first.cookie)).status, 400);
assert.equal((await request('/api/orders', { kind: 'custom', material: 'gold', infill: 20, colorId: 'black', volumeMm3: 5, dimensionsMm: { x: 1, y: 1, z: 1 } }, first.cookie)).status, 400);

const second = await request('/api/auth', { action: 'signup', email: `b-${suffix}@example.test`, password, firstName: 'Test', lastName: 'Two' });
assert.equal(second.status, 200);
assert.equal((await request('/api/orders', undefined, second.cookie)).body.orders.length, 0);
assert.equal((await request('/api/orders', undefined, first.cookie)).body.orders.length, 2);
assert.equal((await request('/api/auth', { action: 'profile', first_name: 'Changed', last_name: 'One', avatar_url: '' }, first.cookie)).body.user.first_name, 'Changed');
assert.equal((await request('/api/auth', { action: 'profile', first_name: 'Bad', last_name: 'Avatar', avatar_url: 'javascript:alert(1)' }, first.cookie)).status, 400);
await request('/api/auth', { action: 'logout' }, first.cookie);
assert.equal((await request('/api/orders', undefined, first.cookie)).status, 401);
assert.equal((await request('/api/auth', { action: 'login', email: `a-${suffix}@example.test`, password: 'incorrect-password' })).status, 400);
const loggedIn = await request('/api/auth', { action: 'login', email: `a-${suffix}@example.test`, password });
assert.equal(loggedIn.status, 200);
assert.equal((await request('/api/orders', undefined, loggedIn.cookie)).body.orders.length, 2);

// Quantity and contact details are stored; the total is still computed on the server.
const multi = await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue', quantity: 3, phone: '01012345678', note: 'pickup Friday' }, loggedIn.cookie);
assert.equal(multi.status, 201);
assert.equal(multi.body.order.quantity, 3);
assert.equal(multi.body.order.estimated_price, (54 * 6 + 1.75 * 15) * 3);
assert.equal(multi.body.order.phone, '01012345678');
assert.equal((await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue', quantity: 0 }, loggedIn.cookie)).status, 400);
assert.equal((await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue', phone: '<script>' }, loggedIn.cookie)).status, 400);

// Customers cannot reach the admin dashboard API.
assert.equal((await request('/api/admin/orders', undefined, loggedIn.cookie)).status, 403);
assert.equal((await request('/api/admin/settings', { machineHourlyRate: 0 }, loggedIn.cookie)).status, 403);
assert.equal((await request('/api/admin/orders')).status, 403);

// Admin (set TEST_ADMIN_EMAIL to an address listed in the server's ADMIN_EMAILS).
const adminEmail = process.env.TEST_ADMIN_EMAIL;
if (adminEmail) {
  let admin = await request('/api/auth', { action: 'signup', email: adminEmail, password, firstName: 'Shop', lastName: 'Owner' }, '', { ip: visitor() });
  if (admin.status !== 200) admin = await request('/api/auth', { action: 'login', email: adminEmail, password: process.env.TEST_ADMIN_PASSWORD || password }, '', { ip: visitor() });
  assert.equal(admin.status, 200);
  assert.equal(admin.body.user.is_admin, true);
  const original = (await request('/api/admin/settings', undefined, admin.cookie)).body.pricing;
  assert.ok(original.materials.length);

  // Invalid settings are refused.
  assert.equal((await request('/api/admin/settings', { ...original, machineHourlyRate: -1 }, admin.cookie)).status, 400);
  assert.equal((await request('/api/admin/settings', { ...original, colors: original.colors.map((color) => ({ ...color, hex: 'red' })) }, admin.cookie)).status, 400);

  // New prices apply to the next order immediately.
  const changed = { ...original, machineHourlyRate: 20, setupFee: 10, materials: original.materials.map((m) => (m.id === 'pla' ? { ...m, rate: 7 } : m)) };
  assert.equal((await request('/api/admin/settings', changed, admin.cookie)).status, 200);
  const repriced = await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue' }, loggedIn.cookie);
  assert.equal(repriced.body.order.estimated_price, 54 * 7 + 1.75 * 20 + 10);

  // Pausing orders refuses new ones.
  assert.equal((await request('/api/admin/settings', { ...changed, acceptingOrders: false, notice: 'Closed for Eid' }, admin.cookie)).status, 200);
  const paused = await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue' }, loggedIn.cookie);
  assert.equal(paused.status, 409);
  assert.equal(paused.body.error, 'Closed for Eid');
  assert.equal((await request('/api/admin/settings', original, admin.cookie)).status, 200);

  // The admin sees every customer's orders and can confirm one; the customer sees the update.
  const all = (await request('/api/admin/orders', undefined, admin.cookie)).body.orders;
  assert.ok(all.some((order) => order.id === repriced.body.order.id));
  const update = await request('/api/admin/orders', { id: repriced.body.order.id, status: 'printing', finalPrice: 400, adminNote: 'Ready Sunday' }, admin.cookie);
  assert.equal(update.status, 200);
  assert.equal(update.body.order.status, 'printing');
  const mine = (await request('/api/orders', undefined, loggedIn.cookie)).body.orders.find((order) => order.id === repriced.body.order.id);
  assert.equal(mine.final_price, 400);
  assert.equal(mine.admin_note, 'Ready Sunday');
  assert.equal((await request('/api/admin/orders', { id: repriced.body.order.id, status: 'shipped-to-mars' }, admin.cookie)).status, 400);
  assert.equal((await request('/api/admin/orders', { action: 'delete', id: repriced.body.order.id }, admin.cookie)).status, 200);
  console.log('Passed: admin settings validation, live repricing, pausing orders, and order updates.');
} else {
  console.log('Skipped admin checks: set TEST_ADMIN_EMAIL (listed in ADMIN_EMAILS) to run them.');
}

// Rate limits: an attacker guessing a password gets blocked, but the real owner can still sign in from elsewhere.
const attacker = visitor();
const statuses = [];
for (let i = 0; i < 12; i += 1) statuses.push((await request('/api/auth', { action: 'login', email: `a-${suffix}@example.test`, password: 'wrong-password' }, '', { ip: attacker })).status);
assert.deepEqual(statuses.slice(0, 10), Array(10).fill(400));
assert.equal(statuses.at(-1), 429);
assert.equal((await request('/api/auth', { action: 'login', email: `a-${suffix}@example.test`, password }, '', { ip: visitor() })).status, 200);
// One visitor spraying many accounts is blocked too.
const sprayer = visitor();
let sprayStatus = 0;
for (let i = 0; i < 31; i += 1) sprayStatus = (await request('/api/auth', { action: 'login', email: `spray-${i}-${suffix}@example.test`, password: 'wrong-password' }, '', { ip: sprayer })).status;
assert.equal(sprayStatus, 429);

console.log('Passed: session lifecycle, wrong password, CSRF, profile validation, server-side order pricing, customer isolation, and rate limits.');
