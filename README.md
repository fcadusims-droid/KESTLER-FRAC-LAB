# Fractal Lab

A browser fractal explorer and high-resolution PNG exporter, hosted on GitHub Pages:
**https://fcadusims-droid.github.io/KESTLER-FRAC-LAB/**

It is a static site. Every pixel is computed in **your browser**, in Web Workers, in
float64 on the CPU. Nothing is computed on a server, and no image is ever pre-rendered or
upscaled.

## Features

- **Formulas**: Mandelbrot (with cardioid / period-2 bulb shortcuts and exact periodicity
  detection), Julia (editable constant plus 6 presets) and Burning Ship. The Burning Ship is
  drawn as the mirror image of the classic `(|Re z| + i|Im z|)² + c`, so the ship appears
  upright with the imaginary axis pointing up.
- **Smooth coloring**: `n + 1 − log2(ln|z|)`. The escape radius defaults to 256 and can be changed.
- **Iterations**: fixed (10–100 000) or *auto*, which grows with zoom depth (200 at 1×, capped at 20 000).
- **Interactive canvas**:
  - renders at `devicePixelRatio` resolution
  - wheel zoom anchored at the cursor, drag to pan, pinch zoom, double-click zoom (Shift to zoom out)
  - keyboard on the canvas: arrows pan, `+`/`−` zoom, `R` resets
  - shows a low-res preview while you interact, then full-resolution tiles once you stop
- **Info overlay**: center, zoom relative to the default view, iterations, backend, render
  time, and a warning when the view reaches the limit of double precision.
- **Shareable links**: the whole state (view, formula, iterations, palette, color settings,
  export size) is kept in the URL hash.
- **Coloring**: 8 built-in palettes (Deep Ocean, Electric, Ember, Monochrome, Aurora, Gold,
  Ultraviolet, Spectrum).
  - Gradient editor: drag stops, add/remove, hex input, color picker.
  - Adjustments: offset, cycle length, gamma, brightness, contrast, hue shift, saturation,
    invert and interior color.
  - Changing colors recolors the stored smooth-iteration buffer instantly, without recomputing.
- **PNG export**:
  - presets 1920×1080, 3840×2160, 7680×4320, 15360×8640, plus custom sizes (1–32768 per
    side, at most 400 MP)
  - the image is rendered in bands by the workers and streamed through DEFLATE
  - writes straight to disk where the File System Access API exists (Chrome/Edge on
    desktop); other browsers download the file at the end
  - shows progress, a cancel button, estimates beforehand and the final size and time
  - can embed the project in a PNG `tEXt` chunk, so a render can be reproduced
- **Projects**: versioned JSON (`"version": 1`) that you can save and open. Opening a PNG
  exported with embedded settings also works. Files are validated strictly: unknown versions,
  unknown fields and malformed values are rejected with a message, and content is never
  evaluated.
- **Auto-save and presets** are stored in *this browser only* (localStorage). They are not
  synced to any cloud, and clearing site data deletes them. Use *Save project* to keep a file.

## How it works

```
src/core/      pure math, no React/DOM: view mapping, formulas, iterations, precision, color
src/render/    worker pool, render scheduler (render IDs, stale discard, cancel), tiles, worker entry
src/export/    PNG filter, streaming encoder (fflate Zlib → IDAT + CRC-32), band renderer, sinks, exporter
src/project/   app state, URL hash, project JSON + strict validation, localStorage, PNG tEXt reader
src/ui/        React components and the imperative canvas controller (viewer.ts)
```

- **Pixel mapping**: pixel `(px, py)` maps to `cx + (px + 0.5 − W/2)·scale` and
  `cy − (py + 0.5 − H/2)·scale` (y up). It is always computed from global integer pixel
  indices, so tiled, banded and full renders are byte-identical. Unit tests check this.
- **Workers**: the pool has `hardwareConcurrency − 1` workers (between 1 and 8).
  - Each render gets an incrementing ID. Starting a new render cancels the queued tiles of the
    old one and discards its stale results.
  - Data moves between threads as transferable `ArrayBuffer`s. `SharedArrayBuffer` is not
    used, because GitHub Pages cannot send the COOP/COEP headers it requires.
- **Export**:
  - Workers render full-width bands. They also recompute the row above each band, so PNG
    filtering stays correct across band boundaries.
  - Each band is colored and PNG-filtered (adaptive per row) inside the worker.
  - The main thread compresses the rows in order and writes ~256 KB IDAT chunks.
  - At most 2 × pool-size bands are in flight, so the full image is never held in memory.

## Performance (measured)

Headless Chromium 141 on a 4-vCPU Linux container (3 workers), 1280×720 canvas,
median of 3 runs. Reproduce with `scripts/bench.ts` and `scripts/bench-browser.mjs`.

| View | Iterations | 1 thread (Node, core only) | App, 3 workers (full render) |
|---|---|---|---|
| Mandelbrot default | 200 | ~50 ms | 69 ms |
| Seahorse valley, 5·10⁴× | 1252 | ~420 ms | 200 ms |
| Mandelbrot, 10¹⁰× | 4000 | ~3.1 s | 1125 ms |
| Julia −0.8+0.156i | 200 | ~80 ms | 95 ms |
| Burning Ship default | 200 | ~170 ms | 102 ms |

Large exports in the same environment (Mandelbrot, 1000 iterations). The 8K and 16K files
were decoded in Node, and sampled rows matched a direct render exactly:

| Size | Output path | Time | File size | Peak browser memory increase |
|---|---|---|---|---|
| 7680×4320 | download | 7.6 s | 17.9 MB | +237 MB |
| 15360×8640 | download | 22.9 s | 61.8 MB | +257 MB |
| 15360×8640 | stream (mock file writer) | 20.8 s | 61.8 MB | +241 MB |

Your times will differ with CPU, core count, browser and view.

## Limitations

- **No deep zoom.** Coordinates are float64. Beyond roughly 10¹³–10¹⁴× (when pixel size
  divided by coordinate magnitude falls below 1e-14), neighbouring pixels can no longer be told
  apart. The image breaks into blocks and the overlay shows a warning. Perturbation theory or
  arbitrary precision would fix this. The `PrecisionBackend` interface in
  `src/core/precision.ts` is where such a backend would plug in.
- **CPU only.** No GPU backend exists.
- **No antialiasing / supersampling** in previews or exports yet.
- **Compression runs on the main thread** during export. The page stays usable, but
  interaction can stutter briefly while a band is being compressed.
- **Very large exports depend on the browser.** Without the File System Access API
  (Firefox, Safari, mobile), the compressed PNG has to fit in memory. The UI warns at
  7680×4320 and above.
- **Cross-browser determinism**: the export test checks that Chromium's output matches Node
  (both V8). Other engines may differ in the last bit of `Math.log`, so colors could differ by
  one LUT step in rare pixels.
- **Not tested**: Firefox, Safari, real touch devices, and the native save dialog (the
  streaming path was tested with a mock writer).

## Future work

Deep zoom via perturbation theory (with series approximation) or arbitrary precision;
histogram-equalized coloring; orbit traps; distance-estimation shading; supersampling;
a WebGPU float32 preview backend that falls back to the CPU at depths where float32 fails;
moving compression off the main thread.

## Development

Requires Node.js 24 (Active LTS, see `.nvmrc`). Node 22.12+ also works.

```sh
npm ci
npm run dev        # dev server at http://localhost:5173/
npm run typecheck
npm run lint
npm test           # unit tests (Vitest, Node)
npm run build      # typecheck + production build into dist/
npm run test:e2e   # Playwright smoke tests against a /fractal-lab/ subpath build
```

If Playwright's bundled Chromium is not installed, point it at an existing one:
`PW_CHROMIUM_PATH=/path/to/chrome npm run test:e2e`.

Measurement scripts (need a running `vite preview`):

```sh
node --experimental-strip-types scripts/bench.ts
node scripts/bench-browser.mjs http://localhost:4173/fractal-lab/
node scripts/big-export.mjs http://localhost:4173/fractal-lab/ 15360 8640 memory out.png
node --experimental-strip-types scripts/verify-png.ts out.png '#f=mandelbrot&…' 211
node scripts/verify-live.mjs https://fcadusims-droid.github.io/KESTLER-FRAC-LAB/
```

## Deployment

GitHub Pages via GitHub Actions. See [`DEPLOYMENT.md`](DEPLOYMENT.md).
