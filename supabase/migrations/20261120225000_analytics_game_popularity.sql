-- Separate ordinary game demand from repeated Bored Together iframe opens.
-- Match creation and turn counts come from authoritative Bored Together tables.
-- Do not expose private match or player records to the client.
create or replace function public.analytics_game_popularity_v1(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare result_rows jsonb;
begin
  if (select auth.uid()) is null or not (select public.is_analytics_admin()) then
    raise exception 'Analytics admin access required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to-p_from > interval '90 days' then
    raise exception 'Invalid reporting range' using errcode = '22023';
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
  ), starts as materialized (
    select game,session_id,visitor_id,coalesce(details->>'source','unknown') as source
    from public.play_events
    where kind='start' and received_at >= p_from and received_at < p_to
      and (user_id is null or user_id not in (select user_id from admin_ids))
      and (visitor_id is null or visitor_id not in (select visitor_id from admin_browsers))
    union all
    select 'f-14'::text as game,session_id,visitor_id,coalesce(details->>'source','unknown') as source
    from public.f14_flight_events
    where kind='start' and received_at >= p_from and received_at < p_to
      and (user_id is null or user_id not in (select user_id from admin_ids))
      and (visitor_id is null or visitor_id not in (select visitor_id from admin_browsers))
  ), launches as (
    select game,
      count(distinct session_id) filter(where source <> 'together') as standalone_launches,
      count(distinct visitor_id) filter(where source <> 'together') as standalone_browsers,
      count(distinct session_id) filter(where source = 'together') as together_opens
    from starts group by game
  ), organic_matches as materialized (
    select m.id,m.game,m.created_at
    from bored_together.matches m
    where not exists(select 1 from admin_ids a where a.user_id in (m.p1,m.p2))
  ), matches as (
    select game,count(*) as matches_started from organic_matches
    where created_at >= p_from and created_at < p_to
    group by game
  ), turns as (
    select m.game,count(*) as turns_played
    from bored_together.moves v
    join organic_matches m on m.id=v.match_id
    where v.created_at >= p_from and v.created_at < p_to
    group by m.game
  ), game_ids as (
    select game from launches
    union select game from matches
    union select game from turns
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'game', g.game,
    'standalone_launches', coalesce(l.standalone_launches,0),
    'standalone_browsers', coalesce(l.standalone_browsers,0),
    'together_opens', coalesce(l.together_opens,0),
    'matches_started', coalesce(m.matches_started,0),
    'turns_played', coalesce(t.turns_played,0)
  ) order by l.standalone_launches desc nulls last, m.matches_started desc nulls last,
            l.together_opens desc nulls last,g.game), '[]'::jsonb) into result_rows
  from game_ids g
  left join launches l using(game)
  left join matches m using(game)
  left join turns t using(game);

  return jsonb_build_object('games',result_rows);
end;
$$;
revoke all on function public.analytics_game_popularity_v1(timestamptz,timestamptz) from public,anon;
grant execute on function public.analytics_game_popularity_v1(timestamptz,timestamptz) to authenticated;
notify pgrst, 'reload schema';
