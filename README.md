# Bored — an arcade in one folder

**32 offline games and 2 online extras**, with no runtime dependencies, installs,
or server. The site is the [`src/`](src/) folder itself: [`src/index.html`](src/index.html)
loads the hub modules as plain ES modules, and the games are ordinary HTML in
[`src/games/content/`](src/games/content). The page downloads a game the first
time you open its card, and never before.

GitHub Pages address: **https://bassdrum4.github.io/bored/**.
There is no build: the deploy workflow publishes `src/` as written, so a change
is live a minute or two after the push.

`npm run dev` serves that same folder at `http://localhost:3000`.

## Development

```sh
npm install
npm run dev      # http://localhost:3000, live from src/
npm test         # game regressions, discovery, layout and mock account flows
```

| Path | What it holds |
|---|---|
| [`src/index.html`](src/index.html) | Page shell and leaderboard/auth dialogs — the entry document |
| [`src/main.js`](src/main.js) | Hub wiring: library, player chrome, daily section, leaderboard and account UI |
| [`src/hub/backend.js`](src/hub/backend.js) | Supabase request/session layer, score rules, auth helpers |
| [`src/hub/cloud.js`](src/hub/cloud.js) | The `player_state` pull/push that lets an account follow the player |
| [`src/hub/scores.js`](src/hub/scores.js) | Score specs, best capture, sync, and ranking |
| [`src/hub/feedback.js`](src/hub/feedback.js) | The write-only feedback request (insert, never read) |
| [`src/hub/store.js`](src/hub/store.js) | Safe `localStorage` helpers |
| [`src/styles.css`](src/styles.css) | Site styles |
| [`src/games/content/`](src/games/content) | The hand-written games, one readable HTML file each — including DEEP |
| [`src/games/arcade.js`](src/games/arcade.js) | The four generated games: 2048, Memory, Connect Four, Aim Lab |
| [`src/games/catalog.js`](src/games/catalog.js) | Game order, names, categories, external links, and the on-demand loader |
| [`src/games/discovery.js`](src/games/discovery.js) | Session estimates, gameplay controls, collections, preview URLs |
| [`src/games/previews/`](src/games/previews) | Small WebP captures of every offline game, one file each, named after the slug |
| [`src/games/score-rules.json`](src/games/score-rules.json) | What each game's score means on the shared board (label, better, max) |
| [`src/daily.js`](src/daily.js) | Daily challenge rules and adapters |
| [`scripts/games.mjs`](scripts/games.mjs) | `add` a new game, `register` its shared-board rule |
| [`scripts/setup-feedback.mjs`](scripts/setup-feedback.mjs) | Creates the feedback table ([SQL](scripts/feedback-setup.sql)) |
| [`scripts/player-state.sql`](scripts/player-state.sql) | Creates the per-account `player_state` table — run it in the SQL editor |
| [`vite.config.js`](vite.config.js) | Dev server (`src/` as root); there is no production build |
| [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) | Test, then publish `src/` as the GitHub Pages artifact |

Adding a game? Read [`AGENTS.md`](AGENTS.md) first: it lists the three hooks
(snapshot, high score, daily challenge) a game has to expose to show up in scores
and the daily rotation, plus the house style. A game that skips a hook silently
drops out of those features.

Games are edited as normal HTML and fetched from `src/games/content/` when a card
is opened. GitHub Pages deploys that folder as-is, so the committed files *are*
the site: there is nothing extra to publish, and editing a game or the hub goes
live on the next push. Serving the source unbundled means paths are relative to
`src/` — a game document lives at `games/content/<slug>.html` beside the hub, and
a preview at `games/previews/<slug>.webp`.

GitHub Pages must be set to **Settings → Pages → Source: GitHub Actions** for the
deploy workflow to publish. Until that is switched, the root `index.html` is a
plain redirect to `src/index.html` so the old branch deploy keeps working; it is
the only generated-then-stale file this repo had, and it can be deleted once the
setting is changed.

If you use Infisical for local secrets, `npm run dev:infisical` wraps the Vite
server; see [INFISICAL.md](INFISICAL.md).

## Find something to play

- Start with the featured **Daily challenge**, including its objective, verified
  completion status and Play button.
- **Jump Back In** is one shelf of four cards: recent games first, saved
  favorites filling whatever room is left. **Browse favorites** jumps to the
  library filtered to them.
- The **Leaderboard** follows the shelf, above the library, and is linked in the
  masthead. The account strip under the intro keeps **Sign in** as its only
  filled button, and **Send feedback** sits beside it.
- Search names, categories, descriptions, controls (for example `touch` or
  `keyboard`), pace, and session estimates; press **/** to focus search.
- Browse **Quick Break**, **Play Against Friends**, or **Relax & Unwind**.
  Collections combine with search and category filters;
  **Clear filters** returns to the whole library. Friends means local two-player
  games on one device. Online multiplayer is identified separately on its card.
- Filter by **New**, **Favorites**, **Arcade**, **Puzzle**, **Strategy**,
  **Sandbox**, or **Online**.
- Sort by the original order or A–Z.
- Star games to save favorites and revisit the last four recently played games.
- **Surprise me** chooses from the current results. Remote entries are excluded
  unless you deliberately select **Online**.
- The **waffle menu** in the top-right holds **Resume**, **Restart**, and
  **All games**. **Esc** closes the menu first, then leaves an offline game.
  Remote pages run on another origin, so use the menu when they have focus.
- **Shift+R** restarts and **Shift+F** toggles fullscreen inside offline games.
  **Esc** leaves fullscreen without leaving the game. Fullscreen is no longer a
  menu button; on browsers or embedded pages that block it, Shift+F displays a
  message and may offer a standalone tab.

Favorites, recent games, and best scores stay in your browser's local storage.
Signing in to the optional shared leaderboard also copies best scores to Supabase.
If storage is blocked, the games still work; progress may not persist.
The layout supports phones, touch controls in the new games, keyboard navigation,
visible focus states, and reduced-motion preferences.

Every offline game has an actual captured preview; online extras use labeled
panels and still require internet. Landscape captures fill the card edge to
edge; square and phone-shaped boards (Commanders, Wordle, Tetris) keep the whole
board and sit in paper instead, because cropping one would cut it. Session
lengths are editorial estimates, and the cards list gameplay inputs rather than
just the ability to click a start menu. Discovery adds no runtime network
requests or image services.

To refresh the captures after changing a game's appearance:

```sh
CHROME_PATH=/path/to/chrome npm run previews:capture  # optional slug arguments
npm run previews:optimize                           # Python 3 + Pillow, development only
CHROME_PATH=/path/to/chrome npm test
CHROME_PATH=/path/to/chrome npm run test:visual      # includes a live F-14 embed check
```

Raw captures and verification screenshots go under ignored `_build/`. Commit
the optimized `src/games/previews/*.webp`. The 32 previews total about 74 KB;
images below the first screen load
lazily. `previews:optimize` also refits the previews already on disk when there
are no raw captures, which is how the filled cards were produced without a
browser. No capture tooling is shipped as a runtime dependency.

## Feedback

**Send feedback** in the masthead opens a short dialog: a message, an optional
reply address, and no account needed. It inserts a row into the `feedback` table
with the publishable key, which may only insert — notes cannot be read back out
of the page. Read them in the Supabase dashboard, or with the service key.

The table has to be created once:

```sh
npm run feedback:setup                                # report state, print the SQL
SUPABASE_ACCESS_TOKEN=sbp_... npm run feedback:setup -- --apply
```

`SUPABASE_ACCESS_TOKEN` is a personal token from
[supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens);
the service key cannot run DDL. Without a token, paste
[`scripts/feedback-setup.sql`](scripts/feedback-setup.sql) into the SQL editor,
then re-run `npm run feedback:setup` to confirm it reports `insert-only`. Until
the table exists the dialog says so instead of posting.

## DEEP

**DEEP** is a five-floor roguelike built into the hub, and the only game that
generates its world from the date. Every player gets the same dungeon on the
**first dive of a given day** (the day is Eastern Time, matching the daily
challenge); later dives are cut fresh unless the player retries a seed.
**Random dive** cuts a new one immediately. The seed is printed on the title
screen and in the share text, so a run can be replayed exactly with **Retry this
dungeon**.

Each floor is carved from rooms and corridors by a seeded RNG, then populated
with crawlers, stalkers, bone knights, wraiths, and loot. Movement is turn-based:
one step, one enemy action. Vision uses line-of-sight shadowcasting with a
remembered map, so the layout is explored rather than revealed. Enemies path to
you with a breadth-first flow field instead of greedy steps, which means corners
and dead ends actually matter.

Floors one to four end at a staircase that restores a little health. Floor five
holds **The Warden** and the Vault Core: stepping on the Core while the Warden
lives only tells you it is sealed, so the boss cannot be skipped. Score combines
gold, kills, depth, and a clear bonus, and the best descent is saved locally and
submitted to the shared leaderboard like every other game.

Controls are arrows/WASD/hjkl, space to wait, `Q` to drink a flask, and `>`
or Enter to take the stairs. On touch screens a d-pad, swipe gestures, and
Drink/Descend buttons replace the keyboard. The canvas picks a tile window that
matches the frame, so a portrait phone sees tall rooms rather than a letterbox.

## Daily challenge

The featured challenge rotates through **30 of the offline games**, with a distinct
goal for each game. Everyone gets the same game and target for a given date;
after a full circuit, most targets change difficulty. The day is **Eastern Time**:
`dailyDate` formats the clock in `America/Detroit`, so the challenge rolls over at
**midnight in Detroit** (DST included) wherever the player is, even when the hub
is left open. The hub also hands every game one shared seed for the day
(`window.__boredSeed`), so a board-generating game can open the day with the same
layout for everyone — DEEP does, for its first dive, then cuts fresh ones. Most
games stay random: the goal is shared, not identical boards or enemy spawns.

Examples include clearing Tetris lines, completing Simon sequences (not merely
watching them), beating the Connect Four computer, clearing Minesweeper without hints, growing Eco's populations, and
building a multi-material Sand world. Each goal describes its rules before launch.

Use the **daily challenge button** to enter a tracked attempt. The player shows
live progress and automatically awards completion from current-run game state.
Regular launches and saved high scores do not count. Restart or retry freely;
a completed result remains saved for its date. Individual in-progress game runs
are not resumed after closing the player.

Use **Copy result** after completion to share the game, goal, date, and verified
result. If clipboard access is blocked, a selectable text box provides a fallback.
The challenge works without a connection once its game has been opened once.
With storage blocked, completion survives within the
current page session but not a reload.

Completed days add up into a **streak**, shown as one quiet line under the
challenge — `4-day streak · best 7`. It counts consecutive challenge days with a
verified completion, and a run that reached yesterday is still alive while
today's challenge is outstanding: finishing today grows it, missing today breaks
it. Completions are stored one key per day and each is re-checked against its own
challenge, so a partial or rewritten entry cannot inflate the count. The line
stays hidden until there is something worth saying. Because daily completions
sync with the account, a streak follows the player to another device.

Verification runs locally in the browser. It prevents accidental completion and
checks the stated conditions; it is **not anti-cheat**, and the optional shared
leaderboard accepts browser-submitted bests too.
The two remote extras are excluded because the hub cannot inspect their
cross-origin game state (and Klang is a music player).

## Shared leaderboard (optional)

Sign in with an email and password to keep your best scores on a shared board
and see how other players are doing. The leaderboard ranks accounts: 5 points
for first place in a game, 4 for second, down to 1 for fifth, ties sharing
points, so no game's raw units get added to another's. Only the top five in each
game score — with a board this small, tenth place was mostly everybody. Click a
name to expand its per-game bests, listed A–Z: each game keeps that player's
score where it was, shows your own best on it underneath — ahead, behind or
tied — and carries a **Play** button that opens the game. The leaderboard is
backed by Supabase and is entirely optional: without keys the hub stays offline
and every game still works.

This project's backend is already provisioned: `score_rules`, `profiles`,
`scores`, `player_state`, the public `leaderboard` view, and the `set_handle` RPC. The hub reads
the project URL and publishable key from `API_URL` / `API_KEY` at the top of
[`src/hub/backend.js`](src/hub/backend.js). That key is safe in a static page, and row-level
security limits writes to the signed-in player's own rows. The client writes to
`scores` directly because the existing `submit_score` RPC does not populate the
table's NOT NULL `score` column.

### Your account follows you

Chrome partitions third-party storage, so anything the arcade saves inside an
embed — a Google Sites page, for instance — belongs to that embed alone. Opening
`bassdrum4.github.io/bored/` directly, or in another embed, shows an empty
profile. Signing in fixes that: [`src/hub/cloud.js`](src/hub/cloud.js) mirrors
favorites, recently played, per-game bests and daily completions into the
`player_state` row for the account and merges them back on the next sign-in
anywhere. The merge keeps the better of the two sides — the higher best, the
union of favorites — so two devices that both played offline keep everything
between them.

The table is created by [`scripts/player-state.sql`](scripts/player-state.sql),
which is safe to re-run from the SQL editor. Until it exists, or whenever the
network is out, the hub keeps its local copy and play never depends on it.

### Guests keep the score they just earned

There are no anonymous accounts: a guest plays under the guest profile in this
browser, and nothing is posted to the shared board until they sign in or create
an account. When a guest leaves a game that they just set a best in, the hub says
what they scored and offers them an account — "You scored 500 points in
Asteroids" — with **Sign in**, **Create an account** and **Not now**. The offer
names only that run: choosing an account carries that best over and syncs it, so
the score is not lost by signing in later. Creating an account still adopts the
whole guest profile; signing into an existing account takes only the offered run.

Set **Authentication → URL Configuration → Site URL** to the deployed address
(`https://bassdrum4.github.io/bored/`) and add that address to **Redirect URLs**.
Confirmation emails otherwise fall back to the Site URL, which may still point at
`http://localhost:3000`. The signup request asks Supabase to return to the page
that created the account, and the hub reads the returned session from the URL,
so a successful confirmation signs the player in automatically.

For quick testing, turn off **Authentication → Providers → Email → Confirm email**;
otherwise players confirm by email before their first sign-in. Handles use 3–16
letters, numbers, `_` or `-`.

The board tracks a best score for **30 of the 34 games**. The original eight
(2048, Aim Lab, Memory, Snake, Pac-Man, Void Runner, Simon, and Minesweeper) use
their existing saved bests. Every other offline game except Connect Four and
Tank2 is read from live game state when you leave or restart: Tetris, Breakout,
Frogger, Space Invaders, Q*bert, Asteroids and Commanders post their running
score, Wordle guesses (solved runs only), 8 Ball balls pocketed, Poker chips, and
every other game's displayed points, waves, levels, wins, ships or other progress
metric.
Connect Four and Tank2 are excluded because their only totals are per-session
win counts; the two remote extras are excluded because the hub cannot inspect
their cross-origin state. Scores are submitted by the browser, so this is a
friendly board, not anti-cheat. Signing out keeps local bests intact.

### What counts as a score

Games that end are ranked on how they ended: Solitaire posts the seconds it took
to clear all 52 cards, Wordle posts the guesses of a solved board, Memory posts
moves for a finished board, Minesweeper posts the clock on a cleared field. Games
that can run forever post the score the game itself keeps, so a good run always
beats an abandoned one — and two runs that tie on a coarse counter (lines
cleared, waves survived, levels painted) still separate on points.

Two-player games are local games with a CPU in one seat, so they only post when
the opponent was the computer: Pong, SUMO, VolletBall, Lava, Tank, Gun Mayhem and
8 Ball all check the mode they were played in, and a win over a person stays in
that browser. SUMO, VolletBall and Lava start against the CPU and switch to two
players from the button in their controls.

`scores.game` is a foreign key to `score_rules.game` (constraint
`scores_game_fkey`), so `score_rules` is the list of games the shared board
accepts. The hub waits for that list and never posts a game missing from it,
which is why a new game no longer produces a foreign-key error.

Every game ranks on its own board and nothing is ever folded into another
score. Two games have no rule row of their own yet — DEEP and Lights Out — so
their bests save in the browser and nothing is posted for them. Adding their
rows puts them on the shared board exactly like every other game, no code
change:

```sql
insert into score_rules (game, label, better, max_value)
values ('deep', 'Score', 'high', 1000000),
       ('lights-out', 'Boards cleared', 'high', 999)
on conflict (game) do nothing;
```

Solitaire's rule row is ranked on seconds to clear rather than foundation cards,
so `scripts/score-rules-update.sql` rewrites it together with the seven boards
that moved to a score and clears the values saved under the old units — a stored
4 meant four layouts, and nothing converts it into four points.

## New games (4)

| Game | How to play |
|---|---|
| **2048** | Merge equal tiles with arrow keys, WASD, swipes, or the on-screen arrows. Includes one-move undo and a saved best score. |
| **Memory** | Flip cards to find eight pairs. Tracks moves and your best completed game. Mouse, touch, Tab, and Enter work. |
| **Connect Four** | Connect four discs against a look-ahead computer opponent or a local friend. Choose a column with its button or keys 1–7. |
| **Aim Lab** | Hit targets in a 20-second challenge. Tracks hits, accuracy, and separate best scores for normal/small targets. |

These additions live in readable JavaScript in
[`src/games/arcade.js`](src/games/arcade.js). They need no network requests,
fonts, libraries, or other files.

## Lights Out

A 5 × 5 grid of paper squares: press one and it flips together with the squares
sharing an edge with it. Clear the board by turning every light off, and the next
board is dealt straight away. Cleared boards, moves, and your best sit on one line
above the grid; arrows move a cursor and Enter presses. Best of all, it is small:
one HTML file, [`src/games/content/lights-out.html`](src/games/content/lights-out.html),
with no fonts, libraries, or images.

## Original offline games (25)

Pulled from `https://sites.google.com/midlandps.org/vibecoding/`:

sumo, sand, poker, wordle, lava, volletball, solitaire, commanders, eco,
void-runner, qbert, simon, frogger, pac-man, snake, tank, space-invaders, pong,
asteroids, breakout, tetris, minesweeper, tank2, gun-mayhem, shadow-net

Everything needed by these games is inlined:

| Dependency | How it is handled |
|---|---|
| Original games | Readable HTML in `src/games/content/`, fetched on first open |
| Font Awesome (shadow.net) | Subset to the four icons actually used |

Games run in separate `srcdoc` iframes, keeping their CSS and JavaScript isolated
from the hub. A storage shim in the original games provides an in-memory fallback
where needed on `file://`.

## Online extras (2)

These use an ordinary iframe pointing to their own servers and **require internet**:

- **F-14** → `https://bassdrum4.github.io/f-14-4/` — flight simulator
- **Klang** → `https://youtubeplayer.freebuff.app/player` — music player;
  signed-out visitors may see its sign-in screen

Their availability, sign-in requirements, and framing policies belong to the
remote sites. They were not re-verified as part of the regression run.
The idle hub does not contact these servers. F-14's new GitHub Pages build was
also verified separately to load its menu and canvas inside the player.

The original **proxy** and **jellyfish** entries remain excluded because their
source could not be collected as self-contained pages.

## Verification

[tests/bored.test.cjs](tests/bored.test.cjs) uses Node's built-in test runner,
`puppeteer-core`, and an installed Chrome for the browser block. Run from the
repository root after `npm install`:

```bash
node --test tests/bored.test.cjs
```

Set `CHROME_PATH` if Chrome is not installed in a standard location. The test
runner also accepts a cached browser from an existing `puppeteer` installation.
The rules and daily tests run without a browser. The browser block covers
JavaScript syntax, 2048 merge rules and undo, Connect Four wins and computer
tactics, actual browser gameplay, Memory completion and timer cleanup, Aim Lab
accuracy and expiration, search/filter/sort, the jump palette, saved favorites,
Escape and focus restoration, all 32 offline game boots, DEEP's seeded dungeon and boss gate, poker's
simulated equity, no-peeking opponents and draw discards, 8 Ball's simulated shot planning
(pots, safeties, escapes, no avoidable fouls or scratches, a whole self-played rack),
all 30 daily state
adapters, per-game goal acceptance/rejection, real Memory challenge completion,
saved results, sharing with clipboard fallback, Detroit-time rollover, 320px layouts,
blocked storage, high-score capture, one shared board per game with the
local-only ones kept off it, and no external game requests beyond the
configured leaderboard API.

The browser block loads `src/index.html` over loopback with `src/` as the site
root, which is the same tree Pages deploys. The hub keeps the small `window`
compatibility surface (`openGame`, `dailyDate`, `CHALLENGES`, and friends) that
the original single-file hub exposed to its tests and console.

For release screenshots and a live F-14 embed smoke test (requires internet):

```bash
node --test tests/visual.test.cjs
```

This writes desktop and mobile screenshots into the ignored `_build/shots/`
folder; it checks 1100px, 375px, and 320px layouts and the new game screens.

## Adding a game

One command scaffolds a playable game, wires it into the catalog, and records
what its score means:

```bash
npm run games:add -- whack-a-mole "Whack-a-Mole" Arcade "Bonk them before they hide" \
  --unit moles --metric moles
```

It prints the two short snippets to paste — the `highScore()` entry in
[`src/hub/scores.js`](src/hub/scores.js) and an optional daily challenge in
[`src/daily.js`](src/daily.js) — then finish with:

```bash
npm run games:register   # add the missing score_rules rows (or print the SQL)
node --test tests/bored.test.cjs
```

`games:register` is the command that used to be a database chore. The shared
board only accepts games that have a `score_rules` row, so this compares the
catalog with the table and inserts anything missing. With
`SUPABASE_SERVICE_KEY` set (environment or `.env.local`) it writes the rows
itself; without one it prints the SQL to paste. The test suite reads its counts
from the catalog, so adding games never means editing assertions.

Adding any number of games is the same loop; nothing else has to be updated.

## Maintenance

Edit the source under [`src/`](src/) and push; that folder is the site. There is
no build to run and no generated file to keep in step. Each game is a normal HTML
file in [`src/games/content/`](src/games/content), so it can be changed without
touching the other games or the hub.

The author's ignored `_source/` and `_build/` folders contain the original game
sources, collector, cached dependencies, and older verification scripts. The
legacy `_build/build.py` generator **will overwrite these additions** — it is not
part of the site and never was.
