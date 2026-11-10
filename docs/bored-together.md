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
list. Rematches work the same way.

Under the member list, the picker shows a short second list: Bored accounts that
have not joined Together yet, by their public display name. Their row has one
**Invite** button, which uses the game selected above. The invitee sees a modal
the next time they open any game, naming the inviter, the game and how to join.
Closing it dismisses the notice for that page; **Accept** keeps the invitation on
the server until they enrol, so joining Bored Together turns it into the game
they were promised. That game is revealed at once, with the inviter to move, so
it is already in the new member's list instead of waiting for a first turn.

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
suite asserts that. Badges count turns only. Invitations are the one separate
surface: `bt_invite_rpc` handles `candidates`, `send`, `list`, `accept` and
`claim`, and nothing else.

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

**Tank 2** is a `turns` game without a server-side simulation, because the
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

All seven private `bored_together` tables (`members`, `blocks`, `matches`,
`moves`, `queue`, `limits`, `invites`) have RLS and no direct browser table
grants. The invite candidate list holds every account that has a profile and
is not an active member, up to fifty so the reply stays small; no address is
stored or returned. It was capped at eight, which made a longer list look
complete, and `together_invites_full_list` raised it.
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

## Live games (Civ Lite 5.0)

A live game is 2 to 4 members plus CPUs playing the same Civ Lite game at the same time. It is separate from the
turn-by-turn matches above: its own tables (schema `bored_live`), its own endpoint (`public.bt_live_rpc`) and its own
hub files. Solo games, pass and play, save slots and the async two-player Ashcrown match are unchanged.

**Start.** Bored Together → *Start a live game* → pick 1 to 3 members from the directory → *Open lobby*. The game opens on
its own Game setup screen in a live version: the host sets map, size, CPUs (8 civs in all), difficulty, borders, turn
limit, victories, the turn timer (off, 60, 120 or 300 seconds) and what happens to seats nobody joins. Each invited
member sees *Invited* in Your Games and joins from there. Joiners see the setup read-only except their own civ and
*Ready*; changing the setup asks everyone to be ready again. The host starts once every joined member is ready.
Invitations are limited to members, because a live room needs everyone present: the "not in Bored Together yet" list
of the turn-based games is not offered.

**One ordered log (lockstep).** Every state-changing command is an action `{ seat, type, args }` in plain JSON. The
client sends it; the server gives it the next number for that game and stores it, and does not simulate it. Every
screen receives the actions in order and applies them through the same rule functions, so the same seed plus the same
actions gives the same game everywhere. A player's own action takes effect only when it comes back in order. CPUs are not
actions: each screen runs the CPU turns itself from the seeded random generator, at the same point of every round.

- The server appends under a per-game row lock (`head + 1`, so sequence numbers have no gaps), is idempotent by
  `request_id` (a retry gets the same number back and is not counted against the rate limit), checks that the seat
  belongs to the caller, and rate-limits (300 actions a minute, 900 calls a minute, 20 new games an hour).
- Delivery is Supabase Realtime on `bored_live.actions` (the hub's own small client in `src/hub/realtime.js`, the
  Phoenix protocol over the browser's WebSocket, nothing to load). While the socket is down the log is read once a
  second with `sync`. While it is up a heartbeat every 10 seconds also checks that no action was missed. A screen holds
  a later action until the earlier ones have arrived, and asks the server for a missing one.
- At the start of every round each screen reports a hash of the game. A hash that disagrees with another screen's is
  recorded in `bored_live.desyncs` and that screen reloads from the newest snapshot and the log after it (at most three
  times in two minutes). The hash covers the whole game except what each screen shows only to itself.
- At each round start the lowest-seated human who is online uploads a snapshot (first writer wins, the last three are
  kept). Since 5.1.1 the server keeps one only once another seat has reported the same hash for that round, so the
  uploader waits a second and asks again a few times while the server answers `wait`. Opening or rejoining a game loads
  the newest snapshot and replays the actions after it.

**What replay needs from the rules.** Rule code never calls `Math.random()` or `Date.now()` (it uses `roll()`, the
seeded generator), avoids functions that differ between engines (`Math.exp` and `Math.pow` are written out), and does
not depend on the order of an object's keys: a snapshot that has been through Postgres `jsonb` comes back with its keys
in the database's order, so every screen puts the keys in one order at each round start and when it restores one
(`liveCanon`), and the hash is taken over sorted keys.

**Turns.** A round runs every player's start-of-turn processing in seat order, then the humans act, then the CPUs, then
the next round. Humans at peace with every other human act at the same time. Humans at war with each other take turns in
seat order, each starting when the previous one ends; a human at peace with everyone is never held up by that. The
round ends when every human has ended their turn, or when the timer runs out (a `timeout` action, which the server
accepts once per round and only after the time has really passed). Offers and answers (peace, borders, trade,
embassy) are not turns: they arrive and show in the Council at once.

**Leaving and coming back.** Each screen touches the server every 10 seconds; a seat is *online* if heard within 25
seconds. A human who leaves, or is silent for 60 seconds, gets a `cpu-takes-over` action (any other screen may insert it,
the server keeps one), and a CPU plays that civ from the next round. When they open the game again a `human-returns`
action hands the civ back at the next round start. Everyone gets a toast both times. If every human has gone the game
waits on the server.

**What each screen shows.** Every screen holds the whole game state, so it can replay it, but shows only its own seat's
view: fog of war, names of civs not yet met, the Council and offers addressed to that seat. Cards and toasts about other
seats are never shown. This is a view rule, not a secret: a player who reads their browser's memory can see more.
Each seat has a `team` stored in the game (in 5.0 the team is the seat number) so a team mode can be added without
changing the format.

**The bridge.** The game gets `window.__boredLive = { call(op, payload) → Promise, on(fn) }` from the hub, injected into
its document before its script, with a channel id and `event.source` checks like the turn-based bridge. Operations:
`hello`, `game`, `lobby`, `start`, `leave`, `send`, `ping` (co-op only), `report`, `snapshot`, `finish`, `reload`, `resync`,
`exit`. Events pushed to the game: `game` (the lobby changed), `actions` (the next ones, contiguous), `ping` (a teammate's
map ping), `presence` (who is online, the round clock), `net` (the hub's connection). The game never sees a token or the network.

**Installing.** Apply `supabase/migrations/20261109120000_together_live_ashcrown.sql` once, the way the other
forward migrations are applied. It only adds: the `bored_live` schema, its tables, `public.bt_live_rpc`, row-level
security, and (if the `supabase_realtime` publication exists) the actions table's membership in it. It changes no
existing table or function. Then publish the frontend. Until the SQL is applied the live buttons simply report an error
and the rest of Bored Together works as before. Deploy the SQL before the frontend.

**Co-op (Civ Lite 5.1).** The host can set *Mode* to *Co-op: humans vs CPUs* (setup key `mode`, `'ffa'` by default). Every human
then plays on one team against the CPUs: the game keeps one team number per seat in `G.teams`, teammates share one map, are
always at peace with open borders, and can trade or give each other horses, iron and gunpowder (the `gift` action, which is
an ordinary talk action in the log). The team wins and loses together. The mode is part of the room's frozen setup, so every
screen starts the same game. Map pings (Alt+click, or *Ping* in a hex's card) are the one thing that is not an action: a
ping goes to `bored_live.pings` through `bt_live_rpc('ping', …)` and teammates read it over Realtime on that table (or by
polling `'pings'` where there is no socket, which the hub does once a second when the socket is down). It never enters the
action log or the hash, so it cannot desync a game; the server keeps a ping for a minute and serves one for fifteen seconds.
Only seated players of a running co-op room can ping, eight in any ten seconds at most. A free-for-all room is stored and
played exactly as in 5.0.

**Installing co-op.** Apply `supabase/migrations/20261109150000_together_live_coop.sql` once, after the 5.0 migration. It only
adds: the `mode` key in the setup check (`bored_live.clean_config`, replaced with the same body plus one branch), the
`bored_live.pings` table with its read policy, `bored_live.ping_api`, and a new body for the thin `public.bt_live_rpc`
wrapper (same signature) that hands `ping` and `pings` to `ping_api` and everything else to `bored_live.api` as before. It
does not touch `bored_live.api`, so it can be applied before or after any later change to that function. Deploy the SQL
before the frontend: until it is applied a free-for-all room is unaffected, a co-op room is refused with *Invalid setup*,
and pings report an error.

**Live-game checks (Civ Lite 5.1.1).** The server still does not simulate Civ Lite, but it no longer takes one client's word
for three things. They apply the same way to free-for-all and co-op rooms (in a co-op room every human screen computes
the same hashes and the same ending).

- *Game ending.* Every human screen sends `finish` with the winner it computed. A claim is stored per seat in
  `bored_live.finish_claims` (a screen that did not get through sends it again a few times). The room is completed once
  two seated humans have claimed the same winner, or once one human is left (a room with one human seat, or humans taken
  over by CPUs): a lone claim waits and is counted again if the other human is replaced by a CPU. Claims from seats a CPU
  plays, and winners that are not a seat of the game, are ignored. Until the room is completed it stays open and keeps its
  heartbeat on the hub side.
- *Round numbers.* `report` accepts only the round under way (`g.round`) or the next one (`g.round + 1`); anything else is
  refused with *Invalid request.* and changes nothing. If every screen failed to report one round, the server's round
  stays behind and a later round's report is refused until a report for the next round reaches it; the turn timer
  compares against the server's round, so the game keeps going but a timeout waits for the round to catch up.
- *Snapshots.* A snapshot is stored only if another seat has already reported the same hash for that round (when more
  than one human seat plays, or the sender's seat is run by a CPU). With one human playing it is stored at once.
  Otherwise the answer is `{ stored: false, wait: true }`, and the first writer still wins once it is stored.

**Installing the checks.** Apply `supabase/migrations/20261109190000_together_live_checks.sql` once, after the 5.0 and
5.1 migrations (the file names sort in that order). It only adds: the `bored_live.finish_claims` table (row-level security
on, no access for members), the `bored_live.settle_finish` helper, and a new body for `bored_live.api` (same signature,
same operations, with the three checks above). It changes no existing table and does not touch `bt_live_rpc` or the co-op
pieces. Deploy the SQL before the frontend. With the SQL applied and the old frontend still cached, a game
still finishes (every screen sends its claim), but a hub that sent its claim stops listening even though the room waits for
the second one; reloading the page picks it up again. Without the SQL the frontend's new retries are harmless.

**Multiplayer inside Civ Lite (5.2).** When Civ Lite is open in Bored's player and is not itself a match or a live game, its title
menu has a *Multiplayer* item (after Load game; a count tag shows how many live-game invites wait). It opens a screen with
*Host a live game* (the Game setup with a friend picker where the seats would be), *Invites* (who, free-for-all or co-op, when,
with Join and Decline) and *Your live games* (the players and who is online, the round, Rejoin; finished games folded; the
turn-by-turn two-player games are listed with a note that they open from Bored Together). It refreshes when it opens and every
5 seconds while it is open (the live channel is per room, so there is nothing to subscribe to before a game is open). Signed
out it says *Sign in to Bored to play online* with a button for the hub's sign-in; signed in but not in Bored Together it says
*Join Bored Together to play online* with a button that closes the game and opens that page. Nothing here needs SQL: it
uses `bt_live_rpc` (`list`, `create`, `join`, `leave_lobby`, `game`) and `bt_rpc` (`dashboard`, `people`) as they are.

The game has no network, so it asks the hub through a second bridge, `window.__boredLobby = { call(op, payload), on(fn) }`
(`src/hub/together-lobby.js`), injected like the live bridge, with its own channel. The hub answers only a message from the
game's own window, on that channel, and only for a signed-in account (the sign-in request is the one thing answered signed out), and
it drops an answer if the account changed while the call was out. Operations: `status` (`{ signedIn, enrolled, name }`),
`members`, `invites`, `games`, `host(settings, invitees, humans)`, `join(invite)`, `join-code(code)` (5.4), `decline(invite)`,
`open(game)`, plus `sign-in` and `open-together`. `host`, `join`, `join-code` and `open` end by switching the player into that live game, exactly as opening it from Bored
Together does (the document is reloaded with the live bridge). The page is given display names, whether people are online,
room ids for rooms it may open, and opaque per-list references for the members it may invite: never a token, an email or an
account id. Leaving a live game from its Menu (or leaving or cancelling in the lobby) now returns to Civ Lite's title screen
instead of closing the game. (Bored Together's own page got *Join with code* in 5.4, below.)

**Room codes (5.4).** A room has a *join code* and a *capacity*, so friends can join without being invited by name, as in Civ 6.

- *The code.* Six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0, O, 1, I or L), made by the server from
  `gen_random_uuid()` bytes (`byte & 31`, which is unbiased because 256 divides by 32; no extension is needed). It is unique
  among rooms still in the lobby (a partial unique index), and it is cleared when the game starts. A lobby untouched for 24
  hours is closed by the existing cleanup, and `join_code` treats it as closed even before the cleanup has run.
- *The capacity* is 2 to 4 human seats, set by the host when the room is made. Seats nobody takes (invited friends who did
  not join, and open seats) become CPUs or are dropped at the start, according to *Seats nobody joins*, as in 5.0.
- *`create`* no longer needs invitations (0 to 3), takes `capacity` (without it, a room is as big as its invitations, with
  two as the least, so every earlier caller works as before) and returns the code, to the host only.
- *`join_code(code)`* is for a signed-in member of Bored Together. It ignores case, spaces and dashes. The room must be in
  the lobby with a free human seat, and the account must not be blocked by the host (`bored_together.blocked`) or have been
  removed with this code. It seats the player as `joined`. The answers are plain: *No open room with that code*, *That room
  is full*, *That game has already started*. Nobody who is blocked or was removed learns that the room exists: they get *No
  open room with that code*. It is limited to 10 tries a minute per account (`live-code`), on top of the live-calls limit.
- *`new_code(id)`* (host, lobby) makes a fresh code; the old one stops working, and so does the removal list.
  *`kick(id, seat)`* (host, lobby) removes a joined or invited player, who cannot come back with the same code until a new
  one is made (`bored_live.kicks`). The player's screen is told it was removed.
- *Who sees the code.* The host, in `list` and `game`; a player who has joined (or is ready), in `game` only, so they can
  pass it on (`list` removes it for everyone but the host). A player who is only invited, someone outside the room, and
  everyone after the start never receive it. The last code is kept in `retired_code` after the start only so that a late
  joiner hears *That game has already started*; it is never sent to anyone and the cleanup clears it a day later.
- *A wrong code is an answer, not an error.* A raised error rolls back the whole call, and with it the server's count of
  tries, so `join_code` returns `{ ok: false, error }` for a wrong, full, started or blocked room, and the hub's `liveRPC`
  turns that into an ordinary error. Only going over the limit raises.

In Civ Lite, *Host a live game* has a *Human players* choice (2 to 4) and an optional *Invite friends by name* list (the
friend list grows the human seats to fit, and fewer seats take back the latest invitations). The lobby shows the code large
with *Copy code*, *Copy invite* (`Join my Civ Lite game on Bored: code KX7Q2M`) and, for the host, *New code*; seats as they
fill (open seats are shown as such), and *Remove* on the host's side. The copy buttons call `navigator.clipboard` inside the
click and, if the browser refuses, put the text in a box and select it. The Multiplayer screen has a *Join with code* box
(one field that takes typing or a pasted invite) whose refusals show under it; *Join* goes straight to the lobby. Bored
Together's own page has the same box next to *Start a live game*. The lobby bridge gained `join-code` and a `humans` value on
`host`; the live bridge gained `new-code` and `kick` and tells the screen `removed` when the server says the player is no
longer in the room. The code reaches only seated players, and only inside the lobby: it is not in what the lobby bridge
gives the Multiplayer screen, nor in `list` for anyone but the host.

**Installing room codes.** Apply `supabase/migrations/20261110150000_together_live_room_codes.sql` once, in the Supabase SQL
editor, after the earlier live migrations (`..._together_live_ashcrown.sql`, `..._coop.sql` and `..._checks.sql`; the file names
sort in that order). It only adds and replaces: the columns `code`, `retired_code` and `capacity` on `bored_live.games` (lobbies
that are open already get a capacity equal to their seats, so nothing changes for them; they have no code, so they only fill by
invitation), the table `bored_live.kicks` (row-level security on, no access for members), the helpers `new_room_code` and
`assign_code`, and new bodies for `bored_live.game_json`, `bored_live.cleanup` and `bored_live.api` (the 5.1.1 body with every
check kept). It does not touch `bt_live_rpc`. Deploy the SQL before the frontend. With the SQL applied and the old frontend
cached, nothing breaks (a room just has a code nobody types). Without the SQL the new frontend still opens a room with at least one
invited friend (the old server ignores `capacity`), but *Host a live game* with nobody invited says *Invite one to three members*
and *Join with code* says *Unknown operation*.

**Known limits.** The server orders actions but does not simulate Civ Lite, so a modified client can send moves its
rules would refuse (every screen refuses them the same way, so the screens stay in step, but a made-up action is still
in the log), can read the whole game state, and, together with a second modified client, can still agree on a made-up
ending or snapshot. Timeouts and takeovers are checked
against the server's clock and presence, not against the game. A browser tab that has been hidden for several minutes
may have its timers slowed down; that looks like leaving, and opening the game again takes the civ back.

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

Live games have their own suites, run together with `npm run test:live`: `realtime.test.cjs` (the Realtime client
against a Phoenix-protocol server on a real WebSocket), `live-hub.test.cjs` (the session between a screen and the room:
order, retries, polling, presence; and the bridge's channel checks), `live-game.test.cjs` (determinism over 40 rounds,
snapshot replay including jsonb key order, dynamic turns, the timer, leaving and returning), `live-screen.test.cjs`
(the game's live screen in two real browsers against a stand-in room), `together-live.test.cjs` (the room's SQL:
gap-free sequence numbers under concurrent sends, idempotent retries, membership, ordering, the rate limit, and the co-op
setup key and pings),
`room-codes.test.cjs` (5.4: the code alphabet and uniqueness, `join_code` with its messages and rate limit, `new_code`, `kick`,
who sees the code, the start, the 24-hour closure, and that the 5.1.1 checks are still in the replaced `api`) and
`live-browser.test.cjs` (signed-in browsers start, join, play and rejoin against the real SQL, with Realtime cut off
part way; and host, join with a code, refuse a third account and make a new code). The last three need a disposable
database like `together-postgres.test.cjs` (CI runs them in that job).

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
