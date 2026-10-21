-- Player state for Bored.
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- Chrome partitions third-party storage, so anything the arcade saves inside
-- the Google Sites embed belongs to that embed alone: the same student opening
-- the arcade in another embed, or straight from bassdrum4.github.io, starts
-- from an empty profile. This table is the account's own copy — favorites,
-- recently played, per-game bests and daily completions — merged with whatever
-- the browser already has whenever the player signs in.
--
-- One row per account, readable and writable only by that account.

create table if not exists public.player_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.player_state enable row level security;

drop policy if exists "players read their own state" on public.player_state;
create policy "players read their own state" on public.player_state
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "players write their own state" on public.player_state;
create policy "players write their own state" on public.player_state
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "players replace their own state" on public.player_state;
create policy "players replace their own state" on public.player_state
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- The server keeps updated_at honest, so a client cannot backdate a row.
create or replace function public.touch_player_state() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists player_state_touch on public.player_state;
create trigger player_state_touch before update on public.player_state
  for each row execute function public.touch_player_state();

-- The publishable key ships in the page, so anon gets nothing here. Without
-- this revoke the table would be readable by anyone who reads the bundle.
revoke all on public.player_state from anon;
grant select, insert, update on public.player_state to authenticated;
