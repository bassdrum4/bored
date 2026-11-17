# Poké Gacha spec

Planned with Vettel on 2026-11-16. Every number here is a starting value and can be tuned.
Read `AGENTS.md` first. Run any change to Poké Idle (pokeclicker) by Vettel and wait for his "go"
before building it.

## Scope

The economy only involves these games. Leave every other game alone, and keep the site-wide
daily challenge out of it.

- **Poké Idle** (`poke-idle`, which Vettel calls pokeclicker)
- **Pokédoku**, all 3 modes (`pokedoku`, `inverse-doku`, `shiny-hunt`). They share `pokedoku.html`
- **Poké Gacha** (`poke-gacha`): the gacha plus its own tower defense game

Pulls never make you stronger outside Poké Gacha's tower defense. In other games they are
cosmetic only, which keeps the pokeclicker leaderboard fair.

## Build order (one PR each)

1. **Wallet + rewards engine** (hub side): currency, the grant ledger, cloud sync, reading
   snapshots, achievements, Pokédoku counters, backpay
2. **Gacha**: eggs, machines, pity, hatching, candy, shards, dex, buddy and SP skins
3. **Tower defense**: chapter 1 (about 8 stages) first, then the missions that depend on TD
4. **pokeclicker daily boss**: needs Vettel to sign off on the design first
5. Later: more chapters, a weekly risk-modifier challenge stage, and a season pass (not decided yet)

## Currency

- **Coins**: 100 coins buys 1 Regular voucher
- **Vouchers**: Regular, Plus, Premium, Gold (see Gacha)
- **Shards**: come from dupes and are spent in the shard shop
- **Candy**: one balance per species line
- **Hatch waves**: counted while eggs are waiting to hatch

### Ledger (anti-farm, safe across devices)

Store every grant and every spend as an entry with a unique id, for example
`pdoku:daily:2026-11-16`, `ach:pi-caught-50`, `pi:badge:12`, `boss:2026-11-16`, `spend:<uuid>`.
A balance is the sum of the entries. Merging two devices takes the union of entries by id, so a
reward can never pay twice and a currency balance can never be lost or duplicated. Sync it
through `player_state` the same way `src/hub/cloud.js` already does. Guests follow the existing
guest pattern (`hasIdentity()`). Ask Vettel whether a guest wallet should move over on sign-in.

pokeclicker rewards pay against the **highest value ever recorded on the account**, never against
current state. Restarting pokeclicker pays nothing again.

## Income

### pokeclicker (progress, one-time)

The hub reads the snapshot fields `caught`, `shinies`, `badges` and `tower` that already exist.

| Event | Coins | Waves |
|---|---|---|
| New species caught (new account best) | 5 | 1 |
| New shiny | 200 | 0 |
| New badge | 100 | 5 |
| New Battle Tower best floor (per floor) | 10 | 1 |

### pokeclicker daily boss (new feature in Poké Idle, phase 4)

- One boss species per day, picked from `window.__boredSeed`, so everyone fights the same one
- Its level equals the player's **current level cap**, with boosted stats
- It has a clear type weakness: you win by building a team around it, not by clicking. Tune it
  close to the upper limit, but it must stay possible
- Unlimited attempts, a timer like the Battle Tower, and the gacha reward pays once a day.
  Inside pokeclicker it gives the normal exp and money for a battle, nothing extra
- Snapshot adds something like `boss: { date, won }`
- Reward: 150 coins + 15 waves
- **Streak**: 5 wins in a row gives 1 Premium. Weekend days neither count nor break the streak

### Pokédoku (per mode: Pokédoku, Inverse Doku, Shiny Hunt)

| Event | Reward |
|---|---|
| Daily finished | 100 coins + 10 waves |
| Perfect daily | +50 coins. Perfect means 9/9 squares in Pokédoku, everything found in Inverse Doku, and a score above a cutoff in Shiny Hunt (cutoff TBD: check real scores) |
| Random board finished | 20 coins + 2 waves, max 3 per mode per day |
| All 3 dailies on the same day | 1 Premium |

Pokédoku snapshots only describe the current board, so the hub must keep its own counts of
finished dailies and streaks for each mode. Reuse the streak logic in `src/daily.js`.

### Poké Gacha

- Daily login: 3 Regular
- TD stage first clear: 50 coins + 2 Regular
- TD stage first 3-star: +100 coins + 1 Plus
- Rocket admin boss, first clear: 1 Gold
- 1 TD wave = 1 hatch wave

### Daily missions (TD only)

4 a day, drawn from the daily seed. Each pays 50 coins + 5 waves, and finishing all 4 pays 1 Plus.
Pool:

- Clear any stage
- 3-star a stage
- Clear using only one type
- Clear with 5 or fewer mons deployed
- Clear a Rocket admin stage
- Use a 5★ or better in a clear

### Weekly missions (reset Monday, Detroit time)

Each pays 1 Plus, and finishing all 5 pays 1 Gold.

- 3-star 5 stages
- Finish all daily missions on 5 days
- Beat the pokeclicker daily boss on 5 days
- Clear one stage with 3 different teams
- Finish 10 Pokédoku dailies (any mode)

### Starter missions (one-time, 2 Regular each)

Pull your first egg, hatch an egg, clear stage 1-1, equip a buddy.

### Achievements (one-time)

S = 1 Plus, M = 1 Premium, B = 1 Gold. They go on a trophy list on the player's profile.

- **pokeclicker**
  - Caught 50 (S), 150 (S), 400 (M), 800 (B)
  - Shinies 1 (S), 3 (M), 10 (B)
  - Badges 4 (S), 8 (S), 16 (M), 24 (M), 36 (B)
  - Tower floor 10 (S), 25 (M), 50 (B), 100 (B)
- **Pokédoku**: first daily (S), perfect 9/9 (M), 10 dailies (M), 30 dailies (B), 7-day daily streak (B)
- **Inverse Doku**: first daily (S), find everything on a board (M), 10 dailies (M)
- **Shiny Hunt**: first daily (S), score above the cutoff (M), 10 dailies (M)
- **All 3 modes**: all 3 dailies on 7 days in a row (B)

### Backpay at launch

The first time a player opens Poké Gacha, it pays out for their existing pokeclicker bests,
Pokédoku history and any achievements they already reached, **capped at 1 Gold + 2 Premium in
total**. After that, their current values become the baseline and new progress pays normally.

## Gacha (a port of PokéRogue's egg gacha)

### Vouchers

| Voucher | Eggs | Guarantee |
|---|---|---|
| Regular | 1 | Using 10 at once guarantees a Rare |
| Plus | 5 | none |
| Premium | 10 | 1 Rare |
| Gold | 25 | 1 Epic |

### Egg tiers and rates (out of 256 per egg)

| Tier | Stars | Standard | Legendary UP |
|---|---|---|---|
| Common | 3★ | 204 | 203 |
| Rare | 4★ | 44 | 44 |
| Epic | 5★ | 7 | 7 |
| Legendary | 6★ | 1 | 1 |
| Banner legendary | 6★ | 0 | 1 |

PokéRogue's Manaphy egg is left out; its 1/256 goes to Common.

### Machines

- **Move UP**: doubles the chance of rolling a rare skill
- **Legendary UP**: adds that day's banner legendary, chosen from the shared daily seed
- **Shiny UP**: shiny chance is 1/64 (it is 1/128 on the other two machines). This is also the
  only machine that can roll an SP skin: 1/200 per egg, and only when the hatched species has a
  skin in the SP list (see below). Otherwise there is no SP roll

### Pity

- **Rarity pity**: after 9 eggs with no Rare, 59 with no Epic, or 412 with no Legendary, the next
  Common egg is upgraded to that tier
- **Dupe pity**: after 9 hatches in a tier with no new species, the 10th hatch in that tier is
  forced to be new
- **Legendary UP**: each non-legendary egg counts double toward Legendary pity. Banner eggs count
  toward Legendary pity but not toward dupe pity

### Hatching

- Waves needed: Common 5, Rare 15, Epic 30, Legendary 60
- All eggs count down together. A player can hold at most 99 eggs
- Waves come only from the sources listed under Income. Nothing hatches from waiting

### Species pool

The pool is mostly **base forms**. Players evolve them with candy.

- 6★: legendaries and the base forms of pseudo-legendaries (Dratini, Larvitar, Beldum, Gible and so on)
- 5★: starters and strong base forms (Eevee, Riolu and so on)
- 4★ and 3★: split by base stat total
- Mythicals: not decided yet

Sprites come from `src/games/content/pokedoku/sprites/` (ids 1 to 1025 are all present).

### What a hatch gives

- A new species unlock, or on a dupe, shards by tier: 3★ 1, 4★ 5, 5★ 15, 6★ 50
- Candy for that species line on every hatch
- **Skills**: each mon has 3 common skills and 1 rare skill. Its first hatch guarantees one
  random skill, and later hatches roll for another. The rare skill rolls at 1/48 for Common eggs,
  1/24 for Rare, 1/12 for Epic and 1/6 for Legendary. Move UP doubles these
- A shiny roll, which is cosmetic

### Candy costs

- Evolve stage 1 to 2: 25 candy. Evolve stage 2 to 3: 100 candy
- Unlock a passive: 50 candy
- Deploy cost −1: 30 candy. A further −1 (−2 total): 60 more candy
- Levels cost coins, not candy

### SP skins and buddy (cosmetic, site-wide)

- SP skins are hand-drawn art for a handful of popular mons, added by hand. Each skin belongs to
  one species. They live in `src/games/content/poke-gacha/sp/`: one PNG per skin and one list
  file, `skins.json`
- Ways to get an SP skin: the 1/200 roll on Shiny UP (only for a species with a listed skin), or
  buying it for 300 shards in the shard shop. The shop sells only skins in the list, and only
  for a species line the player has hatched
- The list ships empty. While it is empty, nothing rolls or sells SP and the SP parts of the
  screens are hidden
- A line wears one look: normal, shiny (if hatched shiny), or one of its owned SP skins. A skin is
  drawn only on its own species; the rest of the line looks normal
- **Buddy**: the player equips one mon. It shows next to their name on the leaderboard and in
  the hub header
- Shiny and SP skins also apply in pokeclicker and Pokédoku. They never change any stats

#### How to add an SP skin

1. Draw the skin as a PNG, no bigger than 96×96 (the size of the largest normal sprite), on a
   transparent background, and save it as `src/games/content/poke-gacha/sp/<id>.png`. The id is
   lowercase letters, numbers and dashes, for example `ceruledge-birthday`
2. Add one line to the list in `src/games/content/poke-gacha/sp/skins.json`, with a comma after
   every entry but the last:
   `{ "id": "ceruledge-birthday", "species": 937, "name": "Birthday" }`. `species` is the
   national dex number the skin is drawn for, and `name` is what the screens show
3. Run `npm test`. It fails if the list is malformed or a listed PNG is missing

No code changes are needed. Taking a line out of the list hides that skin again for everyone.

## Tower defense (the main game, Arknights-style)

- Real-time and desktop only. Space pauses the game. There are no speed controls
- Each stage is a grid map with enemy paths, plus **ground** tiles (melee, can block) and
  **high-ground** tiles (ranged)
- **Energy** (Arknights' DP) refills over time and is spent to deploy mons. A squad has 8 mons
- **Classes are derived from stats and moves**, so no species needs a hand-written tag:
  - Blocker: high HP and Defense
  - Guard: physical melee
  - Caster: high Special Attack, area damage
  - Sniper: ranged physical; the only class that can hit flying enemies
  - Medic: healers (Chansey, Blissey)
  - Vanguard: cheap to deploy, gives energy back
- Type matchups apply to all damage. Each mon has one active skill that charges over time,
  taken from its unlocked skills
- Each stage clear earns 1 to 3 stars

### Story: Team Rocket chapters

Each chapter has 5 to 8 stages, ends with a boss stage, and has short dialogue before and after
stages. Give each admin some extra species so the stages don't all need the same counter type.

1. Grunts (Rattata, Zubat, Ekans): the tutorial chapter
2. Proton (poison and bats): introduces flying enemies, which only snipers can hit
3. Petrel (Koffing, Weezing): enemies that explode and damage your blockers
4. Ariana (Arbok and tanky mons)
5. Archer (Houndoom, fire and dark): fast waves
6. Giovanni (ground): the final boss

### Later

A weekly challenge stage with stacking risk modifiers (like Arknights' Contingency Contract),
with its own leaderboard.

## Leaderboard

Poké Gacha is in `UNSCORED_GAMES` for now. The planned score is unique species caught. Adding
it needs a `score_rules` row, which Daniel has to add (`npm run games:register`).

## Not decided

- Season pass: free, 50 levels, with a season-exclusive SP skin at the top. Not agreed yet
- Shiny Hunt perfect-score cutoff
- Whether mythicals are in the pool
- What happens to a guest's wallet when they sign in
