-- Mahjong now deals the full 144-tile set, so a cleared deal is 72 pairs.
--
-- Both numbers below were written when a deal was 72 tiles and 36 pairs. The
-- board's rule row is read when a score posts, and a value above it is dropped
-- without an error; the duel bound rejects one outright. Raising the game
-- without these two left every honest result above 36 pairs unrecorded.
begin;

-- score_rules is created outside these migrations (score-rules.json is its
-- source, `npm run games:register` writes it), so a bare database that only
-- replays this folder has no such table. Guarded rather than assumed.
do $$
begin
  if to_regclass('public.score_rules') is not null then
    update public.score_rules set max_value = 72 where game = 'mahjong' and max_value < 72;
  end if;
end $$;

create or replace function bored_together.duel_limit(g text) returns integer
language sql immutable set search_path='' as $$
 select case g when '2048' then 10000000 when 'mahjong' then 72 else 0 end;
$$;

revoke all on function bored_together.duel_limit(text) from public,anon,authenticated;
notify pgrst,'reload schema';
commit;
