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

## Milestone 4 — Coloring ✅ (MVP)
Done:
- 8 built-in palettes (Deep Ocean, Electric, Ember, Monochrome, Aurora, Gold, Ultraviolet, Spectrum).
- Gradient editor: draggable stops (pointer + arrow keys), add/remove, hex input, color picker,
  numeric position. Cyclic gradient.
- Offset, cycle length (number + log slider), gamma, brightness, contrast, hue shift,
  saturation, invert, interior color. All baked into a 2048-entry LUT.
- Instant recolor: the viewer keeps the Float32 smooth-value buffer and recolors it (plus any
  finished tiles of an in-progress render) without recomputing.
- Fixed: a link with `pal=<builtin>` but no `st` now uses that palette's colors.

Verified:
- Unit: 54 tests pass (adds gradient sampling/wrap, adjustments, colorize, palette-by-name).
- Playwright: 6 tests pass, incl. palette change alters pixels while the render status (last
  full render time) stays unchanged → no recompute; keyboard +/R; gradient add/edit/remove.
- Screenshot inspected (Julia −0.8+0.156i with the color panel).

Deployment: PR https://github.com/fcadusims-droid/KESTLER-FRAC-LAB/pull/1 (M1 only) was merged
by the owner; the Deploy workflow succeeded and `https://fcadusims-droid.github.io/KESTLER-FRAC-LAB/`
returned HTTP 200 with `/KESTLER-FRAC-LAB/`-prefixed assets (fetched with curl). M2–M4 are in
PR https://github.com/fcadusims-droid/KESTLER-FRAC-LAB/pull/2 and are not deployed until it merges.

## Milestone 5 — High-resolution PNG export ✅
Done:
- Pipeline: full-width bands rendered in workers (`src/export/band.ts`) → each band colored and
  PNG-filtered (adaptive None/Sub/Up/Average/Paeth per row) in the worker; the row above each
  band is recomputed from global pixel indices so filtering crosses band boundaries exactly →
  main thread streams filtered rows through fflate's streaming `Zlib` (DEFLATE + zlib wrapper,
  as PNG requires) → ~256 KB IDAT chunks with CRC-32 → sink.
- Bounded memory: at most 2 × pool-size bands in flight; no full-image RGBA or value buffer.
- Sinks: `FileSink` (File System Access API, streams to disk) or `MemorySink` (compressed
  chunks folded into Blobs, downloaded at the end).
- UI: presets 1920×1080 / 3840×2160 / 7680×4320 / 15360×8640 + custom (integers 1..32768,
  ≤ 400 MP, invalid input disables export — never silently changed), pixel count, working
  memory, output path, rough time (from the last full render), large-size warning when no
  streaming path, aspect-ratio note, progress %, cancel, errors, final size/time.
- Project JSON embedded in a `tEXt` chunk (keyword `FractalLab`, ASCII-escaped).
- `scripts/big-export.mjs`, `scripts/verify-png.ts`: reproducible large-export measurements.

Verified:
- Unit: 83 tests (PNG 257×129, 1×1, 33×65, 500×3 in various band sizes decode with fast-png and
  match a direct render pixel-for-pixel; band size doesn't change IDAT data; CRCs checked with
  node:zlib; exporter via worker pool matches direct render; cancel aborts sink and stops work;
  bounded in-flight bands; project JSON round-trip and strict rejection).
- Playwright: Blob/download path (257×129) and streaming path (300×211, mocked
  `showSaveFilePicker` writer) each produce PNGs identical to a Node direct render; embedded
  tEXt parses; invalid custom sizes disable export.
- Large exports actually run (headless Chromium 141, 4 vCPU → 3 workers, view
  Mandelbrot −0.7436…+0.1318i span 0.003, 1000 iterations, level 6):

  | Size | Path | Time | File | Peak Chrome RSS (all processes, baseline ~780 MB) |
  |---|---|---|---|---|
  | 1920×1080 | download | 0.9 s | 1.5 MB | +34 MB |
  | 7680×4320 | download | 7.6 s | 17.9 MB | +237 MB |
  | 15360×8640 | download | 22.9 s | 61.8 MB | +257 MB |
  | 15360×8640 | stream (mock writer) | 20.8 s | 61.8 MB (same bytes) | +241 MB |

  8K and 16K files were decoded in Node (fast-png) and 45 / 41 sampled rows compared
  pixel-for-pixel with a direct render: 0 mismatches.

Not verified: the native save dialog + real `FileSystemWritableFileStream` (cannot be driven
headless; the streaming code path was exercised with a mock writer). Firefox/Safari untested.

## Milestone 6 — Projects & presets ✅
Done:
- Versioned project JSON `{ "version": 1, "app": "fractal-lab", formula, julia, view, iterations,
  escapeRadius, palette, color, exportSize }` (`src/project/project.ts`); strict validation
  (`src/project/validate.ts`): unknown fields/versions, wrong types, out-of-range values and
  malformed colors are rejected with a path-specific message; only `JSON.parse`, never eval.
- Save project (.json download) / Open project (.json, or a PNG exported with embedded tEXt).
- localStorage: auto-saved last session (restored when the URL has no hash) and named user
  presets (save/replace, load, delete). UI states it is per-browser, not cloud sync.
- Julia presets (6 constants from the spec) in the formula panel.
- Burning Ship: rendered as the mirror image of the classic `(|Re z| + i|Im z|)² + c`
  (i.e. `(|Re z| − i|Im z|)² + c`) so the ship is upright with Im pointing up; stated in the UI.

Verified:
- Unit: 89 tests (adds storage round-trip/corrupt data/quota failure, PNG tEXt reader, Burning
  Ship mirror equivalence with the classic form).
- Playwright: 12 tests (adds project save → parse; malformed and unsupported-version files show
  messages and leave state untouched; opening a project applies it; presets + autosave survive a
  reload; re-opening an exported PNG restores its project).
- Screenshots of Burning Ship inspected (upright after the change).

## Next
Milestone 7 — hardening: performance measurements, UI polish/accessibility, README/DEPLOYMENT.

## Known issues
- None yet.
