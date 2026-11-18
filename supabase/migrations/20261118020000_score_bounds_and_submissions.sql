-- Give every board the bounds its own rules imply, and keep a ledger of what was
-- submitted. Until now `scores` held only the current best, so each improvement
-- overwrote the evidence, and `submit_score` accepted anything from 1 to a very
-- loose ceiling: a one-second solitaire or a one-shot circuit was a valid post.

begin;

-- Floors live beside the ceiling. 1 for games where any positive value is
-- meaningful, higher where the game itself makes the small ones impossible.
alter table public.score_rules
  add column if not exists min_value integer not null default 1;

alter table public.score_rules drop constraint if exists score_rules_bounds_check;
alter table public.score_rules
  add constraint score_rules_bounds_check check (min_value >= 1 and min_value <= max_value);

-- Nine holes take at least nine strokes, eight memory pairs take at least eight
-- moves, a solved Wordle is at most six rows, and every timed board has a floor
-- below which a human hand cannot go.
update public.score_rules set min_value = v.min_value
from (values
  ('circuit', 15),
  ('downhill-mayhem', 15),
  ('mahjong', 60),
  ('memory', 8),
  ('minesweeper', 2),
  ('minigolf', 9),
  ('photo-puzzle', 8),
  ('quickdraw', 10),
  ('risk', 3),
  ('solitaire', 20),
  ('typing-test', 5)
) as v(game, min_value)
where public.score_rules.game = v.game;

-- A 4x4 2048 board tops out near 3.93M, so ten million was never reachable.
update public.score_rules set max_value = 4000000 where game = '2048';
-- Six rows, and a solve beyond the sixth is a loss rather than a guess count.
update public.score_rules set max_value = 6 where game = 'wordle';

-- Every accepted submission, so a later investigation can see the shape of the
-- run instead of only its final number. No client role may read or write it;
-- submit_score is security definer.
create table if not exists public.score_submissions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null references public.score_rules(game),
  value integer not null check (value > 0),
  received_at timestamptz not null default now()
);
alter table public.score_submissions enable row level security;
revoke all on public.score_submissions from anon, authenticated;
grant select on public.score_submissions to service_role;
create index if not exists score_submissions_user_game_idx
  on public.score_submissions (user_id, game, received_at desc);

create or replace function public.submit_score(p_game text, p_value integer)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := (select auth.uid());
  rule record;
  stored integer;
begin
  if uid is null or not exists (select 1 from public.profiles where id=uid) then
    raise exception 'choose a display name before posting scores';
  end if;
  select better,min_value,max_value into rule from public.score_rules where game=p_game;
  if not found then raise exception 'unknown game'; end if;
  if p_value is null or p_value < rule.min_value or p_value > rule.max_value then
    raise exception 'score out of range';
  end if;

  insert into public.score_submissions (user_id,game,value)
  values (uid,p_game,p_value);

  insert into public.scores as s (user_id,game,value,score,updated_at)
  values(uid,p_game,p_value,p_value::double precision,now())
  on conflict (user_id,game) do update
    set value=case when rule.better='high' then greatest(s.value,excluded.value)
                   else least(s.value,excluded.value) end,
        score=(case when rule.better='high' then greatest(s.value,excluded.value)
                    else least(s.value,excluded.value) end)::double precision,
        updated_at=now()
  returning value into stored;
  return stored;
end;
$function$;

commit;
