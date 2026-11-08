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
// Custom files: the model (and optional WebP photos) are uploaded with the order and priced on the server.
const stl = new Blob(['solid part\nendsolid part\n'], { type: 'model/stl' });
const webp = new Blob([Uint8Array.from([...Buffer.from('RIFF'), 30, 0, 0, 0, ...Buffer.from('WEBPVP8L'), 1, 0, 0, 0, 0x2f, 0, 0, 0, 0])], { type: 'image/webp' });
async function upload(order, cookie, { model = stl, modelName = 'part.stl', images = [], preview = null } = {}) {
  const form = new FormData();
  form.set('order', JSON.stringify(order));
  if (model) form.set('model', model, modelName);
  for (const image of images) form.append('images', image, 'photo.webp');
  if (preview) form.set('preview', preview, 'preview.webp');
  const response = await fetch(`${origin}/api/orders`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: form });
  return { status: response.status, body: await response.json() };
}
const customOrder = { kind: 'custom', material: 'petg', infill: 20, colorId: 'black', volumeMm3: 10000, dimensionsMm: { x: 20, y: 20, z: 25 }, estimatedPrice: 1 };
const custom = await upload(customOrder, first.cookie, { images: [webp] });
assert.equal(custom.status, 201);
assert.ok(custom.body.order.estimated_price > 1);
assert.equal(custom.body.order.design_name, 'part.stl');
// Older single-design uploads become one order item; photos stay on the order.
assert.equal(custom.body.order.items.length, 1);
assert.deepEqual(custom.body.order.items[0].files.map((file) => file.kind), ['model']);
assert.deepEqual(custom.body.order.files.map((file) => file.kind), ['image']);
const customModel = custom.body.order.items[0].files[0];
const fileUrl = (order, file) => `${origin}/api/orders/${order.id}/files/${file.id}`;
const modelDownload = await fetch(fileUrl(custom.body.order, customModel), { headers: { Cookie: first.cookie } });
assert.equal(modelDownload.status, 200);
assert.equal(await modelDownload.text(), 'solid part\nendsolid part\n');
assert.equal((await fetch(fileUrl(custom.body.order, custom.body.order.files[0]), { headers: { Cookie: first.cookie } })).headers.get('content-type'), 'image/webp');
assert.equal((await fetch(fileUrl(custom.body.order, customModel))).status, 401);
// The browser sends a picture of the model; it is stored as its own file and served as an image.
const withPreview = await upload(customOrder, first.cookie, { preview: webp });
assert.equal(withPreview.status, 201);
const previewFile = withPreview.body.order.items[0].files.find((file) => file.kind === 'preview');
assert.ok(previewFile);
assert.equal((await fetch(fileUrl(withPreview.body.order, previewFile), { headers: { Cookie: first.cookie } })).headers.get('content-type'), 'image/webp');
assert.equal((await upload(customOrder, first.cookie, { preview: new Blob(['not an image']) })).status, 400);
// A custom order needs its file, photos must be WebP, and only 3D formats are accepted.
assert.equal((await request('/api/orders', { ...customOrder }, first.cookie)).status, 409);
assert.equal((await upload(customOrder, first.cookie, { model: null })).status, 409);
assert.equal((await upload(customOrder, first.cookie, { images: [new Blob(['not an image'])] })).status, 400);
assert.equal((await upload(customOrder, first.cookie, { modelName: 'part.exe' })).status, 400);
assert.equal((await upload({ ...customOrder, volumeMm3: -5 }, first.cookie)).status, 400);
assert.equal((await upload({ ...customOrder, material: 'gold' }, first.cookie)).status, 400);

// One order can hold several designs, each with its own settings, and a design can be split into part files.
async function uploadMany(items, cookie, files) {
  const form = new FormData();
  form.set('order', JSON.stringify({ kind: 'custom', phone: '01011112222', items }));
  for (const [name, blob, fileName] of files) form.append(name, blob, fileName);
  const response = await fetch(`${origin}/api/orders`, { method: 'POST', headers: { Origin: origin, Cookie: cookie }, body: form });
  return { status: response.status, body: await response.json() };
}
const part = { volumeMm3: 10000, dimensionsMm: { x: 20, y: 20, z: 25 } };
const twoDesigns = [
  { material: 'petg', infill: 20, colorId: 'black', quantity: 2, parts: [part, part] },
  { material: 'petg', infill: 20, colorId: 'blue', quantity: 1, parts: [part] },
];
const many = await uploadMany(twoDesigns, first.cookie, [['model-0', stl, 'base.stl'], ['model-0', stl, 'lid.stl'], ['preview-0', webp, 'preview.webp'], ['model-1', stl, 'clip.stl'], ['images', webp, 'photo.webp']]);
assert.equal(many.status, 201);
assert.equal(many.body.order.items.length, 2);
assert.deepEqual(many.body.order.items[0].files.map((file) => file.name), ['preview.webp', 'base.stl', 'lid.stl']);
assert.deepEqual(many.body.order.items[1].files.map((file) => file.name), ['clip.stl']);
assert.equal(many.body.order.files.length, 1);
assert.equal(many.body.order.items[1].color, 'blue');
assert.equal(many.body.order.quantity, 3);
// One piece of the first design costs both of its parts; the order total covers every piece of every design.
assert.ok(Math.abs(many.body.order.items[0].unit_price - 2 * custom.body.order.items[0].unit_price) < 0.01);
assert.ok(Math.abs(many.body.order.estimated_price - (2 * many.body.order.items[0].unit_price + many.body.order.items[1].unit_price)) < 0.02);
assert.equal((await fetch(fileUrl(many.body.order, many.body.order.items[0].files[2]), { headers: { Cookie: first.cookie } })).status, 200);
// The measurements must match the files, every design needs a file, and an order has at most 10 designs.
assert.equal((await uploadMany(twoDesigns, first.cookie, [['model-0', stl, 'base.stl'], ['model-1', stl, 'clip.stl']])).status, 400);
assert.equal((await uploadMany(twoDesigns, first.cookie, [['model-0', stl, 'base.stl'], ['model-0', stl, 'lid.stl']])).status, 409);
const eleven = Array.from({ length: 11 }, () => ({ material: 'petg', infill: 20, colorId: 'black', quantity: 1, parts: [part] }));
assert.equal((await uploadMany(eleven, first.cookie, eleven.map((_, index) => [`model-${index}`, stl, 'p.stl']))).status, 400);
// Each design's color and quantity can be changed while the order is pending.
const editMany = await fetch(`${origin}/api/orders/${many.body.order.id}`, { method: 'PATCH', headers: { Origin: origin, Cookie: first.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: many.body.order.items[1].id, quantity: 4, colorId: 'black' }] }) });
assert.equal(editMany.status, 200);
const editedMany = (await editMany.json()).order;
assert.equal(editedMany.items[1].quantity, 4);
assert.equal(editedMany.items[1].color, 'black');
assert.equal(editedMany.quantity, 6);
assert.ok(Math.abs(editedMany.estimated_price - (2 * editedMany.items[0].unit_price + 4 * editedMany.items[1].unit_price)) < 0.02);

const second = await request('/api/auth', { action: 'signup', email: `b-${suffix}@example.test`, password, firstName: 'Test', lastName: 'Two' });
assert.equal(second.status, 200);
assert.equal((await request('/api/orders', undefined, second.cookie)).body.orders.length, 0);
// Another customer cannot read someone else's attachments.
assert.equal((await fetch(fileUrl(custom.body.order, customModel), { headers: { Cookie: second.cookie } })).status, 404);
assert.equal((await request('/api/orders', undefined, first.cookie)).body.orders.length, 4);
assert.equal((await request('/api/auth', { action: 'profile', first_name: 'Changed', last_name: 'One', avatar_url: '' }, first.cookie)).body.user.first_name, 'Changed');
assert.equal((await request('/api/auth', { action: 'profile', first_name: 'Bad', last_name: 'Avatar', avatar_url: 'javascript:alert(1)' }, first.cookie)).status, 400);
await request('/api/auth', { action: 'logout' }, first.cookie);
assert.equal((await request('/api/orders', undefined, first.cookie)).status, 401);
assert.equal((await request('/api/auth', { action: 'login', email: `a-${suffix}@example.test`, password: 'incorrect-password' })).status, 400);
const loggedIn = await request('/api/auth', { action: 'login', email: `a-${suffix}@example.test`, password });
assert.equal(loggedIn.status, 200);
assert.equal((await request('/api/orders', undefined, loggedIn.cookie)).body.orders.length, 4);

// Quantity and contact details are stored; the total is still computed on the server.
const multi = await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue', quantity: 3, phone: '01012345678', note: 'pickup Friday' }, loggedIn.cookie);
assert.equal(multi.status, 201);
assert.equal(multi.body.order.quantity, 3);
assert.equal(multi.body.order.estimated_price, (54 * 6 + 1.75 * 15) * 3);
assert.equal(multi.body.order.phone, '01012345678');
assert.equal((await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue', quantity: 0 }, loggedIn.cookie)).status, 400);
assert.equal((await request('/api/orders', { kind: 'ready', designId: 'phone-stand', colorId: 'blue', phone: '<script>' }, loggedIn.cookie)).status, 400);

// While an order is pending its owner can change it (the total follows the quantity) or delete it.
async function change(method, id, body, cookie) {
  const response = await fetch(`${origin}/api/orders/${id}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}
const edited = await change('PATCH', multi.body.order.id, { quantity: 2, colorId: 'black', note: 'pickup Saturday' }, loggedIn.cookie);
assert.equal(edited.status, 200);
assert.equal(edited.body.order.quantity, 2);
assert.equal(edited.body.order.color, 'black');
assert.equal(edited.body.order.customer_note, 'pickup Saturday');
assert.equal(edited.body.order.estimated_price, (54 * 6 + 1.75 * 15) * 2);
assert.equal(edited.body.order.estimated_hours, 1.75 * 2);
assert.equal((await change('PATCH', multi.body.order.id, { quantity: 0 }, loggedIn.cookie)).status, 400);
assert.equal((await change('PATCH', multi.body.order.id, { colorId: 'gold' }, loggedIn.cookie)).status, 400);
assert.equal((await change('PATCH', multi.body.order.id, { quantity: 1 }, second.cookie)).status, 404);
assert.equal((await change('DELETE', multi.body.order.id, undefined, second.cookie)).status, 404);
const crossSite = await fetch(`${origin}/api/orders/${multi.body.order.id}`, { method: 'DELETE', headers: { Origin: 'https://evil.example', Cookie: loggedIn.cookie } });
assert.equal(crossSite.status, 403);
assert.equal((await change('DELETE', multi.body.order.id, undefined, loggedIn.cookie)).status, 200);
assert.equal((await change('PATCH', multi.body.order.id, { quantity: 1 }, loggedIn.cookie)).status, 404);
// Deleting a custom order also removes its files.
const doomed = await upload(customOrder, loggedIn.cookie);
assert.equal((await change('DELETE', doomed.body.order.id, undefined, loggedIn.cookie)).status, 200);
assert.equal((await fetch(fileUrl(doomed.body.order, doomed.body.order.items[0].files[0]), { headers: { Cookie: loggedIn.cookie } })).status, 404);

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

  // Product photos: admins upload WebP images, which are then public.
  const photoForm = new FormData();
  photoForm.append('images', webp, 'photo.webp');
  const photos = await fetch(`${origin}/api/admin/uploads`, { method: 'POST', headers: { Origin: origin, Cookie: admin.cookie }, body: photoForm });
  assert.equal(photos.status, 200);
  const [photoUrl] = (await photos.json()).urls;
  assert.equal((await fetch(`${origin}${photoUrl}`)).headers.get('content-type'), 'image/webp');
  assert.equal((await fetch(`${origin}/api/admin/uploads`, { method: 'POST', headers: { Origin: origin, Cookie: loggedIn.cookie }, body: photoForm })).status, 403);
  const withPhotos = { ...original, designs: original.designs.map((design, index) => (index === 0 ? { ...design, images: [photoUrl] } : design)) };
  assert.deepEqual((await request('/api/admin/settings', withPhotos, admin.cookie)).body.pricing.designs[0].images, [photoUrl]);
  assert.equal((await request('/api/admin/settings', { ...original, designs: original.designs.map((design) => ({ ...design, images: ['javascript:alert(1)'] })) }, admin.cookie)).status, 400);
  // An admin can download any customer's file.
  assert.equal((await fetch(fileUrl(custom.body.order, customModel), { headers: { Cookie: admin.cookie } })).status, 200);

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
  // Once the shop has started, the customer can no longer change or delete the order.
  assert.equal((await change('PATCH', repriced.body.order.id, { quantity: 2 }, loggedIn.cookie)).status, 409);
  assert.equal((await change('DELETE', repriced.body.order.id, undefined, loggedIn.cookie)).status, 409);
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
