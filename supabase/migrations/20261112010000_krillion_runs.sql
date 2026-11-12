-- One row per dive. The Edge Function owns this table with the service role;
-- RLS with no policies keeps it off the anon and authenticated APIs.
create table if not exists public.krillion_runs (
  id uuid primary key,
  date text not null,
  mode text not null default 'daily',
  round integer not null default 0,
  round_start bigint,
  paused_at bigint,
  completed boolean not null default false,
  results jsonb not null default '[]'::jsonb,
  hint_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.krillion_runs enable row level security;
create index if not exists krillion_runs_date_idx on public.krillion_runs (date);

comment on table public.krillion_runs is 'Daily Krillion run state for the krillion Edge Function.';
