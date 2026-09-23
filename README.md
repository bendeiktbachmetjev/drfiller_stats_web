# Dr.Filler stats

The owner's statistics site. It answers nine questions, one per page:

| Page | Question |
|---|---|
| Overview | Is everything OK, and are we making money? |
| Money | How much comes in, how much we keep, and will it pay off at 100–300 doctors? |
| Costs | How much do we spend, on what, and why is it growing? |
| Requests | Which requests are big, which are small, and what does each one cost? |
| Recording | How much do we record, what does it cost, and does 1 credit per 10 minutes cover it? |
| Models | Which model answers, and is it fast and without failures? |
| Prices | What would other models and Google Cloud (Vertex) cost, and how fast are they? |
| Doctors | Who uses Dr.Filler, who pays, and what does each doctor cost us? |
| Settings (gear) | How we count: VAT, my and test accounts, forecast assumptions, prices, data sources. |

How it works, in short: the browser loads slim rows from the backend's admin API v2 once (behind the admin key),
builds one dataset and computes every page from it. A number shown on two pages comes from one function in
`src/data/core/`, so the pages always agree. The old dashboard still works at `/legacy/index.html`
("Old version" in the header).

Stack: React 19, Vite 7, Tailwind 4, recharts 3. Hosted on Railway (service `drfiller_stats_web`).

## Run locally

```bash
npm install
npm run dev:mock                 # fake admin API on :8323, key: dev
VITE_API_URL= npm run dev        # site on :5173; /api/admin goes to the mock
```

- Key `dev` opens the site on the mock. Any other key shows "That key didn't work."
- Demo data without a key (dev server only): `/overview?demo` (today's real shapes: 44 accounts, one busy
  account, ≈ €11 costs per 30 days) and `/overview?demo=planned` (100 paying doctors, ≈ 400 visits a month).
  `?demo=0` turns it off again.
- Mock switches on any page URL (dev only): `?off=revenue|soniox`, `?stripe=test`, `?fail=<route>`,
  `?scenario=planned`, `?email=off|click|list`. A sticky switch for the mock itself:
  `curl 'http://localhost:8323/api/admin/v2/__mock?off=revenue'` (`?reset=1` undoes it).
- `/_kit` (dev only) shows every UI part with sample data.
- Two setups side by side: `MOCK_PORT=8333 npm run dev:mock` and `MOCK_PORT=8333 VITE_API_URL= npm run dev -- --port 5183`.

Never point a local site at the production API while testing; use the mock or `?demo`.

## Test and build

```bash
npm test               # all tests: TZ=Europe/Vilnius node --test "src/**/*.test.mjs"
npm run build          # writes dist/ (demo data and the mock are not in it)
PORT=4000 npm start    # serves dist/: /, deep links such as /money, and /legacy/index.html
```

`src/data/__tests__/invariants.test.mjs` checks that the pages agree with each other: shared numbers are the
very same values, splits add up to totals, the account switch and the VAT switch move only what they should,
and no page result carries a uid, an e-mail or a session id.

## Data files

- `npm run sync:prices` copies the price table and the error kinds from `../backend/services/analytics/`.
  Run it after the backend's price table changes, then commit `src/data/static/`.
- `npm run sync:benchmark <path to bench/results.json>` writes the slim benchmark file used by Prices.

## Deploy (Railway)

1. The site is the `drfiller_stats_web` service, built from this repo. `railway.json` builds with
   `npm run build` and starts with `npm start` (static files, deep links go to `index.html`).
2. Work happens on the `stats-v2` branch. Merge `stats-v2` into `main` only after the owner's OK; Railway
   deploys `main`.
3. The backend must already have the admin API v2 (`/api/admin/v2/*`, pushed to backend `main`).

## Environment variables

Stats site (build time):

| Variable | Default | Meaning |
|---|---|---|
| `VITE_API_URL` | the production backend | Where the admin API lives. Empty = same origin (the dev proxy to the mock). |
| `PORT` | 3000 | Port for `npm start` (Railway sets it). |

Backend (`drfiller/backend`, Railway service of the API):

| Variable | Default | Meaning |
|---|---|---|
| `ADMIN_SECRET` | – (required) | The admin key. Without it every admin route answers 503. |
| `ADMIN_EMAIL_MODE` | `list` | `list`: doctors' e-mails come with the doctor list and show in tables and CSVs. `click`: one e-mail at a time behind a button. `off`: no e-mails. |
| `ADMIN_INTERNAL_UIDS` | empty | Comma list of Firebase uids that are always "my or test" accounts. Accounts can also be marked on the Doctors page (stored as uids in `adminSettings/dashboard`) or by `users/{uid}.accountType = 'internal'`. |
| `ADMIN_PSEUDONYM_SECRET` | optional | Key for the short doctor codes (D-XXXX). Without it `ADMIN_SECRET` is used. Set it once and keep it: if the key changes, every doctor gets a new code (the "mine" marks survive, they are stored as uids). |
| `ADMIN_CACHE_TTL_MS` | 600000 | How long the API keeps a loaded answer (10 minutes). |
| `ADMIN_USAGE_MAX_ROWS` | 150000 | Most usage rows one load may return (above it: 413, pick a shorter period). |
| `STRIPE_SECRET_KEY`, `SONIOX_API_KEY` | existing | Read-only use for Money (payments) and Recording (Soniox check). Without them those blocks say the source is off. |
| `ALLOWED_ORIGINS` | `*` | CORS; if set, it must include the stats site's origin. |

## Owner's 10-minute live check (after deploy)

1. (Optional, once) set `ADMIN_PSEUDONYM_SECRET` on the backend and redeploy it, before you mark accounts.
2. Open the stats site, enter the real admin key, tick "Remember on this device".
3. Overview: the numbers look like real life: ≈ 6 active doctors, ≈ 1,000 forms in 30 days, "Costs" ≈ €11–13
   for 30 days. The answer line and "Needs attention" read sensibly.
4. Doctors: the yellow row "{your e-mail} made 87% of all forms. Is this your account?" → "Mark as mine".
   The switch "Without my and test accounts" at the top becomes clickable; turn it on and see the numbers drop.
5. Money: the Stripe line says whether payments are visible (not "test mode"); purchases list real packs.
   A "credits did not arrive" warning means a payment without credits: add them by hand.
6. Models: "Working now" names today's main model, the backup and Soniox; no red risk you did not expect.
7. Prices: the three picks are Gemini 3.8 Flash (direct), Gemini 3.5 Flash-Lite (Google Cloud, EU only) and
   Gemini 3.5 Flash (Google Cloud, Frankfurt).
8. Settings: all data sources say "works"; the exchange rate and the price date are shown.
9. Phone: open Overview on the phone; the answer is visible without scrolling, nothing scrolls sideways.
10. `/legacy/index.html` still opens the old dashboard.

If something looks wrong, "Export" on each page downloads the page's tables as CSV.

## Code layout

- `src/data/` is pure (no React, no window; network only in `data/api/client.js`).
  - `core/`: the shared numbers (`summarize`, `summarizeHealth`, `summarizeToday`, `unitCosts`,
    `unitEconomics`, `projectScale`, `capacity` …). Page metrics only pick from them.
  - `metrics/<page>.js`: one `compute<Page>(ds, period, scope, opts)` per page.
- `src/pages/<Page>Page.jsx` + `src/pages/<page>/`: the page layout and its local parts.
- `src/ui/`, `src/charts/`: shared UI parts (tiles, tables, bar lists, charts).
- `src/copy/en/<page>.js`: every word on the page, with the (i) texts. The fixed words are Paid by doctors,
  Income, Costs, Result, Kept %, Form, Visit, Request, Credit. `copy.test.mjs` blocks jargon.
- `dev/mock-server.js`, `src/dev/`: the mock API and the demo data (never in the build).
