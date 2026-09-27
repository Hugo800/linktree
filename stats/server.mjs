// Small, cookie-free statistics service for hugobarthelmess.de.
//
// POST /api/e      page view, click or heartbeat from the page (sendBeacon)
// POST /api/login  admin password -> token
// GET  /api/stats  numbers for the dashboard at /#admin (Bearer token)
//
// Privacy: the IP address is only used in memory, for the city lookup and a visitor hash with a
// salt that changes every day and is deleted afterwards, so visits cannot be linked across days.
// Single events are kept for 90 days, after that only daily totals.
import http from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { geo as openGeo } from './geo.mjs';
import { clip, device, isBot, screen, source } from './parse.mjs';

const PORT = Number(process.env.PORT || 8080);
const DATA = process.env.STATS_DATA || '/data';
const ADMIN = process.env.ADMIN_PASSWORD || '';
const KEEP_DAYS = 90;
const LIVE_MS = 70_000; // the page sends a heartbeat every 30 s
const allowHeadless = process.env.ALLOW_HEADLESS === '1'; // local tests only

const geo = openGeo(`${DATA}/geo`, { download: process.env.GEO_DOWNLOAD !== '0' });
const db = new DatabaseSync(`${DATA}/stats.db`);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY,
    ts INTEGER NOT NULL,
    day TEXT NOT NULL,
    hour INTEGER NOT NULL,
    type TEXT NOT NULL,
    target TEXT,
    visitor TEXT NOT NULL,
    country TEXT, country_name TEXT, city TEXT,
    device TEXT, os TEXT, browser TEXT,
    source TEXT, lang TEXT, theme TEXT, screen TEXT
  );
  CREATE INDEX IF NOT EXISTS events_day ON events (day);
  CREATE TABLE IF NOT EXISTS daily (
    day TEXT NOT NULL, dim TEXT NOT NULL, key TEXT NOT NULL,
    views INTEGER NOT NULL, visitors INTEGER NOT NULL, clicks INTEGER NOT NULL,
    PRIMARY KEY (day, dim, key)
  );
  CREATE TABLE IF NOT EXISTS salts (day TEXT PRIMARY KEY, salt TEXT NOT NULL);
`);

/* ---------- Time (days and hours in Leipzig) ---------- */
const berlinFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});
function berlin(ts = Date.now()) {
  const p = Object.fromEntries(berlinFmt.formatToParts(ts).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
const dayOffset = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/* ---------- Visitor hash with a daily salt ---------- */
function salt(day) {
  const row = db.prepare('SELECT salt FROM salts WHERE day = ?').get(day);
  if (row) return row.salt;
  const s = randomBytes(16).toString('hex');
  db.prepare('INSERT OR IGNORE INTO salts (day, salt) VALUES (?, ?)').run(day, s);
  db.prepare('DELETE FROM salts WHERE day < ?').run(day); // yesterday's hashes can no longer be recomputed
  return db.prepare('SELECT salt FROM salts WHERE day = ?').get(day).salt;
}
const visitorHash = (day, ip, ua) => createHash('sha256').update(`${salt(day)}|${ip}|${ua}`).digest('hex').slice(0, 16);

/* ---------- Live visitors (memory only) ---------- */
const live = new Map(); // page id -> { since, seen, city, country, type, os, browser, source, lastClick }
setInterval(() => {
  const cutoff = Date.now() - 2 * LIVE_MS;
  for (const [k, v] of live) if (v.seen < cutoff) live.delete(k);
}, 60_000).unref();

/* ---------- Rate limit per visitor (memory only) ---------- */
const budget = new Map();
function allowed(key, max) {
  const now = Date.now();
  const b = budget.get(key);
  if (!b || now - b.start > 60_000) {
    budget.set(key, { start: now, n: 1 });
    return true;
  }
  return ++b.n <= max;
}
setInterval(() => budget.clear(), 10 * 60_000).unref();

const insert = db.prepare(`
  INSERT INTO events (ts, day, hour, type, target, visitor, country, country_name, city, device, os, browser, source, lang, theme, screen)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function record(req, body) {
  const ua = String(req.headers['user-agent'] || '');
  if (!allowHeadless && isBot(ua)) return;
  let e;
  try {
    e = JSON.parse(body);
  } catch {
    return;
  }
  if (!e || !['view', 'click', 'ping'].includes(e.t)) return;
  const page = clip(e.p, 40);
  if (!page) return;
  const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
  const now = Date.now();
  const { day, hour } = berlin(now);
  const visitor = visitorHash(day, ip, ua);
  if (!allowed(visitor, 60)) return;

  let v = live.get(page);
  if (!v || e.t === 'view') {
    const g = geo.lookup(ip);
    const d = device(ua, e.touch === true);
    v = {
      since: now,
      seen: now,
      city: g?.city ?? null,
      country: g?.country ?? null,
      countryName: g?.countryName ?? null,
      type: d.type,
      os: d.os,
      browser: d.browser,
      source: source(typeof e.ref === 'string' ? e.ref.slice(0, 512) : '', e.tag),
      lang: e.lang === 'de' || e.lang === 'en' ? e.lang : null,
      theme: e.theme === 'dark' || e.theme === 'light' ? e.theme : null,
      screen: screen(e.w, e.h),
      lastClick: null,
    };
    live.set(page, v);
  }
  v.seen = now;
  if (e.t === 'ping') return;

  const target = e.t === 'click' ? clip(e.target, 24) : null;
  if (e.t === 'click' && !target) return;
  if (target) v.lastClick = { target, at: now };
  insert.run(now, day, hour, e.t, target, visitor, v.country, v.countryName, v.city, v.type, v.os, v.browser, v.source, v.lang, v.theme, v.screen);
}

/* ---------- Aggregation ---------- */
// Dimension -> SQL expression over events (fixed list, never user input).
const DIMS = {
  hour: 'hour',
  country: "country || '|' || country_name",
  city: "city || '|' || country",
  type: 'device',
  os: 'os',
  browser: 'browser',
  source: 'source',
  lang: 'lang',
  theme: 'theme',
  screen: 'screen',
  target: 'target',
};
const COUNTS = `
  COUNT(*) FILTER (WHERE type = 'view') AS views,
  COUNT(DISTINCT CASE WHEN type = 'view' THEN day || visitor END) AS visitors,
  COUNT(*) FILTER (WHERE type = 'click') AS clicks`;

/** Moves events older than KEEP_DAYS into daily totals. */
function rollup() {
  const cutoff = dayOffset(berlin().day, -KEEP_DAYS);
  const old = db.prepare('SELECT COUNT(*) AS n FROM events WHERE day < ?').get(cutoff).n;
  if (!old) return;
  const put = db.prepare(
    `INSERT INTO daily (day, dim, key, views, visitors, clicks) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (day, dim, key) DO UPDATE SET views = views + excluded.views,
       visitors = visitors + excluded.visitors, clicks = clicks + excluded.clicks`,
  );
  db.exec('BEGIN');
  try {
    for (const r of db.prepare(`SELECT day, ${COUNTS} FROM events WHERE day < ? GROUP BY day`).all(cutoff))
      put.run(r.day, 'total', '', r.views, r.visitors, r.clicks);
    for (const [dim, expr] of Object.entries(DIMS))
      for (const r of db.prepare(`SELECT day, ${expr} AS key, ${COUNTS} FROM events WHERE day < ? AND ${expr} IS NOT NULL GROUP BY day, key`).all(cutoff))
        put.run(r.day, dim, String(r.key), r.views, r.visitors, r.clicks);
    db.prepare('DELETE FROM events WHERE day < ?').run(cutoff);
    db.exec('COMMIT');
    console.log(`rollup: ${old} events before ${cutoff} -> daily totals`);
  } catch (e) {
    db.exec('ROLLBACK');
    console.error('rollup failed', e);
  }
}
rollup();
setInterval(rollup, 3600_000).unref();

function stats(days) {
  const today = berlin().day;
  const from = dayOffset(today, -(days - 1));
  const add = (map, key, r) => {
    const m = (map[key] ??= { views: 0, visitors: 0, clicks: 0 });
    m.views += Number(r.views);
    m.visitors += Number(r.visitors);
    m.clicks += Number(r.clicks);
  };

  const perDay = {};
  for (const r of db.prepare(`SELECT day, ${COUNTS} FROM events WHERE day >= ? GROUP BY day`).all(from)) add(perDay, r.day, r);
  for (const r of db.prepare("SELECT day, views, visitors, clicks FROM daily WHERE dim = 'total' AND day >= ?").all(from)) add(perDay, r.day, r);

  const dims = {};
  for (const [dim, expr] of Object.entries(DIMS)) {
    const m = (dims[dim] = {});
    for (const r of db.prepare(`SELECT ${expr} AS key, ${COUNTS} FROM events WHERE day >= ? AND ${expr} IS NOT NULL GROUP BY key`).all(from))
      add(m, String(r.key), r);
    for (const r of db.prepare('SELECT key, SUM(views) AS views, SUM(visitors) AS visitors, SUM(clicks) AS clicks FROM daily WHERE dim = ? AND day >= ? GROUP BY key').all(dim, from))
      add(m, r.key, r);
  }

  const now = Date.now();
  const active = [...live.values()]
    .filter((v) => now - v.seen < LIVE_MS)
    .sort((a, b) => b.since - a.since)
    .map((v) => ({ since: v.since, city: v.city, country: v.country, type: v.type, os: v.os, browser: v.browser, source: v.source, lastClick: v.lastClick }));
  const recent = db
    .prepare("SELECT ts, target, city, country, device FROM events WHERE type = 'click' ORDER BY ts DESC LIMIT 15")
    .all()
    .map((r) => ({ ...r }));

  return { days, from, to: today, perDay, dims, live: active, recent, geo: geo.ready };
}

/* ---------- Admin auth ---------- */
const token = () => createHmac('sha256', ADMIN).update('linktree-admin-v1').digest('hex');
function same(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

/* ---------- HTTP ---------- */
function send(res, status, data) {
  const body = data === undefined ? '' : JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req, limit = 4096) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) req.destroy();
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', () => resolve(''));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/api/e') {
      record(req, await readBody(req));
      return send(res, 204);
    }
    if (req.method === 'POST' && url.pathname === '/api/login') {
      if (!ADMIN) return send(res, 503, { error: 'ADMIN_PASSWORD not set' });
      const ip = String(req.headers['x-real-ip'] || req.socket.remoteAddress || '');
      if (!allowed(`login|${ip}`, 5)) return send(res, 429, { error: 'too many attempts' });
      let pw = '';
      try {
        pw = JSON.parse(await readBody(req, 1024)).password;
      } catch {
        /* empty */
      }
      if (!same(pw, ADMIN)) return send(res, 401, { error: 'wrong password' });
      return send(res, 200, { token: token() });
    }
    if (req.method === 'GET' && url.pathname === '/api/stats') {
      if (!ADMIN) return send(res, 503, { error: 'ADMIN_PASSWORD not set' });
      const auth = String(req.headers.authorization || '').replace(/^Bearer /, '');
      if (!same(auth, token())) return send(res, 401, { error: 'not logged in' });
      const days = Math.max(1, Math.min(3650, Math.round(Number(url.searchParams.get('days')) || 30)));
      return send(res, 200, stats(days));
    }
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, geo: geo.ready });
    send(res, 404, { error: 'not found' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'internal error' });
  }
});

server.listen(PORT, () => console.log(`stats on :${PORT}, data in ${DATA}${ADMIN ? '' : ' (no ADMIN_PASSWORD: dashboard off)'}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => (db.close(), process.exit(0))));
