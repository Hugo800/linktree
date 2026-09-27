/**
 * Full-screen pages (projects, then live data + contact) with a pager on the right.
 * Touch scrolling stays native (CSS scroll snapping does the paging). Wheel, arrow keys and the
 * dots move exactly one page with a slow, heavy ease. Until the visitor takes over, the pages
 * advance on their own every few seconds and stop on the last one.
 */
const DURATION = 1000; // ms per page
const QUIET = 180; // ms without wheel events before a new gesture may turn the page
const AUTO = 5000; // ms on a page before autoplay moves on

// Slow start, fast middle, long braking (close to cubic-bezier(0.7, 0, 0.2, 1)).
const ease = (t: number) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);

export function pager(root: HTMLElement) {
  const pages = [...document.querySelectorAll<HTMLElement>('.intro, .links')];
  const dots = [...document.querySelectorAll<HTMLButtonElement>('.pager [data-page]')];
  const layout = matchMedia('(min-height: 640px)'); // same condition as the CSS
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let current = -1;
  let animating = false;

  const setCurrent = (i: number) => {
    if (i === current) return;
    current = i;
    pages.forEach((p, k) => p.classList.toggle('is-current', k === i));
    dots.forEach((d, k) => (k === i ? d.setAttribute('aria-current', 'true') : d.removeAttribute('aria-current')));
  };

  // Scroll position that centres page i (the start page sits at the very top).
  const target = (i: number) => {
    const max = document.scrollingElement!.scrollHeight - innerHeight;
    if (i === 0) return 0;
    const r = pages[i].getBoundingClientRect();
    return Math.max(0, Math.min(max, scrollY + r.top + r.height / 2 - innerHeight / 2));
  };

  // The page closest to the middle of the screen is the current one.
  const nearest = () => {
    let best = 0;
    let bestDist = Infinity;
    pages.forEach((p, k) => {
      const r = p.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - innerHeight / 2);
      if (d < bestDist) (best = k), (bestDist = d);
    });
    return best;
  };

  /* ---------- Autoplay ---------- */
  // Runs until the first sign that someone is steering (wheel, key, touch, click); the active dot
  // fills up meanwhile. Off with reduced motion and in the short-window layout.
  let auto = !reducedMotion.matches && layout.matches;
  let timer = 0;

  const schedule = () => {
    clearTimeout(timer);
    // Restart the fill animation of the active dot.
    root.classList.remove('pager-auto');
    if (!auto || document.hidden || current >= pages.length - 1) return;
    void root.offsetWidth;
    root.classList.add('pager-auto');
    timer = window.setTimeout(() => go(current + 1, true), AUTO);
  };

  const stopAuto = () => {
    if (!auto) return;
    auto = false;
    schedule();
  };

  const go = (i: number, fromAuto = false) => {
    if (!fromAuto) stopAuto();
    i = Math.max(0, Math.min(pages.length - 1, i));
    const from = scrollY;
    const to = target(i);
    setCurrent(i);
    if (reducedMotion.matches || Math.abs(to - from) < 1) {
      scrollTo(0, to);
      schedule();
      return;
    }
    // Snapping would pull every intermediate position back to a page, so it pauses meanwhile.
    animating = true;
    root.classList.remove('pager-auto');
    root.style.scrollSnapType = 'none';
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / DURATION);
      scrollTo(0, from + (to - from) * ease(p));
      if (p < 1) requestAnimationFrame(step);
      else {
        root.style.scrollSnapType = '';
        animating = false;
        schedule();
      }
    };
    requestAnimationFrame(step);
  };

  let ticking = false;
  addEventListener(
    'scroll',
    () => {
      if (animating || ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        setCurrent(nearest());
      });
    },
    { passive: true },
  );

  // One gesture (a mouse-wheel burst or a trackpad swipe including its inertia) = one page.
  let lastWheel = 0;
  let used = false;
  addEventListener(
    'wheel',
    (e) => {
      if (!layout.matches || e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      stopAuto();
      const now = performance.now();
      if (now - lastWheel > QUIET) used = false;
      lastWheel = now;
      if (used || animating || Math.abs(e.deltaY) < 4) return;
      used = true;
      go(current + Math.sign(e.deltaY));
    },
    { passive: false },
  );

  addEventListener('keydown', (e) => {
    stopAuto();
    if (!layout.matches || e.altKey || e.ctrlKey || e.metaKey) return;
    const onPage = e.target === document.body;
    let to: number | null = null;
    if (e.key === 'ArrowDown' || e.key === 'PageDown' || (e.key === ' ' && onPage && !e.shiftKey)) to = current + 1;
    else if (e.key === 'ArrowUp' || e.key === 'PageUp' || (e.key === ' ' && onPage && e.shiftKey)) to = current - 1;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = pages.length - 1;
    if (to === null) return;
    e.preventDefault();
    if (!animating) go(to);
  });

  addEventListener('touchstart', stopAuto, { passive: true });
  addEventListener('pointerdown', stopAuto, { passive: true });
  document.addEventListener('visibilitychange', schedule); // hidden: pause; back: this page again from zero
  layout.addEventListener('change', () => !layout.matches && stopAuto());

  document.querySelectorAll<HTMLElement>('[data-page]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.page))));

  setCurrent(nearest());
  root.classList.add('pager-ready');
  // A reload in the middle of the page means someone was already reading: no autoplay then.
  if (current !== 0) auto = false;
  schedule();
}
