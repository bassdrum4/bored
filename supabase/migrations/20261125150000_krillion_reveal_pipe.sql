-- The daily dive now fetches today's reveal in the browser and scores it with
-- the rules the game ships; the server keeps only the run. That retires the
-- Postgres answer bank (and the pg_net/pg_cron harvest behind it), which only
-- existed because a 33 MB reveal cannot be indexed inside an Edge Function.
--
-- A run keeps the prompts it was served, in order, so a state read never has to
-- ask the reference site again — including after midnight.

alter table public.krillion_runs
  add column if not exists day_number integer not null default 0;

comment on column public.krillion_runs.day_number is
  'The dive day the run was started for, so a state read does not need the reference site.';
comment on column public.krillion_runs.prompts is
  'The seven prompts the run was served, in order.';

do $mig$ begin
  perform cron.unschedule('krillion-refresh');
exception when others then null; end $mig$;

do $mig$ begin
  perform cron.unschedule('krillion-harvest');
exception when others then null; end $mig$;

drop function if exists public.krillion_harvest();
drop function if exists public.krillion_refresh(text);
drop function if exists public.krillion_bank_ready(text);
drop function if exists public.krillion_clear_bank(text);
drop function if exists public.krillion_review(text, text, integer);
drop function if exists public.krillion_hint(text, text);
drop function if exists public.krillion_match_answer(text, text, text);
drop function if exists public.krillion_store_book(text, jsonb);
drop function if exists public.krillion_build_bank(text, jsonb);
drop function if exists public.krillion_build_prompt(text, text, jsonb);
drop function if exists public.krillion_tier_score(text);
drop function if exists public.krillion_number(text);
drop function if exists public.krillion_bare(text);
drop function if exists public.krillion_random_prompts(integer);

drop table if exists public.krillion_answer_keys;
drop table if exists public.krillion_fetches;
drop table if exists public.krillion_books;
