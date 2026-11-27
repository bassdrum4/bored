-- Relic Song scores (Meloetta's rhythm game).
-- Not applied yet: run this in the Supabase SQL editor. Until it is, the game
-- and src/hub/relic-song.js log one console line and carry on without a board.
--
-- One row per player, song and difficulty: the best score ever posted there.
-- The board ranks each player's total, the sum of those bests, which is also
-- what the arcade's shared board ranks (score_rules 'relic-song' below).
-- Clients never write rows directly; submit_relic_song keeps the higher score.

create table if not exists public.relic_song_scores (
  user_id    uuid not null references auth.users (id) on delete cascade,
  song       text not null check (song ~ '^[a-z0-9-]{1,32}$'),
  diff       text not null check (diff in ('ez', 'hd', 'in', 'at')),
  -- 1,000,000 is a full Perfect run; a buddy with the type edge adds 3%.
  score      integer not null check (score between 0 and 1030000),
  updated_at timestamptz not null default now(),
  primary key (user_id, song, diff)
);

alter table public.relic_song_scores enable row level security;

drop policy if exists "relic song scores are public" on public.relic_song_scores;
create policy "relic song scores are public"
  on public.relic_song_scores for select
  to anon, authenticated
  using (true);

revoke all on public.relic_song_scores from anon, authenticated;
grant select on public.relic_song_scores to anon, authenticated;

-- A song's best: kept only when it beats what is stored. At most 64 song and
-- difficulty rows per player (16 songs x 4 tiers), so a client cannot invent
-- an endless list of song ids to pad the total.
create or replace function public.submit_relic_song(p_song text, p_diff text, p_score integer)
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
end;
$function$;

revoke all on function public.submit_relic_song(text, text, integer) from public, anon;
grant execute on function public.submit_relic_song(text, text, integer) to authenticated;

-- The board: top 10 by the sum of best scores, with the display name.
create or replace function public.relic_song_top()
returns table (handle text, total bigint, songs bigint)
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(p.handle, 'unnamed'), sum(s.score), count(*)
    from relic_song_scores s
    left join profiles p on p.id = s.user_id
   group by s.user_id, p.handle
   order by 2 desc, 3 asc
   limit 10;
$function$;

revoke all on function public.relic_song_top() from public;
grant execute on function public.relic_song_top() to anon, authenticated;

-- The arcade's shared board (src/games/score-rules.json): scores.game is a
-- foreign key to score_rules.game, so Relic Song's total posts only once this
-- row exists. Same values as the JSON.
insert into public.score_rules (game, label, better, max_value)
values ('relic-song', 'Sum of best scores across every song', 'high', 20000000)
on conflict (game) do update set label = excluded.label, better = excluded.better, max_value = excluded.max_value;
