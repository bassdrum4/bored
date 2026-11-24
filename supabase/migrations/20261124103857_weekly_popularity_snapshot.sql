-- Keep the public Popular order steady throughout the school week.
-- Reuse the existing job name: pg_cron upserts it rather than adding a second job.
do $schedule$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
    and to_regclass('public.bored_popularity_snapshot') is not null
    and to_regclass('public.play_events') is not null
    and to_regclass('public.f14_flight_events') is not null
    and to_regclass('public.analytics_admins') is not null
    and to_regclass('public.game_analytics_readers') is not null then
    perform cron.schedule('bored-popularity-daily', '7 7 * * 1',
      'select public.refresh_bored_popularity_snapshot()');
  end if;
end;
$schedule$;
