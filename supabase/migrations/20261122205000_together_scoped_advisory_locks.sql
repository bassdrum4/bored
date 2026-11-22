-- Preserve the production fix for Friday's global advisory-lock contention.
-- Older Bored Together migrations serialize every API call on (210425, 1).
-- Production now locks only the account(s) or queue actually being mutated.
-- This migration records that live behavior so a fresh database/replay retains it.

create or replace function bored_together.lock_accounts(a uuid, b uuid)
returns void language plpgsql set search_path = '' as $function$
declare ka integer; kb integer;
begin
  if a is null then return; end if;
  ka := hashtext(a::text);
  if b is null or b = a then
    perform pg_advisory_xact_lock(210425, ka);
    return;
  end if;
  kb := hashtext(b::text);
  if ka = kb then
    perform pg_advisory_xact_lock(210425, ka);
    return;
  end if;
  -- A deterministic order prevents opposing challenges from deadlocking.
  if ka < kb then
    perform pg_advisory_xact_lock(210425, ka);
    perform pg_advisory_xact_lock(210425, kb);
  else
    perform pg_advisory_xact_lock(210425, kb);
    perform pg_advisory_xact_lock(210425, ka);
  end if;
end;
$function$;

create or replace function bored_together.lock_scope(u uuid, action text, args jsonb)
returns void language plpgsql set search_path = '' as $function$
declare other uuid; mid uuid; game_id text := coalesce(args->>'game', 'connect-four');
begin
  if u is null then return; end if;
  if action in ('challenge', 'block', 'unblock') then
    begin other := (args->>'user_id')::uuid;
    exception when others then other := null; end;
    perform bored_together.lock_accounts(u, other);
  elsif action = 'rematch' then
    begin mid := (args->>'match_id')::uuid;
    exception when others then mid := null; end;
    select case when p1 = u then p2 else p1 end into other
      from bored_together.matches where id = mid;
    perform bored_together.lock_accounts(u, other);
  elsif action in ('queue_join', 'queue_cancel') then
    perform pg_advisory_xact_lock(210425, hashtext(u::text));
    perform pg_advisory_xact_lock(210426, hashtext(game_id));
  else
    perform pg_advisory_xact_lock(210425, hashtext(u::text));
  end if;
end;
$function$;

-- Patch only the obsolete lock statement in existing RPC bodies, leaving all
-- later gameplay/permissions/invitation changes intact. On production these
-- calls are already scoped, so both updates are deliberately no-ops.
do $patch$
declare definition text;
begin
  select pg_get_functiondef(to_regprocedure('bored_together.api(text,jsonb)'))
    into definition;
  if definition is null then
    raise exception 'bored_together.api(text,jsonb) is missing';
  end if;
  if position('perform pg_advisory_xact_lock(210425,1);' in definition) > 0 then
    execute replace(definition,
      'perform pg_advisory_xact_lock(210425,1);',
      'perform bored_together.lock_scope(u,action,args);');
  elsif position('perform bored_together.lock_scope(u,action,args);' in definition) = 0 then
    raise exception 'bored_together.api has an unrecognized lock implementation';
  end if;

  select pg_get_functiondef(to_regprocedure('bored_together.pool_commit(jsonb)'))
    into definition;
  if definition is null then
    raise exception 'bored_together.pool_commit(jsonb) is missing';
  end if;
  if position('perform pg_advisory_xact_lock(210425,1);' in definition) > 0 then
    execute replace(definition,
      'perform pg_advisory_xact_lock(210425,1);',
      'perform pg_advisory_xact_lock(210425,hashtext(actor::text));');
  elsif position('perform pg_advisory_xact_lock(210425,hashtext(actor::text));' in definition) = 0 then
    raise exception 'bored_together.pool_commit has an unrecognized lock implementation';
  end if;
end;
$patch$;
