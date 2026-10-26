-- Bored Together v5: Pastel Tanks.
--
-- Tanks is a turn-based artillery duel that already existed as a hot-seat game.
-- A match stores a seed (which picks one of five hand-shaped maps) and the shots
-- that were fired; both players replay those through src/games/tank-engine.js, so
-- the board, hit points and winner are recomputed on each side rather than
-- reported. This migration only teaches the dispatcher to accept the game and to
-- bound what a shot may contain: the referee does not simulate the shell.
begin;

alter table bored_together.matches drop constraint if exists matches_game_check;
alter table bored_together.matches add constraint matches_game_check
 check(game in ('connect-four','8ball','2048','mahjong','tank2'));
alter table bored_together.queue drop constraint if exists queue_game_check;
alter table bored_together.queue add constraint queue_game_check
 check(game in ('connect-four','8ball','2048','mahjong','tank2'));

create or replace function bored_together.initial_state(game_id text,rules integer) returns jsonb
language plpgsql volatile set search_path='' as $$
begin
 if game_id='connect-four' and rules=1 then return jsonb_build_object('board',to_jsonb(array_fill(0,array[42]))); end if;
 if game_id='8ball' and rules=1 then return '{"balls":[{"id":0,"x":52.8,"y":55},{"id":1,"x":158.4,"y":55},{"id":2,"x":163.707,"y":51.9195},{"id":15,"x":163.707,"y":58.0805},{"id":9,"x":169.014,"y":48.839},{"id":8,"x":169.014,"y":55},{"id":3,"x":169.014,"y":61.161},{"id":11,"x":174.321,"y":45.7585},{"id":4,"x":174.321,"y":51.9195},{"id":12,"x":174.321,"y":58.0805},{"id":5,"x":174.321,"y":64.2415},{"id":10,"x":179.62800000000001,"y":42.678},{"id":13,"x":179.62800000000001,"y":48.839},{"id":6,"x":179.62800000000001,"y":55},{"id":14,"x":179.62800000000001,"y":61.161},{"id":7,"x":179.62800000000001,"y":67.322}],"groups":[null,null],"breakShot":true,"ballInHand":false,"shotCount":0,"lastShot":null}'::jsonb; end if;
 if game_id='tank2' and rules=1 then
  -- The seed is the whole battlefield: five hand-shaped maps plus a phase. It is
  -- chosen once here so both players and every reload see the same ground.
  return jsonb_build_object('seed',(1+floor(random()*2147483646))::bigint,'shots','[]'::jsonb,'turn',1,'winner',null);
 end if;
 raise exception 'Rules version unavailable.';
end $$;

create or replace function bored_together.apply_move(game_id text,rules integer,state jsonb,payload jsonb,seat integer) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if game_id='connect-four' and rules=1 then
  if jsonb_typeof(payload)<>'object' or payload-'column'<>'{}'::jsonb or coalesce(payload->>'column','') !~ '^[0-6]$' then raise exception 'Invalid move.'; end if;
  return bored_together.connect_four(state,(payload->>'column')::integer,seat);
 end if;
 if game_id='8ball' then raise exception 'Use the verified pool shot endpoint.'; end if;
 if game_id='tank2' and rules=1 then
  if jsonb_typeof(payload)<>'object' then raise exception 'Invalid shot.'; end if;
  if jsonb_typeof(state->'shots') is distinct from 'array' then raise exception 'Invalid shot.'; end if;
  if jsonb_array_length(state->'shots')>=200 then raise exception 'This game has run its course.'; end if;
  if state ? 'winner' and jsonb_typeof(state->'winner')<>'null' then raise exception 'This game is over.'; end if;
  if coalesce(payload->>'seat','') !~ '^[12]$' or (payload->>'seat')::integer is distinct from seat then raise exception 'Invalid shot.'; end if;
  if coalesce(payload->>'x','') !~ '^[0-9]{1,3}$' or (payload->>'x')::integer<20 or (payload->>'x')::integer>940 then raise exception 'That is off the field.'; end if;
  if coalesce(payload->>'angle','') !~ '^[0-9]{1,2}$' or (payload->>'angle')::integer<5 or (payload->>'angle')::integer>85 then raise exception 'Aim between 5 and 85 degrees.'; end if;
  if coalesce(payload->>'power','') !~ '^[0-9]+(\.[0-9]+)?$' or (payload->>'power')::numeric<1 or (payload->>'power')::numeric>20 then raise exception 'Power is between 1 and 20.'; end if;
  if payload->>'weapon' not in ('standard','heavy','cluster','nuke') then raise exception 'Unknown weapon.'; end if;
  -- The shot is the only thing stored. Hit points and the winner are recomputed
  -- from this list by both clients, so a claimed kill the shots do not support is
  -- visible to the other player instead of being trusted here.
  return jsonb_build_object('state',jsonb_build_object(
    'seed',state->'seed',
    'shots',(state->'shots')||jsonb_build_array(jsonb_build_object('seat',seat,'x',(payload->>'x')::integer,
      'angle',(payload->>'angle')::integer,'power',round((payload->>'power')::numeric,1),'weapon',payload->>'weapon')),
    'turn',case when seat=1 then 2 else 1 end,
    'winner',case when coalesce(payload->>'won','false')='true' then seat else null end),
   'won',coalesce(payload->>'won','false')='true','reason','Last tank standing');
 end if;
 raise exception 'Rules version unavailable.';
end $$;

create or replace function bored_together.api(action text,args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid; mid uuid; m bored_together.matches;
 member bored_together.members; result jsonb; other uuid; game_id text:=coalesce(args->>'game','connect-four');
 previous bored_together.moves; transition jsonb; rid uuid; payload jsonb; expected integer;
 value integer; seat integer; other_seat integer; mine integer; theirs integer; new_state jsonb;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if args is null or jsonb_typeof(args)<>'object' or octet_length(args::text)>4096 then raise exception 'Invalid request.'; end if;
 perform pg_advisory_xact_lock(210425,1);
 perform bored_together.rate_limit(u,'rpc',60,180);
 select * into member from bored_together.members where user_id=u;
 if action='dashboard' and not coalesce(member.active,false) then return jsonb_build_object('enrolled',false); end if;
 if action='enroll' then
  if args->>'consent_version' is distinct from '2026-10-26-v3' then raise exception 'Please review the enrollment notice.'; end if;
  if not exists(select 1 from public.profiles where id=u) then raise exception 'Choose your Bored display name first.'; end if;
  insert into bored_together.members(user_id,consent_version) values(u,'2026-10-26-v3')
  on conflict(user_id) do update set active=true,consent_version=excluded.consent_version,consent_at=now(),left_at=null;
  return jsonb_build_object('enrolled',true);
 end if;
 if not coalesce(member.active,false) then raise exception 'Join Bored Together first.' using errcode='42501'; end if;
 if action='dashboard' and member.consent_version is distinct from '2026-10-26-v3' then
  return jsonb_build_object('enrolled',false,'renew',true);
 end if;
 if action='leave' then
  update bored_together.members set active=false,left_at=now() where user_id=u;
  delete from bored_together.queue where user_id=u;
  delete from bored_together.matches where u in(p1,p2) and revealed_at is null and status='active';
  for m in select * from bored_together.matches where u in(p1,p2) and status='active' for update loop
   perform bored_together.finish(m.id,case when m.p1=u then m.p2 else m.p1 end,'Opponent left Bored Together');
  end loop;
  return jsonb_build_object('enrolled',false);
 elsif action='people' then
  perform bored_together.rate_limit(u,'people-minute',60,30);
  perform bored_together.rate_limit(u,'people-day',86400,2880);
  select coalesce(jsonb_agg(jsonb_build_object('id',x.user_id,'handle',x.handle,'email',x.email) order by lower(x.handle),x.user_id),'[]')
  into result from (
   select mm.user_id,p.handle,au.email from bored_together.members mm
   join public.profiles p on p.id=mm.user_id join auth.users au on au.id=mm.user_id
   where mm.active and mm.user_id<>u and not bored_together.blocked(u,mm.user_id)
   order by lower(p.handle),mm.user_id limit 200
  ) x;
  return result;
 elsif action in ('block','unblock') then
  target:=(args->>'user_id')::uuid;
  if target is null or target=u then raise exception 'Choose another player.'; end if;
  if action='unblock' then
   delete from bored_together.blocks where blocker=u and blocked=target;
   return jsonb_build_object('ok',true);
  end if;
  if not exists(select 1 from bored_together.members where user_id=target) then raise exception 'Player unavailable.'; end if;
  insert into bored_together.blocks(blocker,blocked) values(u,target) on conflict do nothing;
  update bored_together.matches set status='cancelled',turn_user=null,reason='Pair unavailable',updated_at=now(),version=version+1
  where ((p1=u and p2=target) or (p1=target and p2=u)) and status='active';
  return jsonb_build_object('ok',true);
 elsif action='challenge' then
  target:=(args->>'user_id')::uuid;
  if target is null or target=u then raise exception 'Choose another player.'; end if;
  if not exists(select 1 from bored_together.members where user_id=target and active) or bored_together.blocked(u,target) then raise exception 'Player unavailable.'; end if;
  perform bored_together.rate_limit(u,'social',3600,30);
  if game_id not in ('connect-four','8ball','2048','mahjong','tank2') then raise exception 'Game unavailable.'; end if;
  select * into m from bored_together.matches x where x.game=game_id and x.status='active'
  and ((x.p1=u and x.p2=target) or (x.p2=u and x.p1=target)) for update;
  if m.id is not null then
   raise exception 'You already have a % game with %. Finish that one first.',
   case game_id when '8ball' then 'Pool' when '2048' then '2048' when 'mahjong' then 'Mahjong' when 'tank2' then 'Pastel Tanks' else 'Connect Four' end,
   coalesce((select handle from public.profiles where id=target),'that player');
  end if;
  new_state:=case when bored_together.game_mode(game_id)='duel' then bored_together.duel_state()
   else bored_together.initial_state(game_id,1) end;
  insert into bored_together.matches(game,mode,p1,p2,source,status,turn_user,revealed_at,state)
  values(game_id,bored_together.game_mode(game_id),u,target,'challenge','active',u,null,new_state) returning * into m;
  return bored_together.match_json(m,u);
 elsif action in ('queue_join','queue_cancel') then
  if game_id not in ('connect-four','8ball','2048','mahjong','tank2') then raise exception 'Game unavailable.'; end if;
  if action='queue_cancel' then delete from bored_together.queue where user_id=u and game=game_id;
  else
   delete from bored_together.queue where created_at<now()-interval '7 days';
   select q.user_id into other from bored_together.queue q join bored_together.members mm on mm.user_id=q.user_id
   where q.game=game_id and q.user_id<>u and mm.active and not bored_together.blocked(u,q.user_id)
   and not exists(select 1 from bored_together.matches x where x.game=game_id and x.status='active'
     and ((x.p1=u and x.p2=q.user_id) or (x.p2=u and x.p1=q.user_id)))
   order by q.created_at,q.user_id limit 1 for update of q;
   if other is null then
    insert into bored_together.queue(user_id,game) values(u,game_id) on conflict do nothing;
    return jsonb_build_object('queued',true);
   end if;
   new_state:=case when bored_together.game_mode(game_id)='duel' then bored_together.duel_state()
    else bored_together.initial_state(game_id,1) end;
   insert into bored_together.matches(game,mode,p1,p2,source,status,turn_user,state)
   values(game_id,bored_together.game_mode(game_id),other,u,'random','active',other,new_state) returning * into m;
   delete from bored_together.queue where game=game_id and user_id in(u,other);
   return bored_together.match_json(m,u);
  end if;
 elsif action in ('match','move','resign','rematch','delete','submit_run') then
  mid:=(args->>'match_id')::uuid;
  select * into m from bored_together.matches where id=mid for update;
  if m.id is null or u not in(m.p1,m.p2) then raise exception 'Match unavailable.' using errcode='42501'; end if;
  other:=case when u=m.p1 then m.p2 else m.p1 end;
  if m.revealed_at is null and u<>m.p1 and action<>'delete' then raise exception 'Match unavailable.' using errcode='42501'; end if;
  if action='delete' then
   delete from bored_together.matches where id=mid;
   return jsonb_build_object('ok',true);
  elsif action='match' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.version),'[]') into result from bored_together.moves x where match_id=mid;
   return bored_together.match_json(m,u) || jsonb_build_object('moves',result);
  elsif action='resign' then
   if m.status<>'active' then raise exception 'Game is no longer active.'; end if;
   if m.revealed_at is null then
    delete from bored_together.matches where id=mid;
    return jsonb_build_object('ok',true);
   end if;
   perform bored_together.finish(mid,other,'Resigned');
  elsif action='rematch' then
   if m.status<>'completed' then raise exception 'Finish this game first.'; end if;
   if bored_together.blocked(u,other) or not exists(select 1 from bored_together.members where user_id=other and active) then raise exception 'Player unavailable.'; end if;
   game_id:=m.game;
   select * into m from bored_together.matches where rematch_of=mid;
   if m.id is not null then return bored_together.match_json(m,u); end if;
   perform bored_together.rate_limit(u,'social',3600,30);
   new_state:=case when bored_together.game_mode(game_id)='duel' then bored_together.duel_state()
    else bored_together.initial_state(game_id,1) end;
   insert into bored_together.matches(game,mode,p1,p2,source,rematch_of,status,turn_user,revealed_at,state)
   values(game_id,bored_together.game_mode(game_id),u,other,'rematch',mid,'active',u,null,new_state) returning * into m;
   return bored_together.match_json(m,u);
  elsif action='submit_run' then
   if m.mode<>'duel' then raise exception 'This game is played by moves.'; end if;
   rid:=(args->>'request_id')::uuid; expected:=(args->>'version')::integer;
   -- The client's move envelope carries the run in `move`; a direct call may send
   -- `value` at the top level. Both are the same submission.
   value:=coalesce((args->>'value')::integer,(args->'move'->>'value')::integer);
   if rid is null or expected is null or value is null then raise exception 'Invalid result.'; end if;
   select * into previous from bored_together.moves where match_id=mid and request_id=rid;
   if previous.match_id is not null then
    if previous.actor<>u or (previous.move->>'value')::integer<>value then raise exception 'Move ID already used.'; end if;
    return bored_together.match_json(m,u);
   end if;
   if m.status<>'active' or m.turn_user is distinct from u then raise exception 'It is not your turn.'; end if;
   if m.version<>expected then raise exception 'The board changed. Refresh and try again.' using errcode='40001'; end if;
   if value<0 or value>bored_together.duel_limit(m.game) then raise exception 'Invalid result.'; end if;
   if bored_together.blocked(u,other) then raise exception 'Player unavailable.'; end if;
   seat:=case when u=m.p1 then 1 else 2 end; other_seat:=3-seat;
   insert into bored_together.moves(match_id,version,actor,request_id,move)
   values(mid,m.version+1,u,rid,jsonb_build_object('value',value));
   new_state:=jsonb_set(m.state,array['plays',seat::text],to_jsonb(value),true);
   if m.state->'plays' ? other_seat::text then
    -- The seat key is a text property; an integer index would read the object as
    -- an array and quietly return null.
    theirs:=(m.state->'plays'->>(other_seat::text))::integer; mine:=value;
    update bored_together.matches set state=new_state,turn_user=null,revealed_at=coalesce(revealed_at,now()),
    version=version+1,updated_at=now() where id=mid;
    perform bored_together.finish(mid,case when mine>theirs then u when theirs>mine then other else null end,
     case when mine=theirs then 'Drew on the same board' else 'Higher run on the same board' end);
   else
    update bored_together.matches set state=new_state,turn_user=other,revealed_at=coalesce(revealed_at,now()),
    version=version+1,updated_at=now() where id=mid;
   end if;
  else
   if m.mode<>'turns' then raise exception 'This game is played by a run, not moves.'; end if;
   rid:=(args->>'request_id')::uuid; expected:=(args->>'version')::integer; payload:=coalesce(args->'move',jsonb_build_object('column',args->'column'));
   if rid is null or expected is null then raise exception 'Invalid move.'; end if;
   select * into previous from bored_together.moves where match_id=mid and request_id=rid;
   if previous.match_id is not null then
    if previous.actor<>u or previous.move<>payload then raise exception 'Move ID already used.'; end if;
    return bored_together.match_json(m,u);
   end if;
   if m.status<>'active' or m.turn_user is distinct from u then raise exception 'It is not your turn.'; end if;
   if m.version<>expected then raise exception 'The board changed. Refresh and try again.' using errcode='40001'; end if;
   if bored_together.blocked(u,other) then raise exception 'Player unavailable.'; end if;
   transition:=bored_together.apply_move(m.game,m.rules_version,m.state,payload,case when u=m.p1 then 1 else 2 end);
   insert into bored_together.moves(match_id,version,actor,request_id,move) values(mid,m.version+1,u,rid,payload);
   update bored_together.matches set state=transition->'state',turn_user=other,version=version+1,updated_at=now() where id=mid;
   if m.revealed_at is null then update bored_together.matches set revealed_at=now() where id=mid; end if;
   if (transition->>'won')::boolean then perform bored_together.finish(mid,u,coalesce(transition->>'reason','Four connected'));
   elsif (transition->>'draw')::boolean then perform bored_together.finish(mid,null,'Draw');
   end if;
  end if;
  select * into m from bored_together.matches where id=mid;
  return bored_together.match_json(m,u);
 elsif action<>'dashboard' then raise exception 'Unknown operation.';
 end if;
 if action<>'dashboard' then return jsonb_build_object('ok',true); end if;
 select jsonb_build_object('enrolled',true,'user_id',u,
  'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',bb.blocked,'handle',p.handle) order by lower(p.handle))
   from bored_together.blocks bb join public.profiles p on p.id=bb.blocked where blocker=u),'[]'),
  'matches',coalesce((select jsonb_agg(bored_together.match_json(x,u) order by x.updated_at desc) from (
   select * from bored_together.matches where u in(p1,p2) and (revealed_at is not null or p1=u)
   and status in('active','completed') order by updated_at desc limit 50
  ) x),'[]'),
  'queue',coalesce((select jsonb_agg(game) from bored_together.queue where user_id=u),'[]')) into result;
 return result;
end $$;

revoke all on function bored_together.initial_state(text,integer) from public,anon,authenticated;
revoke all on function bored_together.apply_move(text,integer,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function bored_together.api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
