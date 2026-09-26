/**
 * One shared requestAnimationFrame loop for all tile animations.
 * An animation only runs while its element is on screen and the page is visible.
 * With reduced motion every animation draws a single still frame.
 */
export interface Animation {
  el: Element;
  /** Resize backing store etc. Called before the first frame and on element resize. */
  resize(): void;
  /** t and dt in seconds. */
  frame(t: number, dt: number): void;
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const running = new Set<Animation>();
const all: Animation[] = [];
let rafId = 0;
let last = 0;

function tick(now: number) {
  const t = now / 1000;
  // Clamp dt so a long pause (tab hidden, tile offscreen) does not make things jump.
  const dt = last ? Math.min(t - last, 1 / 20) : 1 / 60;
  last = t;
  for (const anim of running) anim.frame(t, dt);
  rafId = running.size && !document.hidden && !reducedMotion.matches ? requestAnimationFrame(tick) : 0;
}

function kick() {
  if (!rafId && running.size && !document.hidden && !reducedMotion.matches) {
    last = 0;
    rafId = requestAnimationFrame(tick);
  }
}

const visibility = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      const anim = all.find((a) => a.el === entry.target);
      if (!anim) continue;
      if (entry.isIntersecting) running.add(anim);
      else running.delete(anim);
    }
    kick();
  },
  { rootMargin: '80px' },
);

const sizes = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const anim = all.find((a) => a.el === entry.target);
    if (!anim) continue;
    anim.resize();
    if (reducedMotion.matches) anim.frame(performance.now() / 1000, 0);
  }
});

document.addEventListener('visibilitychange', kick);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches) for (const anim of all) anim.frame(performance.now() / 1000, 0);
  kick();
});

export function register(anim: Animation) {
  all.push(anim);
  anim.resize();
  anim.frame(performance.now() / 1000, 0);
  visibility.observe(anim.el);
  sizes.observe(anim.el);
}

/** Canvas helper: match the backing store to the CSS size (capped at 2x for battery). */
export function fitCanvas(canvas: HTMLCanvasElement) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export const lightScheme = matchMedia('(prefers-color-scheme: light)');
