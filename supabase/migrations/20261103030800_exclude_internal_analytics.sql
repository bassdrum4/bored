-- Keep analytics administrators out of production event tables at the database
-- boundary, even if they use an old client, forge a request or bypass the
-- browser-side environment guard. RLS still allows ordinary anonymous guests
-- and signed-in non-admin players to record telemetry.
--
-- RESTRICTIVE policies combine with existing permissive ownership/append
-- policies. Keep read/admin access policies unchanged.
begin;

drop policy if exists analytics_exclude_admin_insert on public.play_events;
create policy analytics_exclude_admin_insert on public.play_events
  as restrictive for insert to authenticated
  with check (not (select public.is_analytics_admin()));

drop policy if exists analytics_exclude_admin_insert on public.product_events;
create policy analytics_exclude_admin_insert on public.product_events
  as restrictive for insert to authenticated
  with check (not (select public.is_analytics_admin()));

drop policy if exists analytics_exclude_admin_insert on public.enjoyment_feedback;
create policy analytics_exclude_admin_insert on public.enjoyment_feedback
  as restrictive for insert to authenticated
  with check (not (select public.is_analytics_admin()));

commit;
