# Working in this repo

Bored is a single-page arcade. The site is the `src/` folder served as written: `src/index.html`
loads `main.js` and the hub modules as native ES modules, and the games are separate HTML
documents in `src/games/content/` that the hub fetches over HTTP when you open one. Nothing is
built or bundled — `src/` is both the source and the deployed tree. There is no framework, no
router, no server. Read this before adding or editing a game — a game that misses these hooks
silently disappears from scores, the daily challenge, or the build.

```
src/main.js              hub wiring: library, player chrome, daily, leaderboard + account UI
src/hub/library-view.js  game library, filters, preview cards and recent shelf
src/hub/leaderboard-view.js  leaderboard rendering and fetching
src/hub/account-ui.js  sign-in and profile dialogs
src/hub/feedback-ui.js  feedback modal
src/hub/game-document.js  game HTML and seed injection
src/hub/backend.js       Supabase request/session layer, score rules, auth helpers
src/hub/cloud.js         player_state pull/push — the account follows the player across browsers
src/hub/scores.js        score specs, best capture, sync, ranking
src/hub/feedback.js      write-only feedback insert (anon key, no reads)
src/hub/store.js         safe localStorage helpers
src/daily.js             daily rotation, snapshot adapters, streak counting
src/games/catalog.js     ORDER, META, EXTERNS, NEW_GAMES + the on-demand document loader
src/games/score-rules.json  what each game's score means on the shared board (label, better, max)
src/games/content/*.html one file per game — the game's entire source, and the payload
src/games/arcade.js      2048, Memory, Connect Four, Aim Lab — native JS, no payload
src/games/discovery.js   session estimates, controls, collections, previews
tests/serve.cjs          loopback static server the browser suites load through
tests/bored.test.cjs     node:test suite, runs src/ as the site in Chrome
tests/discovery.test.cjs discovery, layout and mock-account flows
tests/visual.test.cjs    release captures and the live F-14 embed (needs internet)
.github/workflows/deploy.yml  test, then publish src/ as the Pages artifact
scripts/games.mjs        add a game / sync the shared board's rule list
scripts/capture-previews.mjs  re-shoot the library previews in Chrome
scripts/optimize-previews.py  resize them: fill landscape cards, keep portrait boards whole
scripts/setup-feedback.mjs    create the feedback table (scripts/feedback-setup.sql)
scripts/player-state.sql     create the per-account player_state table (SQL editor)
```

The homepage order is fixed in `src/index.html`: daily, Jump Back In, leaderboard, library.
The shelf is one row of four cards shared by recent games and favorites. `PICKS` and the
"Worth Trying" section are gone; do not bring back a second editorial shelf.

Feedback posts through `src/hub/feedback.js` with the publishable key. The `feedback` table is
insert-only for that key (`npm run feedback:setup`), so the page can send a note and never read
one; check the table in the Supabase dashboard.

## Build and verify

```bash
npm ci                     # once
npm run dev                # the site at http://localhost:3000, live from src/
npm run games:check        # validate every catalog entry, score rule, preview and hook
npm test                   # contracts + game, discovery and layout suites; needs CHROME_PATH
```

There is no build. `.github/workflows/deploy.yml` uploads `src/` as the GitHub Pages artifact and
deploys it, so every push to `main` publishes exactly the files that are in the repo — no generated
`index.html`, no commit back to the branch. Paths in `src/index.html` are relative (`./main.js`,
`./styles.css`) because the site is served under `/bored/`; a root-absolute path would 404 there.
The test suite serves `src/` through a loopback server in headless Chrome (set `CHROME_PATH` if it is
not found) and takes about a minute; run it before committing anything that touches a game.

GitHub Pages is set to **Settings → Pages → Source: GitHub Actions**, which is what lets the
workflow publish `src/`; a branch deploy can only serve the repo root or `/docs`. There is no
top-level `index.html` — the deployed root is `src/index.html` itself.

## Working with several agents

This repo is edited by several agents at once, so these are the rules that keep them from breaking
each other. They are not style preferences; each one has already caused a live regression.

- **`hasIdentity()`, never `getSession()`, decides what the interface says.** There are no
  anonymous accounts — a guest stays a guest until they sign in or create one — and any UI that
  would read "signed in" (the account strip, the board's "(you)") asks `hasIdentity()`, while
  transport keeps using `getSession()`. A guest's best is offered back to them on the hub, so
  don't make guest scores post, sync or announce themselves before there is an account.
- **There is no generated file.** The arcade is `src/index.html` and the modules beside it; edit
them directly and push. Nothing rebuilds, re-encodes or copies a page behind your back.
- **Push ships.** GitHub Pages deploys the committed `src/` folder, so a merge to `main` goes live
  as soon as the workflow finishes. Test before pushing, not after.
- **The slug is a primary key.** Use `npm run games:add` to create it: this scaffolds the document,
  preview, catalog, discovery metadata, snapshot score capture, and score rule together.
  `npm run games:check` now fails if any of those pieces drift; `npm run games:register`
  still checks which database rule rows need to be inserted.
- **The suite reads source text.** `tests/bored.test.cjs` slices `function name(…)` bodies out of the
  real files and runs them in a VM. Keep any tested function self-contained: a module-level constant
  beside it does not exist in that context. Counts come from the catalog — never hardcode them.
- **Two lists, two jobs.** `NEW_GAMES` is the games built into `arcade.js` (native HTML, not decoded
  from a payload). `FRESH_GAMES` is the NEW badge: newest first, four at most. A new game goes on the
  front of `FRESH_GAMES`, the oldest falls off, and the shelf lists badge members first. The
  `games:add` script maintains both plus `ORDER`/`META`.
- **One shared daily seed.** The hub injects `window.__boredSeed = { date, seed, code }` into every
  game document (`injectSeed` in `main.js`); `date` is the Detroit day, `seed` is `seedNumber(date)`
  from `src/daily.js`. Anything that generates a board should seed itself from it so the **first** run
  of the day is the same for everyone, and cut a fresh random one afterwards (DEEP does this, with
  `deep.dailyPlayed` marking the day). Never replace a game's whole document with `replace('</body>')`
  — inject at the last closing tag, because games contain that text as data.
- **A score must be capturable.** `recordBest` ignores zero and unfinished runs. DEEP uses
  `Math.max(1, earnedProgress)` on finished attempts to preserve a positive first-floor score
  without rewarding idle turns or backtracking. Any new scored game needs a positive, meaningful
  first-action metric or an explicit minimum on completed attempts; do not award points for waiting.
- **Secrets and deploys.** `.env.local` holds the Supabase service key (full write). It is git-ignored
  — never commit it, never print it. Push to `main` deploys; never force-push.

## Adding a game

Scaffold it in one command:

```bash
npm run games:add -- <slug> "<Name>" "<Category>" "<blurb>" [--unit points] [--lower] [--metric field]
```

It writes a playable starter, adds the slug to `ORDER` and `META`, records its metadata and score rule, installs the high-score capture spec automatically, and creates
an SVG preview placeholder. Daily challenges remain opt-in because their goals need deliberate design. Then:

```bash
npm run games:check           # mandatory offline contract validation
npm run games:register        # give the shared board its score_rules row (--apply needs a key)
npm test
```

The suite derives its counts from the catalog, so adding games does not mean editing test
assertions. What it still insists on:

1. `src/games/content/<slug>.html`. It must be a complete document that works alone in a
   browser and is fetched into an iframe, so:
   - **Network calls are allowed where the game needs one, and only there.** A game may call a
     public, key-less API when the answer has to come from outside the document (Wordle asks
     `api.dictionaryapi.dev` about a word its bundled list has never seen). The game must still
     play with the call blocked: bundle the data that matters, treat a failed, slow or erroring
     request as "no answer" instead of a lost turn, and never let a request decide a score. No
     CDNs, webfonts, remote images, analytics, trackers, or API keys — only inline CSS/JS, canvas,
     or emoji/text plus the endpoints the game declares. Every endpoint goes in `GAME_APIS` in
     `tests/bored.test.cjs`; anything else off-site still fails the suite. The hub itself stays
     offline and needs a connection only to download a game document the first time its card is
     opened.
   - No `localStorage`/`sessionStorage` unless wrapped in try/catch (embedded contexts throw).
     Key it under `bored.<slug>.…`. Persistence is optional; the hub owns real scores.
   - Fold on its own: no fixed width over ~360px, no page scroll that hides the board, and
     `touch-action`/pointer events that work for touch as well as mouse. Keyboard input is a nice
     to have; a mouse-only game is fine.
   - `<title>` is the display name.
2. Registered in `src/games/catalog.js` — the script does this (ORDER, META and the NEW badge in
   `FRESH_GAMES`, which keeps only the four newest); off-site games go in `EXTERNS` instead and need
   no content file.
3. A row in `score_rules` on the shared board, which `npm run games:register` adds for you (or
   prints as SQL if you would rather paste it — the publishable key cannot write rules).
4. There is nothing to build: the game document is served from `src/games/content/` and the suite
   reads the catalog itself. Run `npm test`.

## Hook 1 — snapshot (required by everything else)

Every game exposes one global, injected at the end of load by `installDailyAdapter`:

```js
window.__boredSnapshot = () => ({ slug: 'mygame', /* metrics */ });
```

The hub reads it through the iframe (`frame.contentWindow.__boredSnapshot()`) to award high
scores, rank the leaderboard and check the daily challenge. Rules:

- Include `slug` exactly matching the file name and `catalog.js` key.
- Metrics are integers. Count something a player can be proud of — apples eaten, lines cleared,
  rounds won — not a raw internal.
- Return the *current* state; the hub decides when to capture. Never return `null` or throw;
  before the run starts return zeroed metrics.
- Booleans are allowed and are used as qualifiers (`won`, `cpu`, `finished`, `standard`,
  `hints`, `solved`, `undoUsed`, `handOver`, `pairs`, `accuracy`).

Add the adapter to `DAILY_ADAPTERS` in `src/daily.js`. Prefer an `expression` — a JS object
literal over in-scope game variables:

```js
'mygame': { expression: '({points:score,wave:lv,finished:over})' }
```

`expression` runs inside the game's own scope, so it can name locals (`score`, `lv`, `game`) but
not anything the game keeps inside a closure or a class. If the values are only reachable inside
a function, use `{ closure: true, expression: '…' }` when they are globals on the window, or give
the game a small accessor of its own (e.g. `__test` in 8-ball, `__boredSnapshot` written by hand)
and set `setup` for any scaffolding. If the game writes `window.__boredSnapshot` itself (as
`lights-out` does), leave `DAILY_ADAPTERS` alone — an entry there would inject a second copy and
throw when the injection point is not a closure. A game with neither will look broken in the
daily feature.

## Hook 2 — high score

In `src/hub/scores.js`, `HIGH_SCORE_GAMES`:

```js
highScore('mygame', 'My Game', 'points', { metric: 'points' }),
```

Arguments are `(id, display name, unit, options)`. Options:

- `metric` — the snapshot field to rank on.
- `lower: true` — smaller is better (Wordle guesses, Minesweeper seconds).
- `when: snapshot => …` — only capture when this passes; use it so partial runs never score
  (e.g. `snapshot => snapshot.handOver === true`).
- `transform: snapshot => …` — derive the number when it is not a plain field (8-ball counts
  potted balls).

Best values are cached locally (`bored.high.<id>`) and pushed to the `scores` table for signed-in
players. Games in that list rank on the shared board, so the id must match the snapshot
`slug` and the catalog key. `scores.game` is a foreign key to `score_rules.game`, so a game only
posts once it has a rule row: keep `src/games/score-rules.json` in step with the specs and run
`npm run games:register` after adding games. A game with no row never posts — every game gets its
own board, nothing shares one.

## Hook 3 — daily challenge

Add to `CHALLENGES` in `src/daily.js`:

```js
{ slug: 'mygame', label: 'Short title', goal: 'Reach {target} points in one run.',
  metric: 'points', targets: [10, 20, 30], unit: 'points' }
```

`{target}` is replaced from `targets` in a 3-step rotation, one challenge per calendar day across
the whole list, so adding an entry reshuffles the schedule — that is expected. Use `rule` when
the goal needs a qualifier the plain metric cannot express (`cpu`, `merge`, `mines`, `aim`,
`poker`, `connect`, `memory`, `word`, `sand`, `eco`); each rule lives in `dailyCheck` and reads a
snapshot boolean. Adding a new rule means a new `case` there plus a snapshot field that proves it.

## Accounts and scores (hub-owned — mostly nothing for a game to do)

`main.js` handles sign-in, profiles, and the `scores` table. A game's only obligations are the
snapshot contract above and not swallowing the iframe's errors. Do not add accounts, network
calls that duplicate the hub's, or your own scoreboard to a game; it will be duplicated and will
not follow the player. A game that needs its own data from a public API is fine — see the network
rule under "Adding a game".

## How a game should look

The catalog is a joke arcade, not a product page. Games are small, plain, and readable, and the
chassis around them (header, cards, buttons, mono type) is deliberately quiet. Keep a game's
chrome equally quiet:

- Pick two or three colours and stay on them: a background, an ink, one accent. No gradients,
  glows, drop shadows on text, or neon-on-black "cyberpunk" palettes.
- System fonts only (`ui-monospace, SFMono-Regular, Menlo, monospace` for numbers/HUD, system sans
  elsewhere). No webfonts.
- Borders are 1px. Corners are small (2–6px) or square. Buttons look like labels, not pills.
- No emoji as UI, no starbursts, no "✨", no fake brand marks, no lorem-ipsum copy, no
  placeholder "Player" avatars.
- The HUD is a single line of small caps text: score, level, lives. Not a row of stat cards.
- Motion only where it carries meaning (a ball, a brick breaking). No entry animations, no
  pulsing "READY", no parallax.

If it reads like a generated landing page with a game attached, it is wrong. Aim for something
that looks like it was written by one person in an afternoon in 2009 and still works.

## Deploying

Push to `main`; the workflow deploys `src/` to Pages, so the shipped files are the committed ones.
Confirm the served copy matches the repo (compare a hash of `src/index.html`), that
`https://bassdrum4.github.io/bored/version.json` names the commit you pushed — the deploy
overwrites that file with `$GITHUB_SHA`, which is also the `?v=` stamp on game documents, so a
stale stamp means the deploy has not landed yet — and that the page still boots before calling it
done.

## Source boundaries

The main module coordinates player state and delegates rendering to `src/hub/*-view.js` and
`src/hub/*-ui.js`. Keep DOM selectors and storage keys literal when refactoring; never do blind
identifier replacement inside strings, CSS classes, or dataset properties. New games must pass
`npm run games:check` and the full browser suite. The scaffolder adds the high-score hook;
manual games must implement `window.__boredSnapshot()` with `{slug, metric, finished}` and a
matching score spec. `--no-score` explicitly records an intentionally unscored game.
