-- Feedback for Bored: one table for free-form notes and the optional 1-5
-- enjoyment rating. It replaces the old public.feedback and
-- public.enjoyment_feedback tables: 20261118130000_unified_feedback.sql copied
-- their rows here, then 20261118150000_drop_legacy_feedback_tables.sql removed
-- them.
--
-- Paste this into the Supabase SQL editor, or run:
--   npm run feedback:setup            # shows the table's state and this SQL
--   SUPABASE_ACCESS_TOKEN=sbp_... npm run feedback:setup -- --apply
--
-- Players may append with the publishable key and never read a row back.
-- Analytics admins may select and delete through the dashboard page.

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

alter table public.feedback_entries enable row level security;
revoke all on public.feedback_entries from public, anon, authenticated;
grant insert on public.feedback_entries to anon, authenticated;
grant select, delete on public.feedback_entries to authenticated;

drop policy if exists feedback_entries_append on public.feedback_entries;
create policy feedback_entries_append on public.feedback_entries
  for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));

-- is_analytics_admin() comes from the analytics migrations. The dashboard is
-- the only reader; scoped game readers never see feedback.
drop policy if exists feedback_entries_admin_read on public.feedback_entries;
create policy feedback_entries_admin_read on public.feedback_entries
  for select to authenticated
  using ((select public.is_analytics_admin()));

drop policy if exists feedback_entries_admin_delete on public.feedback_entries;
create policy feedback_entries_admin_delete on public.feedback_entries
  for delete to authenticated
  using ((select public.is_analytics_admin()));
