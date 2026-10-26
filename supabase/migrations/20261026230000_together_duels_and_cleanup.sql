-- Bored Together v4: duels, and the removal of everything the interface no longer
-- reaches.
--
-- Gone: friend requests, the notification feed (turn pings were written and never
-- read), email-visibility settings, the username/exact-email search action, and
-- the pre-play-first challenge states. What is left is the smallest surface that
-- still plays a game: enroll, people, block, challenge, queue, match, move,
-- resign, rematch, delete, submit_run and dashboard.
--
-- Added: `duel` matches. Both players get the same server-chosen seed and play the
-- original game alone; the result is one number each, compared when both are in.
-- That is the same trust the single-player boards already use — the server holds
-- the seed, bounds and one submission per player, not a replay of the board.
begin;

-- Challenges used to wait for an accept; there is nothing left to accept. Any
-- that were still queued simply go.
delete from bored_together.matches where status in ('pending','declined');
drop table if exists bored_together.friendships;
drop table if exists bored_together.notifications;
alter table bored_together.members drop column if exists email_visibility;

-- Projection without the viewer argument; nothing projects an email any more.
drop function if exists bored_together.notify(uuid,text,uuid);
drop function if exists bored_together.person(uuid,uuid);
create function bored_together.person(target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.user_id,'handle',p.handle)
 from bored_together.members m join public.profiles p on p.id=m.user_id
 where m.user_id=target;
$$;

alter table bored_together.matches drop constraint if exists matches_status_check;
alter table bored_together.matches add constraint matches_status_check
 check(status in ('active','completed','cancelled','expired'));
alter table bored_together.matches drop constraint if exists matches_game_check;
alter table bored_together.matches add constraint matches_game_check
 check(game in ('connect-four','8ball','2048','mahjong'));
alter table bored_together.matches add column if not exists mode text not null default 'turns';
alter table bored_together.matches drop constraint if exists matches_mode_check;
alter table bored_together.matches add constraint matches_mode_check check(mode in ('turns','duel'));
update bored_together.matches set mode='duel' where game in ('2048','mahjong');
drop index if exists bored_together.bt_open_pair;
create unique index bt_open_pair on bored_together.matches(game,least(p1,p2),greatest(p1,p2)) where status='active';

-- A duel's board comes from the server, so both players open the same one.
create or replace function bored_together.duel_seed() returns integer
language sql stable set search_path='' as $$
 select (('x'||substr(md5('bored-together:'||((now() at time zone 'America/Detroit')::date)::text),1,6))::bit(24)::integer);
$$;
create or replace function bored_together.duel_state() returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('seed',bored_together.duel_seed(),'plays','{}'::jsonb);
$$;
-- Bounds for a submitted run, per game. Nobody can post a million pairs.
create or replace function bored_together.duel_limit(g text) returns integer
language sql immutable set search_path='' as $$
 select case g when '2048' then 10000000 when 'mahjong' then 36 else 0 end;
$$;
create or replace function bored_together.game_mode(g text) returns text
language sql immutable set search_path='' as $$
 select case when g in ('2048','mahjong') then 'duel' else 'turns' end;
$$;

-- Completed games are visible to both players, and a duel hides the opponent's
-- run until yours is in, so neither player is playing against a known score.
create or replace function bored_together.match_json(m bored_together.matches,viewer uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.id,'game',m.game,'mode',m.mode,'rules_version',m.rules_version,
  'p1',m.p1,'p2',m.p2,'source',m.source,'status',m.status,'turn_user',m.turn_user,'winner',m.winner,
  'reason',m.reason,'version',m.version,'rematch_of',m.rematch_of,'created_at',m.created_at,
  'updated_at',m.updated_at,'revealed_at',m.revealed_at,
  'state', case when m.mode='duel' then
   m.state || jsonb_build_object('plays',coalesce((
    select jsonb_object_agg(e.key,e.value) from jsonb_each(m.state->'plays') e
    where m.status='completed' or e.key=(case when m.p1=viewer then '1' else '2' end)),'{}'::jsonb))
   else m.state end,
  'opponent', bored_together.person(case when m.p1=viewer then m.p2 else m.p1 end),
  'p1_handle',(select handle from public.profiles where id=m.p1),
  'p2_handle',(select handle from public.profiles where id=m.p2));
$$;

create or replace function bored_together.finish(mid uuid,w uuid,why text) returns void
language plpgsql set search_path='' as $$
begin
 update bored_together.matches set status='completed',winner=w,turn_user=null,reason=why,
 revealed_at=coalesce(revealed_at,now()),version=version+1,updated_at=now() where id=mid;
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
  if game_id not in ('connect-four','8ball','2048','mahjong') then raise exception 'Game unavailable.'; end if;
  select * into m from bored_together.matches x where x.game=game_id and x.status='active'
  and ((x.p1=u and x.p2=target) or (x.p2=u and x.p1=target)) for update;
  if m.id is not null then
   raise exception 'You already have a % game with %. Finish that one first.',
   case game_id when '8ball' then 'Pool' when '2048' then '2048' when 'mahjong' then 'Mahjong' else 'Connect Four' end,
   coalesce((select handle from public.profiles where id=target),'that player');
  end if;
  new_state:=case when bored_together.game_mode(game_id)='duel' then bored_together.duel_state()
   else bored_together.initial_state(game_id,1) end;
  insert into bored_together.matches(game,mode,p1,p2,source,status,turn_user,revealed_at,state)
  values(game_id,bored_together.game_mode(game_id),u,target,'challenge','active',u,null,new_state) returning * into m;
  return bored_together.match_json(m,u);
 elsif action in ('queue_join','queue_cancel') then
  if game_id not in ('connect-four','8ball','2048','mahjong') then raise exception 'Game unavailable.'; end if;
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
   if (transition->>'won')::boolean then perform bored_together.finish(mid,u,'Four connected');
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

-- Pool commits through the validating Edge function, so the reveal rule lives
-- there too: the table becomes the opponent's when the shooter's turn ends.
create or replace function bored_together.pool_commit(shot jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m bored_together.matches; previous bored_together.moves;
 actor uuid:=(shot->>'actor')::uuid; mid uuid:=(shot->>'match_id')::uuid;
 rid uuid:=(shot->>'request_id')::uuid; expected integer:=(shot->>'expected_version')::integer;
 next_seat integer:=(shot->>'next_seat')::integer; winner_seat integer:=(shot->>'winner_seat')::integer;
 w uuid; other uuid;
begin
 if actor is null or rid is null or expected is null or jsonb_typeof(shot->'state') is distinct from 'object' or octet_length(shot::text)>32768 then raise exception 'Invalid shot result.'; end if;
 perform pg_advisory_xact_lock(210425,1);
 select * into m from bored_together.matches where id=mid for update;
 if m.id is null or actor not in(m.p1,m.p2) or m.game<>'8ball' or m.rules_version<>1 then raise exception 'Match unavailable.' using errcode='42501'; end if;
 if not exists(select 1 from bored_together.members where user_id=actor and active) then raise exception 'Join Bored Together first.' using errcode='42501'; end if;
 select * into previous from bored_together.moves where match_id=mid and request_id=rid;
 if previous.match_id is not null then
  if previous.actor<>actor or previous.move<>shot->'move' then raise exception 'Move ID already used.'; end if;
  return bored_together.match_json(m,actor);
 end if;
 if m.status<>'active' or m.turn_user is distinct from actor then raise exception 'It is not your turn.'; end if;
 if m.version<>expected then raise exception 'The table changed. Refresh and try again.' using errcode='40001'; end if;
 other:=case when m.p1=actor then m.p2 else m.p1 end;
 if bored_together.blocked(actor,other) or not exists(select 1 from bored_together.members where user_id=other and active) then raise exception 'Player unavailable.'; end if;
 if next_seat is null or next_seat not in(1,2) or (winner_seat is not null and winner_seat not in(1,2)) or
 jsonb_typeof(shot->'state'->'balls') is distinct from 'array' or jsonb_array_length(shot->'state'->'balls')>16 or
 (shot->'state'->>'shotCount')::integer is distinct from ((m.state->>'shotCount')::integer+1) then raise exception 'Invalid shot result.'; end if;
 insert into bored_together.moves(match_id,version,actor,request_id,move,state_after)
 values(mid,m.version+1,actor,rid,shot->'move',shot->'state');
 update bored_together.matches set state=shot->'state',turn_user=case when next_seat=1 then p1 else p2 end,
 version=version+1,updated_at=now() where id=mid;
 if m.revealed_at is null and (winner_seat is not null or next_seat<>(case when actor=m.p1 then 1 else 2 end)) then
  update bored_together.matches set revealed_at=now() where id=mid;
 end if;
 if winner_seat is not null then
  w:=case when winner_seat=1 then m.p1 else m.p2 end;
  perform bored_together.finish(mid,w,left(shot->>'reason',120));
 end if;
 select * into m from bored_together.matches where id=mid;
 return bored_together.match_json(m,actor);
end $$;

create or replace function bored_together.cleanup() returns void language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(210425,1);
 update bored_together.matches set status='expired',turn_user=null,reason='Inactive for 30 days',version=version+1,updated_at=now()
 where status='active' and revealed_at is not null and updated_at<now()-interval '30 days';
 delete from bored_together.matches where revealed_at is null and status='active' and created_at<now()-interval '7 days';
 delete from bored_together.queue where created_at<now()-interval '7 days';
 delete from bored_together.limits where window_start<now()-interval '2 days';
 delete from bored_together.matches where status not in('active') and updated_at<now()-interval '90 days';
end $$;

revoke all on function bored_together.person(uuid) from public,anon,authenticated;
revoke all on function bored_together.duel_seed() from public,anon,authenticated;
revoke all on function bored_together.duel_state() from public,anon,authenticated;
revoke all on function bored_together.duel_limit(text) from public,anon,authenticated;
revoke all on function bored_together.game_mode(text) from public,anon,authenticated;
revoke all on function bored_together.match_json(bored_together.matches,uuid) from public,anon,authenticated;
grant execute on function bored_together.api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
