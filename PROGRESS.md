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

## Next
Milestone 3 — workers + interaction.

## Known issues
- None yet.
