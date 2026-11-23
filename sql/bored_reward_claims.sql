-- Claimable tokens for Bored (Poké Gacha's Collector and Shotgun Roulette): the
-- Beginner's Package (once per account), the daily tokens and the broke bailout
-- (once per account per Detroit day).
-- Not applied yet: run this in the Supabase SQL editor. Safe to run more than once.
--
-- The client calls claim_reward before it adds the tokens to the wallet, so a
-- refresh, a second tab or a second device can't claim the same thing twice:
-- the primary key below allows one row per account, claim and period.
-- Until this runs, src/hub/claims.js falls back to the wallet ledger's own
-- one-time ids and says so in the console.

create table if not exists public.reward_claims (
  user_id    uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('beginner', 'daily', 'bailout')),
  -- 'once' for the Beginner's Package, the Detroit date (YYYY-MM-DD) for the daily ones.
  period     text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, kind, period)
);

alter table public.reward_claims enable row level security;

-- A player may read their own claims. Nobody writes rows directly: only claim_reward does.
drop policy if exists "players read their own claims" on public.reward_claims;
create policy "players read their own claims"
  on public.reward_claims for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.reward_claims from anon, authenticated;
grant select on public.reward_claims to authenticated;

-- Records a claim and returns true, or returns false when it was already claimed.
-- p_balance is the player's token balance as the client sees it; the bailout is
-- refused at 10 or more (the wallet itself lives on the client).
create or replace function public.claim_reward(p_kind text, p_balance integer default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $function$
declare
  uid uuid := auth.uid();
  claim_period text;
begin
  if uid is null then raise exception 'sign in to claim'; end if;
  if p_kind is null or p_kind not in ('beginner', 'daily', 'bailout') then raise exception 'unknown claim'; end if;
  if p_kind = 'bailout' and (p_balance is null or p_balance >= 10) then raise exception 'the bailout is for a balance under 10'; end if;
  claim_period := case when p_kind = 'beginner' then 'once'
                       else to_char(now() at time zone 'America/Detroit', 'YYYY-MM-DD') end;
  insert into public.reward_claims (user_id, kind, period) values (uid, p_kind, claim_period)
  on conflict do nothing;
  return found;
end;
$function$;

revoke all on function public.claim_reward(text, integer) from public, anon;
grant execute on function public.claim_reward(text, integer) to authenticated;
