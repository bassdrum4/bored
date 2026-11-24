-- The project's disk I/O budget is spent mostly on writes, and a write costs
-- far more than its row. Every statement that touches a page leaves a full 8 KB
-- copy of that page in the write-ahead log after each checkpoint, so a table
-- that appends a new tuple to the end of a full page for every update buys a
-- new page (and a new page image) each time.
--
-- Nothing here changes a query, a policy or a row. It only tells Postgres how
-- to lay these tables out and when to vacuum them:
--
--   fillfactor          leave free space on each page so an update can rewrite
--                       the tuple in place (a HOT update) instead of moving it
--                       to a new page and rewriting every index entry.
--   autovacuum_*        keep those pages reused on a small, hot table where the
--                       default 20%-of-a-large-number trigger never fires.
--   compression lz4     a save or player snapshot is base64/JSON text; lz4
--                       stores the same bytes in noticeably less space and less
--                       write-ahead log per update.
--
-- krillion_books was also analyzed for the first time here. It is not empty: it
-- holds a row a day of prompt text, about 2 MB each after TOAST. Compression for
-- that column is a separate decision, because the board reads it whole.

begin;

-- Player state is one small row per account, rewritten whole on every save.
alter table public.player_state set (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 20,
  autovacuum_analyze_scale_factor = 0.02
);
alter table public.player_state alter column data set compression lz4;

-- Cloud saves (Civ Lite, Poké Idle): a handful of rows, each with a big TOAST.
alter table public.game_saves set (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold = 20
);
alter table public.game_saves alter column data set compression lz4;

-- A better score rewrites the row and one index entry; room on the page keeps
-- the rewrite local.
alter table public.scores set (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 20
);

-- Live rooms: seats and games are updated continuously while a match runs.
alter table bored_live.presence set (
  fillfactor = 70,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 20
);
alter table bored_live.games set (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 20
);

-- Bored Together's per-match counters and the public buddy board.
alter table bored_together.limits set (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 50
);
alter table public.poke_gacha_buddies set (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_vacuum_threshold = 20
);

-- The telemetry tables are append-only and had never been analyzed, so the
-- planner was working from a stale row estimate. Analyze now; autovacuum and
-- its own analyze threshold maintain them from here.
analyze public.play_events;
analyze public.product_events;
analyze public.krillion_books;

commit;
