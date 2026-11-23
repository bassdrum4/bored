-- Compute Bored's public seven-day popularity once a day instead of per visitor.
-- Cache has no user identifiers, and F-14 events remain included.
create table if not exists public.bored_popularity_snapshot (
  game text primary key,
  ranking bigint not null,
  refreshed_at timestamptz not null
);
alter table public.bored_popularity_snapshot enable row level security;
revoke all on public.bored_popularity_snapshot from public, anon, authenticated;

create or replace function public.refresh_bored_popularity_snapshot()
returns void language plpgsql security definer set search_path = ''
as $function$
begin
  -- Stage results before replacing the snapshot. A failure keeps yesterday's snapshot.
  create temporary table if not exists pg_temp.bored_popularity_next
    (game text primary key, ranking bigint not null) on commit drop;
  truncate pg_temp.bored_popularity_next;
  insert into pg_temp.bored_popularity_next (game, ranking)
  with activity as (
    select p.game, p.visitor_id
    from public.play_events p
    where p.kind = 'start' and p.visitor_id is not null
      and p.received_at >= now() - interval '7 days'
      and not exists (select 1 from public.analytics_admins a where a.user_id = p.user_id)
      and not exists (select 1 from public.game_analytics_readers r where r.user_id = p.user_id and r.game = p.game)
    union all
    select 'f-14'::text, f.visitor_id
    from public.f14_flight_events f
    where f.kind = 'start' and f.visitor_id is not null
      and f.received_at >= now() - interval '7 days'
      and not exists (select 1 from public.analytics_admins a where a.user_id = f.user_id)
      and not exists (select 1 from public.game_analytics_readers r where r.user_id = f.user_id and r.game = 'f-14')
  ), counts as (
    select game, count(distinct visitor_id) players from activity group by game
  )
  select game, dense_rank() over (order by players desc) from counts;
  delete from public.bored_popularity_snapshot;
  insert into public.bored_popularity_snapshot(game,ranking,refreshed_at)
    select game,ranking,now() from pg_temp.bored_popularity_next;
end;
$function$;
revoke all on function public.refresh_bored_popularity_snapshot() from public, anon, authenticated;

-- Keep the exact RPC shape used by existing clients.
create or replace function public.bored_popular_games()
returns table(game text, ranking bigint)
language sql stable security definer set search_path = ''
as $function$
  select s.game, s.ranking from public.bored_popularity_snapshot s
  order by s.ranking, s.game;
$function$;
revoke all on function public.bored_popular_games() from public, anon, authenticated;
grant execute on function public.bored_popular_games() to anon, authenticated;

do $schedule$
begin
  if to_regclass('public.play_events') is not null
    and to_regclass('public.f14_flight_events') is not null
    and to_regclass('public.analytics_admins') is not null
    and to_regclass('public.game_analytics_readers') is not null then
    perform public.refresh_bored_popularity_snapshot();
    if exists (select 1 from pg_extension where extname='pg_cron') then
      perform cron.schedule('bored-popularity-daily','7 7 * * *','select public.refresh_bored_popularity_snapshot()');
    end if;
  end if;
end;
$schedule$;
