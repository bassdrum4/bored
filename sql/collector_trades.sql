-- Collector trades (Poké Gacha). Run this in the Supabase SQL editor; it is safe to run twice.
--
-- Offer-based: a player posts "give X, want Y" (Collector mons only, the same rarity), open to
-- anyone or to one handle, and another player accepts later. The swap is decided here, in one
-- transaction, never by a client:
--   * both accounts are 7 or more days old;
--   * X and Y are the same Collector tier (collector_tier below mirrors src/hub/gacha.js);
--   * the giver of each side holds a copy, counted from their synced wallet (player_state) plus
--     every trade in this table; an open offer holds its copy back;
--   * each side can pay the dust fee (by tier), from the synced wallet less every fee charged here;
--   * at most 3 trades a Detroit day per player, and at most 1 Legendary/Mythical trade a week;
--   * at most 5 open offers per player.
-- The client then mirrors each finished trade into its wallet as col:trade:<id> (the mon in, the
-- mon out, the fee). The checks here count this table, not those entries, so a client that never
-- mirrors a trade (or mirrors one twice) cannot gain anything.
begin;

create table if not exists public.collector_trade_offers (
  id         bigint generated always as identity primary key,
  offerer    uuid not null references auth.users (id) on delete cascade,
  give       integer not null check (give between 1 and 1025),
  want       integer not null check (want between 1 and 1025 and want <> give),
  tier       integer not null check (tier between 0 and 3),
  fee        integer not null check (fee >= 0),
  for_handle text check (for_handle is null or length(for_handle) between 1 and 40),
  status     text not null default 'open' check (status in ('open', 'done', 'cancelled')),
  taker      uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  done_at    timestamptz
);
create index if not exists collector_trade_offers_open_idx on public.collector_trade_offers (status, created_at desc);
create index if not exists collector_trade_offers_offerer_idx on public.collector_trade_offers (offerer, status);
create index if not exists collector_trade_offers_taker_idx on public.collector_trade_offers (taker, status);
alter table public.collector_trade_offers enable row level security;
-- No direct access: everything goes through the functions below.
revoke all on public.collector_trade_offers from anon, authenticated;

-- The Collector tier of a species: 0 Common, 1 Rare, 2 Epic, 3 Legendary/Mythical.
-- Generated from colTier() in src/hub/gacha.js (one digit per species, 1 to 1025).
create or replace function public.collector_tier(p_num integer) returns integer
language sql immutable as $function$
  select case when p_num between 1 and 1025 then substr('00100200200000000100000001010010010101000100100010000010102001001001001010010101010010101010010010101020011001011010001011111111022001110010112333002330010020020001000020100000010011000100100000011010001010010101110010001001011012011100100012333002333002002002000000000001001010000101010020100010100000000200010000001010101101000101011111010101010102000101111001002011100020023333333333001002002001000000101010100001001010110101110100101000010020010101011010011212222211112211110333333333333333001001001000010001010101001010010001000100111001001010110010110101101010201010100100101002010010101101010010010100100201101101101011010111002023333333333330020020020000100001002020110100101010101010101010111010121010101023333330020020020010000101101010010101010001010011110201033111011110023333333322222223332222333002002002010010010101010101001011011010101010100100110111101100111100111112002333333333331122113002002002010001001010100100010110101010101011010101001001010111010110112120112222222222222002023333223322101333322222233', p_num, 1)::integer end;
$function$;

-- Dust fee per side, by tier.
create or replace function public.collector_trade_fee(p_tier integer) returns integer
language sql immutable as $function$
  select (array[5, 15, 30, 75])[p_tier + 1];
$function$;

-- Copies of a species a player holds: Collector pulls, dust buys and extras turned into dust from
-- their synced wallet, plus trades from this table (the wallet's own col:trade entries are ignored).
create or replace function public.collector_copies(p_uid uuid, p_num integer) returns integer
language sql stable security definer set search_path = public as $function$
  with e as (
    select key, value from public.player_state ps,
      jsonb_each(case when jsonb_typeof(ps.data -> 'wallet' -> 'entries') = 'object' then ps.data -> 'wallet' -> 'entries' else '{}'::jsonb end)
    where ps.user_id = p_uid
  ), arr as (
    select e.key, a.v from e, jsonb_array_elements(case when jsonb_typeof(e.value -> 'x' -> 'cp') = 'array' and e.key like 'spend:col:%' then e.value -> 'x' -> 'cp'
                                                     when jsonb_typeof(e.value -> 'x' -> 'dx') = 'array' and e.key like 'spend:cdx:%' then e.value -> 'x' -> 'dx'
                                                     else '[]'::jsonb end) a(v)
    where jsonb_typeof(a.v) = 'array' and a.v ->> 0 ~ '^[0-9]{1,4}$' and (a.v ->> 0)::integer = p_num
  )
  select (
    (select count(*) from arr where key like 'spend:col:%')
    + (select count(*) from e where (e.key = 'spend:cbuy:' || p_num or e.key like 'spend:cbuy:' || p_num || ':%') and e.value -> 'x' ->> 'cb' = p_num::text)
    - (select coalesce(sum(case when v ->> 1 ~ '^[0-9]{1,6}$' then (v ->> 1)::integer else 0 end), 0) from arr where key like 'spend:cdx:%')
    + (select count(*) from public.collector_trade_offers t where t.status = 'done' and ((t.taker = p_uid and t.give = p_num) or (t.offerer = p_uid and t.want = p_num)))
    - (select count(*) from public.collector_trade_offers t where t.status = 'done' and ((t.taker = p_uid and t.want = p_num) or (t.offerer = p_uid and t.give = p_num)))
  )::integer;
$function$;

-- Dust a player can spend: every dust grant in their synced wallet (bar col:trade entries), less
-- every trade fee charged in this table.
create or replace function public.collector_dust(p_uid uuid) returns integer
language sql stable security definer set search_path = public as $function$
  select (
    coalesce((select sum(case when e.value -> 'g' ->> 'dust' ~ '^-?[0-9]{1,9}$' then (e.value -> 'g' ->> 'dust')::bigint else 0 end)
      from public.player_state ps,
        jsonb_each(case when jsonb_typeof(ps.data -> 'wallet' -> 'entries') = 'object' then ps.data -> 'wallet' -> 'entries' else '{}'::jsonb end) e
      where ps.user_id = p_uid and e.key not like 'col:trade:%'), 0)
    - coalesce((select sum(t.fee) from public.collector_trade_offers t where t.status = 'done' and (t.offerer = p_uid or t.taker = p_uid)), 0)
  )::integer;
$function$;

-- The shared checks for one side of a trade. Raises with a plain message when a rule fails.
create or replace function public.collector_trade_check(p_uid uuid, p_num integer, p_tier integer, p_fee integer, p_skip bigint default null)
returns void language plpgsql stable security definer set search_path = public as $function$
declare
  day_start timestamptz := date_trunc('day', now() at time zone 'America/Detroit') at time zone 'America/Detroit';
  week_start timestamptz := date_trunc('week', now() at time zone 'America/Detroit') at time zone 'America/Detroit';
  held integer;
begin
  if (select created_at from auth.users where id = p_uid) > now() - interval '7 days' then
    raise exception 'Trading opens 7 days after an account is made.';
  end if;
  if (select count(*) from public.collector_trade_offers where status = 'done' and done_at >= day_start and (offerer = p_uid or taker = p_uid)) >= 3 then
    raise exception 'Three trades a day: come back tomorrow.';
  end if;
  if p_tier = 3 and exists (select 1 from public.collector_trade_offers where status = 'done' and tier = 3 and done_at >= week_start and (offerer = p_uid or taker = p_uid)) then
    raise exception 'One Legendary or Mythical trade a week.';
  end if;
  -- A copy to give: open offers (bar this one) hold theirs back.
  held := public.collector_copies(p_uid, p_num)
    - (select count(*) from public.collector_trade_offers where status = 'open' and offerer = p_uid and give = p_num and (p_skip is null or id <> p_skip));
  if held < 1 then raise exception 'You do not have that Pokémon to trade.'; end if;
  if public.collector_dust(p_uid) < p_fee then raise exception 'Not enough dust for the trade fee.'; end if;
end;
$function$;

create or replace function public.post_collector_offer(p_give integer, p_want integer, p_for text default null)
returns bigint language plpgsql security definer set search_path = public as $function$
declare
  uid uuid := auth.uid();
  t integer := public.collector_tier(p_give);
  new_id bigint;
begin
  if uid is null then raise exception 'Sign in to trade.' using errcode = '42501'; end if;
  if t is null or public.collector_tier(p_want) is null then raise exception 'Unknown Pokémon.'; end if;
  if p_give = p_want then raise exception 'Pick two different Pokémon.'; end if;
  if t <> public.collector_tier(p_want) then raise exception 'Trades are between Pokémon of the same rarity.'; end if;
  perform pg_advisory_xact_lock(hashtext('collector_trade:' || uid::text));
  if (select count(*) from public.collector_trade_offers where offerer = uid and status = 'open') >= 5 then
    raise exception 'Five open offers at most: cancel one first.';
  end if;
  perform public.collector_trade_check(uid, p_give, t, public.collector_trade_fee(t));
  insert into public.collector_trade_offers (offerer, give, want, tier, fee, for_handle)
  values (uid, p_give, p_want, t, public.collector_trade_fee(t), nullif(btrim(p_for), ''))
  returning id into new_id;
  return new_id;
end;
$function$;

create or replace function public.cancel_collector_offer(p_id bigint)
returns void language plpgsql security definer set search_path = public as $function$
begin
  if auth.uid() is null then raise exception 'Sign in to trade.' using errcode = '42501'; end if;
  update public.collector_trade_offers set status = 'cancelled' where id = p_id and offerer = auth.uid() and status = 'open';
  if not found then raise exception 'No such open offer of yours.'; end if;
end;
$function$;

-- The swap: both sides checked and the offer closed in one transaction, under both players' locks.
create or replace function public.accept_collector_offer(p_id bigint)
returns json language plpgsql security definer set search_path = public as $function$
declare
  uid uuid := auth.uid();
  o public.collector_trade_offers;
  first_lock uuid;
  second_lock uuid;
begin
  if uid is null then raise exception 'Sign in to trade.' using errcode = '42501'; end if;
  select * into o from public.collector_trade_offers where id = p_id;
  if not found or o.status <> 'open' then raise exception 'That offer is gone.'; end if;
  if o.offerer = uid then raise exception 'That is your own offer.'; end if;
  -- Both players' locks, in a fixed order, so two accepts can never interleave.
  first_lock := least(o.offerer, uid); second_lock := greatest(o.offerer, uid);
  perform pg_advisory_xact_lock(hashtext('collector_trade:' || first_lock::text));
  perform pg_advisory_xact_lock(hashtext('collector_trade:' || second_lock::text));
  select * into o from public.collector_trade_offers where id = p_id for update;
  if o.status <> 'open' then raise exception 'That offer is gone.'; end if;
  if o.for_handle is not null and o.for_handle is distinct from (select handle from public.profiles where id = uid) then
    raise exception 'That offer is for someone else.';
  end if;
  perform public.collector_trade_check(o.offerer, o.give, o.tier, o.fee, o.id);
  perform public.collector_trade_check(uid, o.want, o.tier, o.fee);
  update public.collector_trade_offers set status = 'done', taker = uid, done_at = now() where id = o.id;
  return json_build_object('id', o.id, 'got', o.give, 'gave', o.want, 'fee', o.fee, 'tier', o.tier);
end;
$function$;

-- Open offers a player can see: open to all, addressed to their handle, or their own.
create or replace function public.collector_offers()
returns table (id bigint, handle text, give integer, want integer, tier integer, fee integer, for_handle text, mine boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $function$
  select t.id, coalesce(p.handle, 'unnamed'), t.give, t.want, t.tier, t.fee, t.for_handle, t.offerer = auth.uid(), t.created_at
    from public.collector_trade_offers t
    left join public.profiles p on p.id = t.offerer
   where t.status = 'open' and auth.uid() is not null
     and (t.offerer = auth.uid() or t.for_handle is null or t.for_handle = (select handle from public.profiles where id = auth.uid()))
   order by t.offerer = auth.uid() desc, t.created_at desc
   limit 100;
$function$;

-- A player's finished trades, newest first: what came in, what went out, the fee, who with.
create or replace function public.my_collector_trades()
returns table (id bigint, got integer, gave integer, fee integer, tier integer, other text, done_at timestamptz)
language sql stable security definer set search_path = public as $function$
  select t.id,
         case when t.offerer = auth.uid() then t.want else t.give end,
         case when t.offerer = auth.uid() then t.give else t.want end,
         t.fee, t.tier, coalesce(p.handle, 'unnamed'), t.done_at
    from public.collector_trade_offers t
    left join public.profiles p on p.id = case when t.offerer = auth.uid() then t.taker else t.offerer end
   where t.status = 'done' and auth.uid() is not null and (t.offerer = auth.uid() or t.taker = auth.uid())
   order by t.done_at desc
   limit 200;
$function$;

revoke all on function public.collector_copies(uuid, integer), public.collector_dust(uuid), public.collector_trade_check(uuid, integer, integer, integer, bigint) from public, anon, authenticated;
revoke all on function public.post_collector_offer(integer, integer, text), public.cancel_collector_offer(bigint), public.accept_collector_offer(bigint),
  public.collector_offers(), public.my_collector_trades() from public, anon;
grant execute on function public.post_collector_offer(integer, integer, text), public.cancel_collector_offer(bigint), public.accept_collector_offer(bigint),
  public.collector_offers(), public.my_collector_trades() to authenticated;

commit;
