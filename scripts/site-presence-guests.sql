-- One private realtime channel for signed-in players and guests.
-- The v1 channel is left intact for old clients during deployment.
-- V2 wraps account tickets in authenticated encryption so guests cannot
-- recover account IDs from presence metadata. Guests advertise a random
-- browser key, never an account or analytics ID.
grant usage on schema bored_presence to anon;
create or replace function bored_presence.rpc_v2(action text,args jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  signed_in boolean := auth.uid() is not null and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true';
  base jsonb;
  signing_key bytea;
  iv bytea;
  cipher bytea;
  mac text;
  guest_count integer;
  names jsonb;
begin
  select key into signing_key from bored_presence.secret where singleton;
  if action in ('get','set') then
    if not signed_in then raise exception 'Sign in first' using errcode='42501'; end if;
    base := bored_presence.rpc(action,args);
    if not (base->>'visible')::boolean then return base; end if;
    iv := extensions.gen_random_bytes(16);
    cipher := extensions.encrypt_iv(convert_to(base->>'ticket','UTF8'),
      extensions.hmac(convert_to('presence-encryption-v2','UTF8'),signing_key,'sha256'),iv,'aes-cbc/pad:pkcs');
    mac := encode(extensions.hmac(iv || cipher,signing_key,'sha256'),'hex');
    return jsonb_build_object('visible',true,'ticket','p2:' || encode(iv || cipher,'hex') || ':' || mac);
  end if;
  if action <> 'resolve' then raise exception 'Unknown presence action' using errcode='22023'; end if;
  if signed_in and not bored_presence.can_join() then
    return jsonb_build_object('visible',false,'names','[]'::jsonb,'guests',0,'registered',0);
  end if;
  if jsonb_typeof(args->'tickets') is distinct from 'array' or jsonb_array_length(args->'tickets') > 300 then
    raise exception 'Invalid tickets' using errcode='22023';
  end if;
  with raw as materialized (
    select distinct value as t from jsonb_array_elements_text(args->'tickets')
    where length(value) <= 512
  ), encrypted as materialized (
    select decode(split_part(t,':',2),'hex') as data, split_part(t,':',3) as mac
    from raw where t ~ '^p2:([0-9a-f]{32}){2,14}:[0-9a-f]{64}$'
  ), authentic as materialized (
    select data from encrypted where encrypted.mac=encode(extensions.hmac(data,signing_key,'sha256'),'hex')
  ), plain as materialized (
    select convert_from(extensions.decrypt_iv(substring(data from 17),
      extensions.hmac(convert_to('presence-encryption-v2','UTF8'),signing_key,'sha256'),
      substring(data from 1 for 16),'aes-cbc/pad:pkcs'),'UTF8') as ticket from authentic
  ), valid as materialized (
    select split_part(ticket,'.',1)::uuid as uid, split_part(ticket,'.',2)::uuid as generation
    from plain where split_part(ticket,'.',3)::bigint >= floor(extract(epoch from now()))::bigint
    and split_part(ticket,'.',4)=encode(extensions.hmac(convert_to(regexp_replace(ticket,'\.[^.]+$',''),'UTF8'),signing_key,'sha256'),'hex')
  ), handles as (
    select distinct p.handle from valid v join public.profiles p on p.id=v.uid
    left join bored_presence.settings s on s.user_id=v.uid
    where coalesce(s.visible,true) and v.generation=coalesce(s.generation,'00000000-0000-0000-0000-000000000000'::uuid)
    and p.handle is not null and p.handle <> ''
  )
  select coalesce((select jsonb_agg(handle order by lower(handle),handle) from handles),'[]'::jsonb),
    (select count(*) from raw where t ~ '^guest:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
  into names,guest_count;
  return jsonb_build_object('visible',true,'names',case when signed_in then names else '[]'::jsonb end,
    'registered',jsonb_array_length(names),'guests',guest_count);
end;
$$;
revoke all on function bored_presence.rpc_v2(text,jsonb) from public,anon,authenticated;
grant execute on function bored_presence.rpc_v2(text,jsonb) to anon,authenticated;
create or replace function public.bored_presence_v2(action text,args jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select bored_presence.rpc_v2(action,args);
$$;
revoke all on function public.bored_presence_v2(text,jsonb) from public,anon,authenticated;
grant execute on function public.bored_presence_v2(text,jsonb) to anon,authenticated;

create policy "bored presence v2 read" on realtime.messages for select to anon, authenticated
using (realtime.topic()='bored-online-v2' and extension='presence' and
  (auth.uid() is null or (select bored_presence.can_join())));
create policy "bored presence v2 track" on realtime.messages for insert to anon, authenticated
with check (realtime.topic()='bored-online-v2' and extension='presence' and
  (auth.uid() is null or (select bored_presence.can_join())));
-- The policy must also be evaluable for the anon role (returns false).
grant execute on function bored_presence.can_join() to anon;
