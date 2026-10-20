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

## Milestone 7 — Hardening ✅
Done:
- Playwright smoke tests run in CI (`ci.yml`), 13 tests.
- Performance: `scripts/bench.ts` (1 thread, core) and `scripts/bench-browser.mjs` (app, full
  render with workers); results in README. Split the Burning Ship loop out of the shared loop
  (~25% faster for it); a per-formula tile loop was tried and dropped (no measurable gain).
- UI: removed `aria-live` from the constantly-updating overlay (would flood screen readers);
  precision warning keeps `role=alert`; control help line; compact overlay on narrow screens;
  mobile layout checked by screenshot (Pixel 7 emulation).
- README.md and DEPLOYMENT.md complete.

Verified: 89 unit + 13 Playwright tests pass; lint/typecheck/build pass; benchmark numbers
in README measured in this container (headless Chromium 141, 4 vCPU).

## Milestone 8 — WebGPU float32 preview backend ✅ (correctness verified on a software adapter only)
Done:
- `src/render/gpu/shader.wgsl.ts`: WGSL compute shader with the same semantics as the CPU core
  (escape check, smooth value, INTERIOR, cardioid/bulb, exact periodicity, mirrored Burning Ship).
- `src/render/gpu/webgpu.ts`: feature detection (`navigator.gpu` → adapter → device → shader
  compile check), chunked dispatches (≤256k px each) with stale-id cancellation between chunks,
  readback into the same Float32 smooth-value buffer the CPU path produces; device-loss handling.
- `src/core/float32.ts`: float32 usable while pixel / |coordinate| ≥ 2e-5.
- Viewer chooses the backend from the full-res frame; falls back to CPU float64 when too deep,
  device lost, or canvas exceeds `maxStorageBufferBindingSize`; overlay shows the active backend
  and the fallback reason. Checkbox to disable; `?gpu=0` URL switch. Exports always CPU float64.

Verified:
- Unit: 90 tests (adds float32 limit).
- Playwright project `chromium-webgpu` (`--enable-unsafe-webgpu`, adapter "google swiftshader"):
  GPU image vs CPU image differ visibly (ΣΔRGB > 24) in 2.6–3.1% of pixels at 130× zoom, all in
  boundary dust; 0.14% at the default Mandelbrot view, 0.33% for Julia −0.8+0.156i (measured by
  a one-off script). Deep zoom switches to "CPU float64 (zoom too deep for float32)" and back.
  The test skips with a reason if no adapter exists (possible on CI runners).

Not verified: any real GPU (correctness or speed). SwiftShader timings are CPU emulation and say
nothing about GPU performance.

## Deployment status
- `main` = M1–M7 (merges of PRs #1, #2, #3). Deployed; verified live with `scripts/verify-live.mjs`
  plus a real 1920×1080 export from the live site (PNG decoded, tEXt present).
- M8 is in https://github.com/fcadusims-droid/KESTLER-FRAC-LAB/pull/4 (pushed after #3 merged).

## Next
All milestones done. Possible follow-ups: deep zoom (perturbation), histogram coloring, orbit
traps, distance estimation, supersampling, float-float GPU arithmetic, off-main-thread DEFLATE.

## Known issues
- None yet.

---

# Fractal Image Studio (experimental feature)

Goal: from a reference image, render an image that reads as the subject from a distance and
is made of calculated Mandelbrot/Julia structure up close. Mandatory checkpoint after S3.

## S1 — Core and analysis ✅
Done (`src/studio/`):
- `oklab.ts` (sRGB↔OKLab, chroma-reducing gamut mapping), `prng.ts` (mulberry32, seed hashing).
- `analysis/analyze.ts` — the only reader of source pixels. Alpha composited over the chosen
  background in linear light; OKLab; per-channel Sobel; per-region descriptor: bounds, mean,
  ≤2 k-means colors (OKLab, k=2, darker first) + proportions, L mean/variance, edge strength
  (ΔE_OK per output px), gradient direction (of the projection onto the colors[0]→colors[1]
  axis, so equal-luminance color edges count), coverage. Values quantized (1e-4 etc.).
- `partition.ts` — fixed grid; quadtree driven only by a `describe(rect)` callback from the
  analysis module (never pixels); exact-coverage checker `regionIdMap`.
- `library/` — seeded library: 96 base patches (half Mandelbrot near the boundary, half Julia
  with c near the Mandelbrot boundary) × 4 exact 90° rotations = 384 candidates. s =
  log(1+smooth escape) normalized by the proxy's 2nd/98th percentiles, interior = 1. Stats on a
  40×40 proxy: mean/std s, interior fraction, density (|s − box3 s|), structure-tensor
  orientation + coherence, median split fraction/direction/strength. Flat rejection includes a
  raw-range test (normalization would otherwise inflate near-constant fields).
- `match.ts`, `colormap.ts`, `render.ts`, `settings.ts` (Fidelity/Detail → parameters),
  `synthetic.ts` (apple, transparent apple, star + checker), `src/export/encodeImage.ts`.
- Minimal refactor: `PngStreamEncoder` no longer uses TS parameter properties, so the export
  code runs under `node --experimental-strip-types`.

Verified: 28 studio unit tests (analysis on hand-built images incl. a 50/50 red/blue cell and
transparency, partition coverage/min/max, library determinism + flat rejection, information
boundary: identical descriptors from different images → identical bytes, render module has no
source access, tiled = untiled for all seam modes, no flat regions, region mean ΔE < 0.05,
matching determinism). Smoke render of the apple at 16 px grid inspected visually.

## S2 — Fixed-grid mosaic, harness, metrics ✅
Done:
- `src/studio/metrics.ts`: OKLab conversion with the same alpha rule as analysis; exact
  area-average downsampling; mean ΔE_OK; SSIM on L (7×7 Gaussian σ=1.5, C1=0.01², C2=0.03²);
  detail (per-cell mean |L − box blur r≈cell/8|, % visible ≥ 0.01, % flat < 0.003); seam ratio
  (mean neighbor ΔE across borders ÷ within cells).
- `src/studio/sheet.ts`: comparison sheet (full / 64 px "distant" / 4× nearest crop) with a
  built-in 5×7 bitmap font.
- `scripts/experiment.ts` (`npm run experiment -- --run <id> --variants … --targets …`):
  writes `<target>-target.png`, `<target>-<variant>.png` + JSON (settings, derived parameters,
  seed, commit, metrics), `<target>-sheet.png`, `summary.json` to
  `artifacts/fractal-image-studio/<run>/` (gitignored).

Run r1-grid (768², seed 1, fixed grids, mean-color mapping only) — see EXPERIMENT_REPORT later.
Observed (images inspected): grid16/32 read as apple/star from a distance; 48/64 become blobs.
Edge cells average two colors into mud (e.g. grey-olive on the star edge). Transparent-apple
background: 65 % near-flat cells (white has no headroom for lightness modulation).
Metric caveats found: fidelity at one sample per cell is trivially ≈0 for a grid (cell means are
matched by construction); SSIM at 128 px is not monotonic in cell size (texture leaks into it).

Verified: 6 metric unit tests (SSIM identity/ordering, exact fractional box filter, ΔE, detail,
seam ratio, alpha compositing); full suite, lint, typecheck, build pass.
