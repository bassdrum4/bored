-- Bored Together, live co-op (Civ Lite 5.1).
--
-- Two small additions to the live-game schema from 5.0. Neither one touches
-- bored_live.api, so this file can be applied before or after any other change
-- to that function (for example the later server checks), in either order.
--
--  1. The room setup accepts one more key, mode: 'ffa' (the default) or 'coop'
--     (every human on one team against the CPUs). Only clean_config changes; the
--     game is told the mode through the room's config, which the server already
--     returns and freezes at start.
--  2. Map pings, for co-op rooms: a teammate marks a hex and the others see it for
--     a few seconds. A ping is not a game action. It never enters the action log or
--     the hash, so it cannot change a game or desync one; it lives in its own small
--     table, is pushed over Realtime like the log, and is read by polling where
--     there is no Realtime. bt_live_rpc keeps its signature; it hands the two new
--     operations ('ping' and 'pings') to bored_live.ping_api and everything else to
--     bored_live.api, exactly as before.
--
-- Nothing here changes an existing table, grant or policy, and an older client
-- that never sends mode or a ping notices nothing.

-- The setup keys the game knows: 5.0's list plus mode.
create or replace function bored_live.clean_config(cfg jsonb) returns jsonb
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
  elsif k='mode' then
   if jsonb_typeof(v)<>'string' or v #>> '{}' not in ('ffa','coop') then raise exception 'Invalid setup.'; end if;
  elsif k in ('wrap','conquest','science') then
   if jsonb_typeof(v)<>'boolean' then raise exception 'Invalid setup.'; end if;
  else
   raise exception 'Invalid setup.';
  end if;
  out := out || jsonb_build_object(k,v);
 end loop;
 return out;
end $$;

create table bored_live.pings (
 id bigint generated always as identity primary key,
 game_id uuid not null references bored_live.games(id) on delete cascade,
 seat integer not null check (seat between 0 and 7),
 x integer not null check (x between 0 and 255),
 y integer not null check (y between 0 and 255),
 at timestamptz not null default now()
);
create index live_pings_game on bored_live.pings(game_id, id);
create index live_pings_age on bored_live.pings(at);
alter table bored_live.pings enable row level security;
revoke all on bored_live.pings from public,anon,authenticated;
revoke all on all sequences in schema bored_live from public,anon,authenticated;
-- Seated players read their room's pings, which is what Realtime does as the subscriber.
create policy live_pings_seated_read on bored_live.pings for select to authenticated using (bored_live.is_seated(game_id));
grant select on bored_live.pings to authenticated;

-- ping: mark a hex for the room. pings: the ones after an id, for a client without Realtime.
-- No row lock on the game: a ping must never wait behind the action log, and it changes nothing the log depends on.
create function bored_live.ping_api(action text, args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid := auth.uid();
 gid uuid; g bored_live.games; s bored_live.seats; px integer; py integer; after_id bigint; rid bigint; rows jsonb;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if args is null or jsonb_typeof(args)<>'object' or octet_length(args::text)>2000 then raise exception 'Invalid request.'; end if;
 if not exists(select 1 from bored_together.members where user_id=u and active) then
  raise exception 'Join Bored Together first.' using errcode='42501';
 end if;
 if action not in ('ping','pings') then raise exception 'Unknown operation.'; end if;
 if coalesce(args->>'id','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Invalid request.'; end if;
 gid := (args->>'id')::uuid;
 select * into g from bored_live.games where id=gid;
 if not found then raise exception 'That live game was not found.'; end if;
 select * into s from bored_live.seats where game_id=gid and user_id=u;
 if not found or s.state='left' then raise exception 'You are not in this game.' using errcode='42501'; end if;
 if g.status<>'active' then raise exception 'This game is not running.'; end if;
 if coalesce(g.config->>'mode','ffa')<>'coop' then raise exception 'Pings are for co-op games.'; end if;

 if action='ping' then
  perform bored_together.rate_limit(u,'live-ping',10,8);
  if coalesce(jsonb_typeof(args->'x'),'')<>'number' or coalesce(jsonb_typeof(args->'y'),'')<>'number'
     or args->>'x' !~ '^[0-9]{1,3}$' or args->>'y' !~ '^[0-9]{1,3}$' then raise exception 'Invalid request.'; end if;
  px := (args->>'x')::integer; py := (args->>'y')::integer;
  if px>255 or py>255 then raise exception 'Invalid request.'; end if;
  -- Old pings go as new ones come: a minute is far longer than anyone looks at one.
  delete from bored_live.pings where game_id=gid and at<now()-interval '1 minute';
  insert into bored_live.pings(game_id,seat,x,y) values(gid,s.seat,px,py) returning id into rid;
  return jsonb_build_object('id',rid);
 end if;

 perform bored_together.rate_limit(u,'live-pings',60,120);
 if args ? 'after' then
  if coalesce(jsonb_typeof(args->'after'),'')<>'number' or args->>'after' !~ '^[0-9]{1,15}$' then raise exception 'Invalid request.'; end if;
  after_id := (args->>'after')::bigint;
 else
  after_id := 0;
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'seat',p.seat,'x',p.x,'y',p.y) order by p.id),'[]'::jsonb) into rows
 from (select * from bored_live.pings where game_id=gid and id>after_id and at>now()-interval '15 seconds' order by id limit 20) p;
 return jsonb_build_object('pings',rows,'head',coalesce((select max(id) from bored_live.pings where game_id=gid),0));
end $$;
revoke all on function bored_live.ping_api(text,jsonb) from public,anon,authenticated;
grant execute on function bored_live.ping_api(text,jsonb) to authenticated;

-- The same entry point and signature as before, with two more operations behind it.
create or replace function public.bt_live_rpc(action text,args jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$
 select case when action in ('ping','pings') then bored_live.ping_api(action,args) else bored_live.api(action,args) end;
$$;
revoke all on function public.bt_live_rpc(text,jsonb) from public,anon;
grant execute on function public.bt_live_rpc(text,jsonb) to authenticated;

do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  alter publication supabase_realtime add table bored_live.pings;
 end if;
exception when duplicate_object then null;
end $$;

notify pgrst,'reload schema';
