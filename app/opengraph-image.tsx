import { ImageResponse } from 'next/og';

export const alt = 'Mojassam 3D — Preview 3D files and estimate print cost';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Latin text only: the bundled OG font has no Arabic shaping.
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#0b1020', color: '#f4f6f0', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#b5f23d' }} />
          <div style={{ fontSize: 40, fontWeight: 800 }}>Mojassam 3D</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>Preview your 3D file.</div>
          <div style={{ fontSize: 72, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2, color: '#b5f23d' }}>Know the cost before printing.</div>
        </div>
        <div style={{ fontSize: 28, color: '#9aa3b8' }}>STL · OBJ · 3MF · PLA & PETG · Files stay on your device</div>
      </div>
    ),
    size,
  );
}
