-- Relic Song: a fresh board for the Kanto remaster.
-- Paste into the Supabase SQL editor and run it once, BEFORE the remaster deploys (or as soon after
-- as you can). Not run automatically.
--
-- The remaster rewrote every chart, so totals from the old charts can't be compared with new ones.
-- The game resets each player's Relic Song progress itself (its save moved to v2), and the arcade
-- lets go of its cached Relic Song best once per browser. This clears what lives on the server:
--   1. every Relic Song row on the shared leaderboard (public.scores, game 'relic-song');
--   2. each account's cloud copy of its Relic Song best (public.player_state.data -> bests ->
--      relic-song), which would otherwise come back into the browser on the next sign-in and post
--      the old total again.
-- The score rule (public.score_rules) stays; the board is simply empty until someone posts.
-- public.score_submissions is the audit log of what was ever posted: kept as it is.
-- Coins are not touched: nobody loses any (the remastered charts pay again under new ledger entries).

begin;

delete from public.scores
where game = 'relic-song';

update public.player_state
set data = data #- '{bests,relic-song}'
where data -> 'bests' ? 'relic-song';

commit;

-- Check: both should be 0.
select
  (select count(*) from public.scores where game = 'relic-song') as relic_song_scores,
  (select count(*) from public.player_state where data -> 'bests' ? 'relic-song') as relic_song_cloud_bests;
