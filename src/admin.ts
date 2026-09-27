/**
 * /#admin: statistics dashboard for the numbers collected by stats/server.mjs.
 * Loaded on demand, German only (one reader). All data goes into the DOM as text, never as HTML.
 */
import './admin.css';

interface Counts {
  views: number;
  visitors: number;
  clicks: number;
}
type Dim = Record<string, Counts>;
interface Live {
  since: number;
  city: string | null;
  country: string | null;
  type: string;
  os: string;
  browser: string;
  source: string;
  lastClick: { target: string; at: number } | null;
}
interface Stats {
  days: number;
  from: string;
  to: string;
  perDay: Record<string, Counts>;
  dims: Record<'hour' | 'country' | 'city' | 'type' | 'os' | 'browser' | 'source' | 'lang' | 'theme' | 'screen' | 'target', Dim>;
  live: Live[];
  recent: { ts: number; target: string; city: string | null; country: string | null; device: string }[];
  geo: boolean;
}

const TOKEN = 'stats-token';
const RANGES: [number, string][] = [
  [1, 'Heute'],
  [7, '7 Tage'],
  [30, '30 Tage'],
  [90, '90 Tage'],
  [3650, 'Alles'],
];
const TARGETS: Record<string, string> = {
  atlas: 'Orbital Atlas',
  padel: 'Padel Score',
  github: 'GitHub',
  linkedin: 'LinkedIn',
  mail: 'E-Mail schreiben',
  copy: 'E-Mail kopiert',
  'lang-de': 'Sprache → Deutsch',
  'lang-en': 'Sprache → Englisch',
};

const nf = new Intl.NumberFormat('de-DE');
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* private mode: stays logged in until reload */
    }
  },
};

/** Tiny element helper: h('div.a.b', {attr}, ...children); strings become text nodes. */
function h<K extends keyof HTMLElementTagNameMap>(sel: K | `${K}.${string}`, attrs: Record<string, string> = {}, ...kids: (Node | string | null | false)[]) {
  const [tag, ...cls] = sel.split('.');
  const el = document.createElement(tag as K);
  if (cls.length) el.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const k of kids) if (k !== null && k !== false) el.append(k);
  return el;
}

const flag = (cc: string | null) =>
  cc && /^[A-Z]{2}$/.test(cc) ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) + ' ' : '';

const ago = (ts: number) => {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  return `vor ${Math.round(s / 3600)} h`;
};

export function admin() {
  document.title = 'Insights · Hugo Barthelmeß';
  const root = h('main.admin');
  document.body.append(root);
  let range = Number(store.get('stats-range')) || 30;
  let timer = 0;

  const logout = () => {
    store.set(TOKEN, null);
    clearInterval(timer);
    login();
  };

  /* ---------- Login ---------- */
  function login(message = '') {
    const input = h('input.admin-input', { type: 'password', autocomplete: 'current-password', placeholder: 'Passwort', 'aria-label': 'Passwort' });
    const error = h('p.admin-error', { role: 'alert' }, message);
    const button = h('button.pill.pill-primary', { type: 'submit' }, 'Anmelden');
    const form = h('form.admin-card.admin-login', {}, h('h1.admin-title', {}, 'Insights'), h('p.admin-sub', {}, 'hugobarthelmess.de'), input, button, error);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      button.setAttribute('disabled', '');
      error.textContent = '';
      try {
        const res = await fetch('/api/login', { method: 'POST', body: JSON.stringify({ password: input.value }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(res.status === 429 ? 'Zu viele Versuche, bitte kurz warten.' : res.status === 503 ? 'Auf dem Server ist kein Passwort gesetzt.' : 'Falsches Passwort.');
        store.set(TOKEN, data.token);
        store.set('stats-optout', '1'); // this device does not count as a visitor any more
        dashboard();
      } catch (err) {
        error.textContent = err instanceof Error ? err.message : 'Anmeldung fehlgeschlagen.';
      } finally {
        button.removeAttribute('disabled');
      }
    });
    root.replaceChildren(form);
    input.focus();
  }

  /* ---------- Dashboard ---------- */
  async function load(): Promise<Stats | null> {
    const res = await fetch(`/api/stats?days=${range}`, { headers: { Authorization: `Bearer ${store.get(TOKEN)}` } });
    if (res.status === 401) {
      store.set(TOKEN, null);
      login('Bitte neu anmelden.');
      return null;
    }
    if (!res.ok) throw new Error(`Server antwortet mit ${res.status}`);
    return res.json();
  }

  async function dashboard() {
    clearInterval(timer);
    let data: Stats | null;
    try {
      data = await load();
    } catch (e) {
      root.replaceChildren(h('div.admin-card', {}, h('p.admin-error', {}, `Statistik nicht erreichbar: ${e instanceof Error ? e.message : e}`)));
      return;
    }
    if (!data) return;
    render(data);
    timer = window.setInterval(async () => {
      if (document.hidden) return;
      const fresh = await load().catch(() => null);
      if (fresh) render(fresh);
    }, 30_000);
  }

  function render(s: Stats) {
    const days = Object.values(s.perDay);
    const total = days.reduce((a, d) => ({ views: a.views + d.views, visitors: a.visitors + d.visitors, clicks: a.clicks + d.clicks }), { views: 0, visitors: 0, clicks: 0 });

    const seg = h('div.admin-seg', { role: 'group', 'aria-label': 'Zeitraum' });
    for (const [n, label] of RANGES) {
      const b = h('button', { type: 'button', 'aria-pressed': String(n === range) }, label);
      b.addEventListener('click', () => {
        range = n;
        store.set('stats-range', String(n));
        dashboard();
      });
      seg.append(b);
    }
    const out = h('button.pill', { type: 'button' }, 'Abmelden');
    out.addEventListener('click', logout);

    root.replaceChildren(
      h('header.admin-head', {}, h('div', {}, h('h1.admin-title', {}, 'Insights'), h('p.admin-sub', {}, `hugobarthelmess.de · ${s.from} bis ${s.to}`)), seg, out),
      h(
        'section.admin-kpis',
        {},
        kpi('Aufrufe', total.views),
        kpi('Besucher', total.visitors, 'je Tag gezählt'),
        kpi('Klicks', total.clicks),
        kpi('Live', s.live.length, 'gerade auf der Seite', true),
      ),
      h('section.admin-grid', {}, card('Verlauf', timeline(s), 'wide'), card('Uhrzeit', hours(s.dims.hour)), card('Link-Klicks', bars(s.dims.target, 'clicks', (k) => TARGETS[k] ?? k)), card('Standorte', cities(s), 'tall'), card('Länder', bars(s.dims.country, 'views', (k) => { const [cc, name] = k.split('|'); return flag(cc) + (name || cc); })), card('Geräte', bars(s.dims.type, 'views')), card('Betriebssystem', bars(s.dims.os, 'views')), card('Browser', bars(s.dims.browser, 'views')), card('Herkunft', bars(s.dims.source, 'views')), card('Sprache', bars(s.dims.lang, 'views', (k) => (k === 'de' ? 'Deutsch' : k === 'en' ? 'Englisch' : k))), card('Theme', bars(s.dims.theme, 'views', (k) => (k === 'dark' ? 'Dunkel' : k === 'light' ? 'Hell' : k))), card('Bildschirm', bars(s.dims.screen, 'views', undefined, 8)), card('Live', liveList(s), 'wide')),
      h(
        'footer.admin-foot',
        {},
        s.geo ? '' : 'GeoIP-Datenbank noch nicht geladen – Standorte fehlen. ',
        'Standortdaten: ',
        h('a', { href: 'https://db-ip.com', rel: 'noopener' }, 'IP Geolocation by DB-IP'),
        ' (CC BY 4.0). Ohne Cookies, IP-Adressen werden nicht gespeichert.',
      ),
    );
  }

  function kpi(label: string, value: number, hint = '', live = false) {
    return h('div.admin-card.admin-kpi', {}, h('span.admin-kpi-label', {}, live ? h('span.live-dot', { 'aria-hidden': 'true' }) : null, label), h('span.admin-kpi-value', {}, nf.format(value)), hint ? h('span.admin-kpi-hint', {}, hint) : null);
  }

  function card(title: string, body: Node, size = '') {
    return h(`section.admin-card.admin-box${size ? `.is-${size}` : ''}` as 'section', {}, h('h2.admin-box-title', {}, title), body);
  }

  function empty() {
    return h('p.admin-empty', {}, 'Noch keine Daten.');
  }

  /** Horizontal bars, largest first. */
  function bars(dim: Dim, field: keyof Counts, label: (k: string) => string = (k) => k, limit = 10) {
    const rows = Object.entries(dim)
      .filter(([, c]) => c[field] > 0)
      .sort((a, b) => b[1][field] - a[1][field]);
    if (!rows.length) return empty();
    const max = rows[0][1][field];
    const list = h('ol.admin-bars');
    for (const [k, c] of rows.slice(0, limit)) {
      const fill = h('span.admin-bar-fill');
      fill.style.width = `${(c[field] / max) * 100}%`;
      list.append(h('li', {}, h('span.admin-bar-label', {}, label(k)), h('span.admin-bar', { 'aria-hidden': 'true' }, fill), h('span.admin-bar-value', {}, nf.format(c[field]))));
    }
    if (rows.length > limit) list.append(h('li.admin-more', {}, `+ ${rows.length - limit} weitere`));
    return list;
  }

  function cities(s: Stats) {
    const dim: Dim = {};
    for (const [k, c] of Object.entries(s.dims.city)) dim[k] = c;
    return bars(dim, 'views', (k) => {
      const [city, cc] = k.split('|');
      return flag(cc) + city;
    }, 12);
  }

  /** Views per day as columns, visitors as the darker inner part. */
  function timeline(s: Stats) {
    const days: string[] = [];
    const start = s.days > 400 ? Object.keys(s.perDay).sort()[0] ?? s.to : s.from;
    for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= s.to; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
    const vals = days.map((d) => s.perDay[d] ?? { views: 0, visitors: 0, clicks: 0 });
    const max = Math.max(1, ...vals.map((v) => v.views));
    if (!vals.some((v) => v.views)) return empty();

    const ns = 'http://www.w3.org/2000/svg';
    const W = Math.max(days.length * 10, 100);
    const H = 100;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('class', 'admin-chart');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `Aufrufe pro Tag, höchstens ${max}`);
    const step = W / days.length;
    vals.forEach((v, i) => {
      for (const [n, cls] of [
        [v.views, 'views'],
        [v.visitors, 'visitors'],
      ] as const) {
        if (!n) continue;
        const r = document.createElementNS(ns, 'rect');
        const bh = (n / max) * (H - 4);
        r.setAttribute('x', String(i * step + step * 0.15));
        r.setAttribute('width', String(step * 0.7));
        r.setAttribute('y', String(H - bh));
        r.setAttribute('height', String(bh));
        r.setAttribute('class', `admin-col-${cls}`);
        const t = document.createElementNS(ns, 'title');
        t.textContent = `${days[i]}: ${v.views} Aufrufe, ${v.visitors} Besucher, ${v.clicks} Klicks`;
        r.append(t);
        svg.append(r);
      }
    });
    const axis = h('div.admin-axis', {}, h('span', {}, days[0]), h('span', {}, `max. ${nf.format(max)} / Tag`), h('span', {}, days[days.length - 1]));
    const legend = h('div.admin-legend', {}, h('span.is-views', {}, 'Aufrufe'), h('span.is-visitors', {}, 'Besucher'));
    return h('div', {}, svg, axis, legend);
  }

  function hours(dim: Dim) {
    const vals = Array.from({ length: 24 }, (_, i) => dim[String(i)]?.views ?? 0);
    const max = Math.max(1, ...vals);
    if (!vals.some(Boolean)) return empty();
    const row = h('div.admin-hours');
    vals.forEach((v, i) => {
      const col = h('span.admin-hour', { title: `${i}–${i + 1} Uhr: ${v} Aufrufe` });
      const fill = h('span');
      fill.style.height = `${(v / max) * 100}%`;
      col.append(fill);
      row.append(col);
    });
    return h('div', {}, row, h('div.admin-axis', {}, h('span', {}, '0 Uhr'), h('span', {}, '12 Uhr'), h('span', {}, '23 Uhr')));
  }

  function liveList(s: Stats) {
    const now = h('ul.admin-live');
    for (const v of s.live.slice(0, 12)) {
      const where = v.city ? flag(v.country) + v.city : v.country ? flag(v.country) + v.country : 'Ort unbekannt';
      now.append(
        h('li', {}, h('span.live-dot', { 'aria-hidden': 'true' }), h('span', {}, `${where} · ${v.type} · ${v.os} · ${v.browser}`), h('span.admin-muted', {}, `seit ${ago(v.since).replace('vor ', '')} · über ${v.source}${v.lastClick ? ` · zuletzt: ${TARGETS[v.lastClick.target] ?? v.lastClick.target}` : ''}`)),
      );
    }
    if (s.live.length > 12) now.append(h('li.admin-muted', {}, `+ ${s.live.length - 12} weitere`));
    if (!s.live.length) now.append(h('li.admin-muted', {}, 'Gerade niemand auf der Seite.'));

    const recent = h('ul.admin-recent');
    for (const r of s.recent) recent.append(h('li', {}, h('span', {}, TARGETS[r.target] ?? r.target), h('span.admin-muted', {}, `${r.city ? flag(r.country) + r.city + ' · ' : ''}${r.device ?? ''} · ${ago(r.ts)}`)));
    if (!s.recent.length) recent.append(h('li.admin-muted', {}, 'Noch keine Klicks.'));

    return h('div.admin-live-grid', {}, h('div', {}, h('h3.admin-sub', {}, 'Jetzt'), now), h('div', {}, h('h3.admin-sub', {}, 'Letzte Klicks'), recent));
  }

  if (store.get(TOKEN)) dashboard();
  else login();
}
