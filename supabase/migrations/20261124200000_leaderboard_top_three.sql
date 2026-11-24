-- The hub bylines its library cards with the top three players of each board.
-- Reading the whole leaderboard for that cost a paged scan on every page load, so
-- the top three now come from one small view and the full board is read only when
-- the Leaderboard page is opened. Direction comes from score_rules.better, the
-- same rule the client ranks with. Career pace rides along for the three
-- Trackbound leaders because it breaks a tie on that card; it is never a board of
-- its own.
--
-- A fresh Bored Together test database has auth/profiles but deliberately has no
-- shared board. Skip the view there without changing fixtures.
do $leaderboard_top_three$
begin
  if to_regclass('public.leaderboard') is not null
     and to_regclass('public.score_rules') is not null then
    execute $view$
      create or replace view public.leaderboard_top as
      with ranked as (
        select l.game, l.handle, l.value,
          row_number() over (
            partition by l.game
            order by
              case when r.better = 'low' then l.value end asc nulls last,
              case when coalesce(r.better, 'high') <> 'low' then l.value end desc nulls last,
              lower(l.handle) asc
          ) as place
        from public.leaderboard l
        left join public.score_rules r on r.game = l.game
        where l.value > 0 and l.handle is not null
      )
      select game, handle, value from ranked where place <= 3
      union
      select 'trackbound-career-pace'::text as game, l.handle, l.value
      from public.leaderboard l
      where l.game = 'trackbound-career-pace'
        and lower(l.handle) in (
          select lower(t.handle) from ranked t where t.game = 'trackbound' and t.place <= 3
        )
    $view$;
    execute 'grant select on public.leaderboard_top to anon, authenticated';
  end if;
end
$leaderboard_top_three$;
