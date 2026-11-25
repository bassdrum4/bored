-- Only the opt-out preference persists. Presence tickets expire and contain no
-- name/email. The actual online membership lives in Realtime, not Postgres.
create schema if not exists bored_presence;
revoke all on schema bored_presence from public, anon, authenticated;
grant usage on schema bored_presence to authenticated;
create table if not exists bored_presence.settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  visible boolean not null default true,
  generation uuid not null default gen_random_uuid()
);
alter table bored_presence.settings enable row level security;
revoke all on bored_presence.settings from public, anon, authenticated;
create table if not exists bored_presence.secret (
  singleton boolean primary key default true check (singleton),
  key bytea not null
);
alter table bored_presence.secret enable row level security;
revoke all on bored_presence.secret from public, anon, authenticated;
insert into bored_presence.secret(key) values (extensions.gen_random_bytes(32)) on conflict do nothing;

create or replace function bored_presence.rpc(action text, args jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  pref boolean;
  gen uuid;
  signing_key bytea;
  claim text;
  expiry bigint := floor(extract(epoch from now()))::bigint + 360;
  result jsonb;
begin
  if me is null or coalesce(auth.jwt()->>'is_anonymous','false') = 'true' then
    raise exception 'Sign in first' using errcode='42501';
  end if;
  if action = 'set' then
    if jsonb_typeof(args->'visible') is distinct from 'boolean' then
      raise exception 'Invalid presence preference' using errcode='22023';
    end if;
    insert into bored_presence.settings(user_id,visible)
      values(me,(args->>'visible')::boolean)
      on conflict(user_id) do update set visible=excluded.visible, generation=gen_random_uuid()
      where bored_presence.settings.visible is distinct from excluded.visible;
  end if;
  select s.visible,s.generation into pref,gen from bored_presence.settings s where s.user_id=me;
  pref := coalesce(pref,true);
  gen := coalesce(gen,'00000000-0000-0000-0000-000000000000'::uuid);
  if action in ('get','set') then
    if not pref then return jsonb_build_object('visible',false); end if;
    select s.key into signing_key from bored_presence.secret s where singleton;
    claim := me::text || '.' || gen::text || '.' || expiry::text;
    return jsonb_build_object('visible',true,'ticket',claim || '.' ||
      encode(extensions.hmac(convert_to(claim,'UTF8'), signing_key,'sha256'),'hex'));
  elsif action='resolve' then
    if not pref then return jsonb_build_object('visible',false,'names','[]'::jsonb); end if;
    if jsonb_typeof(args->'tickets') is distinct from 'array' or jsonb_array_length(args->'tickets') > 300 then
      raise exception 'Invalid tickets' using errcode='22023';
    end if;
    select s.key into signing_key from bored_presence.secret s where singleton;
    with raw as materialized (
      select distinct value as ticket from jsonb_array_elements_text(args->'tickets')
      where value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9]{1,12}\.[0-9a-f]{64}$'
    ), verified as materialized (
      select split_part(ticket,'.',1)::uuid as uid,split_part(ticket,'.',2)::uuid as generation
      from raw where split_part(ticket,'.',3)::bigint >= floor(extract(epoch from now()))::bigint
      and split_part(ticket,'.',4)=encode(extensions.hmac(convert_to(regexp_replace(ticket,'\.[^.]+$',''),'UTF8'),signing_key,'sha256'),'hex')
    ), names as (
      select distinct p.handle from verified v join public.profiles p on p.id=v.uid
      left join bored_presence.settings s on s.user_id=v.uid
      where coalesce(s.visible,true) and v.generation=coalesce(s.generation,'00000000-0000-0000-0000-000000000000'::uuid)
      and p.handle is not null and p.handle <> ''
    )
    select coalesce(jsonb_agg(handle order by lower(handle),handle),'[]'::jsonb) into result from names;
    return jsonb_build_object('visible',true,'names',result);
  end if;
  raise exception 'Unknown presence action' using errcode='22023';
end;
$$;
revoke all on function bored_presence.rpc(text,jsonb) from public,anon,authenticated;
grant execute on function bored_presence.rpc(text,jsonb) to authenticated;
create or replace function public.bored_presence_rpc(action text,args jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select bored_presence.rpc(action,args);
$$;
revoke all on function public.bored_presence_rpc(text,jsonb) from public,anon,authenticated;
grant execute on function public.bored_presence_rpc(text,jsonb) to authenticated;

create or replace function bored_presence.can_join()
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null
    and coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
    and coalesce((select visible from bored_presence.settings where user_id=auth.uid()),true);
$$;
revoke all on function bored_presence.can_join() from public,anon,authenticated;
grant execute on function bored_presence.can_join() to authenticated;

-- A private channel, scoped to this feature. No broad changes to existing live rooms.
create policy "bored presence read" on realtime.messages for select to authenticated
using (realtime.topic()='bored-online-v1' and extension='presence' and (select bored_presence.can_join()));
create policy "bored presence track" on realtime.messages for insert to authenticated
with check (realtime.topic()='bored-online-v1' and extension='presence' and (select bored_presence.can_join()));
