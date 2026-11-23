-- Accept the editor's TB2 codes on the public list.
--
-- The editor moved to TB2 (a road piece and an extras mask, two characters a
-- piece) so a code can carry an iced tunnel bend. The table constraint and the
-- post function still only allowed the old TB1 shape, so every post from the
-- current editor failed with "That is not a saved track." Both versions now
-- pass, and the body is allowed two characters for each of the editor's 36
-- pieces instead of one for each of the old 36.
--
-- The code is still only a road: no player data, no account, and the game
-- decodes and validates it again before driving it.
begin;

alter table public.trackbound_tracks drop constraint if exists trackbound_tracks_code_check;
alter table public.trackbound_tracks add constraint trackbound_tracks_code_check
 check (code ~ '^TB[12]-[0-9a-z]{3,72}-[0-9a-z]{4}$');

create or replace function public.trackbound_track_post(p_name text, p_code text, p_id uuid default null)
returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); shared integer; today integer; track_code text;
        row_id uuid; old_code text;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Give the track a name.'; end if;
 track_code := trim(coalesce(p_code, ''));
 if lower(track_code) !~ '^tb[12]-[0-9a-z]{3,72}-[0-9a-z]{4}$' then
  raise exception 'That is not a saved track.';
 end if;
 -- One spelling of a code per account, so the unique row catches a repost.
 -- The version stays as sent: a TB2 code must not be rewritten as TB1.
 track_code := upper(substr(track_code, 1, 3)) || lower(substr(track_code, 4));
 if p_id is not null then
  select t.id, t.code into row_id, old_code
  from public.trackbound_tracks t where t.id = p_id and t.author = u for update;
  if row_id is null then raise exception 'That track is not yours to repost.'; end if;
  if exists (select 1 from public.trackbound_tracks t
             where t.author = u and lower(t.code) = lower(track_code) and t.id <> row_id) then
   raise exception 'Another of your tracks already uses that layout.';
  end if;
  -- A changed road starts its board again: the old times were set elsewhere.
  if lower(old_code) <> lower(track_code) then
   delete from public.trackbound_track_runs where track_id = row_id;
  end if;
  update public.trackbound_tracks set name = left(trim(p_name), 32), code = track_code, created_at = now()
  where id = row_id;
  return jsonb_build_object('ok', true, 'updated', true, 'id', row_id);
 end if;
 if exists (select 1 from public.trackbound_tracks t where t.author = u and lower(t.code) = lower(track_code)) then
  update public.trackbound_tracks set name = left(trim(p_name), 32), created_at = now()
  where author = u and lower(trackbound_tracks.code) = lower(track_code)
  returning id into row_id;
  return jsonb_build_object('ok', true, 'updated', true, 'id', row_id);
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
 insert into public.trackbound_tracks(author, name, code) values (u, left(trim(p_name), 32), track_code)
 returning id into row_id;
 return jsonb_build_object('ok', true, 'updated', false, 'id', row_id);
end $$;

revoke all on function public.trackbound_track_post(text, text, uuid) from public, anon;
grant execute on function public.trackbound_track_post(text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
