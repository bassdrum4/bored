-- Preserve the existing four-column leaderboard contract. A fresh
-- Bored Together test database has auth/profiles but deliberately has no
-- shared scores table. Skip the view update there without changing fixtures.
do $trackbound_pace$
begin
  if to_regclass('public.scores') is not null
     and to_regclass('public.leaderboard') is not null then
    execute $view$
      create or replace view public.leaderboard as
      select s.game, p.handle, s.value, s.updated_at
      from public.scores s
      join public.profiles p on p.id = s.user_id
      union all
      select 'trackbound-career-pace'::text as game,
        career.handle, career.pace_bp as value,
        now()::timestamptz as updated_at
      from public.trackbound_campaign_board() career
      where career.pace_bp is not null
    $view$;
  end if;
end
$trackbound_pace$;
