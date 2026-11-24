-- A generated static snapshot is a complete, separately retained answer source.
-- Retire only today's explicitly verified bank; never delete scores or legacy archives.
do $$
begin
  if exists (select 1 from public.krillion_static_days where date='2026-11-24') then
    delete from public.krillion_answer_keys where date='2026-11-24';
  end if;
end $$;
