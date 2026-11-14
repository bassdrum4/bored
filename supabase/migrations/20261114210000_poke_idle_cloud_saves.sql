-- Poké Idle's save follows the player's Bored account too, through Civ Lite's table and functions
-- (20261109210000_civ_lite_cloud_saves.sql). This only lets one more game in:
--   * public.game_saves accepts game 'poke-idle', which keeps one save, in slot 'auto'
--     (a table check, so nothing can store more).
--   * bored_saves.guard knows the game. Nothing else about the functions changes: same limits, same version
--     check, same rate limit (shared across both games).
-- Civ Lite's rows, slots and limits are untouched. Safe to run more than once in the Supabase SQL editor.
-- Keep the list in step with SAVE_GAMES in src/hub/saves-bridge.js.

alter table public.game_saves drop constraint if exists game_saves_game_check;
alter table public.game_saves add constraint game_saves_game_check check (game in ('ashcrown', 'poke-idle'));
alter table public.game_saves drop constraint if exists game_saves_poke_idle_slot_check;
alter table public.game_saves add constraint game_saves_poke_idle_slot_check check (game <> 'poke-idle' or slot = 'auto');

-- The checks every call starts with: a real account, the rate limit, a known game. Returns the caller's id.
create or replace function bored_saves.guard(p_game text, p_writes boolean default false) returns uuid
language plpgsql set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or not exists (select 1 from auth.users where id = u and not is_anonymous) then
    raise exception 'Sign in to your Bored account first.' using errcode = '42501';
  end if;
  perform bored_together.rate_limit(u, 'saves', 60, 60);
  if p_writes then perform bored_together.rate_limit(u, 'saves-write', 60, 20); end if;
  if p_game is null or p_game not in ('ashcrown', 'poke-idle') then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;
  return u;
end $$;
revoke all on function bored_saves.guard(text, boolean) from public, anon, authenticated;
