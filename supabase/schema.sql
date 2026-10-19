-- Bored shared leaderboard.
-- Run this once in the Supabase SQL editor before adding the project keys to index.html.

create table if not exists public.scores (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null,
  score double precision not null check (score >= 0),
  lower_is_better boolean not null default false,
  display_name text not null default 'player' check (char_length(display_name) between 1 and 20),
  updated_at timestamptz not null default now(),
  primary key (user_id, game)
);

create index if not exists scores_leaderboard_idx on public.scores (game, score);

alter table public.scores enable row level security;

-- Anyone (including signed-out visitors) can read the board.
drop policy if exists "scores are public" on public.scores;
create policy "scores are public"
  on public.scores for select
  using (true);

-- Signed-in players can only write rows that belong to their own account.
drop policy if exists "players insert own scores" on public.scores;
create policy "players insert own scores"
  on public.scores for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "players update own scores" on public.scores;
create policy "players update own scores"
  on public.scores for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "players delete own scores" on public.scores;
create policy "players delete own scores"
  on public.scores for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.scores to anon, authenticated;
grant insert, update, delete on public.scores to authenticated;
