-- Human-readable Employee ID (distinct from the internal uuid primary key)
-- — a company-assigned code, left blank until assigned.

alter table employees add column employee_code text;
