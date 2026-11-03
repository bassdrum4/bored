-- Exclude authenticated analytics staff at the ingestion boundary. This
-- migration is intentionally safe in the separate Bored Together test database,
-- which has no analytics tables or analytics-admin helper.
--
-- A restrictive policy is ANDed with the existing permissive ownership policy.
-- The old policy still permits ordinary anon visitors and non-admin accounts.
begin;
do $migration$
begin
  if to_regprocedure('public.is_analytics_admin()') is null then
    return;
  end if;

  if to_regclass('public.play_events') is not null then
    execute 'drop policy if exists analytics_exclude_admin_insert on public.play_events';
    execute 'create policy analytics_exclude_admin_insert on public.play_events
      as restrictive for insert to authenticated
      with check (not (select public.is_analytics_admin()))';
  end if;

  if to_regclass('public.product_events') is not null then
    execute 'drop policy if exists analytics_exclude_admin_insert on public.product_events';
    execute 'create policy analytics_exclude_admin_insert on public.product_events
      as restrictive for insert to authenticated
      with check (not (select public.is_analytics_admin()))';
  end if;

  if to_regclass('public.enjoyment_feedback') is not null then
    execute 'drop policy if exists analytics_exclude_admin_insert on public.enjoyment_feedback';
    execute 'create policy analytics_exclude_admin_insert on public.enjoyment_feedback
      as restrictive for insert to authenticated
      with check (not (select public.is_analytics_admin()))';
  end if;
end
$migration$;
commit;
