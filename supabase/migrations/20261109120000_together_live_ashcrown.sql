-- Bored Together, live games (Civ Lite 5.0).
--
-- A live game is a room (bored_live.games) with a seat per human, and one ordered
-- log of actions (bored_live.actions). The server never simulates the game: it
-- appends each action under the room's row lock with the next sequence number, so
-- numbers are gap-free and every client reads the same order, and it keeps the
-- small amount of bookkeeping that needs a shared clock (presence, the round
-- timer, one takeover per seat, snapshots, hash reports).
--
-- Everything is private, in its own schema. The one exception to "no direct table
-- grants" is SELECT on bored_live.actions, gated by RLS to the seated players,
-- because Supabase Realtime's postgres_changes reads the table as the subscriber.
-- public.bt_live_rpc is the only entry point. The existing bored_together tables
-- and RPCs are not touched.

create schema if not exists bored_live;
revoke all on schema bored_live from public, anon, authenticated;
alter default privileges in schema bored_live revoke execute on functions from public;

create table bored_live.games (
 id uuid primary key default gen_random_uuid(),
 game text not null check (game in ('ashcrown')),
 host uuid not null references auth.users(id) on delete cascade,
 status text not null default 'lobby' check (status in ('lobby','active','completed','cancelled')),
 config jsonb not null default '{}'::jsonb,
 start jsonb,
 timer_seconds integer not null default 0 check (timer_seconds in (0,60,120,300)),
 head integer not null default 0,
 round integer not null default 1,
 round_at timestamptz,
 timeout_round integer not null default 0,
 winner integer,
 over_reason text,
 created_at timestamptz not null default now(),
 started_at timestamptz,
 updated_at timestamptz not null default now()
);
create index live_games_host on bored_live.games(host);

-- One row per human. `team` is stored from the start (team = seat in 5.0) so a
-- later co-op mode can group seats without changing the format. CPUs have no row;
-- they exist only in games.start.
create table bored_live.seats (
 game_id uuid not null references bored_live.games(id) on delete cascade,
 seat integer not null check (seat between 0 and 7),
 user_id uuid not null references auth.users(id) on delete cascade,
 team integer not null,
 state text not null default 'invited' check (state in ('invited','joined','ready','left')),
 civ text,
 controller text not null default 'human' check (controller in ('human','cpu')),
 primary key (game_id, seat),
 unique (game_id, user_id)
);
create index live_seats_user on bored_live.seats(user_id);

create table bored_live.actions (
 game_id uuid not null references bored_live.games(id) on delete cascade,
 seq integer not null check (seq >= 1),
 seat integer not null,
 type text not null check (type ~ '^[a-z][a-z0-9-]{0,31}$'),
 args jsonb not null default '{}'::jsonb,
 request_id uuid not null,
 at timestamptz not null default now(),
 primary key (game_id, seq),
 unique (game_id, request_id)
);

create table bored_live.snapshots (
 game_id uuid not null references bored_live.games(id) on delete cascade,
 round integer not null,
 seq integer not null,
 state jsonb not null,
 hash text not null,
 seat integer not null,
 at timestamptz not null default now(),
 primary key (game_id, round)
);

create table bored_live.hashes (
 game_id uuid not null references bored_live.games(id) on delete cascade,
 round integer not null,
 seat integer not null,
 hash text not null,
 at timestamptz not null default now(),
 primary key (game_id, round, seat)
);

create table bored_live.desyncs (
 id bigserial primary key,
 game_id uuid not null references bored_live.games(id) on delete cascade,
 round integer not null,
 seat integer not null,
 expected text not null,
 got text not null,
 at timestamptz not null default now()
);

create table bored_live.presence (
 game_id uuid not null references bored_live.games(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 seen_at timestamptz not null default now(),
 joined_at timestamptz not null default now(),
 primary key (game_id, user_id)
);

do $$ declare t text; begin
 foreach t in array array['games','seats','actions','snapshots','hashes','desyncs','presence'] loop
  execute format('alter table bored_live.%I enable row level security',t);
  execute format('revoke all on bored_live.%I from public,anon,authenticated',t);
 end loop;
end $$;
revoke all on all sequences in schema bored_live from public,anon,authenticated;

-- Who may read a game's actions through Realtime.
create function bored_live.is_seated(gid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from bored_live.seats where game_id=gid and user_id=auth.uid() and state<>'left');
$$;
create policy live_actions_seated_read on bored_live.actions for select to authenticated using (bored_live.is_seated(game_id));

/* ── helpers ─────────────────────────────────────────────────────────────── */

-- Keep only the setup keys the game knows, each in range. Anything else is an error,
-- so a bad client cannot park arbitrary JSON in a room.
create function bored_live.clean_config(cfg jsonb) returns jsonb
language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; out jsonb := '{}'::jsonb;
begin
 if cfg is null then return out; end if;
 if jsonb_typeof(cfg)<>'object' or octet_length(cfg::text)>1000 then raise exception 'Invalid setup.'; end if;
 for k,v in select * from jsonb_each(cfg) loop
  if k in ('map','size','level') then
   if jsonb_typeof(v)<>'string' or v #>> '{}' !~ '^[a-z0-9-]{1,24}$' then raise exception 'Invalid setup.'; end if;
  elsif k='borders' then
   if v #>> '{}' not in ('tech','never') then raise exception 'Invalid setup.'; end if;
  elsif k='unjoined' then
   if v #>> '{}' not in ('cpu','drop') then raise exception 'Invalid setup.'; end if;
  elsif k='turns' then
   if jsonb_typeof(v)<>'number' or v #>> '{}' !~ '^[0-9]{1,3}$' or (v #>> '{}')::integer>500 then raise exception 'Invalid setup.'; end if;
  elsif k='cpus' then
   if jsonb_typeof(v)<>'number' or v #>> '{}' !~ '^[0-7]$' then raise exception 'Invalid setup.'; end if;
  elsif k='timer' then
   if jsonb_typeof(v)<>'number' or v #>> '{}' not in ('0','60','120','300') then raise exception 'Invalid setup.'; end if;
  elsif k in ('wrap','conquest','science') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid setup.'; end if;
  else
   raise exception 'Invalid setup.';
  end if;
  out := out || jsonb_build_object(k,v);
 end loop;
 return out;
end $$;

-- A player is here if the server heard from them in the last 25 seconds.
create function bored_live.touch(gid uuid, u uuid) returns void
language sql set search_path='' as $$
 insert into bored_live.presence(game_id,user_id) values(gid,u)
 on conflict(game_id,user_id) do update set seen_at=now(),
  joined_at=case when bored_live.presence.seen_at < now()-interval '25 seconds' then now() else bored_live.presence.joined_at end;
$$;

create function bored_live.seats_json(gid uuid) returns jsonb
language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
  'seat',s.seat,'user',s.user_id,'handle',p.handle,'team',s.team,'state',s.state,'civ',s.civ,'controller',s.controller,
  'online',coalesce(pr.seen_at>now()-interval '25 seconds',false),
  'away',case when pr.seen_at is null then null else floor(extract(epoch from now()-pr.seen_at))::integer end
 ) order by s.seat),'[]'::jsonb)
 from bored_live.seats s
 left join public.profiles p on p.id=s.user_id
 left join bored_live.presence pr on pr.game_id=s.game_id and pr.user_id=s.user_id
 where s.game_id=gid;
$$;

create function bored_live.game_json(g bored_live.games, viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',g.id,'game',g.game,'host',g.host,'status',g.status,'config',g.config,'start',g.start,
  'timer',g.timer_seconds,'head',g.head,'round',g.round,
  'round_age',case when g.round_at is null then null else floor(extract(epoch from now()-g.round_at))::integer end,
  'winner',g.winner,'over_reason',g.over_reason,'created_at',g.created_at,'started_at',g.started_at,
  'me',(select seat from bored_live.seats where game_id=g.id and user_id=viewer),
  'seats',bored_live.seats_json(g.id),
  'snapshot',(select jsonb_build_object('round',round,'seq',seq,'hash',hash) from bored_live.snapshots where game_id=g.id order by round desc limit 1));
$$;

create function bored_live.action_json(a bored_live.actions) returns jsonb
language sql immutable set search_path='' as $$
 select jsonb_build_object('seq',a.seq,'seat',a.seat,'type',a.type,'args',a.args);
$$;

/* ── the dispatcher ──────────────────────────────────────────────────────── */

create function bored_live.api(action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid();
 gid uuid; g bored_live.games; s bored_live.seats; a bored_live.actions; rid uuid;
 payload jsonb; kind text; target integer; cfg jsonb; out jsonb; n integer; r integer;
 invitees jsonb; who uuid; i integer; seat_list jsonb; humans integer; cpus integer; total integer; unjoined text;
 later integer; after_seq integer; lim integer; rows jsonb; h text; other text; round_now integer;
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
 if action not in ('create','list','game','join','lobby_set','leave_lobby','start','send','sync','heartbeat','snapshot','load','report','finish') then
  raise exception 'Unknown operation.';
 end if;

 if action in ('create','list') then
  perform bored_together.rate_limit(u,'live',60,900);
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
  if jsonb_typeof(invitees) is distinct from 'array' or jsonb_array_length(invitees) not between 1 and 3 then
   raise exception 'Invite one to three members.';
  end if;
  if (select count(*) from bored_live.games where host=u and status in ('lobby','active'))>=5 then
   raise exception 'You have too many live games open. Finish or cancel one first.';
  end if;
  cfg := bored_live.clean_config(args->'config');
  insert into bored_live.games(game,host,config) values('ashcrown',u,cfg) returning * into g;
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
  perform bored_live.touch(g.id,u);
  select * into g from bored_live.games where id=g.id;
  return bored_live.game_json(g,u);

 elsif action='list' then
  return coalesce((select jsonb_agg(bored_live.game_json(x,u) order by x.updated_at desc) from (
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
   update bored_live.games set status='cancelled', updated_at=now() where id=gid;
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
  update bored_live.games set status='active', started_at=now(), round_at=now(), updated_at=now(),
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
  if g.status='active' then
   later := case when coalesce(args->>'winner','') ~ '^[0-7]$' then (args->>'winner')::integer else null end;
   update bored_live.games set status='completed', winner=later, over_reason=left(coalesce(args->>'why',''),120), updated_at=now() where id=gid;
   select * into g from bored_live.games where id=gid;
  end if;
  return bored_live.game_json(g,u);
 end if;
 raise exception 'Unknown operation.';
end $$;

-- Old rooms go: lobbies nobody started, finished games after two weeks, and
-- rooms nobody has touched for two weeks.
create function bored_live.cleanup() returns void language plpgsql set search_path='' as $$
begin
 delete from bored_live.games where status in ('lobby','cancelled') and updated_at<now()-interval '2 days';
 delete from bored_live.games where status='completed' and updated_at<now()-interval '14 days';
 delete from bored_live.games where status='active' and updated_at<now()-interval '14 days';
end $$;

revoke all on all functions in schema bored_live from public,anon,authenticated;
grant usage on schema bored_live to authenticated;
grant execute on function bored_live.api(text,jsonb) to authenticated;
grant execute on function bored_live.is_seated(uuid) to authenticated;
grant select on bored_live.actions to authenticated;

create function public.bt_live_rpc(action text,args jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select bored_live.api(action,args); $$;
revoke all on function public.bt_live_rpc(text,jsonb) from public,anon;
grant execute on function public.bt_live_rpc(text,jsonb) to authenticated;

-- Realtime pushes new actions to the seated players. Where Realtime is absent
-- (a bare Postgres), the clients poll once a second and nothing here is needed.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table bored_live.actions;
 end if;
exception when duplicate_object then null;
end $$;

do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('bored-live-retention','23 4 * * *','select bored_live.cleanup()');
 end if;
end $$;
notify pgrst,'reload schema';
