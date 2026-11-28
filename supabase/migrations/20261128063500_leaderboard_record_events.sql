-- The isolated multiplayer test schema intentionally has no score tables.
do $record_migration$
begin
if to_regclass('public.scores') is null or to_regclass('public.score_rules') is null then return; end if;
-- At most one short-lived event per board; only the backend can read it.
create table if not exists public.leaderboard_record_events (
 game text primary key references public.score_rules(game) on delete cascade,
 id uuid not null unique default gen_random_uuid(),
 handle text not null,
 value integer not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.leaderboard_record_events enable row level security;
revoke all on public.leaderboard_record_events from public, anon, authenticated;
grant select on public.leaderboard_record_events to service_role;

-- Serialize record comparisons for score submissions, including concurrent upserts.
create or replace function public.lock_leaderboard_record()
returns trigger language plpgsql set search_path='' as $$
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.game, 714329));
 return new;
end;
$$;
revoke execute on function public.lock_leaderboard_record() from public, anon, authenticated;
create or replace function public.publish_leaderboard_record()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 direction text; rival integer; player_handle text; event_id uuid;
begin
 if new.value is null or new.value <= 0 or new.game='trackbound-career-pace' then return new; end if;
 if tg_op='UPDATE' and old.value is not distinct from new.value then return new; end if;
 select better into direction from public.score_rules where game=new.game;
 if direction='low' then
   select value into rival from public.scores where game=new.game and user_id<>new.user_id and value>0 order by score asc limit 1;
   if rival is null or new.value>=rival then return new; end if;
   if tg_op='UPDATE' and old.value<rival then return new; end if;
 else
   select value into rival from public.scores where game=new.game and user_id<>new.user_id and value>0 order by score desc limit 1;
   if rival is null or new.value<=rival then return new; end if;
   if tg_op='UPDATE' and old.value>rival then return new; end if;
 end if;
 select handle into player_handle from public.profiles where id=new.user_id;
 if player_handle is null then return new; end if;
 insert into public.leaderboard_record_events(game,id,handle,value,created_at)
 values(new.game,gen_random_uuid(),player_handle,new.value,clock_timestamp())
 on conflict(game) do update set id=excluded.id,handle=excluded.handle,value=excluded.value,created_at=excluded.created_at
 returning id into event_id;
 begin
   perform net.http_post(url:='https://bored-presence-gfd9.onrender.com/leaderboard-record',
     body:=jsonb_build_object('id',event_id),timeout_milliseconds:=10000);
 exception when others then
   -- A transient notification outage must not prevent scoring.
   raise warning 'record notification could not be queued';
 end;
 return new;
end;
$$;
revoke execute on function public.publish_leaderboard_record() from public, anon, authenticated;
drop trigger if exists leaderboard_record_lock on public.scores;
create trigger leaderboard_record_lock before insert or update on public.scores for each row execute function public.lock_leaderboard_record();
drop trigger if exists leaderboard_record_publish on public.scores;
create trigger leaderboard_record_publish after insert or update on public.scores for each row execute function public.publish_leaderboard_record();


end;
$record_migration$;
