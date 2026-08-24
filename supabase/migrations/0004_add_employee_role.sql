-- Adding an enum value must be committed before it can be referenced by
-- name elsewhere (Postgres disallows using a brand-new enum value inside
-- the same transaction it was added in) — so this is its own migration,
-- run before 0005_performance_scorecard.sql, which uses 'employee' in
-- policies and a trigger function.

alter type user_role add value 'employee';
