-- Each challenge is an independent game. Preserve turn ownership, request IDs,
-- authorization, first-turn delivery, deletion and the existing game validators.
begin;
drop index bored_together.bt_open_pair;
create index bt_open_pair on bored_together.matches(game,least(p1,p2),greatest(p1,p2)) where status='active';
do $migration$
declare definition text:=pg_get_functiondef('bored_together.api(text,jsonb)'::regprocedure);
 guard text:=$guard$  select * into m from bored_together.matches x where x.game=game_id and x.status='active'
  and ((x.p1=u and x.p2=target) or (x.p2=u and x.p1=target)) for update;
  if m.id is not null then
   raise exception 'You already have a % game with %. Finish that one first.',
   case game_id when '8ball' then 'Pool' when '2048' then '2048' when 'mahjong' then 'Mahjong' when 'tank2' then 'Pastel Tanks' else 'Connect Four' end,
   coalesce((select handle from public.profiles where id=target),'that player');
  end if;
$guard$;
begin
 if (length(definition)-length(replace(definition,guard,''))) / length(guard) <> 1 then
  raise exception 'Unexpected challenge dispatcher; review concurrent changes before applying.';
 end if;
 execute replace(definition,guard,'');
end $migration$;
notify pgrst,'reload schema';
commit;
