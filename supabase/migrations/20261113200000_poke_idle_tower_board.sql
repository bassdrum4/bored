-- Poké Idle's Battle Tower ranks on a board of its own: the highest floor
-- cleared. It has no catalog entry (the floor comes from Poké Idle's snapshot,
-- see `page` in src/hub/scores.js), so its rule row is added here.
begin;

-- score_rules is created outside these migrations (score-rules.json is its
-- source, `npm run games:register` writes it), so guard rather than assume it.
do $$
begin
  if to_regclass('public.score_rules') is not null then
    insert into public.score_rules (game, label, better, max_value)
      values ('poke-idle-tower', 'Highest Battle Tower floor cleared', 'high', 100000)
      on conflict (game) do update
        set label = excluded.label, better = excluded.better, max_value = excluded.max_value;
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
