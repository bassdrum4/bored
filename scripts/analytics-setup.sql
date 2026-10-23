-- Gameplay events are insert-only. Identity is enforced by RLS, never a handle supplied by a client.
begin;
create table public.analytics_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.analytics_admins enable row level security;
revoke all on public.analytics_admins from anon, authenticated;
grant select on public.analytics_admins to authenticated;
create policy "admins see their own membership" on public.analytics_admins for select to authenticated
  using (user_id = (select auth.uid()));

create table public.play_events (
  id uuid primary key,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  game text not null check (game ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  kind text not null check (kind in ('start','checkpoint','end','daily_complete','error')),
  received_at timestamptz not null default now(),
  active_ms integer not null default 0 check (active_ms between 0 and 65000),
  visible_ms integer not null default 0 check (visible_ms between 0 and 65000 and visible_ms >= active_ms),
  details jsonb not null default '{}' check (jsonb_typeof(details) = 'object' and octet_length(details::text) <= 4096)
);
create index play_events_time_idx on public.play_events(received_at, id);
create index play_events_user_time_idx on public.play_events(user_id, received_at);
create index play_events_session_idx on public.play_events(session_id);
alter table public.play_events enable row level security;
revoke all on public.play_events from anon, authenticated;
grant insert (id,session_id,user_id,game,kind,active_ms,visible_ms,details) on public.play_events to anon, authenticated;
grant select on public.play_events to authenticated;
create policy "clients append their own telemetry" on public.play_events for insert to anon, authenticated
  with check (user_id is not distinct from (select auth.uid()));
create policy "only analytics admins read activity" on public.play_events for select to authenticated
  using (exists (select 1 from public.analytics_admins a where a.user_id = (select auth.uid())));
-- No client can update/delete events, change timestamps, or grant themselves admin access.
commit;
