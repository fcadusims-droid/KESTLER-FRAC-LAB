# Deployment

Live site: **https://fcadusims-droid.github.io/KESTLER-FRAC-LAB/**

## Workflows

- `.github/workflows/ci.yml` runs on pull requests and pushes: `npm ci`, typecheck, lint, unit
  tests, build, then Playwright smoke tests (Chromium) against a `/fractal-lab/` subpath build.
  It never deploys.
- `.github/workflows/deploy.yml` runs on pushes to `main` and on manual *Run workflow*. It uses
  the official Pages flow (`actions/configure-pages@v6`, `actions/upload-pages-artifact@v5`,
  `actions/deploy-pages@v5`), with permissions `contents: read, pages: write, id-token: write`,
  environment `github-pages` and concurrency group `pages` (no cancel-in-progress).

## Status

- Pages is enabled with **Source: GitHub Actions**. The repository owner did this; the build
  session's `gh` CLI was not authenticated.
- The Deploy workflow succeeded for the merges of
  https://github.com/fcadusims-droid/KESTLER-FRAC-LAB/pull/1 and
  https://github.com/fcadusims-droid/KESTLER-FRAC-LAB/pull/2.
- After the second deploy, `scripts/verify-live.mjs` loaded the live URL in headless Chromium:
  HTTP 200, three render workers loaded from `/KESTLER-FRAC-LAB/assets/`, a non-blank canvas,
  wheel zoom changed the image, and there were no console errors.
- Later merges deploy the same way. Re-run `node scripts/verify-live.mjs <url>` to check a
  deployment.

## Setting up a fork or a new repository

1. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
   With an authenticated `gh`, the equivalent is
   `gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow`
   (use `-X PUT` if Pages already exists).
2. Push to `main`, or run *Deploy to GitHub Pages* from the Actions tab.
3. The URL appears on the `deploy` job and on the `github-pages` environment.

## Base path

`vite.config.ts` reads `VITE_BASE` (default `/`). `deploy.yml` sets it from the `base_path`
output of `actions/configure-pages` plus a trailing slash, so a project site gets `/REPO/` and a
user site (`USER.github.io`) gets `/`. Workers are created with
`new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`, so they resolve under
the subpath. The Playwright tests serve a `/fractal-lab/` build, which catches hard-coded root
paths before deployment.

## GitHub Pages limitations

GitHub Pages cannot set `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy` headers, so
`SharedArrayBuffer` and multi-threaded WebAssembly are unavailable. The app does not use them.
Workers exchange transferable `ArrayBuffer`s instead, and no service-worker workaround is used.
