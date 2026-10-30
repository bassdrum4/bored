-- The invite list was capped at eight, which quietly hid the rest: with eleven
-- eligible accounts the picker showed eight and looked complete. It now lists
-- every Bored account that has not joined (up to fifty, which keeps the reply
-- small and is far above the membership this arcade has).
begin;

create or replace function bored_together.invite_api(action text,args jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); member bored_together.members; target uuid; handle text;
 inv bored_together.invites; m bored_together.matches; result jsonb;
 game_id text:=coalesce(args->>'game','connect-four'); created jsonb:='[]'::jsonb;
begin
 if u is null or not exists(select 1 from auth.users where id=u and not is_anonymous) then
  raise exception 'Sign in to your Bored account first.' using errcode='42501';
 end if;
 if args is null or jsonb_typeof(args)<>'object' or octet_length(args::text)>4096 then raise exception 'Invalid request.'; end if;
 perform bored_together.rate_limit(u,'rpc',60,180);
 select * into member from bored_together.members where user_id=u;

 if action='candidates' then
  -- Every Bored account that is not in Bored Together, from the same public
  -- display names the leaderboard shows; no address is read, returned or
  -- needed. Up to fifty, so a full list never looks like a short one.
  if not coalesce(member.active,false) then raise exception 'Join Bored Together first.' using errcode='42501'; end if;
  perform bored_together.rate_limit(u,'invite-people',60,30);
  select coalesce(jsonb_agg(jsonb_build_object('id',x.id,'handle',x.handle) order by lower(x.handle),x.id),'[]')
  into result from (
   select p.id,coalesce(nullif(trim(p.handle),''),'Bored player') handle
   from public.profiles p join auth.users au on au.id=p.id
   where p.id<>u and not au.is_anonymous
   and not exists(select 1 from bored_together.members mm where mm.user_id=p.id and mm.active)
   order by lower(coalesce(p.handle,'')),p.id limit 50
  ) x;
  return result;
 elsif action='send' then
  if not coalesce(member.active,false) then raise exception 'Join Bored Together first.' using errcode='42501'; end if;
  if game_id not in ('connect-four','8ball','2048','mahjong','tank2') then raise exception 'Game unavailable.'; end if;
  if args->>'user_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'Choose someone to invite.'; end if;
  target:=(args->>'user_id')::uuid;
  if target=u then raise exception 'That is your own account.'; end if;
  perform bored_together.rate_limit(u,'invite',3600,20);
  select au.id,coalesce(nullif(trim(p.handle),''),'Bored player') into target,handle
  from auth.users au left join public.profiles p on p.id=au.id
  where au.id=target and not au.is_anonymous;
  if target is null then raise exception 'That Bored account is not available.'; end if;
  if exists(select 1 from bored_together.members where user_id=target and active) then
   raise exception 'They are already in Bored Together. Pick them from the list above.';
  end if;
  insert into bored_together.invites(inviter,invitee,game,status,created_at)
  values(u,target,game_id,'pending',now())
  on conflict (inviter,invitee,game) where status in ('pending','accepted')
  do update set status='pending',accepted_at=null,created_at=now()
  returning * into inv;
  return jsonb_build_object('id',inv.id,'game',inv.game,'handle',handle);
 elsif action='list' then
  -- What the invited account sees when it opens a game. Members have already
  -- joined, so their list is empty and the notice never appears to them.
  if coalesce(member.active,false) then
   return jsonb_build_object('enrolled',true,'invites','[]'::jsonb);
  end if;
  perform bored_together.rate_limit(u,'invite-list',60,60);
  select coalesce(jsonb_agg(jsonb_build_object(
   'id',x.id,'game',x.game,'status',x.status,'created_at',x.created_at,
   'inviter',coalesce(nullif(trim(p.handle),''),'A Bored Together member'))
   order by x.created_at desc),'[]') into result
  from bored_together.invites x
  join bored_together.members mm on mm.user_id=x.inviter and mm.active
  left join public.profiles p on p.id=x.inviter
  where x.invitee=u and x.status in ('pending','accepted')
  and not bored_together.blocked(u,x.inviter);
  return jsonb_build_object('enrolled',false,'invites',result);
 elsif action='accept' then
  if coalesce(member.active,false) then raise exception 'You are already in Bored Together.'; end if;
  update bored_together.invites set status='accepted',accepted_at=now()
  where id=(args->>'id')::uuid and invitee=u and status='pending' returning * into inv;
  if inv.id is null then raise exception 'That invite is no longer available.'; end if;
  return jsonb_build_object('ok',true,'id',inv.id,'game',inv.game);
 elsif action='claim' then
  -- Called after enrollment. Accepted invites become the games they promised,
  -- already visible to the player who just joined.
  if not coalesce(member.active,false) then raise exception 'Join Bored Together first.' using errcode='42501'; end if;
  perform bored_together.rate_limit(u,'invite-claim',3600,20);
  for inv in select * from bored_together.invites
   where invitee=u and status='accepted' order by accepted_at,created_at for update loop
   if not exists(select 1 from bored_together.members where user_id=inv.inviter and active)
    or bored_together.blocked(u,inv.inviter) then
    update bored_together.invites set status='cancelled' where id=inv.id;
    continue;
   end if;
   select * into m from bored_together.matches where game=inv.game and status='active'
    and ((p1=inv.inviter and p2=u) or (p1=u and p2=inv.inviter)) limit 1;
   if m.id is null then
    insert into bored_together.matches(game,mode,p1,p2,source,status,turn_user,revealed_at,state)
    values(inv.game,bored_together.game_mode(inv.game),inv.inviter,u,'challenge','active',inv.inviter,now(),
     case when bored_together.game_mode(inv.game)='duel' then bored_together.duel_state()
      else bored_together.initial_state(inv.game,1) end)
    returning * into m;
   end if;
   update bored_together.invites set status='claimed',match_id=m.id where id=inv.id;
   created:=created||jsonb_build_array(bored_together.match_json(m,u));
  end loop;
  return jsonb_build_object('claimed',jsonb_array_length(created),'matches',created);
 end if;
 raise exception 'Unknown operation.';
end $$;
revoke all on function bored_together.invite_api(text,jsonb) from public,anon;
grant execute on function bored_together.invite_api(text,jsonb) to authenticated;

notify pgrst,'reload schema';
commit;
