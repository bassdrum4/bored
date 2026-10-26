-- Play-first games. A challenge is now a game you start: it opens straight into
-- the original game with the challenger to move, and the opponent only sees it
-- once that turn is saved and the game is theirs to play. Nothing is sent by an
-- abandoned first turn, so no dead games land on anyone's list.
--
-- Also in this change: the member directory (display name and email) that
-- replaces typing an address, a delete action either player can use to remove a
-- match for both of them, and a readable message when a pair already has a game.
--
-- Privacy: the directory is a deliberate reversal of the earlier exact-email
-- design. Email is now shown to other members, so the enrollment notice is a new
-- consent version and existing members are asked to review it before they
-- continue. Nothing else about matching, validation or result authority moves.
begin;

-- Null until the first turn is saved. A match without it is visible only to p1,
-- the player who started it.
alter table bored_together.matches add column if not exists revealed_at timestamptz default now();
update bored_together.matches set revealed_at=coalesce(revealed_at,created_at) where revealed_at is null;
create index if not exists bt_match_revealed on bored_together.matches(revealed_at) where revealed_at is null;

-- A completed game is always visible, whoever finished it.
create or replace function bored_together.finish(mid uuid,w uuid,why text) returns void
language plpgsql set search_path='' as $$
declare m bored_together.matches;
begin
 update bored_together.matches set status='completed',winner=w,turn_user=null,reason=why,
 revealed_at=coalesce(revealed_at,now()),version=version+1,updated_at=now() where id=mid returning * into m;
 perform bored_together.notify(m.p1,'Game completed',mid);
 perform bored_together.notify(m.p2,'Game completed',mid);
end $$;

create or replace function bored_together.api(action text,args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target uuid; mid uuid; m bored_together.matches; f bored_together.friendships;
 member bored_together.members; result jsonb; other uuid; game_id text:=coalesce(args->>'game','connect-four');
 previous bored_together.moves; transition jsonb; rid uuid; payload jsonb; expected integer;
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
 -- The directory shows email, so an older consent cannot stand: the member is
 -- asked to review the notice once before their list loads again.
 if action='dashboard' and member.consent_version is distinct from '2026-10-26-v3' then
  return jsonb_build_object('enrolled',false,'renew',true);
 end if;
 if action='settings' then
  if args->>'email_visibility' not in ('hidden','friends') or args->>'email_visibility' is null then raise exception 'Invalid visibility setting.'; end if;
  update bored_together.members set email_visibility=args->>'email_visibility' where user_id=u;
 elsif action='leave' then
  update bored_together.members set active=false,left_at=now(),email_visibility='hidden' where user_id=u;
  delete from bored_together.queue where user_id=u;
  delete from bored_together.friendships where u in (sender,recipient);
  -- A game nobody has seen yet simply disappears with the player.
  delete from bored_together.matches where u in(p1,p2) and revealed_at is null and status in('pending','active');
  update bored_together.matches set status='cancelled',turn_user=null,reason='Player left Bored Together',version=version+1,updated_at=now() where u in(p1,p2) and status='pending';
  for m in select * from bored_together.matches where u in(p1,p2) and status='active' for update loop
   perform bored_together.finish(m.id,case when m.p1=u then m.p2 else m.p1 end,'Opponent left Bored Together');
  end loop;
  delete from bored_together.notifications where user_id=u;
  return jsonb_build_object('enrolled',false);
 elsif action='search' then
  perform bored_together.rate_limit(u,'search-minute',60,20);
  perform bored_together.rate_limit(u,'search-day',86400,200);
  if length(trim(coalesce(args->>'query','')))<3 or length(args->>'query')>254 then raise exception 'Enter at least 3 characters or an exact email.'; end if;
  select coalesce(jsonb_agg(bored_together.person(u,x.user_id)),'[]') into result from (
   select mm.user_id from bored_together.members mm join public.profiles p on p.id=mm.user_id
   join auth.users au on au.id=mm.user_id
   where mm.active and mm.user_id<>u and not bored_together.blocked(u,mm.user_id) and
   case when position('@' in (args->>'query'))>0 then lower(au.email)=lower(trim(args->>'query'))
   else starts_with(lower(p.handle),lower(trim(args->>'query'))) end
   order by lower(p.handle),mm.user_id limit 10
  ) x;
  return result;
 elsif action='people' then
  -- The directory the picker shows: everybody who is in Bored Together, with the
  -- name and address they signed up with. Blocks and the viewer are left out.
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
 elsif action in ('friend_request','friend_accept','friend_decline','friend_remove','block','unblock','challenge') then
  target:=(args->>'user_id')::uuid;
  if target is null or target=u then raise exception 'Choose another player.'; end if;
  if action='unblock' then
   delete from bored_together.blocks where blocker=u and blocked=target;
   return jsonb_build_object('ok',true);
  end if;
  if action='block' then
   if not exists(select 1 from bored_together.members where user_id=target) then raise exception 'Player unavailable.'; end if;
   insert into bored_together.blocks(blocker,blocked) values(u,target) on conflict do nothing;
   delete from bored_together.friendships where (sender=u and recipient=target) or (sender=target and recipient=u);
   update bored_together.matches set status='cancelled',turn_user=null,reason='Pair unavailable',updated_at=now(),version=version+1
   where ((p1=u and p2=target) or (p1=target and p2=u)) and status in ('pending','active');
   return jsonb_build_object('ok',true);
  end if;
  if not exists(select 1 from bored_together.members where user_id=target and active) or bored_together.blocked(u,target) then raise exception 'Player unavailable.'; end if;
  select * into f from bored_together.friendships where (sender=u and recipient=target) or (sender=target and recipient=u) for update;
  if action='friend_request' then
   if f.id is not null then raise exception 'A friendship or request already exists.'; end if;
   perform bored_together.rate_limit(u,'social',3600,30);
   insert into bored_together.friendships(sender,recipient) values(u,target);
   perform bored_together.notify(target,'New friend request');
  elsif action='friend_accept' then
   if f.recipient is distinct from u or f.status<>'pending' then raise exception 'Request unavailable.'; end if;
   update bored_together.friendships set status='accepted' where id=f.id;
   perform bored_together.notify(target,'Friend request accepted');
  elsif action in ('friend_decline','friend_remove') then
   if f.id is null or (action='friend_decline' and f.status<>'pending') then raise exception 'Request unavailable.'; end if;
   delete from bored_together.friendships where id=f.id;
  else
   perform bored_together.rate_limit(u,'social',3600,30);
   if game_id not in ('connect-four','8ball') then raise exception 'Game unavailable.'; end if;
   -- One game per pair and game at a time. Saying which one to finish is more
   -- use than the unique index's duplicate-key text.
   select * into m from bored_together.matches x where x.game=game_id and x.status in ('pending','active')
   and ((x.p1=u and x.p2=target) or (x.p2=u and x.p1=target)) for update;
   if m.id is not null then
    raise exception 'You already have a % game with %. Finish that one first.',
    case game_id when '8ball' then 'Pool' else 'Connect Four' end,
    coalesce((select handle from public.profiles where id=target),'that player');
   end if;
   -- Started by the challenger, who moves first and is the only one who can see
   -- it until that turn is saved.
   insert into bored_together.matches(game,p1,p2,source,status,turn_user,revealed_at,state)
   values(game_id,u,target,'challenge','active',u,null,bored_together.initial_state(game_id,1)) returning * into m;
   return bored_together.match_json(m,u);
  end if;
 elsif action in ('queue_join','queue_cancel') then
  if game_id not in ('connect-four','8ball') then raise exception 'Game unavailable.'; end if;
  if action='queue_cancel' then delete from bored_together.queue where user_id=u and game=game_id;
  else
   delete from bored_together.queue where created_at<now()-interval '7 days';
   select q.user_id into other from bored_together.queue q join bored_together.members mm on mm.user_id=q.user_id
   where q.game=game_id and q.user_id<>u and mm.active and not bored_together.blocked(u,q.user_id)
   and not exists(select 1 from bored_together.matches x where x.game=game_id and x.status in ('pending','active')
     and ((x.p1=u and x.p2=q.user_id) or (x.p2=u and x.p1=q.user_id)))
   order by q.created_at,q.user_id limit 1 for update of q;
   if other is null then
    insert into bored_together.queue(user_id,game) values(u,game_id) on conflict do nothing;
    return jsonb_build_object('queued',true);
   end if;
   insert into bored_together.matches(game,p1,p2,source,status,turn_user,state) values(game_id,other,u,'random','active',other,bored_together.initial_state(game_id,1)) returning * into m;
   delete from bored_together.queue where game=game_id and user_id in(u,other);
   perform bored_together.notify(other,'Random opponent found',m.id);
   perform bored_together.notify(u,'Random opponent found',m.id);
   return bored_together.match_json(m,u);
  end if;
 elsif action in ('match','accept','decline','cancel','move','resign','rematch','delete') then
  mid:=(args->>'match_id')::uuid;
  select * into m from bored_together.matches where id=mid for update;
  if m.id is null or u not in(m.p1,m.p2) then raise exception 'Match unavailable.' using errcode='42501'; end if;
  other:=case when u=m.p1 then m.p2 else m.p1 end;
  -- Until it is their game, the opponent cannot open it at all.
  if m.revealed_at is null and u<>m.p1 and action<>'delete' then raise exception 'Match unavailable.' using errcode='42501'; end if;
  if action='delete' then
   -- Either player can remove a match for both of them. No winner is awarded.
   delete from bored_together.matches where id=mid;
   return jsonb_build_object('ok',true);
  elsif action='match' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.version),'[]') into result from bored_together.moves x where match_id=mid;
   return bored_together.match_json(m,u) || jsonb_build_object('moves',result);
  elsif action='accept' then
   -- Only challenges created before play-first existed are still pending.
   if m.status<>'pending' or u<>m.p2 then raise exception 'Challenge unavailable.'; end if;
   if bored_together.blocked(u,other) or not exists(select 1 from bored_together.members where user_id=other and active) then raise exception 'Player unavailable.'; end if;
   update bored_together.matches set status='active',turn_user=p1,revealed_at=coalesce(revealed_at,now()),version=version+1,updated_at=now() where id=mid returning * into m;
   perform bored_together.notify(other,'Challenge accepted — your turn',mid);
  elsif action in ('decline','cancel') then
   if m.status<>'pending' or (action='decline' and u<>m.p2) or (action='cancel' and u<>m.p1) then raise exception 'Challenge unavailable.'; end if;
   update bored_together.matches set status=case when action='decline' then 'declined' else 'cancelled' end,version=version+1,updated_at=now() where id=mid returning * into m;
  elsif action='resign' then
   if m.status<>'active' then raise exception 'Game is no longer active.'; end if;
   -- Abandoning a game the opponent has never seen leaves nothing behind.
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
   insert into bored_together.matches(game,p1,p2,source,rematch_of,status,turn_user,revealed_at,state)
   values(game_id,u,other,'rematch',mid,'active',u,null,bored_together.initial_state(game_id,1)) returning * into m;
   return bored_together.match_json(m,u);
  else
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
   else perform bored_together.notify(other,case when m.revealed_at is null then 'New game — your turn' else 'Your turn' end,mid); end if;
  end if;
  select * into m from bored_together.matches where id=mid;
  return bored_together.match_json(m,u);
 elsif action='read_notifications' then
  update bored_together.notifications set read_at=now() where user_id=u and read_at is null and id<=coalesce((args->>'through')::bigint,0);
 elsif action<>'dashboard' then raise exception 'Unknown operation.';
 end if;
 if action<>'dashboard' then return jsonb_build_object('ok',true); end if;
 select jsonb_build_object('enrolled',true,'user_id',u,'email_visibility',member.email_visibility,
  'friends',coalesce((select jsonb_agg(jsonb_build_object('sender',ff.sender,'status',ff.status,'person',
   bored_together.person(u,case when ff.sender=u then ff.recipient else ff.sender end)) order by ff.created_at desc)
   from bored_together.friendships ff where u in(ff.sender,ff.recipient)),'[]'),
  'blocks',coalesce((select jsonb_agg(jsonb_build_object('id',bb.blocked,'handle',p.handle)) from bored_together.blocks bb join public.profiles p on p.id=bb.blocked where blocker=u),'[]'),
  'matches',coalesce((select jsonb_agg(bored_together.match_json(x,u) order by x.updated_at desc) from (
   select * from bored_together.matches where u in(p1,p2) and (revealed_at is not null or p1=u) and status in('pending','active')
   union all select * from (select * from bored_together.matches where u in(p1,p2) and (revealed_at is not null or p1=u) and status not in('pending','active') order by updated_at desc limit 50) history
  ) x),'[]'),
  'queue',coalesce((select jsonb_agg(game) from bored_together.queue where user_id=u),'[]'),
  'notifications',coalesce((select jsonb_agg(to_jsonb(x) order by x.id desc) from (select id,kind,match_id,read_at,created_at from bored_together.notifications where user_id=u order by id desc limit 30) x),'[]'),
  'stats',coalesce((select jsonb_agg(jsonb_build_object('opponent',bored_together.person(u,x.opponent)-'email','wins',x.wins,'losses',x.losses,'draws',x.draws)) from (
   select case when p1=u then p2 else p1 end opponent,count(*) filter(where winner=u) wins,
   count(*) filter(where winner is not null and winner<>u) losses,count(*) filter(where winner is null) draws
   from bored_together.matches where u in(p1,p2) and status='completed' group by 1
  ) x),'[]')) into result;
 return result;
end $$;

-- Pool commits through the validating Edge function, so the same reveal rule
-- lives here: the game becomes the opponent's when the shooter's turn ends.
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
 -- A retained turn (a legal pot) keeps the game to the shooter.
 if m.revealed_at is null and (winner_seat is not null or next_seat<>(case when actor=m.p1 then 1 else 2 end)) then
  update bored_together.matches set revealed_at=now() where id=mid;
 end if;
 if winner_seat is not null then
  w:=case when winner_seat=1 then m.p1 else m.p2 end;
  perform bored_together.finish(mid,w,left(shot->>'reason',120));
 else perform bored_together.notify(case when next_seat=1 then m.p1 else m.p2 end,case when next_seat=(case when actor=m.p1 then 1 else 2 end) then 'Ball potted — shoot again' else 'Your turn' end,mid);
 end if;
 select * into m from bored_together.matches where id=mid;
 return bored_together.match_json(m,actor);
end $$;

-- Unplayed games were never delivered to anyone, so they expire sooner than a
-- game both players are ignoring.
create or replace function bored_together.cleanup() returns void language plpgsql set search_path='' as $$
begin
 perform pg_advisory_xact_lock(210425,1);
 update bored_together.matches set status='expired',turn_user=null,reason='Inactive for 30 days',version=version+1,updated_at=now()
 where (status='active' and revealed_at is not null and updated_at<now()-interval '30 days') or (status='pending' and created_at<now()-interval '7 days');
 delete from bored_together.matches where revealed_at is null and status='active' and created_at<now()-interval '7 days';
 delete from bored_together.queue where created_at<now()-interval '7 days';
 delete from bored_together.friendships where status='pending' and created_at<now()-interval '30 days';
 delete from bored_together.notifications where created_at<now()-interval '30 days';
 delete from bored_together.limits where window_start<now()-interval '2 days';
 delete from bored_together.matches where status not in('pending','active') and updated_at<now()-interval '90 days';
end $$;

notify pgrst,'reload schema';
commit;
