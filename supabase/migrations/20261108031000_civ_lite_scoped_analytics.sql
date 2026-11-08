-- Civ Lite ("ashcrown") analytics readers have no site-wide admin permissions.
-- Grant a reader with:
-- insert into public.game_analytics_readers(user_id,game)
-- select id,'ashcrown' from public.profiles where handle = '<exact Bored handle>';
create table if not exists public.game_analytics_readers (
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check (game = 'ashcrown'),
  granted_at timestamptz not null default now(),
  primary key (user_id, game)
);
alter table public.game_analytics_readers enable row level security;
revoke all on public.game_analytics_readers from public, anon, authenticated;

-- An authenticated user can only invoke this fixed-game, aggregated report if
-- an administrator has inserted their UUID into game_analytics_readers.
-- Do not grant raw access to play_events, product_events or analytics_admins.
create or replace function public.civ_lite_analytics_v1(
  p_from date, p_through date
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
  if viewer_id is null or not exists (
    select 1 from public.game_analytics_readers r
    where r.user_id = viewer_id and r.game = 'ashcrown'
  ) then
    raise exception 'Civ Lite analytics access required' using errcode = '42501';
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
    where e.game = 'ashcrown'
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
      bool_or(e.kind = 'daily_complete') as completed
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
    where e.game='ashcrown'
      and e.received_at >= start_at and e.received_at < end_at
      and not exists (select 1 from public.analytics_admins a where a.user_id=e.user_id)
      and not exists (select 1 from admin_browsers a where a.visitor_id=e.visitor_id)
    group by e.kind
  )
  select jsonb_build_object(
    'game','ashcrown','from',p_from,'through',p_through,
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

revoke all on function public.civ_lite_analytics_v1(date,date) from public,anon,authenticated;
grant execute on function public.civ_lite_analytics_v1(date,date) to authenticated;
