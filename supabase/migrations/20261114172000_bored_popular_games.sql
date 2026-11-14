-- Anonymous-friendly popularity sorting. Reveal only game slugs and ranks;
-- never expose visitor IDs, session rows, precise counts or admin analytics.
-- Seven rolling days, one player/browser vote per game, regardless of launches.
-- Test/admin users are omitted even if historical events still exist.
create or replace function public.bored_popular_games()
returns table (game text, ranking bigint)
language sql stable security definer
set search_path = ''
as $function$
  with activity as (
    select p.game, count(distinct p.visitor_id) as players
    from public.play_events as p
    where p.kind = 'start'
      and p.visitor_id is not null
      and p.received_at >= now() - interval '7 days'
      and not exists (
        select 1 from public.analytics_admins as admin
        where admin.user_id = p.user_id
      )
      and not exists (
        select 1 from public.game_analytics_readers as reader
        where reader.user_id = p.user_id and reader.game = p.game
      )
    group by p.game
  )
  select a.game::text,
         dense_rank() over (order by a.players desc)::bigint as ranking
  from activity as a
  order by ranking, a.game;
$function$;

-- Public access is deliberate for this fixed, read-only aggregate RPC only.
-- EXECUTE is otherwise inherited by PUBLIC for new functions in Postgres.
revoke all on function public.bored_popular_games() from public, anon, authenticated;
grant execute on function public.bored_popular_games() to anon, authenticated;
comment on function public.bored_popular_games() is
  'Public seven-day game popularity rank by distinct browser visitor; no counts or identifiers.';
