// Regenerates every favicon/app icon from the "اطبع بس" logo (public/brand/etba3bas-logo.svg).
// Run: npm run icons   (sharp ships with Next.js)
// The header uses the same file through components/logo-mark.tsx.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const NAVY = '#0b1020';
const LIME = '#bef264';

const source = await readFile('public/brand/etba3bas-logo.svg', 'utf8');
const [vx, vy, vw, vh] = source.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const pathData = source.match(/ d="([^"]+)"/)[1];

/**
 * The logo centered on a 64px tile.
 * @param {object} options
 * @param {'rounded'|'square'|'none'} options.background
 * @param {number} [options.scale]  share of the tile the logo may fill (smaller for maskable safe zones)
 */
function markSvg({ background, scale = 0.84 }) {
  const fit = (64 * scale) / Math.max(vw, vh);
  const x = (64 - vw * fit) / 2 - vx * fit;
  const y = (64 - vh * fit) / 2 - vy * fit;
  const bg = background === 'rounded' ? `<rect width="64" height="64" rx="14" fill="${NAVY}"/>`
    : background === 'square' ? `<rect width="64" height="64" fill="${NAVY}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">${bg}<path transform="translate(${x.toFixed(2)} ${y.toFixed(2)}) scale(${fit.toFixed(5)})" fill="${LIME}" fill-rule="evenodd" d="${pathData}"/></svg>`;
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

const outputs = {
  // Browser tab: SVG for modern browsers, .ico for everything else.
  'app/icon.svg': rounded,
  // iOS home screen: full-bleed square, iOS rounds the corners itself.
  'app/apple-icon.png': await png(markSvg({ background: 'square', scale: 0.72 }), 180),
  // Android / installed app (see app/manifest.ts).
  'public/icons/icon-192.png': await png(rounded, 192),
  'public/icons/icon-512.png': await png(rounded, 512),
  // Maskable icons get cropped to circles/squircles: keep the logo inside the central 80%.
  'public/icons/icon-maskable-512.png': await png(markSvg({ background: 'square', scale: 0.6 }), 512),
  'app/favicon.ico': ico([
    { size: 16, data: await png(markSvg({ background: 'rounded', scale: 0.92 }), 16) },
    { size: 32, data: await png(markSvg({ background: 'rounded', scale: 0.92 }), 32) },
    { size: 48, data: await png(rounded, 48) },
  ]),
  // Logo on navy for search engines and link previews (JSON-LD "logo").
  'public/brand/etba3bas-logo.png': await png(markSvg({ background: 'square', scale: 0.8 }), 512),
};

for (const [path, content] of Object.entries(outputs)) {
  await writeFile(path, content);
  console.log('wrote', path);
}
