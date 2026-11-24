-- Krillion's daily book can hold a couple of hundred thousand answers: "name an
-- album by an artist with more than a million monthly listeners" lands ~195k,
-- and the reference reveal for that day is 33 MB. That is more object graph, and
-- more CPU, than an Edge Function is given, so the work lives here:
--
--   pg_cron  → krillion_refresh()  asks pg_net for the reveal and /api/today
--   pg_cron  → krillion_harvest()  builds the answer bank once both arrive
--   function → krillion_match_answer() scores one answer against that bank
--
-- The bank is one row per accepted spelling, so a round costs an index lookup
-- instead of a scan of a JSON book held in memory.

do $$ begin create extension if not exists unaccent with schema public;
exception when others then raise notice 'unaccent unavailable: %', sqlerrm; end $$;

-- levenshtein() for the typo pass.
do $$ begin create extension if not exists fuzzystrmatch;
exception when others then raise notice 'fuzzystrmatch unavailable: %', sqlerrm; end $$;

-- The reference site has no CORS headers and its reveal is 33 MB, so the fetch
-- belongs in the database rather than in a request.
do $$ begin create extension if not exists pg_net;
exception when others then raise notice 'pg_net unavailable: %', sqlerrm; end $$;

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

-- One row per day being fetched: the pg_net request ids and whether the bank has
-- been built. A day is served only once its book row exists.
create table if not exists public.krillion_fetches (
  date text primary key,
  reveal_id bigint,
  today_id bigint,
  built boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.krillion_fetches enable row level security;

-- The same normalisation the client always used: no leading article, no
-- diacritics, "&" read as "and", nothing but letters and digits. The stored keys
-- and the player's answer both go through this one function, so they agree.
do $mig$ begin
  if exists (select 1 from pg_extension where extname = 'unaccent') then
    execute $fn$create or replace function public.krillion_bare(p_text text)
      returns text language sql immutable as $body$
        select regexp_replace(
                 lower(
                   regexp_replace(
                     unaccent(btrim(regexp_replace(coalesce(p_text, ''), '^(?:the|a|an)\s+', '', 'i'))),
                     '&', 'and', 'g')),
                 '[^a-z0-9]', '', 'g')
      $body$$fn$;
  end if;
end $mig$;

-- "two" and "2" answer for each other.
create or replace function public.krillion_number(p_key text)
returns integer
language sql
immutable
as $$
  select case
    when p_key ~ '^[0-9]{1,3}$' then p_key::integer
    when p_key in ('one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen')
      then array_position(array['one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'], p_key)
    when p_key ~ '^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(one|two|three|four|five|six|seven|eight|nine)?$'
      then (array_position(array['twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'], substring(p_key from '^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)')) - 1) * 10 + 20
        + coalesce(array_position(array['','one','two','three','four','five','six','seven','eight','nine'], substring(p_key from '(one|two|three|four|five|six|seven|eight|nine)$')) - 1, 0)
    else null
  end
$$;

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

-- Expand a day's reveal into the bank. Every spelling keeps the order it first
-- appeared in, so a tie lands on the answer the old in-memory matcher picked.
create or replace function public.krillion_build_bank(p_date text, p_reveal jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  built integer;
begin
  perform set_config('statement_timeout', '0', true);
  perform set_config('work_mem', '256MB', true);
  delete from public.krillion_answer_keys where date = p_date;
  with prompts as (
    select (p.ordinality - 1)::int as p_at, p.value as prompt
    from jsonb_array_elements(coalesce(p_reveal -> 'prompts', '[]'::jsonb)) with ordinality as p(value, ordinality)
  ), answers as (
    select pr.p_at, (a.ordinality - 1)::int as a_at, (pr.prompt ->> 'id') as prompt_id, a.value as answer
    from prompts pr
    cross join lateral jsonb_array_elements(coalesce(pr.prompt -> 'answers', '[]'::jsonb)) with ordinality as a(value, ordinality)
  ), spellings as (
    select ar.p_at, ar.a_at, ar.prompt_id, ar.answer, (w.ordinality - 1)::int as w_at, w.value as word
    from answers ar
    cross join lateral jsonb_array_elements_text(
      jsonb_build_array(ar.answer ->> 'answer') || coalesce(ar.answer -> 'aliases', '[]'::jsonb)
    ) with ordinality as w(value, ordinality)
    union all
    select ar.p_at, ar.a_at, ar.prompt_id, ar.answer, (10000 + c.ordinality)::int, c.alias
    from answers ar
    cross join lateral unnest(case public.krillion_bare(ar.answer ->> 'answer')
        when 'mashedpotatoes' then array['mashed','mash']
        when 'frenchfries' then array['fries']
        when 'bakedpotato' then array['baked potato','jacket potato']
        else array[]::text[] end) with ordinality as c(alias, ordinality)
  ), keyed as (
    select sp.p_at, sp.a_at, sp.w_at, sp.prompt_id,
           (sp.answer ->> 'answer') as answer,
           (sp.answer ->> 'tier') as tier,
           nullif(sp.answer ->> 'quip', '') as quip,
           public.krillion_bare(sp.word) as key
    from spellings sp
  ), clean as (
    select * from keyed
    where key <> ''
      and answer is not null
      and tier in ('plankton', 'tooclever', 'schooler', 'rare', 'deepcut', 'krillion')
  ), unique_keys as (
    select distinct on (prompt_id, key) *
    from clean
    order by prompt_id, key, p_at, a_at, w_at
  )
  insert into public.krillion_answer_keys (date, prompt_id, key, answer, tier, quip, num, own, ord)
  select p_date, prompt_id, key, answer, tier, quip,
         public.krillion_number(key),
         key = public.krillion_bare(answer),
         (row_number() over (partition by prompt_id order by p_at, a_at, w_at)) - 1
  from unique_keys;
  get diagnostics built = row_count;
  return jsonb_build_object('date', p_date, 'keys', built);
end;
$$;

-- The book the function serves: prompts and their day number, never answers.
create or replace function public.krillion_store_book(p_date text, p_today jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  day integer := coalesce((p_today ->> 'dayNumber')::int, 0);
  prompts jsonb;
begin
  select coalesce(jsonb_agg(jsonb_build_object('id', t.value ->> 'id', 'text', t.value ->> 'text') order by t.ordinality), '[]'::jsonb)
    into prompts
    from jsonb_array_elements(coalesce(p_today -> 'prompts', '[]'::jsonb)) with ordinality as t(value, ordinality);
  insert into public.krillion_books (date, day_number, source, book)
  values (p_date, day, 'Reference snapshot from krillion.io',
    jsonb_build_object('date', p_date, 'dayNumber', day, 'source', 'Reference snapshot from krillion.io', 'prompts', prompts))
  on conflict (date) do update set book = excluded.book, day_number = excluded.day_number, source = excluded.source;
  return jsonb_build_object('date', p_date, 'prompts', jsonb_array_length(prompts), 'dayNumber', day);
end;
$$;

-- One answer, checked the way the client always has: exact spelling first, then
-- a plural, a number written either way, a typo within the allowance, and at
-- last a natural-language qualifier. Ties go to the lower-scoring answer, and to
-- the earlier row when the score matches, so a misspelling is never worth more
-- than the answer it might have meant.
create or replace function public.krillion_match_answer(p_date text, p_prompt text, p_input text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hit public.krillion_answer_keys%rowtype;
  wanted integer;
  p_key text := public.krillion_bare(p_input);
  p_num integer;
  p_allowance integer;
begin
  if p_key is null or p_key = '' or length(p_key) > 256 then return null; end if;
  p_num := public.krillion_number(p_key);
  p_allowance := case when length(p_key) < 4 then 0 when length(p_key) < 8 then 1 else 2 end;

  select * into hit from public.krillion_answer_keys
   where date = p_date and prompt_id = p_prompt and key = p_key order by ord limit 1;
  if found then
    return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip, 'correction', not hit.own);
  end if;

  if length(p_key) > 4 and right(p_key, 1) = 's' then
    select * into hit from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt and key = left(p_key, length(p_key) - 1) order by ord limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip, 'correction', true);
    end if;
  end if;

  if p_num is not null then
    select * into hit from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt and num = p_num order by ord limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip, 'correction', hit.key <> p_key);
    end if;
  end if;

  if p_allowance > 0 then
    select * into hit from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt
       and length(key) between length(p_key) - p_allowance and length(p_key) + p_allowance
       and levenshtein(key, p_key) <= p_allowance
     order by levenshtein(key, p_key), public.krillion_tier_score(tier), ord
     limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip, 'correction', true);
    end if;
  end if;

  select count(distinct key) into wanted from public.krillion_answer_keys
   where date = p_date and prompt_id = p_prompt
     and length(key) >= 4 and length(key) < length(p_key)
     and length(p_key) - length(key) <= 16
     and left(p_key, length(key)) = key;
  if wanted = 1 then
    select * into hit from public.krillion_answer_keys
     where date = p_date and prompt_id = p_prompt
       and length(key) >= 4 and length(key) < length(p_key)
       and length(p_key) - length(key) <= 16
       and left(p_key, length(key)) = key
     order by length(key) desc, ord limit 1;
    if found then
      return jsonb_build_object('answer', hit.answer, 'tier', hit.tier, 'quip', hit.quip, 'correction', true);
    end if;
  end if;

  return null;
end;
$$;

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
      select jsonb_agg(to_jsonb(listed))
      from (
        select distinct answer, tier, quip,
               public.krillion_tier_score(tier) as score
        from public.krillion_answer_keys
        where date = p_date and prompt_id = p_prompt
        order by score desc, answer
        limit greatest(1, least(500, p_limit))
      ) listed
    ), '[]'::jsonb)
  )
$$;

-- One call when a day is replaced, so a half-written bank is never answered from.
create or replace function public.krillion_clear_bank(p_date text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.krillion_answer_keys where date = p_date
$$;

-- Ask for a day's reveal. The day is Eastern Time, matching the game.
create or replace function public.krillion_refresh(p_date text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  d text := coalesce(p_date, to_char(now() at time zone 'America/New_York', 'YYYY-MM-DD'));
  agent jsonb := '{"User-Agent": "BoredKrillion/1.0 (+https://bassdrum4.github.io/bored/)"}'::jsonb;
  reveal bigint;
  today bigint;
begin
  if exists (select 1 from public.krillion_books where date = d) then
    return jsonb_build_object('date', d, 'status', 'ready');
  end if;
  insert into public.krillion_fetches (date) values (d) on conflict (date) do nothing;
  select reveal_id, today_id into reveal, today from public.krillion_fetches where date = d;
  if reveal is null then
    reveal := net.http_get(url := 'https://krillion.io/api/reveal?date=' || d,
      headers := agent, timeout_milliseconds := 180000);
    update public.krillion_fetches set reveal_id = reveal where date = d;
  end if;
  if today is null then
    today := net.http_get(url := 'https://krillion.io/api/today',
      headers := agent, timeout_milliseconds := 30000);
    update public.krillion_fetches set today_id = today where date = d;
  end if;
  return jsonb_build_object('date', d, 'reveal', reveal, 'today', today);
end;
$$;

-- Build any day whose two fetches have arrived. A failed build is retried on the
-- next run; the book row is written last, so a day is never half-served.
create or replace function public.krillion_harvest()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job record;
  reveal text;
  today text;
  made jsonb := '[]'::jsonb;
begin
  perform set_config('statement_timeout', '0', true);
  for job in select f.* from public.krillion_fetches f where f.built = false order by f.created_at loop
    select content into reveal from net._http_response where id = job.reveal_id and status_code = 200;
    if reveal is null or length(reveal) < 1000 then continue; end if;
    select content into today from net._http_response where id = job.today_id and status_code = 200;
    if today is null then continue; end if;
    made := made || public.krillion_build_bank(job.date, reveal::jsonb);
    made := made || public.krillion_store_book(job.date, today::jsonb);
    update public.krillion_fetches f set built = true where f.date = job.date;
  end loop;
  delete from net._http_response where created < now() - interval '3 days';
  return made;
end;
$$;

do $mig$ begin
  -- Present only where unaccent is, so a fixture without it still replays.
  revoke all on function public.krillion_bare(text) from public, anon, authenticated;
exception when undefined_function then raise notice 'krillion_bare unavailable: %', sqlerrm; end $mig$;

revoke all on function public.krillion_tier_score(text) from public, anon, authenticated;
revoke all on function public.krillion_number(text) from public, anon, authenticated;
revoke all on function public.krillion_build_bank(text, jsonb) from public, anon, authenticated;
revoke all on function public.krillion_store_book(text, jsonb) from public, anon, authenticated;
revoke all on function public.krillion_match_answer(text, text, text) from public, anon, authenticated;
revoke all on function public.krillion_hint(text, text) from public, anon, authenticated;
revoke all on function public.krillion_review(text, text, integer) from public, anon, authenticated;
revoke all on function public.krillion_clear_bank(text) from public, anon, authenticated;
revoke all on function public.krillion_refresh(text) from public, anon, authenticated;
revoke all on function public.krillion_harvest() from public, anon, authenticated;

-- 00:10 and every two minutes Eastern winter time, which is after the dive rolls
-- over and late enough for the reference site to have published the day.
do $$ begin
  perform cron.schedule('krillion-refresh', '10 5 * * *', 'select public.krillion_refresh()');
exception when others then raise notice 'pg_cron unavailable: %', sqlerrm; end $$;

do $$ begin
  perform cron.schedule('krillion-harvest', '*/2 * * * *', 'select public.krillion_harvest()');
exception when others then raise notice 'pg_cron unavailable: %', sqlerrm; end $$;
