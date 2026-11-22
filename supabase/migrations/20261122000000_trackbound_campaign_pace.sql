-- Trackbound career pace: verified against the 15 canonical campaign track layouts.
-- The existing career-point board remains untouched; only equal points are tiebroken.
create table if not exists public.trackbound_campaign_tracks (
  id text primary key,
  name text not null,
  author_ms integer not null check (author_ms > 0),
  ordinal smallint not null unique check (ordinal between 1 and 15),
  layout text not null
);

insert into public.trackbound_campaign_tracks (id, name, author_ms, ordinal, layout)
values
  ('paddock', 'Paddock', 12198, 1, 'start|sprint|curveR|straight|curveR|straight|checkpoint|curveL|sprint|curveL|straight|curveR|checkpoint|curveL|sprint|straight|finish'),
  ('slipstream', 'Slipstream', 11518, 2, 'start|sprint|sprint|boost|curveL|sprint|straight|checkpoint|curveR|sprint|curveR|boost|straight|checkpoint|curveL|sprint|straight|finish'),
  ('switchback', 'Switchback', 14025, 3, 'start|straight|curveL|straight|hairpinR|straight|checkpoint|curveR|sprint|wallL|hairpinR|straight|curveL|checkpoint|straight|curveR|sprint|finish'),
  ('overpass', 'Overpass', 13728, 4, 'start|sprint|up|straight|curveR|straight|down|checkpoint|straight|curveL|up|sprint|curveR|down|checkpoint|straight|curveL|sprint|finish'),
  ('vertigo', 'Vertigo', 12665, 5, 'start|sprint|boost|straight|wallR|straight|checkpoint|curveR|sprint|boost|straight|wallR|straight|curveL|checkpoint|wallL|sprint|curveL|straight|finish'),
  ('dustbowl', 'Dust Bowl', 9138, 6, 'start|straight|dirt|straight|curveR|narrow|checkpoint|straight|curveL|dirt|narrow|checkpoint|curveL|dirt|straight|finish'),
  ('kicker', 'Kicker', 17596, 7, 'start|sprint|kicker|curveR|sprint|down|checkpoint|straight|curveL|sprint|kicker2|boost|straight|checkpoint|curveL|sprint|straight|finish'),
  ('grandloop', 'Grand Loop', 16065, 8, 'start|sprint|straight|curveR|up|straight|down|checkpoint|curveL|sprint|boost|straight|wallL|straight|wallL|straight|checkpoint|curveR|dirt|straight|curveL|sprint|curveR|straight|finish'),
  ('serpentine', 'Serpentine', 21753, 9, 'start|sprint|curveR|tunnel|curveL|hairpinR|straight|checkpoint|sprint|boost|wallL|straight|curveL|curveR|whoops|hairpinL|checkpoint|sprint|curveR|straight|curveL|narrow|curveR|checkpoint|sprint|boost|straight|finish'),
  ('highline', 'Highline', 22032, 10, 'start|sprint|up|curveL|up|whoops|down|boost|straight|checkpoint|straight|curveR|boost|up|sprint|straight|curveL|straight|checkpoint|curveR|boost|straight|tunnel|down|curveL|sprint|finish'),
  ('foundry', 'Foundry', 17028, 11, 'start|tunnel|boost|narrow|curveR|straight|narrow|checkpoint|ice|boost|hairpinL|straight|curveR|narrow|boost|checkpoint|curveL|straight|curveR|sprint|boost|narrow|checkpoint|tunnel|curveL|sprint|finish'),
  ('horizon', 'Horizon', 18488, 12, 'start|sprint|straight|curveR|ice|curveL|checkpoint|boost|straight|curveR|up|tunnel|straight|curveL|checkpoint|straight|straight|curveL|sprint|wallR|straight|checkpoint|curveR|hairpinL|straight|curveR|boost|sprint|checkpoint|straight|curveL|finish'),
  ('longway', 'The Long Way', 26224, 13, 'start|sprint|straight|curveR|sprint|curveL|checkpoint|tunnel|straight|curveR|hairpinL|sprint|checkpoint|boost|straight|curveL|up|straight|down|curveR|checkpoint|wallL|straight|wallR|curveL|checkpoint|ice|straight|boost|loop|straight|curveR|sprint|finish'),
  ('coldstore', 'Cold Store', 17000, 14, 'start|sprint|curveL|ice|straight|sprint|curveR|checkpoint|sprint|boost|ice|curveL|straight|sprint|curveR|checkpoint|ice|straight|finish'),
  ('downdraft', 'Downdraft', 11900, 15, 'start|sprint|down|curveR|boost|loop|checkpoint|straight|down|wallR|curveL|checkpoint|kicker|straight|sprint|finish')
on conflict (id) do update set
  name = excluded.name, author_ms = excluded.author_ms,
  ordinal = excluded.ordinal, layout = excluded.layout;

create table if not exists public.trackbound_campaign_bests (
  user_id uuid not null references auth.users(id) on delete cascade,
  track_id text not null references public.trackbound_campaign_tracks(id),
  ms integer not null check (ms between 1000 and 1200000),
  layout text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, track_id)
);

alter table public.trackbound_campaign_tracks enable row level security;
alter table public.trackbound_campaign_bests enable row level security;
revoke all on public.trackbound_campaign_tracks from anon, authenticated;
revoke all on public.trackbound_campaign_bests from anon, authenticated;

-- Raw per-user times cannot be read or written directly from the client.
-- Only the submitting authenticated user can replace their own best.
create or replace function public.submit_trackbound_campaign(p_records jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_entry jsonb;
  v_track public.trackbound_campaign_tracks%rowtype;
  v_ms integer;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'Sign in to submit campaign times' using errcode = '28000';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array'
     or jsonb_array_length(p_records) < 1 or jsonb_array_length(p_records) > 15 then
    raise exception 'Invalid campaign records';
  end if;
  for v_entry in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(v_entry) <> 'object'
       or (v_entry->>'ms') !~ '^[0-9]{1,7}$' then
      raise exception 'Invalid campaign time';
    end if;
    select * into v_track from public.trackbound_campaign_tracks
      where id = v_entry->>'track';
    if not found or v_entry->>'layout' is distinct from v_track.layout then
      raise exception 'Outdated or unknown campaign layout';
    end if;
    v_ms := (v_entry->>'ms')::integer;
    -- A broad physical sanity bound, not an anti-cheat claim.
    if v_ms < greatest(1000, v_track.author_ms / 10) or v_ms > 1200000 then
      raise exception 'Campaign time outside allowed range';
    end if;
    insert into public.trackbound_campaign_bests as old
      (user_id, track_id, ms, layout)
      values (v_user, v_track.id, v_ms, v_track.layout)
    on conflict (user_id, track_id) do update set
      ms = case when old.layout = excluded.layout then least(old.ms, excluded.ms) else excluded.ms end,
      layout = excluded.layout,
      updated_at = now()
    where old.layout is distinct from excluded.layout or excluded.ms < old.ms;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.submit_trackbound_campaign(jsonb) from public;
grant execute on function public.submit_trackbound_campaign(jsonb) to authenticated;

-- A public leaderboard returns player handles and their recorded runs only.
-- Career Pace = mean(best_ms / author_ms) * 10,000; lower is faster.
-- Partial records never produce a pace and cannot break a career-points tie.
create or replace function public.trackbound_campaign_board()
returns table(handle text, pace_bp integer, records jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with runs as (
    select b.user_id,
      count(*)::integer as n,
      round(avg(b.ms::numeric / t.author_ms::numeric) * 10000)::integer as pace,
      jsonb_agg(jsonb_build_object('track', t.id, 'name', t.name, 'ms', b.ms, 'author_ms', t.author_ms)
        order by t.ordinal) as track_records
    from public.trackbound_campaign_bests b
    join public.trackbound_campaign_tracks t
      on t.id = b.track_id and t.layout = b.layout
    group by b.user_id
  )
  select p.handle,
    case when r.n = (select count(*) from public.trackbound_campaign_tracks)
      then r.pace else null end,
    r.track_records
  from runs r join public.profiles p on p.id = r.user_id
  order by p.handle;
$$;
revoke all on function public.trackbound_campaign_board() from public;
grant execute on function public.trackbound_campaign_board() to anon, authenticated;
