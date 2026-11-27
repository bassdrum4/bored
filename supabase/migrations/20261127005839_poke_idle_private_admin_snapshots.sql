create table if not exists public.poke_idle_admin_snapshots (
 user_id uuid primary key references auth.users(id) on delete cascade,
 snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 4096),
 updated_at timestamptz not null default now()
);
alter table public.poke_idle_admin_snapshots enable row level security;
revoke all on public.poke_idle_admin_snapshots from public, anon, authenticated;
grant select on public.poke_idle_admin_snapshots to authenticated;
create policy poke_idle_admin_read on public.poke_idle_admin_snapshots for select to authenticated
using ((select public.is_analytics_admin()) or exists (select 1 from public.game_analytics_readers g where g.user_id=(select auth.uid()) and g.game='poke-idle'));
create or replace function public.save_poke_idle_admin_snapshot(p_snapshot jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid();
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 if p_snapshot is null or jsonb_typeof(p_snapshot) <> 'object' or p_snapshot->'v' is distinct from '1'::jsonb or octet_length(p_snapshot::text)>4096 or not (p_snapshot ? 'classic' and p_snapshot ? 'story') or (p_snapshot->'classic'='null'::jsonb and p_snapshot->'story'='null'::jsonb) then
  raise exception 'invalid snapshot' using errcode='22023';
 end if;
 insert into public.poke_idle_admin_snapshots(user_id,snapshot) values(uid,p_snapshot)
 on conflict(user_id) do update set snapshot=excluded.snapshot,updated_at=now()
 where public.poke_idle_admin_snapshots.snapshot is distinct from excluded.snapshot and public.poke_idle_admin_snapshots.updated_at < now()-interval '30 seconds';
end; $$;
revoke all on function public.save_poke_idle_admin_snapshot(jsonb) from public,anon,authenticated;
grant execute on function public.save_poke_idle_admin_snapshot(jsonb) to authenticated;
