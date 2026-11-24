-- Static snapshots supersede the database answer bank on successful days.
-- A missing marker deliberately preserves the existing SQL fallback.
create table if not exists public.krillion_static_days (
  date text primary key check (date ~ '^\d{4}-\d{2}-\d{2}$'),
  noted_at timestamptz not null default now()
);
alter table public.krillion_static_days enable row level security;
revoke all on public.krillion_static_days from public, anon, authenticated;
grant select,insert on public.krillion_static_days to service_role;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname='krillion-refresh' loop
    perform cron.alter_job(j.jobid, schedule := '10 7 * * *',
      command := $job$SET statement_timeout='45s'; SET lock_timeout='2s'; SET work_mem='2MB'; SET hash_mem_multiplier=1; SET max_parallel_workers_per_gather=0;
      SELECT public.krillion_refresh()
      WHERE pg_try_advisory_xact_lock(20261124,1)
        AND NOT EXISTS (SELECT 1 FROM public.krillion_static_days WHERE date=to_char(now() at time zone 'America/New_York','YYYY-MM-DD'));$job$);
  end loop;
end $$;
