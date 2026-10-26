# Bored Together

Bored Together finds opponents and manages saved turns. The original games handle
playing. It uses the existing Bored account, hub, native ES modules and player;
there is no second arcade, login, popup or link-sharing requirement.

## One screen

After explicit enrollment, the screen has **Challenge Someone**, **Play Random**
and **Your Games**. Starting a challenge means choosing a game, then searching
for an opted-in username (literal prefix, minimum three characters) or an exact
account email. Random play means choosing a game and joining its saved queue.

The list contains every active match and incoming/outgoing challenge, with turns
and incoming challenges first. Accept/Decline are inline. The latest three
completed matches remain at the bottom with a result and Rematch action; there
is no history browser, records dashboard or replay. Small More menus hold Block,
Unblock and Leave. Leaving explicitly warns that active games are forfeited.

Friend requests/management, People/History/Settings tabs, statistics, feeds,
notification history/read controls, replay sliders and email visibility controls
have been removed from the frontend. Existing private tables, retention,
authorization and legacy RPC operations are retained for compatibility. Old
friendships do not grant email access. Badges count only turns and incoming
challenges, never friendships or notification history.

## Original-game integration

`src/hub/together-ui.js` owns enrollment, search, invitations, queues and the list.
`src/hub/together-player.js` defines the small original-game adapter contract.
`main.js` launches matches through the same `openGame`, original document loader,
full-viewport `#player` and `#frame` used by ordinary games. The hub remains behind
the player and is inert while playing. Multiplayer runs never post single-player
high scores or count toward daily challenges. Restart is hidden for online games;
Escape or **Bored Together** in the normal player menu exits without forfeiting.

Before the original game script runs, a bridge supplies:

```js
window.__boredTogether = {
  context: { state, status, seat, canPlay, players },
  submit(move),        // Promise of the next authoritative context
  finishTurn(),       // request a return after animation/input has settled
  error(error, retry), // recoverable Retry save / Reload saved game controls
  engineURL           // canonical shared Pool physics, for visual prediction only
};
```

The hub validates source window, unique launch channel and current account on
messages. It attaches match ID, expected version and an idempotent request ID.
No credentials or networking are passed into the iframe. The SQL/Edge validator
alone decides state, turn ownership and result. `finishTurn()` only closes the
player after a confirmed save whose authoritative response says the turn ended
or match completed. A legal Pool pot can retain the turn for several shots.

Connect Four's adapter is inside its existing `arcade.js` implementation. It
uses the original board, column buttons and keyboard input; CPU/local play still
uses its original loop. Pool's adapter is inside `content/8ball.html` and uses the
original canvas, aiming guide, cue placement, power rail, keyboard controls,
rendering and sound. The old Together-specific mini-game renderers were removed.
Pool's existing shared `pool-engine.js`, validating Edge function, shot commit
RPC, rules, migrations and tests are preserved.

Pool v1 continues to use the previously shipped zero-spin house rules, with no
called pockets or rail-after-contact requirement. Its original spin control is
labeled **NO SPIN** and disabled for online play. An 8 on the break re-racks;
an early/fouled 8 loses. Prediction uses the same canonical engine as validation
and is drawn by the original game; it never supplies a result to the backend.
Timer-based animation settles even if an embed stops receiving animation frames.

If saving fails, the game stays open with an error and recovery controls. Retry
uses the same request ID, including when the server saved but its response was
lost. The board is restored from confirmed state, not a guessed winner or score.
Reload fetches fresh authoritative state to recover stale versions. Exiting
while a save is in flight does not cancel the server transaction; reopening
always loads the saved state. There are no offline multiplayer moves.

Only Connect Four and Pool have ready original-game adapters and authoritative
rules. The selector intersects the catalog with the adapter registry. Mini Golf
multiplayer remains deferred: its browser-reported stroke total is not trusted.
A new game must implement the contract in its original game, add a versioned
server validator, and pass the same lifecycle and two-account tests before
being added to `TOGETHER_ADAPTERS`.

## Privacy, persistence and security

Enrollment is optional; existing accounts are not automatically discoverable.
Exact-email search is case-insensitive and requires active membership. It
returns only the matching user ID and username, never the address. Username
search also never returns email, including for legacy accepted friends. Email
is read from Auth for exact comparison, never copied into multiplayer tables or
indexed in a public directory. Partial email, wildcard and directory scans are
unsupported. Blocked pairs and nonmembers are excluded from discovery.

The forward `together_private_discovery` migration narrows both profile
projections and exact-email results without deleting or changing saved games.
Existing memberships remain valid. The current enrollment consent version is
`2026-10-25-v2`; the frontend now explains the stricter private-email behavior.
Legacy visibility settings have no effect on email disclosure.

All eight `bored_together` tables have RLS and no direct browser table grants.
Keep this private schema outside the exposed Data API schemas. `public.bt_rpc`
is SECURITY INVOKER; the dispatcher is in the private schema, SECURITY DEFINER
with empty search path, and derives identity from `auth.uid()` after checking
that the non-anonymous Auth account exists. Internal helpers cannot be called
by browser roles. User-editable metadata never grants authorization.

Discovery is limited to 20/minute and 200/UTC day per account; social mutations
have a separate 30/hour limit and RPCs a 180/minute budget. These are per-account
limits, not IP-level protection against mass account creation. Existing shared
transaction advisory locks, match-row locks, participant checks, turn ownership,
rule versions, stale-version checks and unique request IDs are unchanged.

Connect Four moves contain only a column. Pool sends angle (integer tenths of a
degree), power (1–100) and optional legal cue placement. The `together-pool` Edge
function authenticates the player, reads the match through their JWT, simulates
with the canonical engine and invokes the service-only commit wrapper. The
commit transaction rechecks membership, blocks, participant, turn and version.
Ordinary browser roles cannot commit Pool state or choose a winner. The service
key stays in the Edge runtime, never the page or game document.

Durable match and queue state lives in PostgreSQL. Visible pages poll every
15 seconds and refresh on focus, visibility return and reconnection. Requests
and UI results are tied to their initiating identity. Account changes clear the
list and close an old account's game; same-account profile refreshes do not.
There is no required realtime connection. Another device or page refresh
restores each match from the backend, including Pool turns with multiple shots.

Leaving hides membership, exits queues, cancels invitations, removes legacy
friendships/notifications and forfeits active games. Blocking excludes both
players from discovering/challenging/matching each other and cancels their open
games without awarding a winner. Unblocking does not restart cancelled matches.

Retention is unchanged: queues/invitations expire after 7 days, inactive active
matches after 30 days (no clock-based winner), terminal matches/moves after 90
days and notifications after 30 days. Legacy friend requests expire after 30
days. Daily cleanup can lag nominal cutoffs by up to a day. Notifications are
still stored by legacy backend operations but have no user-facing feed.

## Installation and publishing

The existing project is `djdpttltfmwkofdrvkem`. New installations apply
`scripts/bored-together.sql` once, then all forward migrations in order. Existing
installations apply only missing forward migrations. Never rerun the baseline
as a reset. The private tables do not modify accounts, single-player scores,
analytics, leaderboard or player-state data.

Pool also requires `supabase/functions/together-pool/index.ts` and `handler.js`,
bundled with the canonical `src/games/pool-engine.js`, deployed as
**together-pool**, `verify_jwt = true`. Built-in Edge configuration supplies
`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The frontend
and Edge bundle must use the same engine version. Deploy backend changes before
the frontend. This redesign makes no changes to the engine or Edge handler.

When pg_cron is available, the baseline schedules `bored-together-retention`
daily at 04:17 UTC. Otherwise a trusted scheduler must call the private cleanup
function. Never expose cleanup through an unrestricted browser endpoint.

Publishing remains a push to `main`; Pages serves `src/` without a build. Recheck
remote changes before pushing and never force-push. Confirm `version.json`
names the release commit and the served entry document matches `src/index.html`.

## Verification

```sh
npm ci
npm run games:check
CHROME_PATH=/path/to/chrome npm test
```

The SQL tests execute the baseline and every forward migration in isolated
PGlite databases, including privacy, opt-in, auth/role denial, blocks, rate
limits, legal/illegal/stale/duplicate moves, completed games, rematches, leaving
and retention. Independent Connect Four rules check seeded games and draws.
Pool tests retain physics parity with the original game, legal pots/retained
turns, fouls, ball in hand, 8-ball outcomes, idempotency, service-role validation
and concurrent-change protection.

The browser test uses two separate account contexts against production SQL and
the actual Pool Edge handler, with external Auth/transport simulated locally.
It tests private-email and username challenges, acceptance into the original
player, failed saves, lost-response retries, automatic returns, opponent resume,
completion/rematches, queue persistence/cancellation, exit, refresh, a legal
multi-shot Pool turn, sign-out privacy, original offline play, 1100/375/320px
layouts and a sandboxed nested iframe equivalent to a Google Sites embed.
Screenshots are captured in ignored `_build/together/` for visual inspection.
A bridge unit test rejects unrelated windows and previous-account results and
proves a retained Pool turn cannot auto-close.

CI additionally provisions disposable PostgreSQL 17 for independent-connection
race tests (competing moves, duplicate queues, crossed requests, leaving and
Pool commits). PGlite cannot prove native transaction locking. To run these
locally, use `BT_TEST_DATABASE_URL` pointing to an entirely EMPTY disposable
database; the test refuses an occupied database. Never use production.

No test creates student accounts, memberships or demo matches in production.
A real Google Sites page and real external Auth providers are not controlled
by this suite; the nested-frame and two-account tests are local equivalents.
