// "اطبع بس" logo: the Arabic wordmark printed in layers under a 3D-printer nozzle.
// The shape lives in public/brand/etba3bas-logo.svg and is used as a mask, so the color
// comes from the design tokens (--color-brand by default) and follows the theme.
// scripts/generate-icons.mjs renders the favicon and app icons from the same file (rerun it after changes).

export const LOGO_SRC = '/brand/etba3bas-logo.svg';
/** Width / height of the logo's viewBox (1054 × 994). */
export const LOGO_RATIO = 1054 / 994;

export default function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <span
      className={['logo-mark', className].filter(Boolean).join(' ')}
      style={{ width: Math.round(size * LOGO_RATIO), height: size }}
      aria-hidden="true"
    />
  );
}
