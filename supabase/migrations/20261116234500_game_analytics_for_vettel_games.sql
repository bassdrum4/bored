-- Vettel's games: one scoped analytics reader can cover several of the games
-- his auto-merge reviews (Civ Lite, Pokédoku, Poké Idle, Poké Gacha). A reader
-- still sees only the games granted in public.game_analytics_readers; this is
-- not site-wide admin access, and their own play in those games stays out of
-- the reports and the public popularity ranking.
begin;

-- 1. The entitlement table now accepts each of his games, not only Civ Lite.
alter table public.game_analytics_readers drop constraint if exists game_analytics_readers_game_check;
alter table public.game_analytics_readers add constraint game_analytics_readers_game_check
  check (game in ('ashcrown','pokedoku','poke-idle','poke-gacha'));

-- 2. Grant the three arrivals to the account that already reads Civ Lite.
-- Keyed by handle so the grant is a no-op on any database without that account.
insert into public.game_analytics_readers(user_id, game)
select p.id, g.game
from public.profiles p
cross join (values ('ashcrown'),('pokedoku'),('poke-idle'),('poke-gacha')) as g(game)
where p.handle = 'PenguinV360'
on conflict (user_id, game) do nothing;

-- 3. Aggregated, read-only report for one granted game. Same shape as the Civ
-- Lite report, parameterized by game, with completions counting either a daily
-- completion or a checkpoint that says a round finished.
create or replace function public.game_analytics_v1(
  p_game text, p_from date, p_through date
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $function$
declare
  viewer_id uuid := (select auth.uid());
  start_at timestamptz;
  end_at timestamptz;
  report jsonb;
begin
  if p_game is null or not exists (
    select 1 from public.game_analytics_readers r
    where r.user_id = viewer_id and r.game = p_game
  ) then
    raise exception 'Game analytics access required' using errcode = '42501';
  end if;

  if p_from is null or p_through is null
     or p_from > p_through
     or p_through - p_from > 89 then
    raise exception 'Choose an inclusive date range of 1 to 90 days'
      using errcode = '22023';
  end if;
  start_at := p_from::timestamp at time zone 'America/Detroit';
  end_at := (p_through + 1)::timestamp at time zone 'America/Detroit';

  with admin_browsers as materialized (
    select distinct e.visitor_id
    from public.play_events e
    join public.analytics_admins a on a.user_id = e.user_id
    where e.visitor_id is not null
  ), filtered as materialized (
    select e.*
    from public.play_events e
    where e.game = p_game
      and e.received_at >= start_at and e.received_at < end_at
      and not exists (
        select 1 from public.analytics_admins a where a.user_id = e.user_id
      )
      and not exists (
        select 1 from admin_browsers a where a.visitor_id = e.visitor_id
      )
  ), sessions as materialized (
    select e.session_id, e.user_id,
      coalesce('u:' || e.user_id::text, 'v:' || max(e.visitor_id::text), 's:' || e.session_id::text) as identity_key,
      min(e.received_at) as first_at,
      sum(e.active_ms) as active_ms,
      sum(e.visible_ms) as visible_ms,
      count(*) filter (where e.kind = 'error') as errors,
      bool_or(e.kind = 'end') as ended,
      bool_or(e.kind = 'daily_complete'
        or (e.kind = 'checkpoint' and e.details @> '{"round_finished": true}'::jsonb)) as completed
    from filtered e group by e.session_id, e.user_id
  ), daily as (
    select (first_at at time zone 'America/Detroit')::date as day,
      count(*) as sessions,
      count(distinct identity_key) as players,
      coalesce(sum(active_ms),0) as active_ms,
      coalesce(sum(errors),0) as errors
    from sessions group by 1
  ), sources as (
    select coalesce(nullif(left(e.details->>'source',60),''),'Unknown') as label,
      count(*) as launches
    from filtered e where e.kind='start' group by 1
  ), actions as (
    select e.kind as label, count(*) as events
    from filtered e group by e.kind
  ), discovery as (
    select e.kind as label, count(*) as events
    from public.product_events e
    where e.game = p_game
      and e.received_at >= start_at and e.received_at < end_at
      and not exists (select 1 from public.analytics_admins a where a.user_id=e.user_id)
      and not exists (select 1 from admin_browsers a where a.visitor_id=e.visitor_id)
    group by e.kind
  )
  select jsonb_build_object(
    'game',p_game,'from',p_from,'through',p_through,
    'totals',jsonb_build_object(
      'sessions',(select count(*) from sessions),
      'estimatedPlayers',(select count(distinct identity_key) from sessions),
      'signedInAccounts',(select count(distinct user_id) from sessions),
      'guestSessions',(select count(*) from sessions where user_id is null),
      'activeMs',(select coalesce(sum(active_ms),0) from sessions),
      'visibleMs',(select coalesce(sum(visible_ms),0) from sessions),
      'engagedSessions',(select count(*) from sessions where active_ms >= 60000 or completed),
      'completedSessions',(select count(*) from sessions where completed),
      'endedSessions',(select count(*) from sessions where ended),
      'errors',(select coalesce(sum(errors),0) from sessions)
    ),
    'daily',(select coalesce(jsonb_agg(jsonb_build_object(
       'date',day,'sessions',sessions,'players',players,'activeMs',active_ms,'errors',errors
    ) order by day),'[]'::jsonb) from daily),
    'sources',(select coalesce(jsonb_agg(jsonb_build_object(
       'label',label,'count',launches
    ) order by launches desc),'[]'::jsonb) from sources),
    'actions',(select coalesce(jsonb_agg(jsonb_build_object(
       'label',label,'count',events
    ) order by events desc),'[]'::jsonb) from actions),
    'discovery',(select coalesce(jsonb_agg(jsonb_build_object(
       'label',label,'count',events
    ) order by events desc),'[]'::jsonb) from discovery)
  ) into report;
  return report;
end;
$function$;

revoke all on function public.game_analytics_v1(text,date,date) from public,anon,authenticated;
grant execute on function public.game_analytics_v1(text,date,date) to authenticated;
comment on function public.game_analytics_v1(text,date,date) is
  'Aggregated read-only activity for one game the caller is an analytics reader for.';

-- 4. A reader's own events in any game they can read never enter the reports,
-- replacing the Civ Lite-only exclusion. Optional tables are skipped in the
-- isolated multiplayer fixture, which has no analytics tables.
do $migration$
begin
  if to_regclass('public.play_events') is not null then
    execute 'drop policy if exists exclude_civ_reader_play_insert on public.play_events';
    execute 'drop policy if exists exclude_game_reader_play_insert on public.play_events';
    execute $ddl$
      create policy exclude_game_reader_play_insert
        on public.play_events as restrictive for insert to authenticated
        with check (
          not exists (
            select 1 from public.game_analytics_readers r
            where r.user_id = (select auth.uid()) and r.game = play_events.game
          )
        )
    $ddl$;
  end if;

  if to_regclass('public.product_events') is not null then
    execute 'drop policy if exists exclude_civ_reader_product_insert on public.product_events';
    execute 'drop policy if exists exclude_game_reader_product_insert on public.product_events';
    execute $ddl$
      create policy exclude_game_reader_product_insert
        on public.product_events as restrictive for insert to authenticated
        with check (
          not exists (
            select 1 from public.game_analytics_readers r
            where r.user_id = (select auth.uid()) and r.game = product_events.game
          )
        )
    $ddl$;
  end if;

  if to_regclass('public.enjoyment_feedback') is not null then
    execute 'drop policy if exists exclude_civ_reader_survey_insert on public.enjoyment_feedback';
    execute 'drop policy if exists exclude_game_reader_survey_insert on public.enjoyment_feedback';
    execute $ddl$
      create policy exclude_game_reader_survey_insert
        on public.enjoyment_feedback as restrictive for insert to authenticated
        with check (
          not exists (
            select 1 from public.game_analytics_readers r
            where r.user_id = (select auth.uid())
              and (enjoyment_feedback.game is null or r.game = enjoyment_feedback.game)
          )
        )
    $ddl$;
  end if;
end
$migration$;

notify pgrst,'reload schema';
commit;
