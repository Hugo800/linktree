import { fitCanvas, lightScheme, type Animation } from './loop';

/** A contribution graph that keeps lighting up – the GitHub tile. */

const MAX_ROWS = 7;
const CELL = 10;
const GAP = 3;

export function contrib(canvas: HTMLCanvasElement): Animation {
  let ctx: CanvasRenderingContext2D;
  let w = 0, cols = 0, rows = MAX_ROWS, x0 = 0, y0 = 0;
  let level: Float32Array = new Float32Array(0);
  let target: Float32Array = new Float32Array(0);
  let nextPulse = 0;

  const seed = () => {
    const r = Math.random();
    return r < 0.45 ? 0 : r < 0.7 ? 0.3 : r < 0.88 ? 0.6 : 1;
  };

  return {
    el: canvas,
    resize() {
      ({ ctx, w } = fitCanvas(canvas));
      // Left-aligned with the tile text, leaving room for the arrow button on the right.
      x0 = 22;
      y0 = 22;
      cols = Math.max(4, Math.floor((w - x0 - 64 + GAP) / (CELL + GAP)));
      // As many rows as fit above the tile text (fewer on short phone tiles).
      const body = canvas.parentElement?.querySelector<HTMLElement>('.tile-body');
      const room = body ? body.offsetTop - 14 - y0 : Infinity;
      rows = Math.max(3, Math.min(MAX_ROWS, Math.floor((room + GAP) / (CELL + GAP))));
      level = Float32Array.from({ length: cols * rows }, () => seed());
      target = level.slice();
    },
    frame(t, dt) {
      const light = lightScheme.matches;
      const on = light ? [137, 68, 171] : [191, 90, 242];
      const off = light ? [0, 0, 0, 0.06] : [255, 255, 255, 0.06];

      // Every so often a ripple rolls across the grid from a random cell.
      if (t > nextPulse) {
        nextPulse = t + 1.4 + Math.random() * 1.2;
        const oc = Math.floor(Math.random() * cols);
        const or = Math.floor(Math.random() * rows);
        for (let c = 0; c < cols; c++) {
          for (let r = 0; r < rows; r++) {
            const d = Math.hypot(c - oc, r - or);
            if (d < 3.2 && Math.random() > d / 4) target[c * rows + r] = Math.min(1, target[c * rows + r] + 0.4 + Math.random() * 0.4);
          }
        }
      }
      // Cells slowly fade back towards a quiet baseline.
      for (let i = 0; i < target.length; i++) {
        target[i] = Math.max(0, target[i] - dt * 0.2);
        level[i] += (target[i] - level[i]) * Math.min(1, dt * 4);
      }

      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
          const v = level[c * rows + r];
          const x = x0 + c * (CELL + GAP);
          const y = y0 + r * (CELL + GAP);
          ctx.fillStyle = `rgba(${off[0]},${off[1]},${off[2]},${off[3]})`;
          ctx.beginPath();
          ctx.roundRect(x, y, CELL, CELL, 3);
          ctx.fill();
          if (v > 0.04) {
            ctx.fillStyle = `rgba(${on[0]},${on[1]},${on[2]},${Math.min(1, v * 0.95)})`;
            if (v > 0.8 && !light) {
              ctx.shadowColor = `rgba(${on[0]},${on[1]},${on[2]},0.8)`;
              ctx.shadowBlur = 8;
            }
            ctx.beginPath();
            ctx.roundRect(x, y, CELL, CELL, 3);
            ctx.fill();
            ctx.shadowBlur = 0;
          }
        }
      }
    },
  };
}
