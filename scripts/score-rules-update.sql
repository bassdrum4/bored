-- Sharper units for the shared board.
-- Paste this into the Supabase SQL editor and run it once, after the hub that
-- reads these rules has shipped.
--
-- Seven games were ranked on a coarse counter when each of them already keeps a
-- running score: Breakout on layouts cleared, Frogger on lily pads, Space
-- Invaders, Commanders and Asteroids on waves, Q*bert on levels, Tetris on
-- lines. Two decent runs tie on a counter and separate on a score, so the rule
-- now names the score. Solitaire's row was stale in the other direction: the
-- board has ranked it by seconds to clear since before the row still said
-- "foundation cards".
--
-- The DELETE is deliberate, not a side effect of the update. A saved value of 4
-- meant four layouts; under a rule that reads "Score" it prints as four points,
-- and nothing converts one into the other. Those seven boards start clean and
-- the next run fills them. Frogger's old ceiling was 5, so every stored value
-- there is certainly in the old unit.

update public.score_rules
  set label = 'Score', better = 'high', max_value = 10000000
  where game in ('tetris', 'breakout', 'space-invaders', 'qbert', 'commanders', 'asteroids');

update public.score_rules
  set label = 'Score', better = 'high', max_value = 1000000
  where game = 'frogger';

update public.score_rules
  set label = 'Seconds to clear all 52 cards', better = 'low', max_value = 86400
  where game = 'solitaire';

delete from public.scores
  where game in ('tetris', 'breakout', 'frogger', 'space-invaders', 'qbert', 'commanders', 'asteroids');
