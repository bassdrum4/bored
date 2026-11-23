-- Invite funnel for the admin dashboard: how many codes exist, how many were
-- used, and how many recruits are still waiting for their second play day.
-- invite_codes and recruits are readable by no client role, so this
-- admin-only aggregate is the only way the dashboard can see them.
create or replace function public.analytics_invites_v1(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $fn$
declare result jsonb;
begin
  if (select auth.uid()) is null or not (select public.is_analytics_admin()) then
    raise exception 'Analytics admin access required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_from >= p_to or p_to - p_from > interval '90 days' then
    raise exception 'Invalid reporting range' using errcode = '22023';
  end if;

  with admins as materialized (
    select user_id from public.analytics_admins
  ), codes as materialized (
    select c.created_at
    from public.invite_codes c
    where c.user_id not in (select user_id from admins)
  ), recruits as materialized (
    select r.code, r.created_at, r.credited_at, r.days_reported
    from public.recruits r
    where r.inviter not in (select user_id from admins)
      and r.invitee not in (select user_id from admins)
  ), in_range as materialized (
    select * from recruits where created_at >= p_from and created_at < p_to
  ), recruit_days as (
    select
      (created_at at time zone 'America/Detroit')::date as day,
      count(*) as redemptions,
      count(*) filter (where credited_at is not null) as credited
    from in_range
    group by 1
  ), issue_days as (
    select (created_at at time zone 'America/Detroit')::date as day, count(*) as issued
    from codes
    where created_at >= p_from and created_at < p_to
    group by 1
  ), timeline as (
    select coalesce(d.day, i.day) as day,
      coalesce(i.issued, 0) as issued,
      coalesce(d.redemptions, 0) as redemptions,
      coalesce(d.credited, 0) as credited
    from recruit_days d
    full join issue_days i on i.day = d.day
  ), recruiter_rows as (
    select p.handle,
      count(*) filter (where r.credited_at is not null) as credited,
      count(*) filter (where r.credited_at is null) as pending
    from public.recruits r
    join public.profiles p on p.id = r.inviter
    where r.inviter not in (select user_id from admins)
      and r.invitee not in (select user_id from admins)
    group by p.handle
  )
  select jsonb_build_object(
    'codes_total', (select count(*) from codes),
    'codes_issued', (select count(*) from codes where created_at >= p_from and created_at < p_to),
    'codes_redeemed', (select count(distinct code) from in_range),
    'codes_redeemed_total', (select count(distinct code) from recruits),
    'redemptions', (select count(*) from in_range),
    'pending', (select count(*) from in_range where credited_at is null),
    'credited', (select count(*) from in_range where credited_at is not null),
    'pending_total', (select count(*) from recruits where credited_at is null),
    'credited_total', (select count(*) from recruits where credited_at is not null),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'),
        'issued', issued,
        'redemptions', redemptions,
        'credited', credited
      ) order by day)
      from timeline
    ), '[]'::jsonb),
    'recruiters', coalesce((
      select jsonb_agg(jsonb_build_object(
        'handle', handle, 'credited', credited, 'pending', pending
      ) order by credited desc, pending desc, handle)
      from (select * from recruiter_rows order by credited desc, pending desc, handle limit 25) top
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$fn$;
revoke all on function public.analytics_invites_v1(timestamptz,timestamptz) from public, anon;
grant execute on function public.analytics_invites_v1(timestamptz,timestamptz) to authenticated;
notify pgrst, 'reload schema';
