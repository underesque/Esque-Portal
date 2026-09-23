# ESQUE Portal — Handoff

Internal client & employee management portal for **ESQUE Outsourcing Pvt. Ltd.** Next.js 16 App
Router + Supabase. Repo: [github.com/underesque/Esque-Portal](https://github.com/underesque/Esque-Portal).
**Live at `https://crm.underesque.in`, deployed on Hostinger.**

## Where things stand — read this first

**Pushed to GitHub, not yet deployed to Hostinger.** `master` is up to date (commit `b311118` as of
this handoff — check `git log -1` for the actual current head) and Supabase is fully migrated (19
migrations — `npx supabase migration list --linked` to confirm), but the user has explicitly not
yet done the Hostinger-side deploy step for this latest push. **Do not assume `crm.underesque.in`
reflects the current `master`** — verify by checking the live site or asking, rather than treating
a `git push` as equivalent to "shipped." Deploying there is **not** git-push-to-auto-deploy: it
needs going into Hostinger's hPanel Node.js app panel, pulling the latest commit, running its "Run
NPM Build" step, then restarting the app. See the Hostinger gotcha below for why the build step
specifically (not just a restart) is required.

**Real business data, not seed rows** — as of this handoff:
- 12 employees, including 3 founders (Ruchit Sisodiya, Harshit, Tanveer — check `/employees` for
  exact roles/founder flags rather than trusting names here).
- 7 clients: Angel Dash, Vanessa Root (business name "Onion Skin Journal"), Maria Lorenzo, Alek
  Anuzis's client record (renamed to its business name, **Seven Figure Agency**), Todd Tarbert
  (Semble), Poppy Milington (The Sun Club), Luisa Hogan (Vermelho). A person's real name is often
  the `clients.name` field with the business name as a separate field/subtitle — don't assume the
  two are different entities before checking (a "new client" that turns out to be an existing one
  under a different name has happened twice already; see the Gotchas section).
- **164 real historical invoices / 167 payments loaded**, spanning March 2024 to today, sourced
  from Skydo (the payment processor) export files across Seven Figure Agency, Todd Tarbert, Poppy
  Milington, and Vanessa Root (migrations `0016`–`0018`). No founder-payout recompute was run for
  this historical backfill — only invoices marked paid through the app going forward trigger it.
- **`invoices` and `payments` are deliberately two different currencies** — see the Gotchas
  section, this is the single most important thing to know about the money model before touching
  any billing code.
- **Seven Figure Agency**: `fixed_payout_base_usd_cents` = $1,200/mo. Billed weekly in reality, but
  founder payout always calculates off this fixed base; anything billed above it in a month goes
  100% to the client's Sales owner as a `client_excess` share. Foundation Account pairing is turned
  off for this client (this fixed-base rule replaces it).
- **Todd Tarbert** (Semble): three recurring monthly "seats," each modeled as its own **Project**
  with its own per-project payout split — Jeffrey → 100% Harshit (sales), Alex → 50/50
  Ruchit/Harshit, Noah → 50/50 Ruchit/Harshit — plus a client-wide default split (also 50/50
  Ruchit/Harshit) that any new project under Todd inherits automatically if not otherwise
  configured. Plus a 4th monthly project, **Brett** (under Alek Anuzis/Seven Figure Agency, not
  Todd — assigned to Ruchit + Rahul), and 4 special one-time projects under Todd (Semble Commons,
  Hope Prays, Gap Funding website & CRM, Real Estate CRM). The 40+ real historical Todd invoices
  loaded from Skydo are **not** tagged to any of these projects (client-wide only) — the user
  explicitly chose not to reconstruct historical per-seat attribution.
- Poppy Milington and Luisa Hogan's client records are still flagged incomplete (missing
  email/sales-owner/etc.) — check their notes fields before assuming they're fully configured.
- Every employee has a blank `employee_code` field — the user said "I will let you know" the
  actual codes; don't invent values for it.

Working tree is clean as of the last commit — see `git log` for the running history of what's
shipped; treat `git status` as the source of truth for what (if anything) is in flight.

## Stack

- Next.js 16 (App Router). **This is not the Next.js you know** — `middleware.ts` is deprecated and
  renamed `proxy.ts` (exported function is `proxy()`, not `middleware()`); `params` and
  `searchParams` are async everywhere; route prop types come from generated helpers
  (`PageProps<"/route">`, `LayoutProps<"/route">`) via `npx next typegen`, not hand-written —
  regenerate after adding/removing/nesting routes or these types silently go stale.
- **`next.config.mjs`, not `.ts`, and the build script is `next build --webpack`, not plain `next
  build`.** Both changes exist purely for Hostinger compatibility — see the Gotcha below. Do not
  "clean up" either of these without understanding why they're there.
- TypeScript, Tailwind v4 (CSS-based `@theme inline` config in `app/globals.css`, no
  `tailwind.config.js`).
- Supabase (Postgres, Auth, Row Level Security) — `@supabase/ssr` for browser/server/proxy
  clients. **No ORM, no service-role key anywhere** — every DB access goes through the anon key +
  RLS; privilege escalation where needed (e.g. `is_admin()`, `handle_new_user()`, the payout
  recompute RPC) is done via `security definer` Postgres functions, not a service key.
- `recharts` for dashboard charts, `@react-pdf/renderer` for the salary-slip PDF endpoint.
- Fonts: Space Grotesk (headings/numbers) + Plus Jakarta Sans (body), via `next/font/google`.

### Running it locally

```bash
cd esque-portal
npm install
npm run dev          # or: .claude/launch.json's "esque-portal" config, port 3001
```

### Working with Supabase from the CLI

```bash
npx supabase migration list --linked   # confirm what's actually applied remotely
npx supabase db push                   # apply new migrations
```

Both need `SUPABASE_ACCESS_TOKEN` set per-command (and `SUPABASE_DB_PASSWORD` for anything that
links directly to the DB). Neither is persisted between terminal sessions — if a fresh session
doesn't have them, it can't run these directly and has to hand the SQL to the user to run in the
Supabase SQL editor instead (every migration in this repo has been applied that way at least once).

### Deploying to Hostinger

1. `git push` — does **not** auto-deploy.
2. In Hostinger's hPanel, open the Node.js app for `crm.underesque.in`.
3. Pull the latest commit, then run its **"Run NPM Build"** step (not just a restart — see Gotcha).
4. Restart the app.

## Database

Nineteen migrations in `supabase/migrations/`, **must run in exact numeric order**:

- **`0001`–`0011`** — core schema, founder payout automation, client staffing/projects, fixed
  payout base, per-project payout splits, project types. (See git history / prior handoff versions
  for the detailed breakdown if needed — summarized in "What's built" below instead of repeated
  here to keep this file from growing without bound.)
- **`0012_seed_2026_holidays.sql`** — the 2026 ESQUE holiday calendar (Republic Day, Holi, Eid,
  Independence Days, Labor Day, Diwali, Thanksgiving, Christmas, year-end).
- **`0013_daily_scorecards.sql`** — new `daily_scorecards` table (weekday-only, DB-enforced via a
  check constraint on `extract(isodow from entry_date)`). Admin now enters scores per weekday
  instead of once a month; those roll up into the same `monthly_scorecards` figure the yearly
  increment calculation already relies on (`lib/actions/scorecards.ts` computes the rollup —
  `monthly_scorecards` itself is unchanged schema/consumer-wise).
- **`0014_support_tickets.sql`** — new `tickets` + `ticket_comments` tables. `type` (`internal` |
  `client`) distinguishes an employee issue from a client-facing one; `priority`, a status
  workflow, an `assignee_id`, and a comment thread. `client_id` is only allowed when
  `type = 'client'` (DB check constraint).
- **`0015_staff_employee_linking.sql`** — adds `profiles: admin read all` / `admin update` RLS
  policies (previously admin couldn't read/update other users' profile rows at all). Lets an admin
  link a `staff` portal login to its real `employees` row (a new "Portal account" card on the
  employee page), so that staff member's own dashboard can show real score/salary/project data on
  top of their existing broader clients/billing/ticket access. The self-signup trigger
  (`handle_new_user`) is untouched — this linking is a manual, admin-driven action, not automatic.
- **`0016_lifetime_invoice_history.sql`** — bulk-loads 164 real historical invoices from a Skydo
  export. **Do not use this file as a template for a similar bulk load without reading it first**:
  its original version chained an invoice-insert and a payment-insert as data-modifying CTEs in
  one statement, which silently failed to insert most payments — see the Gotcha below.
- **`0017_lifetime_payments_fix.sql`** — the follow-up that actually inserted the missing 165
  payments, as its own separate statement.
- **`0018_payments_to_inr.sql`** — corrects those same 167 payment rows from the USD "Received
  amount" to the real INR "Credited amount" column, per the currency-model decision described in
  the Gotcha below.
- **`0019_merge_onion_skin_into_vanessa.sql`** — "The Onion Skin Journal" was mistakenly created as
  a brand-new client during the `0016` load; it's actually Vanessa Root's business. Moves her
  invoices/payments onto the real record and deletes the duplicate.

## What's built

- **Role-based access** — `admin` (everything), `staff` (clients/billing/tickets, not
  compensation — lands on `/my-dashboard`), `employee` (their own scorecard only, lands on
  `/my-scorecard`).
- **Clients** (`/clients`) — records with real business context, communication timeline, invoices
  (USD; optionally tagged to a project/"seat"), payments (INR — see the currency Gotcha), an
  editable Sales/Ops owner pair, a Team card, a Projects card (Monthly/Special sections), and a
  payout-settings form. Custom payout splits can be scoped client-wide or per-project.
- **Employees** (`/employees/[id]`) — **tabbed**, not one long page: Overview · Scorecard · Payroll
  · Projects · Portal Account, plus an "Edit profile" button that swaps in the edit form instead of
  an always-open one. Each tab only fetches its own data. Tab state lives in the URL (`?tab=`) so
  links from `/scorecards` and `/payroll` deep-link straight to the relevant tab.
- **Dashboards** — one "Dashboard" sidebar entry, with a **top-level tab strip** (Executive | Sales
  & Marketing | Support | Financial, nested routes under `/dashboard/*`, `components/DashboardTabs.tsx`)
  and a **shared date-range filter** (7D/30D/3M/Quarter/YTD/All time, `?range=`,
  `components/DateRangeFilter.tsx`) that scopes every time-bound stat/chart — point-in-time counts
  (Total Clients, currently-open ticket counts) are deliberately left alone since a date range
  doesn't mean anything for "how many right now." Trend charts auto-pick daily/weekly/monthly
  bucket granularity from the selected span (`lib/dashboard.ts`'s `bucketsForRange`/`sumByBucket`).
  - **Executive** (`/dashboard`) — company-wide KPIs, revenue trend, client-status breakdown.
  - **Sales & Marketing** (`/dashboard/sales`) — the client-acquisition funnel: new-clients trend,
    funnel-stage breakdown. A "Funnel activity" section is a clearly-labeled placeholder for
    email/SMS touch points and partnership outreach — **no data source for these exists yet**;
    don't fabricate numbers here if asked to "fill it in."
  - **Support** (`/dashboard/support`) — ticket volume/priority/status breakdown, per-assignee
    workload, tickets-created trend.
  - **Financial** (`/dashboard/financial`) — further split into **in-page section tabs**
    (`?section=`, `components/SectionTabs.tsx`): Revenue / Payroll & Payouts / Vendor Bills.
    Founder payouts are inherently monthly (one `payout_run` per calendar month) so that section
    sums whichever whole months the selected range touches rather than sub-dividing a month.
    Vendor "bills due within 7 days" is always relative to today regardless of the range filter —
    it's a forward-looking alert, not a historical view.
- **Support Tickets** (`/tickets`) — internal + client-facing issues in one system (see `0014`
  above), with a comment thread and Notifications-page alerts for open urgent/high-priority ones.
- **Staff Dashboard** (`/my-dashboard`) — a staff member's own score, assigned clients/projects,
  tickets, upcoming holidays, and a **real PDF salary slip** per payroll run
  (`app/api/payslip/[payrollRunId]/route.tsx`, `@react-pdf/renderer`; access-checked to the admin
  or the payroll run's own linked employee). Falls back to a ticket-raising-only view if the
  logged-in staff account isn't yet linked to an `employees` row (see `0015`).
- **Projects** (`/projects`) — company-wide table grouped into Monthly/Special sections; each
  project's own page supports hourly or fixed-contract per-assignment billing for contractual
  employees.
- **Founder Payout** (`/founders`) — fully automated, read-only. Fires when an invoice transitions
  to `paid` (`lib/actions/payout.ts`'s `recomputeFounderPayoutForMonth`, called from
  `syncInvoicePayout` in `lib/actions/billing.ts`) or on-demand from the page. 10% Sales / 50% Ops
  / 32% Partners (pooled, split evenly across founders) / 8% ESQUE, salary deduction off the top,
  fixed-payout-base + Foundation Account as distinct override mechanisms. Reads only `invoices`
  (never `payments`) for its math.
- **Performance Scorecard** — **daily entry** (weekday-only, admin-only) rolling up into the
  monthly figure the yearly-increment policy uses; a company-wide `/scorecards` overview lists
  every employee's current-month score, yearly average, and increment tier at a glance.
- **Annual salary summary, Vendors, Notifications, Holiday calendar** — unchanged in shape from
  prior sessions; Notifications now also surfaces open urgent/high-priority tickets.
- **Mobile responsive** — slide-in sidebar drawer, horizontally-scrolling tables within their card.

## Design

- White glass base UI; a 4px dark-purple rail on the sidebar's left edge is the only ambient
  purple; every button is solid cherry red, no gradients; cherry also marks financial-attention
  states (overdue, outstanding balances).
- Tokens live in `app/globals.css` (`--esque-plum`, `--esque-red`, neutral `--foreground`/
  `--muted`/`--border`). `components/ui.tsx` has the shared primitives — anything touching
  color/spacing broadly should go through there, not per-page overrides.
- **Sidebar was deliberately decluttered** — it used to have one nav item per dashboard
  (Executive/Sales/Support/Financial as 4 separate entries); the user found this "too busy" and it
  collapsed to a single "Dashboard" entry with the tab strip living on the page itself instead
  (see "What's built" above). If asked to add a new dashboard-like view, default to adding it as
  another tab under `/dashboard/*`, not a new top-level sidebar item.
- The design commits to one look and does not adapt to OS dark-mode.

## Known open items

1. **No data source for the Sales & Marketing "Funnel activity" section** (email/SMS touch points,
   partnership outreach). The user's stated next step is adding this; it'll need new schema (e.g.
   an `outreach_activities` table) whenever that happens — don't guess at one preemptively.
2. **Poppy Milington and Luisa Hogan's client records are incomplete** — check their notes fields
   before assuming otherwise.
3. **`employee_code` is blank on every employee** — deliberate, per the user. Don't populate it
   speculatively.
4. **Todd Tarbert's historical invoices (pre-existing, loaded from Skydo) are not tagged to
   Jeffrey/Alex/Noah** — client-wide only, by explicit user choice (getting per-seat attribution
   exactly right for 2.5 years of bundled/split invoices wasn't worth the effort it would take).
   New invoices going forward should still be tagged to the correct project/seat as usual.
5. **No automated test suite** — verification has been `tsc --noEmit` + `eslint` + a full
   production build (`npm run build`, which uses `--webpack` — see Stack) + live browser
   click-throughs with real (then cleaned-up, or left in place when they were real data)
   invoices/payments, checking numbers match hand-computed expectations to the paisa/cent. Re-verify
   any change to `lib/founderPayout.ts`, `lib/actions/payout.ts`, or `lib/dashboard.ts`'s bucketing
   the same way, not just "looks right in the UI."

## Gotchas for whoever picks this up

- **`invoices` and `payments` are deliberately two different currencies — this is the single
  easiest thing to get wrong in this codebase.** `invoices.amount_cents` is always USD (what the
  client is billed; this is also what the founder payout engine converts to INR via each invoice's
  own `conversion_rate` — it never reads `payments`). `payments.amount_cents` is always INR — the
  real amount Skydo actually credits to ESQUE's bank account after FX conversion and its fees,
  which is a smaller, different-currency number from the invoice it's for, **not** a same-currency
  partial/full payment against it. This shipped wrong once already (three dashboards summed
  `payments` and formatted it with `formatUSD`) before being caught and fixed — see
  `lib/format.ts`'s header comment for the canonical statement of the rule, and don't sum
  `payments` and display it as USD, or sum `invoices` and display it as INR.
- **A client's real name and its business name are often different fields on the same client row,
  not different clients.** Alek Anuzis's client record is Seven Figure Agency; Todd Tarbert's is
  Semble; Vanessa Root's is "Onion Skin Journal." Twice already this session, a real invoice's
  "Bill to" name looked unfamiliar and turned out to be an existing client under this pattern
  rather than a genuinely new one (once caught before creating a duplicate, once not — see `0019`).
  Before creating a "new" client from an unfamiliar name on an invoice/spreadsheet, check the
  existing client list's business-name column, not just the primary name column, and when in doubt
  ask rather than assume it's new.
- **PostgreSQL data-modifying CTEs in one statement don't see each other's writes.** `0016`'s
  original version chained `insert into invoices ... returning ...` and a final
  `insert into payments ... select ... join invoices ...` as CTEs in a single `WITH` statement —
  every CTE in one statement shares the same pre-statement snapshot, so the payment-insert's join
  against `invoices` couldn't see rows the invoice-insert CTE had *just* inserted in that same
  statement. Only pre-existing invoices got their payments attached; 162 silently got skipped (no
  error — the `not exists` guard just found "no matching invoice" and moved on). Fixed by splitting
  into two separate top-level statements (`0016` then `0017`), which is the general fix: if a bulk
  load needs step B to see step A's writes, they need to be separate statements, not chained CTEs.
- **`invoices.invoice_number` has a global unique constraint** (not scoped per-client) — a bulk
  load that assumes "one row per invoice number" will break if the same invoice was paid in
  multiple installments (it'll appear as two rows with the same invoice number in a payment-export
  spreadsheet). Group by invoice number first, insert one invoice row using the *invoice's* total
  (not any single installment's amount), then insert one payment row per installment.
- **Hostinger's Node.js hosting can't run this app's native SWC binary as Next.js ships it** —
  `GLIBC_2.29 not found for @next/swc-linux-x64-gnu` on their host's older glibc. Fixed with two
  narrow changes, both load-bearing, don't revert either without re-diagnosing from scratch:
  `next.config.ts` → `next.config.mjs` (a `.ts` config needs the native binary just to transpile
  itself before anything else runs) and `"build": "next build --webpack"` in `package.json` (forces
  the stable webpack bundler instead of Turbopack, which is Next 16's default and also needs the
  native binary). After any Hostinger build failure, re-pull and re-run the build step before
  assuming the app code is at fault — a stale build on their end looks identical to a real bug.
- **PostgREST embedded-resource queries break silently when a table has two FKs to the same
  target.** `clients` has both `sales_owner_id` and `ops_owner_id` pointing at `employees` — any
  `select("*, employees(...)")` on `clients` must disambiguate with `employees!sales_owner_id(...)`
  / `employees!ops_owner_id(...)`.
- **Server Components can't hand a raw `onChange` to an element they render.** Any inline-submit
  `<select>` on a page without `"use client"` must go through `components/AutoSubmitSelect.tsx`.
- **Timezone-unsafe date parsing is a repeat bug class here.** `new Date("2026-08-01")` parses as
  UTC; calling `.getFullYear()`/`.getMonth()` on the result reads it back in local time, silently
  shifting the month/day on a server running behind UTC. `lib/format.ts`'s `formatDate` forces
  `timeZone: "UTC"` for exactly this reason — any new date-boundary calculation should do its
  arithmetic in UTC from the start (see `lib/dashboard.ts`'s `resolveRange`/`bucketsForRange` for
  the current reference implementation).
- **Rounding uses largest-remainder distribution** (`splitProportional` in `lib/founderPayout.ts`),
  not naive per-share rounding — reuse it for any new proportional split.
- **Creating an invoice must go through the draft→transition path.** `createInvoice` always inserts
  as `draft` then calls `syncInvoicePayout` — inserting directly with `status: "paid"` skips the
  transition detection and `paid_at` never gets set.
- **`git remote` is `https://github.com/underesque/Esque-Portal.git`.**

## Suggested first steps in a fresh session

1. Read this file, then `git status` and `git log -5` to confirm nothing changed underneath it.
2. `npx supabase migration list --linked` to confirm all 19 migrations are applied.
3. Ask the user what's next — no known in-flight task as of this handoff. The most likely next
   request, per the user's own stated plan, is adding a real data source for the Sales & Marketing
   dashboard's email/SMS/partnership funnel section (see Known open items #1).
