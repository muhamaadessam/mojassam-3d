// Single source of truth for SEO / AEO / GEO metadata. Safe for server and client.
import { getReadyPrice, orderTotal, publicCatalog, type Pricing } from './catalog';

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://etba3-bas.muhammadessam.me').replace(/\/$/, '');
export const SITE_NAME = 'Etba3 Bas';
export const SITE_NAME_AR = 'اطبع بس';

export const SITE_TITLE_AR = 'معاينة ملفات 3D وحساب تكلفة الطباعة ثلاثية الأبعاد | اطبع بس';
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

/** FAQ answers quote the live prices, so they are built from the current pricing. */
export function getFaq(pricing: Pricing) {
  const { materials, colors } = publicCatalog(pricing);
  const ratesAr = materials.map((material) => `${material.label} ${material.rate} ج.م`).join('، ');
  const ratesEn = materials.map((material) => `${material.label} ${material.rate} EGP`).join(', ');
  const namesAr = materials.map((material) => material.label).join(' و');
  const namesEn = materials.map((material) => material.label).join(', ');
  const colorsAr = colors.map((color) => color.ar).join(' و');
  const colorsEn = colors.map((color) => color.en.toLowerCase()).join(', ');
  const hourly = pricing.machineHourlyRate;
  return {
  ar: [
    { q: 'إيه هو اطبع بس؟', a: 'اطبع بس أداة في المتصفح بتخليك ترفع ملف 3D، تعاينه وتتحرك حواليه، تراجع أبعاده، وتاخد تقديرًا مبدئيًا لتكلفة الطباعة ثلاثية الأبعاد قبل ما تطلب.' },
    { q: 'إيه صيغ الملفات المدعومة؟', a: 'بندعم ملفات STL وOBJ و3MF بحجم يصل إلى 50 ميجابايت.' },
    { q: 'هل ملفي بيترفع على سيرفر؟', a: 'لا. الملف بيتقرا ويتعرض محليًا على جهازك داخل المتصفح، ومش بيترفع ولا بيتحفظ على أي سيرفر.' },
    { q: 'إزاي بيتحسب سعر الطباعة 3D؟', a: `السعر المبدئي = وزن الخامة بالجرام × سعر الجرام (${ratesAr}) + ساعات تشغيل الماكينة × ${hourly} ج.م للساعة. الوزن بيتحسب من حجم المجسم ونسبة الحشو (Infill).` },
    { q: 'إيه الخامات المتاحة للطباعة؟', a: `متاح حاليًا ${namesAr}، بألوان منها ${colorsAr}.` },
    { q: 'هل السعر نهائي؟', a: 'لا، ده تقدير مبدئي واضح للمساعدة في القرار. السعر النهائي ممكن يختلف بعد مراجعة الملف وإعدادات التقطيع (Slicing).' },
  ],
  en: [
    { q: 'What is Etba3 Bas (اطبع بس)?', a: 'Etba3 Bas is a browser tool that lets you upload a 3D file, orbit around it, check its dimensions, and get a preliminary 3D-printing cost estimate before you order.' },
    { q: 'Which file formats are supported?', a: 'STL, OBJ, and 3MF files up to 50 MB.' },
    { q: 'Is my file uploaded to a server?', a: 'No. The file is read and rendered locally in your browser and is never uploaded or stored on a server.' },
    { q: 'How is the 3D-printing price calculated?', a: `Preliminary price = material weight in grams × price per gram (${ratesEn}) + machine hours × ${hourly} EGP per hour. Weight is derived from the model volume and infill percentage.` },
    { q: 'Which materials can I print with?', a: `${namesEn}, in colors including ${colorsEn}.` },
    { q: 'Is the price final?', a: 'No. It is a clearly labeled preliminary estimate. The final price may change after the file and slicer settings are reviewed.' },
  ],
  };
}

/** JSON-LD graph for the home page: organization, site, app, FAQ, and ready-design products. */
export function homeJsonLd(pricing: Pricing) {
  const { designs, materials } = publicCatalog(pricing);
  const FAQ = getFaq(pricing);
  const org = `${SITE_URL}/#organization`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': org,
        name: SITE_NAME_AR,
        alternateName: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/brand/etba3bas-logo.png`,
        areaServed: { '@type': 'Country', name: 'Egypt' },
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME_AR,
        alternateName: SITE_NAME,
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
        itemListElement: designs.map((design, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          item: {
            '@type': 'Product',
            name: design.nameAr,
            alternateName: design.nameEn,
            description: design.descriptionAr,
            category: design.categoryEn,
            material: materials.find((material) => material.id === design.material)?.label,
            weight: { '@type': 'QuantitativeValue', value: design.weightGrams, unitCode: 'GRM' },
            brand: { '@id': org },
            offers: {
              '@type': 'Offer',
              price: orderTotal(pricing, getReadyPrice(design, pricing)).toFixed(2),
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
