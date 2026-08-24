-- Performance Scorecard & employee self-service login.
--
-- Adds a third access tier, "employee", alongside admin/staff. An employee
-- account is tied to exactly one row in `employees` and can only ever see
-- its own scorecard data — never other employees', never client/payroll
-- data. Employees provision their own account by signing up with the email
-- address already on file for them (see is_employee_email() below); admin
-- accounts continue to be created the existing way (Supabase Auth "Add
-- user"), which is untouched.

-- ---------------------------------------------------------------------------
-- Role + profile linkage
--
-- (The 'employee' enum value itself is added by 0004_add_employee_role.sql,
-- run first — Postgres won't let a brand-new enum value be referenced in
-- the same transaction it was created in.)
-- ---------------------------------------------------------------------------

alter table profiles
  add column employee_id uuid references employees (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Tighten employees visibility now that employees themselves can log in.
--
-- Previously any authenticated user could read the full employees table —
-- fine when only trusted admin/staff had accounts, not once employees do
-- (that would let an employee read every colleague's salary). Admins and
-- staff keep exactly the access they already had; employees can only read
-- their own row.
-- ---------------------------------------------------------------------------

drop policy "employees: authenticated read" on employees;

create policy "employees: staff and admin read" on employees
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role in ('admin', 'staff')
    )
  );

create policy "employees: self read" on employees
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.employee_id = employees.id
    )
  );

-- ---------------------------------------------------------------------------
-- Monthly scorecards
--
-- Weights are fixed by the Performance Scorecard & Growth Policy (10/10/50/
-- 10/20, summing to 100) and applied in the app layer, same as the founder
-- payout split — not stored per-row, since the policy doesn't make them
-- admin-editable.
-- ---------------------------------------------------------------------------

create table monthly_scorecards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  attendance_score numeric(5, 2) not null default 100 check (attendance_score between 0 and 100),
  punctuality_score numeric(5, 2) not null default 100 check (punctuality_score between 0 and 100),
  work_performance_score numeric(5, 2) not null default 100 check (work_performance_score between 0 and 100),
  manager_feedback_score numeric(5, 2) not null default 100 check (manager_feedback_score between 0 and 100),
  responsiveness_score numeric(5, 2) not null default 100 check (responsiveness_score between 0 and 100),
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, period_start)
);

create index monthly_scorecards_employee_idx on monthly_scorecards (employee_id, period_start desc);

alter table monthly_scorecards enable row level security;

create policy "monthly_scorecards: admin full access" on monthly_scorecards
  for all using (is_admin()) with check (is_admin());

create policy "monthly_scorecards: self read" on monthly_scorecards
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.employee_id = monthly_scorecards.employee_id
    )
  );

create trigger monthly_scorecards_set_updated_at before update on monthly_scorecards
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Employee self-signup
--
-- handle_new_user() gains a new branch: if the signing-up email matches an
-- active employee record, the profile is created as role 'employee' and
-- linked. Anything that doesn't match falls back to the exact original
-- behavior (role 'staff', no link) — existing admin/staff provisioning via
-- the Supabase dashboard is unchanged.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_employee_id uuid;
  matched_employee_name text;
begin
  select id, full_name into matched_employee_id, matched_employee_name
  from employees
  where lower(email) = lower(new.email) and status = 'active'
  limit 1;

  if matched_employee_id is not null then
    insert into profiles (id, full_name, role, employee_id)
    values (new.id, matched_employee_name, 'employee', matched_employee_id);
  else
    insert into profiles (id, full_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email), 'staff');
  end if;

  return new;
end;
$$;

-- Lets the public signup form check "is there an employee record for this
-- email" before attempting signup, without needing a session (SELECT on
-- employees now requires one). Returns only a boolean — never employee
-- details — so it's safe to expose to anon.
create function is_employee_email(check_email text)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from employees where lower(email) = lower(check_email) and status = 'active'
  );
$$;

grant execute on function is_employee_email(text) to anon, authenticated;
