-- Polls are answerable without an account. A guest has no row in auth.users,
-- so their vote is keyed to a random id the browser keeps: one vote per guest
-- id per poll, changeable like an account's, and their own choice is still
-- shown back to them. Open-ended questions stay account-only — there is
-- nowhere durable to attribute an anonymous written answer and no way to show
-- it back to its author.
--
-- Guest rows carry a null user_id. The account rule is a unique constraint on
-- (announcement_id, user_id); Postgres treats nulls as distinct there, so
-- several guests can answer the same poll, while the partial unique index
-- below holds each guest id to one row per announcement.

begin;

-- A primary key cannot hold a null, so the account rule becomes a unique
-- constraint with the same meaning: one row per account per announcement.
alter table public.announcement_responses
  drop constraint if exists announcement_responses_pkey;
alter table public.announcement_responses
  drop constraint if exists announcement_responses_account;
alter table public.announcement_responses
  add constraint announcement_responses_account unique (announcement_id, user_id);

alter table public.announcement_responses
  alter column user_id drop not null,
  add column if not exists guest_id uuid;

alter table public.announcement_responses
  drop constraint if exists announcement_response_identity;
alter table public.announcement_responses
  add constraint announcement_response_identity check (
    (user_id is not null and guest_id is null)
    or (user_id is null and guest_id is not null)
  );

create unique index if not exists announcement_responses_guest
  on public.announcement_responses (announcement_id, guest_id)
  where guest_id is not null;

-- The identity now comes from the session or from the browser's guest id, so
-- the function takes one more argument. Drop the old signature rather than
-- leaving an overload PostgREST would have to disambiguate.
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
    -- A guest only sees public announcements, and only polls take votes from
    -- someone with no account to attribute a written answer to.
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

-- The tally for one poll, and nothing about who chose what. A signed-in
-- player sees polls delivered to them; a guest sees public polls only.
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

notify pgrst, 'reload schema';

commit;
