-- Engagement analytics added visitor_id after the original column-level
-- INSERT grant. Column grants do not automatically include new columns.
-- Bored Together integration tests load migrations into a minimal database
-- without analytics tables: leave those standalone fixtures untouched.
do $analytics$
begin
  if to_regclass('public.play_events') is not null then
    execute 'grant insert (visitor_id) on table public.play_events to anon, authenticated';
  end if;
end
$analytics$;
