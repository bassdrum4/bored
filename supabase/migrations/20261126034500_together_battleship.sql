begin;
-- Battleship is server-refereed: fleets never appear in another player's state or move log.
create or replace function bored_together.battleship_move(s jsonb,p jsonb,seat integer)
returns jsonb language plpgsql immutable set search_path='' as $bs$
declare k text:=seat::text; o text:=(3-seat)::text; f jsonb; ship jsonb; seen integer[]:='{}'; vals integer[]; n integer; i integer:=0; c integer; step integer; hit boolean; won boolean:=false; shots jsonb;
begin
 if seat not in (1,2) or jsonb_typeof(p) is distinct from 'object' or s->>'winner' is not null then raise exception 'Invalid move.'; end if;
 if not (s->'fleets' ? k) then
  f:=p->'fleet';
  if p-'fleet'<>'{}'::jsonb or jsonb_typeof(f) is distinct from 'array' then raise exception 'Deploy five ships first.'; end if;
  if jsonb_array_length(f)<>5 then raise exception 'Deploy five ships first.'; end if;
  for ship in select value from jsonb_array_elements(f) loop
   i:=i+1; n:=(array[5,4,3,3,2])[i];
   if jsonb_typeof(ship) is distinct from 'array' then raise exception 'Invalid ship.'; end if;
   if jsonb_array_length(ship)<>n then raise exception 'Invalid ship length.'; end if;
   if exists(select 1 from jsonb_array_elements(ship) x where jsonb_typeof(x) is distinct from 'number' or x::text !~ '^[0-9]{1,2}$') then raise exception 'Invalid cell.'; end if;
   select array_agg(value::text::integer order by ordinality) into vals from jsonb_array_elements(ship) with ordinality;
   step:=vals[2]-vals[1];
   if step not in (1,10) or (step=1 and vals[1]/10<>vals[n]/10) then raise exception 'Ships must be straight.'; end if;
   for j in 1..n loop
    c:=vals[j]; if c<>vals[1]+(j-1)*step or c=any(seen) then raise exception 'Ships overlap or are not contiguous.'; end if;
    seen:=array_append(seen,c);
   end loop;
  end loop;
  s:=jsonb_set(s,array['fleets',k],f);
 elsif s->'fleets' ? o then
  if p-'fire'<>'{}'::jsonb or jsonb_typeof(p->'fire') is distinct from 'number' or coalesce(p->>'fire','') !~ '^[0-9]{1,2}$' then raise exception 'Choose an enemy cell.'; end if;
  c:=(p->>'fire')::integer; shots:=s->'shots'->k;
  if exists(select 1 from jsonb_array_elements(shots) x where (x->>'cell')::integer=c) then raise exception 'Already fired there.'; end if;
  hit:=exists(select 1 from jsonb_array_elements(s->'fleets'->o) sh cross join lateral jsonb_array_elements(sh) x where x::text::integer=c);
  shots:=shots||jsonb_build_array(jsonb_build_object('cell',c,'hit',hit));
  s:=jsonb_set(s,array['shots',k],shots);
  won:=(select count(*) from jsonb_array_elements(shots) x where (x->>'hit')::boolean)=17;
  if won then s:=jsonb_set(s,'{winner}',to_jsonb(seat)); end if;
 else raise exception 'Wait for the other fleet.'; end if;
 return jsonb_build_object('state',s,'won',won,'winnerSeat',case when won then seat else null end,'reason','Enemy fleet sunk');
end $bs$;
create or replace function bored_together.battleship_view(s jsonb,seat integer)
returns jsonb language sql immutable set search_path='' as $bs$
 select jsonb_build_object('fleet',coalesce(s->'fleets'->(seat::text),'[]'::jsonb),
 'placed',s->'fleets' ? (seat::text),'ready',(s->'fleets' ? '1') and (s->'fleets' ? '2'),
 'outgoing',s->'shots'->(seat::text),'incoming',s->'shots'->((3-seat)::text),'winner',s->'winner');
$bs$;
revoke all on function bored_together.battleship_move(jsonb,jsonb,integer),bored_together.battleship_view(jsonb,integer) from public,anon,authenticated;
do $patch$
declare s text; old text; n text;
begin
 s:=pg_get_functiondef('bored_together.initial_state'::regproc);
 if position('game_id=''battleship''' in s)=0 then
  old:='begin'; n:='begin
 if game_id=''battleship'' and rules=1 then return ''{"fleets":{},"shots":{"1":[],"2":[]},"winner":null}''::jsonb; end if;';
  if position(old in s)=0 then raise exception 'initial state anchor missing'; end if;
  execute replace(s,old,n);
 end if;
 s:=pg_get_functiondef('bored_together.apply_move'::regproc);
 if position('game_id=''battleship''' in s)=0 then
  old:='if game_id=''connect-four'' and rules=1 then';
  if position(old in s)=0 then raise exception 'move anchor missing'; end if;
  execute replace(s,old,'if game_id=''battleship'' and rules=1 then return bored_together.battleship_move(state,payload,seat); end if;
 '||old);
 end if;
 s:=pg_get_functiondef('bored_together.match_json'::regproc);
 if position('battleship_view' in s)=0 then
  old:='else m.state end';
  if position(old in s)=0 then raise exception 'projection anchor missing'; end if;
  execute replace(s,old,'when m.game=''battleship'' then bored_together.battleship_view(m.state,case when m.p1=viewer then 1 else 2 end) else m.state end');
 end if;
 s:=pg_get_functiondef('bored_together.api'::regproc);
 if position('''battleship''' in s)=0 then
  old:='''connect-four'',''8ball'',''tank2'',''ashcrown'',''chess'',''scrabble'',''risk''';
  if position(old in s)=0 then raise exception 'API game list anchor missing'; end if;
  s:=replace(s,old,old||',''battleship''');
  old:='when ''risk'' then ''Risk''';
  s:=replace(s,old,old||' when ''battleship'' then ''Battleship''');
  old:='from bored_together.moves x where match_id=mid;';
  if position(old in s)=0 then raise exception 'move log anchor missing'; end if;
  s:=replace(s,old,'from bored_together.moves x where match_id=mid and not (m.game=''battleship'' and x.move ? ''fleet'' and x.actor<>u);');
  execute s;
 end if;
 s:=pg_get_functiondef('bored_together.invite_api'::regproc);
 if position('''battleship''' in s)=0 then
  old:='''connect-four'',''8ball'',''tank2'',''ashcrown'',''chess'',''scrabble'',''risk''';
  if position(old in s)=0 then raise exception 'invite game list anchor missing'; end if;
  execute replace(s,old,old||',''battleship''');
 end if;
end $patch$;
alter table bored_together.matches drop constraint if exists matches_game_check;
alter table bored_together.matches add constraint matches_game_check check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown','chess','scrabble','risk','battleship'));
alter table bored_together.queue drop constraint if exists queue_game_check;
alter table bored_together.queue add constraint queue_game_check check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown','chess','scrabble','risk','battleship'));
alter table bored_together.invites drop constraint if exists invites_game_check;
alter table bored_together.invites add constraint invites_game_check check (game in ('connect-four','8ball','2048','mahjong','tank2','ashcrown','chess','scrabble','risk','battleship'));
notify pgrst,'reload schema';
commit;
