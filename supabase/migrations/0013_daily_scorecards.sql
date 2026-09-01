-- Daily scorecard entries. monthly_scorecards stays the schema/RLS/consumer
-- surface everything else already reads; this table is the new write path,
-- rolled up into monthly_scorecards by the app layer (lib/actions/scorecards.ts).

create table daily_scorecards (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees (id) on delete cascade,
  entry_date date not null,
  attendance_score numeric(5, 2) not null default 100 check (attendance_score between 0 and 100),
  punctuality_score numeric(5, 2) not null default 100 check (punctuality_score between 0 and 100),
  work_performance_score numeric(5, 2) not null default 100 check (work_performance_score between 0 and 100),
  manager_feedback_score numeric(5, 2) not null default 100 check (manager_feedback_score between 0 and 100),
  responsiveness_score numeric(5, 2) not null default 100 check (responsiveness_score between 0 and 100),
  notes text,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, entry_date),
  constraint daily_scorecards_weekday_check check (extract(isodow from entry_date) between 1 and 5)
);

create index daily_scorecards_employee_idx on daily_scorecards (employee_id, entry_date desc);

create trigger set_daily_scorecards_updated_at
  before update on daily_scorecards
  for each row execute function set_updated_at();

alter table daily_scorecards enable row level security;

create policy "daily_scorecards: admin full access" on daily_scorecards
  for all using (is_admin()) with check (is_admin());

create policy "daily_scorecards: self read" on daily_scorecards
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.employee_id = daily_scorecards.employee_id
    )
  );
