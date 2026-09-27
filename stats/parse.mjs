// Turns raw request data into the few categories the dashboard shows. Nothing here is stored raw.

/** Crawlers, link previews, scripts and headless browsers are not visitors. */
export function isBot(ua) {
  return !ua || /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|headless|lighthouse|curl|wget|python|go-http|java\/|node-fetch|axios|okhttp/i.test(ua);
}

/** Device type, operating system and browser from the user agent (plus a touch hint for iPadOS). */
export function device(ua = '', touch = false) {
  let type = 'Desktop';
  let os = 'Andere';
  if (/iPhone|iPod/.test(ua)) (type = 'Handy'), (os = 'iOS');
  else if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) (type = 'Tablet'), (os = 'iPadOS');
  else if (/Android/.test(ua)) (type = /Mobile/.test(ua) ? 'Handy' : 'Tablet'), (os = 'Android');
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Macintosh|Mac OS X/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  let browser = 'Andere';
  if (/Instagram/.test(ua)) browser = 'Instagram (App)';
  else if (/FBAN|FBAV/.test(ua)) browser = 'Facebook (App)';
  else if (/LinkedInApp/.test(ua)) browser = 'LinkedIn (App)';
  else if (/SamsungBrowser/.test(ua)) browser = 'Samsung Internet';
  else if (/Edg(e|A|iOS)?\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox|FxiOS/.test(ua)) browser = 'Firefox';
  else if (/Chrome|CriOS/.test(ua)) browser = 'Chrome';
  else if (/Safari/.test(ua)) browser = 'Safari';
  return { type, os, browser };
}

const SOURCES = [
  [/(^|\.)linkedin\.com$|^lnkd\.in$/, 'LinkedIn'],
  [/(^|\.)google\.[a-z.]+$/, 'Google'],
  [/(^|\.)bing\.com$/, 'Bing'],
  [/(^|\.)duckduckgo\.com$/, 'DuckDuckGo'],
  [/(^|\.)ecosia\.org$/, 'Ecosia'],
  [/(^|\.)github\.com$/, 'GitHub'],
  [/(^|\.)whatsapp\.com$|^wa\.me$/, 'WhatsApp'],
  [/(^|\.)instagram\.com$/, 'Instagram'],
  [/(^|\.)facebook\.com$/, 'Facebook'],
  [/^t\.co$|(^|\.)x\.com$|(^|\.)twitter\.com$/, 'X'],
  [/^(counter|tracker)\.hugobarthelmess\.de$/, 'Eigene Projekte'],
];

/**
 * Where a visit came from: an explicit ?ref=/utm_source= tag wins (e.g. links on a profile),
 * otherwise the referrer's host, mapped to a readable name. No referrer = typed in, QR code or an
 * app that hides it (WhatsApp usually does).
 */
export function source(referrer, tag) {
  if (tag) {
    const t = String(tag).toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 32);
    if (t) return t;
  }
  if (!referrer) return 'Direkt';
  let host;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, '');
  } catch {
    return 'Direkt';
  }
  if (host === 'hugobarthelmess.de' || host === 'localhost' || host === '127.0.0.1') return 'Direkt';
  for (const [re, name] of SOURCES) if (re.test(host)) return name;
  return host.slice(0, 64);
}

/** Screen size bucket, e.g. "390×844". Unknown or silly values are dropped. */
export function screen(w, h) {
  const W = Math.round(Number(w));
  const H = Math.round(Number(h));
  if (!(W > 100 && W < 10000 && H > 100 && H < 10000)) return null;
  return `${W}×${H}`;
}

export const clip = (v, n = 16) => (typeof v === 'string' && v ? v.replace(/[^\w.:-]/g, '').slice(0, n) || null : null);
