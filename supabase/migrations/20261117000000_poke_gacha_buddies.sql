-- Poké Gacha buddies on the shared leaderboard.
--
-- A player's equipped buddy is cosmetic and public: the leaderboard shows it
-- next to their handle. The wallet that proves they own it stays private in
-- player_state, so the server only bounds the species number; a forged buddy
-- changes a sprite and nothing else.
begin;

create table if not exists public.poke_gacha_buddies (
  user_id uuid primary key references auth.users (id) on delete cascade,
  species integer not null check (species between 1 and 1025),
  shiny boolean not null default false,
  -- An SP skin id from games/content/poke-gacha/sp/skins.json, or null.
  skin text check (skin ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  updated_at timestamptz not null default now()
);
alter table public.poke_gacha_buddies enable row level security;
-- No direct access: writes go through set_buddy, reads through buddy_board.
revoke all on public.poke_gacha_buddies from anon, authenticated;

create or replace function public.set_buddy(p_species integer, p_shiny boolean default false, p_skin text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode = '42501'; end if;
  if p_species is null then
    delete from public.poke_gacha_buddies where user_id = auth.uid();
    return;
  end if;
  if p_species < 1 or p_species > 1025 then raise exception 'Unknown species.'; end if;
  if p_skin is not null and p_skin !~ '^[a-z0-9][a-z0-9-]{0,39}$' then raise exception 'Unknown skin.'; end if;
  insert into public.poke_gacha_buddies (user_id, species, shiny, skin, updated_at)
  values (auth.uid(), p_species, coalesce(p_shiny, false), p_skin, now())
  on conflict (user_id) do update
    set species = excluded.species, shiny = excluded.shiny, skin = excluded.skin, updated_at = now();
end $$;
revoke all on function public.set_buddy(integer, boolean, text) from public, anon;
grant execute on function public.set_buddy(integer, boolean, text) to authenticated;

-- Handle to buddy, for the board. Only players with a handle appear.
create or replace view public.buddy_board as
  select p.handle, b.species, b.shiny, b.skin
  from public.poke_gacha_buddies b
  join public.profiles p on p.id = b.user_id
  where p.handle is not null;
grant select on public.buddy_board to anon, authenticated;

commit;
