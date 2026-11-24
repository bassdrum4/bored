-- Run once on the Bored Supabase project. Admins are the existing analytics_admins roster.
-- Existing projects get the poll/question columns and answer rules from
-- supabase/migrations/20261123213000_announcement_polls.sql; this file is the
-- complete fresh-install schema.
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  body text not null check (char_length(body) between 1 and 1000),
  audience text not null check (audience in ('everyone','registered','selected')),
  recipient_id uuid references public.profiles(id) on delete cascade,
  priority text not null default 'normal' check (priority in ('normal','important')),
  -- message tells, poll asks with up to 8 listed answers, question asks for text.
  kind text not null default 'message' check (kind in ('message','poll','question')),
  options jsonb,
  link_url text check (link_url is null or link_url ~ '^#[a-z0-9][a-z0-9-]{0,49}$'),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint announcement_target_consistency check (
    (audience = 'selected' and recipient_id is not null)
    or (audience in ('everyone','registered') and recipient_id is null)
  ),
  constraint announcement_expiration_valid check (expires_at is null or expires_at > published_at),
  constraint announcements_options_valid check (
    (kind = 'poll' and jsonb_typeof(options) = 'array'
      and jsonb_array_length(options) between 2 and 8)
    or (kind <> 'poll' and options is null)
  )
);
create index if not exists announcements_recent on public.announcements (created_at desc);
create index if not exists announcements_recipients on public.announcements (recipient_id, created_at desc) where recipient_id is not null;
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;
grant insert, update on public.announcements to authenticated;
create policy "guests read public announcements" on public.announcements
for select to anon using (
  active and published_at <= now() and (expires_at is null or expires_at > now())
  and audience = 'everyone'
);
create policy "members read their announcements" on public.announcements
for select to authenticated using (
  active and published_at <= now() and (expires_at is null or expires_at > now())
  and (audience in ('everyone','registered') or recipient_id = (select auth.uid()))
);
create policy "admins read announcement history" on public.announcements
for select to authenticated using ((select public.is_analytics_admin()));
create policy "admins publish announcements" on public.announcements
for insert to authenticated with check (
  (select public.is_analytics_admin()) and created_by = (select auth.uid())
);
create policy "admins manage announcements" on public.announcements
for update to authenticated using ((select public.is_analytics_admin()))
with check ((select public.is_analytics_admin()) and created_by is not null);
create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index if not exists announcement_reads_user on public.announcement_reads (user_id, read_at desc);
alter table public.announcement_reads enable row level security;
revoke all on public.announcement_reads from anon, authenticated;
grant select, insert on public.announcement_reads to authenticated;
create policy "players read own receipts and admins see counts" on public.announcement_reads
for select to authenticated using (user_id = (select auth.uid()) or (select public.is_analytics_admin()));
create policy "players acknowledge only visible announcements" on public.announcement_reads
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.announcements a where a.id = announcement_id)
);

-- One answer per account per announcement. A poll vote may be changed; a
-- written answer may be edited. Writes go through respond_to_announcement so
-- the browser cannot forge a choice, answer as someone else, or answer an
-- announcement it cannot see.
create table if not exists public.announcement_responses (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  -- A guest vote has no account: it is keyed to a random id the browser keeps.
  guest_id uuid,
  choice text,
  answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One row per account, and (below) one per guest browser id. A guest row
  -- has a null user_id, which a primary key cannot hold, so this is a unique
  -- constraint and the guest rule is a partial unique index.
  constraint announcement_responses_account unique (announcement_id, user_id),
  constraint announcement_response_identity check (
    (user_id is not null and guest_id is null)
    or (user_id is null and guest_id is not null)
  ),
  constraint announcement_response_shape check (
    (choice is not null and answer is null)
    or (choice is null and answer is not null)
  ),
  constraint announcement_response_choice_length
    check (choice is null or char_length(choice) between 1 and 120),
  constraint announcement_response_answer_length
    check (answer is null or char_length(answer) between 1 and 1000)
);
create index if not exists announcement_responses_recent
  on public.announcement_responses (announcement_id, updated_at desc);
-- Nulls are distinct in the primary key, so guests need their own one-row rule.
create unique index if not exists announcement_responses_guest
  on public.announcement_responses (announcement_id, guest_id)
  where guest_id is not null;
alter table public.announcement_responses enable row level security;
revoke all on public.announcement_responses from anon, authenticated;
grant select on public.announcement_responses to authenticated;
create policy "players read their own answers and admins read all"
on public.announcement_responses
for select to authenticated using (
  user_id = (select auth.uid()) or (select public.is_analytics_admin())
);

drop function if exists public.respond_to_announcement(uuid, text, text);
create or replace function public.respond_to_announcement(
  p_announcement uuid,
  p_choice text default null,
  p_answer text default null,
  p_guest uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := (select auth.uid());
  guest uuid := case when (select auth.uid()) is null then p_guest else null end;
  post public.announcements%rowtype;
  picked text := nullif(btrim(coalesce(p_choice, '')), '');
  written text := nullif(btrim(coalesce(p_answer, '')), '');
begin
  if me is null and guest is null then raise exception 'Sign in to answer.'; end if;
  select * into post from public.announcements where id = p_announcement;
  if post.id is null then raise exception 'That announcement is gone.'; end if;
  if not post.active or post.published_at > now()
     or (post.expires_at is not null and post.expires_at <= now()) then
    raise exception 'That announcement is no longer open.';
  end if;
  if guest is not null then
    if post.audience <> 'everyone' then
      raise exception 'Sign in to answer this announcement.';
    end if;
    if post.kind <> 'poll' then
      raise exception 'Sign in to answer questions.';
    end if;
  elsif not (post.audience in ('everyone', 'registered') or post.recipient_id = me) then
    raise exception 'That announcement is not for this account.';
  end if;
  if post.kind = 'poll' then
    if picked is null or not exists (
      select 1 from jsonb_array_elements_text(post.options) as option(value)
      where value = picked
    ) then
      raise exception 'Choose one of the listed answers.';
    end if;
    if guest is not null then
      insert into public.announcement_responses (announcement_id, guest_id, choice)
      values (p_announcement, guest, picked)
      on conflict (announcement_id, guest_id) where guest_id is not null do update
        set choice = excluded.choice, answer = null, updated_at = now();
    else
      insert into public.announcement_responses (announcement_id, user_id, choice)
      values (p_announcement, me, picked)
      on conflict (announcement_id, user_id) do update
        set choice = excluded.choice, answer = null, updated_at = now();
    end if;
    return jsonb_build_object('choice', picked);
  end if;
  if post.kind = 'question' then
    if written is null then raise exception 'Write an answer first.'; end if;
    if char_length(written) > 1000 then
      raise exception 'Keep the answer under 1000 characters.';
    end if;
    insert into public.announcement_responses (announcement_id, user_id, answer)
    values (p_announcement, me, written)
    on conflict (announcement_id, user_id) do update
      set answer = excluded.answer, choice = null, updated_at = now();
    return jsonb_build_object('answer', written);
  end if;
  raise exception 'This announcement does not take answers.';
end
$function$;
revoke all on function public.respond_to_announcement(uuid, text, text, uuid) from public, anon;
grant execute on function public.respond_to_announcement(uuid, text, text, uuid) to anon, authenticated;

create or replace function public.announcement_results(p_announcement uuid)
returns table (choice text, votes bigint)
language sql
security definer
set search_path = ''
stable
as $function$
  select r.choice, count(*)::bigint as votes
  from public.announcement_responses r
  where r.announcement_id = p_announcement
    and r.choice is not null
    and exists (
      select 1 from public.announcements a
      where a.id = p_announcement
        and a.kind = 'poll'
        and a.active
        and a.published_at <= now()
        and (a.expires_at is null or a.expires_at > now())
        and (a.audience = 'everyone'
             or ((select auth.uid()) is not null
                 and (a.audience = 'registered' or a.recipient_id = (select auth.uid())))
             or (select public.is_analytics_admin()))
    )
  group by r.choice;
$function$;
revoke all on function public.announcement_results(uuid) from public, anon;
grant execute on function public.announcement_results(uuid) to anon, authenticated;
