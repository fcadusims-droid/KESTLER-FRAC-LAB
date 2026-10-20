# Fractal Lab — notes for Claude sessions

Resume from `PROGRESS.md` (milestones, what is verified, what is next).

## Stack
React 19 + TypeScript 6 (strict) + Vite 8, npm (`package-lock.json` committed),
Vitest (unit, Node), Playwright/Chromium (smoke, against `vite preview` under
`/fractal-lab/`). `fflate` for streaming DEFLATE; `fast-png` is a dev-only test decoder.
TypeScript is pinned to 6.0.x because `typescript-eslint` does not support 7.x yet.
Node 24 LTS in CI (`.nvmrc`).

Commands: `npm run dev | build | typecheck | lint | test | test:e2e`.
Locally, if Playwright's bundled Chromium is missing, run e2e with
`PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e` (do not `playwright install`).

## Layout
- `src/core/` — pure math (view mapping, formulas, iterations, precision, color). No React/DOM.
- `src/render/` — worker pool, scheduler (render IDs, stale discard, cancel), tiles, worker entry.
- `src/export/` — streaming PNG encoder, sinks, banded exporter.
- `src/project/` — project JSON schema/validation, URL hash, localStorage.
- `src/ui/` — React components.

## Hard constraints
- Static site on GitHub Pages at `/REPO/` (or `/`). No backend, paid services, external APIs, Electron.
- All computation in the visitor's browser (workers). Never say it runs on GitHub's servers.
- No `SharedArrayBuffer`, no multi-threaded WASM, no coi-serviceworker. Use transferable `ArrayBuffer`s.
- No hard-coded `/` asset paths. Workers: `new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`.
- Never fake output with stored images; never upscale a preview and call it a native render.
- Pixel → complex is always computed from global integer pixel indices
  (`cx + (px + 0.5 - W/2) * scale`, `cy - (py + 0.5 - H/2) * scale`), never accumulated.
- Export never holds the full uncompressed RGBA image or full iteration buffer; never silently changes dimensions.
- Only expose UI controls that actually work.

## Honesty rules
- Report only what was actually run and observed; separate verified (and how) /
  implemented-but-unverified / not implemented.
- Never claim GPU acceleration, deep zoom, 16K export or a live deployment without direct evidence.
- Document limitations of a static browser app instead of papering over them.
