-- Bound scheduled maintenance without changing retention or foreground requests.
-- The pg_cron worker uses a fresh libpq connection, so SET applies to the
-- following SELECT, not to unrelated player traffic.
do $$
declare j record; budget text; call_sql text;
begin
  for j in select jobid, jobname from cron.job where jobname in (
    'bored-play-events-retention','bored-together-retention','bored-live-retention',
    'bored-popularity-daily','bored-product-events-retention','krillion-refresh','krillion-harvest')
  loop
    budget := case when j.jobname = 'krillion-harvest' then '100s' else '45s' end;
    call_sql := case j.jobname
      when 'bored-play-events-retention' then 'public.purge_play_events(180)'
      when 'bored-together-retention' then 'bored_together.cleanup()'
      when 'bored-live-retention' then 'bored_live.cleanup()'
      when 'bored-popularity-daily' then 'public.refresh_bored_popularity_snapshot()'
      when 'bored-product-events-retention' then 'public.purge_product_events(90)'
      when 'krillion-refresh' then 'public.krillion_refresh()'
      when 'krillion-harvest' then 'public.krillion_harvest()'
    end;
    perform cron.alter_job(j.jobid, command := format(
      'SET statement_timeout = %L; SET lock_timeout = %L; SET work_mem = %L; SET hash_mem_multiplier = 1; SET max_parallel_workers_per_gather = 0; SELECT %s WHERE pg_try_advisory_xact_lock(20261124, 1);',
      budget, '2s', '2MB', call_sql));
  end loop;
end $$;

-- Limit resource-heavy functions even when the Edge Function invokes them.
alter function public.krillion_build_bank(text,jsonb) set work_mem = '2MB';
alter function public.krillion_build_bank(text,jsonb) set hash_mem_multiplier = 1;
alter function public.krillion_build_bank(text,jsonb) set max_parallel_workers_per_gather = 0;
alter function public.krillion_build_prompt(text,text,jsonb) set work_mem = '2MB';
alter function public.krillion_build_prompt(text,text,jsonb) set hash_mem_multiplier = 1;
alter function public.krillion_build_prompt(text,text,jsonb) set max_parallel_workers_per_gather = 0;
alter function public.krillion_harvest() set work_mem = '2MB';
alter function public.krillion_harvest() set hash_mem_multiplier = 1;
alter function public.krillion_harvest() set max_parallel_workers_per_gather = 0;

-- These server-only functions are invoked using the service role by the Edge
-- Function, or by postgres via cron. Do not let public callers rebuild or clear
-- the bank, enqueue upstream HTTP requests, or bypass the game's scoring API.
revoke execute on function public.krillion_build_bank(text,jsonb),
  public.krillion_build_prompt(text,text,jsonb), public.krillion_harvest(),
  public.krillion_refresh(text), public.krillion_clear_bank(text),
  public.krillion_store_book(text,jsonb), public.krillion_match_answer(text,text,text),
  public.krillion_hint(text,text), public.krillion_review(text,text,integer)
  from public, anon, authenticated;
grant execute on function public.krillion_build_bank(text,jsonb),
  public.krillion_build_prompt(text,text,jsonb), public.krillion_harvest(),
  public.krillion_refresh(text), public.krillion_clear_bank(text),
  public.krillion_store_book(text,jsonb), public.krillion_match_answer(text,text,text),
  public.krillion_hint(text,text), public.krillion_review(text,text,integer)
  to service_role;
