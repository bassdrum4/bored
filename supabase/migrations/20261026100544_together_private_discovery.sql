-- Privacy-only forward change. Keep all matches, moves, tables and legacy RPCs.
-- Email remains an exact-match lookup key, never part of a player projection.
begin;
create or replace function bored_together.person(viewer uuid,target uuid) returns jsonb
language sql stable set search_path='' as $$
 select jsonb_build_object('id',m.user_id,'handle',p.handle)
 from bored_together.members m join public.profiles p on p.id=m.user_id
 where m.user_id=target;
$$;
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
  if args->>'consent_version' is distinct from '2026-10-25-v2' then raise exception 'Please review the enrollment notice.'; end if;
  if not exists(select 1 from public.profiles where id=u) then raise exception 'Choose your Bored display name first.'; end if;
  insert into bored_together.members(user_id,consent_version) values(u,'2026-10-25-v2')
  on conflict(user_id) do update set active=true,consent_version=excluded.consent_version,consent_at=now(),left_at=null,email_visibility='hidden';
  return jsonb_build_object('enrolled',true);
 end if;
 if not coalesce(member.active,false) then raise exception 'Join Bored Together first.' using errcode='42501'; end if;
 if action='settings' then
  if args->>'email_visibility' not in ('hidden','friends') or args->>'email_visibility' is null then raise exception 'Invalid visibility setting.'; end if;
  update bored_together.members set email_visibility=args->>'email_visibility' where user_id=u;
 elsif action='leave' then
  update bored_together.members set active=false,left_at=now(),email_visibility='hidden' where user_id=u;
  delete from bored_together.queue where user_id=u;
  delete from bored_together.friendships where u in (sender,recipient);
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
   select mm.user_id,au.email from bored_together.members mm join public.profiles p on p.id=mm.user_id
   join auth.users au on au.id=mm.user_id
   where mm.active and mm.user_id<>u and not bored_together.blocked(u,mm.user_id) and
   case when position('@' in (args->>'query'))>0 then lower(au.email)=lower(trim(args->>'query'))
   else starts_with(lower(p.handle),lower(trim(args->>'query'))) end
   order by lower(p.handle),mm.user_id limit 10
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
   insert into bored_together.matches(game,p1,p2,source,state) values(game_id,u,target,'challenge',bored_together.initial_state(game_id,1)) returning * into m;
   perform bored_together.notify(target,'New challenge',m.id);
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
 elsif action in ('match','accept','decline','cancel','move','resign','rematch') then
  mid:=(args->>'match_id')::uuid;
  select * into m from bored_together.matches where id=mid for update;
  if m.id is null or u not in(m.p1,m.p2) then raise exception 'Match unavailable.' using errcode='42501'; end if;
  other:=case when u=m.p1 then m.p2 else m.p1 end;
  if action='match' then
   select coalesce(jsonb_agg(to_jsonb(x) order by x.version),'[]') into result from bored_together.moves x where match_id=mid;
   return bored_together.match_json(m,u) || jsonb_build_object('moves',result);
  elsif action='accept' then
   if m.status<>'pending' or u<>m.p2 then raise exception 'Challenge unavailable.'; end if;
   if bored_together.blocked(u,other) or not exists(select 1 from bored_together.members where user_id=other and active) then raise exception 'Player unavailable.'; end if;
   update bored_together.matches set status='active',turn_user=p1,version=version+1,updated_at=now() where id=mid returning * into m;
   perform bored_together.notify(other,'Challenge accepted — your turn',mid);
  elsif action in ('decline','cancel') then
   if m.status<>'pending' or (action='decline' and u<>m.p2) or (action='cancel' and u<>m.p1) then raise exception 'Challenge unavailable.'; end if;
   update bored_together.matches set status=case when action='decline' then 'declined' else 'cancelled' end,version=version+1,updated_at=now() where id=mid returning * into m;
  elsif action='resign' then
   if m.status<>'active' then raise exception 'Game is no longer active.'; end if;
   perform bored_together.finish(mid,other,'Resigned');
  elsif action='rematch' then
   if m.status<>'completed' then raise exception 'Finish this game first.'; end if;
   if bored_together.blocked(u,other) or not exists(select 1 from bored_together.members where user_id=other and active) then raise exception 'Player unavailable.'; end if;
   game_id:=m.game;
   select * into m from bored_together.matches where rematch_of=mid;
   if m.id is not null then return bored_together.match_json(m,u); end if;
   perform bored_together.rate_limit(u,'social',3600,30);
   insert into bored_together.matches(game,p1,p2,source,rematch_of,state) values(game_id,u,other,'rematch',mid,bored_together.initial_state(game_id,1)) returning * into m;
   perform bored_together.notify(other,'Rematch invitation',m.id);
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
   if (transition->>'won')::boolean then perform bored_together.finish(mid,u,'Four connected');
   elsif (transition->>'draw')::boolean then perform bored_together.finish(mid,null,'Draw');
   else perform bored_together.notify(other,'Your turn',mid); end if;
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
   select * from bored_together.matches where u in(p1,p2) and status in('pending','active')
   union all select * from (select * from bored_together.matches where u in(p1,p2) and status not in('pending','active') order by updated_at desc limit 50) history
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


notify pgrst, 'reload schema';
commit;
