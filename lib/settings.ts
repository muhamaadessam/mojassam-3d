import { getDb } from './auth';
import { DEFAULT_PRICING, MAX_DESIGN_IMAGES, type Material, type Pricing, type PrintColor, type ReadyDesign } from './catalog';

const KEY = 'pricing';

class SettingsError extends Error {}
const fail = (message: string): never => { throw new SettingsError(message); };

const num = (value: unknown, min: number, max: number, field: string) =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : fail(`قيمة غير صالحة: ${field}`);
const text = (value: unknown, max: number, field: string, allowEmpty = false) => {
  if (typeof value !== 'string') return fail(`قيمة غير صالحة: ${field}`);
  const trimmed = value.trim();
  if ((!allowEmpty && !trimmed) || trimmed.length > max) fail(`قيمة غير صالحة: ${field}`);
  return trimmed;
};
const id = (value: unknown, field: string) => {
  const result = text(value, 40, field);
  return /^[a-z0-9-]+$/.test(result) ? result : fail(`المعرّف يجب أن يكون حروف إنجليزية صغيرة وأرقام و - فقط: ${field}`);
};
const bool = (value: unknown) => value === true;
const list = (value: unknown, field: string, max: number) =>
  Array.isArray(value) && value.length <= max ? value as Record<string, unknown>[] : fail(`قائمة غير صالحة: ${field}`);
const unique = <T extends { id: string }>(items: T[], field: string) => {
  if (new Set(items.map((item) => item.id)).size !== items.length) fail(`يوجد معرّف مكرر في ${field}`);
  return items;
};

/** Strictly validates pricing sent from the admin dashboard. Throws with an Arabic message. */
export function parsePricing(input: unknown): Pricing {
  if (!input || typeof input !== 'object') fail('الإعدادات غير صالحة.');
  const body = input as Record<string, unknown>;
  const materials: Material[] = unique(list(body.materials, 'الخامات', 30).map((item, index) => ({
    id: id(item.id, `خامة ${index + 1}`),
    label: text(item.label, 40, `اسم الخامة ${index + 1}`),
    density: num(item.density, 0.5, 5, `كثافة الخامة ${index + 1}`),
    rate: num(item.rate, 0, 10_000, `سعر جرام الخامة ${index + 1}`),
    enabled: bool(item.enabled),
  })), 'الخامات');
  if (!materials.some((material) => material.enabled)) fail('لازم تكون فيه خامة واحدة مفعّلة على الأقل.');

  const colors: PrintColor[] = unique(list(body.colors, 'الألوان', 60).map((item, index) => ({
    id: id(item.id, `لون ${index + 1}`),
    ar: text(item.ar, 40, `اسم اللون ${index + 1}`),
    en: text(item.en, 40, `اسم اللون بالإنجليزي ${index + 1}`),
    hex: /^#[0-9a-f]{6}$/i.test(String(item.hex)) ? String(item.hex).toLowerCase() : fail(`كود لون غير صالح ${index + 1}`),
    enabled: bool(item.enabled),
  })), 'الألوان');
  if (!colors.some((color) => color.enabled)) fail('لازم يكون فيه لون واحد مفعّل على الأقل.');

  const materialIds = new Set(materials.map((material) => material.id));
  const designs: ReadyDesign[] = unique(list(body.designs, 'التصميمات', 200).map((item, index) => {
    const field = `تصميم ${index + 1}`;
    const material = id(item.material, `خامة ${field}`);
    if (!materialIds.has(material)) fail(`خامة ${field} غير موجودة.`);
    // Older saves kept a single `image` link.
    const rawImages = Array.isArray(item.images) ? item.images : typeof item.image === 'string' && item.image.trim() ? [item.image] : [];
    if (rawImages.length > MAX_DESIGN_IMAGES) fail(`الحد الأقصى ${MAX_DESIGN_IMAGES} صور لكل تصميم: ${field}`);
    const images = rawImages.map((image) => {
      const value = typeof image === 'string' ? image.trim() : '';
      return /^(\/[\w\-./]+|https:\/\/[^\s"'<>]+)$/.test(value) ? value : fail(`رابط صورة ${field} غير صالح.`);
    });
    return {
      id: id(item.id, field),
      nameAr: text(item.nameAr, 120, `اسم ${field}`),
      nameEn: text(item.nameEn, 120, `الاسم الإنجليزي لـ ${field}`),
      descriptionAr: text(item.descriptionAr, 400, `وصف ${field}`, true),
      descriptionEn: text(item.descriptionEn, 400, `الوصف الإنجليزي لـ ${field}`, true),
      categoryAr: text(item.categoryAr, 60, `تصنيف ${field}`, true),
      categoryEn: text(item.categoryEn, 60, `التصنيف الإنجليزي لـ ${field}`, true),
      material,
      infill: num(item.infill, 5, 100, `نسبة حشو ${field}`),
      weightGrams: num(item.weightGrams, 0.1, 100_000, `وزن ${field}`),
      printHours: num(item.printHours, 0.05, 1000, `ساعات ${field}`),
      artClass: typeof item.artClass === 'string' && /^[a-z-]{0,30}$/.test(item.artClass) ? item.artClass : 'organizer',
      images,
      enabled: bool(item.enabled),
    };
  }), 'التصميمات');

  return {
    machineHourlyRate: num(body.machineHourlyRate, 0, 10_000, 'سعر ساعة الماكينة'),
    timeMultiplier: num(body.timeMultiplier, 0.1, 10, 'معامل الوقت'),
    setupFee: num(body.setupFee, 0, 100_000, 'رسوم التجهيز'),
    minimumPrice: num(body.minimumPrice, 0, 100_000, 'الحد الأدنى للطلب'),
    acceptingOrders: bool(body.acceptingOrders),
    notice: text(body.notice ?? '', 300, 'الرسالة للعملاء', true),
    materials,
    colors,
    designs,
  };
}

export const isSettingsError = (error: unknown): error is Error => error instanceof SettingsError;

/** Current pricing. Falls back to the defaults if nothing was saved yet or the saved value is unreadable. */
export function getPricing(): Pricing {
  const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(KEY) as { value: string } | undefined;
  if (!row) return DEFAULT_PRICING;
  try {
    return parsePricing({ ...DEFAULT_PRICING, ...JSON.parse(row.value) });
  } catch {
    console.error('Saved pricing is invalid; using defaults.');
    return DEFAULT_PRICING;
  }
}

export function savePricing(input: unknown) {
  const pricing = parsePricing(input);
  getDb().prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
    .run(KEY, JSON.stringify(pricing), new Date().toISOString());
  return pricing;
}
