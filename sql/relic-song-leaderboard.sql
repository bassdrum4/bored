-- Relic Song's leaderboard (Meloetta's rhythm game).
-- Not applied yet: run this once in the Supabase SQL editor. It is safe to run
-- again. Until it is, the game, src/hub/relic-song.js and the board each log
-- one console line and carry on: no song, payout or page waits on it.
--
-- What it sets up:
--   relic_song_scores    one row per player, song and difficulty: the best score there
--   relic_song_players   one row per player: gym badges held, 0-4
--   submit_relic_song    the only way in; keeps the higher score and the higher badge count
--   relic_song_top       the game's own board: total (sum of bests), songs, badges
--   relic_song_badges    badges for the names the main board is showing
--   score_rules          the 'relic-song' row, so the main board takes the total
--
-- The main board ranks the same total through the shared scores table, posted by
-- the hub's recordBest like every other game (src/hub/scores.js, metric total).
-- A total is one best per song and difficulty, so replaying a song never stacks.
-- Test mode never posts to either.

create table if not exists public.relic_song_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  song       text not null check (song ~ '^[a-z0-9-]{1,32}$'),
  diff       text not null check (diff in ('ez', 'hd', 'in', 'at')),
  -- 1,000,000 is a full Perfect run; a buddy with the type edge adds 3%.
  score      integer not null check (score between 0 and 1030000),
  updated_at timestamptz not null default now(),
  primary key (user_id, song, diff)
);

create table if not exists public.relic_song_players (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  badges     smallint not null default 0 check (badges between 0 and 4),
  updated_at timestamptz not null default now()
);

alter table public.relic_song_scores enable row level security;
alter table public.relic_song_players enable row level security;

drop policy if exists "relic song scores are public" on public.relic_song_scores;
create policy "relic song scores are public" on public.relic_song_scores for select to anon, authenticated using (true);
drop policy if exists "relic song players are public" on public.relic_song_players;
create policy "relic song players are public" on public.relic_song_players for select to anon, authenticated using (true);

revoke all on public.relic_song_scores, public.relic_song_players from anon, authenticated;
grant select on public.relic_song_scores, public.relic_song_players to anon, authenticated;

-- A song's best, and the badge count: each kept only when the new one is higher.
-- At most 64 song and difficulty rows per player (16 songs x 4 tiers), so a
-- client cannot invent an endless list of song ids to pad the total.
drop function if exists public.submit_relic_song(text, text, integer);
create or replace function public.submit_relic_song(p_song text, p_diff text, p_score integer, p_badges integer default null)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  rows_now integer;
begin
  if uid is null then raise exception 'sign in to post a score'; end if;
  if p_song is null or p_song !~ '^[a-z0-9-]{1,32}$' then raise exception 'unknown song'; end if;
  if p_diff is null or p_diff not in ('ez', 'hd', 'in', 'at') then raise exception 'unknown difficulty'; end if;
  if p_score is null or p_score < 0 or p_score > 1030000 then raise exception 'score is out of range'; end if;
  if p_badges is not null and (p_badges < 0 or p_badges > 4) then raise exception 'badges is out of range'; end if;

  perform pg_advisory_xact_lock(hashtext('relic_song:' || uid::text));
  select count(*) into rows_now from relic_song_scores where user_id = uid;
  if rows_now >= 64 and not exists (select 1 from relic_song_scores where user_id = uid and song = p_song and diff = p_diff) then
    raise exception 'too many songs';
  end if;

  insert into relic_song_scores (user_id, song, diff, score)
  values (uid, p_song, p_diff, p_score)
  on conflict (user_id, song, diff) do update
    set score = excluded.score, updated_at = now()
    where relic_song_scores.score < excluded.score;

  if p_badges is not null then
    insert into relic_song_players (user_id, badges) values (uid, p_badges)
    on conflict (user_id) do update
      set badges = excluded.badges, updated_at = now()
      where relic_song_players.badges < excluded.badges;
  end if;
end;
$function$;

revoke all on function public.submit_relic_song(text, text, integer, integer) from public, anon;
grant execute on function public.submit_relic_song(text, text, integer, integer) to authenticated;

-- The game's own board: top 10 by the sum of best scores, with the display name and badges.
drop function if exists public.relic_song_top();
create or replace function public.relic_song_top()
returns table (handle text, total bigint, songs bigint, badges smallint)
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(p.handle, 'unnamed'), sum(s.score), count(*), coalesce(max(r.badges), 0)::smallint
    from relic_song_scores s
    left join profiles p on p.id = s.user_id
    left join relic_song_players r on r.user_id = s.user_id
   group by s.user_id, p.handle
   order by 2 desc, 3 asc
   limit 10;
$function$;

revoke all on function public.relic_song_top() from public;
grant execute on function public.relic_song_top() to anon, authenticated;

-- Badges for the names on the main board (up to 50 at a time, matched without case).
create or replace function public.relic_song_badges(p_handles text[])
returns table (handle text, badges smallint)
language sql
stable
security definer
set search_path = public
as $function$
  select p.handle, r.badges
    from relic_song_players r
    join profiles p on p.id = r.user_id
   where lower(p.handle) = any (select lower(h) from unnest(p_handles[1:50]) as h);
$function$;

revoke all on function public.relic_song_badges(text[]) from public;
grant execute on function public.relic_song_badges(text[]) to anon, authenticated;

-- The main board's rule (src/games/score-rules.json): scores.game is a foreign
-- key to score_rules.game, so Relic Song's total posts only once this row exists.
insert into public.score_rules (game, label, better, max_value)
values ('relic-song', 'Sum of best scores across every song', 'high', 20000000)
on conflict (game) do update set label = excluded.label, better = excluded.better, max_value = excluded.max_value;
