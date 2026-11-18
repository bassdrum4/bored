-- One feedback table for both things the arcade asks for: free-form notes and
-- the occasional 1-5 enjoyment rating with an optional comment.
--
-- Both old tables are copied here with their ids and timestamps intact and then
-- moved to bored_archive, so nothing is lost and no player-facing write has two
-- possible destinations. Notes stay write-only for players; only an analytics
-- admin may read or delete a row.
begin;

create table if not exists public.feedback_entries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('note','rating')),
  user_id uuid,
  visitor_id uuid,
  game text,
  rating smallint check (rating between 1 and 5),
  body text check (body is null or length(body) <= 2000),
  email text,
  page text,
  handle text,
  user_agent text,
  check ((kind = 'note' and body is not null and rating is null)
      or (kind = 'rating' and rating is not null))
);
create index if not exists feedback_entries_created_idx
  on public.feedback_entries(created_at desc);
create index if not exists feedback_entries_game_idx
  on public.feedback_entries(game, created_at desc) where game is not null;

-- Both old tables nulled the author on account deletion; keep that behaviour
-- without making the row unreadable. Guarded so the file is re-runnable.
do $fk$
begin
  if not exists (select 1 from pg_constraint where conname = 'feedback_entries_user_fk') then
    alter table public.feedback_entries
      add constraint feedback_entries_user_fk
      foreign key (user_id) references auth.users (id) on delete set null;
  end if;
end $fk$;

alter table public.feedback_entries enable row level security;
revoke all on public.feedback_entries from public, anon, authenticated;
grant insert on public.feedback_entries to anon, authenticated;
grant select, delete on public.feedback_entries to authenticated;

-- A player may only attach feedback to their own account; guests write a null
-- user_id. Nothing here can read another row back.
drop policy if exists feedback_entries_append on public.feedback_entries;
create policy feedback_entries_append on public.feedback_entries
  for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

drop policy if exists feedback_entries_admin_read on public.feedback_entries;
create policy feedback_entries_admin_read on public.feedback_entries
  for select to authenticated
  using ((select public.is_analytics_admin()));

drop policy if exists feedback_entries_admin_delete on public.feedback_entries;
create policy feedback_entries_admin_delete on public.feedback_entries
  for delete to authenticated
  using ((select public.is_analytics_admin()));

-- Staff activity is not player feedback, and a scoped game reader's own survey
-- answers for the games they read stay out of the reports.
drop policy if exists analytics_exclude_admin_insert on public.feedback_entries;
create policy analytics_exclude_admin_insert on public.feedback_entries
  as restrictive for insert to authenticated
  with check (not (select public.is_analytics_admin()));

drop policy if exists exclude_game_reader_feedback_insert on public.feedback_entries;
create policy exclude_game_reader_feedback_insert on public.feedback_entries
  as restrictive for insert to authenticated
  with check (not exists (
    select 1 from public.game_analytics_readers r
    where r.user_id = (select auth.uid())
      and (feedback_entries.game is null or r.game = feedback_entries.game)
  ));

insert into public.feedback_entries
  (id, created_at, kind, user_id, body, email, page, handle, user_agent)
select id, created_at, 'note', user_id, message, email, page, handle, user_agent
from public.feedback
on conflict (id) do nothing;

insert into public.feedback_entries
  (id, created_at, kind, user_id, visitor_id, game, rating, body)
select id, created_at, 'rating', user_id, visitor_id, game, rating,
       nullif(trim(comment), '')
from public.enjoyment_feedback
on conflict (id) do nothing;

comment on table public.feedback_entries is
  'Player feedback: free-form notes and 1-5 enjoyment ratings. Players append only; analytics admins read and delete.';

alter table public.feedback set schema bored_archive;
alter table public.enjoyment_feedback set schema bored_archive;

notify pgrst,'reload schema';
commit;
