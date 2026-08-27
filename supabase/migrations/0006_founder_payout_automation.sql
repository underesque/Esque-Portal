-- Automatic founder payout, computed from real invoice data instead of the
-- old FounderPayoutCalculator (a client-side, no-persistence spreadsheet
-- where an admin hand-typed ~15 fields per row every month).
--
-- Replaces the older founder_assignments/distribution_runs/distribution_shares
-- system too (0002_founders_vendors_holidays.sql) — that was itself a
-- simpler, evenly-split predecessor to the calculator, now fully superseded.
-- No live invoice/payout data exists yet in this project, so both are
-- dropped outright rather than migrated.

-- ---------------------------------------------------------------------------
-- Founders: salary basis lives on employees, same convention as the
-- existing base_salary_cents/pay_type columns. A founder gets a flat
-- monthly salary deducted once from their attributed revenue (Policy §1),
-- rather than a manually-typed deduction per client/invoice.
-- ---------------------------------------------------------------------------

create type founder_salary_basis as enum ('full_time', 'half_time', 'hourly_director', 'custom');

alter table employees
  add column is_founder boolean not null default false,
  add column salary_basis founder_salary_basis not null default 'full_time',
  add column salary_basis_hours numeric(6, 2) not null default 0 check (salary_basis_hours >= 0),
  add column salary_basis_custom_cents bigint not null default 0 check (salary_basis_custom_cents >= 0);

create index employees_is_founder_idx on employees (is_founder);

-- ---------------------------------------------------------------------------
-- Clients: per-client defaults, set once, replace the calculator's per-row
-- fields. sales_owner_id already exists (0003_client_sales_owner.sql);
-- ops_owner_id is its counterpart for the Operations 50% pool.
-- ---------------------------------------------------------------------------

create type invoice_payout_type as enum ('normal', 'hourly', 'bonus');

alter table clients
  add column ops_owner_id uuid references employees (id) on delete set null,
  add column is_foundation_account boolean not null default false,
  add column default_payout_type invoice_payout_type not null default 'normal';

create index clients_ops_owner_idx on clients (ops_owner_id);

-- Custom sales/ops credit splits, for the rare client where credit isn't
-- 100% to sales_owner_id/ops_owner_id (e.g. the old calculator's "Semble -
-- Noah" row splitting Sales credit 50/50 between two founders). No rows for
-- a given (client_id, split_type) means "100% to the client's
-- sales_owner_id / ops_owner_id" — most clients never touch this table.
create table client_payout_splits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  split_type text not null check (split_type in ('sales', 'ops')),
  employee_id uuid not null references employees (id) on delete cascade,
  share_percent numeric(5, 2) not null check (share_percent > 0 and share_percent <= 100),
  created_at timestamptz not null default now(),
  unique (client_id, split_type, employee_id)
);

create index client_payout_splits_client_idx on client_payout_splits (client_id, split_type);

alter table client_payout_splits enable row level security;

create policy "client_payout_splits: admin only" on client_payout_splits
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Invoices: the few things that genuinely vary per revenue event (not per
-- client) become invoice-level fields — the USD→INR conversion rate, and an
-- optional payout-type override (defaults from the client's
-- default_payout_type at creation time).
-- ---------------------------------------------------------------------------

alter table invoices
  add column conversion_rate numeric(12, 6) check (conversion_rate is null or conversion_rate > 0),
  add column payout_type invoice_payout_type not null default 'normal',
  add column bonus_co_handler_employee_id uuid references employees (id) on delete set null,
  add column bonus_handler_share_percent numeric(5, 2) not null default 100
    check (bonus_handler_share_percent >= 0 and bonus_handler_share_percent <= 100),
  add column paid_at timestamptz;

-- ---------------------------------------------------------------------------
-- Persisted payout output — one row per calendar month, fully recomputed
-- (not appended to) every time an invoice in that month is marked paid, via
-- lib/actions/payout.ts. Recomputing the whole month is required because
-- the Foundation Account excess rule and each founder's flat salary
-- deduction both depend on *all* of a month's paid invoices together.
-- ---------------------------------------------------------------------------

create table payout_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  conversion_total_inr_cents bigint not null default 0,
  esque_total_inr_cents bigint not null default 0,
  foundation_excess_inr_cents bigint not null default 0,
  computed_at timestamptz not null default now(),
  unique (period_start)
);

create index payout_runs_period_idx on payout_runs (period_start desc);

alter table payout_runs enable row level security;

create policy "payout_runs: admin only" on payout_runs
  for all using (is_admin()) with check (is_admin());

create type payout_share_category as enum ('sales', 'ops', 'partner', 'salary', 'bonus', 'foundation_excess');

create table payout_shares (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references payout_runs (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  category payout_share_category not null,
  source_invoice_id uuid references invoices (id) on delete set null,
  amount_inr_cents bigint not null, -- negative for the 'salary' deduction row
  created_at timestamptz not null default now()
);

create index payout_shares_run_idx on payout_shares (run_id);
create index payout_shares_employee_idx on payout_shares (employee_id);

alter table payout_shares enable row level security;

create policy "payout_shares: admin only" on payout_shares
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Privileged write path. invoices RLS ("authenticated write") lets any
-- signed-in staff mark an invoice paid, not just admins — but payout_runs/
-- payout_shares must stay admin-only, matching the sensitivity of the
-- distribution_* tables they replace. Rather than add a service-role client
-- (no precedent anywhere in this codebase), reuse the existing
-- security-definer pattern already used by is_admin()/handle_new_user():
-- lib/actions/payout.ts computes everything in TypeScript, then calls this
-- function to atomically replace one month's rows under elevated privilege.
-- ---------------------------------------------------------------------------

create function replace_founder_payout_month(
  p_period_start date,
  p_period_end date,
  p_conversion_total_inr_cents bigint,
  p_esque_total_inr_cents bigint,
  p_foundation_excess_inr_cents bigint,
  p_shares jsonb -- array of {employee_id, category, source_invoice_id, amount_inr_cents}
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run_id uuid;
begin
  insert into payout_runs (period_start, period_end, conversion_total_inr_cents, esque_total_inr_cents, foundation_excess_inr_cents, computed_at)
  values (p_period_start, p_period_end, p_conversion_total_inr_cents, p_esque_total_inr_cents, p_foundation_excess_inr_cents, now())
  on conflict (period_start) do update
    set period_end = excluded.period_end,
        conversion_total_inr_cents = excluded.conversion_total_inr_cents,
        esque_total_inr_cents = excluded.esque_total_inr_cents,
        foundation_excess_inr_cents = excluded.foundation_excess_inr_cents,
        computed_at = now()
  returning id into v_run_id;

  delete from payout_shares where run_id = v_run_id;

  insert into payout_shares (run_id, employee_id, category, source_invoice_id, amount_inr_cents)
  select v_run_id,
         (elem->>'employee_id')::uuid,
         (elem->>'category')::payout_share_category,
         nullif(elem->>'source_invoice_id', '')::uuid,
         (elem->>'amount_inr_cents')::bigint
  from jsonb_array_elements(p_shares) elem;

  return v_run_id;
end;
$$;

grant execute on function replace_founder_payout_month(date, date, bigint, bigint, bigint, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Retire the legacy manual distribution system.
-- ---------------------------------------------------------------------------

drop table if exists distribution_shares;
drop table if exists distribution_runs;
drop table if exists founder_assignments;
drop type if exists founder_role;
