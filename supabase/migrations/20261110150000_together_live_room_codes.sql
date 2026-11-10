-- Bored Together, live games: room codes (Civ Lite 5.4).
--
-- A room gets a join code, like Civ 6: six characters from ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (no 0, 1, I or O),
-- made by the server from secure random bytes, unique among rooms still in the lobby. A room also has a capacity,
-- two to four human seats, set by its host. A forward migration on top of 20261109190000_together_live_checks.sql
-- and the live migrations before it, all left as they were. It adds two columns and one table, a few helpers, and
-- replaces bored_live.api, bored_live.game_json and bored_live.cleanup. bored_live.api is the 5.1.1 function with
-- every one of its checks, plus what is listed here (the co-op wrapper public.bt_live_rpc is not touched).
--
--   create      invitees are optional now (0 to 3) and a capacity (2 to 4) can be given. It returns the code to
--               the host. Without a capacity (an older screen) the room is as big as its invitations, as before.
--   join_code   seats the caller as 'joined' in the lobby that has that code. Case, spaces and dashes do not matter.
--               It needs a free human seat (capacity minus the seats taken, invited ones included) and a host who
--               has not blocked the caller. Wrong, full and started rooms are answered with a plain message,
--               returned as {ok:false, error} instead of raised: a raised error rolls the try-counter back, and
--               a limit of ten tries a minute per player (bored_together.rate_limit) would never count a wrong
--               guess. A blocked or removed player is told 'No open room with that code', like anyone with a wrong one.
--   new_code    host only, in the lobby: a fresh code; the old one stops working, and removed players may use
--               the new one.
--   kick        host only, in the lobby: removes an invited or joined player, who can not rejoin with the code the
--               room had then (bored_live.kicks) until new_code is called.
--   start       clears the code. Human seats nobody took become CPUs (or are dropped), like invited seats that
--               never joined. The last code is kept in retired_code only so a late joiner is told the game has started.
--   cleanup     lobbies untouched for 24 hours are closed (cancelled, code cleared); join_code treats them as closed
--               at once, whether or not cleanup has run. The rest of the retention rules are unchanged.
--
-- Who sees the code (bored_live.game_json): in a lobby, the host (in 'game' and 'list') and players who have joined
-- (in 'game', which is what the lobby shows, so they can pass it on). Not 'list' for anyone but the host, not an
-- invited player who has not joined, not anybody outside the room, and nobody once the game has started.
-- Safe to run once, after the earlier live migrations.

alter table bored_live.games add column if not exists code text check (code is null or code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$');
alter table bored_live.games add column if not exists retired_code text;
alter table bored_live.games add column if not exists capacity integer not null default 4 check (capacity between 2 and 4);
-- Lobbies that are already open keep the size they have.
update bored_live.games g set capacity=least(4,greatest(2,(select count(*) from bored_live.seats s where s.game_id=g.id))) where g.status='lobby';
create unique index if not exists live_games_open_code on bored_live.games(code) where status='lobby' and code is not null;
create index if not exists live_games_retired_code on bored_live.games(retired_code) where retired_code is not null;

-- Players the host removed, and the code the room had when they were. A new code frees them.
create table if not exists bored_live.kicks (
 game_id uuid not null references bored_live.games(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 code text,
 at timestamptz not null default now(),
 primary key (game_id, user_id)
);
alter table bored_live.kicks enable row level security;
revoke all on bored_live.kicks from public,anon,authenticated;

-- Six characters from the alphabet, from the server's secure random source (gen_random_uuid reads it): the first six
-- bytes of a version 4 uuid are all random, and 256 is a multiple of 32, so every character is equally likely.
create or replace function bored_live.new_room_code() returns text
language plpgsql volatile set search_path='' as $$
declare alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; raw bytea; c text; k integer; tries integer := 0;
begin
 loop
  raw := uuid_send(gen_random_uuid());
  c := '';
  for k in 0..5 loop c := c || substr(alphabet,(get_byte(raw,k) & 31)+1,1); end loop;
  exit when not exists(select 1 from bored_live.games where code=c and status='lobby');
  tries := tries+1;
  if tries>=20 then raise exception 'Could not make a room code. Try again.'; end if;
 end loop;
 return c;
end $$;
revoke all on function bored_live.new_room_code() from public,anon,authenticated;

-- Gives a lobby a fresh code. Two rooms made in the same instant can pick the same one: the unique index
-- refuses the second, which simply draws again.
create or replace function bored_live.assign_code(gid uuid) returns text
language plpgsql volatile set search_path='' as $$
declare c text; tries integer := 0;
begin
 loop
  c := bored_live.new_room_code();
  begin
   update bored_live.games set code=c, updated_at=now() where id=gid;
   return c;
  exception when unique_violation then
   tries := tries+1;
   if tries>=8 then raise exception 'Could not make a room code. Try again.'; end if;
  end;
 end loop;
end $$;
revoke all on function bored_live.assign_code(uuid) from public,anon,authenticated;

create or replace function bored_live.game_json(g bored_live.games, viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',g.id,'game',g.game,'host',g.host,'status',g.status,'config',g.config,'start',g.start,
  'timer',g.timer_seconds,'head',g.head,'round',g.round,'capacity',g.capacity,
  'round_age',case when g.round_at is null then null else floor(extract(epoch from now()-g.round_at))::integer end,
  'winner',g.winner,'over_reason',g.over_reason,'created_at',g.created_at,'started_at',g.started_at,
  'me',(select seat from bored_live.seats where game_id=g.id and user_id=viewer),
  'seats',bored_live.seats_json(g.id),
  'snapshot',(select jsonb_build_object('round',round,'seq',seq,'hash',hash) from bored_live.snapshots where game_id=g.id order by round desc limit 1))
 || case when g.status='lobby' and g.code is not null and (g.host=viewer
         or exists(select 1 from bored_live.seats where game_id=g.id and user_id=viewer and state in ('joined','ready')))
    then jsonb_build_object('code',g.code) else '{}'::jsonb end;
$$;

create or replace function bored_live.cleanup() returns void language plpgsql set search_path='' as $$
begin
 delete from bored_live.games where status in ('lobby','cancelled') and updated_at<now()-interval '2 days';
 delete from bored_live.games where status='completed' and updated_at<now()-interval '14 days';
 delete from bored_live.games where status='active' and updated_at<now()-interval '14 days';
 update bored_live.games set status='cancelled', code=null, updated_at=now() where status='lobby' and updated_at<now()-interval '24 hours';
 update bored_live.games set retired_code=null where retired_code is not null and started_at<now()-interval '1 day';
end $$;

create or replace function bored_live.api(action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid();
 gid uuid; g bored_live.games; s bored_live.seats; a bored_live.actions; rid uuid;
 payload jsonb; kind text; target integer; cfg jsonb; out jsonb; n integer; r integer;
 invitees jsonb; who uuid; i integer; seat_list jsonb; humans integer; cpus integer; total integer; unjoined text;
 later integer; after_seq integer; lim integer; rows jsonb; h text; other text; round_now integer; seated integer;
 cap integer; code_in text; tseat bored_live.seats; had boolean;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if args is null or jsonb_typeof(args)<>'object' or octet_length(args::text)>(case when action='snapshot' then 6000000 else 16000 end) then
  raise exception 'Invalid request.';
 end if;
 if not exists(select 1 from bored_together.members where user_id=u and active) then
  raise exception 'Join Bored Together first.' using errcode='42501';
 end if;
 if action not in ('create','list','game','join','join_code','new_code','kick','lobby_set','leave_lobby','start','send','sync','heartbeat','snapshot','load','report','finish') then
  raise exception 'Unknown operation.';
 end if;

 if action in ('create','list','join_code') then
  perform bored_together.rate_limit(u,'live',60,900);
  -- Ten tries a minute, so a code can not be guessed. Failed tries are answered, not raised (see join_code):
  -- an error would roll this count back, and the guesses would never add up.
  if action='join_code' then perform bored_together.rate_limit(u,'live-code',60,10); end if;
 else
  if coalesce(args->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid request.'; end if;
  gid := (args->>'id')::uuid;
  -- The row lock orders everything that changes a room, including the action log.
  select * into g from bored_live.games where id=gid for update;
  if not found then raise exception 'That live game was not found.'; end if;
  select * into s from bored_live.seats where game_id=gid and user_id=u;
  if not found or s.state='left' then raise exception 'You are not in this game.' using errcode='42501'; end if;
  perform bored_together.rate_limit(u,'live',60,900);
 end if;

 if action='create' then
  perform bored_together.rate_limit(u,'live-create',3600,20);
  if coalesce(args->>'game','')<>'ashcrown' then raise exception 'Unknown game.'; end if;
  invitees := args->'invite';
  if invitees is null or jsonb_typeof(invitees)='null' then invitees := '[]'::jsonb; end if;
  if jsonb_typeof(invitees)<>'array' or jsonb_array_length(invitees)>3 then
   raise exception 'Invite up to three members.';
  end if;
  n := jsonb_array_length(invitees);
  -- Two to four human seats. Without a capacity (an older screen) the room is as big as its invitations.
  if args ? 'capacity' and jsonb_typeof(args->'capacity')<>'null' then
   if jsonb_typeof(args->'capacity')<>'number' or args->>'capacity' !~ '^[2-4]$' then
    raise exception 'A live game has two to four human players.';
   end if;
   cap := (args->>'capacity')::integer;
  else
   cap := greatest(2,n+1);
  end if;
  if n+1>cap then raise exception 'There are more invitations than seats. Raise the human players, or invite fewer friends.'; end if;
  if (select count(*) from bored_live.games where host=u and status in ('lobby','active'))>=5 then
   raise exception 'You have too many live games open. Finish or cancel one first.';
  end if;
  cfg := bored_live.clean_config(args->'config');
  insert into bored_live.games(game,host,config,capacity) values('ashcrown',u,cfg,cap) returning * into g;
  insert into bored_live.seats(game_id,seat,user_id,team,state) values(g.id,0,u,0,'joined');
  i := 1;
  for kind in select e #>> '{}' from jsonb_array_elements(invitees) e loop
   if kind !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid request.'; end if;
   who := kind::uuid;
   if who=u or exists(select 1 from bored_live.seats where game_id=g.id and user_id=who) then raise exception 'Invite each member once.'; end if;
   if not exists(select 1 from bored_together.members where user_id=who and active) or bored_together.blocked(u,who) then
    raise exception 'That member can not be invited.';
   end if;
   insert into bored_live.seats(game_id,seat,user_id,team,state) values(g.id,i,who,i,'invited');
   i := i+1;
  end loop;
  perform bored_live.assign_code(g.id);
  perform bored_live.touch(g.id,u);
  select * into g from bored_live.games where id=g.id;
  return bored_live.game_json(g,u);

 elsif action='list' then
  return coalesce((select jsonb_agg(case when x.host=u then bored_live.game_json(x,u) else bored_live.game_json(x,u)-'code' end order by x.updated_at desc) from (
   select gm.* from bored_live.games gm join bored_live.seats st on st.game_id=gm.id and st.user_id=u and st.state<>'left'
   where gm.status in ('lobby','active')
      or (gm.status='completed' and gm.updated_at>now()-interval '3 days')
   order by gm.updated_at desc limit 20) x),'[]'::jsonb);

 elsif action='game' then
  perform bored_live.touch(gid,u);
  return bored_live.game_json(g,u);

 elsif action='join' then
  if g.status<>'lobby' then raise exception 'This game has already started.'; end if;
  update bored_live.seats set state=case when state='ready' then 'ready' else 'joined' end where game_id=gid and seat=s.seat;
  perform bored_live.touch(gid,u);
  select * into g from bored_live.games where id=gid;
  return bored_live.game_json(g,u);

 elsif action='join_code' then
  -- Failures here are returned ({ok:false,error}), not raised: a raised error undoes the attempt counter above.
  code_in := upper(regexp_replace(coalesce(args->>'code',''),'[[:space:]-]','','g'));
  if code_in !~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' then
   return jsonb_build_object('ok',false,'error','No open room with that code');
  end if;
  -- A lobby nobody touched for a day is closed, whether or not the nightly cleanup has run yet.
  select * into g from bored_live.games where code=code_in and status='lobby' and updated_at>now()-interval '24 hours' for update;
  if not found then
   if exists(select 1 from bored_live.games where retired_code=code_in and status in ('active','completed')) then
    return jsonb_build_object('ok',false,'error','That game has already started');
   end if;
   return jsonb_build_object('ok',false,'error','No open room with that code');
  end if;
  select * into tseat from bored_live.seats where game_id=g.id and user_id=u;
  had := found;
  if had and tseat.state<>'left' then
   -- Already in this room (the host, or somebody invited by name): the code just opens it.
   update bored_live.seats set state=case when state='ready' then 'ready' else 'joined' end where game_id=g.id and seat=tseat.seat;
  else
   -- A blocked or removed player is told what anybody with a wrong code is told.
   if bored_together.blocked(g.host,u)
      or exists(select 1 from bored_live.kicks k where k.game_id=g.id and k.user_id=u and k.code is not distinct from g.code) then
    return jsonb_build_object('ok',false,'error','No open room with that code');
   end if;
   if (select count(*) from bored_live.seats where game_id=g.id and state<>'left')>=g.capacity then
    return jsonb_build_object('ok',false,'error','That room is full');
   end if;
   -- Seats of people who left the lobby make room for the newcomer.
   delete from bored_live.seats where game_id=g.id and state='left' and user_id<>u;
   if had then
    update bored_live.seats set state='joined', civ=null, controller='human' where game_id=g.id and user_id=u;
   else
    select min(x) into i from generate_series(0,7) x where not exists(select 1 from bored_live.seats where game_id=g.id and seat=x);
    insert into bored_live.seats(game_id,seat,user_id,team,state) values(g.id,i,u,i,'joined');
   end if;
  end if;
  update bored_live.games set updated_at=now() where id=g.id;
  perform bored_live.touch(g.id,u);
  select * into g from bored_live.games where id=g.id;
  return bored_live.game_json(g,u);

 elsif action='new_code' then
  if g.host<>u then raise exception 'Only the host can make a new code.'; end if;
  if g.status<>'lobby' then raise exception 'This game has already started.'; end if;
  perform bored_live.assign_code(gid);
  -- The old code is gone, and so is the reason to keep people out with it.
  delete from bored_live.kicks where game_id=gid;
  perform bored_live.touch(gid,u);
  select * into g from bored_live.games where id=gid;
  return bored_live.game_json(g,u);

 elsif action='kick' then
  if g.host<>u then raise exception 'Only the host can remove a player.'; end if;
  if g.status<>'lobby' then raise exception 'This game has already started.'; end if;
  if coalesce(args->>'seat','') !~ '^[0-7]$' then raise exception 'Invalid request.'; end if;
  target := (args->>'seat')::integer;
  if target=s.seat then raise exception 'You can not remove yourself. Leave the game instead.'; end if;
  select * into tseat from bored_live.seats where game_id=gid and seat=target and state<>'left';
  if not found then raise exception 'That seat is empty.'; end if;
  delete from bored_live.seats where game_id=gid and seat=target;
  delete from bored_live.presence where game_id=gid and user_id=tseat.user_id;
  -- Out of this room for as long as this code lasts.
  insert into bored_live.kicks(game_id,user_id,code) values(gid,tseat.user_id,g.code)
  on conflict(game_id,user_id) do update set code=excluded.code, at=now();
  update bored_live.games set updated_at=now() where id=gid;
  perform bored_live.touch(gid,u);
  select * into g from bored_live.games where id=gid;
  return bored_live.game_json(g,u);

 elsif action='lobby_set' then
  if g.status<>'lobby' then raise exception 'This game has already started.'; end if;
  if s.state='invited' then raise exception 'Join the game first.'; end if;
  if args ? 'civ' then
   kind := nullif(args->>'civ','');
   if kind is not null and (kind='random' or kind !~ '^[a-z0-9-]{1,24}$') then kind := null; end if;
   if kind is not null and exists(select 1 from bored_live.seats where game_id=gid and civ=kind and seat<>s.seat and state<>'left') then
    raise exception 'That civ is taken.';
   end if;
   update bored_live.seats set civ=kind where game_id=gid and seat=s.seat;
  end if;
  if args ? 'ready' then
   if jsonb_typeof(args->'ready')<>'boolean' then raise exception 'Invalid request.'; end if;
   update bored_live.seats set state=case when (args->>'ready')::boolean then 'ready' else 'joined' end where game_id=gid and seat=s.seat;
  end if;
  if args ? 'config' then
   if g.host<>u then raise exception 'Only the host can change the setup.'; end if;
   cfg := bored_live.clean_config(args->'config');
   if cfg is distinct from g.config then
    update bored_live.games set config=cfg, updated_at=now() where id=gid;
    -- Everyone who agreed to the old setup is asked again.
    update bored_live.seats set state='joined' where game_id=gid and state='ready' and seat<>s.seat;
   end if;
  end if;
  update bored_live.games set updated_at=now() where id=gid;
  perform bored_live.touch(gid,u);
  select * into g from bored_live.games where id=gid;
  return bored_live.game_json(g,u);

 elsif action='leave_lobby' then
  if g.status<>'lobby' then raise exception 'This game has already started.'; end if;
  if g.host=u then
   update bored_live.games set status='cancelled', code=null, updated_at=now() where id=gid;
  else
   update bored_live.seats set state='left', civ=null where game_id=gid and seat=s.seat;
   update bored_live.games set updated_at=now() where id=gid;
  end if;
  select * into g from bored_live.games where id=gid;
  return bored_live.game_json(g,u);

 elsif action='start' then
  if g.host<>u then raise exception 'Only the host can start the game.'; end if;
  if g.status<>'lobby' then raise exception 'This game has already started.'; end if;
  if exists(select 1 from bored_live.seats where game_id=gid and state='joined' and seat<>s.seat) then
   raise exception 'Everyone who joined has to be ready.';
  end if;
  cfg := g.config;
  unjoined := coalesce(cfg->>'unjoined','cpu');
  cpus := coalesce((cfg->>'cpus')::integer,0);
  seat_list := '[]'::jsonb; i := 0;
  for s in select * from bored_live.seats where game_id=gid order by seat loop
   if s.state in ('joined','ready') then
    seat_list := seat_list || jsonb_build_array(jsonb_build_object('seat',i,'kind','human','user',s.user_id,
     'handle',(select handle from public.profiles where id=s.user_id),'civ',s.civ,'team',i));
    i := i+1;
   elsif unjoined='cpu' then
    seat_list := seat_list || jsonb_build_array(jsonb_build_object('seat',i,'kind','cpu','user',null,'handle',null,'civ',null,'team',i));
    i := i+1;
   end if;
  end loop;
  -- Human seats nobody took (the room's capacity minus the seats it has) are CPUs as well, or dropped.
  if unjoined='cpu' then
   for n in 1..greatest(g.capacity-(select count(*) from bored_live.seats where game_id=gid),0) loop
    seat_list := seat_list || jsonb_build_array(jsonb_build_object('seat',i,'kind','cpu','user',null,'handle',null,'civ',null,'team',i));
    i := i+1;
   end loop;
  end if;
  for n in 1..cpus loop
   seat_list := seat_list || jsonb_build_array(jsonb_build_object('seat',i,'kind','cpu','user',null,'handle',null,'civ',null,'team',i));
   i := i+1;
  end loop;
  if i>8 then raise exception 'A game has at most 8 civs. Lower the CPUs.'; end if;
  if i<2 then raise exception 'Add a CPU, or wait for a friend to join.'; end if;
  delete from bored_live.seats where game_id=gid;
  for out in select e from jsonb_array_elements(seat_list) e where e->>'kind'='human' loop
   insert into bored_live.seats(game_id,seat,user_id,team,state,civ)
   values(gid,(out->>'seat')::integer,(out->>'user')::uuid,(out->>'team')::integer,'ready',out->>'civ');
  end loop;
  -- The code stops working now. The last one is kept apart, only so a late joiner hears 'already started'.
  update bored_live.games set status='active', started_at=now(), round_at=now(), updated_at=now(), retired_code=code, code=null,
   timer_seconds=coalesce((cfg->>'timer')::integer,0),
   start=jsonb_build_object('seats',seat_list,'options',jsonb_build_object(
    'map',coalesce(cfg->>'map','pangaea'),'size',coalesce(cfg->>'size','auto'),'level',coalesce(cfg->>'level','normal'),
    'borders',coalesce(cfg->>'borders','tech'),'turns',coalesce((cfg->>'turns')::integer,100),
    'wrap',coalesce((cfg->>'wrap')::boolean,false),'conquest',coalesce((cfg->>'conquest')::boolean,true),
    'science',coalesce((cfg->>'science')::boolean,true),'timer',coalesce((cfg->>'timer')::integer,0),
    'seed',(1+floor(random()*2147483646))::bigint))
  where id=gid;
  perform bored_live.touch(gid,u);
  select * into g from bored_live.games where id=gid;
  return bored_live.game_json(g,u);

 elsif action='send' then
  if g.status<>'active' then raise exception 'This game is not running.'; end if;
  if coalesce(args->>'request_id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid request.'; end if;
  rid := (args->>'request_id')::uuid;
  perform bored_live.touch(gid,u);
  -- A retry of an action that already landed answers with the same number, and never counts against the limit.
  select * into a from bored_live.actions where game_id=gid and request_id=rid;
  if found then
   if a.seat<>s.seat then raise exception 'Invalid request.'; end if;
   return jsonb_build_object('seq',a.seq,'duplicate',true,'head',g.head);
  end if;
  perform bored_together.rate_limit(u,'live-send',60,300);
  kind := args->>'type';
  if kind is null or kind !~ '^[a-z][a-z0-9-]{0,31}$' then raise exception 'Invalid action.'; end if;
  payload := coalesce(args->'args','{}'::jsonb);
  if jsonb_typeof(payload)<>'object' or octet_length(payload::text)>8000 then raise exception 'Invalid action.'; end if;
  if kind='human-returns' then
   if s.controller<>'cpu' then return jsonb_build_object('seq',g.head,'duplicate',true,'head',g.head,'noop',true); end if;
   update bored_live.seats set controller='human' where game_id=gid and seat=s.seat;
   payload := '{}'::jsonb;
  elsif s.controller='cpu' then
   raise exception 'A CPU is playing your civ. Rejoin the game first.';
  elsif kind='cpu-takes-over' then
   if coalesce(payload->>'seat','') !~ '^[0-7]$' then raise exception 'Invalid action.'; end if;
   target := (payload->>'seat')::integer;
   if not exists(select 1 from bored_live.seats where game_id=gid and seat=target) then raise exception 'Invalid action.'; end if;
   if exists(select 1 from bored_live.seats where game_id=gid and seat=target and controller='cpu') then
    -- Somebody else already did it: there is only ever one takeover per seat until they come back.
    select * into a from bored_live.actions x where x.game_id=gid and x.type='cpu-takes-over' and (x.args->>'seat')::integer=target order by x.seq desc limit 1;
    return jsonb_build_object('seq',coalesce(a.seq,g.head),'duplicate',true,'head',g.head);
   end if;
   if target<>s.seat then
    -- Others can step in only for someone who has been silent for 60 seconds while they themselves were here.
    if not exists(select 1 from bored_live.presence pr join bored_live.seats t on t.user_id=pr.user_id and t.game_id=pr.game_id
                  where pr.game_id=gid and t.seat=target and pr.seen_at<=now()-interval '60 seconds')
       and exists(select 1 from bored_live.presence pr join bored_live.seats t on t.user_id=pr.user_id and t.game_id=pr.game_id
                  where pr.game_id=gid and t.seat=target) then
     raise exception 'They are still here.';
    end if;
    if g.started_at>now()-interval '60 seconds' then raise exception 'They are still here.'; end if;
    if not exists(select 1 from bored_live.presence where game_id=gid and user_id=u and joined_at<=now()-interval '60 seconds') then
     raise exception 'They are still here.';
    end if;
    payload := jsonb_build_object('seat',target,'reason','away');
   else
    payload := jsonb_build_object('seat',target,'reason','left');
   end if;
   update bored_live.seats set controller='cpu' where game_id=gid and seat=target;
  elsif kind='timeout' then
   if g.timer_seconds=0 then raise exception 'This game has no turn timer.'; end if;
   if coalesce(payload->>'round','') !~ '^[0-9]{1,4}$' then raise exception 'Invalid action.'; end if;
   round_now := (payload->>'round')::integer;
   if round_now<>g.round then raise exception 'That round is over.'; end if;
   if g.timeout_round=round_now then
    select * into a from bored_live.actions x where x.game_id=gid and x.type='timeout' and (x.args->>'round')::integer=round_now order by x.seq desc limit 1;
    return jsonb_build_object('seq',coalesce(a.seq,g.head),'duplicate',true,'head',g.head);
   end if;
   -- A little slack for clock rounding, none for sending it early.
   if now()<g.round_at+make_interval(secs=>g.timer_seconds)-interval '2 seconds' then raise exception 'The timer has not run out.'; end if;
   update bored_live.games set timeout_round=round_now where id=gid;
   payload := jsonb_build_object('round',round_now);
  end if;
  insert into bored_live.actions(game_id,seq,seat,type,args,request_id) values(gid,g.head+1,s.seat,kind,payload,rid);
  update bored_live.games set head=g.head+1, updated_at=now() where id=gid;
  if kind='cpu-takes-over' then perform bored_live.settle_finish(gid); end if;
  return jsonb_build_object('seq',g.head+1,'duplicate',false,'head',g.head+1);

 elsif action in ('sync','heartbeat') then
  perform bored_live.touch(gid,u);
  after_seq := coalesce((args->>'after')::integer,0);
  lim := case when action='heartbeat' then 0 else least(greatest(coalesce((args->>'limit')::integer,500),1),1000) end;
  if after_seq<0 then raise exception 'Invalid request.'; end if;
  select coalesce(jsonb_agg(bored_live.action_json(x) order by x.seq),'[]'::jsonb) into rows
   from (select * from bored_live.actions where game_id=gid and seq>after_seq order by seq limit lim) x;
  return jsonb_build_object('id',gid,'status',g.status,'head',g.head,'round',g.round,
   'round_age',case when g.round_at is null then null else floor(extract(epoch from now()-g.round_at))::integer end,
   'timer',g.timer_seconds,'winner',g.winner,'actions',rows,
   'seats',(select coalesce(jsonb_agg(jsonb_build_object('seat',q.seat,'controller',q.controller,
      'online',coalesce(pr.seen_at>now()-interval '25 seconds',false),
      'away',case when pr.seen_at is null then null else floor(extract(epoch from now()-pr.seen_at))::integer end) order by q.seat),'[]'::jsonb)
     from bored_live.seats q left join bored_live.presence pr on pr.game_id=q.game_id and pr.user_id=q.user_id where q.game_id=gid));

 elsif action='snapshot' then
  if g.status<>'active' then return jsonb_build_object('stored',false); end if;
  if coalesce(args->>'round','') !~ '^[0-9]{1,4}$' or coalesce(args->>'seq','') !~ '^[0-9]{1,9}$' or coalesce(args->>'hash','') !~ '^[0-9a-f]{8,64}$'
     or jsonb_typeof(args->'state')<>'object' then raise exception 'Invalid snapshot.'; end if;
  r := (args->>'round')::integer;
  if (args->>'seq')::integer>g.head or r<1 then raise exception 'Invalid snapshot.'; end if;
  -- With more than one human playing, a snapshot is kept only once another seat has reported the same hash for
  -- that round, so one client cannot park a state the others do not hold. The sender may be early: it is told
  -- to ask again. A CPU-run seat always needs the confirmation; with a single human seat there is nobody to ask.
  seated := (select count(*) from bored_live.seats where game_id=gid and state<>'left' and controller='human');
  if (seated>1 or s.controller<>'human')
     and not exists(select 1 from bored_live.hashes x where x.game_id=gid and x.round=r and x.seat<>s.seat and x.hash=args->>'hash') then
   return jsonb_build_object('stored',false,'wait',true);
  end if;
  insert into bored_live.snapshots(game_id,round,seq,state,hash,seat) values(gid,r,(args->>'seq')::integer,args->'state',args->>'hash',s.seat)
  on conflict(game_id,round) do nothing;
  get diagnostics n = row_count;
  delete from bored_live.snapshots where game_id=gid and round<(select max(round) from bored_live.snapshots where game_id=gid)-2;
  perform bored_live.touch(gid,u);
  return jsonb_build_object('stored',n=1);

 elsif action='load' then
  -- The newest snapshot with its state, for a player who is joining or coming back. The actions after it
  -- come from 'sync' with after = snapshot.seq.
  perform bored_live.touch(gid,u);
  return jsonb_build_object('snapshot',(select jsonb_build_object('round',x.round,'seq',x.seq,'hash',x.hash,'state',x.state)
   from bored_live.snapshots x where x.game_id=gid order by x.round desc limit 1));

 elsif action='report' then
  if g.status<>'active' then return jsonb_build_object('ok',true,'desync',false); end if;
  if coalesce(args->>'round','') !~ '^[0-9]{1,4}$' or coalesce(args->>'hash','') !~ '^[0-9a-f]{8,64}$' then raise exception 'Invalid request.'; end if;
  r := (args->>'round')::integer; h := args->>'hash';
  -- Only the round under way or the one that is about to start. Anything else moves nothing.
  if r<>g.round and r<>g.round+1 then raise exception 'Invalid request.'; end if;
  insert into bored_live.hashes(game_id,round,seat,hash) values(gid,r,s.seat,h) on conflict(game_id,round,seat) do nothing;
  select hash into other from bored_live.hashes where game_id=gid and round=r and seat<>s.seat order by at limit 1;
  -- A hash is taken at the start of a round. The first one for a round is the server's cue that the round began now.
  if r>g.round then update bored_live.games set round=r, round_at=now(), updated_at=now() where id=gid; end if;
  perform bored_live.touch(gid,u);
  if other is not null and other<>h then
   insert into bored_live.desyncs(game_id,round,seat,expected,got) values(gid,r,s.seat,other,h);
   return jsonb_build_object('ok',true,'desync',true);
  end if;
  return jsonb_build_object('ok',true,'desync',false);

 elsif action='finish' then
  if g.status='active' and s.controller='human' then
   later := case when coalesce(args->>'winner','') ~ '^[0-7]$' then (args->>'winner')::integer else null end;
   -- Every screen sends the ending it computed. A claim names a seat that is in the game; anything else is ignored.
   -- The game is over once two different humans who are still seated agree on the winner, or, with only one human
   -- still seated as human, once that one says so. A lone claim waits (and counts again if the other human leaves).
   if later is not null and later<jsonb_array_length(g.start->'seats') then
    insert into bored_live.finish_claims(game_id,seat,winner,why) values(gid,s.seat,later,left(coalesce(args->>'why',''),120))
    on conflict(game_id,seat) do update set winner=excluded.winner, why=excluded.why, at=now();
    perform bored_live.settle_finish(gid);
    select * into g from bored_live.games where id=gid;
   end if;
  end if;
  return bored_live.game_json(g,u);
 end if;
 raise exception 'Unknown operation.';
end $$;

revoke all on function bored_live.api(text,jsonb) from public,anon;
grant execute on function bored_live.api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
