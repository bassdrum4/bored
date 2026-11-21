-- Shotgun Roulette scores (Pokémon Gambling).
-- Safe preview schema: create the board, but keep writes server-only until scoring is validated.
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

-- Placeholder only. The game has no validated, authoritative scoring yet.
-- Do not accept arbitrary client-submitted coin totals/streaks in production.
drop policy if exists "players insert their own shotgun roulette scores"
  on public.shotgun_roulette_scores;

-- Existing Supabase projects may give new public tables broad default grants.
-- Remove them explicitly, then allow only read access for the empty leaderboard.
revoke all on public.shotgun_roulette_scores from anon, authenticated;
grant select on public.shotgun_roulette_scores to anon, authenticated;
-- Future server-validated submissions must be implemented behind trusted server code.
