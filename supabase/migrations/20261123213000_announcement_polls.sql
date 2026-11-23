-- Announcements can now ask as well as tell: a plain message, a poll with 2–8
-- answers, or an open-ended question. Answers belong to an account and there is
-- one per account per announcement; a poll vote can be changed.
--
-- Writing goes through a function rather than a table grant so the browser
-- cannot forge a choice that is not on the poll, attach an answer to somebody
-- else, or answer an announcement it cannot see. Admins read every answer on
-- the analytics page; a signed-in player can read only their own, plus the
-- aggregate tally of a poll they can see. Guests read announcements but do not
-- vote, since there is nothing durable to attribute a guest answer to.

begin;

alter table public.announcements
  add column if not exists kind text not null default 'message',
  add column if not exists options jsonb;

alter table public.announcements drop constraint if exists announcements_kind_valid;
alter table public.announcements add constraint announcements_kind_valid
  check (kind in ('message', 'poll', 'question'));

alter table public.announcements drop constraint if exists announcements_options_valid;
alter table public.announcements add constraint announcements_options_valid check (
  (kind = 'poll' and jsonb_typeof(options) = 'array'
    and jsonb_array_length(options) between 2 and 8)
  or (kind <> 'poll' and options is null)
);

create table if not exists public.announcement_responses (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  choice text,
  answer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (announcement_id, user_id),
  -- A response is either a poll choice or a written answer, never both.
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

alter table public.announcement_responses enable row level security;
revoke all on public.announcement_responses from anon, authenticated;
-- Reads only: every write arrives through respond_to_announcement below.
grant select on public.announcement_responses to authenticated;
create policy "players read their own answers and admins read all"
on public.announcement_responses
for select to authenticated using (
  user_id = (select auth.uid()) or (select public.is_analytics_admin())
);

create or replace function public.respond_to_announcement(
  p_announcement uuid,
  p_choice text default null,
  p_answer text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  me uuid := (select auth.uid());
  post public.announcements%rowtype;
  picked text := nullif(btrim(coalesce(p_choice, '')), '');
  written text := nullif(btrim(coalesce(p_answer, '')), '');
begin
  if me is null then raise exception 'Sign in to answer.'; end if;

  select * into post from public.announcements where id = p_announcement;
  if post.id is null then raise exception 'That announcement is gone.'; end if;
  if not post.active or post.published_at > now()
     or (post.expires_at is not null and post.expires_at <= now()) then
    raise exception 'That announcement is no longer open.';
  end if;
  if not (post.audience in ('everyone', 'registered') or post.recipient_id = me) then
    raise exception 'That announcement is not for this account.';
  end if;

  if post.kind = 'poll' then
    if picked is null or not exists (
      select 1 from jsonb_array_elements_text(post.options) as option(value)
      where value = picked
    ) then
      raise exception 'Choose one of the listed answers.';
    end if;
    insert into public.announcement_responses (announcement_id, user_id, choice)
    values (p_announcement, me, picked)
    on conflict (announcement_id, user_id) do update
      set choice = excluded.choice, answer = null, updated_at = now();
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
revoke all on function public.respond_to_announcement(uuid, text, text) from public, anon;
grant execute on function public.respond_to_announcement(uuid, text, text) to authenticated;

-- The tally for one poll, and nothing about who chose what. Visible to a
-- signed-in player the announcement was delivered to, and to admins.
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
        and (a.audience in ('everyone', 'registered')
             or a.recipient_id = (select auth.uid())
             or (select public.is_analytics_admin()))
    )
  group by r.choice;
$function$;
revoke all on function public.announcement_results(uuid) from public, anon;
grant execute on function public.announcement_results(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
