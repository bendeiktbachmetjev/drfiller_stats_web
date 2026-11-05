# Dr.Filler stats

The owner's statistics site. It answers ten questions, one per page:

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
| Clinics | Which clinics pay for their doctors, how much did each doctor use, and what do we invoice? |
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
PORT=4000 npm start    # serves dist/: /, deep links such as /money, and /legacy (→ /legacy/index.html)
```

`src/data/metrics/__tests__/settings.test.mjs` also reads the backend's price table from `../backend` when that
repo sits next to this one; without it those checks are skipped.

`src/data/__tests__/invariants.test.mjs` checks that the pages agree with each other: shared numbers are the
very same values, splits add up to totals, the account switch and the VAT switch move only what they should,
and no page result carries a uid, an e-mail or a session id.

## Clinics

A clinic pays for the doctors put into it: by **invoice** (every credit is counted; the page shows the period's
credits and the amount at the clinic's price per credit) or from **prepaid credits** it bought (shared by its
doctors). How the server decides who pays and counts each credit: `../backend/services/billing/README.md`.

- The page: `src/pages/ClinicsPage.jsx` + `src/pages/clinics/`. The clinic list comes with the dataset
  (`GET /clinics`, `data/normalize/clinics.js`); a clinic's usage is loaded for the period on screen
  (`GET /clinics/:id/usage?from&to`, one row per doctor per Vilnius day) and summed in `data/clinics/report.js`.
- Doctors page: the "Clinic" column puts a doctor into a clinic, moves or takes them out (after a question).
  The "Top up" card switches between **Doctor** (any number of credits with what was paid, 0 = free; not for a
  doctor whose clinic pays) and **Clinic** (a prepaid clinic's credits with their price, or what an invoiced
  clinic paid for a month); a picked doctor shows what they bought, paid, the average price of a credit and used.
- Clinics page: an invoiced clinic has "Months" — every month the period touches, in full: credits, the amount
  at its price, paid, "Mark paid"; a prepaid clinic has "Credits bought" with the price of each lot and the
  average. "Delete" works once no doctor is left in the clinic (its records stay on the server).
- Money: hand top-ups with a price and month payments are income too ("By hand", no payment fee); they come
  from `GET /grants` and the clinics' `payments` (`data/clinics/money.js`).
- Export on the Clinics page gives the period's doctors (the invoice's annex) and its days as CSV.
- "The clinic's own page" (`src/pages/clinics/ClinicShare.jsx`): a link + password for the clinic to look at its
  own numbers, read-only, in Lithuanian (`POST /clinics/:id/share`; the page is the backend's `/klinika/:token`,
  `../backend/routes/clinicView.js`). The pair is shown once (the server keeps only hashes); a new pair stops the
  old link, "Stop sharing" (`DELETE`) and deleting the clinic stop it too. The list shows when it was opened.
- Mock: `npm run dev:mock` serves two demo clinics (`src/dev/demoClinics.js`); changes last until the mock
  stops. `?demo` has no clinics.

### Work statistics (a clinic's "Work and time")

What Dr. Filler did for a clinic's staff and how much time it saved them (spec: work-stats spec v1 §7.2, §10).
The server works every number out with the clinic page's own code (`../backend/clinicView/page/report.js`); the
site only checks and arranges the answer (`src/data/clinics/work.js`, pure, tested).

- A clinic has two views: **Usage and invoice** (as before) and **Work and time** (`?view=work` in the address).
- Work and time (`src/pages/clinics/WorkView.jsx`): the period (the page's picker), "Staff" (pick people; none
  picked = everyone), the "Early estimate" banner, tiles (time saved ≈, its value, what the clinic paid, our cost
  per saved hour), the likely range with what moves it, the parts (by hand on the right of zero, with Dr. Filler
  on the left), time per day / week / month, tables by role, specialty, person and activity, the counts, every
  button (top 10, then "Show all"), Health (versions, data quality, checks) and the staff editor.
  `GET /clinics/:id/work?from&to&workers=pid,pid` (both days included, unlike `/usage`: the site sends the period's last
  day). The server keeps an answer up to 10 minutes: a change to the clinic (roles, shared logins, rates) makes a
  new one at once, a worker's objection (kept with their account) shows within those 10 minutes.
- Staff editor (`StaffEditor.jsx`): each person's role (Doctor / Nurse / Other clinical / Registry & admin) and where
  it comes from. The role comes from the person's profile (the specialty they picked in the extension: "From the
  profile: <specialty>"); the owner can set another one ("Set by you"). His role stays while the profile gives the
  role it gave when he set it; once the person picks a specialty of another role, the profile counts again. With no
  specialty in the profile the role is a guess (Doctor, marked "guessed": hours, no €). The picker's first choice
  "From the profile (Nurse)" sends `role: null`. Also "Set for selected" (with "From the profile" too), "Shared
  login: no time saved" and "Worker objected: stop work statistics" (kept with the worker's account).
  `PATCH /clinics/:id/staff/:pid { role?, ex?, statsOff? }` → `{ clinicId, staff: { pid, role, guessed, from, profile,
  spec, ex, statsOff, member } }` (`from` = 'owner' | 'profile' | 'guess', `profile` = the role the profile gives now,
  null without a specialty); past members can be marked too. `GET /clinics` lists each clinic's `staff` the same way.
  An older answer without `from` reads as before: guessed = 'guess', any other role = 'owner'. The work answer's
  `byWorker` may carry `from` too (null on an erased account's line); without it the site reads it from the staff
  marks (`work.js` `workerFrom`). The people table marks "Set by you" and "guessed"; the CSV has `role_from`.
- Settings (Edit, `ClinicForm.jsx`): "Value of an hour, €" per role (blank = the national average shown in the
  field, from the State Patient Fund's data) and "Show work statistics to the clinic" (`statsShown`: its own page
  gets the time tabs). `PUT /clinics/:id` sends `hourEur` (the whole map: a role left out = the national average)
  and `statsShown` only when they changed, so the form still saves against an older server.
- The national rates and the role rule (`profileRole`, `roleOf`) are mirrored in `src/data/clinics/staff.js` (the mock
  and the kit use them); `staff.test.mjs` compares them with `../backend/services/stats/` when that repo sits next to
  this one. The work answer's own `rates` win.
- Mock: `GET /clinics/:id/work` comes from `src/dev/demoWork.js` (an invented world: doctors, nurses, the
  registry, a shared login, a worker who objected, an old extension, and 18 days with the extension's counts), so
  its numbers are not the Usage and invoice view's. The demo clinic's people (`src/dev/demoClinics.js`) have their
  own specialties, so roles come from the profile, from the owner and from a guess.
  `GET /api/admin/v2/__mock?spec=<pid>:<specialty>` changes a person's specialty (empty = none) to try how the
  profile counts again. `/_kit?demo` (dev only, no key) shows the view with an invented clinic.

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
| `VITE_API_URL` | the production backend | Where the admin API lives. Empty = same origin (the dev proxy to the mock). A different address also needs `connect-src` in `public/serve.json` (the browser blocks every other address; `deploy.test.mjs` checks the default). |
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
10. `/legacy` still opens the old dashboard.
11. After a later deploy, an open tab reloads itself once when it opens a page it had not loaded yet.

If something looks wrong, "Export" on each page downloads the page's tables as CSV.

## Code layout

- `src/data/` is pure (no React, no window; network only in `data/api/client.js`).
  - `core/`: the shared numbers (`summarize`, `summarizeHealth`, `summarizeToday`, `unitCosts`,
    `unitEconomics`, `projectScale`, `capacity`, `formCostChange` …). Page metrics only pick from them.
  - `metrics/<page>.js`: one `compute<Page>(ds, period, scope, opts)` per page.
- `src/context/`: loading and caching the data, the period and the account switch, `useMetric`.
- `src/auth/`: the admin-key form and where the key is kept (session, or this device when ticked).
- `src/format/`: numbers, money and dates (`format.js`), and metric items → sentences (`items.js`).
- `src/export/`: CSV files of the page tables.
- `src/pages/<Page>Page.jsx` + `src/pages/<page>/`: the page layout and its local parts.
- `src/ui/`, `src/charts/`: shared UI parts (tiles, tables, bar lists, charts).
- `src/copy/en/<page>.js`: every word on the page, with the (i) texts. The fixed words are Paid by doctors,
  Income, Costs, Result, Kept %, Form, Visit, Request, Credit. `copy.test.mjs` blocks jargon.
- `dev/mock-server.js`, `src/dev/`: the mock API and the demo data (never in the build).
