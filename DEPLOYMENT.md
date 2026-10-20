# Deployment

The site is deployed to GitHub Pages by `.github/workflows/deploy.yml` on every push
to `main` (and manually via *Run workflow*). `ci.yml` runs checks on pushes and pull
requests and never deploys.

## One-time setup (must be done by a repository admin)

The session that built this project could not authenticate the `gh` CLI, so Pages
was **not** enabled automatically. Do this once:

1. Open the repository on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**.
   (CLI equivalent, with an authenticated `gh`:
   `gh api -X POST repos/OWNER/REPO/pages -f build_type=workflow`,
   or `-X PUT` if Pages already exists.)
3. Merge the pull request into `main` (or run the *Deploy to GitHub Pages* workflow
   manually from the **Actions** tab on `main`).
4. Wait for the workflow to finish. The URL is shown on the `deploy` job and on the
   `github-pages` environment, e.g. `https://fcadusims-droid.github.io/KESTLER-FRAC-LAB/`.

## How the base path works

`vite.config.ts` reads `VITE_BASE` (default `/`). In `deploy.yml` it is set from
`actions/configure-pages`' `base_path` output plus a trailing slash, so a project site
gets `/REPO/` and a user site (`USER.github.io`) gets `/`. Workers are created with
`new Worker(new URL('./x.worker.ts', import.meta.url), { type: 'module' })`, so they
resolve correctly under the subpath.

The Playwright smoke tests build with `VITE_BASE=/fractal-lab/` and serve that build
with `vite preview`, which catches hard-coded root paths before deployment.

## Limitations of GitHub Pages

GitHub Pages cannot set `Cross-Origin-Opener-Policy` / `Cross-Origin-Embedder-Policy`
headers, so `SharedArrayBuffer` and multi-threaded WebAssembly are unavailable. The app
does not use them; workers exchange transferable `ArrayBuffer`s instead.
