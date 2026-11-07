// Shared by the browser and the server. The server recomputes every price from
// these values, so a request can never set its own price.

export type MaterialKey = 'pla' | 'petg';
export type PrintColor = { id: string; ar: string; en: string; hex: string };
export type ReadyDesign = {
  id: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  descriptionEn: string;
  categoryAr: string;
  categoryEn: string;
  material: MaterialKey;
  infill: number;
  weightGrams: number;
  printHours: number;
  artClass: string;
  image?: string;
};
export type Dimensions = { x: number; y: number; z: number };

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const MACHINE_HOURLY_RATE = 15;
export const MATERIALS: Record<MaterialKey, { density: number; rate: number; label: string; colorToken: string }> = {
  pla: { density: 1.24, rate: 6, label: 'PLA', colorToken: '--color-brand' },
  petg: { density: 1.27, rate: 8, label: 'PETG', colorToken: '--color-info' },
};
export const PRINT_COLORS: PrintColor[] = [
  { id: 'lime', ar: 'ليموني', en: 'Lime', hex: '#b5f23d' },
  { id: 'black', ar: 'أسود', en: 'Black', hex: '#171b28' },
  { id: 'white', ar: 'أبيض', en: 'White', hex: '#f4f6f0' },
  { id: 'blue', ar: 'أزرق', en: 'Blue', hex: '#5ba7ff' },
  { id: 'orange', ar: 'برتقالي', en: 'Orange', hex: '#f59b5b' },
  { id: 'pink', ar: 'وردي', en: 'Pink', hex: '#ef8fb5' },
];
export const READY_DESIGNS: ReadyDesign[] = [
  { id: 'desk-organizer', nameAr: 'منظّم مكتب', nameEn: 'Desk organizer', descriptionAr: 'خانات عملية للأقلام والكروت.', descriptionEn: 'Practical slots for pens and cards.', categoryAr: 'مكتب', categoryEn: 'Desk', material: 'pla', infill: 20, weightGrams: 72, printHours: 2.5, artClass: 'organizer' },
  { id: 'wave-vase', nameAr: 'مزهرية الموجة', nameEn: 'Wave vase', descriptionAr: 'شكل هادئ يضيف لمسة للمكان.', descriptionEn: 'A calm form that adds character to a room.', categoryAr: 'ديكور', categoryEn: 'Decor', material: 'petg', infill: 15, weightGrams: 118, printHours: 4, artClass: 'vase' },
  { id: 'phone-stand', nameAr: 'حامل موبايل', nameEn: 'Phone stand', descriptionAr: 'حامل ثابت للمكتب أو بجانب السرير.', descriptionEn: 'A stable stand for your desk or bedside.', categoryAr: 'إكسسوارات', categoryEn: 'Accessories', material: 'pla', infill: 25, weightGrams: 54, printHours: 1.75, artClass: 'stand' },
];

export const isMaterial = (value: unknown): value is MaterialKey => value === 'pla' || value === 'petg';
export const findColor = (id: unknown) => PRINT_COLORS.find((color) => color.id === id);
export const findDesign = (id: unknown) => READY_DESIGNS.find((design) => design.id === id);

export function getReadyPrice(design: ReadyDesign) {
  return design.weightGrams * MATERIALS[design.material].rate + design.printHours * MACHINE_HOURLY_RATE;
}

export function estimateMachineHours(volumeCm3: number, dimensionsMm: Dimensions, infill: number) {
  const largestDimension = Math.max(dimensionsMm.x, dimensionsMm.y, dimensionsMm.z);
  const sizeFactor = Math.max(1, largestDimension / 100);
  const infillFactor = 0.7 + infill / 100;
  return Math.max(0.25, 0.25 + (volumeCm3 / 14) * sizeFactor * infillFactor);
}

/** Preliminary estimate for an uploaded model, from its measured volume and size. */
export function estimateCustomPrint(volumeMm3: number, dimensionsMm: Dimensions, infill: number, material: MaterialKey) {
  const volumeCm3 = volumeMm3 / 1000;
  const selected = MATERIALS[material];
  const effectiveFraction = Math.min(1, 0.15 + (infill / 100) * 0.85);
  const weightGrams = volumeCm3 * selected.density * effectiveFraction;
  const materialCost = weightGrams * selected.rate;
  const hours = estimateMachineHours(volumeCm3, dimensionsMm, infill);
  const machineCost = hours * MACHINE_HOURLY_RATE;
  return { weightGrams, materialCost, hours, machineCost, price: materialCost + machineCost };
}
