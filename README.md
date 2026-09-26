# hugobarthelmess.de

Personal link hub: projects, GitHub, LinkedIn and contact. Dark "Apple Pro" look with a bento grid,
light mode via `prefers-color-scheme`, English and German (browser language, switch top right,
`?lang=de|en`).

No framework: Vite + TypeScript, one shared `requestAnimationFrame` loop for the tile animations
(`src/anim/`), which pauses offscreen, in background tabs and with reduced motion.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + dist/
npm run preview  # built site with the production Content-Security-Policy
```

## Content

- Everything lives in `index.html`. Text in both languages sits side by side as
  `<span data-l="en">…</span><span data-l="de">…</span>`; CSS hides the other language.
- Photo: put a square `public/avatar.jpg` (at least 336 × 336 px). Without it the "HB" monogram shows.
- `public/og.png` (1200 × 630) is the link preview image. Regenerate it after visible changes, e.g.
  with headless Chrome against `npm run dev`:
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-dark-mode --window-size=1200,630 --virtual-time-budget=10000 --screenshot=public/og.png "http://localhost:5173/?lang=en"`

## Deployment

Live on https://hugobarthelmess.de since 26 September 2026.

`deploy/` holds Dockerfile, nginx config (with CSP and security headers) and a compose file that
joins the `web-stack_default` network on the OTC server, like the other projects. The web-stack
nginx terminates TLS for `hugobarthelmess.de` (template `hugobarthelmess.conf.template`) and
proxies to the `linktree` container. On the server: `~/linktree/src` (copied tree),
`~/linktree/.deployed` (live commit).

Update the live site from the Mac after committing:

```bash
deploy/push-to-server.sh
```

The CI deploy job stays skipped until the repository variable `DEPLOY_ENABLED` is `true`; it needs
a server-side `~/linktree/deploy.sh`, a restricted key in `authorized_keys` and the secrets
`DEPLOY_SSH_KEY` / `DEPLOY_KNOWN_HOSTS` (same scheme as Satellite-Tracker).

Until September 2026 the apex domain served Padel Score (now `counter.hugobarthelmess.de`).
`public/sw.js` replaces its old service worker so returning visitors are not stuck on a cached copy,
and `#admin` forwards to the counter subdomain.
