import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { DEFAULT_PRICING, findDesign, getReadyPrice, orderTotal } from '@/lib/catalog';

export const alt = 'Mojassam 3D — Preview 3D files and estimate print cost';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const C = { page: '#0b1020', surface: '#121b30', border: 'rgba(148,163,184,.18)', brand: '#bef264', info: '#7dd3fc', text: '#e2e8f0', muted: '#94a3b8' };

const font = (weight: 500 | 700 | 800) => readFile(join(process.cwd(), `assets/fonts/inter-latin-${weight}-normal.woff`));

// Latin text only: Inter (OFL, assets/fonts) has no Arabic glyphs.
export default async function OpenGraphImage() {
  const [medium, bold, extraBold] = await Promise.all([font(500), font(700), font(800)]);
  const mark = `data:image/svg+xml;base64,${(await readFile(join(process.cwd(), 'public/brand/mojassam-mark.svg'))).toString('base64')}`;
  // Rendered at build time, so it shows the default catalog rather than live admin prices.
  const sample = findDesign(DEFAULT_PRICING, 'wave-vase')!;
  const samplePrice = Math.round(orderTotal(DEFAULT_PRICING, getReadyPrice(sample, DEFAULT_PRICING))).toLocaleString('en-US');
  const sampleMaterial = DEFAULT_PRICING.materials.find((material) => material.id === sample.material)!;

  const chip = (label: string, color = C.text) => (
    <div style={{ display: 'flex', padding: '10px 18px', borderRadius: 999, border: `1.5px solid ${C.border}`, background: 'rgba(18,27,48,.8)', color, fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{label}</div>
  );

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: C.page, color: C.text, fontFamily: 'Inter', position: 'relative' }}>
        {/* Print-bed grid + glow */}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', backgroundImage: 'linear-gradient(rgba(148,163,184,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,.07) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div style={{ position: 'absolute', right: -120, top: 40, width: 640, height: 640, display: 'flex', borderRadius: 999, background: 'radial-gradient(circle, rgba(190,242,100,.22) 0%, rgba(125,211,252,.08) 45%, rgba(11,16,32,0) 70%)' }} />

        {/* Left: message */}
        <div style={{ width: 700, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '64px 0 60px 72px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 76, height: 76, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 20, background: C.surface, border: `1.5px solid ${C.border}` }}>
              <img src={mark} width={60} height={60} alt="" />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>Mojassam<span style={{ color: C.brand, marginLeft: 10 }}>3D</span></div>
              <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: 4, color: C.muted }}>PREVIEW · PRICE · PRINT</div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2 }}>Preview your 3D file.</div>
            <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, color: C.brand }}>Know the cost</div>
            <div style={{ fontSize: 62, fontWeight: 800, lineHeight: 1.08, letterSpacing: -2, color: C.brand }}>before printing.</div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            {chip('STL')}{chip('OBJ')}{chip('3MF')}{chip('PLA · PETG', C.info)}
          </div>
        </div>

        {/* Right: product visual */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingRight: 64, position: 'relative' }}>
          <img src={mark} width={330} height={330} alt="" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 18, padding: '18px 24px', width: 400, borderRadius: 20, background: 'rgba(18,27,48,.92)', border: `1.5px solid ${C.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, fontWeight: 700, letterSpacing: 2, color: C.muted }}>
              <span>ESTIMATE</span><span style={{ color: C.info }}>{sampleMaterial.label} · {sample.weightGrams} g</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap' }}>{sample.nameEn}</span>
              <span style={{ fontSize: 32, fontWeight: 800, color: C.brand, whiteSpace: 'nowrap' }}>{samplePrice} EGP</span>
            </div>
          </div>
        </div>

        <div style={{ position: 'absolute', left: 72, right: 64, bottom: 22, display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 500, color: C.muted }}>
          <span>Files stay on your device</span>
          <span>mojassam3d.muhammadessam.me</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: medium, weight: 500, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
        { name: 'Inter', data: extraBold, weight: 800, style: 'normal' },
      ],
    },
  );
}
