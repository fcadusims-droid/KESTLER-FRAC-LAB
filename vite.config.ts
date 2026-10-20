import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The deploy workflow sets VITE_BASE from actions/configure-pages (e.g. "/REPO/").
// Locally it defaults to "/".
function normalizeBase(raw: string | undefined): string {
  if (!raw) return '/';
  let base = raw.trim();
  if (!base.startsWith('/')) base = '/' + base;
  if (!base.endsWith('/')) base += '/';
  return base;
}

export default defineConfig({
  base: normalizeBase(process.env.VITE_BASE),
  plugins: [react()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
});
