import type { Animation } from './loop';

/** A match that plays itself – the Padel Score tile. Rolls the point digits like a flip board. */

const POINTS = ['0', '15', '30', '40', 'AD'];
const RALLY = 1.7; // seconds per point

export function score(board: HTMLElement): Animation {
  const rows = [...board.querySelectorAll<HTMLElement>('.sb-row')];
  const games = rows.map((r) => r.querySelector<HTMLElement>('.sb-games')!);
  const cells = rows.map((r) => r.querySelector<HTMLElement>('.sb-points')!);
  const pts = [0, 0];
  const gms = [0, 0];
  let server = 0;
  let next = 0;

  const roll = (cell: HTMLElement, text: string) => {
    const old = cell.querySelector<HTMLElement>('.roll:not(.is-out)');
    if (old?.textContent === text) return;
    const fresh = document.createElement('span');
    fresh.className = 'roll is-in';
    fresh.textContent = text;
    cell.append(fresh);
    // Next frame: slide the new value in and the old one out.
    requestAnimationFrame(() => {
      fresh.classList.remove('is-in');
      old?.classList.add('is-out');
      setTimeout(() => old?.remove(), 600);
    });
  };

  const render = () => {
    const deuceSide = pts[0] >= 3 && pts[1] >= 3;
    for (let i = 0; i < 2; i++) {
      let label = POINTS[Math.min(pts[i], 3)];
      if (deuceSide) label = pts[i] > pts[1 - i] ? 'AD' : '40';
      roll(cells[i], label);
      if (games[i].textContent !== String(gms[i])) games[i].textContent = String(gms[i]);
      rows[i].classList.toggle('is-serving', server === i);
      rows[i].classList.toggle('is-winning', pts[i] > pts[1 - i]);
    }
  };

  const point = () => {
    // The server wins a little more often, like in a real match.
    const w = Math.random() < 0.58 ? server : 1 - server;
    pts[w]++;
    const l = 1 - w;
    if (pts[w] >= 4 && pts[w] - pts[l] >= 2) {
      gms[w]++;
      pts[0] = pts[1] = 0;
      server = 1 - server;
      if (gms[w] >= 6 && (gms[w] - gms[l] >= 2 || gms[w] === 7)) gms[0] = gms[1] = 0; // at 6-6 the next game decides (stands in for the tie-break)
    } else if (pts[0] >= 4 && pts[1] >= 4 && pts[0] === pts[1]) {
      pts[0] = pts[1] = 3; // back to deuce
    }
    render();
  };

  render();
  return {
    el: board,
    resize() {},
    frame(t, dt) {
      if (!dt) return; // still frames (reduced motion, repaints) keep the score
      if (!next) next = t + RALLY;
      if (t >= next) {
        next = t + RALLY * (0.8 + Math.random() * 0.5);
        point();
      }
    },
  };
}
