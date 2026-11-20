-- Authors can take their own public tracks down.
--
-- The list is fetched with the player's session when there is one, so it can say
-- which rows are theirs; the delete function checks the author against
-- auth.uid() itself, so a client-supplied id can never remove someone else's
-- course. Times go with the track through the cascade.
begin;

create or replace function public.trackbound_tracks_list(p_limit integer default 60) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'id', x.id, 'name', x.name, 'handle', x.handle, 'code', x.code,
  'at', extract(epoch from x.created_at) * 1000, 'best', x.best, 'mine', x.mine)
  order by x.created_at desc), '[]'::jsonb)
 from (
  select t.id, t.name, t.code, t.created_at,
   coalesce(nullif(trim(p.handle), ''), 'Bored player') handle,
   coalesce(t.author = auth.uid(), false) mine,
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

create function public.trackbound_track_delete(p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid := auth.uid(); removed integer;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if p_id is null then raise exception 'That track is not shared.'; end if;
 delete from public.trackbound_tracks where id = p_id and author = u;
 get diagnostics removed = row_count;
 if removed = 0 then raise exception 'That track is not yours to remove.'; end if;
 return jsonb_build_object('ok', true);
end $$;

revoke all on function public.trackbound_track_delete(uuid) from public, anon;
grant execute on function public.trackbound_track_delete(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
