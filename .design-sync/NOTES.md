# NHCX design-sync notes

- **No TypeScript in this repo** (no `tsconfig.json`, plain `.jsx`). Prop contracts (`.d.ts`) are synthesized from the plain JS source, not extracted from real types — weaker than a typed DS. Added JSDoc blocks (with `@category`) above each of the 11 `Common.jsx` exports specifically to compensate: this is the main lever for prompt/grouping quality here, since there's no `.d.ts` and no docs directory to draw from.
- **Not a real component-library package.** `nhcx_cli` is the full hospital-claims app; `src/components/Common.jsx` is its shared component set, not a published package with its own `dist/`. Rather than let the converter's automatic synth-entry fallback scan all of `src/components/` (which would pull in page-level components like `Dashboard.jsx`, `WorkQueue.jsx`, `Settings.jsx`, etc.), we hand-author `.design-sync/entry.mjs` as an explicit barrel re-exporting only the 11 reusable components. Same reasoning for `.design-sync/entry.css`: `App.css` is one large file mixing shared component classes (`.card-modern`, `.btn-modern`, etc.) with page-specific CSS (sidebar, dashboard stat cards, work queue, ...) — there was no clean way to import "just the shared classes" without a repo-wide CSS split, so the entry imports all of `App.css` plus `src/styles/design-system.css`; the extra page-specific CSS is inert bulk, not a correctness problem.
- **Fonts (Geist Sans/Mono) are imported at the JS level** (`main.jsx` imports `@fontsource/geist-sans`/`geist-mono` weight CSS directly), not via a CSS `@import` chain reachable from `entry.css`. Wired via `cfg.extraFonts` pointing at the actual `@fontsource` package CSS files instead — resolve any `[FONT_MISSING]` by checking those paths still exist under `node_modules/@fontsource/` (they're real npm packages, so `npm install` recreates them on a fresh clone).
- **`cfg.cssEntry` is copied verbatim by the converter, not bundled** — an `@import`-only file produces an empty `[CSS_PLACEHOLDER]` stub. `.design-sync/entry.css` is therefore a **real concatenation** of `src/styles/design-system.css` + `src/App.css` (generated with `cat`, not an `@import` wrapper). Regenerate it whenever either source file changes:
  ```sh
  { echo "/* Concatenated for claude.ai/design sync... */"; cat src/styles/design-system.css; echo ""; cat src/App.css; } > .design-sync/entry.css
  ```
  `entry.mjs` needs no such regeneration — it's a plain barrel of live `export` statements that stays correct as long as the export list matches `Common.jsx`.

## Sync log

- **2026-07-08**: `Common.jsx` gained two new exports (`LoadingBlock`, `EmptyState`, extracted from page components in commit `044eb07`) — added to `componentSrcMap` and `entry.mjs`'s barrel per the "Re-sync risks" note below. Both have `@category Feedback` JSDoc already. Authored previews for both (`.design-sync/previews/LoadingBlock.tsx`, `EmptyState.tsx`), composed from real call sites in `Payments.jsx`, `WorkQueue.jsx`, and `Settings.jsx` — graded `good` on first pass, no rework needed. Also regenerated `entry.css` (source `App.css`/`design-system.css` had changed via spacing-token commits `589c146`/`26a0dcf` since the last sync) — token/class validation against the fresh build found zero drift in `conventions.md`.

## Known render warns

- **`Card` review capture (`_screenshots/review/layout__Card.png`) reproducibly renders blank** across repeat `package-capture.mjs` runs, while the render-check capture (`_screenshots/layout__Card.png`, from `package-validate.mjs`) always renders it correctly and completely. Root cause: `Card` is the only one of the 11 synced components with a Framer Motion mount transition (`initial={{opacity:0,y:20}} animate={{opacity:1,y:0}}`); the review harness navigates per-cell via `?story=` and screenshots on `networkidle`, which fires before the fade completes, while the render-check's single combined-grid page apparently gives it just enough extra time. Graded `good` (see `.design-sync/.cache/review/Card.grade.json`) based on the render-check screenshot, which is the real, complete, correctly-styled output. Not a defect in the preview or in `Card` itself — a re-sync seeing this same blank capture for `Card` again is expected, not a new regression.

- `validate` reports "1 missing" token (below threshold, non-blocking): `DocumentChecklist` references `var(--cx-font-mono, ui-monospace, monospace)` — a leftover from the Case surface's retired token system, with a safe inline fallback already baked into the `var()` call. Renders correctly as-is; not worth chasing unless `Common.jsx` ever removes the fallback.

## Re-sync risks

- If `Common.jsx` gains or removes an exported component, `componentSrcMap` and `entry.mjs`'s export list both need a matching update — neither is auto-discovered.
- If `App.css` is ever split into shared-vs-page-specific files, `entry.css` should be narrowed to import only the shared file(s).
- The JSDoc `@category` tags are the sole source of component grouping (path-based grouping falls through because `src/components/` is a generic directory name) — removing a JSDoc block silently drops that component to the "general" group.
- Weak/untyped prop contracts mean the design agent sees prop names but not real types or required/optional-ness — worth revisiting if TypeScript is ever added to this repo.
