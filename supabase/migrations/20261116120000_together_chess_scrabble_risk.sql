-- Bored Together: Chess, Scrabble and Risk replace the 2048 and Mahjong duels.
--
-- All three games hand the whole position over at the end of a turn, the way a
-- Civ Lite campaign does: the mover sends `{ game: {...}, winner: 1|2|null,
-- draw: bool }`, the server stores it and gives the next turn to the other
-- seat. The server does not simulate chess, spelling or dice; it bounds the
-- payload, owns the turn order and records the result the mover reports. That
-- is the same trust Tank 2 and Civ Lite already use, and it is deliberately
-- not presented as a server-refereed board.
--
-- 2048 and Mahjong stay valid rows for matches that already exist, but no new
-- challenge, queue entry or invite may name them. Their duel helpers are left
-- in place so an old active match can still be read.
begin;

-- 1. Opening positions. Chess and Risk start from their game's own document;
-- Scrabble's bag is dealt from one seed so both screens shuffle alike.
do $patch$
declare s text; add text;
begin
  s := pg_get_functiondef('bored_together.initial_state'::regproc);
  if position('game_id=''chess''' in s)=0 then
    add := $add$
 if game_id='chess' and rules=1 then
  return jsonb_build_object('seed',null,'game',null,'turn',1,'winner',null);
 end if;
 if game_id='scrabble' and rules=1 then
  return jsonb_build_object('seed',(1+floor(random()*2147483646))::bigint,'game',null,'turn',1,'winner',null);
 end if;
 if game_id='risk' and rules=1 then
  return jsonb_build_object('seed',null,'game',null,'turn',1,'winner',null);
 end if;
$add$;
    s := replace(s, ' raise exception ''Rules version unavailable.'';', add || ' raise exception ''Rules version unavailable.'';');
    execute s;
  end if;
end $patch$;

-- 2. One turn = one stored position. A winner seat and a draw are the only
-- result claims; everything else just passes the turn.
do $patch$
declare s text; add text;
begin
  s := pg_get_functiondef('bored_together.apply_move'::regproc);
  if position('game_id=''chess''' in s)=0 then
    add := $add$
 if game_id in ('chess','scrabble','risk') and rules=1 then
  if jsonb_typeof(payload)<>'object' or jsonb_typeof(payload->'game') is distinct from 'object' then
   raise exception 'Invalid turn.';
  end if;
  if octet_length((payload->'game')::text)>400000 then
   raise exception 'That position is too large to save.';
  end if;
  if state ? 'winner' and jsonb_typeof(state->'winner')<>'null' then
   raise exception 'This game is over.';
  end if;
  declare winner_seat integer := case when coalesce(payload->>'winner','') ~ '^[12]$' then (payload->>'winner')::integer else null end;
          is_draw boolean := coalesce(payload->>'draw','false')='true';
  begin
   return jsonb_build_object(
    'state',jsonb_build_object(
     'seed',state->'seed','game',payload->'game',
     'turn',case when winner_seat is null and not is_draw then (case when seat=1 then 2 else 1 end) else null end,
     'winner',to_jsonb(winner_seat)),
    'won',winner_seat is not null,
    'draw',is_draw,
    'winnerSeat',winner_seat,
    'reason',case game_id when 'chess' then 'Checkmate on the board'
      when 'scrabble' then 'Higher word score' else 'The world is taken' end);
  end;
 end if;
$add$;
    s := replace(s, ' raise exception ''Rules version unavailable.'';', add || ' raise exception ''Rules version unavailable.'';');
    execute s;
  end if;
end $patch$;

-- 3. The dispatcher's game list, display names, idempotent retry and move log.
-- The match dispatcher and the invite endpoint both carry the same list.
do $patch$
declare s text; add text;
begin
  s := pg_get_functiondef('bored_together.api'::regproc);
  s := replace(s,
    '''connect-four'',''8ball'',''2048'',''mahjong'',''tank2'',''ashcrown''',
    '''connect-four'',''8ball'',''tank2'',''ashcrown'',''chess'',''scrabble'',''risk''');
  s := replace(s, 'when ''ashcrown'' then ''Ashcrown''',
    'when ''ashcrown'' then ''Ashcrown'' when ''chess'' then ''Chess'' when ''scrabble'' then ''Scrabble'' when ''risk'' then ''Risk''');
  s := replace(s, '(m.game<>''ashcrown'' and previous.move<>payload)',
    '(m.game not in (''ashcrown'',''chess'',''scrabble'',''risk'') and previous.move<>payload)');
  s := replace(s, 'case when m.game=''ashcrown'' then payload-''board'' else payload end',
    'case when m.game=''ashcrown'' then payload-''board''
       when m.game in (''chess'',''scrabble'',''risk'') then payload-''game'' else payload end');
  s := replace(s, 'if (transition->>''won'')::boolean then perform bored_together.finish(mid,u,',
    'if (transition->>''won'')::boolean then perform bored_together.finish(mid,case when transition->>''winnerSeat''=''1'' then m.p1 when transition->>''winnerSeat''=''2'' then m.p2 else u end,');
  execute s;

  if to_regprocedure('bored_together.invite_api(text,jsonb)') is not null then
    s := pg_get_functiondef('bored_together.invite_api(text,jsonb)'::regprocedure);
    s := replace(s,
      '''connect-four'',''8ball'',''2048'',''mahjong'',''tank2'',''ashcrown''',
      '''connect-four'',''8ball'',''tank2'',''ashcrown'',''chess'',''scrabble'',''risk''');
    execute s;
  end if;
end $patch$;

-- 4. Existing rows keep their game value; new rows may name the three arrivals.
alter table bored_together.matches drop constraint if exists matches_game_check;
alter table bored_together.matches add constraint matches_game_check
 check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown','chess','scrabble','risk'));
alter table bored_together.queue drop constraint if exists queue_game_check;
alter table bored_together.queue add constraint queue_game_check
 check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown','chess','scrabble','risk'));
alter table bored_together.invites drop constraint if exists invites_game_check;
alter table bored_together.invites add constraint invites_game_check
 check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown','chess','scrabble','risk'));

revoke all on function bored_together.api(text,jsonb) from public,anon,authenticated;
grant execute on function bored_together.api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
