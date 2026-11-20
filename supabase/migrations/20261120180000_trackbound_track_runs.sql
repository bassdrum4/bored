-- Times on public courses, and reposting an edited one.
--
-- A public track is a road other people drive, so its list row now carries the
-- fastest four players on that exact code. One row per player per course (their
-- best), so a course cannot be filled with attempts, and a repost that changes
-- the layout clears the board because an old time says nothing about a new road.
-- The list still carries display names and times only: no email, no account id.
begin;

create table public.trackbound_track_runs (
  track_id uuid not null references public.trackbound_tracks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  ms integer not null check (ms between 4000 and 600000),
  created_at timestamptz not null default now(),
  primary key (track_id, user_id)
);
create index trackbound_track_runs_fastest on public.trackbound_track_runs(track_id, ms);
alter table public.trackbound_track_runs enable row level security;
revoke all on public.trackbound_track_runs from public, anon, authenticated;

-- Reporting a finished run: signed in, bounded, and only ever keeping the
-- player's best. Nothing here can grow the table beyond one row per player per
-- course, so repeated runs cost an update rather than a row.
create function public.trackbound_track_run_post(p_track uuid, p_ms integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid();
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if p_track is null or not exists(select 1 from public.trackbound_tracks t where t.id = p_track) then
  raise exception 'That track is not shared.';
 end if;
 if p_ms is null or p_ms < 4000 or p_ms > 600000 then
  raise exception 'That is not a finished lap.';
 end if;
 insert into public.trackbound_track_runs(track_id, user_id, ms) values (p_track, u, p_ms)
 on conflict (track_id, user_id) do update
  set ms = least(trackbound_track_runs.ms, excluded.ms),
      created_at = case when excluded.ms < trackbound_track_runs.ms
        then now() else trackbound_track_runs.created_at end;
 return jsonb_build_object('ok', true, 'ms', least(p_ms,
  (select ms from public.trackbound_track_runs where track_id = p_track and user_id = u)));
end $$;

-- The list the game shows: newest first, a name, a display name, and the four
-- fastest runs on that course.
create or replace function public.trackbound_tracks_list(p_limit integer default 60) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id', x.id, 'name', x.name, 'handle', x.handle, 'code', x.code,
  'at', extract(epoch from x.created_at) * 1000, 'best', x.best)
  order by x.created_at desc), '[]'::jsonb)
 from (
  select t.id, t.name, t.code, t.created_at,
   coalesce(nullif(trim(p.handle), ''), 'Bored player') handle,
   coalesce((
    select jsonb_agg(jsonb_build_object('handle', b.handle, 'ms', b.ms) order by b.ms)
    from (
     select coalesce(nullif(trim(p2.handle), ''), 'Bored player') handle, r.ms
     from public.trackbound_track_runs r
     left join public.profiles p2 on p2.id = r.user_id
     where r.track_id = t.id
     order by r.ms
     limit 4
    ) b
   ), '[]'::jsonb) best
  from public.trackbound_tracks t
  left join public.profiles p on p.id = t.author
  order by t.created_at desc
  limit greatest(1, least(coalesce(p_limit, 60), 100))
 ) x;
$$;

-- Posting: `p_id` names the row an edit reposts into, so an edited course keeps
-- one entry in the list instead of collecting a copy per version. Without it the
-- old behaviour stands: a code the account already shared is renamed in place.
drop function if exists public.trackbound_track_post(text, text);
create function public.trackbound_track_post(p_name text, p_code text, p_id uuid default null)
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
 if lower(track_code) !~ '^tb1-[0-9a-z]{3,36}-[0-9a-z]{4}$' then raise exception 'That is not a saved track.'; end if;
 -- One spelling of a code per account, so the unique row catches a repost.
 track_code := 'TB1-' || lower(substr(track_code, 5));
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

revoke all on function public.trackbound_track_run_post(uuid, integer) from public, anon;
grant execute on function public.trackbound_track_run_post(uuid, integer) to authenticated;
revoke all on function public.trackbound_tracks_list(integer) from public, anon;
grant execute on function public.trackbound_tracks_list(integer) to anon, authenticated;
revoke all on function public.trackbound_track_post(text, text, uuid) from public, anon;
grant execute on function public.trackbound_track_post(text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
