-- Shotgun Roulette on the arcade's shared leaderboard (the main page's cards and board).
-- Not applied yet: run this in the Supabase SQL editor.
--
-- The scores table only accepts games that have a row in score_rules (scores.game is a
-- foreign key), so until this row exists the hub keeps Shotgun Roulette's best in the
-- browser only and posts nothing. It matches src/games/score-rules.json, which is what
-- `npm run games:register` would print for this game.
--
-- Value: the biggest profit (chips won minus the bet) from one real, won game, either mode.
-- Higher is better. 1 to 1000: a game's profit is at most 500 x 3 - 500 = 1000 (Hard).
-- Safe to run more than once.

insert into public.score_rules (game, label, better, max_value)
values ('shotgun-roulette', 'Biggest profit from one won game', 'high', 1000)
on conflict (game) do nothing;

-- min_value comes from the score-bounds migration (default 1), which is right here.
