# ESQUE Portal — Handoff

Internal client & employee management portal for **ESQUE Outsourcing Pvt. Ltd.** Next.js 16 App
Router + Supabase. Repo: [github.com/underesque/Esque-Portal](https://github.com/underesque/Esque-Portal).

## Where things stand — read this first

**A live Supabase project is connected and fully migrated** (`.env.local` has real values, not
placeholders). All 11 migrations are pushed (`npx supabase migration list --linked` to confirm).
An admin account exists (created by the user directly in Supabase Auth, not by Claude — creating
accounts/entering credentials is out of scope for the assistant per this app's own safety rules).

**The founder payout system is a full automation, not the manual calculator the repo started
with.** Payouts are computed live from real paid invoices — there is no more free-form,
unpersisted entry screen. See "What's built" below.

**Real business data is configured**, not just seed/test rows:
- 12 employees, including 3 founders (Ruchit Sisodiya, Harshit, Tanveer — check `/employees` for
  exact roles/founder flags rather than trusting names here).
- 7 clients with real business names/emails/notes pulled from the user's actual email (Angel Dash,
  Vanessa Root, Maria Lorenzo, Alek Anuzis / Seven Figure Agency, Todd Tarbert / Semble, Poppy
  Milington / The Sun Club, Luisa Hogan / Vermelho).
- **Seven Figure Agency** (Alek Anuzis): `fixed_payout_base_usd_cents` = $1,200/mo. Billed weekly
  in reality, but founder payout always calculates off this fixed base; anything billed above it
  in a month goes 100% to the client's Sales owner as a `client_excess` share. Foundation Account
  pairing is turned off for this client (this fixed-base rule replaces it).
- **Todd Tarbert** (Semble): three recurring monthly "seats," each modeled as its own **Project**
  with its own per-project payout split — Jeffrey → 100% Harshit (sales), Alex → 50/50
  Ruchit/Harshit, Noah → 50/50 Ruchit/Harshit — plus a client-wide default split (also 50/50
  Ruchit/Harshit) that any new project under Todd inherits automatically if not otherwise
  configured. Plus a 4th monthly project, **Brett** (under Alek Anuzis, not Todd — assigned to
  Ruchit + Rahul), and 4 special one-time projects under Todd (Semble Commons, Hope Prays, Gap
  Funding website & CRM, Real Estate CRM).
- Two clients are flagged incomplete on purpose and need the user's input, not guesses: check
  Poppy Milington and Luisa Hogan's client notes for what's still missing.
- Every employee has a blank `employee_code` field — the user said "I will let you know" the
  actual codes; don't invent values for it.

Working tree is clean as of the last commit — see `git log` for the running history of what's
shipped. There is no large uncommitted diff sitting on top like there was at the start of this
project; treat `git status` as the source of truth for what (if anything) is in flight.

## Stack

- Next.js 16 (App Router, Turbopack). **This is not the Next.js you know** — `middleware.ts` is
  deprecated and renamed `proxy.ts` (exported function is `proxy()`, not `middleware()`); `params`
  and `searchParams` are async everywhere; route prop types come from generated helpers
  (`PageProps<"/route">`, `LayoutProps<"/route">`) via `npx next typegen`, not hand-written.
- TypeScript, Tailwind v4 (CSS-based `@theme inline` config in `app/globals.css`, no
  `tailwind.config.js`).
- Supabase (Postgres, Auth, Row Level Security) — `@supabase/ssr` for browser/server/proxy
  clients. **No ORM, no service-role key anywhere** — every DB access goes through the anon key +
  RLS; privilege escalation where needed (e.g. `is_admin()`, `handle_new_user()`, the payout
  recompute RPC) is done via `security definer` Postgres functions, not a service key. Keep using
  this pattern rather than introducing a service-role key.
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
links directly to the DB, not just the REST API).

## Database

Eleven migrations in `supabase/migrations/`, **must run in exact numeric order**:

- **`0001_init.sql`** — core schema: `profiles` (role: admin/staff), `clients`,
  `client_communications`, `invoices`, `payments` (client billing — always USD), `employees`,
  `commission_rules`, `commission_entries`, `payroll_runs` (employee pay — always INR),
  `activity_log`.
- **`0002_founders_vendors_holidays.sql`** — the original `founder_assignments`/
  `distribution_runs`/`distribution_shares` model. **Retired and removed from the app in
  `0006`** — see below. `vendors` (INR only) and `holidays` from this migration are still live and
  unrelated to the founder-payout retirement.
- **`0003_client_sales_owner.sql`** — adds `clients.sales_owner_id`. Still live; now feeds the
  automated payout engine's fallback attribution instead of the retired manual system.
- **`0004_add_employee_role.sql`** — adds `'employee'` to the `user_role` enum.
- **`0005_performance_scorecard.sql`** — employee self-service login, `monthly_scorecards`, and a
  tightened `employees` RLS policy (admin/staff full access, an employee can read only their own
  row).
- **`0006_founder_payout_automation.sql`** — the big one. Drops the `0002` founder tables. Adds
  `payout_runs`/`payout_shares` (replaces `distribution_runs`/`distribution_shares`), adds
  `clients.ops_owner_id`/`is_foundation_account`/`default_payout_type`, adds
  `invoices.conversion_rate`/`payout_type`/bonus fields/`paid_at`, adds `client_payout_splits`, and
  a `security definer` `replace_founder_payout_month()` RPC the app calls to atomically replace a
  month's computed shares.
- **`0007_client_staffing_and_projects.sql`** — renames `employment_type`'s `'contractor'` value to
  `'contractual'`; adds bank fields + `t_shirt_size` to `employees`; new `client_assignments`
  table (which employees staff which client); new `projects` and `project_assignments` tables
  (any employee assignable; contractual employees can additionally get an hourly or fixed-contract
  billing amount per assignment).
- **`0008_fixed_payout_base.sql`** — adds `clients.fixed_payout_base_usd_cents` and a
  `client_excess` payout-share category, for the Seven Figure Agency fixed-base rule described
  above. General mechanism, not a one-off — usable for any client.
- **`0009_employee_code.sql`** — adds `employees.employee_code` (nullable, currently blank on
  every row per the user's instruction).
- **`0010_project_payout_splits.sql`** — adds `invoices.project_id` and
  `client_payout_splits.project_id` (both nullable — null keeps today's client-wide-default
  meaning), letting a client's payout attribution be scoped per-project (per-"seat") instead of
  only client-wide. Two partial unique indexes replace the old single unique constraint since
  Postgres's plain `unique()` doesn't dedupe nullable columns the way this needed.
- **`0011_project_type.sql`** — adds `projects.project_type` (`monthly` | `one_time`), used purely
  for UI grouping ("Monthly projects" vs. "Special projects" sections).

## What's built

- **Role-based access** — `admin` (everything), `staff` (clients/billing, not compensation),
  `employee` (their own performance scorecard only).
- **Clients** (`/clients`) — records with real business context (name/email/notes), communication
  timeline, invoices (USD; optionally tagged to a project/"seat"), payments, an editable Sales/Ops
  owner pair, a **Team card** (assigned employees + an employment-type breakdown), a **Projects
  card** split into Monthly/Special sections, and a payout-settings form (Ops owner, Foundation
  Account flag, default payout type, fixed monthly payout base). **Custom payout splits** can be
  added client-wide or scoped to one project.
- **Employees** (`/employees`) — roster, employment type (`full_time` / `part_time` /
  `contractual`), pay structure, commission entries, payroll runs (all INR), bank details,
  t-shirt size, employee code (currently blank fleet-wide), founder/salary-basis fields, and a
  read-only Projects card showing what they're staffed on.
- **Projects** (`/projects`, admin nav item) — company-wide table of every project across every
  client, grouped into Monthly/Special sections, showing client, status, and the assigned team by
  name (not just a count). Each project's detail page (`/projects/[id]`) lets admins edit
  name/description/type, change status inline, and manage staffing — including, for contractual
  employees, per-assignment hourly-rate×hours or fixed-contract billing.
- **Founder Payout** (`/founders`) — **fully automated, read-only view**, no manual entry. Fires
  automatically whenever an invoice transitions to `paid` (`lib/actions/payout.ts`'s
  `recomputeFounderPayoutForMonth`, called from `syncInvoicePayout` in `lib/actions/billing.ts`).
  Also recomputable on demand from the page itself.
  - Core split: `lib/founderPayout.ts` — 10% Sales / 50% Operations / 32% Partners (pooled, split
    evenly across founders) / 8% ESQUE, with a per-founder monthly salary deduction taken off the
    top (salary-basis presets: full-time cap, half-time cap, director-hourly, or custom).
  - Attribution chain per invoice (`attributeCredit`): project-scoped `client_payout_splits` row →
    client-wide default split row → client's `sales_owner_id`/`ops_owner_id` → even split across
    founders. This lets a client like Todd Tarbert have per-seat attribution while an ordinary
    client with no project splits behaves exactly like the simple client-wide case.
  - `payout_type` per invoice: `normal` (goes through the full split), `hourly` (100% ESQUE), or
    `bonus` (70/30 to whoever handles the account / ESQUE).
  - Fixed payout base + `client_excess` (Seven Figure Agency's rule) and Foundation Account pairing
    (older rule, still supported for any other client that wants it) both live here as distinct,
    separately-labeled share categories.
  - All money in this system is INR paise; conversion from a client's USD invoice uses that
    invoice's own `conversion_rate`, or a client's average rate across the month where multiple
    invoices are averaged into one fixed-base calculation.
- **Annual salary summary** (`/payroll/annual`) — payroll + founder payouts by financial year.
- **Vendors, Notifications, Holiday calendar** — vendor bills (INR), overdue-invoice/vendor-bill
  and blocked-project alerts, holiday list.
- **Performance Scorecard + employee self-service login** — monthly score across 5 weighted
  categories (`lib/scorecard.ts`), admin-entered on the employee detail page, employee self-signup
  at `/signup` auto-linked by email match, confined by `proxy.ts` + RLS to `/my-scorecard` and
  `/holidays` only.
- **Dashboard** (`/dashboard`) — key stats only; Recent Activity and the Inactive Employees stat
  were deliberately removed (activity has its own `/activity` log; inactive employees weren't
  useful as a dashboard-level stat).
- **Mobile responsive** — full pass across the app: `Sidebar` is a slide-in drawer below desktop
  width, tables scroll horizontally within their own card (`Card` has `overflow-x-auto`) instead
  of breaking page layout, forms/grids collapse to single-column.

## Design

- White glass base UI; a 4px dark-purple rail on the sidebar's left edge is the only ambient
  purple; every button is solid cherry red, no gradients; cherry also marks financial-attention
  states (overdue, outstanding balances).
- Tokens live in `app/globals.css` (`--esque-plum`, `--esque-red`, neutral `--foreground`/
  `--muted`/`--border`). `components/ui.tsx` has the shared primitives (`Card`, `Button`, `Badge`,
  `Input`/`Select`/`Textarea`, `PageHeader`, `EmptyState`, `StatCard`) — anything touching
  color/spacing broadly should go through there, not per-page overrides.
- The design commits to one look and does not adapt to OS dark-mode.

## Known open items

1. **Poppy Milington and Luisa Hogan's client records are incomplete** — flagged during the
   email-research pass, not guessed at. Check their notes fields for exactly what's missing before
   assuming they're fully configured.
2. **`employee_code` is blank on every employee** — deliberate, per the user ("I will let you
   know"). Don't populate it speculatively.
3. **Two ESQUE-side contacts (Ashutosh Gupta, and one referred to as "Vicky") came up during the
   email research** — Ashutosh was added as a contractual, active employee at the user's explicit
   request; the other was explicitly declined ("don't add Vicky"). If either name resurfaces,
   don't re-add without asking again.
4. **Foundation Account pairing vs. fixed payout base** — these are two different mechanisms for
   handling a client whose billing doesn't map 1:1 to its payout. Seven Figure Agency uses the
   fixed-base rule (Foundation Account flag turned off for it); the older pairing mechanism is
   still fully functional in the code for any other client that might need it instead. Don't
   assume one has fully replaced the other app-wide.
5. **No automated test suite** — verification throughout has been `tsc --noEmit` + `eslint` +
   live browser click-throughs with real (then cleaned-up) test invoices, checking payout numbers
   match hand-computed expectations to the paisa. Any future change to `lib/founderPayout.ts` or
   `lib/actions/payout.ts` should be re-verified the same way, not just "looks right in the UI."

## Gotchas for whoever picks this up

- **PostgREST embedded-resource queries break silently when a table has two FKs to the same
  target.** `clients` has both `sales_owner_id` and `ops_owner_id` pointing at `employees` — any
  `select("*, employees(...)")` on `clients` must disambiguate with
  `employees!sales_owner_id(...)` / `employees!ops_owner_id(...)`, or Supabase returns an
  ambiguous-embed error (or, worse, just silently returns nothing depending on the call site).
  Watch for this pattern anywhere a new second FK gets added to an already-embedded table.
- **Server Components can't hand a raw `onChange` to an element they render.** Any inline-submit
  `<select>` on a page without `"use client"` must go through `components/AutoSubmitSelect.tsx`,
  not a raw `<select onChange=...>` — this crashed the app once already (pre-existing bug,
  surfaced and fixed this session).
- **Timezone-unsafe date parsing is a real, repeat bug class in this codebase.**
  `new Date("2026-08-01")` parses as UTC; calling `.getFullYear()`/`.getMonth()` on the result
  reads it back in local time, which silently shifts the month on any server running behind UTC.
  Fixed in the payout month-bounds calculation and two scorecard year filters — if you add another
  month/year boundary calculation, do the arithmetic in UTC from the start.
- **Money conventions are load-bearing, not stylistic.** Client billing (invoices/payments) is
  always USD (`_cents`); employee pay, payroll, vendors, and everything in the founder payout
  system is always INR (`_inr_cents`). Mixing these up would be a real financial bug, not a
  formatting inconsistency.
- **Rounding uses largest-remainder distribution (`splitProportional` in `lib/founderPayout.ts`),
  not naive per-share rounding** — needed because splitting an integer paise amount N ways by
  simple `Math.round()` on each share can lose or gain a paisa vs. the original total. Reuse this
  helper for any new proportional split rather than rounding each share independently.
- **Creating an invoice must go through the draft→transition path, not a direct paid insert.**
  `createInvoice` always inserts as `draft` then calls `syncInvoicePayout` to transition — inserting
  directly with `status: "paid"` skips the paid-transition detection and `paid_at` never gets set,
  making the invoice invisible to payout calculations. Any new invoice-creation code path must
  follow the same pattern.
- **`git remote` is `https://github.com/underesque/Esque-Portal.git`.**

## Suggested first steps in a fresh session

1. Read this file, then `git status` and `git log -5` to confirm nothing changed underneath it.
2. `npx supabase migration list --linked` to confirm all 11 migrations are actually applied to the
   connected project (should already be true, but cheap to verify after a break).
3. Ask the user what's next — there's no known in-flight task as of this handoff; the previous
   session's request list was fully completed through project types + team-name display on
   `/projects`.
