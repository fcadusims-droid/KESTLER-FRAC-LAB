import type { Library } from './library/library.ts';
import { hashSeed, mulberry32 } from './prng.ts';
import { separation } from './partition.ts';
import type { Derived } from './settings.ts';
import type { RegionDescriptor } from './types.ts';

/** Edge strength (ΔE_OK per px) at which orientation matching gets full weight. */
const EDGE_SCALE = 0.03;
/** Separation at which split matching gets full weight. */
const SEP_SCALE = 0.15;

export interface ScoreTerms {
  detail: number;
  orient: number;
  split: number;
  repeat: number;
}

/**
 * score = w_detail·|densityRank − densityTarget|
 *       + w_orient·edgeNorm·coherence·sin²(orient − gradDir)
 *       + w_split·sepNorm·(|fracAbove − p₂| + ½(1 − cos(splitDir − gradDir))·min(1, splitStrength/0.3))
 *       + w_repeat·(number of already-assigned neighbors using the same base patch)
 * (+ a seeded jitter in [0, w_jitter) to break ties deterministically.)
 */
export function scoreTerms(d: RegionDescriptor, c: Library['candidates'][number], target: number, sameNeighbors: number): ScoreTerms {
  const st = c.stats;
  const edgeNorm = Math.min(1, d.edge / EDGE_SCALE);
  const sepNorm = Math.min(1, separation(d) / SEP_SCALE);
  const dOr = st.orient - d.gradDir;
  let split = 0;
  if (d.colors.length === 2) {
    split = sepNorm * (Math.abs(st.fracAbove - d.colors[1].weight) + 0.5 * (1 - Math.cos(st.splitDir - d.gradDir)) * Math.min(1, st.splitStrength / 0.3));
  }
  return {
    detail: Math.abs(st.densityRank - target),
    orient: edgeNorm * st.coherence * Math.sin(dOr) ** 2,
    split,
    repeat: sameNeighbors,
  };
}

/** Neighbor lists from rects (shared edges), so matching never needs pixels. */
export function neighbors(rects: RegionDescriptor['rect'][]): number[][] {
  const adj: Set<number>[] = rects.map(() => new Set());
  const touch = (a: number, b: number) => {
    adj[a].add(b);
    adj[b].add(a);
  };
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i];
    for (let j = i + 1; j < rects.length; j++) {
      const t = rects[j];
      const overlapX = Math.min(r.x + r.w, t.x + t.w) - Math.max(r.x, t.x);
      const overlapY = Math.min(r.y + r.h, t.y + t.h) - Math.max(r.y, t.y);
      if ((overlapY > 0 && (r.x + r.w === t.x || t.x + t.w === r.x)) || (overlapX > 0 && (r.y + r.h === t.y || t.y + t.h === r.y))) touch(i, j);
    }
  }
  return adj.map((s) => [...s].sort((a, b) => a - b));
}

/** Deterministic selection of one candidate per region, in region order. */
export function matchRegions(descriptors: RegionDescriptor[], lib: Library, dv: Derived, seed: number): number[] {
  const adj = neighbors(descriptors.map((d) => d.rect));
  const chosen = new Int32Array(descriptors.length).fill(-1);
  const w = dv.weights;
  for (let r = 0; r < descriptors.length; r++) {
    const d = descriptors[r];
    const rng = mulberry32(hashSeed(seed, r));
    const usedBases = adj[r].filter((n) => chosen[n] >= 0).map((n) => lib.candidates[chosen[n]].base);
    let best = -1;
    let bestScore = Infinity;
    for (let c = 0; c < lib.candidates.length; c++) {
      const cand = lib.candidates[c];
      const same = usedBases.reduce((k, b) => k + (b === cand.base ? 1 : 0), 0);
      const t = scoreTerms(d, cand, dv.densityTarget, same);
      const score = w.detail * t.detail + w.orient * t.orient + w.split * t.split + w.repeat * t.repeat + w.jitter * rng();
      if (score < bestScore) {
        bestScore = score;
        best = c;
      }
    }
    chosen[r] = best;
  }
  return Array.from(chosen);
}
