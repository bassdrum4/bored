-- Bored Together: Pastel Tanks rules version 2 — the drivable box.
--
-- Rules v2 replaces the hill terrain with a box: four destructible wall bands
-- whose inner edges are one ring road tanks can drive (floor, walls, ceiling,
-- upside down). The move on the wire changes from {x} to {drive, angle, power,
-- weapon}: `drive` is the signed distance to travel along the ring before
-- firing, `angle` is the elevation from the tank's own wall surface, and
-- `weapon` picks from standard/heavy/cluster/mine/ricochet. The referee still
-- does not simulate the shell — it stores the shot list and both clients replay
-- it through src/games/tank-engine.js; `won` carries the replay's winner seat
-- (1, 2, or null mid-game) so the match can be completed by the mover.
--
-- Legacy rules_version=1 tank2 matches keep their stored v1 branch, but the hub
-- (together-player.js) now requires version 2, so those matches report
-- "This game version is not available yet." instead of playing on.
begin;

-- New and re-matched tank2 games start at rules version 2 even though the
-- challenge/queue/rematch inserts do not name a version.
create or replace function bored_together.stamp_tank2_rules() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.game='tank2' then new.rules_version:=2; end if;
 return new;
end $$;

drop trigger if exists tanks_rules_stamp on bored_together.matches;
create trigger tanks_rules_stamp before insert on bored_together.matches
for each row execute function bored_together.stamp_tank2_rules();

create or replace function bored_together.initial_state(game_id text,rules integer) returns jsonb
language plpgsql volatile set search_path='' as $$
begin
 if game_id='connect-four' and rules=1 then return jsonb_build_object('board',to_jsonb(array_fill(0,array[42]))); end if;
 if game_id='8ball' and rules=1 then return '{"balls":[{"id":0,"x":52.8,"y":55},{"id":1,"x":158.4,"y":55},{"id":2,"x":163.707,"y":51.9195},{"id":15,"x":163.707,"y":58.0805},{"id":9,"x":169.014,"y":48.839},{"id":8,"x":169.014,"y":55},{"id":3,"x":169.014,"y":61.161},{"id":11,"x":174.321,"y":45.7585},{"id":4,"x":174.321,"y":51.9195},{"id":12,"x":174.321,"y":58.0805},{"id":5,"x":174.321,"y":64.2415},{"id":10,"x":179.62800000000001,"y":42.678},{"id":13,"x":179.62800000000001,"y":48.839},{"id":6,"x":179.62800000000001,"y":55},{"id":14,"x":179.62800000000001,"y":61.161},{"id":7,"x":179.62800000000001,"y":67.322}],"groups":[null,null],"breakShot":true,"ballInHand":false,"shotCount":0,"lastShot":null}'::jsonb; end if;
 if game_id='tank2' and (rules=1 or rules=2) then
  -- The seed is the whole battlefield: one box whose ring road, wind and
  -- power-up stream are pure functions of it. Chosen once here so both players
  -- and every reload see the same ground.
  return jsonb_build_object('seed',(1+floor(random()*2147483646))::bigint,'shots','[]'::jsonb,'turn',1,'winner',null);
 end if;
 raise exception 'Rules version unavailable.';
end $$;

create or replace function bored_together.apply_move(game_id text,rules integer,state jsonb,payload jsonb,seat integer) returns jsonb
language plpgsql immutable set search_path='' as $$
begin
 if game_id='connect-four' and rules=1 then
  if jsonb_typeof(payload)<>'object' or payload-'column'<>'{}'::jsonb or coalesce(payload->>'column','') !~ '^[0-6]$' then raise exception 'Invalid move.'; end if;
  return bored_together.connect_four(state,(payload->>'column')::integer,seat);
 end if;
 if game_id='8ball' then raise exception 'Use the verified pool shot endpoint.'; end if;
 if game_id='tank2' and rules=2 then
  -- The move is one shot plus the ring distance walked before it. The drive is
  -- signed (backwards along one's own wall is legal); the angle is elevation
  -- from the tank's own wall surface, so it means the same thing upside down.
  if jsonb_typeof(payload)<>'object' then raise exception 'Invalid shot.'; end if;
  if jsonb_typeof(state->'shots') is distinct from 'array' then raise exception 'Invalid shot.'; end if;
  if jsonb_array_length(state->'shots')>=200 then raise exception 'This game has run its course.'; end if;
  if state ? 'winner' and jsonb_typeof(state->'winner')<>'null' then raise exception 'This game is over.'; end if;
  if coalesce(payload->>'seat','') !~ '^[12]$' or (payload->>'seat')::integer is distinct from seat then raise exception 'Invalid shot.'; end if;
  if coalesce(payload->>'drive','') !~ '^-?[0-9]{1,4}$' or abs((payload->>'drive')::integer) > 2728 then raise exception 'Drive along the box, not around the world.'; end if;
  if coalesce(payload->>'angle','') !~ '^[0-9]{1,2}$' or (payload->>'angle')::integer<5 or (payload->>'angle')::integer>85 then raise exception 'Aim between 5 and 85 degrees.'; end if;
  if coalesce(payload->>'power','') !~ '^[0-9]+(\\.[0-9])?$' or (payload->>'power')::numeric<1 or (payload->>'power')::numeric>24 then raise exception 'Power is between 1 and 24.'; end if;
  if payload->>'weapon' not in ('standard','heavy','cluster','mine','ricochet') then raise exception 'Unknown weapon.'; end if;
  if (payload->'won' is not null) and payload->>'won' not in ('1','2') then raise exception 'Invalid result.'; end if;
  -- The shot is what travels; hit points, holes and falls are recomputed from
  -- this list by both clients. `won` is the mover's replay verdict, kept
  -- separate from the stored shots.
  declare winner integer := case when payload->>'won' in ('1','2') then (payload->>'won')::integer else null end;
  begin
   return jsonb_build_object('state',jsonb_build_object(
     'seed',state->'seed',
     'shots',(state->'shots')||jsonb_build_array(jsonb_build_object('seat',seat,'drive',(payload->>'drive')::integer,
       'angle',(payload->>'angle')::integer,'power',round((payload->>'power')::numeric,1),'weapon',payload->>'weapon')),
     'turn',case when winner is null then (case when seat=1 then 2 else 1 end) else null end,
     'winner',to_jsonb(winner)),
    'won',winner is not null,'reason','One box, one survivor');
  end;
 end if;
 if game_id='tank2' and rules=1 then
  if jsonb_typeof(payload)<>'object' then raise exception 'Invalid shot.'; end if;
  if jsonb_typeof(state->'shots') is distinct from 'array' then raise exception 'Invalid shot.'; end if;
  if jsonb_array_length(state->'shots')>=200 then raise exception 'This game has run its course.'; end if;
  if state ? 'winner' and jsonb_typeof(state->'winner')<>'null' then raise exception 'This game is over.'; end if;
  if coalesce(payload->>'seat','') !~ '^[12]$' or (payload->>'seat')::integer is distinct from seat then raise exception 'Invalid shot.'; end if;
  if coalesce(payload->>'x','') !~ '^[0-9]{1,3}$' or (payload->>'x')::integer<20 or (payload->>'x')::integer>940 then raise exception 'That is off the field.'; end if;
  if coalesce(payload->>'angle','') !~ '^[0-9]{1,2}$' or (payload->>'angle')::integer<5 or (payload->>'angle')::integer>85 then raise exception 'Aim between 5 and 85 degrees.'; end if;
  if coalesce(payload->>'power','') !~ '^[0-9]+(\\.[0-9]+)?$' or (payload->>'power')::numeric<1 or (payload->>'power')::numeric>20 then raise exception 'Power is between 1 and 20.'; end if;
  if payload->>'weapon' not in ('standard','heavy','cluster','nuke') then raise exception 'Unknown weapon.'; end if;
  return jsonb_build_object('state',jsonb_build_object(
    'seed',state->'seed',
    'shots',(state->'shots')||jsonb_build_array(jsonb_build_object('seat',seat,'x',(payload->>'x')::integer,
      'angle',(payload->>'angle')::integer,'power',round((payload->>'power')::numeric,1),'weapon',payload->>'weapon')),
    'turn',case when seat=1 then 2 else 1 end,
    'winner',case when coalesce(payload->>'won','false')='true' then seat else null end),
   'won',coalesce(payload->>'won','false')='true','reason','Last tank standing');
 end if;
 raise exception 'Rules version unavailable.';
end $$;

-- the client-facing api is unchanged; it already resumes apply_move's output
revoke all on function bored_together.initial_state(text,integer) from public,anon,authenticated;
revoke all on function bored_together.apply_move(text,integer,jsonb,jsonb,integer) from public,anon,authenticated;
grant execute on function bored_together.api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- Local check (PGlite, offline; applies scripts/bored-together.sql + every
-- migration in sorted order) runs through tests/bored-together.test.cjs.
-- Production needs the SQL editor or CLI; there is no deploy hook for
-- migrations in this repository.
