import { defineConfig } from 'vite';

// Same policy as deploy/nginx.conf, so `npm run preview` shows CSP violations before they go live.
const csp =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

// In production nginx forwards /live/* to the neighbouring containers (deploy/nginx.conf);
// locally the public sites stand in for them.
const live = {
  '/live/padel': { target: 'https://counter.hugobarthelmess.de', changeOrigin: true, rewrite: () => '/healthz' },
  '/live/iss.tle': {
    target: 'https://tracker.hugobarthelmess.de',
    changeOrigin: true,
    rewrite: () => '/tle/gp.php?GROUP=stations&FORMAT=tle',
  },
};

export default defineConfig({
  server: { proxy: live },
  preview: { headers: { 'Content-Security-Policy': csp }, proxy: live },
});
