-- Puffer Party room state. The Edge Function owns both tables with the service
-- role; RLS without policies keeps them off the anon and authenticated APIs.
create table if not exists public.party_rooms (
  code text primary key,
  state jsonb not null,
  status text not null default 'lobby',
  listed boolean not null default true,
  seats integer not null default 6,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.party_rooms enable row level security;
create index if not exists party_rooms_listing_idx on public.party_rooms (listed, status, updated_at desc);

create table if not exists public.party_ratings (
  token text primary key,
  rating integer not null default 1200,
  games integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.party_ratings enable row level security;

comment on table public.party_rooms is 'Puffer Party room snapshots for the puffer-party Edge Function.';
comment on table public.party_ratings is 'Anonymous per-browser Puffer Party ratings.';
