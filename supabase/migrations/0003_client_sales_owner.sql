-- Tracks which founder/salesperson owns each client, so the founder
-- distribution's sales pool can be split by whose clients actually generated
-- the revenue that period, instead of split evenly across sales roles.

alter table clients
  add column sales_owner_id uuid references employees (id) on delete set null;

create index clients_sales_owner_idx on clients (sales_owner_id);
