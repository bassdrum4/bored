-- The day's validated Krillion answer book. The Edge Function writes and reads
-- this with the service role; it is never exposed to the browser.
create table if not exists public.krillion_books (
  date text primary key,
  day_number integer not null,
  source text not null,
  book jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.krillion_books enable row level security;
revoke all on table public.krillion_books from anon, authenticated;
grant select, insert, update on table public.krillion_books to service_role;

comment on table public.krillion_books is 'Cached daily Krillion reference books for the krillion Edge Function.';

delete from public.score_rules where game = 'krillion';
insert into public.score_rules (game, label, better, max_value)
values ('krillion', 'Points in a finished seven-prompt dive', 'high', 700);
