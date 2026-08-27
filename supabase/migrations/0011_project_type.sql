-- Distinguishes recurring monthly-billed projects/seats (e.g. Jeffrey, Alex,
-- Noah, Project Brett) from special one-time projects (e.g. a website
-- rebuild), so the UI can group them into separate sections.

create type project_type as enum ('monthly', 'one_time');

alter table projects
  add column project_type project_type not null default 'one_time';
