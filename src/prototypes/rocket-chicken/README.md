# Rocket Chicken — decompiled, readable source

Dugh (code) and Skrupsakken (art) built Rocket Chicken as a Flash game, and this
folder is that game taken apart. The arcade copy in
`src/games/content/rocket-chicken.html` is a JavaScript port of the ActionScript
here, not a wrapper around a plugin: the flight model, the pickups, the
obstacles, the shop ladder and the distance thresholds all come out of
`source/as3/main.as` line for line.

## What is here

| Path | What it is |
| --- | --- |
| `source/rocket-chicken.swf` | **The original.** 2.6 MB, uncompressed (`FWS`), SWF 10, one `DoABC` block of 178 KB and the game's art, sound and fonts. SHA-256 `5eaae3704218b80eca853288e584b3461b1657ccb78ed3d6b970f20d24d115f6`, the copy served at `https://xogx.b-cdn.net/fg/games/rocket-chicken.swf` from the funny-games.biz page. |
| `source/as3/main.as` | **The game.** 3,743 lines: the kick, the glide, gravity and drag, the rocket, the power-up table, obstacle damage, the cash chain, the 56-step unlock switch and the save slots. |
| `source/as3/*.as` | Every other script in the export (165 files): `Bird.as` (velocity, force 1.5), `Power.as`, `Item.as`, `globalVars.as` (the item name lists), the Newgrounds API and the Flash UI components the menu used. |
| `source/as3/RocketChicken_fla/*.as` | The timeline classes. `chicken_helmets_68.as`, `chicken_belt_65.as` and `items_31.as` are where the shop's prices, fuel, power, weight, mood and protection live — one `frameN` function per item. |
| `extract.mjs` | Rebuilds the game document's data block from those timeline classes: 72 helmets, 33 belts, 18 rockets and the 55 unlock steps. `--check` verifies the document still matches. |
| `README.md` | This file. |

## Recover the source again

```bash
# JPEXS FFDec (needs Java; any recent JDK works)
curl -L -o ffdec.zip https://github.com/jindrapetrik/jpexs-decompiler/releases/download/version26.5.0/ffdec_26.5.0.zip
unzip ffdec.zip -d ffdec
java -jar ffdec/ffdec.jar -export script source/as3 source/rocket-chicken.swf
```

FFDec writes one `.as` per class, each timeline class already carrying its
frame scripts. Art and audio export the same way (`-export sprite`, `-export
shape`, `-export sound`, `-export font`); those exports are **not** vendored,
because the port redraws the shapes in canvas rather than shipping extracted
frames. They are still the reference if you want to match the art more closely.

## Edit and play it

```bash
# 1. change the data or the game document
node src/prototypes/rocket-chicken/extract.mjs          # after editing source/as3/
npm run dev                                             # then open /games/content/rocket-chicken.html
node src/prototypes/rocket-chicken/extract.mjs --check  # verify the data block
```

The document is a single file on purpose: the hub fetches it as `srcdoc`, so it
may not load sibling files. Everything it needs is inline.

## What the port keeps, and what it does not

Kept exactly:

- **Flight.** Gravity 0.45, speed cap 150, `vx -= vx * 0.00394` in the air,
  rocket thrust `intensitet * 0.0148` applied as `cos/sin` of the heading, the
  `weight * 0.004` term, the ±80 px/frame vertical clamp, and the ground bounce
  (`vx -= vx * cos(atan) * 0.24`, `vy = -vy * 0.325`) from `updateBird()`.
- **Distance.** `distance += vx * 0.0035` per 30 fps frame — the feet on the HUD
  and the high-score metric.
- **Pickups.** The eight `POWER_TABLE` entries and their cash, fuel, energy and
  velocity changes; the chain multiplier from `addCash()` (`× 0.75` per
  consecutive pickup, reset after 50 frames).
- **Obstacles.** `vy += 40 / (protect * 1.3)`, `vx *= 0.6 * slow`, paralysed
  frames, hurt flash and the energy/fuel cost, all scaled by `protect`.
- **The bird you build.** `maxEnergy = 50 + mood * 2.8`, `maxFuel = fuel * 1.3`,
  `protect = 1 + (helmet.prot + belt.prot) * 0.065`, `weight = (belt.weight +
  rocket.weight) * 0.8`, and the four kick tiers (3, 3.8, 4.5, 5.6) handed out
  after 5, 13 and 26 runs.
- **The ladder.** Every unlock step and the item it reveals, at the original
  distances (250 ft to 6400 ft).

Reconstructed, because the number is not in the recovered code:

- **Kick strength.** `main.as` reads the boot's stored bar height
  (`bar.blip.height`), a timeline value; the port stands 120 in for it, giving a
  46 px/frame launch at the starter boot.
- **Rocket stats order.** Helmets and belts map frame-for-frame onto their name
  lists; rockets are one symbol per rocket, so their priced frames are sorted by
  price and paired with `trocket` in purchase order.
- **Art.** Redrawn in canvas in the original's flat cream/ink/rust palette. The
  vector shapes themselves are still in the SWF.

Not carried over: the Newgrounds scoreboard and medals, the three
`SharedObject` save slots, the pause-screen screenshot and the external links.
Bored owns scores now, and the run in progress is saved with the hub's resume
helper (`bored.resume.rocket-chicken`) instead of a Flash shared object.
