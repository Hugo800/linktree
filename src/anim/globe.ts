import { fitCanvas, lightScheme, type Animation } from './loop';

/** Dotted globe with satellites on inclined orbits – the preview for Orbital Atlas. */

type Vec = [number, number, number];

interface Orbit {
  radius: number; // in globe radii
  incl: number;
  raan: number;
  speed: number; // rad/s
  sats: number[]; // phase offsets
}

const TILT = (-23.4 * Math.PI) / 180;
const ORBITS: Orbit[] = [
  { radius: 1.18, incl: 0.9, raan: 0.3, speed: 0.55, sats: [0, 2.4] },
  { radius: 1.32, incl: -0.35, raan: 1.9, speed: 0.38, sats: [1.1, 4.2] },
  { radius: 1.55, incl: 1.35, raan: -0.8, speed: 0.26, sats: [3] },
  { radius: 1.85, incl: 0.12, raan: 0.6, speed: 0.14, sats: [0.5] },
];
const TRAIL = 0.9; // rad of arc drawn behind each satellite

function fibonacciSphere(n: number): Vec[] {
  const pts: Vec[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
  }
  return pts;
}

function rotY([x, y, z]: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c + z * s, y, -x * s + z * c];
}

function rotX([x, y, z]: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a);
  return [x, y * c - z * s, y * s + z * c];
}

function rotZ([x, y, z]: Vec, a: number): Vec {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - y * s, x * s + y * c, z];
}

function orbitPoint(o: Orbit, phase: number): Vec {
  let p: Vec = [Math.cos(phase) * o.radius, 0, Math.sin(phase) * o.radius];
  p = rotX(p, o.incl);
  p = rotY(p, o.raan);
  return rotZ(p, TILT);
}

export function globe(canvas: HTMLCanvasElement): Animation {
  let ctx: CanvasRenderingContext2D;
  let w = 0, h = 0, cx = 0, cy = 0, R = 0;
  let dots: Vec[] = [];
  let stars: [number, number, number][] = [];

  const anim: Animation = {
    el: canvas,
    resize() {
      ({ ctx, w, h } = fitCanvas(canvas));
      const wide = w > h * 1.1;
      R = Math.min(w, h) * (wide ? 0.34 : 0.29);
      cx = wide ? w * 0.64 : w * 0.54;
      cy = h * (wide ? 0.4 : 0.33);
      dots = fibonacciSphere(Math.round(Math.min(1400, Math.max(500, R * R * 0.12))));
      stars = Array.from({ length: Math.round((w * h) / 2600) }, () => [Math.random() * w, Math.random() * h, Math.random()]);
    },
    frame(t) {
      const light = lightScheme.matches;
      const accent = light ? '0,113,227' : '41,151,255';
      const ink = light ? '29,29,31' : '235,240,255';
      ctx.clearRect(0, 0, w, h);

      // Stars twinkle gently.
      if (!light) {
        for (const [x, y, s] of stars) {
          ctx.fillStyle = `rgba(255,255,255,${0.12 + 0.35 * s * (0.6 + 0.4 * Math.sin(t * (0.6 + s) + s * 20))})`;
          ctx.fillRect(x, y, s > 0.85 ? 1.6 : 1, s > 0.85 ? 1.6 : 1);
        }
      }

      // Atmosphere glow.
      const glow = ctx.createRadialGradient(cx, cy, R * 0.8, cx, cy, R * 1.55);
      glow.addColorStop(0, `rgba(${accent},${light ? 0.18 : 0.28})`);
      glow.addColorStop(1, `rgba(${accent},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2);
      ctx.fill();

      // Globe body: a soft sphere so dots on the back side stay subdued.
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, light ? 'rgba(255,255,255,0.9)' : 'rgba(40,60,110,0.55)');
      body.addColorStop(1, light ? 'rgba(220,228,245,0.85)' : 'rgba(5,8,20,0.9)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();

      const spin = t * 0.12;
      const orbits = ORBITS.map((o) => ({ o, phase: t * o.speed }));

      // Orbit paths and satellites behind the globe first, then dots, then the front.
      const drawOrbits = (front: boolean) => {
        for (const { o, phase } of orbits) {
          const steps = 120;
          ctx.lineWidth = 1;
          for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            const p = orbitPoint(o, a);
            const q = orbitPoint(o, a + (Math.PI * 2) / steps);
            const isFront = p[2] >= 0;
            if (isFront !== front) continue;
            if (!front && p[0] ** 2 + p[1] ** 2 < 1) continue; // hidden by the globe
            ctx.strokeStyle = `rgba(${accent},${front ? 0.22 : 0.08})`;
            ctx.beginPath();
            ctx.moveTo(cx + p[0] * R, cy - p[1] * R);
            ctx.lineTo(cx + q[0] * R, cy - q[1] * R);
            ctx.stroke();
          }
          for (const off of o.sats) {
            const head = orbitPoint(o, phase + off);
            const isFront = head[2] >= 0;
            if (isFront !== front) continue;
            if (!front && head[0] ** 2 + head[1] ** 2 < 1) continue;
            // Trail.
            const seg = 24;
            ctx.lineCap = 'round';
            for (let i = 0; i < seg; i++) {
              const a0 = phase + off - (TRAIL * i) / seg;
              const a1 = phase + off - (TRAIL * (i + 1)) / seg;
              const p = orbitPoint(o, a0);
              const q = orbitPoint(o, a1);
              if (p[2] < 0 && p[0] ** 2 + p[1] ** 2 < 1) break;
              ctx.strokeStyle = `rgba(${accent},${(1 - i / seg) * (front ? 0.9 : 0.35)})`;
              ctx.lineWidth = 2 * (1 - i / seg) + 0.4;
              ctx.beginPath();
              ctx.moveTo(cx + p[0] * R, cy - p[1] * R);
              ctx.lineTo(cx + q[0] * R, cy - q[1] * R);
              ctx.stroke();
            }
            const x = cx + head[0] * R;
            const y = cy - head[1] * R;
            const halo = ctx.createRadialGradient(x, y, 0, x, y, 12);
            halo.addColorStop(0, `rgba(${accent},${front ? 0.7 : 0.25})`);
            halo.addColorStop(1, `rgba(${accent},0)`);
            ctx.fillStyle = halo;
            ctx.beginPath();
            ctx.arc(x, y, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = front ? (light ? '#fff' : '#fff') : `rgba(${ink},0.5)`;
            ctx.beginPath();
            ctx.arc(x, y, front ? 2.4 : 1.6, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      };

      drawOrbits(false);

      // Globe dots, lit from the upper left.
      for (const d of dots) {
        const p = rotZ(rotY(d, spin), TILT);
        if (p[2] < 0) continue;
        const shade = 0.25 + 0.75 * Math.max(0, p[2] * 0.6 - p[0] * 0.3 + p[1] * 0.4);
        const size = 0.6 + p[2] * 1.1;
        ctx.fillStyle = `rgba(${ink},${(0.18 + 0.62 * shade) * p[2] + 0.05})`;
        ctx.beginPath();
        ctx.arc(cx + p[0] * R, cy - p[1] * R, size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rim light.
      ctx.strokeStyle = `rgba(${accent},${light ? 0.35 : 0.5})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      drawOrbits(true);
    },
  };
  return anim;
}
