-- Each index behind an append-only table costs a full 8 KB page image in the
-- write-ahead log for every insert whose page has not already been written since
-- the last checkpoint. Telemetry rows carry random UUIDs (id, session_id,
-- user_id, visitor_id), so their index inserts land on scattered leaf pages and
-- every one of those pages is charged again after each checkpoint.
--
-- Measured on this database, 40 single-row inserts of the same shape as
-- play_events cost 238,224 bytes of WAL into a table with five indexes and
-- 75,408 bytes into a table with two: 68% of the write volume was index
-- maintenance. These three indexes are the ones no deployed query uses:
--
--   play_events_session_idx     nothing filters by session_id alone; the
--                               dashboard and the analytics views filter by
--                               received_at and group by session_id.
--   play_events_user_time_idx   per-player filtering happens in the browser,
--                               and the rollup functions range on received_at.
--   product_events_visitor_idx  every reader ranges on received_at first; the
--                               visitor join is applied to the rows already
--                               selected.
--
-- What is left on these tables is the primary key and one time-ordered index per
-- table, which is what every read actually uses. Query results are unchanged;
-- an admin-only report may fall back to a sequential scan of a table that is
-- already in shared_buffers.

drop index if exists public.play_events_session_idx;
drop index if exists public.play_events_user_time_idx;
drop index if exists public.product_events_visitor_idx;
