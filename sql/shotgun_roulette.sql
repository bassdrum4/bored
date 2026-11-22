-- Shotgun Roulette scores (Pokémon Gambling).
-- Not applied yet: run this in the Supabase SQL editor.
-- Clients can still never insert or change rows directly. The only way in is
-- submit_shotgun_roulette below, which re-checks every number on the server.
--
-- One row per finished run: its net chips, a loss as -bet. The leaderboard
-- ranks the sum per mode, and the daily cap counts it, so both are net profit.

create table if not exists public.shotgun_roulette_scores (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  mode        text not null check (mode in ('normal', 'hard')),
  coins_won   integer not null default 0 check (coins_won >= -500),
  best_streak integer not null default 0 check (best_streak >= 0),
  created_at  timestamptz not null default now()
);

-- Tables made before losses were posted only allowed coins_won >= 0.
do $$
declare c text;
begin
  for c in select conname from pg_constraint
     where conrelid = 'public.shotgun_roulette_scores'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%coins_won%' loop
    execute format('alter table public.shotgun_roulette_scores drop constraint %I', c);
  end loop;
  alter table public.shotgun_roulette_scores add constraint shotgun_roulette_scores_coins_won_check check (coins_won >= -500);
end $$;

create index if not exists shotgun_roulette_scores_mode_coins_idx
  on public.shotgun_roulette_scores (mode, coins_won desc, created_at);

create index if not exists shotgun_roulette_scores_user_idx
  on public.shotgun_roulette_scores (user_id);

alter table public.shotgun_roulette_scores enable row level security;

-- Anyone may read the board.
drop policy if exists "shotgun roulette scores are public" on public.shotgun_roulette_scores;
create policy "shotgun roulette scores are public"
  on public.shotgun_roulette_scores for select
  to anon, authenticated
  using (true);

-- Placeholder only. The game has no validated, authoritative scoring yet.
-- Do not accept arbitrary client-submitted coin totals/streaks in production.
drop policy if exists "players insert their own shotgun roulette scores"
  on public.shotgun_roulette_scores;

-- Existing Supabase projects may give new public tables broad default grants.
-- Remove them explicitly, then allow only read access for the empty leaderboard.
revoke all on public.shotgun_roulette_scores from anon, authenticated;
grant select on public.shotgun_roulette_scores to anon, authenticated;

-- Server-checked submissions. The game itself runs in the player's browser, so
-- the server cannot replay it. What it can do is refuse anything a real game
-- cannot produce: a win nets at most 400 chips on Normal (500 x 1.8 - 500)
-- and 1,000 on Hard (500 x 3 - 500), a loss at most -500 (the largest bet),
-- the day's net stays under the 3,000-chip cap, a streak grows by at most one
-- game per row, and a player posts at most 200 games a day.
create or replace function public.submit_shotgun_roulette(p_mode text, p_coins_won integer, p_best_streak integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  day_start timestamptz := date_trunc('day', now() at time zone 'America/Detroit') at time zone 'America/Detroit';
  day_total integer;
  day_rows integer;
  mode_rows integer;
  -- The most one game can win: 500 x 1.8 - 500 on Normal, 500 x 3 - 500 on Hard.
  most_won integer := case p_mode when 'hard' then 1000 else 400 end;
begin
  if uid is null then raise exception 'sign in to post a score'; end if;
  if p_mode is null or p_mode not in ('normal', 'hard') then raise exception 'unknown mode'; end if;
  if p_coins_won is null or p_coins_won < -500 or p_coins_won > most_won then
    raise exception 'coins_won is out of range';
  end if;
  if p_best_streak is null or p_best_streak < 0 then raise exception 'best_streak is out of range'; end if;

  -- One player's rows at a time, so two tabs cannot both slip under the cap.
  perform pg_advisory_xact_lock(hashtext('shotgun_roulette:' || uid::text));

  select coalesce(sum(coins_won), 0), count(*) into day_total, day_rows
    from shotgun_roulette_scores where user_id = uid and created_at >= day_start;
  if day_rows >= 200 then raise exception 'too many games today'; end if;
  -- Net: losses earlier in the day make room, as they do in the wallet.
  if p_coins_won > 0 and day_total + p_coins_won > 3000 then raise exception 'over the daily win cap'; end if;

  select count(*) into mode_rows from shotgun_roulette_scores where user_id = uid and mode = p_mode;
  if p_best_streak > mode_rows + 1 then raise exception 'best_streak is out of range'; end if;

  insert into shotgun_roulette_scores (user_id, mode, coins_won, best_streak)
  values (uid, p_mode, p_coins_won, p_best_streak);
end;
$function$;

revoke all on function public.submit_shotgun_roulette(text, integer, integer) from public, anon;
grant execute on function public.submit_shotgun_roulette(text, integer, integer) to authenticated;

-- The board: top 10 players in a mode by net chips won, with their display name.
create or replace function public.shotgun_roulette_top(p_mode text)
returns table (handle text, coins_won bigint, best_streak integer, games bigint)
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(p.handle, 'unnamed'), sum(s.coins_won), max(s.best_streak), count(*)
    from shotgun_roulette_scores s
    left join profiles p on p.id = s.user_id
   where s.mode = p_mode
   group by s.user_id, p.handle
   order by 2 desc, 3 desc, 4 asc
   limit 10;
$function$;

revoke all on function public.shotgun_roulette_top(text) from public;
grant execute on function public.shotgun_roulette_top(text) to anon, authenticated;
