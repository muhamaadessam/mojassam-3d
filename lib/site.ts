// Single source of truth for SEO / AEO / GEO metadata. Safe for server and client.
import { getReadyPrice, MATERIALS, READY_DESIGNS } from './catalog';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mojassam3d.muhammadessam.me').replace(/\/$/, '');
export const SITE_NAME = 'Mojassam 3D';
export const SITE_NAME_AR = 'مجسّم 3D';

export const SITE_TITLE_AR = 'Mojassam 3D — معاينة ملفات 3D وحساب تكلفة الطباعة ثلاثية الأبعاد';
export const SITE_DESCRIPTION_AR =
  'ارفع ملف STL أو OBJ أو 3MF، عاين المجسم ثلاثي الأبعاد داخل المتصفح، راجع الأبعاد، واحسب تقديرًا مبدئيًا لتكلفة الطباعة 3D بالجنيه المصري — الملف لا يغادر جهازك.';
export const SITE_DESCRIPTION_EN =
  'Upload an STL, OBJ, or 3MF file, inspect the 3D model in your browser, check its dimensions, and get a preliminary 3D-printing cost estimate in EGP. Your file never leaves your device.';

export const SITE_KEYWORDS = [
  'طباعة ثلاثية الأبعاد',
  'طباعة 3D',
  'طباعة 3D في مصر',
  'تكلفة الطباعة ثلاثية الأبعاد',
  'حساب سعر طباعة 3D',
  'معاينة ملف STL',
  'عارض STL أونلاين',
  'تصميمات جاهزة للطباعة',
  '3D printing Egypt',
  '3D print cost calculator',
  'STL viewer online',
  'OBJ viewer',
  '3MF viewer',
  'PLA PETG printing',
];

export const FAQ = {
  ar: [
    { q: 'إيه هو Mojassam 3D؟', a: 'Mojassam 3D أداة في المتصفح بتخليك ترفع ملف 3D، تعاينه وتتحرك حواليه، تراجع أبعاده، وتاخد تقديرًا مبدئيًا لتكلفة الطباعة ثلاثية الأبعاد قبل ما تطلب.' },
    { q: 'إيه صيغ الملفات المدعومة؟', a: 'بندعم ملفات STL وOBJ و3MF بحجم يصل إلى 50 ميجابايت.' },
    { q: 'هل ملفي بيترفع على سيرفر؟', a: 'لا. الملف بيتقرا ويتعرض محليًا على جهازك داخل المتصفح، ومش بيترفع ولا بيتحفظ على أي سيرفر.' },
    { q: 'إزاي بيتحسب سعر الطباعة 3D؟', a: `السعر المبدئي = وزن الخامة بالجرام × سعر الجرام (PLA ${MATERIALS.pla.rate} ج.م، PETG ${MATERIALS.petg.rate} ج.م) + ساعات تشغيل الماكينة × 15 ج.م للساعة. الوزن بيتحسب من حجم المجسم ونسبة الحشو (Infill).` },
    { q: 'إيه الخامات المتاحة للطباعة؟', a: 'متاح حاليًا PLA وPETG، بألوان منها الليموني والأسود والأبيض والأزرق والبرتقالي والوردي.' },
    { q: 'هل السعر نهائي؟', a: 'لا، ده تقدير مبدئي واضح للمساعدة في القرار. السعر النهائي ممكن يختلف بعد مراجعة الملف وإعدادات التقطيع (Slicing).' },
  ],
  en: [
    { q: 'What is Mojassam 3D?', a: 'Mojassam 3D is a browser tool that lets you upload a 3D file, orbit around it, check its dimensions, and get a preliminary 3D-printing cost estimate before you order.' },
    { q: 'Which file formats are supported?', a: 'STL, OBJ, and 3MF files up to 50 MB.' },
    { q: 'Is my file uploaded to a server?', a: 'No. The file is read and rendered locally in your browser and is never uploaded or stored on a server.' },
    { q: 'How is the 3D-printing price calculated?', a: `Preliminary price = material weight in grams × price per gram (PLA ${MATERIALS.pla.rate} EGP, PETG ${MATERIALS.petg.rate} EGP) + machine hours × 15 EGP per hour. Weight is derived from the model volume and infill percentage.` },
    { q: 'Which materials can I print with?', a: 'PLA and PETG, in colors including lime, black, white, blue, orange, and pink.' },
    { q: 'Is the price final?', a: 'No. It is a clearly labeled preliminary estimate. The final price may change after the file and slicer settings are reviewed.' },
  ],
} as const;

/** JSON-LD graph for the home page: organization, site, app, FAQ, and ready-design products. */
export function homeJsonLd() {
  const org = `${SITE_URL}/#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: SITE_NAME,
        alternateName: SITE_NAME_AR,
        url: SITE_URL,
        logo: `${SITE_URL}/icons/icon-512.png`,
        areaServed: { '@type': 'Country', name: 'Egypt' },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        alternateName: SITE_NAME_AR,
        description: SITE_DESCRIPTION_AR,
        inLanguage: ['ar', 'en'],
        publisher: { '@id': org },
      },
      {
        '@type': 'WebApplication',
        '@id': `${SITE_URL}/#app`,
        name: `${SITE_NAME} Studio`,
        url: `${SITE_URL}/studio`,
        applicationCategory: 'DesignApplication',
        operatingSystem: 'Any (web browser)',
        browserRequirements: 'Requires WebGL',
        description: SITE_DESCRIPTION_EN,
        inLanguage: ['ar', 'en'],
        featureList: ['STL, OBJ and 3MF preview', 'Model dimensions', 'Preliminary 3D-print cost estimate', 'Local-only file processing'],
        offers: { '@type': 'Offer', price: 0, priceCurrency: 'EGP' },
        publisher: { '@id': org },
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE_URL}/#faq`,
        inLanguage: 'ar',
        mainEntity: FAQ.ar.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
      {
        '@type': 'ItemList',
        '@id': `${SITE_URL}/#store`,
        name: 'تصميمات جاهزة للطباعة',
        itemListElement: READY_DESIGNS.map((design, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Product',
            name: design.nameAr,
            alternateName: design.nameEn,
            description: design.descriptionAr,
            category: design.categoryEn,
            material: MATERIALS[design.material].label,
            weight: { '@type': 'QuantitativeValue', value: design.weightGrams, unitCode: 'GRM' },
            brand: { '@id': org },
            offers: {
              '@type': 'Offer',
              price: getReadyPrice(design).toFixed(2),
              priceCurrency: 'EGP',
              availability: 'https://schema.org/MadeToOrder',
              url: `${SITE_URL}/#store`,
            },
          },
        })),
      },
    ],
  };
}
