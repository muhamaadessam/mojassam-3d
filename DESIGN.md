# Etba3 Bas (اطبع بس) visual direction

THESIS: The interface is a workbench for inspecting a physical object, not a marketing page; the 3D canvas owns the first viewport.
OWN-WORLD: Midnight navy surfaces, measured lime calibration marks, cool blue light, thin technical dividers, and compact Arabic controls.
STORY: The visitor sees the empty workbench, drops a file, orbits the model, then reads dimensions and a preliminary estimate beside it.
FIRST VIEWPORT: A large live WebGL stage fills the left side while the right rail holds the upload action, model facts, and estimate.
FORM: Operate / workbench split view; original composition with a deliberately quiet empty canvas and one high-contrast upload action.

## Durable rules

- Use dark navy as the physical scene for a designer working under a dim desk lamp; lime is reserved for action, readiness, and selected controls.
- Keep the 3D stage visually dominant. The control rail is dense but short, with one task per section.
- Use system sans typography and Arabic-first copy; technical formats and units can remain Latin.
- Motion belongs to the model and camera: orbit, damping, auto-rotate, and fit-to-view. UI motion stays minimal.
- Every estimate must be labeled preliminary and must not imply slicer accuracy.

## Logo

The logo is the Arabic wordmark "اطبع بس" printed in stacked layers under a 3D-printer nozzle. The master vector is `public/brand/etba3bas-logo.svg`; `components/logo-mark.tsx` uses it as a CSS mask tinted with `--color-brand`, so it always follows the theme. It is the wordmark, so the header shows it alone with no extra name text. Run `npm run icons` after changing it to regenerate the favicon, app icons, and `public/brand/etba3bas-logo.png`.

## Theme editing

All color decisions live in `app/design-tokens.css`. Change the semantic tokens there first; both the UI and the WebGL scene read from the same CSS variables. Keep component CSS on semantic names such as `--color-brand`, `--color-surface`, and `--color-text-muted`, not raw hex values.

- `--color-brand`: primary action, selected state, and PLA preview.
- `--color-info`: PETG preview and cool scene light.
- `--color-page` / `--color-canvas`: app background and 3D stage.
- `--color-surface` / `--color-surface-raised`: panels and controls.
- `--color-text-*` / `--color-border*`: text hierarchy and dividers.
- `--color-danger*`: file parsing and validation errors.
