import { defineConfig } from 'vite';

// Same policy as deploy/nginx.conf, so `npm run preview` shows CSP violations before they go live.
const csp =
  "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'";

export default defineConfig({
  preview: { headers: { 'Content-Security-Policy': csp } },
});
