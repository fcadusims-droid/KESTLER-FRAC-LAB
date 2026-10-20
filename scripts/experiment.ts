// Fractal Image Studio experiment harness (Node, headless).
// Usage: npm run experiment -- [--run <id>] [--variants a,b] [--targets apple,star,appleAlpha] [--size 768] [--seed 1]
import { mkdirSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { analyze, createAnalyzer } from '../src/studio/analysis/analyze.ts';
import { buildLibrary } from '../src/studio/library/library.ts';
import { fixedGrid, quadtree, regionIdMap } from '../src/studio/partition.ts';
import { render } from '../src/studio/render.ts';
import { DEFAULT_SETTINGS, derive, type StudioSettings } from '../src/studio/settings.ts';
import { syntheticApple, syntheticAppleTransparent, syntheticStar } from '../src/studio/synthetic.ts';
import { detail, fidelityAt, seamRatio, toLab } from '../src/studio/metrics.ts';
import { comparisonSheet } from '../src/studio/sheet.ts';
import { encodeRgbaPng } from '../src/export/encodeImage.ts';
import type { Rect, RgbaImage } from '../src/studio/types.ts';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const SIZE = Number(args.get('size') ?? 768);
const SEED = Number(args.get('seed') ?? 1);
const RUN = args.get('run') ?? 'run';

/** Named variants: settings overrides on top of DEFAULT_SETTINGS. */
const VARIANTS: Record<string, Partial<StudioSettings>> = {
  grid16: { partition: { kind: 'grid', cell: 16 }, twoColor: false },
  grid32: { partition: { kind: 'grid', cell: 32 }, twoColor: false },
  grid48: { partition: { kind: 'grid', cell: 48 }, twoColor: false },
  grid64: { partition: { kind: 'grid', cell: 64 }, twoColor: false },
  grid16two: { partition: { kind: 'grid', cell: 16 }, twoColor: true },
  grid32two: { partition: { kind: 'grid', cell: 32 }, twoColor: true },
  grid48two: { partition: { kind: 'grid', cell: 48 }, twoColor: true },
  adaptive: { partition: { kind: 'adaptive', maxCell: 48 }, twoColor: true },
  adaptiveFeather: { partition: { kind: 'adaptive', maxCell: 48 }, twoColor: true, seam: 'feather' },
  adaptiveGrout: { partition: { kind: 'adaptive', maxCell: 48 }, twoColor: true, seam: 'grout' },
};

const TARGETS: Record<string, { make: (n: number) => RgbaImage; background: string; crop: { x: number; y: number } }> = {
  apple: { make: syntheticApple, background: '#ffffff', crop: { x: 384, y: 176 } },
  star: { make: syntheticStar, background: '#ffffff', crop: { x: 424, y: 208 } },
  appleAlpha: { make: syntheticAppleTransparent, background: '#ffffff', crop: { x: 384, y: 176 } },
};

const variants = (args.get('variants') ?? 'grid16,grid32,grid48,grid64').split(',');
const targets = (args.get('targets') ?? 'apple,star,appleAlpha').split(',');
const dir = `artifacts/fractal-image-studio/${RUN}`;
mkdirSync(dir, { recursive: true });
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  // not a git checkout
}

const t0 = performance.now();
const lib = buildLibrary(SEED);
const libMs = performance.now() - t0;
console.log(`library: ${lib.candidates.length} candidates (${lib.baseCount} base, ${lib.rejected} rejected) in ${libMs.toFixed(0)} ms`);

const summary: Record<string, unknown>[] = [];
for (const tname of targets) {
  const T = TARGETS[tname];
  const src = T.make(SIZE);
  writeFileSync(`${dir}/${tname}-target.png`, encodeRgbaPng(SIZE, SIZE, compositeOver(src, T.background)));
  const targetLab = toLab(SIZE, SIZE, src.data, T.background);
  const columns = [{ label: 'TARGET', image: { width: SIZE, height: SIZE, data: compositeOver(src, T.background) } }];
  for (const vname of variants) {
    const settings: StudioSettings = { ...DEFAULT_SETTINGS, seed: SEED, background: T.background, ...VARIANTS[vname] };
    const dv = derive(settings);
    const opts = { outWidth: SIZE, outHeight: SIZE, background: T.background };
    const ta = performance.now();
    let rects: Rect[];
    if (settings.partition.kind === 'grid') rects = fixedGrid(SIZE, SIZE, settings.partition.cell);
    else rects = quadtree(SIZE, SIZE, createAnalyzer(src, opts).describe, { maxCell: settings.partition.maxCell, ...dv.quadtree });
    const descriptors = analyze(src, rects, opts);
    const analyzeMs = performance.now() - ta;
    const res = render(descriptors, settings, lib, SIZE, SIZE);
    const outLab = toLab(SIZE, SIZE, res.rgba);
    const minCell = Math.min(...rects.map((r) => Math.min(r.w, r.h)));
    const perCell = Math.max(1, Math.round(SIZE / minCell));
    const metrics = {
      fidelity: {
        // (a) one sample per minimum cell — note: for a grid this is exactly each cell's mean,
        // which the color mapping matches by construction, so it is near-trivial there.
        perMinCell: fidelityAt(outLab, targetLab, perCell, perCell),
        // Common scale for comparing variants: one sample per 16 px.
        per16: fidelityAt(outLab, targetLab, Math.round(SIZE / 16), Math.round(SIZE / 16)),
        // (b) 128 px on the long side.
        long128: fidelityAt(outLab, targetLab, 128, 128),
      },
      detail: detail(outLab, rects),
      seamRatio: seamRatio(outLab, regionIdMap(SIZE, SIZE, rects)),
      cost: {
        analyzeMs: Math.round(analyzeMs),
        renderMs: Math.round(res.ms),
        regions: rects.length,
        avgRegionPx: Math.round((SIZE * SIZE) / rects.length),
        minCell,
        approxIterations: Math.round(res.iterations),
        twoColorRegions: descriptors.filter((d) => d.colors.length === 2).length,
      },
    };
    const name = `${tname}-${vname}`;
    writeFileSync(`${dir}/${name}.png`, encodeRgbaPng(SIZE, SIZE, res.rgba));
    writeFileSync(`${dir}/${name}.json`, JSON.stringify({ run: RUN, commit, target: tname, variant: vname, size: SIZE, seed: SEED, librarySeed: lib.seed, settings, derived: dv, metrics }, null, 2));
    columns.push({ label: vname, image: { width: SIZE, height: SIZE, data: res.rgba } });
    const f = metrics.fidelity;
    summary.push({ target: tname, variant: vname, ...flat(metrics) });
    console.log(
      `${name.padEnd(26)} dE(cell) ${f.perMinCell.deltaE.toFixed(4)} | dE16 ${f.per16.deltaE.toFixed(4)} ssim16 ${f.per16.ssim.toFixed(3)} | dE128 ${f.long128.deltaE.toFixed(4)} ssim128 ${f.long128.ssim.toFixed(3)} | HF ${metrics.detail.meanHF.toFixed(4)} vis ${(metrics.detail.visibleFrac * 100).toFixed(0)}% flat ${(metrics.detail.flatFrac * 100).toFixed(0)}% | seam ${metrics.seamRatio.toFixed(2)} | ${rects.length} reg, ${res.ms.toFixed(0)} ms`,
    );
  }
  const sheet = comparisonSheet(columns, { ...T.crop, size: 64 });
  writeFileSync(`${dir}/${tname}-sheet.png`, encodeRgbaPng(sheet.width, sheet.height, sheet.data));
}
writeFileSync(`${dir}/summary.json`, JSON.stringify({ run: RUN, commit, size: SIZE, seed: SEED, library: { candidates: lib.candidates.length, rejected: lib.rejected, ms: Math.round(libMs) }, results: summary }, null, 2));
console.log(`wrote ${dir} in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

function compositeOver(img: RgbaImage, hex: string): Uint8ClampedArray {
  const n = parseInt(hex.slice(1), 16);
  const bg = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const out = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.width * img.height; i++) {
    const a = img.data[i * 4 + 3] / 255;
    for (let k = 0; k < 3; k++) out[i * 4 + k] = img.data[i * 4 + k] * a + bg[k] * (1 - a);
    out[i * 4 + 3] = 255;
  }
  return out;
}

function flat(m: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(m)) {
    if (v && typeof v === 'object') Object.assign(out, flat(v as Record<string, unknown>, `${prefix}${k}.`));
    else out[`${prefix}${k}`] = v;
  }
  return out;
}
