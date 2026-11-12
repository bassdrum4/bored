-- The day's validated Krillion answer book. The Edge Function writes and reads
-- this with the service role; RLS with no policies keeps it off the anon and
-- authenticated APIs. The board rule lives in src/games/score-rules.json and is
-- registered with `npm run games:register`, so this migration stays compatible
-- with the disposable Postgres used by the test suite.
create table if not exists public.krillion_books (
  date text primary key,
  day_number integer not null,
  source text not null,
  book jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.krillion_books enable row level security;

comment on table public.krillion_books is 'Cached daily Krillion reference books for the krillion Edge Function.';
