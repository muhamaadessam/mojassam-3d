// Shared by the browser and the server. Prices come from the shop's pricing settings
// (edited in /admin); the server recomputes every price, so a request can never set its own.

export type Material = { id: string; label: string; density: number; rate: number; enabled: boolean };
export type PrintColor = { id: string; ar: string; en: string; hex: string; enabled: boolean };
export type ReadyDesign = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  categoryAr: string;
  categoryEn: string;
  material: string;
  infill: number;
  weightGrams: number;
  printHours: number;
  artClass: string;
  /** Product photos, first one is the cover. */
  images: string[];
  enabled: boolean;
};
export type Pricing = {
  /** EGP per machine hour. */
  machineHourlyRate: number;
  /** Scales the estimated print time of uploaded files (1 = as calculated). */
  timeMultiplier: number;
  /** Fixed setup fee added to every order, in EGP. */
  setupFee: number;
  /** No order is priced below this, in EGP. */
  minimumPrice: number;
  /** When false, new orders are refused and customers see `notice`. */
  acceptingOrders: boolean;
  /** Optional banner shown to customers (e.g. holiday hours). */
  notice: string;
  materials: Material[];
  colors: PrintColor[];
  designs: ReadyDesign[];
};
export type Dimensions = { x: number; y: number; z: number };

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_QUANTITY = 50;
/** Images arrive already shrunk and re-encoded as WebP by the browser; this is a safety cap. */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Reference photos a customer can attach to one order. */
export const MAX_ORDER_IMAGES = 8;
/** Product photos per ready design. */
export const MAX_DESIGN_IMAGES = 12;

export const DEFAULT_PRICING: Pricing = {
  machineHourlyRate: 15,
  timeMultiplier: 1,
  setupFee: 0,
  minimumPrice: 0,
  acceptingOrders: true,
  notice: '',
  materials: [
    { id: 'pla', label: 'PLA', density: 1.24, rate: 6, enabled: true },
    { id: 'petg', label: 'PETG', density: 1.27, rate: 8, enabled: true },
  ],
  colors: [
    { id: 'lime', ar: 'ليموني', en: 'Lime', hex: '#b5f23d', enabled: true },
    { id: 'black', ar: 'أسود', en: 'Black', hex: '#171b28', enabled: true },
    { id: 'white', ar: 'أبيض', en: 'White', hex: '#f4f6f0', enabled: true },
    { id: 'blue', ar: 'أزرق', en: 'Blue', hex: '#5ba7ff', enabled: true },
    { id: 'orange', ar: 'برتقالي', en: 'Orange', hex: '#f59b5b', enabled: true },
    { id: 'pink', ar: 'وردي', en: 'Pink', hex: '#ef8fb5', enabled: true },
  ],
  designs: [
    { id: 'desk-organizer', nameAr: 'منظّم مكتب', nameEn: 'Desk organizer', descriptionAr: 'خانات عملية للأقلام والكروت.', descriptionEn: 'Practical slots for pens and cards.', categoryAr: 'مكتب', categoryEn: 'Desk', material: 'pla', infill: 20, weightGrams: 72, printHours: 2.5, artClass: 'organizer', images: [], enabled: true },
    { id: 'wave-vase', nameAr: 'مزهرية الموجة', nameEn: 'Wave vase', descriptionAr: 'شكل هادئ يضيف لمسة للمكان.', descriptionEn: 'A calm form that adds character to a room.', categoryAr: 'ديكور', categoryEn: 'Decor', material: 'petg', infill: 15, weightGrams: 118, printHours: 4, artClass: 'vase', images: [], enabled: true },
    { id: 'phone-stand', nameAr: 'حامل موبايل', nameEn: 'Phone stand', descriptionAr: 'حامل ثابت للمكتب أو بجانب السرير.', descriptionEn: 'A stable stand for your desk or bedside.', categoryAr: 'إكسسوارات', categoryEn: 'Accessories', material: 'pla', infill: 25, weightGrams: 54, printHours: 1.75, artClass: 'stand', images: [], enabled: true },
  ],
};

/** What customers may pick from: only enabled items. */
export function publicCatalog(pricing: Pricing) {
  const materials = pricing.materials.filter((material) => material.enabled);
  const materialIds = new Set(materials.map((material) => material.id));
  return {
    materials,
    colors: pricing.colors.filter((color) => color.enabled),
    designs: pricing.designs.filter((design) => design.enabled && materialIds.has(design.material)),
  };
}

export const findMaterial = (pricing: Pricing, id: unknown) => pricing.materials.find((material) => material.id === id && material.enabled);
export const findColor = (pricing: Pricing, id: unknown) => pricing.colors.find((color) => color.id === id && color.enabled);
export const findDesign = (pricing: Pricing, id: unknown) => publicCatalog(pricing).designs.find((design) => design.id === id);
/** Any color ever configured, enabled or not — for labelling past orders. */
export const anyColor = (pricing: Pricing, id: unknown) => pricing.colors.find((color) => color.id === id);
export const anyDesign = (pricing: Pricing, id: unknown) => pricing.designs.find((design) => design.id === id);

/** What the customer pays for `quantity` pieces: the setup fee is charged once, then the minimum applies. */
export function orderTotal(pricing: Pricing, unitPrice: number, quantity = 1) {
  return Math.max(pricing.minimumPrice, unitPrice * quantity + pricing.setupFee);
}

/** Price of one piece of a ready design, before the setup fee and minimum. */
export function getReadyPrice(design: ReadyDesign, pricing: Pricing) {
  const rate = pricing.materials.find((material) => material.id === design.material)?.rate ?? 0;
  return design.weightGrams * rate + design.printHours * pricing.machineHourlyRate;
}

export function estimateMachineHours(volumeCm3: number, dimensionsMm: Dimensions, infill: number, pricing: Pricing) {
  const largestDimension = Math.max(dimensionsMm.x, dimensionsMm.y, dimensionsMm.z);
  const sizeFactor = Math.max(1, largestDimension / 100);
  const infillFactor = 0.7 + infill / 100;
  return Math.max(0.25, 0.25 + (volumeCm3 / 14) * sizeFactor * infillFactor) * pricing.timeMultiplier;
}

/** Preliminary estimate for one piece of an uploaded model, from its measured volume and size. */
export function estimateCustomPrint(volumeMm3: number, dimensionsMm: Dimensions, infill: number, material: Material, pricing: Pricing) {
  const volumeCm3 = volumeMm3 / 1000;
  const effectiveFraction = Math.min(1, 0.15 + (infill / 100) * 0.85);
  const weightGrams = volumeCm3 * material.density * effectiveFraction;
  const materialCost = weightGrams * material.rate;
  const hours = estimateMachineHours(volumeCm3, dimensionsMm, infill, pricing);
  const machineCost = hours * pricing.machineHourlyRate;
  return { weightGrams, materialCost, hours, machineCost, price: materialCost + machineCost };
}
