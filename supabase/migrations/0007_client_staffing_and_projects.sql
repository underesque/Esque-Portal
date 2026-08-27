-- Client staffing, a general-purpose Projects system, and employee profile
-- additions (bank details, t-shirt size).
--
-- client_assignments answers "who works on this client account" — distinct
-- from sales_owner_id/ops_owner_id (0003/0006), which are singular founder
-- payout attribution, not staffing. projects/project_assignments track work
-- items any employee can be staffed on; contractual employees additionally
-- carry per-project billing (hourly or a flat contract amount, admin's
-- choice per assignment).

-- ---------------------------------------------------------------------------
-- Employment type: "contractor" -> "contractual". Hourly vs. fixed-contract
-- billing becomes a per-project choice (project_assignments.billing_type
-- below), not a separate employment type.
-- ---------------------------------------------------------------------------

alter type employment_type rename value 'contractor' to 'contractual';

-- ---------------------------------------------------------------------------
-- Employee profile additions.
-- ---------------------------------------------------------------------------

create type tshirt_size as enum ('XS', 'S', 'M', 'L', 'XL', 'XXL');

alter table employees
  add column bank_account_holder text,
  add column bank_account_number text,
  add column bank_ifsc text,
  add column bank_name text,
  add column t_shirt_size tshirt_size;

-- ---------------------------------------------------------------------------
-- Client staffing. Same access tier as clients themselves — staff already
-- manage client relationships.
-- ---------------------------------------------------------------------------

create table client_assignments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  unique (client_id, employee_id)
);

create index client_assignments_client_idx on client_assignments (client_id);
create index client_assignments_employee_idx on client_assignments (employee_id);

alter table client_assignments enable row level security;

create policy "client_assignments: authenticated read" on client_assignments
  for select using (auth.uid() is not null);

create policy "client_assignments: authenticated write" on client_assignments
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- Projects. Same access tier as clients/invoices — staff-manageable.
-- ---------------------------------------------------------------------------

create type project_status as enum ('not_started', 'ongoing', 'completed', 'blocked_by_client');

create table projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  description text,
  status project_status not null default 'not_started',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_client_idx on projects (client_id);
create index projects_status_idx on projects (status);

alter table projects enable row level security;

create policy "projects: authenticated read" on projects
  for select using (auth.uid() is not null);

create policy "projects: authenticated write" on projects
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create trigger projects_set_updated_at before update on projects
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Project assignments. RLS split exactly like employees: anyone signed in
-- can see who's staffed where, but only admins can add/edit/remove an
-- assignment — the billing fields are compensation data, same protection
-- tier as commission_entries/payroll_runs.
-- ---------------------------------------------------------------------------

create type project_billing_type as enum ('hourly', 'fixed_contract');

create table project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  employee_id uuid not null references employees (id) on delete cascade,
  billing_type project_billing_type,
  hourly_rate_cents bigint check (hourly_rate_cents is null or hourly_rate_cents >= 0),
  hours numeric(7, 2) check (hours is null or hours >= 0),
  fixed_contract_amount_cents bigint check (fixed_contract_amount_cents is null or fixed_contract_amount_cents >= 0),
  created_at timestamptz not null default now(),
  unique (project_id, employee_id)
);

create index project_assignments_project_idx on project_assignments (project_id);
create index project_assignments_employee_idx on project_assignments (employee_id);

alter table project_assignments enable row level security;

create policy "project_assignments: authenticated read" on project_assignments
  for select using (auth.uid() is not null);

create policy "project_assignments: admin write" on project_assignments
  for insert with check (is_admin());

create policy "project_assignments: admin update" on project_assignments
  for update using (is_admin()) with check (is_admin());

create policy "project_assignments: admin delete" on project_assignments
  for delete using (is_admin());
