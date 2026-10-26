-- The engagement analytics migration added visitor_id after the original
-- column-level INSERT grant. Column grants do not automatically include new
-- columns, so browser events containing visitor_id otherwise fail with 42501.
-- Existing insert-only RLS remains in place; no SELECT/UPDATE/DELETE is granted.
grant insert (visitor_id) on table public.play_events to anon, authenticated;
