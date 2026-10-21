# Working in this repo

Bored is a single-page arcade. One `index.html` is built from `src/` and served by GitHub Pages;
every game is a self-contained HTML document embedded in the bundle. There is no framework, no
router, no server. Read this before adding or editing a game — a game that misses these hooks
silently disappears from scores, the daily challenge, or the build.

```
src/main.js              hub wiring: library, player chrome, daily, leaderboard + account UI
src/hub/backend.js       Supabase request/session layer, score rules, auth helpers
src/hub/scores.js        score specs, best capture, sync, ranking
src/hub/store.js         safe localStorage helpers
src/daily.js             daily challenge rotation + snapshot adapters
src/games/catalog.js     ORDER (grid order), META (category, blurb), EXTERNS (off-site games)
src/games/score-rules.json  what each game's score means on the shared board (label, better, max)
src/games/content/*.html one file per game — the game's entire source
src/games/content/*.b64  generated payload, git-ignored — rebuild with npm run build
tests/bored.test.cjs     node:test suite, runs the real build output in Chrome
scripts/sync-games.mjs   html -> .b64
scripts/games.mjs        add a game / sync the shared board's rule list
scripts/verify-snapshot.cjs  sanity-checks every game's snapshot in a browser
```

## Build and verify

```bash
npm ci                     # once
npm run build              # inlines src/* into index.html (also runs sync-games)
node --test tests/bored.test.cjs
```

`npm run build` must be run and its `index.html` committed whenever a game changes — Pages serves
the built file, not `src/`. The `.b64` payloads it regenerates are git-ignored, so nothing else to stage. The test suite boots the build in headless Chrome (set
`CHROME_PATH` if it is not found) and takes about a minute; run it before committing anything that
touches a game.

## Working with several agents

This repo is edited by several agents at once, so these are the rules that keep them from breaking
each other. They are not style preferences; each one has already caused a live regression.

- **`index.html` is build output.** Never hand-edit it. Edit `src/`, run `npm run build`, commit the
  regenerated file. If two agents both rebuilt it, resolve the conflict by rerunning
  `npm run build` on the merged tree — never by hand-merging that diff.
- **Push ships.** GitHub Pages serves the committed bytes, so a `src/` change without a rebuild is
  invisible and a rebuild made before the suite is green goes live instantly. Test, build, push.
- **The slug is a primary key** repeated in six places: the content file, `catalog.js`, the snapshot,
  `HIGH_SCORE_GAMES`, `CHALLENGES`, and `score-rules.json` (plus the `score_rules` row). A typo in
  one place does not throw — the game silently drops out of scoring, the daily or the board.
  `npm run games:register` reports the drift; run it after touching the catalog.
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
- **A score must be capturable.** `recordBest` ignores zero and unfinished runs, so a game whose score
  can end at 0 never saves: DEEP adds `state.turns` to its score for exactly this reason. Any new
  scored game needs a metric that is positive from the first action.
- **Secrets and deploys.** `.env.local` holds the Supabase service key (full write). It is git-ignored
  — never commit it, never print it. Push to `main` deploys; never force-push.

## Adding a game

Scaffold it in one command:

```bash
npm run games:add -- <slug> "<Name>" "<Category>" "<blurb>" [--unit points] [--lower] [--metric field]
```

It writes a playable starter, adds the slug to `ORDER` and `META`, records what its score means
in `src/games/score-rules.json`, and prints the two snippets to paste (the high-score spec and the
optional daily challenge). Then:

```bash
npm run games:register        # give the shared board its score_rules row (--apply needs a key)
npm run build
node --test tests/bored.test.cjs
```

The suite derives its counts from the catalog, so adding games does not mean editing test
assertions. What it still insists on:

1. `src/games/content/<slug>.html`. It must be a complete document that works alone in a
   browser and is fetched into an iframe, so:
   - No external requests. No CDNs, fonts, images, or analytics — only inline CSS/JS, canvas,
     or emoji/text. The tests fail on off-site fetches, and the bundle is meant to work offline.
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
4. Run `npm run build` (regenerates `<slug>.html.b64` and inlines everything into `index.html`).

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
players. Games in that list appear in the leaderboard picker, so the id must match the snapshot
`slug` and the catalog key. `scores.game` is a foreign key to `score_rules.game`, so a game only
posts once it has a rule row: keep `src/games/score-rules.json` in step with the specs and run
`npm run games:register` after adding games. A game with no row is listed as *local only* in the
picker and never posts — every game gets its own board, nothing shares one.

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
calls, or your own scoreboard to a game; it will be duplicated and will not follow the player.

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

Push to `main` with the rebuilt `index.html`; Pages serves it. Confirm the shipped bytes match
the tested build (compare a hash of the served file) and that the page still boots before
calling it done.
