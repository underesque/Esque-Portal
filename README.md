# ESQUE Portal

Internal client & employee management portal for ESQUE. Next.js 16 (App Router) + Supabase
(Postgres, Auth, Row Level Security).

## What's here

- **Role-based access** — `admin`, `staff`, and `employee` roles stored in `profiles`. Admins see
  everything; staff can manage clients/billing but cannot see employee compensation or payroll;
  employees get their own login and can only ever see their own performance scorecard (see below).
- **Client management** — client records, a communication timeline, invoices, and payment history.
- **Employee management** — headcount roster, employment details, active/inactive overview.
- **Salary & commission** — fixed, commission-only, or hybrid pay structures; commission entries
  with configurable rates; a payroll run that combines base salary + approved commission for a
  period. Client billing is USD; employee pay and payroll are INR.
- **Founder payouts** — a monthly profit-split calculator: revenue collected (entered directly in
  INR, or as a USD amount converted with an exchange rate), minus that period's non-founder
  salaries, split 10% to whoever's assigned Sales (evenly if more than one), 50% to Operations,
  32% split evenly across Partners, and 8% retained by the company. Role assignments and every run
  are stored, so history stays correct even if who holds a role changes later.
- **Annual salary summary** (`/payroll/annual`) — total payroll + founder distributions processed
  per person, by financial year (April–March).
- **Vendors** — recurring or one-off bills ESQUE pays out, with billing frequency, amount/currency,
  and next-due tracking; "mark paid" advances the due date by the billing frequency.
- **Notifications** — a live, computed view of what needs attention: overdue/upcoming vendor
  bills, a payroll-not-yet-run reminder, draft invoices that still need to be sent, and client
  invoices coming due or overdue. Nothing is stored — it's derived from current data on load.
- **Holiday calendar** — company holidays, visible to everyone; admins add/remove them.
- **Performance scorecards** — monthly scores across five weighted categories (Attendance 10%,
  Punctuality 10%, Work Performance 50%, Manager Feedback 10%, Responsiveness 20%), entered by
  admins on each employee's detail page. Employees sign up at `/signup` with the email already on
  file for them, which auto-links their account (read-only) to their own scorecard at
  `/my-scorecard` — never anyone else's. A yearly average maps to the salary-increment tiers from
  the Growth Policy (100% → 25%, 95–99% → 20%, 90–94% → 15%, 80–89% → 10%, 75–79% → 7%,
  70–74% → 5%).
- **Dashboard** — client count, revenue collected, pending invoices, payroll summary (admin), and
  a recent activity feed.
- **Activity log** — every create/update/status-change is recorded with who did it and when.

## Setup

1. **Create a Supabase project** at [supabase.com](https://supabase.com).
2. **Run the migrations** in `supabase/migrations/`, in numeric order (`0001` through `0005`) —
   paste each into the Supabase SQL Editor and run it (or use the Supabase CLI: `supabase db
   push`). Together they create every table, enum, and Row Level Security policy the app needs.
   `0004` and `0005` must run as two separate statements/scripts, in that order — Postgres won't
   let a brand-new enum value (`0004` adds the `employee` role) be referenced in the same
   transaction it was created in, which `0005` does.
3. **Copy environment variables**:
   ```bash
   cp .env.local.example .env.local
   ```
   Fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from your Supabase
   project's API settings.
4. **Create your first user** — in Supabase Auth, add a user (email/password). A `profiles` row is
   created automatically with role `staff`. To make yourself an admin, run in the SQL Editor:
   ```sql
   update profiles set role = 'admin' where id = '<your-user-id>';
   ```
5. **Install and run**:
   ```bash
   npm install
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) and sign in.

## Project structure

- `app/(portal)/` — authenticated pages (dashboard, clients, employees, payroll, founders,
  vendors, notifications, holidays, activity, my-scorecard), wrapped by a shared sidebar layout
  that filters nav items by role.
- `app/login/`, `app/signup/` — sign-in (admin/staff/employee) and employee self-signup, both
  public.
- `lib/actions/` — Server Actions for every mutation (clients, billing, employees, payroll,
  founders, vendors, holidays, scorecards, auth).
- `lib/scorecard.ts` — the scorecard weights and increment tiers, shared by the admin-entry UI and
  the employee's own view so both always agree.
- `lib/supabase/` — Supabase client factories for the browser, server components, and the proxy.
- `proxy.ts` — gates every route behind auth; restricts `/employees`, `/payroll`, `/founders`, and
  `/vendors` to admins; and restricts the `employee` role to only `/my-scorecard` and `/holidays`.
- `supabase/migrations/` — the full database schema.

## Notes on access control

Access is enforced in three places, so a hole in one layer doesn't expose data:

1. `proxy.ts` redirects non-admins away from `/employees`, `/payroll`, `/founders`, and
   `/vendors`, and redirects the `employee` role away from everything except `/my-scorecard` and
   `/holidays`.
2. Server Actions call `requireAdmin()` (or `requireEmployee()` for the employee's own page) before
   any protected mutation or read.
3. Row Level Security policies restrict access at the database level regardless of what the app
   does — `employees` can only be read in full by admin/staff, or by an employee for their own row;
   `monthly_scorecards` can only be written by admins, and read by an employee only for their own
   `employee_id`; `commission_rules`, `commission_entries`, `payroll_runs`, `founder_assignments`,
   `distribution_runs`, `distribution_shares`, and `vendors` remain admin-only.
