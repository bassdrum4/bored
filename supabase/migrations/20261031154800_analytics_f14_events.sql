-- Bored's private F-14 flight table remains unreadable to browser roles.
-- This tightly scoped, paginated admin-only reporting RPC exposes its events
-- in the same shape as play_events, without copying or mutating telemetry.
create function public.analytics_f14_events(
  p_from timestamptz,
  p_to timestamptz,
  p_cutoff timestamptz,
  p_after_at timestamptz default null,
  p_after_id uuid default null,
  p_limit integer default 1000
)
returns table (
  id uuid,
  session_id uuid,
  user_id uuid,
  game text,
  kind text,
  received_at timestamptz,
  active_ms integer,
  visible_ms integer,
  details jsonb,
  visitor_id uuid
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not exists (
    select 1 from public.analytics_admins a where a.user_id = (select auth.uid())
  ) then
    raise exception 'Analytics admin access required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_cutoff is null
     or p_from >= p_to or p_to - p_from > interval '90 days'
     or p_limit is null or p_limit < 1 or p_limit > 1000
     or (p_after_at is null) <> (p_after_id is null) then
    raise exception 'Invalid reporting range or cursor' using errcode = '22023';
  end if;

  return query
    select f.id, f.session_id, f.user_id, 'f-14'::text,
           f.kind, f.received_at, f.active_ms, f.visible_ms,
           f.details, f.visitor_id
    from public.f14_flight_events f
    where f.received_at >= p_from and f.received_at < p_to
      and f.received_at <= p_cutoff
      and (p_after_at is null or (f.received_at, f.id) > (p_after_at, p_after_id))
    order by f.received_at, f.id
    limit p_limit;
end;
$$;

revoke all on function public.analytics_f14_events(timestamptz,timestamptz,timestamptz,timestamptz,uuid,integer)
  from public, anon;
grant execute on function public.analytics_f14_events(timestamptz,timestamptz,timestamptz,timestamptz,uuid,integer)
  to authenticated;
