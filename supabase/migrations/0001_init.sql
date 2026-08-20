-- ESQUE internal portal: initial schema
-- Roles, clients, communications, billing, employees, salary & commissions, activity log.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roles & profiles
-- ---------------------------------------------------------------------------

create type user_role as enum ('admin', 'staff');

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role user_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- Runs as the table owner, so it can read profiles without tripping the
-- policies below (a policy on profiles that queries profiles would recurse).
create function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

create function current_role_name()
returns user_role
language sql
security definer
set search_path = public
stable
as $$
  select role from profiles where id = auth.uid();
$$;

alter table profiles enable row level security;

create policy "profiles: self read" on profiles
  for select using (id = auth.uid() or is_admin());

create policy "profiles: admin write" on profiles
  for all using (is_admin()) with check (is_admin());

-- Auto-create a profile (default role: staff) whenever a new auth user signs up.
create function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'staff');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------

create type client_status as enum ('active', 'inactive', 'prospect');

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  business_name text,
  business_website text,
  phone text,
  address text,
  status client_status not null default 'active',
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_status_idx on clients (status);
create index clients_name_idx on clients (name);

alter table clients enable row level security;

create policy "clients: authenticated read" on clients
  for select using (auth.uid() is not null);

create policy "clients: authenticated write" on clients
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Client communications (activity/timeline)
-- ---------------------------------------------------------------------------

create type communication_type as enum ('email', 'call', 'meeting', 'note');

create table client_communications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  type communication_type not null default 'note',
  subject text not null,
  body text,
  occurred_at timestamptz not null default now(),
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index client_communications_client_idx on client_communications (client_id, occurred_at desc);

alter table client_communications enable row level security;

create policy "communications: authenticated read" on client_communications
  for select using (auth.uid() is not null);

create policy "communications: authenticated write" on client_communications
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Billing: invoices & payments
--
-- Client billing is always USD. Employee pay (below) is always INR. Amounts
-- are stored as integer minor units (cents for USD, paise for INR) in both
-- cases; the currency is fixed per table, not a per-row column.
-- ---------------------------------------------------------------------------

create type invoice_status as enum ('draft', 'sent', 'paid', 'overdue', 'void');

create table invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  invoice_number text not null unique,
  amount_cents bigint not null check (amount_cents >= 0),
  status invoice_status not null default 'draft',
  issued_date date not null default current_date,
  due_date date,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index invoices_client_idx on invoices (client_id);
create index invoices_status_idx on invoices (status);

alter table invoices enable row level security;

create policy "invoices: authenticated read" on invoices
  for select using (auth.uid() is not null);

create policy "invoices: authenticated write" on invoices
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices (id) on delete set null,
  client_id uuid not null references clients (id) on delete cascade,
  amount_cents bigint not null check (amount_cents >= 0),
  payment_date date not null default current_date,
  method text,
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index payments_client_idx on payments (client_id);
create index payments_invoice_idx on payments (invoice_id);

alter table payments enable row level security;

create policy "payments: authenticated read" on payments
  for select using (auth.uid() is not null);

create policy "payments: authenticated write" on payments
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Employees & compensation (admin-only visibility)
--
-- Salary, commission, and payroll amounts are always INR (paise).
-- ---------------------------------------------------------------------------

create type employment_type as enum ('full_time', 'part_time', 'contractor');
create type employee_status as enum ('active', 'inactive');
create type pay_type as enum ('fixed', 'commission', 'hybrid');

create table employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  start_date date not null default current_date,
  employment_type employment_type not null default 'full_time',
  status employee_status not null default 'active',
  pay_type pay_type not null default 'fixed',
  base_salary_cents bigint not null default 0 check (base_salary_cents >= 0),
  commission_rate_percent numeric(5, 2) not null default 0 check (commission_rate_percent >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index employees_status_idx on employees (status);

alter table employees enable row level security;

-- Everyone signed in can see the headcount roster (name/type/status) for the
-- overview dashboard, but only admins can see compensation fields — enforced
-- at the application layer by selecting a restricted column set for staff.
create policy "employees: authenticated read" on employees
  for select using (auth.uid() is not null);

create policy "employees: admin write" on employees
  for insert with check (is_admin());

create policy "employees: admin update" on employees
  for update using (is_admin()) with check (is_admin());

create policy "employees: admin delete" on employees
  for delete using (is_admin());

create table commission_rules (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  name text not null,
  rate_percent numeric(5, 2) not null check (rate_percent >= 0),
  min_amount_cents bigint not null default 0,
  max_amount_cents bigint,
  created_at timestamptz not null default now()
);

create index commission_rules_employee_idx on commission_rules (employee_id);

alter table commission_rules enable row level security;

create policy "commission_rules: admin only" on commission_rules
  for all using (is_admin()) with check (is_admin());

create type commission_status as enum ('pending', 'approved', 'paid');

create table commission_entries (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  client_id uuid references clients (id) on delete set null,
  description text not null,
  base_amount_cents bigint not null check (base_amount_cents >= 0),
  rate_percent numeric(5, 2) not null check (rate_percent >= 0),
  commission_amount_cents bigint generated always as (
    round(base_amount_cents * rate_percent / 100.0)
  ) stored,
  status commission_status not null default 'pending',
  period_start date not null,
  period_end date not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index commission_entries_employee_idx on commission_entries (employee_id);

alter table commission_entries enable row level security;

create policy "commission_entries: admin only" on commission_entries
  for all using (is_admin()) with check (is_admin());

create type payroll_status as enum ('draft', 'processed', 'paid');

create table payroll_runs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  base_amount_cents bigint not null default 0,
  commission_amount_cents bigint not null default 0,
  total_amount_cents bigint generated always as (base_amount_cents + commission_amount_cents) stored,
  status payroll_status not null default 'draft',
  processed_at timestamptz,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index payroll_runs_employee_idx on payroll_runs (employee_id, period_start desc);

alter table payroll_runs enable row level security;

create policy "payroll_runs: admin only" on payroll_runs
  for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Activity log
-- ---------------------------------------------------------------------------

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references profiles (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index activity_log_entity_idx on activity_log (entity_type, entity_id);
create index activity_log_created_idx on activity_log (created_at desc);

alter table activity_log enable row level security;

create policy "activity_log: authenticated read" on activity_log
  for select using (auth.uid() is not null);

create policy "activity_log: authenticated write" on activity_log
  for insert with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- updated_at bookkeeping
-- ---------------------------------------------------------------------------

create function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_set_updated_at before update on clients
  for each row execute function set_updated_at();

create trigger invoices_set_updated_at before update on invoices
  for each row execute function set_updated_at();

create trigger employees_set_updated_at before update on employees
  for each row execute function set_updated_at();
