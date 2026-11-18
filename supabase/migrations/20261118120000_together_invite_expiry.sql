-- Invitations are a nudge, not a permanent claim on a seat.
--
-- A pending invite that nobody acted on for a week stops appearing in the
-- recipient's list and cannot be accepted. An accepted invite that was never
-- claimed (the recipient has not joined Bored Together yet) is cancelled when
-- the week is up, so a stale promise does not turn into a game months later.
-- Re-sending an invite refreshes created_at, which starts the week again.
do $patch$
declare s text;
begin
  s := pg_get_functiondef('bored_together.invite_api(text,jsonb)'::regprocedure);
  -- Idempotent: a second run finds the patches already applied.
  if position('created_at > now() - interval ''7 days''' in s) = 0 then
    s := replace(s,
      'where x.invitee=u and x.status in (''pending'',''accepted'')',
      'where x.invitee=u and x.status in (''pending'',''accepted'')
       and x.created_at > now() - interval ''7 days''');
    s := replace(s,
      'and status=''pending'' returning * into inv',
      'and status=''pending'' and created_at > now() - interval ''7 days''
       returning * into inv');
    s := replace(s,
      'for inv in select * from bored_together.invites',
      'update bored_together.invites set status=''cancelled''
        where invitee=u and status=''accepted''
          and coalesce(accepted_at,created_at) < now() - interval ''7 days'';
       for inv in select * from bored_together.invites');
    execute s;
  end if;
end $patch$;

notify pgrst,'reload schema';
