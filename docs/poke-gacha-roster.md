# Poké Gacha roster cut — draft for review

**Step 1 of 2. Nothing in the game changes yet.** This PR only adds this document. Once the list is OK'd, step 2 (the hub PR: pools, Dex, refunds, squads/presets, pity/banner) replaces it with the real change. Poké Idle is not touched and keeps all 1025 species.

**Proposed: 552 → 203 egg lines** (a line = one base form and everything it evolves into).

- Always in: all 27 starters, all 26 lines with an SP skin, all 10 pseudo-legendaries. Geodude, Pidgey and Audino stay too, since they're the starter gifts.
- Legendaries and mythicals: 89 → 37 (30 legendaries and 7 mythicals). The Legendary UP banner rotates through the 30 legendaries.
- The rest is fan favourites and lines that are strong in TD. *TD pick* marks 8 lines that are only in because the stage check needs them (see below).

## Lines per tier

| Tier | Egg odds | Now | Cut, current tier rule (4★ = final BST ≥ 500) | **Proposed** (4★ = final BST ≥ 505) |
|---|---|---|---|---|
| 3★ | 204/256 | 248 | 57 | **70** |
| 4★ | 44/256 | 161 | 61 | **48** |
| 5★ | 7/256 | 44 | 38 | **38** |
| 6★ | 1/256 | 99 | 47 | **47** |
| all | | 552 | 203 | **203** |

With the current tier rule, the cut leaves more 4★ lines than 3★ lines, which is upside down for the most common egg. Raising the 4★ cutoff from 500 to 505 final BST makes the 3★ pool the biggest again (70/48, close to today's 1.5:1). It moves these 13 lines to 3★: Psyduck, Abra, Ponyta, Grimer, Gastly, Scyther, Heracross, Houndour, Honedge, Hawlucha, Nacli, Mudbray, Minior. The odds, rarity pity (9/59/412) and dupe pity (9) stay as they are.

Collection pace (simulated with the real odds, rarity pity and dupe pity; share of each tier owned on average):

| Eggs pulled | Now 3★/4★/5★/6★ | Proposed 3★/4★/5★/6★ |
|---|---|---|
| 90 (about week 1) | 24% / 11% / 6% / 0% | 63% / 31% / 7% / 1% |
| 250 (about month 1) | 54% / 27% / 17% / 1% | 97% / 65% / 19% / 2% |
| 600 | 85% / 53% / 36% / 3% | 100% / 95% / 40% / 5% |
| 1500 | 100% / 86% / 67% / 7% | 100% / 100% / 73% / 14% |

So 3★ completes in about a month instead of about four, and after that commons become candy and shards. 5★ and 6★ still take a long time. If 3★ should last longer, that's a change to the odds and can be its own decision.

## The roster

Grouped by tier, then by the line's type (the base form's first type, the same type its skills come from). After each name is the TD class of the final form: Blk blocker, Grd guard, Snp sniper, Cst caster, Med medic.

### 6★ — 47 lines
- **Dark** (3): Darkrai Cst *mythical* · Deino → Hydreigon Cst *pseudo* · Yveltal Grd *legend*
- **Dragon** (13): Dratini → Dragonite Grd *SP, pseudo* · Bagon → Salamence Snp *pseudo* · Latias Cst *legend* · Latios Cst *legend* · Rayquaza Grd *legend* · Gible → Garchomp Grd *pseudo* · Reshiram Cst *legend* · Zekrom Grd *legend* · Kyurem Grd *legend* · Goomy → Goodra Grd *pseudo* · Jangmo-o → Kommo-o Grd *pseudo* · Dreepy → Dragapult Snp *pseudo* · Frigibax → Baxcalibur Grd *pseudo*
- **Electric** (4): Zapdos Cst *SP, legend* · Raikou Cst *legend* · Tapu Koko Snp *legend* · Miraidon Cst *legend*
- **Fairy** (2): Xerneas Grd *legend* · Zacian Snp *legend*
- **Fighting** (2): Zamazenta Snp *legend* · Koraidon Snp *legend*
- **Fire** (3): Moltres Cst *SP, legend* · Entei Snp *legend* · Ho-Oh Grd *legend*
- **Ghost** (1): Giratina Blk *legend*
- **Ground** (1): Groudon Grd *legend*
- **Ice** (2): Articuno Cst *SP, legend* · Regice Blk *legend*
- **Normal** (1): Arceus Grd *mythical*
- **Psychic** (6): Mewtwo Cst *SP, legend* · Mew Grd *SP, mythical* · Lugia Blk *legend* · Celebi Grd *mythical* · Deoxys Snp *mythical* · Victini Grd *mythical*
- **Rock** (2): Larvitar → Tyranitar Grd *pseudo* · Regirock Blk *legend*
- **Steel** (4): Beldum → Metagross Grd *pseudo* · Registeel Blk *legend* · Jirachi Grd *mythical* · Dialga Cst *legend*
- **Water** (3): Suicune Blk *legend* · Kyogre Cst *legend* · Palkia Cst *legend*

### 5★ — 38 lines
- **Fighting** (1): Riolu → Lucario Grd
- **Fire** (9): Charmander → Charizard Cst *starter, SP* · Cyndaquil → Typhlosion Cst *starter, SP* · Torchic → Blaziken Snp *starter* · Chimchar → Infernape Snp *starter* · Tepig → Emboar Grd *starter* · Fennekin → Delphox Cst *starter* · Litten → Incineroar Grd *starter* · Scorbunny → Cinderace Snp *starter* · Fuecoco → Skeledirge Cst *starter*
- **Grass** (9): Bulbasaur → Venusaur Cst *starter, SP* · Chikorita → Meganium Grd *starter, SP* · Treecko → Sceptile Cst *starter* · Turtwig → Torterra Grd *starter* · Snivy → Serperior Snp *starter* · Chespin → Chesnaught Blk *starter* · Rowlet → Decidueye Grd *starter* · Grookey → Rillaboom Grd *starter* · Sprigatito → Meowscarada Snp *starter*
- **Normal** (1): Eevee → Vaporeon Cst / Jolteon Cst / Flareon Grd / Espeon Cst / Umbreon Blk / Leafeon Grd / Glaceon Cst / Sylveon Cst *SP*
- **Rock** (9): Omanyte → Omastar Cst · Kabuto → Kabutops Grd · Aerodactyl Snp · Lileep → Cradily Grd · Anorith → Armaldo Grd · Cranidos → Rampardos Grd · Shieldon → Bastiodon Blk · Tyrunt → Tyrantrum Grd · Amaura → Aurorus Cst
- **Water** (9): Squirtle → Blastoise Grd *starter, SP* · Totodile → Feraligatr Grd *starter, SP* · Mudkip → Swampert Grd *starter* · Piplup → Empoleon Cst *starter* · Oshawott → Samurott Grd *starter* · Froakie → Greninja Grd *starter* · Popplio → Primarina Cst *starter* · Sobble → Inteleon Cst *starter* · Quaxly → Quaquaval Grd *starter*

### 4★ — 48 lines
- **Bug** (2): Shuckle Blk · Larvesta → Volcarona Cst
- **Dark** (4): Murkrow → Honchkrow Snp · Sneasel → Weavile Snp · Zorua → Zoroark Cst · Pawniard → Kingambit Grd
- **Dragon** (1): Axew → Haxorus Grd
- **Electric** (3): Magnemite → Magnezone Cst · Mareep → Ampharos Cst · Shinx → Luxray Grd
- **Fairy** (2): Togepi → Togekiss Cst · Tinkatink → Tinkaton Snp
- **Fighting** (3): Machop → Machamp Grd *SP* · Timburr → Conkeldurr Grd · Sirfetch’d Grd *TD pick*
- **Fire** (3): Vulpix → Ninetales Grd · Growlithe → Arcanine Snp *SP* · Charcadet → Armarouge Cst / Ceruledge Grd
- **Flying** (1): Noibat → Noivern Cst
- **Ghost** (2): Litwick → Chandelure Cst · Gimmighoul → Gholdengo Cst
- **Grass** (3): Budew → Roserade Cst · Kartana Grd *TD pick* · Applin → Flapple Grd / Appletun Cst / Hydrapple Cst
- **Ground** (5): Rhyhorn → Rhyperior Blk · Gligar → Gliscor Blk · Trapinch → Flygon Snp · Drilbur → Excadrill Snp · Great Tusk Blk *TD pick*
- **Ice** (1): Swinub → Mamoswine Grd
- **Normal** (3): Slakoth → Slaking Grd · Happiny → Blissey Med · Munchlax → Snorlax Grd
- **Poison** (3): Nidoran-F → Nidoqueen Grd · Nidoran-M → Nidoking Grd · Zubat → Crobat Snp
- **Psychic** (2): Ralts → Gardevoir Cst / Gallade Snp · Hatenna → Hatterene Cst
- **Rock** (3): Onix → Steelix Blk · Stakataka Blk *TD pick* · Rolycoly → Coalossal Blk
- **Steel** (1): Aron → Aggron Blk
- **Water** (6): Poliwag → Poliwrath Grd / Politoed Cst · Shellder → Cloyster Blk · Staryu → Starmie Cst · Magikarp → Gyarados Grd *SP* · Lapras Blk · Feebas → Milotic Cst

### 3★ — 70 lines
- **Bug** (5): Caterpie → Butterfree Cst *SP* · Venonat → Venomoth Cst *SP* · Scyther → Scizor Grd / Kleavor Grd · Heracross Snp · Joltik → Galvantula Cst
- **Dark** (3): Houndour → Houndoom Cst *SP* · Sableye Grd · Absol Snp
- **Electric** (5): Voltorb → Electrode Cst · Pichu → Raichu Snp · Rotom Cst · Pawmi → Pawmot Snp · Tadbulb → Bellibolt Blk
- **Fairy** (2): Cleffa → Clefable Cst *SP* · Comfey Cst
- **Fighting** (3): Tyrogue → Hitmonlee Snp / Hitmonchan Grd / Hitmontop Grd · Pancham → Pangoro Grd · Hawlucha Snp
- **Fire** (2): Ponyta → Rapidash Snp · Torkoal Blk
- **Flying** (1): Rookidee → Corviknight Blk
- **Ghost** (3): Gastly → Gengar Cst *SP* · Misdreavus → Mismagius Cst · Mimikyu Snp
- **Grass** (2): Oddish → Vileplume Cst / Bellossom Cst · Ferroseed → Ferrothorn Blk
- **Ground** (4): Sandshrew → Sandslash Blk · Diglett → Dugtrio Snp · Cubone → Marowak Blk · Mudbray → Mudsdale Grd *TD pick*
- **Ice** (2): Snorunt → Glalie Grd / Froslass Snp · Snom → Frosmoth Cst
- **Normal** (14): Pidgey → Pidgeot Snp *SP, gift* · Rattata → Raticate Snp · Meowth → Persian Snp · Kangaskhan Blk · Ditto Grd · Igglybuff → Wigglytuff Cst · Miltank Blk · Azurill → Azumarill Blk · Swablu → Altaria Blk · Starly → Staraptor Snp · Bidoof → Bibarel Snp · Audino Med *gift* · Fletchling → Talonflame Snp · Wooloo → Dubwool Blk
- **Poison** (4): Ekans → Arbok Snp · Grimer → Muk Grd · Koffing → Weezing Grd · Mareanie → Toxapex Blk
- **Psychic** (2): Abra → Alakazam Cst · Solosis → Reuniclus Cst
- **Rock** (4): Geodude → Golem Blk *SP, gift* · Rockruff → Lycanroc Snp · Minior Snp *TD pick* · Nacli → Garganacl Blk
- **Steel** (3): Skarmory Blk · Mawile Grd · Honedge → Aegislash Blk
- **Water** (11): Psyduck → Golduck Cst · Slowpoke → Slowbro Blk / Slowking Cst *SP* · Seel → Dewgong Blk *SP* · Chinchou → Lanturn Cst *SP* · Wooper → Quagsire Blk · Qwilfish Grd *TD pick* · Lotad → Ludicolo Cst · Carvanha → Sharpedo Snp · Basculin Snp *TD pick* · Frillish → Jellicent Blk · Alomomola Blk

## Type coverage

A tank is a blocker, or a guard with HP + Def ≥ 180. A damage dealer is a sniper, caster or guard with its attacking stat ≥ 100. Both use final forms, and a type counts if either of the mon's types matches. The count columns read "3–5★ lines + 6★ lines".

| Type | Tanks (3–5★ + 6★) | Best 3–5★ tanks | Damage (3–5★ + 6★) | Best 3–5★ damage |
|---|---|---|---|---|
| Bug | 1 + 0 | Shuckle Blk 4★ | 6 + 0 | Kleavor Grd 3★, Volcarona Cst 4★, Scizor Grd 3★ |
| Dark | 3 + 2 | Kingambit Grd 4★, Umbreon Blk 5★, Incineroar Grd 5★ | 10 + 4 | Kingambit Grd 4★, Absol Snp 3★, Honchkrow Snp 4★ |
| Dragon | 2 + 8 | Tyrantrum Grd 5★, Altaria Blk 3★ | 6 + 18 | Haxorus Grd 4★, Tyrantrum Grd 5★, Hydrapple Cst 4★ |
| Electric | 1 + 1 | Bellibolt Blk 3★ | 5 + 5 | Magnezone Cst 4★, Luxray Grd 4★, Pawmot Snp 3★ |
| Fairy | 1 + 1 | Azumarill Blk 3★ | 5 + 3 | Hatterene Cst 4★, Primarina Cst 5★, Gardevoir Cst 4★ |
| Fighting | 4 + 1 | Great Tusk Blk 4★, Chesnaught Blk 5★, Conkeldurr Grd 4★ | 14 + 3 | Conkeldurr Grd 4★, Sirfetch’d Grd 4★, Machamp Grd 4★ |
| Fire | 3 + 2 | Coalossal Blk 4★, Torkoal Blk 3★, Incineroar Grd 5★ | 17 + 5 | Chandelure Cst 4★, Volcarona Cst 4★, Flareon Grd 5★ |
| Flying | 4 + 5 | Skarmory Blk 3★, Corviknight Blk 3★, Gliscor Blk 4★ | 7 + 7 | Gyarados Grd 4★, Honchkrow Snp 4★, Staraptor Snp 3★ |
| Ghost | 2 + 1 | Aegislash Blk 3★, Jellicent Blk 3★ | 7 + 1 | Chandelure Cst 4★, Gholdengo Cst 4★, Gengar Cst 3★ |
| Grass | 8 + 1 | Chesnaught Blk 5★, Ferrothorn Blk 3★, Torterra Grd 5★ | 13 + 1 | Kartana Grd 4★, Roserade Cst 4★, Rillaboom Grd 5★ |
| Ground | 12 + 2 | Steelix Blk 4★, Great Tusk Blk 4★, Rhyperior Blk 4★ | 8 + 2 | Excadrill Snp 4★, Mamoswine Grd 4★, Mudsdale Grd 3★ |
| Ice | 4 + 3 | Cloyster Blk 4★, Lapras Blk 4★, Mamoswine Grd 4★ | 4 + 2 | Mamoswine Grd 4★, Glaceon Cst 5★, Frosmoth Cst 3★ |
| Normal | 5 + 1 | Slaking Grd 4★, Snorlax Grd 4★, Miltank Blk 3★ | 3 + 1 | Slaking Grd 4★, Staraptor Snp 3★, Snorlax Grd 4★ |
| Poison | 3 + 0 | Toxapex Blk 3★, Weezing Grd 3★, Muk Grd 3★ | 6 + 0 | Gengar Cst 3★, Roserade Cst 4★, Vileplume Cst 3★ |
| Psychic | 1 + 6 | Slowbro Blk 3★ | 10 + 9 | Hatterene Cst 4★, Alakazam Cst 3★, Espeon Cst 5★ |
| Rock | 10 + 2 | Stakataka Blk 4★, Shuckle Blk 4★, Aggron Blk 4★ | 9 + 1 | Rampardos Grd 5★, Kleavor Grd 3★, Armaldo Grd 5★ |
| Steel | 10 + 3 | Steelix Blk 4★, Stakataka Blk 4★, Aggron Blk 4★ | 8 + 3 | Kartana Grd 4★, Excadrill Snp 4★, Kingambit Grd 4★ |
| Water | 13 + 1 | Alomomola Blk 3★, Cloyster Blk 4★, Lapras Blk 4★ | 15 + 2 | Primarina Cst 5★, Gyarados Grd 4★, Inteleon Cst 5★ |

Every type has at least one 3–5★ tank and at least one 3–5★ damage dealer. The thin ones are Bug, Electric, Fairy and Psychic, which each have one non-legendary tank (Shuckle, Bellibolt, Azumarill, Slowbro). Bellibolt (Tadbulb) is in the roster for that reason.

## Classes

A class belongs to each form, not to the line, so a line counts toward every class its forms reach (for example, Pikachu is a vanguard and Raichu is a sniper).

| Class | Lines with a form in it (now → cut) | Lines whose final form is it | Examples (form, tier) |
|---|---|---|---|
| Blocker | 129 → 46 | 40 | Great Tusk 4★, Stakataka 4★, Lapras 4★, Umbreon 5★, Shuckle 4★, Toxapex 3★, Corviknight 3★, Bellibolt 3★ |
| Guard | 229 → 84 | 66 | Kartana 4★, Gyarados 4★, Greninja 5★, Incineroar 5★, Rillaboom 5★, Samurott 5★, Lucario 5★, Luxray 4★ |
| Sniper | 145 → 56 | 43 | Blaziken 5★, Serperior 5★, Flygon 4★, Gallade 4★, Aerodactyl 5★, Scyther 3★, Heracross 3★, Hawlucha 3★ |
| Caster | 179 → 69 | 61 | Volcarona 4★, Milotic 4★, Armarouge 4★, Vaporeon 5★, Politoed 4★, Slowking 3★, Comfey 3★, Appletun 4★ |
| Vanguard | 35 → 13 | 0 | Anorith 5★, Pawmo 3★, Pidgeotto 3★, Staravia 3★, Vibrava 4★, Pikachu 3★, Litten 5★, Poliwag 4★ |
| Medic | 2 → 2 | 2 | Audino 3★, Happiny 4★ |

There are only two medic lines because healers are a hand-written list in `td.js` (`HEALERS`: the Chansey line and Audino), and the cut doesn't change that. **Proposal for step 2 (needs your OK):** add Alomomola and Comfey to `HEALERS`, which makes four medic lines. Both are already in the roster. I re-ran the stage check with that change and every stage still wins (4-2 even keeps all 3 lives).

## Stage check: 1-1 → 6-6

This uses the same method as `tests/poke-gacha.test.cjs` ("every stage is cleared by a type-matched squad at the page's recommended level"). For each stage, take the 60 3★/4★ lines that best match the stage's enemies by type, build a squad with a class mix, play it at the page's Rec. Lv with the test's placement, and record the result and lives left.

The first version of the cut (~205 lines, only fan favourites) **failed 13 stages** (1-7, 2-5, 2-6, 4-2, 4-4, 5-1, 5-2, 5-4, 6-1, 6-3, 6-4, 6-5, 6-6). Today's matched squads in chapters 4–6 depend on strong single-stage 4★s (paradox Pokémon, Ultra Beasts, Lapras). A greedy search over the cut lines found the fewest additions that make every stage win again: Great Tusk, Kartana, Stakataka, Minior, Sirfetch'd, Mudbray, Qwilfish and Basculin (the *TD pick* lines). A pruning pass then removed 9 lines the check didn't need: Weedle, Pineco, Spiritomb, Drifloon, Snover, Shroomish, Sandile, Tauros and Elekid.

| Stage | Rec. Lv | Now (552 lines) | Proposed (203) | Proposed + 2 new medics |
|---|---|---|---|---|
| 1-1  |  1  |  win 3/3  |  win 3/3  |  win 3/3  |
| 1-2  |  1  |  win 3/3  |  win 3/3  |  win 3/3  |
| 1-3  |  1  |  win 3/3  |  win 3/3  |  win 3/3  |
| 1-4  |  1  |  win 3/3  |  win 3/3  |  win 3/3  |
| 1-5  |  1  |  win 3/3  |  win 3/3  |  win 3/3  |
| 1-6  |  2  |  win 3/3  |  win 3/3  |  win 3/3  |
| 1-7  |  2  |  win 3/3  |  win 3/3  |  win 3/3  |
| 1-8  |  3  |  win 3/3  |  win 3/3  |  win 3/3  |
| 2-1  |  2  |  win 3/3  |  win 3/3  |  win 3/3  |
| 2-2  |  3  |  win 3/3  |  win 3/3  |  win 3/3  |
| 2-3  |  3  |  win 3/3  |  win 3/3  |  win 3/3  |
| 2-4  |  3  |  win 3/3  |  win 3/3  |  win 3/3  |
| 2-5  |  3  |  win 3/3  |  win 3/3  |  win 3/3  |
| 2-6  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 3-1  |  3  |  win 3/3  |  win 3/3  |  win 3/3  |
| 3-2  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 3-3  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 3-4  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 3-5  |  3  |  win 2/3  |  win 3/3  |  win 3/3  |
| 3-6  |  4  |  win 2/3  |  win 3/3  |  win 3/3  |
| 4-1  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 4-2  |  4  |  win 3/3  |  win 2/3  |  win 3/3  |
| 4-3  |  3  |  win 1/3  |  win 1/3  |  win 1/3  |
| 4-4  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 4-5  |  3  |  win 3/3  |  win 1/3  |  win 1/3  |
| 4-6  |  4  |  win 3/3  |  win 2/3  |  win 2/3  |
| 5-1  |  4  |  win 3/3  |  win 1/3  |  win 1/3  |
| 5-2  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 5-3  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 5-4  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 5-5  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 5-6  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 6-1  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 6-2  |  3  |  win 2/3  |  win 2/3  |  win 2/3  |
| 6-3  |  4  |  win 3/3  |  win 3/3  |  win 3/3  |
| 6-4  |  3  |  win 3/3  |  win 2/3  |  win 2/3  |
| 6-5  |  3  |  win 2/3  |  win 1/3  |  win 1/3  |
| 6-6  |  4  |  win 3/3  |  win 1/3  |  win 1/3  |

All 38 stages win at Rec. Lv with the proposed roster, and so do all 28 in `td.test.cjs`'s "matched level-3 squad wins" list. The margins are thinner than today: 4-3, 4-5, 5-1, 6-5 and 6-6 are won with 1 life left. (4-3 is already a 1-life win today.)

Something step 2 has to handle: `td.test.cjs` also checks that the *worst*-typed level-3 squad **loses** on most stages. With the smaller pool, the worst-typed squad now wins 1-8 and 2-3. Either those two stages leave that assertion's list, or 1-8 and 2-3 get a small level bump. I'd take them off the list rather than retune the stages, but it's your call.

## Cut lines (349)

<details><summary>Every line that stops dropping from eggs</summary>

**6★ cut (52):** Uxie, Mesprit, Azelf, Heatran, Regigigas, Cresselia, Phione, Manaphy, Shaymin, Cobalion, Terrakion, Virizion, Tornadus, Thundurus, Landorus, Keldeo, Meloetta, Genesect, Zygarde, Diancie, Hoopa, Volcanion, Type: Null, Tapu Lele, Tapu Bulu, Tapu Fini, Cosmog, Necrozma, Magearna, Marshadow, Zeraora, Meltan, Melmetal, Eternatus, Kubfu, Zarude, Regieleki, Regidrago, Glastrier, Spectrier, Calyrex, Enamorus, Wo-Chien, Chien-Pao, Ting-Lu, Chi-Yu, Okidogi, Munkidori, Fezandipiti, Ogerpon, Terapagos, Pecharunt

**5★ cut (6):** Tirtouga, Archen, Dracozolt, Arctozolt, Dracovish, Arctovish

**4★ cut (100):** Mankey, Tentacool, Exeggcute, Lickitung, Tangela, Horsea, Pinsir, Porygon, Yanma, Girafarig, Dunsparce, Teddiursa, Phanpy, Stantler, Elekid, Magby, Nosepass, Wailmer, Baltoy, Duskull, Spheal, Bronzor, Hippopotas, Skorupi, Lillipup, Roggenrola, Tympole, Sewaddle, Sandile, Vanillite, Klink, Tynamo, Cubchoo, Cryogonal, Mienfoo, Rufflet, Vullaby, Litleo, Flabébé, Skiddo, Binacle, Clauncher, Carbink, Bergmite, Grubbin, Stufful, Bounsweet, Wimpod, Dhelmise, Nihilego, Buzzwole, Pheromosa, Xurkitree, Celesteela, Guzzlord, Poipole, Blacephalon, Blipbug, Silicobra, Toxel, Sizzlipede, Sinistea, Impidimp, Obstagoon, Cursola, Mr. Rime, Cufant, Duraludon, Basculegion, Sneasler, Overqwil, Smoliv, Maschiff, Toedscool, Varoom, Cyclizar, Glimmet, Flamigo, Cetoddle, Dondozo, Scream Tail, Brute Bonnet, Flutter Mane, Slither Wing, Sandy Shocks, Iron Treads, Iron Bundle, Iron Hands, Iron Jugulis, Iron Moth, Iron Thorns, Roaring Moon, Iron Valiant, Walking Wake, Iron Leaves, Poltchageist, Gouging Fire, Raging Bolt, Iron Boulder, Iron Crown

**3★ cut (191):** Weedle, Spearow, Paras, Bellsprout, Farfetch’d, Doduo, Drowzee, Krabby, Goldeen, Tauros, Sentret, Hoothoot, Ledyba, Spinarak, Natu, Hoppip, Aipom, Sunkern, Unown, Pineco, Snubbull, Slugma, Corsola, Remoraid, Delibird, Smeargle, Smoochum, Poochyena, Zigzagoon, Wurmple, Seedot, Taillow, Wingull, Surskit, Shroomish, Nincada, Whismur, Makuhita, Skitty, Meditite, Electrike, Plusle, Minun, Volbeat, Illumise, Gulpin, Numel, Spoink, Spinda, Cacnea, Zangoose, Seviper, Lunatone, Solrock, Barboach, Corphish, Castform, Kecleon, Shuppet, Tropius, Wynaut, Clamperl, Relicanth, Luvdisc, Kricketot, Burmy, Combee, Pachirisu, Buizel, Cherubi, Shellos, Drifloon, Buneary, Glameow, Chingling, Stunky, Bonsly, Mime Jr., Chatot, Spiritomb, Croagunk, Carnivine, Finneon, Mantyke, Snover, Patrat, Purrloin, Pansage, Pansear, Panpour, Munna, Pidove, Blitzle, Woobat, Throh, Sawk, Venipede, Cottonee, Petilil, Darumaka, Maractus, Dwebble, Scraggy, Sigilyph, Yamask, Trubbish, Minccino, Gothita, Ducklett, Deerling, Emolga, Karrablast, Foongus, Elgyem, Shelmet, Stunfisk, Druddigon, Golett, Bouffalant, Heatmor, Durant, Bunnelby, Scatterbug, Furfrou, Espurr, Spritzee, Swirlix, Inkay, Skrelp, Helioptile, Dedenne, Klefki, Phantump, Pumpkaboo, Pikipek, Yungoos, Crabrawler, Oricorio, Cutiefly, Wishiwashi, Dewpider, Fomantis, Morelull, Salandit, Oranguru, Passimian, Sandygast, Pyukumuku, Komala, Turtonator, Togedemaru, Bruxish, Drampa, Skwovet, Nickit, Gossifleur, Chewtle, Yamper, Cramorant, Arrokuda, Clobbopus, Perrserker, Runerigus, Milcery, Falinks, Pincurchin, Stonjourner, Eiscue, Indeedee, Morpeko, Lechonk, Tarountula, Nymble, Tandemaus, Fidough, Squawkabilly, Wattrel, Shroodle, Bramblin, Klawf, Capsakid, Rellor, Flittle, Wiglett, Bombirdier, Finizen, Orthworm, Greavard, Veluza, Tatsugiri, Clodsire

</details>

## Step 2 plan (after approval)

- **Pools:** `scripts/gacha-dex.mjs` gets the roster list. Cut lines get star 0, and the 4★ cutoff becomes 505. `gacha-dex.js` is regenerated; `--check` keeps it honest. Enemy species in the stages read the full `DEX` and are unaffected.
- **Dex:** cut lines leave the Poké Gacha Dex. An owned cut line shows as one "legacy" note, with its refund, instead of a card.
- **Refund, once per account:** a single wallet grant with a fixed ledger id (`grant:roster-cut-1`), so two devices merge to one payment. Per owned cut line: 3★ → 1 Regular, 4★ → 2 Regular, 5★ → 1 Plus, 6★ → 1 Premium. On top of that, 1 Regular per 25 candy left on the line, and the coins spent levelling it come back as coins. The tier used is the one the line had when it was hatched. Cut lines come out of the squad and every preset. A one-time popup lists what was refunded.
- **Eggs already pulled:** they hatch from the new pools. A banner egg whose banner species was cut (Kubfu, Tapu Lele and others) hatches as a kept legendary instead.
- **Banner and pity:** `bannerFor` rotates through 30 legendaries instead of 66, so the day's banner will likely change on the day this ships. Rarity pity counts eggs and is unaffected. Dupe pity must not look for a "new" species in a tier the player has already completed (step 2 adds a test for that).
- **Tests:** `Archeops` (Archen, cut) is used by name in the gacha tests and gets swapped for a kept fossil. The two worst-typed assertions are covered above.
- **Not touched:** Poké Idle, its species table, and the full 1025-species `DEX` (Poké Idle and the TD enemies keep reading it).

## Open questions

1. Is the roster OK? Any lines you want swapped in or out? Swapping any of the 3★/4★ lines means re-running the stage check.
2. Should the 4★ cutoff go to 505 (recommended), or stay at 500?
3. Should Alomomola and Comfey become medics?
4. For the two worst-typed stages, drop them from the assertion (recommended) or retune?
