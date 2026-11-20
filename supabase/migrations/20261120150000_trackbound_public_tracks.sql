-- Public custom tracks for Trackbound.
--
-- The editor already produces a self-contained TB1 code (road pieces only, no
-- player data). This gives a code somewhere to go so other people can drive it.
-- The server keeps the code as text and validates its shape; the game validates
-- it again on import, so a row can never do more than fail to load. The list
-- carries a display name and the code, never an email, an account id or any
-- play history.
begin;

create table public.trackbound_tracks (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  code text not null check (code ~ '^TB1-[0-9a-z]{3,36}-[0-9a-z]{4}$'),
  created_at timestamptz not null default now(),
  unique (author, code)
);
create index trackbound_tracks_recent on public.trackbound_tracks(created_at desc);
alter table public.trackbound_tracks enable row level security;
revoke all on public.trackbound_tracks from public, anon, authenticated;

-- The list the game shows: newest first, a name and a display name. Readable
-- signed out, because nothing in it is private.
create function public.trackbound_tracks_list(p_limit integer default 60) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id', x.id, 'name', x.name, 'handle', x.handle, 'code', x.code,
  'at', extract(epoch from x.created_at) * 1000) order by x.created_at desc), '[]'::jsonb)
 from (
  select t.id, t.name, t.code, t.created_at,
   coalesce(nullif(trim(p.handle), ''), 'Bored player') handle
  from public.trackbound_tracks t
  left join public.profiles p on p.id = t.author
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 100))
 ) x;
$$;

-- Posting: signed in, bounded, and capped so one account cannot fill the list.
-- Re-posting a code the same account already shared renames it and moves it back
-- to the top instead of filing a duplicate.
create function public.trackbound_track_post(p_name text, p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); shared integer; today integer; track_code text;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the track a name.'; end if;
 track_code := trim(coalesce(p_code, ''));
 if lower(track_code) !~ '^tb1-[0-9a-z]{3,36}-[0-9a-z]{4}$' then raise exception 'That is not a saved track.'; end if;
 -- One spelling of a code per account, so the unique row catches a repost.
 track_code := 'TB1-' || lower(substr(track_code, 5));
 if exists (select 1 from public.trackbound_tracks t where t.author = u and lower(t.code) = lower(track_code)) then
  update public.trackbound_tracks set name = left(trim(p_name), 32), created_at = now()
  where author = u and lower(trackbound_tracks.code) = lower(track_code);
  return jsonb_build_object('ok', true, 'updated', true);
 end if;
 select count(*) into shared from public.trackbound_tracks where author = u;
 if shared >= 60 then
  raise exception 'You have already shared 60 tracks. That is the limit.';
 end if;
 select count(*) into today from public.trackbound_tracks
 where author = u and created_at > now() - interval '1 day';
 if today >= 10 then
  raise exception 'Ten tracks a day is the limit. Try again tomorrow.';
 end if;
 insert into public.trackbound_tracks(author, name, code) values (u, left(trim(p_name), 32), track_code);
 return jsonb_build_object('ok', true, 'updated', false);
end $$;

revoke all on function public.trackbound_tracks_list(integer) from public, anon;
grant execute on function public.trackbound_tracks_list(integer) to anon, authenticated;
revoke all on function public.trackbound_track_post(text, text) from public, anon;
grant execute on function public.trackbound_track_post(text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
