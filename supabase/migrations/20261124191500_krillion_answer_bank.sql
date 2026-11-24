-- A daily book can hold a couple of hundred thousand answers: "name an album by
-- an artist with more than a million monthly listeners" lands ~195k, and the
-- reveal for that day is 33 MB. That does not fit an Edge Function's memory as a
-- JSON book, so the bank lives here as one row per accepted spelling and the
-- matching happens next to it. The function owns both with the service role.

create table if not exists public.krillion_answer_keys (
  date text not null,
  prompt_id text not null,
  key text not null,
  answer text not null,
  tier text not null,
  quip text,
  num integer,
  own boolean not null default false,
  ord bigint not null,
  primary key (date, prompt_id, key)
);

alter table public.krillion_answer_keys enable row level security;

create index if not exists krillion_answer_keys_ord_idx
  on public.krillion_answer_keys (date, prompt_id, ord);
create index if not exists krillion_answer_keys_num_idx
  on public.krillion_answer_keys (date, prompt_id, num) where num is not null;
create index if not exists krillion_answer_keys_prefix_idx
  on public.krillion_answer_keys (date, prompt_id, key text_pattern_ops);

comment on table public.krillion_answer_keys is
  'Krillion answer bank, one row per accepted spelling; matching runs in krillion_match_answer.';

-- The tiers score the same here as they do in the function.
create or replace function public.krillion_tier_score(p_tier text)
returns integer
language sql
immutable
as $$
  select case p_tier
    when 'krillion' then 100
    when 'deepcut' then 85
    when 'rare' then 60
    when 'schooler' then 30
    when 'tooclever' then 15
    else 10
  end
$$;

revoke all on function public.krillion_tier_score(text) from public, anon, authenticated;

-- One answer, checked the way the client always has: exact spelling first, then
-- a plural, a number written either way, a typo within the allowance, and at
-- last a natural-language qualifier. Ties go to the lower-scoring answer, and to
-- the earlier row when the score matches, so a misspelling is never worth more
-- than the answer it might have meant.
create or replace function public.krillion_match_answer(
  p_date text,
  p_prompt text,
  p_key text,
  p_num integer,
  p_allowance integer
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hit public.krillion_answer_keys%rowtype;
  wanted integer;
begin
  select * into hit
    from public.krillion_answer_keys
   where date = p_date and prompt_id = p_prompt and key = p_key
   order by ord
   limit 1;
  if found then
    return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip,
                              'correction', not hit.own);
  end if;

  if length(p_key) > 4 and right(p_key, 1) = 's' then
    select * into hit
      from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt and key = left(p_key, length(p_key) - 1)
     order by ord
     limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip,
                                'correction', true);
    end if;
  end if;

  if p_num is not null then
    select * into hit
      from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt and num = p_num
     order by ord
     limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip,
                                'correction', hit.key <> p_key);
    end if;
  end if;

  if p_allowance > 0 then
    select * into hit
      from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt
       and length(key) between length(p_key) - p_allowance and length(p_key) + p_allowance
       and levenshtein(key, p_key) <= p_allowance
     order by levenshtein(key, p_key), public.krillion_tier_score(tier), ord
     limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip,
                                'correction', true);
    end if;
  end if;

  select count(distinct key) into wanted
    from public.krillion_answer_keys
   where date = p_date and prompt_id = p_prompt
     and length(key) >= 4
     and length(key) < length(p_key)
     and length(p_key) - length(key) <= 16
     and left(p_key, length(key)) = key;
  if wanted = 1 then
    select * into hit
      from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt
       and length(key) >= 4
       and length(key) < length(p_key)
       and length(p_key) - length(key) <= 16
       and left(p_key, length(key)) = key
     order by length(key) desc, ord
     limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip,
                                'correction', true);
    end if;
  end if;

  return null;
end;
$$;

revoke all on function public.krillion_match_answer(text, text, text, integer, integer)
  from public, anon, authenticated;

-- The hint names the deepest answer of the round, and the answer sheet counts
-- every answer the round accepted.
create or replace function public.krillion_hint(p_date text, p_prompt text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'count', (select count(distinct answer) from public.krillion_answer_keys
               where date = p_date and prompt_id = p_prompt),
    'deepest', (
      select answer from public.krillion_answer_keys
       where date = p_date and prompt_id = p_prompt
       order by (tier = 'krillion') desc,
                case when tier = 'krillion' then ord else -ord end
       limit 1
    )
  )
$$;

revoke all on function public.krillion_hint(text, text) from public, anon, authenticated;

-- The answer sheet reads a bounded slice: a 195k-answer round cannot be printed,
-- and the sheet only promises a look at what landed.
create or replace function public.krillion_review(p_date text, p_prompt text, p_limit integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total', (select count(distinct answer) from public.krillion_answer_keys
               where date = p_date and prompt_id = p_prompt),
    'answers', coalesce((
      select jsonb_agg(entry order by score desc, answer)
      from (
        select distinct answer, tier, quip,
               public.krillion_tier_score(tier) as score
        from public.krillion_answer_keys
        where date = p_date and prompt_id = p_prompt
        limit greatest(1, least(500, p_limit))
      ) listed
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.krillion_review(text, text, integer) from public, anon, authenticated;

-- One call when a day is replaced, so a half-written bank is never answered from.
create or replace function public.krillion_clear_bank(p_date text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.krillion_answer_keys where date = p_date
$$;

revoke all on function public.krillion_clear_bank(text) from public, anon, authenticated;
