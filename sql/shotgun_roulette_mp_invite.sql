-- Invite a Bored Together member into a live room that is already open (its lobby), so an empty seat in
-- Shotgun Roulette's multiplayer lobby can be filled with an invitation, not only with the room code.
-- Until now a live room could only invite members when it was created.
-- Not applied yet: run this in the Supabase SQL editor after sql/shotgun_roulette_multiplayer.sql.
-- Safe to run more than once.
--
-- bored_live.api gains an `invite` action: { id, user }. Only the host, only in the lobby, only an active
-- Bored Together member who has not blocked (or been blocked by) the host, only while the room has a free
-- human seat. The member gets an 'invited' seat, exactly like an invitation made when the room was created:
-- it shows in their Bored Together tab and in the game's Multiplayer panel, and they join from there.
-- The page never handles account ids: the hub hands it opaque references and swaps them back.
-- The function is patched in place (as sql/shotgun_roulette_multiplayer.sql did), so none of its other
-- rules are copied or drift.

do $$
declare
  body text;
  before text;
begin
  body := pg_get_functiondef('bored_live.api(text,jsonb)'::regprocedure);
  if position($q$elsif action='invite' then$q$ in body) > 0 then
    raise notice 'bored_live.api already has the invite action.';
    return;
  end if;
  before := body;
  body := replace(body,
    $q$'kick','lobby_set','leave_lobby','start'$q$,
    $q$'kick','lobby_set','leave_lobby','invite','start'$q$);
  body := replace(body,
    $q$ elsif action='leave_lobby' then$q$,
    $q$ elsif action='invite' then
  if g.status<>'lobby' then raise exception 'This game has already started.'; end if;
  if g.host<>u then raise exception 'Only the host can invite people.'; end if;
  perform bored_together.rate_limit(u,'live-invite',3600,40);
  if coalesce(args->>'user','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid request.'; end if;
  who := (args->>'user')::uuid;
  if who=u or exists(select 1 from bored_live.seats where game_id=gid and user_id=who and state<>'left') then
   raise exception 'They are already in this room.';
  end if;
  if not exists(select 1 from bored_together.members where user_id=who and active) or bored_together.blocked(u,who) then
   raise exception 'That member can not be invited.';
  end if;
  if (select count(*) from bored_live.seats where game_id=gid and state<>'left')>=g.capacity then
   raise exception 'The room is full.';
  end if;
  if exists(select 1 from bored_live.seats where game_id=gid and user_id=who) then
   update bored_live.seats set state='invited', civ=null where game_id=gid and user_id=who;
  else
   i := (select min(free.k) from generate_series(0,7) free(k) where not exists(select 1 from bored_live.seats st where st.game_id=gid and st.seat=free.k));
   if i is null then raise exception 'The room is full.'; end if;
   insert into bored_live.seats(game_id,seat,user_id,team,state) values(gid,i,who,i,'invited');
  end if;
  update bored_live.games set updated_at=now() where id=gid;
  perform bored_live.touch(gid,u);
  select * into g from bored_live.games where id=gid;
  return bored_live.game_json(g,u);

 elsif action='leave_lobby' then$q$);
  if body = before or position($q$'leave_lobby','invite','start'$q$ in body) = 0 or position($q$elsif action='invite' then$q$ in body) = 0 then
    raise exception 'bored_live.api did not look as expected; check the live migrations before running this.';
  end if;
  execute body;
end $$;

notify pgrst, 'reload schema';
