# Bored Together

Bored Together finds opponents and manages saved turns. The original games handle
playing. It uses the existing Bored account, hub, native ES modules and player;
there is no second arcade, login, popup or link-sharing requirement.

## One screen

After explicit enrollment, the screen has **Start a Game**, **Play Random** and
**Your Games**. Starting a game means choosing a game, then a member from the
list of everyone in Bored Together — display name and email, the people you
would recognise. There is no address to type. Random play means choosing a game
and joining its saved queue.

Starting a game also plays it: the original game opens straight away with the
challenger's turn. The match stays private to them until the first saved turn
passes it to the opponent, who then sees it in their list as their turn. Leaving
before that sends nothing at all, so no half-started game appears on anyone's
list. Rematches work the same way. Nothing is "invited" and nothing is accepted;
a game simply arrives when it is yours.

The list contains every game, with the ones waiting on you first. The latest
three completed matches remain at the bottom with a result and Rematch action;
there is no history browser, records dashboard or replay. Small More menus hold
Block, Unblock, **Delete game** — either player can remove a match for both of
them, recording no winner — and Leave. Leaving removes you from the directory,
drops games nobody has seen yet, cancels games you have not sent and forfeits the
ones in progress.

Two games are a single run rather than a turn: **2048** and **Mahjong**. The server
picks the seed, both players get that board, and the game's own score is
submitted once. Neither result is shown to the other player until both are in,
so nobody plays against a known target; the row is then the scoreboard. Leaving
one asks before sending the run.

Friend requests, the notification feed, email-visibility settings, name/address
search, Accept/Decline/Cancel and the pre-play-first `pending` state have been
removed from the database, not just hidden. What remains is one dispatcher with
`enroll`, `people`, `block`, `unblock`, `challenge`, `queue_join`,
`queue_cancel`, `match`, `move`, `submit_run`, `resign`, `rematch`, `delete`,
`leave` and `dashboard` — anything else answers "Unknown operation", and the SQL
suite asserts that. Badges count turns only.

## Original-game integration

`src/hub/together-ui.js` owns enrollment, the member directory, queues and the list.
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

A game is only delivered on the turn boundary: a challenge row is created
unrevealed with the challenger to move, and `revealed_at` is set when the turn
leaves them — including on a completed game. Pool's committing RPC follows the
same rule, so a legal pot that keeps the shooter at the table keeps the game
private until their turn actually ends. `resign` on an undelivered game deletes
it rather than awarding the opponent a win they never saw.

Pool v1 uses zero-spin house rules, with no called pockets or rail-after-contact
requirement. The game no longer offers a spin control at all: the cue ball leaves
along the aim, so both seats in a match see the same shot. An 8 on the break re-racks;
an early/fouled 8 loses. Prediction uses the same canonical engine as validation
and is drawn by the original game; it never supplies a result to the backend.
Timer-based animation settles even if an embed stops receiving animation frames.

If saving fails, the game stays open with an error and recovery controls. Retry
uses the same request ID, including when the server saved but its response was
lost. The board is restored from confirmed state, not a guessed winner or score.
Reload fetches fresh authoritative state to recover stale versions. Exiting
while a save is in flight does not cancel the server transaction; reopening
always loads the saved state. There are no offline multiplayer moves.

Two kinds of adapter exist, distinguished by `mode` in `TOGETHER_ADAPTERS`:

- `turns` — the server owns the board, validates each move and decides the
  result. Connect Four and Pool.
- `duel` — the server owns the seed and one submission per player, and compares
  two numbers. 2048 and Mahjong. It is the same trust the single-player boards
  already use, bounded by `duel_limit`; there is no replay and no claim that the
  board was played honestly.

A duel's seed is chosen once per Detroit day (`duel_seed`) and injected as
`window.__boredSeed = { seed, match: true }` before the game's own script, which
replaces the hub's daily seed so a re-deal replays the same board. 2048 draws
both its spawns and its restarts from that seed; Mahjong deals and re-deals from
it. The hub polls the game's `__boredSnapshot()` and sends the run itself the
moment the game reports `finished`, so a completed run is never lost to a
forgotten send.

**Pastel Tanks** is a `turns` game without a server-side simulation, because the
game itself is already turn-based. A match stores one seed — which picks one of
the original's five hand-shaped maps plus a phase — and the list of shots. A
shot is `{seat, x, angle, power, weapon, won}`: where the tank drove, how it
aimed, which shell it used. `src/games/tank-engine.js` replays that list into
the board, the craters, hit points, power-ups and the winner, and both players
run it, so the result is recomputed on the other side rather than reported.

The document keeps its own drawing and input code and, when a match is open,
replaces its simulation with the engine's: the same field, the same arc, the
same explosion. Power-ups are no longer random per client — the spawn stream is a
seeded function of the shot index, and their positions are part of the replayed
state. A shot that a client claims ended the game is stored as a win; the
opponent's replay of the same shots is what shows whether that was true, and the
stored result is not silently trusted by either screen.

This is deliberately weaker than Pool: the database bounds the shot (field,
angle, power, weapon, turn, version, shot count) but does not simulate it. A
modified client could therefore submit a shot geometry that never happened;
what it cannot do is make the other player's replay agree. Adding an Edge
function that runs the engine, as Pool does, is the step that would make the
referee authoritative, and the engine is written to be that referee already.

The selector intersects the catalog with the adapter registry. Mini Golf
multiplayer remains deferred: its browser-reported stroke total is not trusted.
A new game must implement the contract in its original game, add a versioned
server rule, and pass the same lifecycle and two-account tests before being
added to `TOGETHER_ADAPTERS`.

## Privacy, persistence and security

Enrollment is optional; existing accounts are not automatically discoverable
until they join. A member can see every other member's display name and account
email in the picker, and their own entry in everyone else's list. Blocked pairs
and nonmembers are excluded, and the viewer is never in their own list. Email is
read from Auth by the directory query; it is not copied into multiplayer tables,
and no match, move or stats payload carries an address — only the picker does.

The current enrollment consent version is `2026-10-26-v3`. An enrolled member
whose consent predates it gets `{enrolled:false, renew:true}` from `dashboard`
and is shown the new notice once before their games load again, because the
notice now covers the address being visible to other members. The earlier
`together_private_discovery` migration had narrowed projections to hide email;
this change deliberately reverses that for the directory only, and the SQL
suite asserts the new behavior. `search` was removed with the rest of the
retired surface, so the directory is the only way to find someone.

All six remaining `bored_together` tables (`members`, `blocks`, `matches`,
`moves`, `queue`, `limits`) have RLS and no direct browser table grants.
Keep this private schema outside the exposed Data API schemas. `public.bt_rpc`
is SECURITY INVOKER; the dispatcher is in the private schema, SECURITY DEFINER
with empty search path, and derives identity from `auth.uid()` after checking
that the non-anonymous Auth account exists. Internal helpers cannot be called
by browser roles. User-editable metadata never grants authorization.

The directory is limited to 30/minute and 2,880/day per account; social
mutations (challenge, rematch) share a 30/hour limit and every RPC draws on a
180/minute budget. These are per-account limits, not IP-level protection against
mass account creation. Shared transaction advisory locks, match-row locks,
participant checks, turn ownership, rule versions, stale-version checks and
unique request IDs are unchanged.

Connect Four moves contain only a column; a duel submission is one integer
bounded by the game's own limit (72 pairs for Mahjong, 10,000,000 for 2048).
Pool sends angle (integer tenths of a degree), power (1–100) and optional legal
cue placement. The `together-pool` Edge
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

Leaving hides membership, exits queues, drops games nobody has seen yet
(`revealed_at is null`), forfeits the rest and removes the player from the
directory. Blocking excludes both players from the directory, challenging and
matching, and cancels their open games without awarding a winner. Unblocking
does not restart cancelled matches.

Retention is unchanged: queues expire after 7 days, unplayed games after 7 days,
inactive active matches after 30 days (no clock-based winner), and terminal
matches/moves after 90 days. Daily cleanup can lag nominal cutoffs by up to a
day.

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

**Production migration tracking (reconciled 2026-10-26):** The Pool migration
was originally recorded remotely as `20261026094426` and Mahjong's rule
update as `20261026145657`, although this repository contains their SQL
under different timestamps. The repository versions `20261025214401`,
`20261026180000`, `20261026230000`, `20261026234500`, and
`20261027000000` were subsequently marked applied **without rerunning SQL**
after confirming the live schema already had their changes. Never replay
these migrations as a reset or assume an absent history entry means absent
schema; inspect the live database first.

**The Pages deploy does not deploy backend code or score rules.** After changes
to `src/games/pool-engine.js`, redeploy `together-pool` with the current
engine file as well as `index.ts` and `handler.js`, keeping JWT verification
enabled. After adding a scored game, register its `score-rules.json` entry
in Supabase before relying on the shared leaderboard.

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
PGlite databases, including privacy, opt-in, auth/role denial, the retired
actions answering "Unknown operation", blocks, rate limits,
legal/illegal/stale/duplicate moves, duels (shared seed, hidden opponent run,
bounds, draw, one submission each), completed games, rematches, delete, leaving
and retention. Independent Connect Four rules check seeded games and draws.
Pool tests retain physics parity with the original game, legal pots/retained
turns, fouls, ball in hand, 8-ball outcomes, idempotency, service-role validation
and concurrent-change protection.

The browser test uses two separate account contexts against production SQL and
the actual Pool Edge handler, with external Auth/transport simulated locally.
It plays a game from the picker: the challenger starts in the original player, a
failed save is retried, the opponent only receives the game once the turn is
saved, the board resumes, the game completes, and a rematch is played first too.
It also covers the member directory (addresses shown, never in a game row), queue
persistence/cancellation, exit, refresh, a legal multi-shot Pool turn, a 2048
duel where both players get the match's seed and the scores stay hidden until
both runs are in, a Tanks match where the second player's screen rebuilds the
first player's damage from the stored aim, sign-out privacy, original offline
play, 1100/375/320px layouts and a sandboxed nested iframe equivalent to a
Google Sites embed. `tests/tank-engine.test.cjs` holds the engine to the
document's own terrain, column for column on all five layouts, and proves a shot
list replays identically and that only the seed decides the map.
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

### Multiple games with one opponent

Each direct challenge creates an independent match, including when another game
of that type is already open with that opponent. Both players may initiate
separate games. The former unique pair index is now an ordinary lookup index;
match IDs, move request IDs, turn validation and rate limits remain enforced.
Each new game opens for its creator's first turn. Either participant can use
More → Delete game to remove the selected game for both without affecting other
games with that opponent or awarding a win.
