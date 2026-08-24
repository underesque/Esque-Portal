# ESQUE Portal — Handoff

Internal client & employee management portal for **ESQUE Outsourcing Pvt. Ltd.** Built from scratch
this session (Next.js 16 App Router + Supabase). Repo: [github.com/underesque/Esque-Portal](https://github.com/underesque/Esque-Portal).

## Where things stand — read this first

**No live Supabase project is connected.** `.env.local` has placeholder values
(`https://placeholder.supabase.co`). Every page, form, and calculation has been verified via
`tsc --noEmit`, `eslint`, `next build`, and — for the two money-critical pieces (founder payouts,
performance scorecard math) — standalone Node scripts that exercise the actual logic against
hand-checked expected values. **Nothing has been verified against a real, live, authenticated
browser session**, because there's no database to log into yet. Setting one up (Setup section
below) and doing a real click-through is the single most valuable next step.

**The repo is on GitHub but has uncommitted work sitting on top of the last push.** Last commit:
`b32abd6` ("Initial commit: ESQUE internal portal"). Since then, an entire session's worth of work
happened uncommitted:
- The Founder Payout calculator was upgraded from a fixed August-only calculator into a full
  monthly system (month selector, free-form add/edit/delete rows).
- A formal **Profit Sharing & Compensation Policy** PDF was supplied and reconciled against the
  Excel-derived calculator — three gaps were closed (salary presets/caps, a real bonus 70/30
  split, the Foundation Accounts rule).
- A **Performance Scorecard & Growth Policy** PDF was supplied and built out as a whole new access
  tier: employees now get their own login, separate from admin/staff.

Run `git status` to see the current diff — it's substantial (2 new migrations, 2 new pages, 3 new
lib files, edits to ~9 existing files). **Ask the user before committing/pushing** — same rule as
always, and especially relevant here since the repo already has one commit on GitHub that a force
of habit could accidentally clobber.

## Stack

- Next.js 16.3.1 (App Router, Turbopack). **This is not the Next.js you know** — `middleware.ts` is
  deprecated and renamed `proxy.ts` (exported function is `proxy()`, not `middleware()`); `params`
  and `searchParams` are async everywhere; route prop types come from generated helpers
  (`PageProps<"/route">`, `LayoutProps<"/route">"`) via `npx next typegen`, not hand-written.
- TypeScript, Tailwind v4 (CSS-based `@theme inline` config, no `tailwind.config.js`).
- Supabase (Postgres, Auth, Row Level Security) — `@supabase/ssr` for browser/server/proxy clients.
- Fonts: Space Grotesk (headings/numbers) + Plus Jakarta Sans (body), via `next/font/google`.
- No ORM, no service-role key anywhere — every DB access goes through the anon key + RLS.

### Running it locally

```bash
cd esque-portal
npm install
npm run dev          # or: .claude/launch.json's "esque-portal" config, port 3001
```

## Database

Five migrations in `supabase/migrations/`, **must run in exact numeric order**:

- **`0001_init.sql`** — core schema: `profiles` (role: admin/staff), `clients`,
  `client_communications`, `invoices`, `payments` (client billing — always USD), `employees`,
  `commission_rules`, `commission_entries`, `payroll_runs` (employee pay — always INR),
  `activity_log`.
- **`0002_founders_vendors_holidays.sql`** — `founder_assignments`, `distribution_runs`,
  `distribution_shares` (the original simple 10/50/32/8-with-even-split founder model — since
  superseded in the app layer by the Excel-accurate calculator, but the tables/RLS are still there
  and unused by the newer UI), `vendors` (INR only), `holidays`.
- **`0003_client_sales_owner.sql`** — adds `clients.sales_owner_id`, used by the original founder
  distribution feature (also superseded, see above).
- **`0004_add_employee_role.sql`** — adds `'employee'` to the `user_role` enum. **Must be run and
  committed before `0005`** — Postgres won't let a brand-new enum value be referenced in the same
  transaction it was created in, and `0005` uses the literal `'employee'` in a trigger and RLS
  policies.
- **`0005_performance_scorecard.sql`** — links `profiles.employee_id` → `employees`, creates
  `monthly_scorecards` with RLS, **tightens `employees` SELECT** (previously any authenticated user
  could read the full table including salary; now it's admin/staff full access + an employee can
  read only their own row — necessary once employees can log in), and rewrites `handle_new_user()`
  to auto-detect an employee-email match on signup (falls back to the original `role: 'staff'`
  behavior for anyone else, so existing admin/staff provisioning via the Supabase dashboard is
  unaffected).

**Note on `0002`/`0003` vs. the real founder-payout logic**: the DB-backed `founder_assignments` /
`distribution_runs` model from `0002` was the *first* attempt at founder payouts, built before the
real Excel model was supplied. It's still wired up at `/founders` (role assignments, "run monthly
distribution" form, distribution history) and still works, but it's no longer the primary way
founder payouts are calculated — `components/FounderPayoutCalculator.tsx` (client-side, no DB) is.
Both currently coexist on the same `/founders` page. Worth asking the user whether the older
DB-backed flow should be removed now that the real calculator exists, or kept as a secondary/legacy
tool — this session added to the calculator without being asked to remove the older piece, so it's
still there.

## What's built

- **Role-based access** — `admin` (sees everything), `staff` (clients/billing, not compensation),
  `employee` (their own performance scorecard only, nothing else — see below).
- **Clients** — records, communication timeline, invoices, payments (all USD). A "sales owner"
  field attributes a client to a founder for the (superseded) `/founders` distribution feature.
- **Employees** — roster, employment type, pay structure (fixed/commission/hybrid), commission
  entries, payroll runs (all INR).
- **Founder Payout calculator** (`/founders`, inside `components/FounderPayoutCalculator.tsx`) —
  the real, Excel-verified model:
  - Month selector (Jul 2026 – Jun 2027, trivially extensible — it's a plain array). Each month has
    fully independent rows, added/edited/deleted freely; only August ships pre-seeded with the
    real verified data.
  - `calculatePayoutRow()` is the single row-level formula for every row, every month: Conversion =
    Amount×Rate; for "normal" rows, Remaining = Conversion − Salary Deduction, then 10/50/32/8
    split; "hourly" rows skip the split entirely (100% → ESQUE); "bonus" rows skip it too (30% →
    ESQUE, 70% → whoever handles the account).
  - Founder-level Sales/Operations credit is per-row (a founder, or one of three known split
    presets — 50/50 H.B./R.S.S., 95/5 H.B./R.S.S., 95/5 T.A.Q./R.S.S.) rather than a fixed lookup,
    since the real spreadsheet's attribution is genuinely per-deal, not inferable from Staff Name
    (e.g. the "Semble - Noah" row is staffed by T.A.Q. but its Sales credit splits between H.B. and
    R.S.S., never touching T.A.Q.). Partners' 32% is pooled across all normal rows and split evenly
    3 ways, matching `SUM(J2:J14)/3` in the source sheet.
  - **Salary basis presets** (Policy §1): Full-time (₹75,000 cap), Half-time (₹40,000 cap),
    Director-hourly (₹500/hr, derived from an Hours field), or Custom (free entry — what all of
    August's seed rows use, so nothing about August's verified numbers depends on the new caps).
  - **Bonus 70/30** (Policy §4): 30% retained as ESQUE, 70% to whoever handles the account — a
    founder alone, a named non-founder employee alone (tracked at the row level, not in the founder
    cards since they're not a founder), or both split by an editable percentage (the policy doesn't
    pin an exact co-managed ratio, so this defaults to 50/50 and is adjustable per row).
  - **Foundation Accounts** (Policy §5): Seven Figure Agency (R.S.S.) and Semble/Jeffrey (H.B.) are
    flagged `isFoundationAccount`. Both get calculated using whichever has the lower invoice
    Amount; the excess from the higher one transfers 100% to whichever founder owns that account,
    bypassing the split and ESQUE entirely. In August the two amounts are tied ($1,200 each), so
    the adjustment produces zero excess and changes nothing — verified this explicitly before
    shipping it.
  - Monthly totals + a three-card founder payout summary (Sales/Operations/Partners/Salary/
    Bonus/Foundation excess/Total), all recomputed live on every keystroke.
- **Annual salary summary** (`/payroll/annual`) — payroll + founder distributions by financial year.
- **Vendors, Notifications, Holiday calendar** — as before, unchanged this session's later half.
- **Performance Scorecard + employee self-service login** (new this session, from the *Performance
  Scorecard & Growth Policy* PDF):
  - Monthly score per employee across 5 weighted categories (Attendance 10%, Punctuality 10%, Work
    Performance 50%, Manager Feedback 10%, Responsiveness 20%) — `lib/scorecard.ts` is the single
    source of truth for the weights and the six yearly-increment tiers (100%→25%, 95–99%→20%,
    90–94%→15%, 80–89%→10%, 75–79%→7%, 70–74%→5%), shared by both the admin-entry UI and the
    employee's own view.
  - Admin enters scores on the existing employee detail page (`/employees/[id]`, new card at the
    bottom — nothing else on that page changed).
  - Employees sign up themselves at `/signup` with the email already on their `employees` record.
    `handle_new_user()` auto-detects the match and links the account (read-only) to that employee;
    anything that doesn't match falls back to the original `staff` behavior unchanged.
  - Logged in as an employee, `proxy.ts` confines them to exactly `/my-scorecard` and `/holidays` —
    everything else redirects there. Enforced independently at three layers: the proxy, the page's
    `requireEmployee()` guard, and RLS on `monthly_scorecards`/`employees`.

## Design

Went through several rounds of user feedback this session — worth knowing the *reasoning*, not
just the current state, in case it comes up again:

1. First pass: full glassmorphism, dark purple (`#5e3f7a`) + cherry red (`#b23a5b`) used fairly
   liberally (colored names, tinted borders, ambient gradient glow).
2. **User feedback: "colors everywhere," reads unprofessional.** Pulled back hard — neutral text
   everywhere, purple/cherry only on a few deliberate surfaces.
3. Iterated twice more on exactly *where* those few surfaces should be (five-option comparisons
   built as standalone HTML artifacts, not committed to the app, to let the user pick before
   touching real code). Landed on: **white glass base everywhere; a 4px dark-purple rail on the
   sidebar's left edge is the only purple; every button is solid cherry, no gradients; cherry also
   appears for financial-attention states (overdue, outstanding balances).**
4. One real bug caught mid-process: an early version's mockup artifact had a leftover dark-mode
   CSS block from the very first draft that never got updated through later iterations — anyone
   viewing it with a dark OS theme saw the old scheme. Fixed by removing the dark-mode override
   entirely (the design commits to one look, doesn't adapt to system theme).

Current tokens live in `app/globals.css` (`--esque-plum`, `--esque-red`, neutral `--foreground`/
`--muted`/`--border`). `components/ui.tsx` has the shared primitives (`Card`, `Button`, `Badge`,
`Input`/`Select`/`Textarea`, `StatCard`) — anything touching color/spacing broadly should go
through there, not per-page overrides.

## Known open items

1. **Not committed/pushed** — see "Where things stand." The diff includes a security-relevant RLS
   change (`employees` table read access), worth the user actually reviewing before it ships.
2. **No live Supabase project** — nothing in this app has been exercised against a real database.
   First real session with one connected should budget time for things that only show up with real
   data/real RLS (e.g. does the `is_employee_email` RPC actually get granted correctly on a fresh
   project; does email confirmation being on/off in the Supabase Auth settings change the signup
   flow's behavior — `signupEmployee` handles both cases in code but neither's been exercised for
   real).
3. **Two founder-payout systems coexist on `/founders`** — the original DB-backed
   `founder_assignments`/`distribution_runs` flow (from `0002`) and the newer, real
   `FounderPayoutCalculator.tsx`. Ask the user whether to remove the older one now that the
   Excel-accurate calculator exists.
4. **Founder Payout Calculator has no persistence** — it's component-local React state, matching
   what already existed before this session (a deliberate choice each time, to avoid inventing DB
   schema beyond what was asked for) — but it means navigating away from `/founders` loses whatever
   was typed. Worth asking whether this should eventually save to a table.
5. **Bonus co-managed split ratio (50/50 default)** and **which two accounts get
   `isFoundationAccount` flagged** are both judgment calls made from the policy text, not something
   explicitly specified with a formula — flagged clearly to the user when built, not silently
   assumed. Worth a quick confirmation from Ruchit/Harshit/Tanveer that the interpretation matches
   intent, especially before any month with a real (non-zero, non-tied) bonus or Foundation Account
   difference gets entered.
6. **Logo** is the user's real provided image (`public/logo.jpg`), not a recreation — a "use the
   exact logo" gotcha some future session might trip on if asked to redesign the logo lockup, since
   its background isn't transparent (it's on a light-gray backing already baked into the file).

## Gotchas for whoever picks this up

- **Next.js 16, not 15** — `proxy.ts` not `middleware.ts`, async `params`/`searchParams`
  everywhere, route prop types via `npx next typegen` (regenerate after adding/removing routes).
- **Tailwind v4** — config lives in `app/globals.css`'s `@theme inline` block, not a
  `tailwind.config.js` file (there isn't one).
- **Money conventions are load-bearing, not stylistic**: client billing (invoices/payments) is
  always USD; employee pay, payroll, vendors, and everything in the founder payout system is
  always INR. Mixing these up silently would be a real bug, not just a formatting inconsistency.
- **`lib/scorecard.ts` and the founder-payout math in `FounderPayoutCalculator.tsx`** are the two
  places this session was most careful about correctness (both had real source documents — an
  Excel file and two PDFs — to verify against). Changes to either should be re-verified the same
  way: a standalone Node script exercising the logic against hand-computed expected values, not
  just "looks right in the browser."
- **`git remote` is already set to `https://github.com/underesque/Esque-Portal.git`** and the repo
  has one commit pushed. Don't assume a fresh `git init`/first-push flow if picking this up.

## Suggested first steps in a fresh session

1. Read this file, then `git status` to confirm the uncommitted-work picture above is still
   accurate (and ask before committing/pushing).
2. Set up a real Supabase project: run all 5 migrations in order, fill in real `.env.local` values,
   create a first admin user, then do a real logged-in click-through — this is the biggest
   untested surface right now.
3. While logged in as admin, test the employee-signup flow end-to-end: add an employee with your
   own email, sign up at `/signup`, confirm you land on `/my-scorecard` and see (initially empty)
   scorecard data, confirm you're blocked from every other route.
4. Ask the user about item 3 above (the two coexisting founder-payout systems) and item 5
   (confirm the bonus/Foundation Account interpretations) before they matter for a real month.
