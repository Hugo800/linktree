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
- `public/og.jpg` (1200 × 630, JPEG so link previews stay well under the size limits of messengers) is
  the link preview image. Regenerate it after visible changes, e.g. with headless Chrome against
  `npm run dev` (a shorter time budget can catch the entrance animation half done):
  `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars --force-dark-mode --force-prefers-reduced-motion --window-size=1200,630 --virtual-time-budget=10000 --screenshot=/tmp/og.png "http://localhost:5173/?lang=en"`
  then `sips -s format jpeg -s formatOptions 82 /tmp/og.png --out public/og.jpg`.

## Statistics (/#admin)

`stats/` is a small Node service without dependencies (SQLite via `node:sqlite`, own reader for the
DB-IP "IP to City Lite" database, fetched monthly into its volume). The page sends a view, a
heartbeat every 30 s and clicks on `[data-track]` elements to `/api/e` (`src/track.ts`), no cookies,
nothing stored in the browser, off with Do Not Track/GPC. The IP is only used in memory for the city
lookup and a visitor hash with a daily salt; single events are kept 90 days, then daily totals.
`/#admin` loads the dashboard (`src/admin.ts`) after logging in with `ADMIN_PASSWORD`; the logged-in
device is no longer counted.

Locally: `npm run stats` (password `dev`, data in `stats/.data`) next to `npm run dev`.
On the server the password lives in `~/linktree/stats.env` (`ADMIN_PASSWORD=…`, chmod 600).

## Deployment

Live on https://hugobarthelmess.de since 26 September 2026.

`deploy/` holds Dockerfile, nginx config (with CSP and security headers) and a compose file that
joins the `web-stack_default` network on the OTC server, like the other projects. The web-stack
nginx terminates TLS for `hugobarthelmess.de` (template `hugobarthelmess.conf.template`) and
proxies to the `linktree` container. On the server: `~/linktree/repo` (clone), `~/linktree/deploy.sh`,
`~/linktree/.deployed` (live commit).

Every green push to `main` deploys via `.github/workflows/ci.yml`: the job logs in over SSH with a
key that is restricted to `~/linktree/deploy.sh` (source: `deploy/server-deploy.sh`). That script
fetches the commit into `~/linktree/repo` (read-only deploy key), rebuilds the image and swaps the
container. The deploy job only runs while the repository variable `DEPLOY_ENABLED` is `true`.

One-time setup of keys, secrets and that variable: run `deploy/setup-ci.sh` on the Mac.
By hand on the server: `~/linktree/deploy.sh main`.

Until September 2026 the apex domain served Padel Score (now `counter.hugobarthelmess.de`).
`public/sw.js` replaces its old service worker so returning visitors are not stuck on a cached copy,
and `#admin` forwards to the counter subdomain.
