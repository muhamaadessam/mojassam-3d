// Regenerates every favicon/app icon from the "print layers" mark.
// Run: node scripts/generate-icons.mjs   (sharp ships with Next.js)
// Keep the shapes in sync with components/logo-mark.tsx.
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const NAVY = '#0b1020';
const LIME = '#bef264';
const LIME_SHADE = '#6d8c45'; // lime at 55% over navy, same as the component's right face
const BLUE = '#7dd3fc';

/**
 * @param {object} options
 * @param {'rounded'|'square'|'none'} options.background
 * @param {number} [options.scale]   shrink the mark around its center (for maskable safe zones)
 * @param {boolean} [options.small]  simplified version that stays readable at 16px
 */
function markSvg({ background, scale = 1, small = false }) {
  const offsets = small ? [4, 11, 18] : [3, 8, 13, 18, 23];
  const stroke = small ? 5 : 3.2;
  const layers = (from, to, color) => offsets
    .map((o) => `<path d="M${from[0]} ${from[1] + o} L${to[0]} ${to[1] + o}" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round"/>`)
    .join('');
  const cubeTop = small ? 12 : 16; // the small version drops the nozzle and fills the space
  const shift = cubeTop - 16;
  const mark = `<g transform="translate(0 ${shift})">
    <polygon points="32,16 50,26 32,36 14,26" fill="${LIME}"/>
    ${layers([14, 26], [32, 36], LIME)}
    ${layers([32, 36], [50, 26], LIME_SHADE)}
  </g>${small ? '' : `<path d="M32 3 V8" stroke="${BLUE}" stroke-width="3" stroke-linecap="round"/><polygon points="27,8 37,8 32,13" fill="${BLUE}"/>`}`;
  const bg = background === 'rounded' ? `<rect width="64" height="64" rx="14" fill="${NAVY}"/>`
    : background === 'square' ? `<rect width="64" height="64" fill="${NAVY}"/>` : '';
  const centerY = small ? 30 : 31;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">${bg}
  <g transform="translate(32 32) scale(${scale}) translate(-32 -${centerY})">${mark}</g></svg>`;
}

const png = (svg, size) => sharp(Buffer.from(svg), { density: Math.max(72, (size / 64) * 72 * 2) }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();

/** Packs PNG images into a .ico file (PNG-compressed entries, supported by every current browser). */
function ico(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

const rounded = markSvg({ background: 'rounded' });
await mkdir('public/icons', { recursive: true });
await mkdir('public/brand', { recursive: true });

const outputs = {
  // Browser tab: SVG for modern browsers, .ico for everything else.
  'app/icon.svg': rounded,
  'public/brand/mojassam-icon.svg': rounded,
  'public/brand/mojassam-mark.svg': markSvg({ background: 'none' }),
  // iOS home screen: full-bleed square, iOS rounds the corners itself.
  'app/apple-icon.png': await png(markSvg({ background: 'square', scale: 0.8 }), 180),
  // Android / installed app (see app/manifest.ts).
  'public/icons/icon-192.png': await png(rounded, 192),
  'public/icons/icon-512.png': await png(rounded, 512),
  // Maskable icons get cropped to circles/squircles: keep the mark inside the central 80%.
  'public/icons/icon-maskable-512.png': await png(markSvg({ background: 'square', scale: 0.62 }), 512),
  'app/favicon.ico': ico([
    { size: 16, data: await png(markSvg({ background: 'rounded', small: true }), 16) },
    { size: 32, data: await png(markSvg({ background: 'rounded', small: true }), 32) },
    { size: 48, data: await png(rounded, 48) },
  ]),
};

for (const [path, content] of Object.entries(outputs)) {
  await writeFile(path, content);
  console.log('wrote', path);
}
