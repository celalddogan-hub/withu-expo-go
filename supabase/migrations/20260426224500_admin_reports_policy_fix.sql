-- WithU admin reports security fix.
-- Ensures admins can read and update reports when using the latest repair pack.

drop policy if exists "Admins can manage reports" on public.reports;
create policy "Admins can manage reports"
on public.reports
for all
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()))
with check (exists (select 1 from public.admins a where a.user_id = auth.uid()));

drop policy if exists "Admins can read legacy reports" on public.rapporter;
create policy "Admins can read legacy reports"
on public.rapporter
for select
to authenticated
using (exists (select 1 from public.admins a where a.user_id = auth.uid()));
