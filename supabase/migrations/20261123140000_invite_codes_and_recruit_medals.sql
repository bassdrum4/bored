-- Invites: every account gets a short code, a new account may enter one for its
-- first three days, and the credit lands once that account has opened a game on
-- two different days (reported by its own browser). The browser is trusted here:
-- a forged day count only ever inflates its own inviter's cosmetic medal.
--
-- Codes live in their own table so they are never part of a public profile read.
-- Apply by hand in the SQL editor, like the other migrations here.

begin;

create table if not exists public.invite_codes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now(),
  constraint invite_codes_format check (code ~ '^[0-9]{3,4}$')
);
alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from anon, authenticated;

-- One row per credited account. The primary key is the anti-farming rule: an
-- account can be attributed once, ever, and the first inviter keeps the credit.
create table if not exists public.recruits (
  invitee uuid primary key references public.profiles(id) on delete cascade,
  inviter uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now(),
  credited_at timestamptz,
  days_reported integer not null default 0,
  constraint recruits_not_self check (invitee <> inviter),
  constraint recruits_days check (days_reported between 0 and 3650)
);
alter table public.recruits enable row level security;
revoke all on public.recruits from anon, authenticated;
create index if not exists recruits_inviter_idx on public.recruits (inviter, credited_at);

-- 000-999, then 1000-9999 only once every three-digit code is spoken for.
create or replace function public.next_invite_code()
returns text
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  candidate text;
  width integer;
begin
  for width in 3..4 loop
    select lpad(g.slot::text, width, '0') into candidate
    from generate_series(0, (power(10, width)::integer) - 1) as g(slot)
    where not exists (select 1 from public.invite_codes c where c.code = lpad(g.slot::text, width, '0'))
    order by g.slot
    limit 1;
    if candidate is not null then return candidate; end if;
  end loop;
  raise exception 'no invite code left';
end
$function$;
revoke all on function public.next_invite_code() from public, anon, authenticated;

-- Existing accounts get a code too, so nobody is left without one to share.
do $backfill$
declare
  person record;
begin
  for person in select p.id from public.profiles p
    left join public.invite_codes c on c.user_id = p.id
    where c.user_id is null
  loop
    insert into public.invite_codes (user_id, code)
    values (person.id, public.next_invite_code());
  end loop;
end
$backfill$;

-- Display names are the only identity the hub has, so the code is minted right
-- beside the name that creates the profile.
create or replace function public.set_handle(p_handle text)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  uid uuid := auth.uid();
  clean text := coalesce(p_handle, '');
begin
  if uid is null then
    raise exception 'sign in to choose a name';
  end if;
  if clean ~ '[[:cntrl:][:space:]]' or clean ~ '["''<>/]' then
    raise exception 'names use 1 to 16 characters, no spaces';
  end if;
  if char_length(clean) not between 1 and 16 then
    raise exception 'names use 1 to 16 characters, no spaces';
  end if;
  if char_length(clean) < 3 and clean ~ '^[A-Za-z0-9_-]+$' then
    raise exception 'names use 1 to 16 characters, no spaces';
  end if;
  insert into public.profiles (id, handle)
  values (uid, clean)
  on conflict (id) do update set handle = excluded.handle;
  insert into public.invite_codes (user_id, code)
  values (uid, public.next_invite_code())
  on conflict (user_id) do nothing;
  return clean;
exception
  when unique_violation then raise exception 'that name is taken';
end;
$function$;

-- What the signed-in account can see about its own invites: the code it hands
-- out, how many people it brought in, and how far its own inviter credit has
-- got. Never anyone else's code and never who the invitees are.
create or replace function public.my_invite()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := (select auth.uid());
  mine text;
  born timestamptz;
begin
  if uid is null then return null; end if;
  select code into mine from public.invite_codes where user_id = uid;
  select created_at into born from auth.users where id = uid;
  return jsonb_build_object(
    'code', mine,
    'credited', (select count(*) from public.recruits where inviter = uid and credited_at is not null),
    'pending', coalesce((
      select jsonb_agg(jsonb_build_object('days', days_reported) order by created_at)
      from public.recruits where inviter = uid and credited_at is null
    ), '[]'::jsonb),
    'window_open', born is not null and born >= now() - interval '3 days',
    'window_closes', born + interval '3 days',
    'credited_to', (
      select p.handle from public.recruits r join public.profiles p on p.id = r.inviter
      where r.invitee = uid
    ),
    'days_played', coalesce((select days_reported from public.recruits where invitee = uid), 0)
  );
end
$function$;
revoke all on function public.my_invite() from public, anon;
grant execute on function public.my_invite() to authenticated;

-- One idempotent call: attach a code while the window is open, and move the
-- pending credit along with the browser's day count. A second code never
-- replaces the first credit.
create or replace function public.sync_invite(p_code text default null, p_days integer default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := (select auth.uid());
  wanted text := nullif(btrim(coalesce(p_code, '')), '');
  days integer := least(greatest(coalesce(p_days, 0), 0), 3650);
  inviter uuid;
  born timestamptz;
  already uuid;
begin
  if uid is null then raise exception 'Sign in to use an invite code'; end if;
  if wanted is not null and wanted !~ '^[0-9]{3,4}$' then
    raise exception 'Invite codes are 3 or 4 digits';
  end if;

  select created_at into born from auth.users where id = uid;
  select invitee into already from public.recruits where invitee = uid;

  if wanted is not null and already is null then
    select c.user_id into inviter from public.invite_codes c where c.code = wanted;
    if inviter is null then raise exception 'That invite code does not exist'; end if;
    if inviter = uid then raise exception 'That is your own invite code'; end if;
    if born is null or born < now() - interval '3 days' then
      raise exception 'The 3-day window for adding an invite code has closed';
    end if;
    insert into public.recruits (invitee, inviter, code)
    values (uid, inviter, wanted)
    on conflict (invitee) do nothing;
  end if;

  update public.recruits
     set days_reported = greatest(days_reported, days),
         credited_at = case
           when credited_at is null and greatest(days_reported, days) >= 2 then now()
           else credited_at
         end
   where invitee = uid;

  return public.my_invite();
end
$function$;
revoke all on function public.sync_invite(text, integer) from public, anon;
grant execute on function public.sync_invite(text, integer) to authenticated;

-- The board decoration: handle, credited count and tier, credited recruits
-- only. No codes and no invitee identities are exposed here.
create or replace view public.recruiter_board
with (security_invoker = false) as
select
  p.handle,
  count(*)::integer as credited,
  case when count(*) >= 10 then 3 when count(*) >= 5 then 2 else 1 end as tier
from public.recruits r
join public.profiles p on p.id = r.inviter
where r.credited_at is not null
group by p.handle;

grant select on public.recruiter_board to anon, authenticated;

notify pgrst, 'reload schema';
commit;
