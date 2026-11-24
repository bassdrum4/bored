-- Krillion's daily book can hold a couple of hundred thousand answers: "name an
-- album by an artist with more than a million monthly listeners" lands ~195k,
-- and the reference reveal for that day is 33 MB. That is more object graph, and
-- more CPU, than an Edge Function is given, so the work lives here:
--
--   pg_cron  → krillion_refresh()  asks pg_net for the reveal and /api/today
--   pg_cron  → krillion_harvest()  builds the bank, one prompt per tick
--   function → krillion_match_answer() scores one answer against that bank
--
-- The bank is one row per accepted spelling, so a round costs an index lookup
-- instead of a scan of a JSON book held in memory, and a prompt that takes a
-- while commits on its own tick instead of restarting the whole day.

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
--
-- Written as a translate() map rather than unaccent(): building a day means a
-- few hundred thousand calls, and unaccent() reloads its dictionary on every call,
-- which is what made a build take minutes.
create or replace function public.krillion_bare(p_text text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           translate(
             replace(replace(replace(replace(
               lower(regexp_replace(coalesce(p_text, ''), '^(?:the|a|an)\s+', '', 'i')),
               '&', 'and'), 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'),
             'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİĴĵĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžƠơƯưǍǎǏǐǑǒǓǔǕǖǗǘǙǚǛǜǞǟǠǡǦǧǨǩǪǫǬǭǰǴǵǸǹǺǻȀȁȂȃȄȅȆȇȈȉȊȋȌȍȎȏȐȑȒȓȔȕȖȗȘșȚțȞȟȦȧȨȩȪȫȬȭȮȯȰȱȲȳḀḁḂḃḄḅḆḇḈḉḊḋḌḍḎḏḐḑḒḓḔḕḖḗḘḙḚḛḜḝḞḟḠḡḢḣḤḥḦḧḨḩḪḫḬḭḮḯḰḱḲḳḴḵḶḷḸḹḺḻḼḽḾḿṀṁṂṃṄṅṆṇṈṉṊṋṌṍṎṏṐṑṒṓṔṕṖṗṘṙṚṛṜṝṞṟṠṡṢṣṤṥṦṧṨṩṪṫṬṭṮṯṰṱṲṳṴṵṶṷṸṹṺṻṼṽṾṿẀẁẂẃẄẅẆẇẈẉẊẋẌẍẎẏẐẑẒẓẔẕẖẗẘẙẠạẢảẤấẦầẨẩẪẫẬậẮắẰằẲẳẴẵẶặẸẹẺẻẼẽẾếỀềỂểỄễỆệỈỉỊịỌọỎỏỐốỒồỔổỖỗỘộỚớỜờỞởỠỡỢợỤụỦủỨứỪừỬửỮữỰựỲỳỴỵỶỷỸỹKÅßæœøđðþłħıŋĸ',
             'aaaaaaceeeeiiiinooooouuuuyaaaaaaceeeeiiiinooooouuuuyyaaaaaaccccccccddeeeeeeeeeegggggggghhiiiiiiiiijjkkllllllnnnnnnoooooorrrrrrssssssssttttuuuuuuuuuuuuwwyyyzzzzzzoouuaaiioouuuuuuuuuuaaaaggkkoooojggnnaaaaaaeeeeiiiioooorrrruuuusstthhaaeeooooooooyyaabbbbbbccddddddddddeeeeeeeeeeffgghhhhhhhhhhiiiikkkkkkllllllllmmmmmmnnnnnnnnoooooooopppprrrrrrrrssssssssssttttttttuuuuuuuuuuvvvvwwwwwwwwwwxxxxyyzzzzzzhtwyaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeeeeeeeeeiiiioooooooooooooooooooooooouuuuuuuuuuuuuuyyyyyyyykasaooddplhink'),
           '[^a-z0-9]', '', 'g')
$$;

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

-- One prompt's worth of the bank. Every spelling keeps the order it first
-- appeared in, so a tie lands on the answer the old in-memory matcher picked.
create or replace function public.krillion_build_prompt(p_date text, p_prompt_id text, p_answers jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted integer;
begin
  delete from public.krillion_answer_keys where date = p_date and prompt_id = p_prompt_id;
  with answers as (
    select (a.ordinality - 1)::int as a_at, a.value as answer
    from jsonb_array_elements(coalesce(p_answers, '[]'::jsonb)) with ordinality as a(value, ordinality)
  ), spellings as (
    select ar.a_at, ar.answer, (w.ordinality - 1)::int as w_at, w.value as word
    from answers ar
    cross join lateral jsonb_array_elements_text(
      jsonb_build_array(ar.answer ->> 'answer') || coalesce(ar.answer -> 'aliases', '[]'::jsonb)
    ) with ordinality as w(value, ordinality)
    union all
    select ar.a_at, ar.answer, (10000 + c.ordinality)::int, c.alias
    from answers ar
    cross join lateral unnest(case public.krillion_bare(ar.answer ->> 'answer')
        when 'mashedpotatoes' then array['mashed','mash']
        when 'frenchfries' then array['fries']
        when 'bakedpotato' then array['baked potato','jacket potato']
        else array[]::text[] end) with ordinality as c(alias, ordinality)
  ), keyed as (
    select sp.a_at, sp.w_at,
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
    select distinct on (key) *
    from clean
    order by key, a_at, w_at
  )
  insert into public.krillion_answer_keys (date, prompt_id, key, answer, tier, quip, num, own, ord)
  select p_date, p_prompt_id, key, answer, tier, quip,
         public.krillion_number(key),
         key = public.krillion_bare(answer),
         (row_number() over (order by a_at, w_at)) - 1
  from unique_keys;
  get diagnostics inserted = row_count;
  return inserted;
end;
$$;

-- A whole day, one missing prompt at a time. One prompt can hold a quarter of a
-- million keys; rebuilding the whole bank in one transaction on every call is
-- what exhausted memory and made each attempt time out with nothing to show.
-- Building one prompt per tick commits it and the next tick continues.
create or replace function public.krillion_build_bank(p_date text, p_reveal jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prompt record;
  keys integer;
  total integer := 0;
  wanted integer := 0;
  have integer := 0;
  did_build boolean := false;
begin
  for prompt in select p.value as value
    from jsonb_array_elements(coalesce(p_reveal -> 'prompts', '[]'::jsonb)) with ordinality as p(value, ordinality)
    order by p.ordinality
  loop
    wanted := wanted + 1;
    if exists (select 1 from public.krillion_answer_keys
                where date = p_date and prompt_id = (prompt.value ->> 'id')) then
      continue;
    end if;
    if did_build then continue; end if;
    keys := public.krillion_build_prompt(p_date, prompt.value ->> 'id', prompt.value -> 'answers');
    total := total + keys;
    did_build := true;
  end loop;
  select count(distinct prompt_id) into have
    from public.krillion_answer_keys where date = p_date;
  -- The date counts as built only once every prompt in the reveal is stored.
  if wanted > 0 and have >= wanted then
    update public.krillion_fetches set built = true where date = p_date;
  end if;
  return jsonb_build_object('date', p_date, 'keys', total, 'prompts', have, 'wanted', wanted);
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

-- Whether a day's whole bank is in place. The function serves the daily dive
-- only for a ready day, so a half-filled bank never rejects correct answers.
create or replace function public.krillion_bank_ready(p_date text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select built from public.krillion_fetches where date = p_date), false)
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

-- Build the days whose reveal has arrived. pg_net keeps responses in memory, so
-- a restart drops them: that is re-requested here rather than stalling the day
-- with a short bank. The book is written only once its fetch is in hand.
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
  agent jsonb := '{"User-Agent": "BoredKrillion/1.0 (+https://bassdrum4.github.io/bored/)"}'::jsonb;
  made jsonb := '[]'::jsonb;
begin
  for job in select f.* from public.krillion_fetches f where f.built = false order by f.created_at loop
    select content into reveal from net._http_response where id = job.reveal_id and status_code = 200;
    if reveal is null or length(reveal) < 1000 then
      reveal := net.http_get(url := 'https://krillion.io/api/reveal?date=' || job.date,
        headers := agent, timeout_milliseconds := 180000);
      update public.krillion_fetches f set reveal_id = reveal where f.date = job.date;
      continue;
    end if;
    made := made || public.krillion_build_bank(job.date, reveal::jsonb);
    if not exists (select 1 from public.krillion_books where date = job.date) then
      select content into today from net._http_response where id = job.today_id and status_code = 200;
      if today is null then
        today := net.http_get(url := 'https://krillion.io/api/today',
          headers := agent, timeout_milliseconds := 30000);
        update public.krillion_fetches f set today_id = today where f.date = job.date;
      else
        made := made || public.krillion_store_book(job.date, today::jsonb);
      end if;
    end if;
  end loop;
  delete from net._http_response where created < now() - interval '3 days';
  return made;
end;
$$;

revoke all on function public.krillion_tier_score(text) from public, anon, authenticated;
revoke all on function public.krillion_number(text) from public, anon, authenticated;
revoke all on function public.krillion_bare(text) from public, anon, authenticated;
revoke all on function public.krillion_build_prompt(text, text, jsonb) from public, anon, authenticated;
revoke all on function public.krillion_build_bank(text, jsonb) from public, anon, authenticated;
revoke all on function public.krillion_store_book(text, jsonb) from public, anon, authenticated;
revoke all on function public.krillion_match_answer(text, text, text) from public, anon, authenticated;
revoke all on function public.krillion_hint(text, text) from public, anon, authenticated;
revoke all on function public.krillion_review(text, text, integer) from public, anon, authenticated;
revoke all on function public.krillion_clear_bank(text) from public, anon, authenticated;
revoke all on function public.krillion_bank_ready(text) from public, anon, authenticated;
revoke all on function public.krillion_refresh(text) from public, anon, authenticated;
revoke all on function public.krillion_harvest() from public, anon, authenticated;

-- 00:10 Eastern winter time, after the dive rolls over and late enough for the
-- reference site to have published the day; every two minutes after that.
do $mig$ begin
  perform cron.schedule('krillion-refresh', '10 5 * * *', 'select public.krillion_refresh()');
exception when others then raise notice 'pg_cron unavailable: %', sqlerrm; end $mig$;

do $mig$ begin
  perform cron.schedule('krillion-harvest', '*/2 * * * *', 'select public.krillion_harvest()');
exception when others then raise notice 'pg_cron unavailable: %', sqlerrm; end $mig$;
