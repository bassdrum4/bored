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
