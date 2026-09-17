-- Lets admin link a "staff" portal login to its real employees-table row, so
-- that staff member's dashboard can show their own score/salary/assignments
-- on top of their existing broader clients/billing/ticket access. Purely
-- additive: the self-signup trigger (handle_new_user) is untouched, and every
-- existing "self can read own profile" policy is untouched.

create policy "profiles: admin read all" on profiles
  for select using (is_admin());

create policy "profiles: admin update" on profiles
  for update using (is_admin()) with check (is_admin());
