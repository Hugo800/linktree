/**
 * Live tiles: where the ISS is and when it next passes over Leipzig, and how many Padel Score
 * matches are running. The data comes from the neighbouring containers through /live/* on this
 * origin (deploy/nginx.conf, vite.config.ts in dev), so the CSP can stay at 'self'.
 * A service that does not answer turns its green "live" dots grey.
 */
const DEG = Math.PI / 180;
const LEIPZIG = { latitude: 51.34 * DEG, longitude: 12.37 * DEG, height: 0.12 };
const MIN_ELEVATION = 10 * DEG; // below that, buildings and trees hide it anyway
const PADEL_EVERY = 30_000;
const ISS_EVERY = 2000;

const root = document.documentElement;
const de = () => root.lang === 'de';
const $ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
const set = (sel: string, text: string) => {
  const el = $(sel);
  if (el && el.textContent !== text) el.textContent = text;
};
const nf = (digits = 0) => new Intl.NumberFormat(de() ? 'de-DE' : 'en-GB', { maximumFractionDigits: digits, minimumFractionDigits: digits });

/** Grey out the "live" dots of every tile that belongs to a service. */
function setUp(service: 'atlas' | 'padel', up: boolean) {
  document.querySelectorAll(`[data-service="${service}"] .live-dot`).forEach((d) => d.classList.toggle('is-down', !up));
}

// Runs fn now and then every `ms` while the page is visible (and once more when it comes back).
function every(ms: number, fn: () => void) {
  let id = 0;
  const start = () => {
    clearInterval(id);
    if (document.hidden) return;
    fn();
    id = window.setInterval(fn, ms);
  };
  document.addEventListener('visibilitychange', start);
  start();
}

/* ---------- Padel Score ---------- */
interface Health {
  status: string;
  rooms: number;
  roomClients: number;
}

function padel() {
  let data: Health | null | undefined; // undefined = not loaded yet, null = unreachable

  const render = () => {
    if (data === undefined) return;
    if (!data) {
      set('[data-padel="games"]', '–');
      set('[data-padel="label"]', de() ? 'Gerade nicht erreichbar' : 'Not reachable right now');
      set('[data-padel="devices"]', '');
      return;
    }
    const { rooms, roomClients } = data;
    set('[data-padel="games"]', nf().format(rooms));
    set(
      '[data-padel="label"]',
      de() ? (rooms === 1 ? 'Spiel läuft gerade' : 'Spiele laufen gerade') : rooms === 1 ? 'match running now' : 'matches running now',
    );
    set(
      '[data-padel="devices"]',
      roomClients
        ? de()
          ? `${nf().format(roomClients)} ${roomClients === 1 ? 'Gerät' : 'Geräte'} verbunden`
          : `${nf().format(roomClients)} ${roomClients === 1 ? 'device' : 'devices'} connected`
        : rooms
          ? ''
          : de()
            ? 'Starte eins →'
            : 'Start one →',
    );
  };

  const load = async () => {
    try {
      const res = await fetch('/live/padel', { cache: 'no-store' });
      const json = (await res.json()) as Health;
      data = res.ok && json.status === 'ok' ? json : null;
    } catch {
      data = null;
    }
    setUp('padel', !!data);
    render();
  };

  every(PADEL_EVERY, load);
  return render;
}

/* ---------- ISS ---------- */
async function iss() {
  let tle: [string, string];
  try {
    const res = await fetch('/live/iss.tle');
    if (!res.ok) throw new Error(String(res.status));
    const lines = (await res.text()).split(/\r?\n/);
    const i = lines.findIndex((l) => l.startsWith('1 25544U'));
    if (i < 0 || !lines[i + 1]?.startsWith('2 25544')) throw new Error('no ISS in TLE set');
    tle = [lines[i], lines[i + 1]];
  } catch {
    setUp('atlas', false);
    set('[data-iss="alt"]', '–');
    set('[data-iss="where"]', de() ? 'Bahndaten gerade nicht verfügbar' : 'Orbit data not available right now');
    return () => {};
  }
  setUp('atlas', true);

  // Loaded only now, so the page itself stays small.
  const sat = await import('satellite.js');
  const satrec = sat.twoline2satrec(tle[0], tle[1]);

  const look = (date: Date) => {
    const pv = sat.propagate(satrec, date);
    if (typeof pv.position === 'boolean' || typeof pv.velocity === 'boolean') return null;
    const gmst = sat.gstime(date);
    return { pv, gmst, elevation: sat.ecfToLookAngles(LEIPZIG, sat.eciToEcf(pv.position, gmst)).elevation };
  };

  // Next time the ISS climbs above MIN_ELEVATION as seen from Leipzig (searched 36 h ahead).
  interface Pass {
    start: Date;
    end: Date;
    max: number;
  }
  const findPass = (from: Date): Pass | null => {
    const t0 = from.getTime();
    let t = t0;
    const above = (ms: number) => (look(new Date(ms))?.elevation ?? -1) > MIN_ELEVATION;
    if (above(t)) while (t > t0 - 20 * 60_000 && above(t - 10_000)) t -= 10_000; // already overhead
    else {
      while (t < t0 + 36 * 3600_000 && !above(t)) t += 60_000;
      if (!above(t)) return null;
      while (above(t - 5000)) t -= 5000;
    }
    let end = t;
    let max = 0;
    while (above(end)) {
      max = Math.max(max, look(new Date(end))!.elevation);
      end += 5000;
    }
    return { start: new Date(t), end: new Date(end), max };
  };

  let pass = findPass(new Date());

  const berlin = (d: Date, opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(de() ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin', ...opts }).format(d);
  const dayKey = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(d);

  const render = () => {
    const now = new Date();
    const here = look(now);
    if (!here) return;
    const geo = sat.eciToGeodetic(here.pv.position as { x: number; y: number; z: number }, here.gmst);
    const lat = sat.degreesLat(geo.latitude);
    const lon = sat.degreesLong(geo.longitude);
    const v = here.pv.velocity as { x: number; y: number; z: number };
    const speed = Math.hypot(v.x, v.y, v.z) * 3600;
    set('[data-iss="alt"]', `${nf().format(geo.height)} km`);
    set('[data-iss="where"]', `${nf(1).format(Math.abs(lat))}° ${lat >= 0 ? 'N' : 'S'} · ${nf(1).format(Math.abs(lon))}° ${lon >= 0 ? (de() ? 'O' : 'E') : 'W'}`);
    set('[data-iss="speed"]', `${nf().format(Math.round(speed / 100) * 100)} km/h`);

    if (pass && now > pass.end) pass = findPass(now);
    if (!pass) {
      set('[data-iss="pass"]', de() ? 'Kein Überflug über Leipzig in den nächsten 36 h' : 'No pass over Leipzig in the next 36 h');
      set('[data-iss="passx"]', '');
      return;
    }
    const max = `max. ${nf().format(pass.max / DEG)}°`;
    if (now >= pass.start) {
      set('[data-iss="pass"]', de() ? 'Gerade über Leipzig' : 'Over Leipzig right now');
      set('[data-iss="passx"]', max);
      return;
    }
    const diff = (Date.parse(dayKey(pass.start)) - Date.parse(dayKey(now))) / 86_400_000;
    const day =
      diff === 0 ? (de() ? 'heute' : 'today') : diff === 1 ? (de() ? 'morgen' : 'tomorrow') : berlin(pass.start, { weekday: 'long' });
    const time = berlin(pass.start, { hour: '2-digit', minute: '2-digit' }) + (de() ? ' Uhr' : '');
    const mins = Math.max(1, Math.round((pass.end.getTime() - pass.start.getTime()) / 60_000));
    set('[data-iss="pass"]', de() ? `Über Leipzig: ${day} ${time}` : `Over Leipzig: ${day} ${time}`);
    set('[data-iss="passx"]', `${mins} min · ${max}`);
  };

  // Only tick while the tile can be seen.
  const tile = $('[data-iss="alt"]')?.closest('.tile');
  let visible = true;
  if (tile) new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(tile);
  every(ISS_EVERY, () => visible && render());
  render();
  return render;
}

export function live() {
  const renderPadel = padel();
  let renderIss: () => void = () => {};
  iss().then((r) => (renderIss = r));
  // Language switch: re-render the texts right away.
  new MutationObserver(() => {
    renderPadel();
    renderIss();
  }).observe(root, { attributes: true, attributeFilter: ['lang'] });
}
