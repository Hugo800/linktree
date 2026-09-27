/**
 * Cookie-free visit statistics (see stats/server.mjs). Sends one page view, a heartbeat every 30 s
 * while the page is visible (for "live now"), and a click for every element with data-track.
 * Nothing is stored in the browser. Off with Do Not Track / Global Privacy Control and on the
 * admin's own devices (set when logging in to /#admin).
 */
export function track() {
  try {
    if (localStorage.getItem('stats-optout') === '1') return;
  } catch {
    /* storage blocked: track normally */
  }
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  if (nav.doNotTrack === '1' || nav.globalPrivacyControl) return;

  // Identifies this page load only, lives in memory.
  const page = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, '0')).join('');
  const send = (data: Record<string, unknown>) => {
    const body = JSON.stringify({ p: page, ...data });
    if (!navigator.sendBeacon?.('/api/e', body)) fetch('/api/e', { method: 'POST', body, keepalive: true }).catch(() => {});
  };

  const params = new URLSearchParams(location.search);
  send({
    t: 'view',
    ref: document.referrer,
    tag: params.get('ref') ?? params.get('utm_source'),
    lang: document.documentElement.lang,
    theme: matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark',
    w: screen.width,
    h: screen.height,
    touch: navigator.maxTouchPoints > 1,
  });

  document.addEventListener(
    'click',
    (e) => {
      const el = (e.target as Element | null)?.closest<HTMLElement>('[data-track]');
      if (el) send({ t: 'click', target: el.dataset.track });
    },
    { capture: true },
  );

  let beat = 0;
  const heartbeat = () => {
    clearInterval(beat);
    if (document.hidden) return;
    send({ t: 'ping' });
    beat = window.setInterval(() => send({ t: 'ping' }), 30_000);
  };
  document.addEventListener('visibilitychange', heartbeat);
  beat = window.setInterval(() => send({ t: 'ping' }), 30_000);
}
