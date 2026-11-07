// Mojassam 3D mark: a cube built from print layers, with the nozzle above it.
// Drawn on a 64px grid; colors come from the design tokens so it follows the theme.
// Keep in sync with scripts/generate-icons.mjs, which renders the favicon and app icons (rerun it after changes).

const LAYER_OFFSETS = [3, 8, 13, 18, 23];

export default function LogoMark({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
      <polygon points="32,16 50,26 32,36 14,26" fill="var(--color-brand)" />
      <g stroke="var(--color-brand)" strokeWidth="3.2" strokeLinecap="round">
        {LAYER_OFFSETS.map((offset) => <path key={`l${offset}`} d={`M14 ${26 + offset} L32 ${36 + offset}`} />)}
      </g>
      <g stroke="var(--color-brand)" strokeOpacity="0.55" strokeWidth="3.2" strokeLinecap="round">
        {LAYER_OFFSETS.map((offset) => <path key={`r${offset}`} d={`M32 ${36 + offset} L50 ${26 + offset}`} />)}
      </g>
      <path d="M32 3 V8" stroke="var(--color-info)" strokeWidth="3" strokeLinecap="round" />
      <polygon points="27,8 37,8 32,13" fill="var(--color-info)" />
    </svg>
  );
}
