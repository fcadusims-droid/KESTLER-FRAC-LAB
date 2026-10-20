# Fractal Lab

A browser-based fractal explorer and high-resolution PNG exporter. It is a static
site: every pixel is computed in the visitor's browser, in Web Workers. Nothing runs
on a server.

> Status: under construction. See [`PROGRESS.md`](PROGRESS.md) for what is done and
> verified so far.

## Development

Requires Node.js 24 (Active LTS; see `.nvmrc`). Node 22.12+ also works.

```sh
npm ci
npm run dev        # dev server at http://localhost:5173/
npm test           # unit tests (Vitest, Node)
npm run build      # typecheck + production build into dist/
npm run test:e2e   # Playwright smoke tests against a subpath build
```

## Deployment

GitHub Pages via GitHub Actions. See [`DEPLOYMENT.md`](DEPLOYMENT.md).
