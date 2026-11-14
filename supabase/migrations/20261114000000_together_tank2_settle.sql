-- Tank 2: a round can be settled from either screen.
--
-- A tank can be lost with no shot to carry the result (driving into a hole, or
-- a mine that went off while the other player was aiming), so the server can be
-- left holding the turn for a tank that no longer exists. `resign` already
-- records that loss for the screen that asks for it. `claim` is its mirror: the
-- survivor's own replay says the other tank is gone, and it ends the match in
-- the caller's favour when the turn holder can no longer play.
--
-- The referee still does not simulate the shot list, so `claim` is the same
-- trust as the `won` field on a move: the caller's word, bounded by match
-- membership, an active tank2 rules-v3 match, no stored winner, and at least
-- one shot already played. It is not a result the database can prove.
begin;

do $patch$
declare s text; add text;
begin
 s := pg_get_functiondef('bored_together.api'::regproc);
 if position('action=''claim''' in s)=0 then
  add := $add$
 elsif action='claim' then
  mid:=(args->>'match_id')::uuid;
  select * into m from bored_together.matches where id=mid for update;
  if m.id is null or u not in(m.p1,m.p2) then raise exception 'Match unavailable.' using errcode='42501'; end if;
  if m.game<>'tank2' or m.rules_version<>3 then raise exception 'Game unavailable.'; end if;
  if m.status<>'active' then raise exception 'Game is no longer active.'; end if;
  if m.state ? 'winner' and jsonb_typeof(m.state->'winner')<>'null' then raise exception 'Game is over.'; end if;
  if jsonb_typeof(m.state->'shots') is distinct from 'array' or jsonb_array_length(m.state->'shots')=0 then
   raise exception 'Nothing has been fired yet.';
  end if;
  -- A shot that ends the match stores a null state turn; a settled one should read
  -- the same to both clients.
  update bored_together.matches set state=jsonb_set(m.state,'{turn}','null'::jsonb) where id=mid;
  perform bored_together.finish(mid,u,'Last tank standing');
  select * into m from bored_together.matches where id=mid;
  return bored_together.match_json(m,u);
$add$;
  -- The dispatcher ends in `elsif action<>'dashboard' then raise …`, so the new
  -- branch goes in front of that line and keeps dashboard's tail intact.
  s := replace(s, 'elsif action<>''dashboard'' then raise exception ''Unknown operation.'';',
    add || 'elsif action<>''dashboard'' then raise exception ''Unknown operation.'';');
  execute s;
 end if;
end $patch$;

revoke all on function bored_together.api(text,jsonb) from public,anon,authenticated;
grant execute on function bored_together.api(text,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

-- Local check (PGlite, offline; applies scripts/bored-together.sql + every
-- migration in sorted order) runs through tests/bored-together.test.cjs.
-- Production needs the SQL editor or CLI; there is no deploy hook for
-- migrations in this repository.
