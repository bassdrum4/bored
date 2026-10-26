
-- Existing play_events remains authoritative for per-game sessions.
alter table public.play_events add column if not exists visitor_id uuid;
alter table public.play_events drop constraint if exists play_events_kind_check;
alter table public.play_events add constraint play_events_kind_check
  check (kind = any(array['start','checkpoint','interaction','end','daily_complete','error']));
create index if not exists play_events_visitor_day_idx on public.play_events(visitor_id, received_at desc) where visitor_id is not null;

-- Visit and Bored Together UI events are not gameplay sessions.
create table if not exists public.product_events (
  id uuid primary key,
  received_at timestamptz not null default now(),
  visitor_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null check(kind in ('visit','bt_view','bt_enroll','bt_challenge','bt_random','bt_open','bt_move','bt_complete','bt_rematch','bt_delete','bt_leave')),
  game text check(game is null or game ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object' and octet_length(details::text)<=512)
);
create index if not exists product_events_day_idx on public.product_events(received_at desc);
create index if not exists product_events_visitor_idx on public.product_events(visitor_id,received_at desc) where visitor_id is not null;
alter table public.product_events enable row level security;
revoke all on public.product_events from anon, authenticated;
grant insert on public.product_events to anon, authenticated;
grant select on public.product_events to authenticated;
drop policy if exists product_events_append on public.product_events;
create policy product_events_append on public.product_events for insert to anon,authenticated
  with check (user_id is not distinct from (select auth.uid()));
drop policy if exists product_events_admin_read on public.product_events;
create policy product_events_admin_read on public.product_events for select to authenticated
  using ((select public.is_analytics_admin()));

-- The optional survey is separate from general bug-report feedback.
create table if not exists public.enjoyment_feedback (
  id uuid primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  visitor_id uuid,
  game text check(game is null or game ~ '^[a-z0-9][a-z0-9-]{0,49}$'),
  rating smallint not null check(rating between 1 and 5),
  comment text check(comment is null or length(comment)<=500)
);
create index if not exists enjoyment_feedback_created_idx on public.enjoyment_feedback(created_at desc);
alter table public.enjoyment_feedback enable row level security;
revoke all on public.enjoyment_feedback from anon, authenticated;
grant insert on public.enjoyment_feedback to anon, authenticated;
grant select on public.enjoyment_feedback to authenticated;
drop policy if exists enjoyment_feedback_append on public.enjoyment_feedback;
create policy enjoyment_feedback_append on public.enjoyment_feedback for insert to anon,authenticated
  with check(user_id is not distinct from (select auth.uid()));
drop policy if exists enjoyment_feedback_admin_read on public.enjoyment_feedback;
create policy enjoyment_feedback_admin_read on public.enjoyment_feedback for select to authenticated
  using((select public.is_analytics_admin()));

-- Authenticated staff-only aggregate. Never grants direct access to private match tables.
create or replace function public.analytics_together_summary(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = '' as $body$
declare report jsonb;
begin
 if (select auth.uid()) is null or not exists(select 1 from public.analytics_admins a where a.user_id=(select auth.uid())) then
   raise exception 'Analytics admin access required' using errcode='42501';
 end if;
 if p_from is null or p_to is null or p_from>=p_to or p_to-p_from>interval '90 days' then
   raise exception 'Invalid reporting range' using errcode='22023';
 end if;
 with matches as (
   select m.*, not exists (select 1 from public.analytics_admins a where a.user_id in (m.p1,m.p2)) as organic
   from bored_together.matches m where m.created_at>=p_from and m.created_at<p_to
 ), activity as (
   select m.id,m.game,m.status,m.organic,
     (select count(distinct v.actor) from bored_together.moves v where v.match_id=m.id) as actors,
     (select count(*) from bored_together.moves v where v.match_id=m.id) as moves
   from matches m
 ), delays as (
   select v.match_id, v.actor, v.created_at,
     lag(v.actor) over(partition by v.match_id order by v.version) as previous_actor,
     lag(v.created_at) over(partition by v.match_id order by v.version) as previous_at
   from bored_together.moves v join matches m on m.id=v.match_id and m.organic
 )
 select jsonb_build_object(
   'all_matches',(select count(*) from activity),
   'organic_matches',(select count(*) from activity where organic),
   'organic_completed',(select count(*) from activity where organic and status='completed'),
   'organic_both_played',(select count(*) from activity where organic and actors=2),
   'all_completed',(select count(*) from activity where status='completed'),
   'organic_moves',(select coalesce(sum(moves),0) from activity where organic),
   'all_moves',(select coalesce(sum(moves),0) from activity),
   'organic_turn_delay_minutes',(select round((avg(extract(epoch from created_at-previous_at))/60)::numeric,1) from delays where previous_at is not null and actor is distinct from previous_actor),
   'by_game',(select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from
     (select game,count(*) as matches, count(*) filter(where status='completed') as completed,
       count(*) filter(where actors=2) as both_played from activity where organic group by game order by count(*) desc) t)
 ) into report;
 return report;
end $body$;
revoke all on function public.analytics_together_summary(timestamptz,timestamptz) from public, anon;
grant execute on function public.analytics_together_summary(timestamptz,timestamptz) to authenticated;
