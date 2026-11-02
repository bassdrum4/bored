# Pastel Tanks (tank2) rework — design plan

Status: draft for review. Nothing is implemented yet.

## Why rebuild

The game today is a 533-line turn-based artillery duel: Lavender vs Mint, local
2-player or AI, five seeded terrains, seven powerups, destructible hills. The
core loop is fine; what is thin is everything around it — the AI wins or loses
on random error rather than thought, wind is absent so every long shot is
arithmetic, movement is a fuel meter with no texture, the weapon list is
unbalanced (the nuke ends games at 5% drop weight), and phones cannot play it
at all. A rebuild buys the deterministic engine a fresh rules version so all of
this can change together, instead of being patched one bad balance decision at
a time.

## What has to stay true

- **The slug stays `tank2`.** Same catalog entry, same leaderboards, same save
  key, same preview pipeline. The game is "Pastel Tanks", not a new listing.
- **Solo scoring contract unchanged.** The snapshot keeps `{ won, cpu,
  started }` (internal names will move, the daily adapter in `daily.js` gets
  rewritten alongside), so the shared board's rule row and the daily challenge
  "Ballistic victory" keep working without player-visible changes.
- **Quiet pastel presentation.** Repo style rules: 2–3 colours plus accents,
  1px borders, no neon, HUD on one line, motion only where it carries meaning.
- **Offline is complete.** The document works alone in a frame: folds at any
  width, no fixed >360px layout, keyboard *and* touch.

## Consequence that needs a sign-off

Bored Together rules move from `rulesVersion: 1` to `2`. A stored match saves
the version it was created with, and a joiner on v2 refuses v1
("This game version is not available yet."). Old half-finished v1 matches will
therefore no longer continue — they just sit there. Nothing needs to run
server-side; the version number does the migration. If that is not acceptable,
the alternative is keeping v1 and shipping the rebuild offline-only, which
fragments rules between modes; I do not recommend it.

## Rules engine v2 (`src/games/tank-engine.js`)

The engine stays rules-as-data and stays 100% deterministic (seeded RNG, no
clock, no DOM, no `Math.random`). `RULES` exports 2. The current file is the
template for the shape, not the bloat:

- **Wind.** Every turn gets a crosswind derived from `seed + turnIndex` (a
  value pair: direction and strength, roughly ±3.5 horizontal acceleration at
  the extreme). It is computed, never transported. Artillery arcs, slow shots
  and mines all read it, so one number changes every decision.
- **Turn structure.** Move (uphill costs more fuel, downhill costs less) → aim
  → weapon → fire. One action-set per turn, same as today, plus wind drift and
  a power meter (hold-to-charge) instead of raw angle/power numbers.
- **Weapons v2.** Standard (free), Heavy, Cluster (3 bomblets on impact),
  Mine (drops on landing, detonates 2 turns later on proximity), Dig (carves
  a vertical tunnel through hills), Shield (absorbs the next hit's *damage*
  but not the crater), Heal drops stay as powerups, not weapons. The Nuke is
  cut entirely; cluster + mines give the finisher drama without the "you just
  lose" moment.
- **Powerups.** Spawn timing and ground positions stay seeded functions of the
  shot index, same as v1, so both clients can replay. Shield and Fuel reworked
  to match the new weapon set; Teleport kept (it is the most asymmetric fun).
- **Craters and collapse.** Same crater carving, plus a small "crumble" step so
  tall crater lips slump after a few turns — purely height-field math, still
  column-comparable.

## The document (`src/games/content/tank2.html`)

Rewritten around the same canvas, pastel palette kept and cleaned:

- **Input.** Keyboard as today, documented in a fold. Touch: drag on the
  canvas to aim (angle + power from drag vector), weapon chips along the
  bottom, one big Fire button; works held in one hand in portrait and landscape.
- **HUD.** One line: HP pips, wind flag, weapon, fuel. No stat rows.
- **Turn flow UI.** Visible wind flag (animated flag on a pole, only motion
  tied to meaning), firing power meter as a hold-charge bar, small trajectory
  ghost for the previous shot so players learn the wind by seeing it.
- **AI vs 2 players** selection stays on a plain menu; local 2P unchanged in
  feel, better in pace.

## The AI

- Candidate simulation: sample a grid of (angle × power × weapon × optional
  move) states through the engine in advance, score each outcome (enemy HP
  delta, self-damage, crater cover, fuel/economy, shield pickups within
  reach), pick the best, then inject a **small** aim error scaled by
  difficulty — difficulty comes from judgement quality and aggression
  (shooting vs repositioning vs waiting for a mine), not from randomness.
- Caped to stay cheap: ~10–24 candidates with the engine's own `advance`, no
  full search. Runs inside the turn timeout.
- Offline difficulty names stay Easy/Medium/Hard with the same effect.

## Bored Together wiring

- `together-player.js` adapter: `rulesVersion: 2`, action stays `move`, payload
  becomes `{ seat, x?, angle, power, weapon, move? }` — the move legs optional,
  absent means "did not move".
- `catalog.js` TOGETHER_GAMES bumped to 2; match replays use seed + shot list
  through the engine exactly as today. Both clients still recompute damage
  locally; shots now include the weapon the player fired at that moment.
- v1 legacy: see the consequence section above.

## Files touched

| File | Change |
| --- | --- |
| `src/games/content/tank2.html` | Full rewrite (canvas, input, HUD, touch, AI host, document) |
| `src/games/tank-engine.js` | Full rewrite as rules v2 (`RULES = 2`), wind, weapons, mine timers, shield, crater crumble |
| `src/games/catalog.js` | TOGETHER rulesVersion 1 → 2 |
| `src/hub/together-player.js` | Adapter payload/rulesVersion 2, engine unchanged in role |
| `src/daily.js` | tank2 daily adapter rewritten for the renamed internals; challenge text unchanged |
| `tests/tank-engine.test.cjs` | Rewritten for v2 plus terrain-mirror, wind determinism, mine/shield rules |
| `tests/bored.test.cjs` | tank2 snippets updated only where they read the old file |
| `src/games/previews/tank2.svg` | Regenerate after visuals land |

## Test plan

1. Engine: terrain-mirror test keeps its shape (every column of every layout,
   engine vs document); new tests for wind being a pure function of seed+turn,
   mine Timers, shield absorption (damage blocked, crater still carved),
   crumble settling to 0 height change after two settle steps, and two-clients
   replay equality given the same seed + shot list.
2. AI: property test — on the flat-ish layouts the AI must land ≥1 direct hit
   within 20 turns at Hard; no crash and a valid shot under every difficulty.
3. Browser: solo, local 2P, and the together mock flow; touch handlers get a
   static-source test (pointer events present, no mouse-only assumptions);
   games:check at the end.

## Build order (each milestone is verifiable on its own)

1. **Engine v2** — rules, wind, weapons, mines, crumble, deterministic tests.
2. **Document** — canvas, pastel HUD, fire meter, fold for keyboard hints.
3. **Input** — keyboard + pointer/touch aiming, weapon chips, fire button.
4. **AI** — candidate simulator + difficulty tuning.
5. **Together bump + tests**, preview capture, `npm test`, deploy verify.

Rough size: engine ~500 lines, document ~800 lines, tests ~200. One big-file
rewrite, five milestones, each committed separately once it passes its checks.

## As-built (2026-11-02)

Shipped as one commit rather than five milestones. Deviations worth knowing:

- Engine landed at 601 lines with the ring-road model as planned, plus one
  behavior the plan did not spell out: a direct hull hit damages the tank but
  does **not** carve the wall beneath it (the hull sits 13px off the surface and
  the standard burst radius is 10px). Undermining a tank requires aimed ground
  shots (standard/ricochet), a heavy shell or a mine — the dump-out moves the
  plan describes all still work; mines and ricochet remain pickups-only.
- The document, ~1080 lines, keeps the planned choreography and theme but adds
  two contracts the plan omitted: `window.__test.state()` returns the merged
  `{mode, turn, power, online, seed, shots, hp}` view the Together browser suite
  replays through, and `__test.aim(angle, power)` aims the current seat's two
  vars (the browser suite calls it with two arguments). A zero-hold Space tap
  fires at exactly the aimed power; holding charges beyond it.
- The doc imports the engine from the hub when embedded (about:srcdoc cannot
  resolve `../tank-engine.js`); standalone falls back to its own path.
- Together shoots `{seat, drive, angle, power, weapon}` with a separate `won`
  verdict carrying the **winner seat** (1/2/null), not a boolean — this lets a
  mutual kill finish the match for the surviving seat. The v2 migration stamps
  `rules_version=2` on every new tank2 match via BEFORE INSERT trigger; v1
  matches keep their stored branch but the hub reports them unavailable.
- Old wind-free aim grid in the Together browser test widened to a full
  5–85 × 1–24 scan with `drive: 0`; the v1 fixed-positions grid could not
  guarantee a hit under v2 wind.
- Tests: tests/tank-engine.test.cjs (12 checks, ring geometry, determinism,
  validateShot bounds, direct hit + guide parity, self-hole fall choreography,
  powerup stream, mine plants, ricochet bounces, winner consistency, opening
  state) and the updated Together suites; PGlite runs the v2 migration end to
  end. Pre-existing sandbox failures unrelated to this change (Google Fonts and
  favicon aborts in embedded tests, Aim Lab flake) were confirmed pre-existing
  by stashing and re-running at the base commit.
- Library preview regenerated from the standalone document; the hub-driven
  capture-previews path still hangs headless Chromes in this sandbox, so the
  capture script (scripts/capture-previews.mjs, keypress `1`) remains the
  canonical flow for environments where the hub loads.
