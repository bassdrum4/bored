-- Civ Lite 5.3: saves follow the player's Bored account across devices.
--
-- One new table, public.game_saves, and four functions the page calls through Supabase's REST RPC:
--   save_list(game)                                     headers, versions and sizes; never the game itself
--   save_get(game, slot)                                one save, with its data
--   save_put(game, slot, header, data, expected_version) write one save, or refuse when it changed meanwhile
--   save_delete(game, slot, expected_version)           delete one save, with the same check
--
-- Safe to run once in the Supabase SQL editor (the table and the schema are created only if missing; the
-- functions are replaced in place). It needs the Bored Together migrations that are already applied, because
-- the functions reuse bored_together.rate_limit.
--
-- Who can do what
--   * Only a signed-in, non-anonymous account. Anonymous sessions and the publishable key alone are refused.
--   * Only its own rows: the user id always comes from auth.uid(), never from an argument.
--   * Reads: the select policy, or save_list / save_get.
--   * Writes: only through save_put / save_delete. The table has no insert, update or delete policy and
--     those privileges are revoked, so the version check can not be skipped by writing to the table directly.
--
-- Limits (also table checks, so nothing else can break them)
--   * game must be 'ashcrown'; slot one of m1..m8 or 'auto' (so at most 9 rows per user per game).
--   * data at most 2 MB (2,097,152 bytes); the header at most 4 KB.
--   * Rate limit: 60 calls a minute per account, and 20 writes a minute.
--
-- Concurrency: every row has a version, 1 on the first write. save_put and save_delete take the version the
-- caller last saw (0 for "nothing yet"). If the stored version is different they change nothing and raise an
-- HTTP 409 (SQLSTATE PT409) whose DETAIL is JSON with the stored version, header and time, so the page can say
-- who is newer. Otherwise the version goes up by one.

create table if not exists public.game_saves (
  user_id uuid not null references auth.users (id) on delete cascade,
  game text not null check (game = 'ashcrown'),
  slot text not null check (slot in ('auto', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8')),
  header jsonb not null check (jsonb_typeof(header) = 'object' and octet_length(header::text) <= 4096),
  data text not null check (data <> '' and octet_length(data) <= 2097152),
  bytes integer not null check (bytes = octet_length(data)),
  version integer not null default 1 check (version >= 1),
  updated_at timestamptz not null default now(),
  primary key (user_id, game, slot)
);

alter table public.game_saves enable row level security;

create schema if not exists bored_saves;
revoke all on schema bored_saves from public, anon;
grant usage on schema bored_saves to authenticated;

-- The policy runs as the caller, who can not read auth.users, so the check lives in a definer function.
create or replace function bored_saves.signed_in() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = auth.uid() and not is_anonymous)
$$;
revoke all on function bored_saves.signed_in() from public, anon;
grant execute on function bored_saves.signed_in() to authenticated;

drop policy if exists "players read their own saves" on public.game_saves;
create policy "players read their own saves" on public.game_saves
  for select to authenticated
  using (user_id = auth.uid() and (select bored_saves.signed_in()));

revoke all on public.game_saves from public, anon, authenticated;
grant select on public.game_saves to authenticated;

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
  if p_game is distinct from 'ashcrown' then
    raise exception 'Unknown game.' using errcode = '22023';
  end if;
  return u;
end $$;
revoke all on function bored_saves.guard(text, boolean) from public, anon, authenticated;

create or replace function bored_saves.check_slot(p_slot text) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_slot is null or p_slot not in ('auto', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8') then
    raise exception 'That isn’t a save slot.' using errcode = '22023';
  end if;
end $$;
revoke all on function bored_saves.check_slot(text) from public, anon, authenticated;

-- The 409: nothing was changed, and the DETAIL says what is stored now (version 0 and no header when the slot is empty).
create or replace function bored_saves.conflict(r public.game_saves) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception 'This save changed on another device.' using errcode = 'PT409', detail = jsonb_build_object(
    'version', coalesce(r.version, 0), 'header', r.header, 'bytes', r.bytes,
    'stamp', case when r.updated_at is null then null else floor(extract(epoch from r.updated_at) * 1000)::bigint end)::text;
end $$;
revoke all on function bored_saves.conflict(public.game_saves) from public, anon, authenticated;

create or replace function public.save_list(p_game text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := bored_saves.guard(p_game);
begin
  return coalesce((select jsonb_agg(jsonb_build_object(
      'slot', s.slot, 'version', s.version, 'bytes', s.bytes, 'header', s.header,
      'stamp', floor(extract(epoch from s.updated_at) * 1000)::bigint) order by s.slot)
    from public.game_saves s where s.user_id = u and s.game = p_game), '[]'::jsonb);
end $$;

create or replace function public.save_get(p_game text, p_slot text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := bored_saves.guard(p_game); r public.game_saves;
begin
  perform bored_saves.check_slot(p_slot);
  select * into r from public.game_saves where user_id = u and game = p_game and slot = p_slot;
  if not found then raise exception 'That save isn’t in your account.' using errcode = 'PT404'; end if;
  return jsonb_build_object('slot', r.slot, 'version', r.version, 'bytes', r.bytes, 'header', r.header, 'data', r.data,
    'stamp', floor(extract(epoch from r.updated_at) * 1000)::bigint);
end $$;

create or replace function public.save_put(p_game text, p_slot text, p_header jsonb, p_data text, p_expected integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := bored_saves.guard(p_game, true); r public.game_saves;
begin
  perform bored_saves.check_slot(p_slot);
  if p_expected is null or p_expected < 0 then raise exception 'Invalid request.' using errcode = '22023'; end if;
  if p_header is null or jsonb_typeof(p_header) <> 'object' or octet_length(p_header::text) > 4096 then
    raise exception 'Invalid save.' using errcode = '22023';
  end if;
  if p_data is null or p_data = '' then raise exception 'Invalid save.' using errcode = '22023'; end if;
  if octet_length(p_data) > 2097152 then raise exception 'A save can be at most 2 MB.' using errcode = '22023'; end if;
  select * into r from public.game_saves where user_id = u and game = p_game and slot = p_slot for update;
  if found then
    if r.version <> p_expected then perform bored_saves.conflict(r); end if;
    update public.game_saves set header = p_header, data = p_data, bytes = octet_length(p_data),
      version = r.version + 1, updated_at = now()
      where user_id = u and game = p_game and slot = p_slot returning * into r;
  else
    -- Nothing stored: only a caller that expects nothing may create it. One that saw a version has been told
    -- the save is gone (deleted on another device) and must decide again.
    if p_expected <> 0 then perform bored_saves.conflict(null::public.game_saves); end if;
    if (select count(*) from public.game_saves where user_id = u and game = p_game) >= 9 then
      raise exception 'An account keeps at most 9 saves of this game.' using errcode = '22023';
    end if;
    insert into public.game_saves (user_id, game, slot, header, data, bytes)
      values (u, p_game, p_slot, p_header, p_data, octet_length(p_data))
      on conflict (user_id, game, slot) do nothing returning * into r;
    if not found then
      -- Another device created it in the same instant.
      select * into r from public.game_saves where user_id = u and game = p_game and slot = p_slot;
      perform bored_saves.conflict(r);
    end if;
  end if;
  return jsonb_build_object('slot', r.slot, 'version', r.version, 'bytes', r.bytes,
    'stamp', floor(extract(epoch from r.updated_at) * 1000)::bigint);
end $$;

create or replace function public.save_delete(p_game text, p_slot text, p_expected integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare u uuid := bored_saves.guard(p_game, true); r public.game_saves;
begin
  perform bored_saves.check_slot(p_slot);
  if p_expected is null or p_expected < 0 then raise exception 'Invalid request.' using errcode = '22023'; end if;
  select * into r from public.game_saves where user_id = u and game = p_game and slot = p_slot for update;
  -- Already gone (deleted on another device too): nothing left to do.
  if not found then return jsonb_build_object('slot', p_slot, 'deleted', false, 'version', 0); end if;
  if r.version <> p_expected then perform bored_saves.conflict(r); end if;
  delete from public.game_saves where user_id = u and game = p_game and slot = p_slot;
  return jsonb_build_object('slot', p_slot, 'deleted', true, 'version', r.version);
end $$;

revoke all on function public.save_list(text) from public, anon;
revoke all on function public.save_get(text, text) from public, anon;
revoke all on function public.save_put(text, text, jsonb, text, integer) from public, anon;
revoke all on function public.save_delete(text, text, integer) from public, anon;
grant execute on function public.save_list(text) to authenticated;
grant execute on function public.save_get(text, text) to authenticated;
grant execute on function public.save_put(text, text, jsonb, text, integer) to authenticated;
grant execute on function public.save_delete(text, text, integer) to authenticated;
