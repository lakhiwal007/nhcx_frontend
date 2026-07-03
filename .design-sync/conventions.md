## NHCX Design System — conventions

No provider or root wrapper is required — components read styling purely from CSS custom properties already in scope once `styles.css` is linked. Mount any component directly; there is no theme context to set up.

### Styling idiom: CSS custom properties + shared utility classes

This is a **token system**, not a utility-class framework like Tailwind. Components read `var(--token-name)` for color/spacing/shape, and a small set of hand-rolled classes (`.card-modern`, `.btn-modern`, `.badge-modern`, `.input-modern`, `.table-modern`) carry the actual visual structure. When composing new layout around these components, reach for the same tokens rather than inventing new colors/spacing:

**Color** — one accent (`--primary`, cobalt blue) plus neutral surfaces and four semantic status tones. Every token has a light-mode value at `:root` and a dark-mode override at `[data-theme="dark"]`:
- `--primary`, `--primary-hover`, `--primary-light`, `--accent` (a lighter tint of primary, used for icon tints)
- `--bg-main` (page background), `--bg-card` (surface/panel background), `--bg-sidebar`
- `--text-main`, `--text-muted`, `--text-white`
- `--border-color`, `--border-hover`
- `--success`, `--warning`, `--error`, `--info` — the four status tones. `StatusBadge` and `DecisionBanner` map domain states onto these; reuse them for any new status/feedback UI rather than picking new colors.

**Shape** — one radius scale, used everywhere, no exceptions: `--radius-xs` (6px, chips/small icon wells), `--radius-sm` (8px, inputs/small buttons), `--radius-md` (10px, buttons/dropdowns), `--radius-lg` (14px, cards/modals — also aliased as `--radius`), `--radius-pill` (999px, badges and pill-shaped controls only).

**Spacing** — a 4px grid: `--space-1` (4px) through `--space-10` (40px).

**Typography** — `--font-sans` (Geist Sans; body text and headings) and `--font-mono` (Geist Mono; use for IDs, amounts, timestamps, and other tabular/data values — this is a deliberate convention in this system, not incidental). Sizes `--text-2xs` (11px) through `--text-4xl` (28px); weights `--fw-regular`/`--fw-medium`/`--fw-semibold`/`--fw-bold`.

**Shadows** — `--shadow-xs`, `--shadow-sm`, `--shadow`, `--shadow-lg`, all tinted (not pure black) for a soft, layered feel.

### Where the truth lives

Read `styles.css` (it `@import`s the token definitions and `_ds_bundle.css`, the compiled component styles) before styling anything new — every token above is defined there verbatim. For a specific component, read `components/<group>/<Name>/<Name>.prompt.md`.

### Data-density convention

This system was built for an operations dashboard (dense tables, status-heavy lists), not a marketing site. Default to compact spacing and information density over generous whitespace; `StatusBadge`/`DecisionBanner` exist specifically so status semantics stay consistent across dense list/table UI rather than inventing ad hoc colored text.

### Build example

```jsx
import { Card, StatusBadge, Button, AmountGrid } from 'nhcx_cli';

function ClaimSummary({ claim }) {
  return (
    <Card
      title={`Claim #${claim.id}`}
      headerAction={<Button variant="outline" size="small">Refresh</Button>}
    >
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
        <StatusBadge status={claim.status} />
      </div>
      <AmountGrid totals={claim.totals} />
    </Card>
  );
}
```
