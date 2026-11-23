-- Shotgun Roulette multiplayer, on Bored Together's live rooms (bored_live): the same rooms,
-- codes, lobby, ready check and action log that Civ Lite's online games use.
-- Not applied yet: run this in the Supabase SQL editor. Safe to run more than once.
--
-- Nothing else changes for Civ Lite. A Shotgun Roulette room is created by the game with
-- { unjoined: 'drop', cpus: 0, mode: 'ffa' }, so `start` seats only the players who joined
-- (two to four; the room's start already refuses fewer than two) and adds no CPUs.

-- 1. A live room may be a Shotgun Roulette room.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'bored_live.games'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) like '%game%ashcrown%' loop
    execute format('alter table bored_live.games drop constraint %I', c.conname);
  end loop;
end $$;
alter table bored_live.games add constraint games_game_check check (game in ('ashcrown', 'shotgun-roulette'));

-- 2. bored_live.api's `create` accepts it. The function is patched in place, the way the
--    room-code migration did it, so none of its other rules are copied (or drift).
do $$
declare
  body text;
  before text;
begin
  body := pg_get_functiondef('bored_live.api(text,jsonb)'::regprocedure);
  if position($q$not in ('ashcrown','shotgun-roulette')$q$ in body) > 0 then
    raise notice 'bored_live.api already accepts Shotgun Roulette.';
    return;
  end if;
  before := body;
  body := replace(body,
    $q$if coalesce(args->>'game','')<>'ashcrown' then raise exception 'Unknown game.'; end if;$q$,
    $q$if coalesce(args->>'game','') not in ('ashcrown','shotgun-roulette') then raise exception 'Unknown game.'; end if;$q$);
  body := replace(body,
    $q$values('ashcrown',u,cfg,cap)$q$,
    $q$values(args->>'game',u,cfg,cap)$q$);
  if body = before or position($q$values(args->>'game',u,cfg,cap)$q$ in body) = 0 then
    raise exception 'bored_live.api did not look as expected; check the live migrations before running this.';
  end if;
  execute body;
end $$;

-- 3. The Multiplayer leaderboard: total game wins, and games played, per player. Read straight
--    from finished rooms (status 'completed', a winner the players' screens agreed on), and only
--    rooms that started with two or more human players. No tokens, nothing written by clients.
create or replace function public.shotgun_roulette_mp_top()
returns table (handle text, wins bigint, games bigint)
language sql
stable
security definer
set search_path = ''
as $function$
  with done as (
    select g.winner, g.start->'seats' as seats
      from bored_live.games g
     where g.game = 'shotgun-roulette' and g.status = 'completed' and g.winner is not null
       and (select count(*) from jsonb_array_elements(g.start->'seats') e where e->>'kind' = 'human') >= 2
  ), played as (
    select (e->>'user')::uuid as user_id, (e->>'seat')::integer = d.winner as won
      from done d, jsonb_array_elements(d.seats) e
     where e->>'kind' = 'human'
  )
  select coalesce(p.handle, 'unnamed'), count(*) filter (where x.won), count(*)
    from played x
    left join public.profiles p on p.id = x.user_id
   group by x.user_id, p.handle
   order by 2 desc, 3 asc, 1
   limit 10;
$function$;

revoke all on function public.shotgun_roulette_mp_top() from public;
grant execute on function public.shotgun_roulette_mp_top() to anon, authenticated;

notify pgrst, 'reload schema';
