-- Aggregate Bored usage in Postgres so historical reports do not load every
-- 60-second checkpoint into the browser. Everything is read-only for clients.
-- 2026-11-03 was not a school day; extend this table as needed.
begin;

alter table public.product_events drop constraint if exists product_events_kind_check;
alter table public.product_events add constraint product_events_kind_check
  check (kind in (
    'visit','bt_view','bt_enroll','bt_challenge','bt_random','bt_open',
    'bt_move','bt_complete','bt_rematch','bt_delete','bt_leave',
    'card_impression','library_action','favorite_change','save_action',
    'announcement_impression','announcement_click','game_result',
    'game_friction','help_open','tutorial_step'
  ));
create index if not exists product_events_kind_time_idx
  on public.product_events(kind,received_at);

create table if not exists public.analytics_non_school_dates (
  day date primary key,
  label text not null check (char_length(label) between 1 and 100)
);
alter table public.analytics_non_school_dates enable row level security;
revoke all on public.analytics_non_school_dates from public,anon,authenticated;
insert into public.analytics_non_school_dates(day,label)
values ('2026-11-03','No school')
on conflict (day) do nothing;

create or replace function public.analytics_rollup_v1(
  p_from timestamptz, p_to timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
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
      select visitor_id from public.enjoyment_feedback where user_id in (select user_id from admin_ids)
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
      bool_or(kind='start') started,bool_or(kind='interaction') interacted,
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
      'interacted',count(*) filter(where interacted),
      'active_ms',coalesce(sum(active_ms),0),
      'visible_ms',coalesce(sum(visible_ms),0),
      'error_sessions',count(*) filter(where errors>0),
      'errors',coalesce(sum(errors),0),
      'browsers',count(distinct visitor_key),
      'accounts',count(distinct user_key)) from sessions),
    'games',coalesce((select jsonb_agg(to_jsonb(g) order by g.meaningful desc,g.launches desc) from (
      select game,count(*) filter(where started) launches,count(*) sessions,
        count(*) filter(where active_ms>=60000 or finished) meaningful,
        count(*) filter(where interacted) interacted,
        count(distinct visitor_key) browsers,count(distinct user_key) accounts,
        coalesce(sum(active_ms),0) active_ms,
        coalesce(sum(errors),0) errors,
        coalesce(round(percentile_cont(0.5) within group(order by active_ms))::bigint,0) median_active_ms
      from sessions group by game
    ) g),'[]'::jsonb),
    'days',coalesce((select jsonb_agg(to_jsonb(d) order by d.day) from (
      select (first_at at time zone 'America/Detroit')::date day,
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
      select kind,game,details->>'surface' surface,details->>'action' action,
        count(*) events,count(distinct visitor_id) browsers
      from clean_ui group by 1,2,3,4
    ) e),'[]'::jsonb),
    'site',(select jsonb_build_object(
      'visits',count(*) filter(where kind='visit'),
      'browsers',count(distinct visitor_id) filter(where kind='visit'),
      'signed_accounts',count(distinct user_id) filter(where kind='visit'))
      from clean_ui)
  ) into answer;
  return answer;
end;
$fn$;

revoke all on function public.analytics_rollup_v1(timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.analytics_rollup_v1(timestamptz,timestamptz) to authenticated;

create or replace function public.analytics_retention_cohorts_v1(
  p_from timestamptz, p_to timestamptz
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
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
      union all select visitor_id from public.enjoyment_feedback where user_id in(select user_id from admin_ids)
    ) x where visitor_id is not null
  ), all_visits as materialized (
    select distinct visitor_id,(received_at at time zone 'America/Detroit')::date visited
      from public.product_events where kind='visit' and visitor_id is not null
        and (user_id is null or user_id not in(select user_id from admin_ids))
        and visitor_id not in(select visitor_id from admin_browsers)
  ), first_visits as (
    select visitor_id,min(visited) first_day from all_visits group by visitor_id
  ), eligible as (
    select f.visitor_id,f.first_day,
      (select min((f.first_day + g.n)::date) from generate_series(1,14) g(n)
        where extract(isodow from (f.first_day + g.n)::date) <= 5
          and not exists (select 1 from public.analytics_non_school_dates h
            where h.day=(f.first_day + g.n)::date)) as next_school
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
$fn$;

revoke all on function public.analytics_retention_cohorts_v1(timestamptz,timestamptz)
  from public,anon,authenticated;
grant execute on function public.analytics_retention_cohorts_v1(timestamptz,timestamptz) to authenticated;

commit;
