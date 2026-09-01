-- Seed the 2026 holiday calendar from the ESQUE holiday list.
-- Guarded with a NOT EXISTS check per row (name + date) so this migration is
-- safe to re-run and won't duplicate rows if any of these were already added
-- by hand through the app.

insert into holidays (name, date, recurring_annually)
select v.name, v.date, v.recurring_annually
from (
  values
    ('Indian Republic Day', date '2026-01-26', true),
    ('Holi (Festival of Colors)', date '2026-03-04', false),
    ('Eid al-Fitr', date '2026-03-20', false),
    ('Eid al-Adha', date '2026-05-26', false),
    ('US Independence Day', date '2026-07-03', true),
    ('Indian Independence Day', date '2026-08-15', true),
    ('US Labor Day', date '2026-09-07', false),
    ('Diwali (Festival of Lights)', date '2026-11-09', false),
    ('Thanksgiving Day', date '2026-11-26', false),
    ('Christmas', date '2026-12-25', true),
    ('Year-End', date '2026-12-31', true)
) as v(name, date, recurring_annually)
where not exists (
  select 1 from holidays h where h.name = v.name and h.date = v.date
);
