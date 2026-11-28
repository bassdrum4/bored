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

## Band songs (the new model, in testing)

Charts used to come from the melody plus filler. Each difficulty then added its own layers to the
music, and sounds were patched in under the filler. So many notes didn't land on anything you
could hear.

**A band song** (`band: true`; for now **Cerulean Current** and **Raichu Overload**) works like
Phigros. The song is one full arrangement, identical on every difficulty: melody, bass, drums
(kick, snare, hats) and an arp or chord part. The chart is taken from what that arrangement
already plays (`bandChart` in `build()`; the parts per difficulty are `BAND_ROLES`):

| Difficulty | Charted from |
|---|---|
| EZ | the melody's onsets (on a busy melody: the ones on the beat, and the long ones) |
| HD | + kick and snare |
| IN | + arp (and B's answer line) and bass |
| AT | + chord stabs and toms |

- **Never charted:** hats, ticks, pads, the break's verse, and the middle of a held note.
- **Playability:** the parts go in by role (melody first). Each note must pass the difficulty's
  rules (spacing, jacks, chord size, two keys per hand). One that doesn't fit is left out, and
  nothing is ever added to fill a gap.
- **Holds:** a held melody note is a hold, and its sound holds with it.
- **Water leads:** a band song's legato lead gets a short soft attack (`attack`), so its onsets
  are heard.
- **Tuning a level:** write the arrangement for it, never filler. Busier drums, bass or arp in a
  part (`drums`, `bassRun`, `arpRun`, `stab` on a part) raise HD, IN and AT.
- **No moved break:** on IN and AT a band song doesn't move its break earlier, since the song
  stays the same song.

**Can you hear every note?** `onsetCheck(song, diff)`, a test hook:
- **The render:** a chart's music is rendered offline, and onsets are found from jumps in the
  energy of the signal's slope.
- **By data:** whether a part that difficulty charts starts on each moment of the chart.
- **By render:** whether an onset is detected within 30 ms.
- **Targets for band songs:** 100% by data, 95%+ by render.

## The chart editor and hand charts

**Opening it:** turn on test mode, then go to Options → Help → **Chart editor**. Pick a song and
difficulty. It opens with the song's hand chart if there is one, otherwise the built chart.

**The timeline:**
- **Rows:** the highway's lanes. On the moving line (shaded) a note's lane picks its zone, and the
  dot shows the zone it got.
- **Grid:** beat and bar lines.
- **The music strip:** the song's level, with its onsets in gold. A note with no onset within
  30 ms has a red outline.
- **Info line:** note count, measured level, % on onsets, playability problems, and line notes
  left out of the zones.

**Controls:**

| Action | How |
|---|---|
| Play / pause | Space, at 0.25x, 0.5x, 0.75x or 1x, with an optional metronome |
| Scrub | click or drag the ruler |
| Scroll / zoom | the wheel / Ctrl+wheel |
| Snap | 1/4, 1/8, 1/12, 1/16 or off |
| Add a tap / a hold | click a lane / drag right |
| Select | click a note (Shift adds); Shift-drag box-selects |
| Move | drag the selection |
| Delete | Del |
| Copy / paste at the cursor | Ctrl+C / Ctrl+V |
| Undo / redo | Ctrl+Z / Ctrl+Y |
| Change kind | 1 tap, 2 hold, 3 drag |
| Change lane | ↑ / ↓ |
| Nudge by the snap | ← / → |

- **Record:** while playing, tap the lane keys to place notes; hold a key for a hold.
- **Regenerate from music:** a fresh built chart.
- **Test from cursor:** plays it in the game from that bar. Results and quitting come back to the
  editor.
- **Export JSON:** downloads `<song>-<diff>.json` and copies it to the clipboard.
- **Not edited yet:** the line's movement (v1 is notes only).

**Getting a hand chart into the game:**
1. Export it from the editor.
2. Give the file to OC (or add it yourself) as
   `src/games/content/relic-song-charts/<song>-<diff>.json`.
3. Add its name (`"<song>-<diff>"`) to `relic-song-charts/index.json`.

The game reads the index at start. A chart that checks out (the right song and difficulty,
lanes in range, kinds tap/hold/drag) takes the place of the built one, and its level is still
measured from it.

## Scoring (like Phigros)

**Judgments** (windows: Perfect ±70 ms, Great ±110, Good ±150):

| Judgment | Worth |
|---|---|
| Perfect | 100% of a note |
| Great | 75% |
| Good | 40% |
| Miss | 0 |

**Score** = 900,000 × accuracy + 100,000 × (max combo / notes).

**Ranks:**

| Rank | Score |
|---|---|
| V | 960,000 |
| S | 920,000 |
| A | 880,000 |
| B | 820,000 |
| C | 700,000 |

Under C isn't a clear, though a boss still clears on HP. **FC** (no Miss) and **AP** (all
Perfect) show on the results and the song row, and are kept with the best.

- **Rank tokens:** still on A and S, IN/AT only. V pays like an S, so it's bragging only.
- **Unlock chain:** IN at an A on HD, AT at an S on IN (V counts as S).
- **Bests:** keep their judgment counts. On the first load after this change, each stored best is
  re-ranked: from its counts if it has them, else its score under the new cutoffs (never below C
  for a clear). Tokens are never taken back.

## Key zones on the moving line

The moving line's zones are **regions of the keyboard**, matched by physical key (`e.code`), like
a tablet: where your hand sits on the keyboard is where the note is on screen. The player's lane
binds don't matter on the line. Any key in a region plays that region's zone.

| Zone | Keys (the keyboard's columns, left to right) |
|---|---|
| 1 | 1 2 3 Q W E A S D Z X C |
| 2 | 4 5 R T F G V B |
| 3 | 6 7 Y U H J N M |
| 4 | 8 9 0 - I O P [ K L ; ' , . / |

**Zones per difficulty:**

| Difficulty | Zones | Keys |
|---|---|---|
| EZ | 1 | any region key, Space, or a bound key |
| HD | 2 | left half (columns 1-5: zones 1+2) and right half (columns 6 on: zones 3+4) |
| IN, AT | 4 | the four regions above |

- **Columns or rows:** zones split the screen into columns. While the line is steeper than 60°,
  they turn into rows of the play area, top to bottom.
- **Several keys per zone:** every key in a region counts, so two fingers can share a zone. One key
  still plays one note: a chord across zones needs a key in each.
- **Never a zone key:** Esc, Tab, Caps Lock, Enter, Shift, Ctrl, Alt, the OS keys and the arrows.
- **R:** it sits in zone 2, so in play it's a note key. Retry (R) works only on the pause and
  results screens.
- **Options → Keyboard:** pick **Default (4 columns)** or **Mirrored**. The keyboard diagram shows
  the regions in their zone colours and doubles as the key test: held keys light up.
- **Wide lanes** (off by default): the highway uses the same regions instead of the exact
  keybinds. Four-lane charts take the 4 regions. Six-lane charts split the keyboard into 6, with
  the outer columns going to the outer lanes.

### Where a note sits

The chart builder (`zones()`) slides each line note along its line until its hit point lands in a
zone: its lane's zone first, then the nearest one that works.

- **Free position:** inside its zone a note goes by the music. Higher pitches sit further right; a
  note with no pitch goes by its lane. A little spread keeps repeats from stacking.
- **Margin (`ZONE_MARGIN`):** every note stays at least 8% of a zone's width away from its borders.
  That holds at the hit and 0.15 s before it, so no note crosses a border as it lands.
- **On screen:** the note stays inside the play area for the whole 0.6 s it falls in.
- **Chords:** no two notes of one moment share a zone, so chords spread across zones.
- **Jacks:** a zone isn't hit again sooner than the highway lets a lane be, and a hold keeps its
  zone until it ends.
- **Left out:** a note that fits nowhere drops from the chart; the music under it still plays.
  Drags take the zone they land in, and any key held in that zone catches them.

### Leniency bands

A note near a border also takes the neighbouring zone's keys (`lenientZone`):

- **Outer borders (`LENIENT`):** within 15% of the zone's width from the border.
- **Middle border (`MIDDLE`):** within 20%. That's the left hand | right hand split, where a
  player is most likely to reach across.
- **Judged at the hit:** the band uses the note's place at its hit time, not while it falls.
- **Chords:** leniency never lets one key take two notes.

With the 8% margin, a lenient note always sits between 8% and 15% (20% at the middle) of its zone
from a border. Everything closer to the middle of a zone takes only its own keys.

### What the player sees

- **Zone hint (`ZONE_HINT`):** a soft pastel glow, about 5 px, just above the bar (`pip`, the
  default) or a tint on the bar's two end caps (`caps`). The colours are muted pastels at 80%,
  with no outline, and the note keeps its own colour. A lenient note blends its two zones'
  colours half and half. `__relicSong.setHint('caps')` switches it in the console.
- **Grid:** the zones' faint borders and region labels show for a bar as the line takes over.
- **Tips:** a one-time tip explains zones. Tips and the first-flip cue are small banners under the
  combo, and battle text sits bottom left, so nothing covers the playfield.

**Levels:** line notes count by their zones (`LINE_WEIGHT`): any key 0.6, 2 zones 0.8, 4 zones
like a highway note. Jacks on the line count per zone.

## Hitsounds

Options picks one: **Auto (match the song)**, the default, or Tick, Wood or Clap. Preview plays
the current pick (Auto plays the Normal one).
- **Auto:** plays the song's type's hitsound (`AUTO_HITS`; a dual type uses its first). Champions
  clap, and the final plays Meloetta's soft bell.
- **What they are:** every hitsound is under 40 ms, at a fixed pitch (nothing sweeps).
- **Rules:** one click a chord, quieter on Good, softest on drags, their own volume, none in muted
  mode or during the calibration.
- **Sound test:** hold Shift to hear a song's Auto hitsound on every beat.

| Type | Auto hitsound | Type | Auto hitsound |
|---|---|---|---|
| Normal | tick | Psychic | tick with a short echo |
| Fire | crackle | Bug | clicky tick |
| Water | droplet | Rock | stone tock |
| Grass | shaker | Ghost | quiet tick, short tail |
| Electric | zap tick | Dragon | low punchy tock |
| Ice | glass ping | Dark | dull snap |
| Fighting | low thump | Steel | metallic clink |
| Poison | muted wobble | Fairy | music-box ping |
| Ground | low tock | Flying | air puff |

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
