import './style.css';
import { register } from './anim/loop';
import { globe } from './anim/globe';
import { contrib } from './anim/contrib';
import { score } from './anim/score';

// Until September 2026 this domain served Padel Score. Its admin link now lives on the subdomain.
if (location.hash === '#admin') location.replace('https://counter.hugobarthelmess.de/#admin');

// Drop the old Padel Score service worker if it is still around (public/sw.js does the same
// for visitors whose browser checks for an update first).
navigator.serviceWorker?.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));

/* ---------- Language ---------- */
const root = document.documentElement;
const langButtons = document.querySelectorAll<HTMLButtonElement>('[data-set-lang]');
const langSwitch = document.querySelector<HTMLElement>('.lang-switch');

function setLang(lang: string, save: boolean) {
  root.dataset.lang = lang;
  root.lang = lang;
  langButtons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.setLang === lang)));
  langSwitch?.setAttribute('aria-label', lang === 'de' ? 'Sprache' : 'Language');
  if (save) {
    try {
      localStorage.setItem('lang', lang);
    } catch {
      /* private mode: the choice just is not remembered */
    }
    // A ?lang= in the address wins over the saved choice in boot.js, so keep it in step.
    const url = new URL(location.href);
    if (url.searchParams.has('lang')) {
      url.searchParams.set('lang', lang);
      history.replaceState(history.state, '', url);
    }
  }
}

setLang(root.dataset.lang === 'de' ? 'de' : 'en', false);
langButtons.forEach((b) => b.addEventListener('click', () => setLang(b.dataset.setLang!, true)));

/* ---------- Avatar ---------- */
const avatar = document.querySelector<HTMLImageElement>('.avatar-img')!;
const showAvatar = () => avatar.classList.add('is-loaded');
if (avatar.complete) {
  if (avatar.naturalWidth) showAvatar();
  else avatar.remove(); // failed before this module ran; the monogram stays visible
} else {
  avatar.addEventListener('load', showAvatar, { once: true });
  avatar.addEventListener('error', () => avatar.remove(), { once: true }); // monogram stays visible
}

/* ---------- Copy e-mail ---------- */
document.querySelectorAll<HTMLButtonElement>('[data-copy]').forEach((btn) => {
  let timer = 0;
  // The visible "Copied" is aria-hidden; screen readers hear it through the status region.
  const status = btn.parentElement?.querySelector<HTMLElement>('[role="status"]');
  const done = btn.querySelector<HTMLElement>('.copy-done');
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy!);
    } catch {
      location.href = `mailto:${btn.dataset.copy}`;
      return;
    }
    btn.classList.add('is-copied');
    if (status && done) status.textContent = done.innerText; // current language only
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      btn.classList.remove('is-copied');
      if (status) status.textContent = '';
    }, 1800);
  });
});

/* ---------- Pointer: spotlight, tilt, aurora ---------- */
const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

document.querySelectorAll<HTMLElement>('.tile').forEach((tile) => {
  tile.addEventListener('pointermove', (e) => {
    const r = tile.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    tile.style.setProperty('--mx', `${x * 100}%`);
    tile.style.setProperty('--my', `${y * 100}%`);
    if (finePointer.matches && !reducedMotion.matches) {
      const max = tile.classList.contains('tile-small') ? 6 : 3;
      tile.style.setProperty('--rx', `${(0.5 - y) * max}deg`);
      tile.style.setProperty('--ry', `${(x - 0.5) * max}deg`);
    }
  });
  tile.addEventListener('pointerleave', () => {
    tile.style.setProperty('--rx', '0deg');
    tile.style.setProperty('--ry', '0deg');
  });
});

let pending = false;
let px = 0.5, py = 0.5;
window.addEventListener(
  'pointermove',
  (e) => {
    px = e.clientX / innerWidth;
    py = e.clientY / innerHeight;
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      root.style.setProperty('--px', px.toFixed(3));
      root.style.setProperty('--py', py.toFixed(3));
    });
  },
  { passive: true },
);

/* ---------- Tile animations ---------- */
const globeCanvas = document.querySelector<HTMLCanvasElement>('[data-anim="globe"]');
if (globeCanvas) register(globe(globeCanvas));
const contribCanvas = document.querySelector<HTMLCanvasElement>('[data-anim="contrib"]');
if (contribCanvas) register(contrib(contribCanvas));
const board = document.querySelector<HTMLElement>('.scoreboard');
if (board) register(score(board));

document.querySelectorAll('.year').forEach((el) => (el.textContent = String(new Date().getFullYear())));
