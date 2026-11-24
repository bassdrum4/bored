-- product_events had no retention at all, while play_events keeps 180 days.
-- It grows with every visit, card impression and library action, and nothing
-- reads past the analytics dashboard's 90-day cap.
--
-- Mirrors purge_play_events: security definer, a floor so a bad argument cannot
-- wipe recent history, and a nightly cron run. The delete ranges on
-- received_at, which product_events_day_idx already serves, so it never scans
-- the table. Daily cadence means each run removes roughly one day of rows.

create or replace function public.purge_product_events(p_keep_days integer default 90)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare removed integer;
begin
  if p_keep_days < 30 then
    raise exception 'retention must keep at least 30 days';
  end if;
  delete from public.product_events
   where received_at < now() - make_interval(days => p_keep_days);
  get diagnostics removed = row_count;
  return removed;
end
$function$;

-- Same posture as purge_play_events: no client role may call it.
revoke all on function public.purge_product_events(integer) from public, anon, authenticated;
grant execute on function public.purge_product_events(integer) to service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'bored-product-events-retention') then
    perform cron.unschedule('bored-product-events-retention');
  end if;
  perform cron.schedule('bored-product-events-retention', '37 7 * * *',
    'select public.purge_product_events(90)');
end $$;
