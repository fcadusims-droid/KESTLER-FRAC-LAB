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

## Next
Milestone 2 — math core + unit tests.

## Known issues
- None yet.
