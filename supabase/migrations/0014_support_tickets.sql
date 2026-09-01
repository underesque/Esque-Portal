-- Support ticket system: internal (employee) issues and client-facing issues
-- in one table, distinguished by `type`. Comments are an append-only log,
-- matching the activity_log convention (no update/delete policy).

create type ticket_type as enum ('internal', 'client');
create type ticket_priority as enum ('low', 'medium', 'high', 'urgent');
create type ticket_status as enum ('open', 'in_progress', 'resolved', 'closed');

create table tickets (
  id uuid primary key default gen_random_uuid(),
  type ticket_type not null,
  subject text not null,
  description text,
  priority ticket_priority not null default 'medium',
  status ticket_status not null default 'open',
  client_id uuid references clients (id) on delete set null,
  about_employee_id uuid references employees (id) on delete set null,
  assignee_id uuid references employees (id) on delete set null,
  created_by uuid references profiles (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tickets_client_id_type_check check (client_id is null or type = 'client')
);

create index tickets_status_idx on tickets (status);
create index tickets_assignee_idx on tickets (assignee_id);

create trigger set_tickets_updated_at
  before update on tickets
  for each row execute function set_updated_at();

alter table tickets enable row level security;

create policy "tickets: authenticated read" on tickets
  for select using (auth.uid() is not null);

create policy "tickets: authenticated write" on tickets
  for all using (auth.uid() is not null) with check (auth.uid() is not null);

create table ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets (id) on delete cascade,
  body text not null,
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

create index ticket_comments_ticket_idx on ticket_comments (ticket_id, created_at);

alter table ticket_comments enable row level security;

create policy "ticket_comments: authenticated read" on ticket_comments
  for select using (auth.uid() is not null);

create policy "ticket_comments: authenticated write" on ticket_comments
  for insert with check (auth.uid() is not null);
