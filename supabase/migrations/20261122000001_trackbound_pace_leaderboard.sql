-- Keep the same four public leaderboard columns and access policy. Only
-- append a synthetic row for a COMPLETE, layout-matched Trackbound career.
-- No extra request is needed when the hub reads its ordinary leaderboard.
create or replace view public.leaderboard as
select s.game, p.handle, s.value, s.updated_at
from public.scores s
join public.profiles p on p.id = s.user_id
union all
select 'trackbound-career-pace'::text as game,
  career.handle, career.pace_bp as value,
  now()::timestamptz as updated_at
from public.trackbound_campaign_board() career
where career.pace_bp is not null;
