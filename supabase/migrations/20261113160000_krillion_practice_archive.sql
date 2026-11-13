-- Unlimited dives ask seven prompts drawn at random from past dives, and are
-- stored like daily dives: the run row remembers which prompts it asked so the
-- function can score against the days they came from. Answers stay in
-- krillion_books; the client never receives them before it answers.

alter table public.krillion_runs
  add column if not exists prompts jsonb not null default '[]'::jsonb;

comment on column public.krillion_runs.prompts is
  'Practice dives only: the prompts drawn from the archive, as [{id, text, date}].';

create or replace function public.krillion_random_prompts(p_count integer default 7)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(entry), '[]'::jsonb)
  from (
    select entry
    from (
      -- One row per question: a dive should never ask the same prompt twice.
      -- Days before today only, so the live answer key cannot be sampled.
      select distinct on (prompt ->> 'text')
             jsonb_build_object('id', prompt ->> 'id', 'text', prompt ->> 'text', 'date', book.date) as entry
      from public.krillion_books book
      cross join lateral jsonb_array_elements(book.book -> 'prompts') prompt
      where book.date < to_char((now() at time zone 'America/New_York')::date, 'YYYY-MM-DD')
        and nullif(prompt ->> 'id', '') is not null
      order by prompt ->> 'text', random()
    ) unique_prompts
    order by random()
    limit least(greatest(coalesce(p_count, 7), 1), 7)
  ) picked;
$$;

revoke all on function public.krillion_random_prompts(integer) from public;
revoke all on function public.krillion_random_prompts(integer) from anon;
revoke all on function public.krillion_random_prompts(integer) from authenticated;
grant execute on function public.krillion_random_prompts(integer) to service_role;

comment on function public.krillion_random_prompts(integer) is
  'Random archived Krillion prompts for unlimited dives; service role only.';
