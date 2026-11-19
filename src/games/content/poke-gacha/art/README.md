# Poké Gacha art

Made with `scripts/gacha-art.py` from the owner's uploads. Every file is native pixel
art; the page only shows it at whole-number scales (`image-rendering: pixelated`).

| File | Size | From | Shown at |
|---|---|---|---|
| `egg-0.png` … `egg-3.png` | 31×33 | the owner's eggs: white Common, blue Rare, black Epic, purple Legendary (and the banner) | 1x in lists and the dome, 2x hatching, 3x on the Eggs screen |
| `coin.png` | 17×18 | the owner's coin, resampled once from its 88×96 copy to the shard's size (it is smooth-shaded, not hard pixels) | 1x |
| `ticket-regular.png`, `ticket-plus.png`, `ticket-premium.png`, `ticket-gold.png` | 21×17 | the owner's vouchers, worst to best: green, blue, purple, gold; brought back from 50×40 stretches | 1x in lists, 2x in the shop |
| `shard.png` | 17×18 | the owner's blue shard | 1x |
| `machine-move.png`, `machine-legend.png`, `machine-shiny.png` | 106×129 | the owner's gacha machine (`egg_machine_red_blank.png`), brought back to its native size and recoloured per machine: grey Move UP, red Legendary UP, yellow Shiny UP. Only Legendary UP keeps the crown and the timer pill; the page draws the other emblems, the plate words and the timer in its own pixel letters | 2x on the Pull screen |
| `icons.webp`, `icons-shiny.webp` | 1280×990 | PokéRogue's 40×30 mini sprites for species 1–1025, 32 a row, default form where a species only has forms | 1x in the Dex, 2x in the banner window |

The upload's 132×142 "big" eggs are stretched copies of the small ones, so they are
not used: the page scales the originals by whole numbers instead. The
500×609 machine is the 106×129 drawing stretched about 4.72x; the script takes each
native pixel back as the most common colour in its cell.

## Battle animations (`../anim/`)

`anim/<num>.webp` and `anim/s<num>.webp` (shiny) are PokéRogue's animated front sprites,
turned from GIFs into one horizontal strip of frames each by `scripts/gacha-anim.py`
(`python3 -I scripts/gacha-anim.py <gif dir> <out dir> 24`). A canvas only ever shows a
GIF's first frame, so the page draws one cell of the strip per tick instead. Every strip
is cropped to the box all of its frames share, so the feet stay put from frame to frame.
`anim/index.json` maps `"<num>"` / `"s<num>"` to `[frame width, height, frames, ms per frame]`;
frame times are clamped to 80–300 ms. Species or looks without a strip (SP skins, forms)
use the still sprite as before.

Sprites are PokéRogue's (pagefaultgames/pokerogue), from Pokémon by Nintendo / Game Freak;
they are not ours to license.

The blocked-foe marker is the owner's 6×10 shield sprite (`shield_1x.png`), embedded in
`poke-gacha.html` as a data URL and drawn 1x across and 2x tall (6×20: the old stop bar's
width and about its 18px height) with smoothing off, centred where the bar was.

## Attack effects (`attacks.webp`)

One 512×574 lossless WebP (28 KB) packs 53 short effects cut from the owner's
`effect_graphics` pack (PokéRogue's battle-animation sheets: 96px cells, five across).
Each effect is a few cells of one sheet, cropped to the box they share, laid out as a
horizontal strip. The page holds their index (`FX_ATLAS` in `poke-gacha.html`:
`[x, y, frame w, h, frames, ms per frame, anchor x, anchor y]`) and draws them at 1x with
smoothing off. Hits and bursts take 3 to 6 frames, always under 300 ms; projectiles loop
their frames while they fly.

| Role | Used for | Sheets |
|---|---|---|
| `slash:<Type>` | melee units (blockers, guards, vanguards) | PRAS- Slash, Razor Shell, Grass, Elemental Fangs, Ice, Strike, Poison Jab, Earth Power, Megahorn, Rock Smash, Shadow Claw, Dragon Claw, Bite; Aerial Ace; Psycho Cut |
| `shot:<Type>` | snipers' and casters' projectiles | PRAS- Swift, Fire, Water, Grass, Electro Ball, Ice, Aura Sphere, Sludge Bomb, Mud Shot, Air Cutter, Psybeam, Rock, Dark Pulse, Dragon Pulse, Flash Cannon, Moonblast |
| `burst:<Type>` | casters' hits | PRAS- Explosions, Fire, Water, Energy Ball, Electric, Ice, Strike, Poison, Earth Power, Twister, Psystrike, Bug Buzz, Rock, Shadow Ball, Dragon Pulse, Night Daze, Magnet bomb |
| `heal` | medics | PRAS- Recovery |

A role with no entry (a Bug shot, a Fairy burst), or a sheet that has not loaded, uses the
page's own drawn effect in the attacker's type colour. The source sheet and cells of each entry
are listed in the PR that added them.

Credit: the effect sheets are PokéRogue's (pagefaultgames/pokerogue); most (the `PRAS-`,
`GEN8-` and `Majesty -` sheets) come from the Pokémon Essentials fan community, and the pack
names no author for them. Its `scratchbattle` sheet credits NoLeafClover0987 ("Ripped and
Composed By"); that sheet is not used here. The moves are from Pokémon by Nintendo / Game Freak.
