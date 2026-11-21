-- Shotgun Roulette scores (Pokémon Gambling).
-- Not applied yet: run this in the Supabase SQL editor when the game is ready.
--
-- One row per finished run. The leaderboard reads the best rows per mode.

create table if not exists public.shotgun_roulette_scores (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  mode        text not null check (mode in ('normal', 'hard')),
  coins_won   integer not null default 0 check (coins_won >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  created_at  timestamptz not null default now()
);

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

-- A signed-in player may only insert rows for themselves. No updates or deletes from the client.
drop policy if exists "players insert their own shotgun roulette scores" on public.shotgun_roulette_scores;
create policy "players insert their own shotgun roulette scores"
  on public.shotgun_roulette_scores for insert
  to authenticated
  with check (auth.uid() = user_id);

grant select on public.shotgun_roulette_scores to anon, authenticated;
grant insert on public.shotgun_roulette_scores to authenticated;
