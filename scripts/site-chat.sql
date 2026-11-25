-- Chat history remains in RAM. Only reports, sanctions and the kill switch persist.
begin;
create schema if not exists bored_chat;
revoke all on schema bored_chat from public,anon,authenticated;
create table if not exists bored_chat.config (id boolean primary key default true check(id), enabled boolean not null default false);
insert into bored_chat.config(id) values(true) on conflict do nothing;
create table if not exists bored_chat.bans (user_id uuid primary key references auth.users(id) on delete cascade, until_at timestamptz not null);
create table if not exists bored_chat.reports (
  message_id uuid not null, reporter uuid not null, author uuid not null,
  handle text not null check(char_length(handle)<=160), message text not null check(char_length(message)<=300),
  created_at timestamptz not null default now(), primary key(message_id,reporter)
);
alter table bored_chat.config enable row level security;
alter table bored_chat.bans enable row level security;
alter table bored_chat.reports enable row level security;
revoke all on all tables in schema bored_chat from public,anon,authenticated;
create or replace function bored_chat.control(action text,args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if (select auth.jwt()->>'role') is distinct from 'service_role' then raise exception 'Forbidden' using errcode='42501'; end if;
  if action='state' then
    return jsonb_build_object('enabled',(select enabled from bored_chat.config where id),
      'bans',coalesce((select jsonb_object_agg(user_id,until_at) from bored_chat.bans where until_at>now()),'{}'::jsonb));
  elsif action='report' then
    delete from bored_chat.reports where created_at<now()-interval '30 days';
    insert into bored_chat.reports(message_id,reporter,author,handle,message)
    values((args->>'id')::uuid,(args->>'reporter')::uuid,(args->>'author')::uuid,args->>'handle',args->>'text')
    on conflict do nothing;
  elsif action='reports' then
    return coalesce((select jsonb_agg(to_jsonb(r)) from (select * from bored_chat.reports where created_at>=now()-interval '30 days' order by created_at desc limit 100) r),'[]'::jsonb);
  elsif action='enable' then
    update bored_chat.config set enabled=(args->>'enabled')::boolean where id;
  elsif action='ban' then
    insert into bored_chat.bans(user_id,until_at) values((args->>'user')::uuid,now()+make_interval(secs=>greatest(60,least(31536000,(args->>'seconds')::integer))))
    on conflict(user_id) do update set until_at=excluded.until_at;
  elsif action='unban' then
    delete from bored_chat.bans where user_id=(args->>'user')::uuid;
  else raise exception 'Unknown action';
  end if;
  return jsonb_build_object('ok',true);
end;
$$;
revoke all on function bored_chat.control(text,jsonb) from public,anon,authenticated;
grant usage on schema bored_chat to service_role;
grant execute on function bored_chat.control(text,jsonb) to service_role;
create or replace function public.bored_chat_control(action text,args jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$select bored_chat.control(action,args)$$;
revoke all on function public.bored_chat_control(text,jsonb) from public,anon,authenticated;
grant execute on function public.bored_chat_control(text,jsonb) to service_role;
commit;
