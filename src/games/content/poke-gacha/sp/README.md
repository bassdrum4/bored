# Poké Gacha SP skins

Vettel's hand-drawn skins, handed over on the `sp-skins-incoming` branch (`incoming/sp-skins/`,
which stays unmerged). The uploads are 96×96 drawings at 3x (288×288); `scripts/sp-skins-1x.py`
takes each native pixel back as the most common colour of its 3×3 block, on whichever grid
offset the drawing sits (Charizard, Gastly and Haunter are shifted by a pixel or two). Every
file here is 96×96, like the other sprites, and only shown at whole-number scales.

`skins.json` lists them: `{ id, name, species, forms? }`. A skin is owned per evolution line.
Without `forms` it shows on `species` alone; with it, it is a set that shows on every form listed.
The art for each form is `<id>-<species>.png` (see `skinFile` in `src/hub/gacha.js`).

| Skin | Shows on | Shards |
|---|---|---|
| Single skins (23) | the form it was drawn for: Butterfree, Charizard, Venusaur, Blastoise, Venomoth, Arcanine, Golem, Slowpoke, Dewgong, Magikarp, Eevee, Espeon, Umbreon, Dragonite, Articuno, Zapdos, Moltres, Mewtwo, Mew, Meganium, Typhlosion, Feraligatr, Houndoom | 300 |
| Clefairy line, Chinchou line | Clefairy and Clefable; Chinchou and Lanturn | 400 |
| Pidgey line, Machop line, Gastly line | all three forms | 500 |

Eevee, Espeon and Umbreon are three separate skins of the Eevee line. The Eevee drawing is marked
"unconfirmed" in the hand-over README. Mew is listed, but its line is not in the eggs yet, so its
skin is not on sale and cannot roll.
