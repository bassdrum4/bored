-- Relic Song uses Bored's shared scores table and leaderboard.
insert into public.score_rules (game, label, better, max_value)
values ('relic-song', 'Sum of best scores across every song', 'high', 20000000)
on conflict (game) do update set label = excluded.label, better = excluded.better, max_value = excluded.max_value;
