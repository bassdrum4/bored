-- Bored Together serves the live game documents. Tank 2 now replays the live
-- engine's exact shot, and Ashcrown hands a two-human campaign over turn by
-- turn, so the board travels with the move.
create or replace function bored_together.game_mode(g text) returns text language sql immutable set search_path='' as $$
 select case when g in ('2048','mahjong') then 'duel' else 'turns' end;
$$;

create or replace function bored_together.stamp_tank2_rules() returns trigger language plpgsql set search_path='' as $fn$
begin if new.game='tank2' then new.rules_version:=3; end if; return new; end $fn$;

do $patch$
declare s text; add text;
begin
 s := pg_get_functiondef('bored_together.initial_state'::regproc);
 if position('ashcrown' in s)=0 then
  s := replace(s, '(rules=1 or rules=2)', '(rules in (1,2,3))');
  add := $add$ if game_id='ashcrown' and rules=1 then return jsonb_build_object('seed',(1+floor(random()*2147483646))::bigint,'board',null,'turn',1,'winner',null); end if;
$add$;
  s := replace(s, ' raise exception ''Rules version unavailable.'';', add || ' raise exception ''Rules version unavailable.'';');
  execute s;
 end if;
end $patch$;

do $patch$
declare s text; add text;
begin
 s := pg_get_functiondef('bored_together.apply_move'::regproc);
 if position('ashcrown' in s)=0 then
  add := $add$
 if game_id='ashcrown' and rules=1 then
  if jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'board') is distinct from 'object' then raise exception 'Invalid turn.'; end if;
  if coalesce(payload->>'turn','') !~ '^[0-9]{1,3}$' then raise exception 'Invalid turn.'; end if;
  declare winner_seat integer := case when coalesce(payload->>'winner','') ~ '^[12]$' then (payload->>'winner')::integer else null end;
  begin
   return jsonb_build_object('state',jsonb_build_object(
     'seed',state->'seed','board',payload->'board',
     'turn',case when winner_seat is null then (case when seat=1 then 2 else 1 end) else null end,
     'winner',to_jsonb(winner_seat)),
    'won',winner_seat is not null,'winnerSeat',winner_seat,'reason','Renown across the valley');
  end;
 end if;
 if game_id='tank2' and rules=3 then
  if jsonb_typeof(payload)<>'object' then raise exception 'Invalid shot.'; end if;
  if jsonb_typeof(state->'shots') is distinct from 'array' then raise exception 'Invalid shot.'; end if;
  if jsonb_array_length(state->'shots')>=200 then raise exception 'This game has run its course.'; end if;
  if state ? 'winner' and jsonb_typeof(state->'winner')<>'null' then raise exception 'This game is over.'; end if;
  if coalesce(payload->>'seat','') !~ '^[12]$' or (payload->>'seat')::integer is distinct from seat then raise exception 'Invalid shot.'; end if;
  if coalesce(payload->>'angle','') !~ '^[0-9]{1,3}([.][0-9]{1,2})?$' or (payload->>'angle')::numeric<0 or (payload->>'angle')::numeric>180 then raise exception 'Aim within the circle.'; end if;
  if coalesce(payload->>'power','') !~ '^[0-9]{1,3}([.][0-9]{1,2})?$' or (payload->>'power')::numeric<25 or (payload->>'power')::numeric>100 then raise exception 'Power is between 25 and 100.'; end if;
  if payload->>'weapon' not in ('standard','heavy','cluster','mine','ricochet') then raise exception 'Unknown weapon.'; end if;
  if jsonb_typeof(payload->'at')<>'object' or coalesce(payload->'at'->>'x','') !~ '^[0-9]{1,4}([.][0-9]+)?$' or coalesce(payload->'at'->>'y','') !~ '^[0-9]{1,4}([.][0-9]+)?$' then raise exception 'Invalid launch point.'; end if;
  if (payload->'at'->>'x')::numeric>2000 or (payload->'at'->>'y')::numeric>1000 then raise exception 'That is off the field.'; end if;
  if coalesce(payload->>'rng','') !~ '^[0-9]{1,10}$' then raise exception 'Invalid shot.'; end if;
  if coalesce(payload->>'wind','') !~ '^-?[0-9]{1,2}$' then raise exception 'Invalid shot.'; end if;
  if (payload->'won' is not null) and payload->>'won' not in ('1','2') then raise exception 'Invalid result.'; end if;
  declare winner integer := case when payload->>'won' in ('1','2') then (payload->>'won')::integer else null end;
  begin
   return jsonb_build_object('state',jsonb_build_object(
     'seed',state->'seed',
     'shots',(state->'shots')||jsonb_build_array(jsonb_build_object('seat',seat,
       'angle',(payload->>'angle')::numeric,'power',(payload->>'power')::numeric,'weapon',payload->>'weapon',
       'at',payload->'at','rng',(payload->>'rng')::bigint,'wind',(payload->>'wind')::integer)),
     'turn',case when winner is null then (case when seat=1 then 2 else 1 end) else null end,
     'winner',to_jsonb(winner)),
    'won',winner is not null,'reason','One box, one survivor');
  end;
 end if;
$add$;
  s := replace(s, ' raise exception ''Rules version unavailable.'';', add || ' raise exception ''Rules version unavailable.'';');
  execute s;
 end if;
end $patch$;

do $patch$
declare s text;
begin
 s := pg_get_functiondef('bored_together.api'::regproc);
 s := replace(s, 'octet_length(args::text)>4096', 'octet_length(args::text)>4000000');
 s := replace(s, 'insert into bored_together.moves(match_id,version,actor,request_id,move) values(mid,m.version+1,u,rid,payload);',
   'insert into bored_together.moves(match_id,version,actor,request_id,move) values(mid,m.version+1,u,rid,case when m.game=''ashcrown'' then payload-''board'' else payload end);');
 execute s;
end $patch$;

alter table bored_together.matches drop constraint if exists matches_game_check;
alter table bored_together.matches add constraint matches_game_check
 check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown'));
alter table bored_together.queue drop constraint if exists queue_game_check;
alter table bored_together.queue add constraint queue_game_check
 check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown'));

-- Ashcrown joins the games the RPCs accept, including the invite endpoint.
do $patch$
declare s text;
begin
 s := pg_get_functiondef('bored_together.api'::regproc);
 s := replace(s, '''mahjong'',''tank2''', '''mahjong'',''tank2'',''ashcrown''');
 s := replace(s, 'when ''tank2'' then ''Pastel Tanks''',
   'when ''tank2'' then ''Pastel Tanks'' when ''ashcrown'' then ''Ashcrown''');
 execute s;
 if to_regprocedure('bored_together.invite_api(text,jsonb)') is not null then
  s := pg_get_functiondef('bored_together.invite_api(text,jsonb)'::regprocedure);
  s := replace(s, '''mahjong'',''tank2''', '''mahjong'',''tank2'',''ashcrown''');
  execute s;
 end if;
end $patch$;
