# Bored — single-file arcade

**[index.html](index.html)** is the entire playable site: **30 offline games and
3 online extras**, with no runtime dependencies, installs, server, or asset folder.
Double-click it to play, or serve it as a static page.

GitHub Pages address: **https://bassdrum4.github.io/bored/**.
Local changes appear there only after they are published.

## Find something to play

- Search game names, categories, and descriptions; press **/** to focus search.
- Filter by **New**, **Favorites**, **Arcade**, **Puzzle**, **Strategy**,
  **Sandbox**, or **Online**.
- Sort by the original order or A–Z.
- Star games to save favorites and revisit the last four recently played games.
- **Surprise me** chooses from the current results. Remote entries are excluded
  unless you deliberately select **Online**.
- **All games** returns to the library; **Esc** also works inside offline games.
  Remote pages run on another origin, so use **All games** when they have focus.
- Use **Restart** for a fresh game, or **Fullscreen** where the browser supports it.

Favorites, recent games, and best scores stay in your browser's local storage.
If storage is blocked, the games still work; progress may not persist.
The layout supports phones, touch controls in the new games, keyboard navigation,
visible focus states, and reduced-motion preferences.

## Daily challenge

The featured challenge rotates through **all 30 offline games**, with a distinct
goal for each game. Everyone gets the same game and target for a given UTC date;
after a full circuit, most targets change difficulty. Goals reset at **midnight
UTC**, including when the hub is left open. Normal gameplay randomness is unchanged:
this is a shared objective, not a promise of identical boards or enemy spawns.

Examples include clearing Tetris lines, completing Simon sequences (not merely
watching them), rescuing Lighthouse's three ships, beating the Connect Four
computer, clearing Minesweeper without hints, growing Eco's populations, and
building a multi-material Sand world. Each goal describes its rules before launch.

Use the **daily challenge button** to enter a tracked attempt. The player shows
live progress and automatically awards completion from current-run game state.
Regular launches and saved high scores do not count. Restart or retry freely;
a completed result remains saved for its date. Individual in-progress game runs
are not resumed after closing the player.

Use **Copy result** after completion to share the game, goal, date, and verified
result. If clipboard access is blocked, a selectable text box provides a fallback.
The challenge works offline. With storage blocked, completion survives within the
current page session but not a reload.

Verification runs locally in the browser. It prevents accidental completion and
checks the stated conditions; it is **not anti-cheat or a server-verified leaderboard**.
The three remote extras are excluded because the hub cannot inspect their
cross-origin game state (and Klang is a music player).

## New games (4)

| Game | How to play |
|---|---|
| **2048** | Merge equal tiles with arrow keys, WASD, swipes, or the on-screen arrows. Includes one-move undo and a saved best score. |
| **Memory** | Flip cards to find eight pairs. Tracks moves and your best completed game. Mouse, touch, Tab, and Enter work. |
| **Connect Four** | Connect four discs against a look-ahead computer opponent or a local friend. Choose a column with its button or keys 1–7. |
| **Aim Lab** | Hit targets in a 20-second challenge. Tracks hits, accuracy, and separate best scores for normal/small targets. |

These additions are readable JavaScript inside the deliverable. They need no
network requests, fonts, libraries, or other files.

## Original offline games (26)

Pulled from `https://sites.google.com/midlandps.org/vibecoding/`:

sumo, sand, lighthouse, poker, wordle, lava, volletball, solitaire, commanders, eco,
void-runner, qbert, simon, frogger, pac-man, snake, tank, space-invaders, pong,
asteroids, breakout, tetris, minesweeper, tank2, gun-mayhem, shadow-net

Everything needed by these games is inlined:

| Dependency | How it is handled |
|---|---|
| Original games | Original `data-code` source, base64-embedded |
| Google Fonts (20 games) | 88 `@font-face` rules with embedded woff2 data |
| three.js 0.176 (Lighthouse) | Inlined modules loaded via blob URLs, with a data-URI fallback |
| Font Awesome (shadow.net) | Subset to the four icons actually used |

Games run in separate `srcdoc` iframes, keeping their CSS and JavaScript isolated
from the hub. A storage shim in the original games provides an in-memory fallback
where needed on `file://`.

### Lighthouse fix

The original game declared `#fatal { display: grid }`, overriding its `hidden`
attribute and covering gameplay with the fatal overlay. The player now injects
`#fatal[hidden] { display: none !important }`. Actual fatal errors can still show
normally, and the original embedded source is preserved.

## Online extras (3)

These use an ordinary iframe pointing to their own servers and **require internet**:

- **F-14** → `https://spanish4.freebuff.app/` — flight simulator
- **DC** → `https://workbag.dpdns.org/` — remote class-site entry
- **Klang** → `https://youtubeplayer.freebuff.app/player` — music player;
  signed-out visitors may see its sign-in screen

Their availability, sign-in requirements, and framing policies belong to the
remote sites. They were not re-verified as part of the offline regression run.
The idle hub does not contact these servers.

The original **proxy** and **jellyfish** entries remain excluded because their
source could not be collected as self-contained pages.

## Verification

[tests/bored.test.cjs](tests/bored.test.cjs) uses Node's built-in test runner,
`puppeteer-core`, and an installed Chrome. No package is needed to **play** the site.
For testing, make `puppeteer-core` available in your Node environment and run from
the repository root:

```bash
node --test tests/bored.test.cjs
```

Set `CHROME_PATH` if Chrome is not installed in a standard location. The test
runner also accepts a cached browser from an existing `puppeteer` installation.

The suite covers JavaScript syntax, 2048 merge rules and undo, Connect Four wins
and computer tactics, actual browser gameplay, Memory completion and timer
cleanup, Aim Lab accuracy and expiration, search/filter/sort, saved favorites,
Escape and focus restoration, all 30 offline game boots, Lighthouse's overlay,
all 30 daily state adapters, per-game goal acceptance/rejection, real Memory
challenge completion, saved results, sharing with clipboard fallback, UTC rollover,
320px layouts, blocked storage, and zero external requests.

Verified locally: **17 tests passed, 0 failures**, all **30 offline games booted**,
**0 uncaught JavaScript errors**, and **0 external HTTP requests**.

## Maintenance

Edit [index.html](index.html) directly. Keep the game additions, hub behavior, and
embedded payloads in that single file; tests and this README are not runtime assets.

The author's ignored `_source/` and `_build/` folders contain the original game
sources, collector, cached dependencies, and older verification scripts. The
legacy `_build/build.py` generator predates the new hub and games: **running it
will overwrite these additions**. It is not the current site's build step.
