# Relic Song: writing songs and regions

This is the template every new Relic Song song is written to, so that the nine regions (about 117
songs) stay playable and don't all sound the same. All of it lives in
`src/games/content/relic-song.html`. Tokens go through `src/hub/relic-song.js`.

To review a song, use **Options → Help → Sound test**. It plays every open song (all of them in
test mode) and the 18 type styles' demos, music only. To check a song, run:

```bash
CHROME_PATH=/path/to/chrome node scripts/relic-song-table.mjs          # the table, the flags, the token totals
CHROME_PATH=/path/to/chrome node scripts/relic-song-table.mjs --strict # exits 1 if a recipe song, a demo or a pay rule fails
```

The script prints one row per song: type, key, BPM, bars, length, hook repeats, the level of each
difficulty, the clear pay and the most its ranks pay. Each row lists what's off the recipe. After
the songs come each region's variety, the demos (held to the recipe and to the moving line's
readability rules), the pay rules run through the hub's ledger, and the token totals (the script still labels them
"COINS"; the amounts are tokens).

**Kanto follows the recipe too** (the Kanto remaster, save v2). All 12 gym songs, Champion Blue,
the final, The Dealer and Sssssssnakes were rewritten to it; each kept its old tune as its hook.
`--strict` holds every song with a `region` to the recipe. Two things are exempt:
- **"It's started. Go."** is an 11-second joke (`exempt: true`, no region): listed, never failed.
- **Meloetta's Lesson** isn't a song (its practices are written by hand in `LESSON_STEPS`).

The gym songs use the type styles (`"Rock"`, `"Water"`, `"Electric"`, `"Grass"`). The finale and
the hidden tracks keep their own bands (`STYLES`: relic, plain, snake, dealer).

## 1. The 18 type styles

`TYPE_STYLES` in the game. A song picks one with `style: "Fire"`. Each style sets the band (lead,
bass and its run, arp and its run, stabs, drums, and the layer IN and AT add) and what a song in
it should be: its scale or mode (the first is the usual one), its BPM range, its swing, and the
gimmicks its boss's moving line is made from.

| Type | Band | Scale | BPM | Swing | Line gimmicks |
|---|---|---|---|---|---|
| Normal | bouncy square lead, root-fifth bass, eighth arps, four-on-the-floor | major | 110-130 | | hops |
| Fire | driving detuned saw lead, rock eighth bass, fast sixteenth arps | mixolydian, minor | 140-170 | | flickers (a new spot each bar), jumps up |
| Water | flowing triangle lead, sixteenth arps | dorian, major | 90-120 | 16ths, 0.5 | tide waves |
| Grass | soft flute (triangle), off-beat arps, light shaker | pentatonic | 85-105 | | sway, drift across |
| Electric | buzzy saw lead, sixteenth bass, sixteenth hats | minor, dorian | 150-175 | | zaps (a snap, a flash on chords), teleports |
| Ice | high bell lead (12.5% pulse + triangle, rings and dies), sparse high chimes, sparkles | lydian | 100-120 | | long frictionless glides, sudden freezes |
| Fighting | punchy pulse lead, stabs on every beat, punch drums | minor | 130-150 | | quick jabs out and back |
| Poison | wobbly-vibrato lead | phrygian, chromatic | 110-125 | | wobble, drips lower bar by bar |
| Ground | heavy sub bass, half-time drums | minor, minor pentatonic | 95-115 | | slams with a screen shake |
| Flying | airy detuned triangle lead, wide two-octave arps | major | 120-140 | | swooping arcs |
| Psychic | dreamy lead and arps with echo/delay | whole-tone, lydian | 100-120 | | teleports, a mirrored twin line |
| Bug | staccato buzzy saw, sixteenth bass and arps | minor, dorian | 150-170 | | skittering zig-zags |
| Rock | Brock's band: deep drums, stabs, rock bass | major, minor | 105-125 | | stomps |
| Ghost | eerie tremolo lead, low plucks, sparse | minor, harmonic minor | 90-110 | | fades in and out of the dark |
| Dragon | big detuned lead, brass chords, octave bass | harmonic minor | 130-150 | | twisters (a whole turn a bar, back the next) |
| Dark | low plucks, a walking blues bass | blues, minor | 95-115 | 8ths, 0.6 | off-beat snaps, notes from both sides |
| Steel | metallic clangs (noise + square), mechanical sixteenths | minor, dorian | 115-135 | | precise 90-degree turns |
| Fairy | sparkly music-box lead and two-octave arps, sparkles | major | 120-140 | | twirls, soft bounces |

**Dual types.** `style: "Fire/Flying"` takes Fire's band and drums, with Flying's line gimmicks.

**Swing** is `{ grid: 8 or 16, amt: 0 to 1 }`: every off-beat eighth (or sixteenth) lands late, a
third of a step late at 1, and the notes on it move with it. A song can set its own `swing`, and
`swing: 0` turns it off.

**Line gimmicks** are in `GIMMICKS`. A boss song with `line: "auto"` gets its whole moving-line
script from its style (`autoLine`):
- The line settles in on the first bar after the break; the gimmicks take turns from the second.
- Gimmicks that turn the line all the way round (twisters, twirls, quarter turns, notes from both
  sides) move it to the middle of the screen and slow its notes, so they stay on screen.
- On a champion's flip back to the highway, the line lands flat a beat and a half early.
- EZ tames it the way it tames a hand-written script (`lineFor`).

A hand-written `line: [...]` still works for anything special. Either way, the readability rules
(every note on screen and its line solid 0.6 s before it, no turn faster than 180°/beat, no jump
just before a note, the line up a bar early) are checked by `tests/relic-song.test.cjs` for
songs, and by the script for the demos.

Each type has a demo (`DEMOS()`, "Fire style" and so on in the sound test). It's a short boss
song generated from the style alone, in the recipe's shape, so a style can be heard before
anything is written in it.

## 2. The song recipe

Every new song follows this. `RECIPE` in the game holds the numbers, and `recipeCheck()` says
where a song doesn't follow it.

**Length** (seconds of music):

| Role | Length |
|---|---|
| song | 1:15-1:45 |
| gym boss | 1:30-2:00 |
| champion | 1:45-2:15 |
| final | 2:30+ |

Hidden tracks keep their own lengths, but follow the rest of the recipe.

**Structure.** Parts are named in `parts`; `form` is their order.
- `I`: the intro, 2 bars, first.
- `H`: the hook, 4 bars, comes back at least 3 times.
- `A`, `B` (and `C` for bosses, champions and the final): the sections.
- `O`: the outro, last.

(`intro: true`, `hook: true` and `outro: true` on a part give the same role to another name.)

Bosses have the Relic Song break (`relic` in the form). Champions also have 2 flips (`flip`, each
one bar, highway ↔ line) and a key change into the last hook: `H^2` in the form plays `H` two
semitones up.

**Variety, per region:**
- No two songs share key + BPM.
- At least 3 different keys.
- A spread of tempos: at least 30 BPM between the slowest and the fastest.
- No bar (its melody and chord) played more than 4 times in a row.

**Melody.**
- About an octave and a half: 19 semitones at most.
- Call and response between lead and arp in B sections: give `B` an `answer` line (same token
  format as `lead`, played by the style's arp in the lead's gaps), or use a style with arps.

**Original music only.** Nothing copied from real Pokémon tracks.

A song object:

```js
{ id: "ember-run", region: "johto", gym: 4, key: "Gm", title: "Ember Run", bpm: 152, bar: 4, style: "Fire",
  heat: { ez: 0.3, hd: 0.2 },
  parts: { I: { lead: "...", chords: "Gm D" },
           H: { lead: "... 4 bars ...", chords: "Gm Eb F D" },
           A: { lead: "...", chords: "...", hint: "arp" },           // the region's verse, quietly
           B: { lead: "...", answer: "...", chords: "..." },          // call and response
           O: { lead: "...", chords: "Gm Gm" } },
  form: "I H A H B H A H O" }
// a boss adds:    boss: true, form: "... relic C ...", line: "auto"
// a champion:     champion: true, two "flip"s, "H^2" for the last hook, and a part with motif: true
```

Two more knobs:
- **`style` on a part** plays that part in another style's band. Champion Blue's sections are
  each a Kanto gym's: `A: { style: "Rock" }`, `B: { style: "Water" }` and so on. The song's own
  style still sets the line.
- **`tune: { ez: { step, jack, chords, fillChords } }`** changes a difficulty's chart rules for
  one song. Use it when `heat` alone can't reach a level target. EZ still never has more than two
  keys at once. Champion Blue's EZ uses it to sit at Lv.5, and the Grass bosses' EZ to reach Lv.4.

`key` is the song's key: a root, plus `m` for minor (`"Em"`, `"C"`, `"F#m"`, `"Bb"`). The recipe
check reads it, and it moves the region's verse into the song's key.

## 3. The verses (story)

Each region has a **verse**: a 4-bar motif, that region's piece of the Relic Song (`REGIONS[..].verse`).
- **Gym songs** carry it quietly: `hint: "arp"` (or `"bass"`) on a part plays the motif under
  the band on a soft voice, moved into the song's key.
- **The region's boss break** sings it.
- **The champion song's last section** plays it in full: a part with `motif: true` takes the
  motif as its lead and chords.
- **The true final Relic Song** is built from all nine motifs in order (`finalVerses()`).

Moving a motif between keys goes through the relative major or minor when the modes differ, so a
minor motif in a major song stays a minor tune on the song's own chords (`keyShift`).

**Kanto's verse**, from the opening hook of the current Relic Song (so it fits the song it came from):

```
lead:   e5 - - g5 a5 - b5 - | a5 - g5 - e5 - - - | d5 - e5 - g5 - - a5 | b5 - a5 - g5 - - -
chords: Em C G D            key: Em
```

**In Kanto:**
- **The gym leaders** each keep a bar of the verse (the map's strip: "Bar 1 · Brock" … "The
  verse · Blue").
- **Every gym song** carries it as a `hint`.
- **Every boss** sings it at the break.
- **Champion Blue** plays it whole as his last section.
- **The final** sings `finalVerses()`: only Kanto's for now, with the other eight added there as
  their regions come.

For now, the final is the ending. It opens after Champion Blue, and Sssssssnakes opens after it.

## 4. Tokens

Relic Song pays **tokens**: `chips`, the arcade's collection tokens that Shotgun Roulette bets and
the Collector uses, shown to players as "tokens". The map's header shows the balance the way
Shotgun Roulette does ("Tokens N"). It paid Poké Gacha TD coins until the token switch. Those stay
with the players who earned them, and nothing converts them: coins never turn into chips.

Tokens follow the chart's real level, not its difficulty's name. `PAY` at the top of the game is
the one place to tune it.

- **First clear of a chart:** 2 × level², to the nearest 5, from the measured level, and never
  less than 5. Lv.1 5, Lv.2 10, Lv.6 70, Lv.10 200, Lv.15 450.
- **Rank tokens, IN and AT only:**
  - First A: +25% of that chart's clear pay.
  - First S: +50%.
  - An S that skips A pays both.
  - EZ and HD pay no rank tokens.
- **Bonuses:** badge +100, a champion's first clear +250, the final boss's first clear +500.
- **Meloetta's Lesson:** 50, once.
- **Hidden tracks** use the same formula, by level.
- **Test mode** pays nothing.

**Payment.** Every amount is paid once, through the hub's ledger (`grantOnce`); replays pay
nothing. The page sends a table that names every chart's amounts (`payTable()`) and says
`topUp: false`. Anything the ledger already paid, under this table or an older one, stays paid
and pays nothing more, so nobody loses anything and nothing is paid twice. Only new entries pay, at
today's amounts.

**Tokens and coins are separate entries.** The table says `unit: "chips"` (`UNIT` in the game), and
the hub pays it in chips under `rt:` entries. A table without a unit pays coins under `rs:`
entries, the way it did before tokens. A coin entry never stops a token entry, so every chart,
rank, badge, champion, the finale and the lesson paid tokens once, fresh, when the switch came in.
Every coin paid before stays where it is.

Ledger entries (tokens; `rs:` in place of `rt:` for the coins paid before):

| Entry | For |
|---|---|
| `rt:r2:clear:<song>:<diff>` | a chart's first clear |
| `rt:r2:rank:<song>:<diff>:<a\|s>` | a chart's first A or S |
| `rt:badge:<gym>` | a gym badge |
| `rt:champion:<region>` | a champion's first clear |
| `rt:finale` | the final boss's first clear |
| `rt:lesson` | Meloetta's Lesson |

**Ledger versions.** A chart's entries can carry a version: `rt:r2:clear:<song>:<diff>`. The game
sends `ledger: LEDGER` (now `"r2"`, the Kanto remaster). A rewritten chart then pays again once
under its new entry, while the old entries stay paid. Bump `LEDGER` only when charts are rewritten
and the save is reset with them. Badges, champions, the finale and the lesson have no version.

**The remaster reset (v2).**
- **The save** moved to `bored.relic-song.save.v2`. On the first load, a v1 save is deleted
  (bests, ranks, clears, badges, and with them the difficulty chain). The map then says
  "Relic Song got remastered! Your progress was reset so everyone starts fresh." once.
- **Kept:** the options save (keybinds, note skin, offset, the lesson, the tips).
- **Coins and tokens:** none are taken back.
- **The board:** the arcade lets go of its cached Relic Song best once per browser
  (`resetBoard` in `src/hub/relic-song.js`). `sql/relic-song-reset.sql` empties the board and
  each account's cloud copy of the best. Run it by hand, before the deploy.

## 5. Adding a region

Fill in:

1. **`REGIONS`:** `{ id, name, gyms: [gym indexes], verse: { lead, chords, key } }`. The verse is
   4 bars and original, and should hand on to the next region's, since all nine are sung in a row
   at the end.
2. **`GYMS`:** one entry per gym: `name`, `place`, `type`, `badge`, `ace` (dex number), `aceName`,
   `style` (a type, or `"Main/Second"` for a dual type), and `hello` (Meloetta's line on the map).
3. **`SONGS`:** per gym, two songs and a boss (`boss: true`), then a champion
   (`champion: true`, with `foe` for the boss sprite, and `before`/`after` lines; see Champion
   Blue).
   Every song sets `region`, `gym`, `key`, `bpm`, `style` and `heat`, and follows the recipe.
   - Gym songs carry the verse as a `hint`.
   - The boss has `relic` and `line: "auto"` (or its own line).
   - The champion has 2 flips, `H^2` into its last hook, and its last section is `motif: true`.
4. **Level targets.** Tune `heat` until the measured levels sit near `RECIPE.levels`:

   | Role | EZ | HD | IN | AT |
   |---|---|---|---|---|
   | song | 2 | 6 | | |
   | boss | 3 | 7 | 11 | |
   | champion | 4 | 9 | 12 | 14 |
   | final | 4 | 10 | 13 | 15 |

   Levels always stay inside their bands: EZ 1-5, HD 4-10, IN 9-13, AT 13-15.
5. **Check it:** run the script with `--strict` (every new song passes the recipe and the region's
   variety), run `tests/relic-song.test.cjs` (charts playable, lines readable, levels in their
   bands), and listen to it in the sound test.

The map still draws Kanto's four gyms and the champion card; showing more than one region on it is
part of adding the second region.

**Kanto's level path (the remaster).**

| Gym | Songs (EZ / HD) | Boss (EZ / HD / IN) |
|---|---|---|
| Brock | 1 / 2, 2 / 3 | 2 / 4 / 9 |
| Misty | 2 / 4, 3 / 5 | 3 / 6 / 10 |
| Lt. Surge | 3 / 5, 3 / 6 | 4 / 7 / 11 |
| Erika | 3 / 6, 4 / 7 | 4 / 8 / 12 |

Champion Blue is 5 / 9 / 12 / 14, and the final 4 / 10 / 13 / 15.

**Tokens a region adds.** Projected by the script from the level targets: about 840 for its story
on EZ and about 4,835 for 100% of it, against the remastered Kanto's 1,505 and 9,570 (the lesson,
Blue and the finale included).
