# Bored Together

Bored Together is an optional part of the existing Bored account. It ships
as ordinary native ES modules in `src/`; no bundler, second login, redirect,
popup, link sharing or push notification is needed, including in Google Sites.

## Shipped games and behavior

Connect Four is playable from challenge to acceptance, individual turns,
completion, move replay and a rematch invitation. The existing Connect Four
catalog card links to Together; single-player/CPU/local play stays available.
Friends and random opponents use the same authoritative match lifecycle.

The dashboard includes turns, waiting matches, incoming/outgoing challenges,
friend requests/friends, restricted discovery, queue status, recent games,
head-to-head statistics, notifications, privacy settings and blocks. Homepage
and navigation badges count actionable turns, invitations and friend requests.
Existing single-player scores and leaderboards do not include multiplayer wins.

The **Games** view leads with pending turns, saved-board match cards and a
smaller invitations/quick-challenge sidebar. **People** holds search, requests
and friends; **History** holds records and completed matches; **Settings** holds
email visibility, blocks and membership controls. Tabs support arrow-key
navigation, and activity updates are collapsed by default. On phones the panels
stack, the account strip stays compact, and pending turns take priority over
starting another game. The enrollment disclosure stays before the Join action
in the mobile layout.

Mini Golf multiplayer is **deferred**, and is not presented as playable. Its
current nine fixed holes already satisfy identical-course fairness, but its
240 Hz physics, mutable browser state and completed-round stroke total are
client-owned. Accepting that total would let a client award itself wins. The
next implementation should extract versioned deterministic physics shared with
a backend replay validator, store each player's ordered shot inputs, and
reconstruct partial independent runs across devices. This is feasible, but is
additional rule/physics work; simply wrapping the score snapshot is insufficient.
No browser-submitted golf score is used for a multiplayer result.

## Database installation

The existing project is `djdpttltfmwkofdrvkem`. The additive SQL setup is
[`../scripts/bored-together.sql`](../scripts/bored-together.sql). Apply it once
through a Supabase migration or the authenticated SQL editor before publishing
the frontend. It creates its own private schema and a single exposed RPC:

```sql
select public.bt_rpc('dashboard', '{}'::jsonb);
```

The script is a **one-time migration**, not an idempotent reset script. Do not
rerun it over a populated deployment. Subsequent schema changes need new
forward-only migrations. It neither rewrites nor deletes existing accounts,
profiles, scores, player state, analytics or leaderboard objects.

No new API keys or Auth providers are required. Keep `bored_together` out of
Supabase's exposed schemas (the default exposed `public` is sufficient).
`public.bt_rpc` is SECURITY INVOKER; the authorized dispatcher lives in the
private schema with SECURITY DEFINER and an empty search path. Only the
`authenticated` role may execute the dispatcher. Anonymous Supabase identities
are rejected explicitly. Internal helpers have no client EXECUTE grants.

All eight private tables have RLS enabled, no client table grants and no client
policies. Clients cannot scan profiles, write matches, insert results, edit
moves or read notifications directly. The dispatcher derives identity from
`auth.uid()` and verifies the account still exists. Authorization never uses
editable user metadata. The existing public single-player `profiles` table
remains unchanged; Together does not grant it additional permissions.

When pg_cron is installed (as on this project), the migration schedules
`bored-together-retention` daily at **04:17 UTC**. Check it with:

```sql
select jobname, schedule, active from cron.job
where jobname = 'bored-together-retention';
```

On a backend without pg_cron, arrange a trusted daily call to
`bored_together.cleanup()`; clients cannot execute it. Never expose cleanup as
an unrestricted API. `NOTIFY pgrst` refreshes the RPC schema cache on installation.

## Consent, identity and retention

Existing users have no membership row until pressing **Join Bored Together**.
The backend requires consent version `2026-10-25-v1` and records its timestamp.
Members can find members by username prefix (minimum 3 literal characters,
maximum 10 results) or exact case-insensitive current Auth email. Searches have
no pagination/directory endpoint, require membership and omit blocked pairs.
They are limited to 20/minute and 200/UTC day per account. Mutating social
requests have a separate 30/hour limit, and RPCs have a 180/minute budget.
Account-based limits do not prevent abuse by somebody creating many accounts;
this version does not add IP-level rate limiting or CAPTCHA.

Email is read from Auth only inside a controlled projection, never copied into
multiplayer tables. The default visibility is hidden. Choosing **Show to
accepted friends only** permits disclosure in a friend profile/search result
only while both the membership and accepted relationship are valid. Pending
requests and random strangers cannot see email. Match responses always remove
email, including random matches between people who happen to be friends.

Leaving immediately disables discovery, exits queues, deletes friendships,
cancels pending invitations, deletes the departing player's notifications and
forfeits active matches. Minimal consent/membership records and block lists
remain, so rejoining is explicit and existing blocks continue to protect the
player. Rejoining resets email visibility to hidden. There is no cached email
index to remove. Existing Bored identities and scores are untouched.

Blocking is bilateral for discovery, invitations, friend requests and queue
eligibility. It removes the friendship and cancels outstanding/active matches
between the pair without awarding either player a win. Unblocking does not
restore friendship or reactivate a match.

Queues/invitations expire after 7 days; active matches after 30 inactive days,
with no clock-based winner. Pending friend requests expire after 30 days.
Notifications are retained for 30 days. Terminal matches and their moves are
retained for 90 days; statistics are calculated from that retained history,
not lifetime totals. Cleanup runs daily, so deletion/expiry can lag its nominal
cutoff by up to a day. The dashboard shows all open matches and the most recent
50 terminal matches. Historical opponent usernames remain available to the
other participant while the match is retained.

## Authoritative engine and extending it

`members`, `friendships`, `blocks`, `queue`, `matches`, `moves`, `notifications`
and `limits` belong to the private schema. Foreign keys, a canonical unique
friend pair, unique open game/pair, unique rematch reference and unique
match/request IDs enforce invariants independently of the UI.

Every RPC runs in one transaction. A short transaction-level advisory lock
serializes social, queue, block and leave changes. Move/accept/resign reads also
lock the match row. The current school-sized implementation uses one shared
lock, including for dashboard/search reads; this favors simple correct ordering
over maximum throughput. At much larger scale, replace it with carefully
ordered per-pair/per-queue locks and repeat the concurrent-transaction tests.

Moves carry `{match_id, version, request_id, move}`. The current client sends
`column` as a compatibility shorthand for `move: {column}`. The backend checks
participation, active status, turn, expected version and rule version. It applies
its own transition, records the move and derives turn/result. Duplicate request
IDs return current state without applying twice; reusing an ID for a different
move or actor fails. Terminal transitions also bump the state version, so
versions are monotonic rather than a move counter. Clients cannot provide board
state, a winner, authoritative score or another user's identity.

To add a game:

1. Reuse its existing catalog slug; add metadata to `TOGETHER_GAMES`.
2. Extend supported-game constraints and `initial_state(game, rules_version)`.
3. Add a branch to `apply_move(game, rules_version, state, payload, seat)` with
   strict payload validation. Return `{state, won, draw}` for alternating turns.
   Independent-run games need a rule adapter that records each player's state
   and derives readiness/comparison from both runs rather than alternating turns.
4. Render its authoritative state in the hub (or adapt the existing game via a
   narrow hub-owned bridge). Keep credentials and networking out of game iframes.
5. Reuse challenge, acceptance, queue, result, resign, rematch and notification
   operations. Never let a renderer write result fields directly.
6. Test rules, invalid moves, duplicate/stale requests, privacy, restoration and
   real concurrent transactions. Keep old rule adapters available for open matches
   after introducing a new rule version.

`connect_four` uses the same board dimensions, gravity and four-in-a-row rules
as the original local game. Its small dashboard renderer is separate from the
CPU game loop; the entire offline game was not duplicated.

## Fetching, persistence and notifications

The hub uses the existing `backend.js` session and token refresh handling.
`together-api.js` binds each response to the identity that started the request,
so a delayed response cannot populate another person's session. UI state is
cleared synchronously on account changes. No opponent email is persisted locally.

Durable matches and notifications live in PostgreSQL. Visible documents poll
every 15 seconds, with refresh on focus, reconnection and visibility return.
Realtime is not required/configured: normal fetching is the reliable path and
avoids a second auth/socket stack in this REST-only app. Browser closure does
not lose a match or cancel queue membership. The selected match and retry ID
are stored through the existing storage-safe helpers; blocked browser storage
still allows resume through the dashboard. Failed moves do not update the board
optimistically or silently submit after reconnection. Press Refresh to recover.

This does not provide offline multiplayer moves, push notifications, external
email delivery, a realtime socket, or an account deletion UI. Those are distinct
from durable asynchronous play.

## Verification and release

```sh
npm ci
npm run games:check
CHROME_PATH=/path/to/chrome npm test
CHROME_PATH=/path/to/chrome npm run test:together
```

The SQL suite uses PGlite (PostgreSQL WASM) with isolated Auth fixtures, exercising
the exact setup SQL. It covers consent/nonmembership, email/prefix discovery,
rate limits, direct table/helper denial, friend state, blocks, invitations,
queue selection, legal/illegal/stale/duplicate moves, full games, rematches,
forfeits, expiry, retention and notification ownership. A seeded independent
rules model checks 100 games, including full-board draws and full columns.

The browser suite uses two isolated account contexts connected to that same SQL
API: enrollment, exact-email friend discovery, acceptance, challenge, a complete
match, page reload midgame, replay, rematch, queue persistence/cancellation,
offline refresh, sign-out privacy, and desktop/phone layouts. External auth and
transport are simulated; the rules and stored state are the production SQL.
No tests create accounts or demo games in production.

PGlite serializes connections and cannot establish native lock behavior. The
additional `together-postgres` CI job provisions disposable **PostgreSQL 17** and
runs `tests/together-postgres.test.cjs` on independent connections. It tests
competing moves, duplicate queue entries, crossed requests and leaving while
other operations are in flight. For a local equivalent, set
`BT_TEST_DATABASE_URL` to a completely EMPTY disposable database; the suite
refuses an occupied database. Never set it to production.

Publishing remains automatic on every push to `main`; the deploy workflow is
unchanged and serves `src/` directly. CI is separate. After publishing, compare
`version.json` to the shipped commit and check that the actual page boots.
Live backend validation should check RPC/table grants, RLS, the cron job, the
schema cache and advisors; a live unauthenticated call must fail. Real student
accounts have not been used to manufacture test matches.

### Initial deployment verification (2026-10-25)

The migration was applied to the existing project. Catalog inspection confirmed
RLS on all eight new tables, no authenticated direct table read/write grants,
an invoker public wrapper callable only by authenticated accounts, and the
active daily cleanup job. A live nonmember account saw only `{enrolled:false}`
in a rolled-back check; an unauthenticated REST call returned HTTP 401. No
production test memberships or matches were created. Supabase advisors reported
no new warning-level findings. The eight informational
[RLS-without-policy notices](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)
are intentional: these private tables have no direct client access, and all
access goes through the checked RPC.

The complete local suite passed 74 tests. The draft-release CI also passed both
the ordinary suite and the independent-connection PostgreSQL 17 race test.
Live student-to-student play has not been manufactured or observed as part of
release verification; the complete match test uses isolated simulated accounts.
