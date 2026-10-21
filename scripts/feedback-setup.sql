-- Feedback for Bored.
-- Paste this into the Supabase SQL editor, or run:
--   npm run feedback:setup            # shows the table's state and this SQL
--   SUPABASE_ACCESS_TOKEN=sbp_... npm run feedback:setup -- --apply
--
-- Anyone may send a note through the site's publishable key. Nobody may read
-- the notes back with it: selects are revoked, so only the service key (or the
-- dashboard) can read the table.

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 4 and 2000),
  email text check (email is null or (char_length(email) between 3 and 120 and email like '%@%')),
  page text check (page is null or char_length(page) <= 200),
  handle text check (handle is null or char_length(handle) <= 40),
  user_id uuid references auth.users (id) on delete set null,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300)
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

drop policy if exists "anyone may send feedback" on public.feedback;
create policy "anyone may send feedback" on public.feedback
  for insert to anon, authenticated
  with check (true);

-- Insert only. Without this revoke, the publishable key could read every note.
revoke all on public.feedback from anon, authenticated;
grant insert on public.feedback to anon, authenticated;
