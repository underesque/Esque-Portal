-- Founder profit-sharing, vendor management, and the holiday calendar.
-- All amounts here are INR (paise) — company-internal money, same convention
-- as employees/payroll in 0001.

-- ---------------------------------------------------------------------------
-- Founder distribution
--
-- Each month, after deducting what was paid out to regular (non-founder)
-- employees, the remaining pool is split: 10% to whoever handles sales
-- (split evenly if more than one), 50% to whoever handles operations, 32%
-- split evenly among the partners, and 8% retained by the company. Role
-- assignments are tracked here so history stays accurate even if who holds
-- a role changes later — each run snapshots the people and percentages used.
-- ---------------------------------------------------------------------------

create type founder_role as enum ('sales', 'operations', 'partner');

create table founder_assignments (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  role founder_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (employee_id, role)
);

alter table founder_assignments enable row level security;

create policy "founder_assignments: admin only" on founder_assignments
  for all using (is_admin()) with check (is_admin());

create table distribution_runs (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  revenue_usd_cents bigint,
  exchange_rate numeric(10, 4),
  revenue_inr_cents bigint not null check (revenue_inr_cents >= 0),
  total_salaries_inr_cents bigint not null default 0 check (total_salaries_inr_cents >= 0),
  distributable_inr_cents bigint not null check (distributable_inr_cents >= 0),
  company_retained_inr_cents bigint not null default 0,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index distribution_runs_period_idx on distribution_runs (period_start desc);

alter table distribution_runs enable row level security;

create policy "distribution_runs: admin only" on distribution_runs
  for all using (is_admin()) with check (is_admin());

create table distribution_shares (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references distribution_runs (id) on delete cascade,
  employee_id uuid not null references employees (id),
  role founder_role not null,
  percent_of_pool numeric(6, 3) not null,
  amount_inr_cents bigint not null,
  created_at timestamptz not null default now()
);

create index distribution_shares_run_idx on distribution_shares (run_id);

alter table distribution_shares enable row level security;

create policy "distribution_shares: admin only" on distribution_shares
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Vendors
-- ---------------------------------------------------------------------------

create type billing_frequency as enum ('monthly', 'quarterly', 'biannual', 'annual', 'one_time');
create type vendor_status as enum ('active', 'inactive');

-- Vendor bills are always INR (paise), same convention as employees/payroll.
create table vendors (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  contact_name text,
  contact_email text,
  contact_phone text,
  billing_frequency billing_frequency not null default 'monthly',
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  next_due_date date,
  status vendor_status not null default 'active',
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index vendors_next_due_idx on vendors (next_due_date);
create index vendors_status_idx on vendors (status);

alter table vendors enable row level security;

create policy "vendors: admin only" on vendors
  for all using (is_admin()) with check (is_admin());

create trigger vendors_set_updated_at before update on vendors
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Holiday calendar
-- ---------------------------------------------------------------------------

create table holidays (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  date date not null,
  recurring_annually boolean not null default false,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index holidays_date_idx on holidays (date);

alter table holidays enable row level security;

create policy "holidays: authenticated read" on holidays
  for select using (auth.uid() is not null);

create policy "holidays: admin write" on holidays
  for insert with check (is_admin());

create policy "holidays: admin delete" on holidays
  for delete using (is_admin());
