-- Penguin's Leaderboard ranks four boards that only it shows: Poké Idle
-- achievements earned, and the best finished score in each of Pokédoku's three
-- dailies. Like the Battle Tower they have no catalog entry of their own (their
-- numbers come from Poké Idle's and Pokédoku's snapshots, see `page` in
-- src/hub/scores.js), so their rule rows are added here.
begin;

-- score_rules is created outside these migrations (score-rules.json is its
-- source, `npm run games:register` writes it), so guard rather than assume it.
do $$
begin
  if to_regclass('public.score_rules') is not null then
    insert into public.score_rules (game, label, better, max_value) values
      ('poke-idle-ach', 'Poké Idle achievements earned', 'high', 1000),
      ('pokedoku-doku', 'Best daily Pokédoku grid', 'high', 1350),
      ('pokedoku-inverse', 'Best daily Inverse Doku', 'high', 600),
      ('pokedoku-shiny', 'Best daily Shiny Hunt', 'high', 700)
    on conflict (game) do update
      set label = excluded.label, better = excluded.better, max_value = excluded.max_value;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
