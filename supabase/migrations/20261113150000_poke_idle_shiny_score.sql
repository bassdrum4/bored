-- Poké Idle now ranks on Pokédex entries plus shinies: one point per species
-- caught and one more for each one held shiny, so the ceiling doubles to 2050.
--
-- Every stored value is a count of species caught, which is still a valid
-- (lower) score under the new rule: nothing is deleted, and a player's next
-- capture simply replaces it. Without this update the board keeps the old label
-- and drops any honest score above 1025.
begin;

-- score_rules is created outside these migrations (score-rules.json is its
-- source, `npm run games:register` writes it), so guard rather than assume it.
do $$
begin
  if to_regclass('public.score_rules') is not null then
    update public.score_rules
      set label = 'Pokédex entries plus shinies', max_value = 2050
      where game = 'poke-idle';
  end if;
end $$;

notify pgrst, 'reload schema';
commit;
