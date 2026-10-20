# Fractal Image Studio — experiment report (checkpoint after S3)

Status: **algorithm prototype, headless only. No UI yet (waiting for review).**
Everything below was produced by `npm run experiment` in this repository (Node 22, one thread),
768×768 outputs, seed 1. Images listed here were opened and inspected; numbers are copied by
script from each run's `summary.json`.

## Design

**Information boundary.** `src/studio/analysis/analyze.ts` is the only code that reads source
pixels. It emits one `RegionDescriptor` per region: bounds, mean OKLab color, ≤2 dominant colors
(k-means k=2 in OKLab) with proportions, L mean/variance, edge strength, gradient direction,
alpha coverage (values quantized). The quadtree partitioner only receives a `describe(rect)`
callback. `render.ts`, `colormap.ts`, `match.ts` and `library/` never import the analysis module
or take an image buffer; a unit test checks the imports, that two different images with identical
descriptors render byte-identically, and that wiping the source after analysis changes nothing.

**Patch library (structure only).** 96 seeded base windows — Mandelbrot near the boundary
(span 0.004–0.25) and Julia with c near the Mandelbrot boundary (span 0.06–1.2) — × 4 exact 90°
rotations = 384 candidates (49 samples rejected as flat). Field: s = (log(1+v) − lo)/(hi − lo),
v = smooth escape n + 1 − log₂ ln|z| (the existing Fractal Lab core), lo/hi = 2nd/98th
percentile on a 40×40 proxy, interior s = 1. Stats on the proxy: mean/std of s, interior
fraction, density = mean |s − box3(s)|, structure-tensor orientation and coherence, median
split (fraction above, centroid direction, strength). Flat rejection: raw log-range < 0.15,
std(s) < 0.12, interior > 50 %, density < 0.01.

**Matching (per region, deterministic, seeded jitter):**

```
score = w_detail·|densityRank − densityTarget|
      + w_orient·min(1, edge/0.03)·coherence·sin²(orient − gradDir)
      + w_split·min(1, sep/0.15)·( |fracAbove − p₂| + ½(1 − cos(splitDir − gradDir))·min(1, splitStrength/0.3) )
      + w_repeat·(#already-assigned neighbors using the same base patch)
      + w_jitter·U[0,1)            (w_jitter = 0.02)
sep = ΔE(c₁, c₂)·2·√(p₁p₂)
```

Weights from the sliders (F = Fidelity, D = Detail, both in [0, 1]):
w_detail = 1, w_orient = 0.6(0.5 + F), w_split = 1.2(0.5 + F), w_repeat = 0.8,
densityTarget = 0.15 + 0.75D.

**Color mapping (per region, OKLab).** z = clamp((s − mean_s)/std_s, ±2.5) over the region.
- One color: L = L̄ + a·z, chroma × (1 + 0.15D·z), hue + 0.1D·z rad.
- Two colors (ΔE ≥ 0.06 and the smaller cluster ≥ 8 %): f = λ·rank(ramp along gradDir) +
  (1 − λ)·rank(s); threshold τ is the (1 − p₂) quantile of f, so the area split matches the
  target proportions; color = mix(c₁, c₂, smoothstep(τ ± 0.04, f)), L += 0.6a·z. The ramp term
  is what places each color on the correct side of the contour; the rank(s) term makes the
  contour itself fractal.
- a = (0.03 + 0.15D)(1 − 0.6F); λ = 0.35 + 0.5F. Near the gamut ceiling/floor the modulation is
  asymmetric (round 4). Out-of-gamut colors lose chroma at constant L. A per-region offset (two
  passes) makes the displayed mean equal the target mean, with L clamped to [0.45a, 1 − 0.45a].
- Every pixel depends on s; no region is a flat fill.

**Partition.** Fixed grids 16/32/48/64, or a quadtree from 48 px cells. A cell splits while
σ_L > 0.05(1.6 − F), edge > 0.012(1.6 − F) or sep > 0.12(1.6 − F), and children stay ≥
minCell = round(8 + 8D) (12 at D = 0.5).

**Render.** Each region renders its patch at the true output resolution, from global pixel
indices minus the region origin (tiled = untiled is tested). After round 2, the window span
scales with max(w, h)/16 so structure has the same pixel scale in every cell size. Seams:
`hard`, `feather` (3 px; blends only neighbors' color mappings applied to the pixel's own s),
`grout` (1 px darkened line, deliberate style).

**Metrics.** Fidelity uses an exact box filter to (a) one sample per minimum cell, (b) a common
48×48 (16 px per sample, added for cross-variant comparison) and (c) 128×128 (128 px long side).
At each scale: mean ΔE_OK and SSIM on L (7×7 Gaussian, σ = 1.5). Detail: per cell mean |L − box
blur radius ≈ cell/8|, % visible (≥ 0.01), % flat (< 0.003). Seam: mean neighbor ΔE across region
borders ÷ within regions. Cost: render time, region count, approximate iterations.

**Known metric caveats (observed, not hypothetical):**
- For a fixed grid, fidelity at one sample per cell is ≈ 0 by construction (cell means are
  matched), so it is not evidence of recognizability. The same holds for the 16-px scale on the
  16-px grid.
- SSIM at 128 px is not monotonic in cell size (grid64 0.375 > grid32 0.323 for the apple) because
  fractal texture still leaks into a 6-px sample.

## Runs

Each run varies exactly one thing from the previous code state. The `commit` field in the JSON
is HEAD at run time; round changes were uncommitted while their run executed, so the change is
named here.

| run | code change vs previous run |
|---|---|
| r1-grid | baseline: fixed grids, mean color per cell only |
| r2-adaptive | same code; adds two-color cells, quadtree and seam variants |
| r3-round1-ramp | round 1: in-cell lightness ramp from L variance + gradient direction (**reverted**) |
| r4-round2-scale | round 2 (from r2 code): window span ∝ cell size (constant structure scale) |
| r5-round3-headroom | round 3: target L clamped to [1.2a, 1 − 1.2a] so modulation is not clipped |
| r6-round4-asym | round 4: asymmetric modulation near white/black, headroom reduced to 0.45a (**final**) |

**r1-grid** (commit `04c72da`)

| target | variant | ΔE₁₂₈ | SSIM₁₂₈ | ΔE₁₆ | SSIM₁₆ | ΔE/min-cell | HF | visible | flat | seam | regions | render ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| apple | grid16 | 0.0449 | 0.380 | 0.0003 | 1.000 | 0.0003 | 0.0164 | 100% | 0% | 5.19 | 2304 | 2646 |
| apple | grid32 | 0.0571 | 0.323 | 0.0520 | 0.528 | 0.0003 | 0.0159 | 100% | 0% | 7.56 | 576 | 2499 |
| apple | grid48 | 0.0665 | 0.326 | 0.0584 | 0.462 | 0.0003 | 0.0157 | 100% | 0% | 9.74 | 256 | 2544 |
| apple | grid64 | 0.0694 | 0.375 | 0.0659 | 0.394 | 0.0003 | 0.0153 | 100% | 0% | 13.29 | 144 | 2510 |
| star | grid16 | 0.0603 | 0.413 | 0.0256 | 1.000 | 0.0256 | 0.0149 | 97% | 0% | 5.61 | 2304 | 4342 |
| star | grid32 | 0.0858 | 0.321 | 0.0792 | 0.541 | 0.0246 | 0.0149 | 99% | 0% | 8.39 | 576 | 4362 |
| star | grid48 | 0.0850 | 0.349 | 0.0756 | 0.494 | 0.0242 | 0.0144 | 97% | 0% | 13.41 | 256 | 4279 |
| star | grid64 | 0.1174 | 0.325 | 0.1111 | 0.352 | 0.0232 | 0.0147 | 100% | 0% | 13.66 | 144 | 4226 |
| appleAlpha | grid16 | 0.0245 | 0.732 | 0.0046 | 1.000 | 0.0046 | 0.0068 | 35% | 65% | 6.74 | 2304 | 1872 |
| appleAlpha | grid32 | 0.0342 | 0.667 | 0.0301 | 0.754 | 0.0045 | 0.0069 | 36% | 62% | 11.26 | 576 | 1888 |
| appleAlpha | grid48 | 0.0442 | 0.616 | 0.0390 | 0.654 | 0.0042 | 0.0071 | 38% | 60% | 16.07 | 256 | 1840 |
| appleAlpha | grid64 | 0.0480 | 0.639 | 0.0445 | 0.591 | 0.0042 | 0.0069 | 38% | 58% | 24.13 | 144 | 1825 |

**r2-adaptive** (commit `ab23d20`)

| target | variant | ΔE₁₂₈ | SSIM₁₂₈ | ΔE₁₆ | SSIM₁₆ | ΔE/min-cell | HF | visible | flat | seam | regions | render ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| apple | grid16 | 0.0449 | 0.380 | 0.0003 | 1.000 | 0.0003 | 0.0164 | 100% | 0% | 5.19 | 2304 | 2725 |
| apple | grid16two | 0.0423 | 0.392 | 0.0003 | 1.000 | 0.0003 | 0.0170 | 100% | 0% | 4.85 | 2304 | 2699 |
| apple | adaptive | 0.0540 | 0.390 | 0.0447 | 0.547 | 0.0469 | 0.0240 | 100% | 0% | 7.20 | 682 | 2677 |
| apple | adaptiveFeather | 0.0545 | 0.388 | 0.0448 | 0.547 | 0.0481 | 0.0253 | 100% | 0% | 6.84 | 682 | 2857 |
| apple | adaptiveGrout | 0.0619 | 0.344 | 0.0519 | 0.540 | 0.0556 | 0.0620 | 100% | 0% | 15.75 | 682 | 2790 |
| star | grid16 | 0.0603 | 0.413 | 0.0256 | 1.000 | 0.0256 | 0.0149 | 97% | 0% | 5.61 | 2304 | 4549 |
| star | grid16two | 0.0546 | 0.438 | 0.0257 | 1.000 | 0.0257 | 0.0166 | 97% | 0% | 4.97 | 2304 | 4581 |
| star | adaptive | 0.0639 | 0.437 | 0.0537 | 0.597 | 0.0550 | 0.0248 | 87% | 0% | 7.60 | 919 | 4482 |
| star | adaptiveFeather | 0.0664 | 0.433 | 0.0562 | 0.597 | 0.0590 | 0.0305 | 95% | 0% | 5.83 | 919 | 4699 |
| star | adaptiveGrout | 0.0752 | 0.382 | 0.0652 | 0.587 | 0.0679 | 0.0621 | 100% | 0% | 13.09 | 919 | 4551 |
| appleAlpha | grid16 | 0.0245 | 0.732 | 0.0046 | 1.000 | 0.0046 | 0.0068 | 35% | 65% | 6.74 | 2304 | 2006 |
| appleAlpha | grid16two | 0.0201 | 0.755 | 0.0047 | 1.000 | 0.0047 | 0.0080 | 35% | 65% | 5.32 | 2304 | 1990 |
| appleAlpha | adaptive | 0.0236 | 0.746 | 0.0193 | 0.795 | 0.0196 | 0.0197 | 56% | 41% | 9.17 | 700 | 2029 |
| appleAlpha | adaptiveFeather | 0.0243 | 0.744 | 0.0196 | 0.795 | 0.0212 | 0.0216 | 61% | 36% | 8.08 | 700 | 2183 |
| appleAlpha | adaptiveGrout | 0.0429 | 0.437 | 0.0392 | 0.677 | 0.0403 | 0.0647 | 100% | 0% | 22.49 | 700 | 1984 |

**r3-round1-ramp** (commit `ab23d20`)

| target | variant | ΔE₁₂₈ | SSIM₁₂₈ | ΔE₁₆ | SSIM₁₆ | ΔE/min-cell | HF | visible | flat | seam | regions | render ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| apple | grid16two | 0.0428 | 0.389 | 0.0003 | 1.000 | 0.0003 | 0.0171 | 100% | 0% | 4.86 | 2304 | 2918 |
| apple | grid48two | 0.0600 | 0.370 | 0.0529 | 0.496 | 0.0003 | 0.0173 | 100% | 0% | 8.82 | 256 | 2902 |
| apple | adaptive | 0.0550 | 0.384 | 0.0455 | 0.542 | 0.0477 | 0.0241 | 100% | 0% | 7.25 | 682 | 2689 |
| apple | adaptiveFeather | 0.0554 | 0.383 | 0.0456 | 0.542 | 0.0488 | 0.0252 | 100% | 0% | 6.81 | 682 | 2957 |
| star | grid16two | 0.0550 | 0.436 | 0.0260 | 1.000 | 0.0260 | 0.0166 | 97% | 0% | 4.96 | 2304 | 4455 |
| star | grid48two | 0.0769 | 0.385 | 0.0697 | 0.515 | 0.0256 | 0.0182 | 96% | 0% | 11.51 | 256 | 4801 |
| star | adaptive | 0.0643 | 0.436 | 0.0540 | 0.597 | 0.0552 | 0.0248 | 87% | 0% | 7.61 | 919 | 4625 |
| star | adaptiveFeather | 0.0667 | 0.432 | 0.0564 | 0.596 | 0.0591 | 0.0303 | 95% | 0% | 5.81 | 919 | 4762 |
| appleAlpha | grid16two | 0.0202 | 0.754 | 0.0048 | 1.000 | 0.0048 | 0.0080 | 35% | 65% | 5.27 | 2304 | 1952 |
| appleAlpha | grid48two | 0.0299 | 0.703 | 0.0264 | 0.745 | 0.0048 | 0.0098 | 39% | 59% | 11.35 | 256 | 2191 |
| appleAlpha | adaptive | 0.0235 | 0.746 | 0.0191 | 0.796 | 0.0195 | 0.0198 | 57% | 41% | 8.95 | 700 | 1931 |
| appleAlpha | adaptiveFeather | 0.0242 | 0.744 | 0.0195 | 0.796 | 0.0209 | 0.0214 | 61% | 36% | 7.99 | 700 | 2173 |

**r4-round2-scale** (commit `ab23d20`)

| target | variant | ΔE₁₂₈ | SSIM₁₂₈ | ΔE₁₆ | SSIM₁₆ | ΔE/min-cell | HF | visible | flat | seam | regions | render ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| apple | grid16two | 0.0423 | 0.392 | 0.0003 | 1.000 | 0.0003 | 0.0170 | 100% | 0% | 4.85 | 2304 | 2935 |
| apple | grid48two | 0.0644 | 0.321 | 0.0564 | 0.497 | 0.0006 | 0.0219 | 100% | 0% | 7.51 | 256 | 3255 |
| apple | adaptive | 0.0586 | 0.351 | 0.0483 | 0.539 | 0.0503 | 0.0249 | 100% | 0% | 6.50 | 682 | 3021 |
| apple | adaptiveFeather | 0.0594 | 0.346 | 0.0487 | 0.537 | 0.0520 | 0.0263 | 100% | 0% | 6.33 | 682 | 3198 |
| star | grid16two | 0.0546 | 0.438 | 0.0257 | 1.000 | 0.0257 | 0.0166 | 97% | 0% | 4.97 | 2304 | 4649 |
| star | grid48two | 0.0840 | 0.337 | 0.0762 | 0.506 | 0.0295 | 0.0243 | 97% | 0% | 8.55 | 256 | 4819 |
| star | adaptive | 0.0709 | 0.397 | 0.0601 | 0.585 | 0.0614 | 0.0255 | 87% | 0% | 6.66 | 919 | 4486 |
| star | adaptiveFeather | 0.0743 | 0.389 | 0.0633 | 0.582 | 0.0663 | 0.0315 | 95% | 0% | 5.40 | 919 | 4799 |
| appleAlpha | grid16two | 0.0201 | 0.755 | 0.0047 | 1.000 | 0.0047 | 0.0080 | 35% | 65% | 5.32 | 2304 | 1893 |
| appleAlpha | grid48two | 0.0341 | 0.671 | 0.0304 | 0.735 | 0.0057 | 0.0117 | 39% | 38% | 10.57 | 256 | 2424 |
| appleAlpha | adaptive | 0.0251 | 0.729 | 0.0206 | 0.794 | 0.0207 | 0.0198 | 56% | 35% | 8.30 | 700 | 1880 |
| appleAlpha | adaptiveFeather | 0.0261 | 0.725 | 0.0211 | 0.793 | 0.0226 | 0.0220 | 61% | 28% | 7.75 | 700 | 2105 |

**r5-round3-headroom** (commit `ab23d20`)

| target | variant | ΔE₁₂₈ | SSIM₁₂₈ | ΔE₁₆ | SSIM₁₆ | ΔE/min-cell | HF | visible | flat | seam | regions | render ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| apple | grid16two | 0.0423 | 0.392 | 0.0003 | 1.000 | 0.0003 | 0.0170 | 100% | 0% | 4.85 | 2304 | 2723 |
| apple | grid48two | 0.0644 | 0.321 | 0.0564 | 0.497 | 0.0006 | 0.0219 | 100% | 0% | 7.51 | 256 | 3257 |
| apple | adaptive | 0.0586 | 0.351 | 0.0483 | 0.539 | 0.0503 | 0.0249 | 100% | 0% | 6.50 | 682 | 2879 |
| apple | adaptiveFeather | 0.0594 | 0.346 | 0.0487 | 0.537 | 0.0520 | 0.0263 | 100% | 0% | 6.33 | 682 | 3024 |
| star | grid16two | 0.0559 | 0.435 | 0.0274 | 1.000 | 0.0274 | 0.0168 | 100% | 0% | 4.91 | 2304 | 4411 |
| star | grid48two | 0.0853 | 0.334 | 0.0774 | 0.506 | 0.0310 | 0.0245 | 100% | 0% | 8.41 | 256 | 5114 |
| star | adaptive | 0.0721 | 0.395 | 0.0617 | 0.585 | 0.0630 | 0.0266 | 100% | 0% | 6.59 | 919 | 4568 |
| star | adaptiveFeather | 0.0754 | 0.386 | 0.0648 | 0.581 | 0.0679 | 0.0321 | 100% | 0% | 5.42 | 919 | 4631 |
| appleAlpha | grid16two | 0.0709 | 0.432 | 0.0557 | 0.988 | 0.0557 | 0.0147 | 100% | 0% | 5.20 | 2304 | 1944 |
| appleAlpha | grid48two | 0.0781 | 0.329 | 0.0743 | 0.490 | 0.0499 | 0.0208 | 100% | 0% | 8.88 | 256 | 2493 |
| appleAlpha | adaptive | 0.0735 | 0.369 | 0.0688 | 0.545 | 0.0691 | 0.0258 | 99% | 0% | 7.31 | 700 | 1950 |
| appleAlpha | adaptiveFeather | 0.0744 | 0.366 | 0.0692 | 0.544 | 0.0709 | 0.0277 | 100% | 0% | 6.97 | 700 | 2308 |

**r6-round4-asym** (commit `ab23d20`)

| target | variant | ΔE₁₂₈ | SSIM₁₂₈ | ΔE₁₆ | SSIM₁₆ | ΔE/min-cell | HF | visible | flat | seam | regions | render ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| apple | grid16two | 0.0400 | 0.416 | 0.0003 | 1.000 | 0.0003 | 0.0160 | 94% | 0% | 4.85 | 2304 | 2702 |
| apple | grid48two | 0.0601 | 0.348 | 0.0527 | 0.518 | 0.0006 | 0.0204 | 91% | 0% | 7.63 | 256 | 3283 |
| apple | adaptive | 0.0542 | 0.379 | 0.0445 | 0.561 | 0.0464 | 0.0240 | 96% | 0% | 6.67 | 682 | 3006 |
| apple | adaptiveFeather | 0.0549 | 0.374 | 0.0449 | 0.559 | 0.0480 | 0.0253 | 98% | 0% | 6.44 | 682 | 3128 |
| apple | adaptiveGrout | 0.0609 | 0.331 | 0.0500 | 0.547 | 0.0537 | 0.0617 | 100% | 0% | 15.35 | 682 | 2849 |
| apple | grid16 | 0.0426 | 0.404 | 0.0003 | 1.000 | 0.0003 | 0.0154 | 94% | 0% | 5.21 | 2304 | 2559 |
| star | grid16two | 0.0453 | 0.486 | 0.0178 | 1.000 | 0.0178 | 0.0146 | 97% | 0% | 5.01 | 2304 | 4391 |
| star | grid48two | 0.0698 | 0.391 | 0.0628 | 0.545 | 0.0190 | 0.0209 | 97% | 0% | 9.44 | 256 | 4753 |
| star | adaptive | 0.0561 | 0.454 | 0.0462 | 0.629 | 0.0473 | 0.0241 | 85% | 0% | 7.30 | 919 | 4568 |
| star | adaptiveFeather | 0.0592 | 0.446 | 0.0492 | 0.626 | 0.0521 | 0.0299 | 94% | 0% | 5.61 | 919 | 4887 |
| star | adaptiveGrout | 0.0678 | 0.387 | 0.0576 | 0.611 | 0.0604 | 0.0614 | 100% | 0% | 13.73 | 919 | 4500 |
| star | grid16 | 0.0510 | 0.461 | 0.0177 | 1.000 | 0.0177 | 0.0129 | 97% | 0% | 5.76 | 2304 | 4470 |
| appleAlpha | grid16two | 0.0368 | 0.593 | 0.0215 | 0.998 | 0.0215 | 0.0100 | 35% | 0% | 5.65 | 2304 | 1955 |
| appleAlpha | grid48two | 0.0483 | 0.495 | 0.0445 | 0.609 | 0.0199 | 0.0149 | 60% | 0% | 10.49 | 256 | 2554 |
| appleAlpha | adaptive | 0.0410 | 0.540 | 0.0364 | 0.665 | 0.0366 | 0.0218 | 63% | 0% | 8.41 | 700 | 2082 |
| appleAlpha | adaptiveFeather | 0.0420 | 0.535 | 0.0368 | 0.664 | 0.0384 | 0.0237 | 69% | 0% | 7.88 | 700 | 2200 |
| appleAlpha | adaptiveGrout | 0.0605 | 0.379 | 0.0567 | 0.612 | 0.0578 | 0.0667 | 100% | 0% | 20.23 | 700 | 1975 |
| appleAlpha | grid16 | 0.0413 | 0.573 | 0.0214 | 0.998 | 0.0214 | 0.0088 | 34% | 0% | 6.72 | 2304 | 1922 |

## Improvement rounds

**Round 1 — failure: large cells turned smooth shading into steps.** Hypothesis: a linear L ramp
in single-color cells, with variance matched to the descriptor's L variance, would restore
shading. Result: no measurable change (apple adaptive ΔE₁₂₈ 0.0540 → 0.0550, seam 7.20 → 7.25),
and no visible difference. The error at 128 px is dominated by fractal modulation and edges, not
by in-cell shading, so the hypothesis was wrong. **Reverted.**

**Round 2 — failure: patchwork of structure scales in adaptive output.** A 48-px cell showed the
same window as a 16-px cell, magnified 3×. Change: span ∝ cell size. Result: seams down (apple
adaptive 7.25 → 6.50, star 7.61 → 6.66), fidelity down (apple ΔE₁₂₈ 0.0550 → 0.0586, star
0.0643 → 0.0709), iterations up. Visually more uniform structure scale and fewer large blotches.
**Kept** as a trade-off: structure readability over a small fidelity loss.

**Round 3 — failure: near-white background cells were flat (35–65 % flat on the transparent
apple), violating "never fill flat".** Change: clamp the target L to keep headroom 1.2a. Result:
0 % flat everywhere, but the white background became light grey: transparent apple
grid16two ΔE₁₂₈ 0.0201 → 0.0709. The rule was met in a crude way.

**Round 4 — failure: round 3's grey background.** Change: asymmetric modulation (only as far up
or down as the remaining room allows) with headroom 0.45a. Result vs round 3: transparent apple
grid16two ΔE₁₂₈ 0.0709 → 0.0368, apple 0.0423 → 0.0400, star 0.0559 → 0.0453, star adaptive
0.0721 → 0.0561; still 0 % flat. Side effect: it also fixed clipping of the bright yellow (star
ΔE at one sample per cell 0.0274 → 0.0178). Only 35 % of the transparent-apple grid cells are
"visible" (HF ≥ 0.01): the texture on white is now subtle, not absent.

## Inspection (r6, images opened)

Distant row, described before reading the metrics:
- Apple: a red round fruit with a dip at the top, short brown stem, green leaf leaning right,
  highlight upper-left, grey shadow below, on pale blue (or white). Clearly an apple in every
  variant; grid48two is the least clean.
- Star: dark five-point star on yellow with a checkerboard top-left. Clear in all variants
  except grid48two, whose star points become ragged.

Checks:
- **Silhouette preserved:** yes for grid16, grid16two, adaptive. Two-color cells keep it crisp;
  mean-color grids (r1) blur it.
- **Stem and leaf distinguishable:** yes at grid16two and adaptive (crop shows a brown stem, light
  gap, green leaf); muddy at grid ≥ 32 without two-color cells.
- **Flat mosaic?** grid16two reads as fine texture. Adaptive still reads as a mosaic of different
  patches, and shows **triangular facets inside the apple body**: large cells covering only a
  shading gradient pass the two-color test, and the two-color mapping turns a smooth gradient into
  a hard split. Not fixed (rounds exhausted).
- **Real fractal structure in the crops:** yes. Julia/Mandelbrot filaments are visible in every
  cell. In two-color cells the contour itself is a fractal boundary on the correct side.
- **Seams:** visible at 4× in all hard-edged variants (seam ratio 4.9–8.4). Feather lowers the
  ratio but smears; grout makes seams a deliberate grid.
- **Texture vs shape:** shape wins at a distance; texture dominates up close. The background
  texture is strong (white/light flares) on the blue apple.

## Assessment (honest)

- **Recognizable from a distance:** yes for grid16two and adaptive at 48–64 px thumbnails and at
  256 px. Verified by inspection only; there is no human study.
- **Fractal structure visible up close:** yes in every variant.
- **Best result:** fixed 16-px grid with two-color cells (grid16two). It has the lowest ΔE₁₂₈ on
  all three targets (0.0400 / 0.0453 / 0.0368) and the lowest seam ratio (4.85 / 5.01 / 5.65).
  The adaptive quadtree uses 2.5–3.4× fewer regions but is worse on fidelity and seams, and
  shows facet artifacts.
- **Does it look like "an image made of fractals" rather than a filtered mosaic?** Partly. At
  16-px cells the cell grid is still perceptible up close, and each cell is clearly its own
  fractal window. That is a mosaic of fractals, not one continuous fractal image.

## What failed and why

- Edge cells averaged two colors into mud: fixed by two-color mapping.
- Large cells: steps in shading (round 1 did not help), scale patchwork (round 2 helped),
  gradient misread as an edge → facets (open).
- Near-white flatness (rounds 3–4).
- Two colors + one direction cannot represent cells holding three or more parts (stem + leaf +
  background) or a star point. At 48 px this produces blobs and speckles.

## Bottlenecks

Single-threaded Node: about 2–5 s render per 768² variant, about 1–2 s analysis (Sobel + k-means
per region), library 0.6 s. Adaptive spends more iterations than grid16 (≈ 35M vs 23M) because
its larger windows cover more of the set boundary.

## Recommended next step

Classify gradient vs edge before using two-color mode, e.g. require the k-means split to be
spatially compact (the edge strength should be concentrated, not uniform across the cell). This
uses only allowed descriptor fields (edge strength vs L variance and separation). Then re-run the
adaptive variant. After that: the continuous-field comparison (milestone 5).

## Reproduce

```sh
npm run experiment -- --run r6-round4-asym --variants grid16two,grid48two,adaptive,adaptiveFeather,adaptiveGrout,grid16
node --experimental-strip-types scripts/final-sheet.ts artifacts/fractal-image-studio/r6-round4-asym artifacts/fractal-image-studio/final-comparison.png grid16,grid16two,adaptive
```

Only `final-comparison.png` and this report are committed; run folders are gitignored.
