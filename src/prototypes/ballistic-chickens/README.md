# Ballistic Chickens — recovered source

The arcade game is a canvas port of **Ballistic Chickens** by `-ezbreez-`, Scratch
project [780035707](https://scratch.mit.edu/projects/780035707/) (the idea and the
original build are mrVoo's). It is not a Flash game: it is a Scratch 3 project, so
the "source" is the project itself — every script, costume and value is in
`project.json`, and nothing had to be decompiled.

## What is here

| file | what it is |
| --- | --- |
| `project.json` | the project's own sb3 JSON, byte-for-byte as Scratch serves it (576 KB) |
| `extract.mjs` | rewrites the shop and obstacle tables in the game document from `project.json` |

```
node src/prototypes/ballistic-chickens/extract.mjs --check   # verify the tables
node src/prototypes/ballistic-chickens/extract.mjs           # rewrite them
```

`--check` is the one to run when the game's data is edited by hand: it fails if the
`UPGRADES` or `OBSTACLES` table in `src/games/content/ballistic-chickens.html` no
longer matches the project's `upgrades` and `Obstacles` lists.

### Refreshing project.json

Scratch serves a project's JSON only with a project token, which TurboWarp's
trampoline API hands out:

```bash
TOKEN=$(curl -s https://trampoline.turbowarp.org/api/projects/780035707 \
  | python3 -c 'import json,sys;print(json.load(sys.stdin)["project_token"])')
curl -s "https://projects.scratch.mit.edu/780035707?token=$TOKEN" \
  -o src/prototypes/ballistic-chickens/project.json
```

## What the port keeps

Everything that decides how the game plays came from the project, not from taste:

- **Physics** — gravity 500 px/s², launch velocity `#launchPower` (100) along the
  cannon's angle, rocket thrust `#RocketPower` (600) while held, fuel 10 burning at
  25/s, drag 1/s applied to forward speed, ground at y = -120 with bounciness 0.5.
  A landing under 5 px/s stops the chicken and ends the run; a faster one bounces.
- **Camera** — lead 150 px plus a tenth of forward speed, follow factor `dt/0.1`,
  never below y = -20, so the horizon does not slide off the top.
- **The shop** — six upgrades, each with its own cost multiplier and per-level
  delta, straight out of the `upgrades` list: Launch Velocity (+25), Aerodynamics
  (-0.1 drag), Fuel Surplus (+5), Shock Absorber (+0.05 bounce), Chick-y Bank
  (+0.25 payout) and Rocket Science (+30 rocket). A purchase multiplies that
  upgrade's price, which is why the first is cheap and the tenth is not.
- **The obstacles** — fence, house, skyscraper, stadium and mountain at 480, 10 000,
  20 000, 40 000 and 100 000 px (4.8 m to 1 km), each with the project's hardness
  and payout. Hit one and the chicken is bounced back at a tenth of her speed; hit
  one faster than its hardness and it is flattened for cash instead.
- **The score** — 100 px per metre, and cash is
  `(distance + height + flattened loot) × payout`. The board ranks metres flown in
  a finished run, so a run that is still in the air scores nothing.

## What the port rebuilds

- **Art.** The project's 215 costume and sound assets are not shipped; the chicken,
  cannon, ground, obstacles, fuel bar and shop are drawn with canvas primitives in
  the arcade's own three-colour palette. The shapes follow the costumes (a low
  fence, a gabled house, a windowed tower, a stand and a peak) closely enough that
  the runs read the same.
- **Sound.** None. The project's wind loop and rocket roar are its own audio files.
- **The Scratch runtime.** No `sb3` is loaded at play time; the game is a plain
  document the hub can fetch.

## Saves

- `bored.ballistic-chickens.progress` — cash, the six upgrade levels and the best
  distance, written on every purchase and at the end of a run.
- `bored.resume.ballistic-chickens` — the hub's own resume helper, fed while the
  chicken is in the air so closing the tab offers "Continue — 12 m · 6 fuel".
- The project's own "save code" (Home → Save/Load) is not ported: the progress key
  does the same job locally, and the hub syncs real scores.
