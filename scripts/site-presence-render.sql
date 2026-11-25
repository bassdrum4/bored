-- Narrow account-only RPC for the Render presence server. No guest writes,
-- no list/lookup of other users, and no service-role credential required.
create or replace function bored_presence.account(action text,args jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); pref boolean; name text;
begin
  if me is null or coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    raise exception 'Sign in first' using errcode='42501';
  end if;
  if action='set' then
    if jsonb_typeof(args->'visible') is distinct from 'boolean' then
      raise exception 'Invalid preference' using errcode='22023';
    end if;
    insert into bored_presence.settings(user_id,visible) values(me,(args->>'visible')::boolean)
    on conflict(user_id) do update set visible=excluded.visible,generation=gen_random_uuid()
    where bored_presence.settings.visible is distinct from excluded.visible;
  elsif action is distinct from 'get' then
    raise exception 'Unknown action' using errcode='22023';
  end if;
  select s.visible into pref from bored_presence.settings s where s.user_id=me;
  select p.handle into name from public.profiles p where p.id=me;
  return jsonb_build_object('id',me,'visible',coalesce(pref,true),'handle',name);
end;
$$;
revoke all on function bored_presence.account(text,jsonb) from public,anon,authenticated;
grant execute on function bored_presence.account(text,jsonb) to authenticated;
create or replace function public.bored_presence_account(action text,args jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select bored_presence.account(action,args);
$$;
revoke all on function public.bored_presence_account(text,jsonb) from public,anon,authenticated;
grant execute on function public.bored_presence_account(text,jsonb) to authenticated;
