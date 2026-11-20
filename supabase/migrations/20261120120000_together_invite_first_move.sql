-- An accepted invite is the invitee's game, and the invitee moves first.
--
-- Until now a claimed invite built a normal challenge: the inviter was p1 and
-- held the turn, so somebody who accepted an invite and joined Bored Together
-- landed on a game that said "waiting on them" and had nothing to play. The
-- invitation is a promise of a turn, so claim now seats the new member as p1
-- and gives them the move: the popup can drop them straight into their first
-- one. Seat 1 is p1 everywhere else (apply_move passes 1 for p1, and
-- initial_state is called with 1), so this keeps both seats' rules intact.
--
-- revealed_at stays set: the inviter already knows about the game, and the
-- state it is in is the opening position the new member plays into.
do $patch$
declare s text;
begin
  s := pg_get_functiondef('bored_together.invite_api(text,jsonb)'::regprocedure);
  -- Idempotent: a second run finds the seat already swapped.
  if position('bored_together.game_mode(inv.game),u,inv.inviter' in s) = 0 then
    s := replace(s,
      'values(inv.game,bored_together.game_mode(inv.game),inv.inviter,u,''challenge'',''active'',inv.inviter,now(),',
      'values(inv.game,bored_together.game_mode(inv.game),u,inv.inviter,''challenge'',''active'',u,now(),');
    execute s;
  end if;
end $patch$;

notify pgrst,'reload schema';
