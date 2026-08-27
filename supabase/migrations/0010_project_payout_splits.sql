-- Per-project sales/ops credit splits.
--
-- Some clients (e.g. Todd Tarbert/Semble) aren't one flat account — they
-- have multiple separately-invoiced "seats"/engagements under the same
-- client, each with its own sales-credit split. Projects already model
-- "a named work item under a client"; this lets an invoice say which
-- project/seat it's for, and lets a client_payout_splits row optionally
-- scope to one project instead of the whole client.

alter table invoices
  add column project_id uuid references projects (id) on delete set null;

alter table client_payout_splits
  add column project_id uuid references projects (id) on delete cascade;

-- Nullable columns don't dedupe under a plain unique constraint (every null
-- is distinct from every other null), so the client-wide-default rows
-- (project_id is null) need their own partial unique index, separate from
-- the per-project rows.
alter table client_payout_splits
  drop constraint client_payout_splits_client_id_split_type_employee_id_key;

create unique index client_payout_splits_default_uidx
  on client_payout_splits (client_id, split_type, employee_id)
  where project_id is null;

create unique index client_payout_splits_project_uidx
  on client_payout_splits (client_id, project_id, split_type, employee_id)
  where project_id is not null;
