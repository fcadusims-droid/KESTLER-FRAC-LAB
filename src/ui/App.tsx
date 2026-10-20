import { useEffect, useRef } from 'react';

// Milestone 1 scaffold: a basic single-threaded Mandelbrot to validate the
// build and deployment pipeline. Replaced by the worker renderer in Milestone 3.
export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const w = (canvas.width = 640);
    const h = (canvas.height = 400);
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(w, h);
    const scale = 3 / h;
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const cr = -0.5 + (px + 0.5 - w / 2) * scale;
        const ci = -(py + 0.5 - h / 2) * scale;
        let x = 0, y = 0, n = 0;
        while (n < 200 && x * x + y * y <= 4) {
          const t = x * x - y * y + cr;
          y = 2 * x * y + ci;
          x = t;
          n++;
        }
        const v = n === 200 ? 0 : 255 * Math.sqrt(n / 200);
        const i = (py * w + px) * 4;
        img.data[i] = v * 0.4;
        img.data[i + 1] = v * 0.8;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  return (
    <main style={{ background: '#0b1020', color: '#dde', minHeight: '100vh', padding: 16, fontFamily: 'system-ui' }}>
      <h1>Fractal Lab</h1>
      <canvas ref={canvasRef} data-testid="fractal-canvas" />
    </main>
  );
}
