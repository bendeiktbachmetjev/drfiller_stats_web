# Dr.Filler stats

The owner's statistics site: React 19 + Vite 7 + Tailwind 4 + recharts 3, served by Railway (`drfiller_stats_web`).
The browser loads slim rows from the admin API v2 of the backend once, builds one dataset and computes every page from it.
The old dashboard still works at `/legacy/index.html`.

## Run locally

```bash
npm install
npm run dev:mock                 # fake admin API on :8323 (key: dev)
VITE_API_URL= npm run dev        # site on :5173, /api/admin is proxied to the mock
```

- Key `dev` opens the site on the mock. Any other key shows "That key didn't work."
- `?demo` and `?demo=planned` (dev server only) skip the key and use generated data; `?demo=0` turns it off.
- Mock switches: `?scenario=planned`, `?fail=<route>`, `?off=revenue|soniox`, `?stripe=test`;
  env `EMAIL_MODE=off|click|list`, `FALLBACK_ON_404=0|1`.
- `/_kit` (dev server only) shows every kit component with sample data — handy at 1440, 375 and 320 px.
- A second mock + site side by side: `MOCK_PORT=8333 npm run dev:mock` and
  `MOCK_PORT=8333 VITE_API_URL= npm run dev -- --port 5183`.

## Test and build

```bash
npm test          # TZ=Europe/Vilnius node --test "src/**/*.test.mjs"
npm run build     # dist/ (no demo code inside)
PORT=4000 npm start
```

## Data files

- `npm run sync:prices` copies the price table and the error kinds from `../backend/services/analytics/`.
- `npm run sync:benchmark <path to bench/results.json>` writes the slim benchmark file.

## Environment

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | Admin API origin. Default: the production backend. Empty = same origin (the dev proxy). |

## Layout

`src/data/` is pure (no React, no window; network only in `data/api/client.js`). Pages live in `src/pages/`,
their numbers in `src/data/metrics/<id>.js`, their words in `src/copy/en/<id>.js`.
The full specification is kept outside the repo; the final version of this README is written at integration.
