import { defineConfig } from 'vite';

// Same policy as deploy/nginx.conf, so `npm run preview` shows CSP violations before they go live.
const csp =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

// /api goes to the statistics service (stats/server.mjs); locally: npm run stats.
const api = { '/api': 'http://127.0.0.1:8787' };

export default defineConfig({
  server: { proxy: api },
  preview: { headers: { 'Content-Security-Policy': csp }, proxy: api },
});
