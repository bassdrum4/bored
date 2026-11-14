-- Public popularity sorting. No raw analytics or identities are exposed.
-- The multiplayer fixture replays every migration without analytics tables,
-- so skip the RPC until the tables it aggregates actually exist.
do $migration$
begin
  if to_regclass('public.play_events') is null
     or to_regclass('public.analytics_admins') is null
     or to_regclass('public.game_analytics_readers') is null then
    return;
  end if;

  execute $definition$
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
  $definition$;

  -- Public EXECUTE must be explicitly removed before a narrow grant.
  execute $revoke$revoke all on function public.bored_popular_games() from public, anon, authenticated$revoke$;
  execute $grant$grant execute on function public.bored_popular_games() to anon, authenticated$grant$;
  execute $comment$comment on function public.bored_popular_games() is
    'Public seven-day game popularity rank by distinct browser visitor; no counts or identifiers.'$comment$;
end
$migration$;
