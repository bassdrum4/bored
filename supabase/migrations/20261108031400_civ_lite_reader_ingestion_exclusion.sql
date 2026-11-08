-- Scoped access and event exclusion for Civ Lite ("ashcrown").
-- A game's analytics reader is NOT a site-wide analytics admin.
begin;

-- Users can read their own entitlement, never enumerate readers or grant roles.
revoke all on public.game_analytics_readers from public, anon, authenticated;
grant select (user_id, game) on public.game_analytics_readers to authenticated;
drop policy if exists "read own game analytics permission" on public.game_analytics_readers;
create policy "read own game analytics permission"
  on public.game_analytics_readers
  for select to authenticated
  using (user_id = (select auth.uid()));

-- RLS is the authority: old clients and direct HTTP writes cannot log this
-- reader's Civ Lite gameplay, while their unrelated games remain eligible.
drop policy if exists exclude_civ_reader_play_insert on public.play_events;
create policy exclude_civ_reader_play_insert
  on public.play_events as restrictive for insert to authenticated
  with check (
    game <> 'ashcrown' or not exists (
      select 1 from public.game_analytics_readers r
      where r.user_id = (select auth.uid()) and r.game = 'ashcrown'
    )
  );

drop policy if exists exclude_civ_reader_product_insert on public.product_events;
create policy exclude_civ_reader_product_insert
  on public.product_events as restrictive for insert to authenticated
  with check (
    game is distinct from 'ashcrown' or not exists (
      select 1 from public.game_analytics_readers r
      where r.user_id = (select auth.uid()) and r.game = 'ashcrown'
    )
  );

-- Enjoyment submissions now carry a game. For readers, an untagged submission
-- is rejected because it cannot prove it came from a different game.
drop policy if exists exclude_civ_reader_survey_insert on public.enjoyment_feedback;
create policy exclude_civ_reader_survey_insert
  on public.enjoyment_feedback as restrictive for insert to authenticated
  with check (
    (game is not null and game <> 'ashcrown') or not exists (
      select 1 from public.game_analytics_readers r
      where r.user_id = (select auth.uid()) and r.game = 'ashcrown'
    )
  );

commit;
