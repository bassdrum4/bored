-- The announcement tables were published straight from scripts/announcements.sql
-- and never entered the migration chain, so every disposable test database built
-- from supabase/migrations was missing them and the poll migration below could
-- not alter them. This is the original schema, unchanged, with idempotent
-- policy guards so running it against the live project (where the tables
-- already exist) is harmless.

-- The admin policies below ask the analytics roster. Disposable databases skip
-- the analytics migrations, so only there, and only when the real function is
-- absent, provide a stand-in that reports no admins. Never replaces the real
-- function on a project that has it.
do $analytics$
begin
  if to_regprocedure('public.is_analytics_admin()') is null then
    execute $fn$
      create function public.is_analytics_admin()
      returns boolean
      language plpgsql
      stable
      security definer
      set search_path = ''
      as $body$
      begin
        if to_regclass('public.analytics_admins') is null then return false; end if;
        return exists (
          select 1 from public.analytics_admins a where a.user_id = (select auth.uid())
        );
      end
      $body$;
    $fn$;
  end if;
end
$analytics$;

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 100),
  body text not null check (char_length(body) between 1 and 1000),
  audience text not null check (audience in ('everyone','registered','selected')),
  recipient_id uuid references public.profiles(id) on delete cascade,
  priority text not null default 'normal' check (priority in ('normal','important')),
  link_url text check (link_url is null or link_url ~ '^#[a-z0-9][a-z0-9-]{0,49}$'),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  published_at timestamptz not null default now(),
  expires_at timestamptz,
  constraint announcement_target_consistency check (
    (audience = 'selected' and recipient_id is not null)
    or (audience in ('everyone','registered') and recipient_id is null)
  ),
  constraint announcement_expiration_valid check (expires_at is null or expires_at > published_at)
);
create index if not exists announcements_recent on public.announcements (created_at desc);
create index if not exists announcements_recipients on public.announcements (recipient_id, created_at desc) where recipient_id is not null;
alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to anon, authenticated;
grant insert, update on public.announcements to authenticated;
drop policy if exists "guests read public announcements" on public.announcements;
create policy "guests read public announcements" on public.announcements
for select to anon using (
  active and published_at <= now() and (expires_at is null or expires_at > now())
  and audience = 'everyone'
);
drop policy if exists "members read their announcements" on public.announcements;
create policy "members read their announcements" on public.announcements
for select to authenticated using (
  active and published_at <= now() and (expires_at is null or expires_at > now())
  and (audience in ('everyone','registered') or recipient_id = (select auth.uid()))
);
drop policy if exists "admins read announcement history" on public.announcements;
create policy "admins read announcement history" on public.announcements
for select to authenticated using ((select public.is_analytics_admin()));
drop policy if exists "admins publish announcements" on public.announcements;
create policy "admins publish announcements" on public.announcements
for insert to authenticated with check (
  (select public.is_analytics_admin()) and created_by = (select auth.uid())
);
drop policy if exists "admins manage announcements" on public.announcements;
create policy "admins manage announcements" on public.announcements
for update to authenticated using ((select public.is_analytics_admin()))
with check ((select public.is_analytics_admin()) and created_by is not null);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
create index if not exists announcement_reads_user on public.announcement_reads (user_id, read_at desc);
alter table public.announcement_reads enable row level security;
revoke all on public.announcement_reads from anon, authenticated;
grant select, insert on public.announcement_reads to authenticated;
drop policy if exists "players read own receipts and admins see counts" on public.announcement_reads;
create policy "players read own receipts and admins see counts" on public.announcement_reads
for select to authenticated using (user_id = (select auth.uid()) or (select public.is_analytics_admin()));
drop policy if exists "players acknowledge only visible announcements" on public.announcement_reads;
create policy "players acknowledge only visible announcements" on public.announcement_reads
for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.announcements a where a.id = announcement_id)
);
