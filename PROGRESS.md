# Progress

## Milestone 1 — Scaffold + CI + deploy pipeline ✅
Done:
- Vite + React + TS strict scaffold, ESLint, Vitest, Playwright config.
- Basic single-thread Mandelbrot placeholder in `src/ui/App.tsx` (to be replaced in M3).
- `.github/workflows/ci.yml` (typecheck, lint, unit, build, Playwright) and
  `.github/workflows/deploy.yml` (official Pages flow, `VITE_BASE` from `configure-pages`).
- `vite.config.ts` reads `VITE_BASE` (default `/`).

Verified (locally, Node 22.22.0):
- `npm run build`, `npm test`, `npm run lint` pass.
- `VITE_BASE=/fractal-lab/ vite build` emits `/fractal-lab/`-prefixed asset URLs.
- Playwright smoke test passes against `vite preview` under `/fractal-lab/`
  (local Chromium 141 via `PW_CHROMIUM_PATH`).

Not verified:
- Workflows have not run on GitHub yet. Pages not enabled (gh CLI not authenticated) — see `DEPLOYMENT.md`.

## Milestone 2 — Math core + tests ✅
Done:
- `src/core/view.ts`: `View` (cx, cy, span across min(W,H)) ↔ `Frame` (cx, cy, scale, W, H),
  spec pixel mapping (y up, global indices), cursor-anchored `zoomAt`, `pan`, `zoomLevel`.
- `src/core/formulas/`: Mandelbrot (cardioid + period-2 bulb checks, exact-repeat
  periodicity check), Julia, Burning Ship; smooth value `n + 1 - log2(ln|z|)` clamped ≥ 0,
  `INTERIOR = -1` sentinel; `renderTileFloat64`; Julia presets; per-formula default views.
- `src/core/iterations.ts`: auto iterations from zoom depth; fixed values clamped 10..100000.
- `src/core/precision.ts`: `PrecisionBackend` extension point (one backend: `cpu-f64`),
  float64 limit diagnostic (`scale / max(|cx|,|cy|,1e-300) < 1e-14`).

Verified: `npm test` — 37 tests pass (known points, Julia, iteration limit, smooth
continuity/monotonicity along a ray, boundary bisection, mapping, aspect, anchored zoom,
pan, tiled vs full byte-identical for 3 formulas, precision). Lint and build pass.

## Milestone 3 — Workers + interaction ✅
Done:
- `src/render/pool.ts`: fixed-size `WorkerPool` (size = clamp(hardwareConcurrency − 1, 1, 8)),
  one task per worker, FIFO queue, group-based cancellation of queued tasks.
- `src/render/scheduler.ts`: `RenderScheduler` with incrementing render ids; a new render
  cancels queued tiles of older renders and discards stale in-flight results; superseded → null.
- `src/render/workers/render.worker.ts` (module worker via `new URL(..., import.meta.url)`),
  `handler.ts` shared with tests; results transferred as `ArrayBuffer`.
- `src/ui/viewer.ts`: canvas at devicePixelRatio; reprojection of the last image during
  interaction; low-res preview (~120k px) during input, full-res progressive tiles (center-out)
  180 ms after input settles; wheel zoom at cursor, drag pan, pinch zoom, double-click zoom,
  keyboard (arrows, +/-, R). Main thread only colorizes; it never iterates.
- Info overlay (center, zoom vs default view, iterations, backend, render time, precision warning).
- URL hash encodes the full state (`src/project/hash.ts`), validated on load; `hashchange` handled.
- Color core (`src/core/color/`) — palettes, LUT, adjustments, colorize — used for display.

Verified:
- Unit: 44 tests pass (adds scheduler: identical values vs direct render, stale discard,
  cancellation stops queued work; hash round-trip/rejection).
- Playwright (Chromium 141, subpath `/fractal-lab/`): loads with no console errors, worker URLs
  are under `/fractal-lab/`, canvas non-blank, wheel zoom changes the image and the hash, a
  shared link restores the view. Screenshots inspected manually (default and 5e4× zoom).

Not verified: pinch zoom on a real touch device; keyboard shortcuts (no automated test yet).

## Next
Milestone 4 — coloring UI (palette picker, gradient editor, adjustments) → MVP.

## Known issues
- None yet.
