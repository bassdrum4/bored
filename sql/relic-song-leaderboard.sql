-- Relic Song uses the shared Bored board; no new tables or permissions.
-- Not applied yet: run this once in the Supabase SQL editor. Until it is, the
-- hub keeps Relic Song's best in the browser (scores.game is a foreign key to
-- score_rules.game). Same values as src/games/score-rules.json.
insert into public.score_rules (game,label,better,max_value)
values ('relic-song','Sum of best scores across every song','high',20000000)
on conflict (game) do update set label=excluded.label,better=excluded.better,max_value=excluded.max_value;
