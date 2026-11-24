-- Eliminate redundant telemetry. Historical hourly session aggregates retain time, not raw events.
-- Both clients now report cumulative playtime at session boundaries.
lock table public.play_events, public.product_events, public.f14_flight_events in share row exclusive mode;
alter table public.play_events drop constraint play_events_active_ms_check, drop constraint play_events_check, drop constraint play_events_kind_check;
alter table public.play_events add constraint play_events_active_ms_check check (active_ms between 0 and 86400000), add constraint play_events_check check (visible_ms between active_ms and 86400000), add constraint play_events_kind_check check (kind in ('start','end','daily_complete','error','summary','checkpoint','interaction'));
alter table public.f14_flight_events drop constraint f14_flight_events_active_ms_check, drop constraint f14_flight_events_visible_ms_check, drop constraint f14_flight_events_kind_check;
alter table public.f14_flight_events add constraint f14_flight_events_active_ms_check check (active_ms between 0 and 86400000), add constraint f14_flight_events_visible_ms_check check (visible_ms between 0 and 86400000), add constraint f14_flight_events_kind_check check (kind in ('start','end','summary','checkpoint','interaction'));
insert into public.play_events (id,session_id,user_id,visitor_id,game,kind,received_at,active_ms,visible_ms,details)
select gen_random_uuid(),session_id,user_id,visitor_id,game,'summary',max(received_at),sum(active_ms)::integer,sum(visible_ms)::integer,
 ((array_agg(details order by received_at desc,id desc))[1] - 'snapshot' - 'interacted')
 || jsonb_build_object('loaded',bool_or(coalesce(details->>'loaded','false')='true'),'round_finished',bool_or(coalesce(details->>'round_finished','false')='true'),
 'best_score',coalesce(max(case when details->>'best_score' ~ '^[0-9]{1,9}$' then (details->>'best_score')::integer end),0),
 'score',coalesce(max(case when details->>'score' ~ '^[0-9]{1,9}$' then (details->>'score')::integer end),0))
from public.play_events where kind in ('checkpoint','interaction')
group by session_id,user_id,visitor_id,game,date_trunc('hour',received_at);
delete from public.play_events where kind in ('checkpoint','interaction');
insert into public.f14_flight_events (id,session_id,user_id,visitor_id,kind,received_at,active_ms,visible_ms,details)
select gen_random_uuid(),session_id,user_id,visitor_id,'summary',max(received_at),sum(active_ms)::integer,sum(visible_ms)::integer,
 ((array_agg(details order by received_at desc,id desc))[1] - 'snapshot' - 'interacted')
 || jsonb_build_object('loaded',bool_or(coalesce(details->>'loaded','false')='true'),'round_finished',bool_or(coalesce(details->>'round_finished','false')='true'),
 'best_score',coalesce(max(case when details->>'best_score' ~ '^[0-9]{1,9}$' then (details->>'best_score')::integer end),0),
 'score',coalesce(max(case when details->>'score' ~ '^[0-9]{1,9}$' then (details->>'score')::integer end),0))
from public.f14_flight_events where kind in ('checkpoint','interaction')
group by session_id,user_id,visitor_id,date_trunc('hour',received_at);
delete from public.f14_flight_events where kind in ('checkpoint','interaction');
delete from public.product_events where kind in ('card_impression','visit','bt_open','bt_view');
alter table public.play_events drop constraint play_events_kind_check;
alter table public.play_events add constraint play_events_kind_check check (kind in ('start','end','daily_complete','error','summary'));
alter table public.f14_flight_events drop constraint f14_flight_events_kind_check;
alter table public.f14_flight_events add constraint f14_flight_events_kind_check check (kind in ('start','end','summary'));
alter table public.product_events drop constraint product_events_kind_check;
alter table public.product_events add constraint product_events_kind_check check (kind in ('bt_enroll','bt_challenge','bt_random','bt_move','bt_complete','bt_rematch','bt_delete','bt_leave','library_action','favorite_change','save_action','announcement_impression','announcement_click','game_result','game_friction','help_open','tutorial_step'));
-- Ignore obsolete rows from cached clients, without failing mixed batches or retained events.
create or replace function public.ignore_retired_telemetry() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.kind in ('checkpoint','interaction','card_impression','visit','bt_open','bt_view') then return null; end if;
  if new.kind = 'summary' and current_user in ('anon','authenticated','service_role') then return null; end if;
  return new;
end;
$$;
revoke execute on function public.ignore_retired_telemetry() from public;
create trigger ignore_retired_telemetry before insert on public.play_events for each row execute function public.ignore_retired_telemetry();
create trigger ignore_retired_telemetry before insert on public.product_events for each row execute function public.ignore_retired_telemetry();
create trigger ignore_retired_telemetry before insert on public.f14_flight_events for each row execute function public.ignore_retired_telemetry();
create or replace view public.analytics_session_rows as SELECT session_id,
    user_id,
    game,
    min(received_at) AS start_at,
    max(received_at) AS last_at,
    (COALESCE(sum(active_ms), (0)::bigint))::integer AS active_ms,
    (COALESCE(sum(visible_ms), (0)::bigint))::integer AS visible_ms,
    (count(*) FILTER (WHERE (kind = 'error'::text)))::integer AS errors,
    bool_or((kind = 'start'::text)) AS has_start,
    bool_or((kind = 'end'::text)) AS ended,
    bool_or((kind = 'daily_complete'::text)) AS completed,
    bool_or(((details ->> 'loaded'::text) = 'true'::text)) AS loaded,
    bool_or(((details ->> 'round_finished'::text) = 'true'::text)) AS finished,
    COALESCE(max(
        CASE
            WHEN ((details ->> 'best_score'::text) ~ '^[0-9]{1,9}$'::text) THEN ((details ->> 'best_score'::text))::integer
            ELSE NULL::integer
        END), 0) AS best_score,
    COALESCE(max(
        CASE
            WHEN ((details ->> 'score'::text) ~ '^[0-9]{1,9}$'::text) THEN ((details ->> 'score'::text))::integer
            ELSE NULL::integer
        END), 0) AS last_score,
    (array_agg((details ->> 'reason'::text) ORDER BY received_at DESC) FILTER (WHERE (kind = 'end'::text)))[1] AS end_reason,
    (array_agg((details ->> 'source'::text) ORDER BY received_at DESC))[1] AS source,
    (array_agg((details ->> 'device'::text) ORDER BY received_at DESC))[1] AS device,
    (COALESCE((array_agg((details ->> 'embedded'::text) ORDER BY received_at DESC))[1], 'false'::text) = 'true'::text) AS embedded,
    (COALESCE((array_agg((details ->> 'daily'::text) ORDER BY received_at DESC))[1], 'false'::text) = 'true'::text) AS daily
   FROM play_events e
  WHERE ((user_id IS NULL) OR (NOT (EXISTS ( SELECT 1
           FROM analytics_admins a
          WHERE (a.user_id = e.user_id)))))
  GROUP BY session_id, user_id, game;
CREATE OR REPLACE FUNCTION public.analytics_retention_cohorts_v1(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare answer jsonb;
begin
  if (select auth.uid()) is null or not (select public.is_analytics_admin()) then
    raise exception 'analytics admin required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to
     or p_to - p_from > interval '90 days' then
    raise exception 'invalid analytics date range' using errcode = '22023';
  end if;
  with admin_ids as (
    select user_id from public.analytics_admins
  ), admin_browsers as (
    select distinct visitor_id from (
      select visitor_id from public.play_events where user_id in(select user_id from admin_ids)
      union all select visitor_id from public.product_events where user_id in(select user_id from admin_ids)
      union all select visitor_id from public.f14_flight_events where user_id in(select user_id from admin_ids)
      union all select visitor_id from public.feedback_entries where user_id in(select user_id from admin_ids)
    ) x where visitor_id is not null
  ), all_visits as materialized (
    select distinct visitor_id,(received_at at time zone 'America/Detroit')::date visited
      from (select visitor_id,user_id,received_at from public.play_events where kind='start' union all select visitor_id,user_id,received_at from public.f14_flight_events where kind='start') game_starts where visitor_id is not null
        and (user_id is null or user_id not in(select user_id from admin_ids))
        and visitor_id not in(select visitor_id from admin_browsers)
  ), first_visits as (
    select visitor_id,min(visited) first_day from all_visits group by visitor_id
  ), eligible as (
    select f.visitor_id,f.first_day,
      (select min((f.first_day + g.n)::date) from generate_series(1,14) g(n)
        where extract(isodow from (f.first_day + g.n)::date) <= 5
          and not exists (select 1 from public.analytics_non_school_dates h
            where h.calendar_date=(f.first_day + g.n)::date)) as next_school
      from first_visits f
    where f.first_day >= (p_from at time zone 'America/Detroit')::date
      and f.first_day < (p_to at time zone 'America/Detroit')::date
  ), rows as (
    select e.first_day,e.next_school,
      exists(select 1 from all_visits v where v.visitor_id=e.visitor_id and v.visited=e.first_day+1) d1,
      exists(select 1 from all_visits v where v.visitor_id=e.visitor_id and v.visited=e.first_day+7) d7,
      exists(select 1 from all_visits v where v.visitor_id=e.visitor_id and v.visited=e.next_school) school
      from eligible e
  )
  select coalesce(jsonb_agg(to_jsonb(c) order by c.first_day),'[]'::jsonb) into answer
  from (
    select first_day,next_school,count(*) cohort,
      case when first_day+1 <= (now() at time zone 'America/Detroit')::date
        then count(*) filter(where d1) else null end d1_returned,
      case when first_day+7 <= (now() at time zone 'America/Detroit')::date
        then count(*) filter(where d7) else null end d7_returned,
      case when next_school <= (now() at time zone 'America/Detroit')::date
        then count(*) filter(where school) else null end school_returned
    from rows group by first_day,next_school
  ) c;
  return answer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.analytics_rollup_v1(p_from timestamp with time zone, p_to timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare answer jsonb;
begin
  if (select auth.uid()) is null or not (select public.is_analytics_admin()) then
    raise exception 'analytics admin required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to
     or p_to - p_from > interval '90 days' then
    raise exception 'invalid analytics date range' using errcode = '22023';
  end if;

  with admin_ids as materialized (
    select user_id from public.analytics_admins
  ), admin_browsers as materialized (
    select distinct visitor_id from (
      select visitor_id from public.play_events where user_id in (select user_id from admin_ids)
      union all
      select visitor_id from public.f14_flight_events where user_id in (select user_id from admin_ids)
      union all
      select visitor_id from public.product_events where user_id in (select user_id from admin_ids)
      union all
      select visitor_id from public.feedback_entries where user_id in (select user_id from admin_ids)
    ) b where visitor_id is not null
  ), raw_events as (
    select session_id,user_id,visitor_id,game,kind,received_at,active_ms,visible_ms,details
      from public.play_events where received_at >= p_from and received_at < p_to
    union all
    select session_id,user_id,visitor_id,'f-14'::text as game,kind,received_at,active_ms,visible_ms,details
      from public.f14_flight_events where received_at >= p_from and received_at < p_to
  ), clean as materialized (
    select e.* from raw_events e
    where (e.user_id is null or e.user_id not in(select user_id from admin_ids))
      and (e.visitor_id is null or e.visitor_id not in(select visitor_id from admin_browsers))
  ), sessions as materialized (
    select session_id,game,min(received_at) first_at,
      max(user_id::text) user_key,max(visitor_id::text) visitor_key,
      sum(active_ms)::bigint active_ms,sum(visible_ms)::bigint visible_ms,
      bool_or(kind='start') started,
      bool_or(kind='daily_complete' or details->>'round_finished'='true') finished,
      count(*) filter(where kind='error')::int errors,
      max(details->>'source') as source,
      max(details->>'device') as device,
      bool_or(details->>'embedded'='true') as embedded
    from clean group by session_id,game
  ), clean_ui as materialized (
    select p.kind,p.game,p.details,p.visitor_id,p.user_id
    from public.product_events p
    where p.received_at >= p_from and p.received_at < p_to
      and (p.user_id is null or p.user_id not in(select user_id from admin_ids))
      and (p.visitor_id is null or p.visitor_id not in(select visitor_id from admin_browsers))
  )
  select jsonb_build_object(
    'totals',(select jsonb_build_object(
      'events',(select count(*) from clean),
      'sessions',count(*),
      'launches',count(*) filter(where started),
      'meaningful',count(*) filter(where active_ms>=60000 or finished),
      'active_ms',coalesce(sum(active_ms),0),
      'visible_ms',coalesce(sum(visible_ms),0),
      'error_sessions',count(*) filter(where errors>0),
      'errors',coalesce(sum(errors),0),
      'browsers',count(distinct visitor_key),
      'accounts',count(distinct user_key)) from sessions),
    'games',coalesce((select jsonb_agg(to_jsonb(g) order by g.meaningful desc,g.launches desc) from (
      select game,count(*) filter(where started) launches,count(*) sessions,
        count(*) filter(where active_ms>=60000 or finished) meaningful,
        count(distinct visitor_key) browsers,count(distinct user_key) accounts,
        coalesce(sum(active_ms),0) active_ms,
        coalesce(sum(errors),0) errors,
        coalesce(round(percentile_cont(0.5) within group(order by active_ms))::bigint,0) median_active_ms
      from sessions group by game
    ) g),'[]'::jsonb),
    'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.activity_date) from (
      select (first_at at time zone 'America/Detroit')::date AS activity_date,
        count(*) filter(where started) launches,count(*) filter(where active_ms>=60000 or finished) meaningful,
        coalesce(sum(active_ms),0) active_ms,
        count(distinct visitor_key) browsers
      from sessions group by 1
    ) d),'[]'::jsonb),
    'sources',coalesce((select jsonb_agg(to_jsonb(s) order by s.launches desc) from (
      select coalesce(source,'unknown') source,count(*) filter(where started) launches,
        count(*) filter(where active_ms>=60000 or finished) meaningful,
        coalesce(sum(active_ms),0) active_ms
      from sessions group by 1
    ) s),'[]'::jsonb),
    'ui_events',coalesce((select jsonb_agg(to_jsonb(e) order by e.events desc) from (
      select kind,game,details->>'surface' surface,details->>'action' AS action_name,
        count(*) events,count(distinct visitor_id) browsers
      from clean_ui group by 1,2,3,4
    ) e),'[]'::jsonb)
  ) into answer;
  return answer;
end;
$function$;

CREATE OR REPLACE FUNCTION public.game_analytics_v1(p_game text, p_from date, p_through date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
        or e.details @> '{"round_finished": true}'::jsonb) as completed
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

