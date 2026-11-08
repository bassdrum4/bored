-- Scoped access and event exclusion for Civ Lite ("ashcrown").
-- A game's analytics reader is NOT a site-wide analytics admin.
begin;

-- Users can read their own entitlement, never enumerate readers or grant roles.
revoke all on public.game_analytics_readers from public, anon, authenticated;
grant select (user_id, game) on public.game_analytics_readers to authenticated;
drop policy if exists "read own game analytics permission" on public.game_analytics_readers;
create policy "read own game analytics permission"
  on public.game_analytics_readers for select to authenticated
  using (user_id = (select auth.uid()));

-- Multiplayer's isolated test DB applies every migration but has no analytics
-- event tables. Match the existing optional-analytics migrations: apply each
-- restrictive policy only if that table exists. In production all three exist.
do $migration$
begin
  if to_regclass('public.play_events') is not null then
    execute 'drop policy if exists exclude_civ_reader_play_insert on public.play_events';
    execute $ddl$
      create policy exclude_civ_reader_play_insert
        on public.play_events as restrictive for insert to authenticated
        with check (
          game <> 'ashcrown' or not exists (
            select 1 from public.game_analytics_readers r
            where r.user_id = (select auth.uid()) and r.game = 'ashcrown'
          )
        )
    $ddl$;
  end if;

  if to_regclass('public.product_events') is not null then
    execute 'drop policy if exists exclude_civ_reader_product_insert on public.product_events';
    execute $ddl$
      create policy exclude_civ_reader_product_insert
        on public.product_events as restrictive for insert to authenticated
        with check (
          game is distinct from 'ashcrown' or not exists (
            select 1 from public.game_analytics_readers r
            where r.user_id = (select auth.uid()) and r.game = 'ashcrown'
          )
        )
    $ddl$;
  end if;

  -- Legacy untagged surveys are denied for this reader because their source
  -- game cannot be verified; other players retain their existing behavior.
  if to_regclass('public.enjoyment_feedback') is not null then
    execute 'drop policy if exists exclude_civ_reader_survey_insert on public.enjoyment_feedback';
    execute $ddl$
      create policy exclude_civ_reader_survey_insert
        on public.enjoyment_feedback as restrictive for insert to authenticated
        with check (
          (game is not null and game <> 'ashcrown') or not exists (
            select 1 from public.game_analytics_readers r
            where r.user_id = (select auth.uid()) and r.game = 'ashcrown'
          )
        )
    $ddl$;
  end if;
end
$migration$;

commit;
