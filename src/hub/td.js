// Poké Gacha tower defense: chapter 1 (Team Rocket grunts), chapter 2 (Proton,
// with flying enemies), chapter 3 (Petrel, with enemies that explode), chapter 4
// (Ariana, with armored enemies), the battle simulation, and the TD rewards and missions.
//
// The simulation is plain data stepped at a fixed rate, so it runs the same in
// the page and in tests. Classes come from each species' stats; nothing is
// hand-tagged except the healers. Rewards are wallet entries like every other
// grant (src/hub/rewards.js):
//   td:run:<uuid>             one finished battle: g = { waves }, x = { st, s, tm, d }
//                               stage, stars (0 = lost), team (species deployed), day
//   td:first:<stage>          first clear: 50 coins + 2 Regular
//   td:star3:<stage>          first 3-star: 100 coins + 1 Plus
//   td:admin:<stage>          first clear of a Rocket admin boss: 1 Gold (2-6 Proton)
//   td:daily:<day>:<id>|all   daily missions
//   td:week:<monday>:<id>|all weekly missions
//   spend:<uuid> x = { lv }   a level bought with coins
// 1 TD wave cleared = 1 hatch wave.
import { DEX, DEX_CHART, DEX_TYPES } from './gacha-dex.js';
import { dailyDate, seedNumber } from '../daily.js';
import { mergeWallet, walletBalance, grantOnce, spendFrom, readWallet, writeWallet } from './rewards.js';
import { gachaState, lineOf, mon, skillsOf, lookFor, stageOf, evolutionsOf } from './gacha.js';

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const seconds = now => Math.floor(now / 1000);
const uuid = () => globalThis.crypto?.randomUUID?.() || 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

/* ── Classes, derived from stats ─────────────────────────────────────── */

// The only hand-written list: the healers.
const HEALERS = new Set([113, 242, 440, 531]);
export const CLASSES = {
  vanguard: { name: 'Vanguard', ground: true, block: 1, range: 1.2, cost: 8, sp: 10, about: 'Cheap; its skill gives energy back.' },
  guard: { name: 'Guard', ground: true, block: 2, range: 1.2, cost: 13, sp: 20, about: 'Physical melee; blocks 2.' },
  blocker: { name: 'Blocker', ground: true, block: 3, range: 1.2, cost: 16, sp: 25, hp: 1.5, about: 'High HP and Defense; blocks 3.' },
  sniper: { name: 'Sniper', ground: false, block: 0, range: 3.2, cost: 12, sp: 20, air: true, about: 'Ranged physical; the only class that hits flying enemies.' },
  caster: { name: 'Caster', ground: false, block: 0, range: 2.6, cost: 17, sp: 25, splash: 0.9, about: 'Special Attack; hits an area.' },
  medic: { name: 'Medic', ground: false, block: 0, range: 2.6, cost: 15, sp: 20, heal: true, about: 'Heals allies in range.' }
};
export function classOf(num) {
  const m = mon(num);
  if (!m) return 'guard';
  if (HEALERS.has(num)) return 'medic';
  if (m.bst <= 360 && m.spe >= 70 && m.atk >= m.spa) return 'vanguard';
  if (m.hp + m.def > (m.atk + m.spa) * 1.15 && m.def >= 70) return 'blocker';
  if (m.spa > m.atk * 1.1) return 'caster';
  if (m.atk >= m.spa && m.spe >= m.def + 10) return 'sniper';
  return 'guard';
}

/* ── Chapter 1: the grunts ────────────────────────────────────────────── */

// Maps are 10×5 tiles: '#' no deploy, '.' ground (melee, and the path runs on
// it), 'H' high ground (ranged), 'S' where enemies come in, 'G' the goal.
// Waves: [seconds, species, count, gap between them, boss, flying, explodes, armored].
// Each line is one wave. A boss has its HP times 4; flying enemies cross the map
// in a straight line from their spawn to the goal, cannot be blocked, never
// attack, and only snipers can hit them. An exploding enemy lights a fuse when
// it is blocked (FUSE seconds); when the fuse runs out it blows up, hitting every
// unit within BLAST tiles for BLAST_POWER times its attack, and is gone. Killing
// it first defuses it, so ranged units and fast hitters matter. An armored enemy
// has its Defense times ARMOR against physical attacks; casters' special attacks
// ignore the armor, so tanky stages want casters.
export const CHAPTER = { id: 1, name: 'Team Rocket Grunts', boss: 'Grunt boss' };
export const STAGES = [
  { id: '1-1', name: 'First patrol', lives: 3, level: 1, map: ['##H##H####', 'S........G', '##H##H####', '##########', '##########'],
    waves: [[3, 19, 3, 3], [16, 19, 4, 2.5]],
    before: ['Grunt: Hey! This route belongs to Team Rocket now.', 'Deploy a mon on the path to block, or on high ground to shoot.'],
    after: ['Grunt: Tch. That was just the first patrol.'] },
  { id: '1-2', name: 'Tall grass', lives: 3, level: 1.05, map: ['##########', 'S....H####', '####.H####', '#H.......G', '###H######'],
    waves: [[3, 19, 4, 2.5], [14, 41, 3, 3], [28, 19, 5, 2]],
    before: ['Grunt: Zubat, swarm them!', 'Enemies follow the path around corners. Block where they turn.'],
    after: ['Grunt: The bats were supposed to win that.'] },
  { id: '1-3', name: 'Snake pit', lives: 3, level: 1.1, map: ['####H#####', 'S.......H#', '####H#.###', '#H.....H##', '#G...H####'],
    waves: [[3, 23, 3, 3], [15, 19, 5, 2], [30, 23, 4, 2.5]],
    before: ['Grunt: Ekans bite back. Good luck.', 'Type matchups count: Ground and Psychic hit Poison hard.'],
    after: ['Grunt: Fine, fine. You can pass.'] },
  { id: '1-4', name: 'Rock slide', lives: 3, level: 1.15, map: ['##H###H###', 'S........#', '##H#.##H.#', '###H.....G', '##########'],
    waves: [[3, 27, 3, 3.5], [16, 19, 6, 1.8], [32, 27, 4, 3]],
    before: ['Grunt: Sandshrew shrugs off weak hits.', 'Casters and strong hitters break through high Defense.'],
    after: ['Grunt: My Sandshrew curled up and quit!'] },
  { id: '1-5', name: 'Fast feet', lives: 3, level: 1.2, map: ['#H#H#H#H##', 'S........G', '#H#H#H#H##', '##########', '##########'],
    waves: [[3, 52, 4, 2], [14, 21, 5, 1.8], [28, 52, 6, 1.5]],
    before: ['Grunt: Meowth and Spearow are faster than you.', 'Fast waves need blockers early on the path.'],
    after: ['Grunt: How did you keep up with that?'] },
  { id: '1-6', name: 'Two lanes', lives: 3, level: 1.45, map: ['S...H#####', '###....H##', '#H#H#.....', 'S.....H#.G', '#####H####'],
    waves: [[3, 23, 4, 2.5], [10, 41, 4, 2.5], [24, 19, 7, 1.5], [38, 27, 3, 3]],
    before: ['Grunt: Two paths, and you can only block so many!', 'Enemies come in from both ends of the map.'],
    after: ['Grunt: The boss will hear about this.'] },
  { id: '1-7', name: 'Night shift', lives: 3, level: 1.55, map: ['##H##H##H#', 'S.........', '##H##H##.#', '#G.......#', '###H##H###'],
    waves: [[3, 52, 5, 1.8], [16, 23, 5, 2], [30, 27, 4, 2.5], [44, 41, 7, 1.2]],
    before: ['Grunt: Everything we have, all at once!', 'Medics keep blockers standing through long waves.'],
    after: ['Grunt: Run! Tell the boss a trainer is coming!'] },
  { id: '1-8', name: 'Grunt boss', boss: true, lives: 3, level: 1.8, map: ['##H#H#H###', 'S........#', '#H#H.#H#.#', '#.......H#', '#G..H#####'],
    waves: [[3, 19, 6, 1.5], [16, 23, 5, 2], [30, 52, 5, 1.6], [42, 20, 1, 1, 6]],
    before: ['Grunt Boss: So you are the one beating my grunts.', 'Grunt Boss: Raticate, show them what Team Rocket can do!', 'The boss Raticate has four times the HP. Save your skills for it.'],
    after: ['Grunt Boss: Impossible... This is not over. The admins will deal with you.', 'Chapter 1 cleared. More of Team Rocket is coming.'] },

  /* ── Chapter 2: Proton (poison, and bats that fly) ───────────────────── */
  { id: '2-1', chapter: 2, name: 'Bat cave', lives: 3, level: 1.55, map: ['##H##H####', 'S........G', '##H##H##H#', '##########', '##########'],
    waves: [[3, 19, 3, 3], [12, 41, 3, 3, 0, 1], [26, 41, 4, 2.5, 0, 1]],
    before: ['Proton: Team Rocket\'s scariest admin is here. That would be me.', 'Zubat fly over the path: blockers cannot stop them. Only snipers can hit flying enemies.'],
    after: ['Proton: Lucky. My bats were only warming up.'] },
  { id: '2-2', chapter: 2, name: 'Sludge pipe', lives: 3, level: 1.75, map: ['S...H#####', '###.H#####', '#H#.....H#', '####H##..G', '##########'],
    waves: [[3, 88, 3, 3.5], [14, 41, 4, 2.5, 0, 1], [28, 88, 4, 3], [40, 41, 5, 2, 0, 1]],
    before: ['Grunt: Grimer, ooze all over them!', 'Flying enemies cut straight across the map. Put snipers near that line.'],
    after: ['Grunt: Ugh. Now I have to clean the pipe.'] },
  { id: '2-3', chapter: 2, name: 'Bug net', lives: 3, level: 1.8, map: ['##H##H##H#', 'S........#', '#H##H###.#', '#####H...G', '##########'],
    waves: [[3, 48, 4, 2.5], [15, 21, 4, 2, 0, 1], [28, 48, 5, 2], [40, 21, 5, 1.8, 0, 1]],
    before: ['Grunt: Venonat on the ground, Spearow in the air. Pick one!', 'Fire and Flying moves hit Bug hard. Rock and Electric hit Flying.'],
    after: ['Grunt: You were supposed to pick one.'] },
  { id: '2-4', chapter: 2, name: 'Two skies', lives: 3, level: 1.9, map: ['S....H####', '####.H##H#', '#H#H......', 'S.......#G', '####H#####'],
    waves: [[3, 23, 3, 3], [10, 42, 3, 3, 0, 1], [22, 23, 5, 2], [34, 42, 4, 2.5, 0, 1]],
    before: ['Proton: Two entrances, and Golbat over both.', 'Enemies come from two spawns, and each flies its own line.'],
    after: ['Proton: Hmph. Fine. The fog will finish you.'] },
  { id: '2-5', chapter: 2, name: 'Toxic fog', lives: 3, level: 2.0, map: ['##H#H#H###', 'S........#', '#H##H##H.#', '#G.......#', '####H#####'],
    waves: [[3, 109, 4, 3], [14, 42, 4, 2.2, 0, 1], [26, 24, 4, 2.5], [38, 109, 5, 2], [46, 42, 5, 1.8, 0, 1]],
    before: ['Grunt: Koffing! Arbok! Make it hard to breathe!', 'A long winding path gives your casters time. Keep snipers for the Golbat.'],
    after: ['Grunt: Cough. Get the admin. Cough.'] },
  { id: '2-6', chapter: 2, name: 'Proton', boss: true, admin: true, lives: 3, level: 2.25,
    map: ['#H#H#H#H##', 'S........G', '#H#H#.#H.#', 'S.......H#', '####H#####'],
    waves: [[3, 88, 3, 3], [14, 41, 4, 2.5, 0, 1], [26, 42, 4, 2, 0, 1], [36, 24, 4, 2.5], [48, 110, 1, 1, 1]],
    before: ['Proton: You got this far? Then I will stop you myself.', 'Proton: Weezing, cover them in smog!', 'The boss Weezing has four times the HP. Bats come over both lanes before it.'],
    after: ['Proton: How...? Petrel will not be so soft on you.', 'Chapter 2 cleared. Team Rocket\'s other admins are waiting.'] },

  /* ── Chapter 3: Petrel (smoke, sparks, and things that blow up) ──────── */
  { id: '3-1', chapter: 3, name: 'Smoke alarm', lives: 3, level: 2.2, map: ['#H##H##H##', 'S........G', '#H##H##H##', '##########', '##########'],
    waves: [[3, 109, 3, 3, 0, 0, 1], [14, 88, 3, 3], [26, 109, 4, 2.5, 0, 0, 1]],
    before: ['Petrel: Did you think Proton was the worst of us? Meet my Koffing.', 'Koffing light a fuse when they are blocked, then explode on everything nearby. Shoot them before they reach your blockers.'],
    after: ['Petrel: Fine. That was a drill.'] },
  { id: '3-2', chapter: 3, name: 'Spark plant', lives: 3, level: 2.3, map: ['S....H####', '####.H##H#', '#H#H.....G', '##########', '##########'],
    waves: [[3, 81, 4, 2.5], [14, 100, 4, 2, 0, 0, 1], [28, 81, 4, 2], [38, 100, 5, 1.8, 0, 0, 1]],
    before: ['Grunt: Voltorb! Magnemite! Short them out!', 'Ground moves hit Electric hard. A blocker with high HP survives a blast.'],
    after: ['Grunt: The whole plant blew a fuse.'] },
  { id: '3-3', chapter: 3, name: 'Sludge works', lives: 3, level: 2.4, map: ['#H#H##H#H#', 'S.........', '####H#H#.#', '#G.......#', '###H#H####'],
    waves: [[3, 88, 4, 3], [12, 41, 3, 3, 0, 1], [22, 109, 4, 2.5, 0, 0, 1], [34, 89, 2, 4], [44, 41, 3, 2.5, 0, 1]],
    before: ['Grunt: Muk is slow. Muk is also very, very hard to stop.', 'Bats overhead and Koffing on the path: snipers for one, casters for the other.'],
    after: ['Grunt: I need a shower.'] },
  { id: '3-4', chapter: 3, name: 'Two fuses', lives: 3, level: 2.5, map: ['S...H#####', '###.H##H##', '#H#......G', 'S.....H#.#', '#####H####'],
    waves: [[3, 100, 4, 2.5, 0, 0, 1], [12, 81, 4, 2.5], [24, 101, 4, 2, 0, 0, 1], [36, 82, 2, 4]],
    before: ['Petrel: Electrode are fast, and they do not stop to think.', 'Two spawns. Electrode run, so hit them early.'],
    after: ['Petrel: Grr. My radio tower is still mine!'] },
  { id: '3-5', chapter: 3, name: 'Smog bank', lives: 3, level: 2.15, map: ['##H##H##H#', 'S........#', '#H#H#H#H.#', '#........G', '####H#####'],
    waves: [[3, 89, 3, 3.5], [12, 110, 3, 3, 0, 0, 1], [24, 41, 3, 2.5, 0, 1], [34, 110, 4, 2.5, 0, 0, 1], [46, 89, 3, 3]],
    before: ['Grunt: Weezing explode twice as hard as Koffing. Good luck.', 'Spread your blockers out: a blast hits every unit near it.'],
    after: ['Grunt: The admin is upstairs. He is... not himself today.'] },
  { id: '3-6', chapter: 3, name: 'Petrel', boss: true, admin: true, lives: 3, level: 2.3,
    map: ['S...H#H###', '###.....H#', '#H#H.#H.##', 'S.....H..G', '####H#####'],
    waves: [[3, 109, 4, 2.5, 0, 0, 1], [12, 41, 3, 2.5, 0, 1], [24, 101, 4, 2, 0, 0, 1], [36, 89, 3, 3], [48, 110, 1, 1, 1]],
    before: ['Petrel: Kneel before Giovanni! ...Fine. It is a costume.', 'Petrel: Weezing, smog them out!', 'The boss Weezing has four times the HP and does not explode. Its Koffing and Electrode do.'],
    after: ['Petrel: Ariana will make you pay for this.', 'Chapter 3 cleared. One more admin stands between you and the boss.'] },

  /* ── Chapter 4: Ariana (Arbok, and mons that shrug off hits) ─────────── */
  { id: '4-1', chapter: 4, name: 'Rock wall', lives: 3, level: 2.3, map: ['##H##H##H#', 'S........G', '##H##H##H#', '##########', '##########'],
    waves: [[3, 23, 3, 3], [14, 75, 2, 4, 0, 0, 0, 1], [28, 24, 3, 3], [40, 75, 3, 3, 0, 0, 0, 1]],
    before: ['Ariana: Petrel always did talk too much. I prefer walls.', 'Graveler are armored: physical hits barely scratch them. Casters\' special attacks go straight through.'],
    after: ['Ariana: A crack in the wall. Nothing more.'] },
  { id: '4-2', chapter: 4, name: 'Garden of thorns', lives: 3, level: 2.25, map: ['S...H#####', '###.H##H##', '#H#......G', '#####H####', '##########'],
    waves: [[3, 43, 3, 3], [14, 95, 2, 4, 0, 0, 0, 1], [26, 45, 3, 3], [38, 95, 2, 4, 0, 0, 0, 1]],
    before: ['Grunt: Vileplume in the garden, Onix in the rocks.', 'Fire and Flying burn Grass. Water and Grass wear down Rock.'],
    after: ['Grunt: My garden...'] },
  { id: '4-3', chapter: 4, name: 'Night market', lives: 3, level: 1.9, map: ['#H#H#H#H##', 'S........G', '#H##.#H#H#', '####H#####', '##########'],
    waves: [[3, 23, 3, 3], [12, 198, 2, 3, 0, 1], [24, 75, 2, 4, 0, 0, 0, 1], [36, 24, 3, 3], [44, 198, 3, 3, 0, 1]],
    before: ['Grunt: Murkrow steal from the sky. Arbok guard the stalls.', 'Snipers for the Murkrow, casters for the Graveler.'],
    after: ['Grunt: Closing time.'] },
  { id: '4-4', chapter: 4, name: 'Quarry', lives: 3, level: 2.45, map: ['S...H#####', '###.H##H##', '#H#......G', 'S.....H#.#', '#####H####'],
    waves: [[3, 74, 3, 3, 0, 0, 0, 1], [12, 23, 4, 2.5], [24, 95, 2, 4, 0, 0, 0, 1], [36, 110, 2, 4, 0, 0, 1]],
    before: ['Ariana: Rock from both sides, and a Weezing for old times\' sake.', 'Two spawns. Armored mons on both, and a Weezing that explodes.'],
    after: ['Ariana: You are more stubborn than my Onix.'] },
  { id: '4-5', chapter: 4, name: 'Iron path', lives: 3, level: 1.95, map: ['##H##H##H#', 'S........#', '#H#H#H#H.#', '#G.......#', '####H#####'],
    waves: [[3, 74, 3, 3.5, 0, 0, 0, 1], [14, 198, 3, 2.5, 0, 1], [26, 24, 4, 2.5], [38, 95, 3, 3, 0, 0, 0, 1], [48, 45, 3, 3]],
    before: ['Grunt: The long way round. Every step of it guarded.', 'A long path gives casters time to wear the armor down.'],
    after: ['Grunt: The admin is waiting at the end of the path.'] },
  { id: '4-6', chapter: 4, name: 'Ariana', boss: true, admin: true, lives: 3, level: 2.35,
    map: ['S...H#H###', '###.....H#', '#H#H.#H.##', 'S.....H..G', '####H#####'],
    waves: [[3, 74, 3, 3, 0, 0, 0, 1], [12, 198, 3, 2.5, 0, 1], [24, 45, 3, 3], [36, 95, 2, 4, 0, 0, 0, 1], [48, 24, 1, 1, 1, 0, 0, 1]],
    before: ['Ariana: You have beaten three admins. You will not beat the fourth.', 'Ariana: Arbok, wrap them up!', 'The boss Arbok has four times the HP and is armored: bring casters.'],
    after: ['Ariana: Impossible... Giovanni must hear of this.', 'Chapter 4 cleared. Only Archer and the boss himself remain.'] },

  /* ── Chapter 5: Archer (Houndoom, fire and dark, and fast waves) ─────── */
  // A ninth wave field: fast. Fast enemies run at 1.5x speed; block them early.
  { id: '5-1', chapter: 5, name: 'Ember alley', lives: 3, level: 2.25, map: ['##H##H##H#', 'S........G', '##H##H##H#', '##########', '##########'],
    waves: [[3, 228, 3, 2.5], [14, 20, 4, 1.5, 0, 0, 0, 0, 1], [26, 228, 4, 2], [38, 20, 5, 1.2, 0, 0, 0, 0, 1]],
    before: ['Archer: Ariana let you through? I will not be so slow.', 'Fast enemies run half again as quick. Block them early on the path, before they build speed past your snipers.'],
    after: ['Archer: Quick feet. We will see how long they last.'] },
  { id: '5-2', chapter: 5, name: 'Racetrack', lives: 3, level: 2.6, map: ['##H#H#H###', 'S........#', '#H#H.#H#.#', '#.......H#', '#G..H#####'],
    waves: [[3, 77, 3, 2, 0, 0, 0, 0, 1], [14, 58, 4, 2.5], [26, 77, 4, 1.6, 0, 0, 0, 0, 1], [40, 78, 2, 3, 0, 0, 0, 0, 1]],
    before: ['Grunt: Ponyta are the fastest thing on four legs.', 'Water and Ground douse Fire. Rock stands up to it.'],
    after: ['Grunt: They were supposed to win the race...'] },
  { id: '5-3', chapter: 5, name: 'Black wings', lives: 3, level: 2.6, map: ['##H##H##H#', 'S........#', '#H#H#H#H.#', '#........G', '####H#####'],
    waves: [[3, 198, 3, 2.5, 0, 1], [14, 228, 4, 2, 0, 0, 0, 0, 1], [26, 198, 3, 2, 0, 1], [38, 215, 3, 2, 0, 0, 0, 0, 1]],
    before: ['Grunt: Murkrow overhead, Houndour underfoot.', 'Snipers for the Murkrow. Fighting hits Dark hard.'],
    after: ['Grunt: The flock scattered!'] },
  { id: '5-4', chapter: 5, name: 'Blackout', lives: 3, level: 2.5, map: ['S...H#####', '###.H##H##', '#H#......G', 'S.....H#.#', '#####H####'],
    waves: [[3, 109, 3, 3], [12, 101, 2, 3, 0, 0, 1, 0, 1], [24, 228, 4, 2, 0, 0, 0, 0, 1], [36, 101, 3, 2.5, 0, 0, 1, 0, 1]],
    before: ['Archer: The power plant is ours. Electrode, light them up.', 'Electrode are fast and they explode. Kill them before they reach a blocker.'],
    after: ['Archer: Lights out for my Electrode. Not for me.'] },
  { id: '5-5', chapter: 5, name: 'Two fires', lives: 3, level: 2.6, map: ['S...H#####', '###....H##', '#H#H#.....', 'S.....H#.G', '#####H####'],
    waves: [[3, 58, 4, 2.5], [10, 228, 4, 2, 0, 0, 0, 0, 1], [22, 215, 3, 2, 0, 0, 0, 0, 1], [34, 78, 3, 2.5, 0, 0, 0, 0, 1], [46, 198, 3, 2, 0, 1]],
    before: ['Grunt: Fire from the left, fire from the right!', 'Two spawns, fast waves on both. A vanguard buys time while the energy comes in.'],
    after: ['Grunt: Archer is going to be furious.'] },
  { id: '5-6', chapter: 5, name: 'Archer', boss: true, admin: true, lives: 3, level: 2.6,
    map: ['S...H#H###', '###.....H#', '#H#H.#H.##', 'S.....H..G', '####H#####'],
    waves: [[3, 228, 4, 2, 0, 0, 0, 0, 1], [14, 198, 3, 2, 0, 1], [26, 101, 2, 3, 0, 0, 1, 0, 1], [38, 215, 3, 2, 0, 0, 0, 0, 1], [50, 229, 1, 1, 1]],
    before: ['Archer: I lead Team Rocket while Giovanni is away. You end here.', 'Archer: Houndoom, burn it all down!', 'The boss Houndoom has four times the HP. Fighting, Water, Ground and Rock hit it hard.'],
    after: ['Archer: Giovanni... forgive me.', 'Chapter 5 cleared. Giovanni is waiting at the hideout.'] },

  /* ── Chapter 6: Giovanni (ground, and everything Team Rocket has) ────── */
  { id: '6-1', chapter: 6, name: 'Underground', lives: 3, level: 2.4, map: ['##########', 'S....H####', '####.H####', '#H.......G', '###H######'],
    waves: [[3, 50, 4, 2, 0, 0, 0, 0, 1], [14, 27, 4, 2.5], [26, 50, 5, 1.5, 0, 0, 0, 0, 1], [38, 28, 3, 3]],
    before: ['Grunt: The boss built his hideout under the ground. So do his mons.', 'Ground types: Water, Grass and Ice hit them hard. Flying units are not hit at all.'],
    after: ['Grunt: You dug your way through?'] },
  { id: '6-2', chapter: 6, name: 'Bone yard', lives: 3, level: 2.0, map: ['####H#####', 'S.......H#', '####H#.###', '#H.....H##', '#G...H####'],
    waves: [[3, 104, 4, 2.5], [16, 41, 3, 2.5, 0, 1], [28, 105, 2, 3], [40, 104, 4, 2]],
    before: ['Grunt: Cubone and Zubat. The boss keeps strange pets.', 'Snipers for the Zubat, and Water or Grass for the Marowak.'],
    after: ['Grunt: Bones everywhere...'] },
  { id: '6-3', chapter: 6, name: 'Earth tremor', lives: 3, level: 2.3, map: ['##H##H##H#', 'S........#', '#H#H#H#H.#', '#G.......#', '####H#####'],
    waves: [[3, 33, 4, 2.5], [14, 111, 2, 4, 0, 0, 0, 1], [26, 32, 5, 2], [38, 111, 3, 3.5, 0, 0, 0, 1]],
    before: ['Grunt: Rhyhorn charge, and nothing stops them.', 'Rhyhorn are armored. Casters go through; Water and Grass break them.'],
    after: ['Grunt: The ground stopped shaking.'] },
  { id: '6-4', chapter: 6, name: 'Silph basement', lives: 3, level: 2.05, map: ['S...H#####', '###.H##H##', '#H#......G', 'S.....H#.#', '#####H####'],
    waves: [[3, 51, 3, 2, 0, 0, 0, 0, 1], [12, 110, 2, 3.5, 0, 0, 1], [24, 31, 3, 3], [36, 51, 4, 1.8, 0, 0, 0, 0, 1], [46, 110, 2, 3, 0, 0, 1]],
    before: ['Grunt: The boss is right through that door. You will never reach it.', 'Fast Dugtrio, exploding Weezing, and two ways in.'],
    after: ['Grunt: Go on, then. He is expecting you.'] },
  { id: '6-5', chapter: 6, name: 'Last guard', lives: 3, level: 2.0, map: ['##H##H##H#', 'S.........', '##H##H##.#', '#G.......#', '###H##H###'],
    waves: [[3, 53, 3, 2, 0, 0, 0, 0, 1], [14, 41, 3, 2.5, 0, 1], [26, 111, 2, 3, 0, 0, 0, 1], [38, 33, 3, 2.5], [48, 53, 3, 1.8, 0, 0, 0, 0, 1]],
    before: ['Grunt: Every grunt left in Kanto is in this hall.', 'Persian run fast, Zubat fly, Rhyhorn are armored. Bring a bit of everything.'],
    after: ['Grunt: The boss... is all that is left.'] },
  { id: '6-6', chapter: 6, name: 'Giovanni', boss: true, admin: true, final: true, lives: 3, level: 2.3,
    map: ['S....H####', '####.H##H#', '#H#H......', 'S.......#G', '####H#####'],
    waves: [[3, 51, 4, 2, 0, 0, 0, 0, 1], [14, 42, 3, 2, 0, 1], [26, 31, 3, 3], [36, 110, 2, 3, 0, 0, 1], [46, 34, 3, 3], [58, 112, 1, 1, 1, 0, 0, 1]],
    before: ['Giovanni: So you are the one who took Team Rocket apart.', 'Giovanni: I am Giovanni. Rhydon, show this child what real power is.',
      'The boss Rhydon has four times the HP and is armored: casters, and Water or Grass.'],
    after: ['Giovanni: ...Ha. Ha ha. You have beaten me.', 'Giovanni: Team Rocket is finished. I will go, and train alone, until I am worthy of a rematch.'],
    // Shown once, the first time 6-6 is cleared.
    ending: ['Team Rocket is gone from Kanto. The routes are quiet again.', 'Your squad rests. The eggs keep hatching, and the weekly challenge still runs.',
      'Thanks for playing the Poké Gacha story.'] }
];
// Chapters in order, each with its stages. Stages unlock in the order of STAGES.
export const CHAPTERS = [
  { id: 1, name: 'Team Rocket Grunts', admin: 'Grunts', stages: STAGES.filter(s => (s.chapter || 1) === 1) },
  { id: 2, name: 'Proton', admin: 'Proton', stages: STAGES.filter(s => s.chapter === 2) },
  { id: 3, name: 'Petrel', admin: 'Petrel', stages: STAGES.filter(s => s.chapter === 3) },
  { id: 4, name: 'Ariana', admin: 'Ariana', stages: STAGES.filter(s => s.chapter === 4) },
  { id: 5, name: 'Archer', admin: 'Archer', stages: STAGES.filter(s => s.chapter === 5) },
  { id: 6, name: 'Giovanni', admin: 'Giovanni', stages: STAGES.filter(s => s.chapter === 6) }
];
// Armored enemies' Defense against physical attacks; casters ignore it.
export const ARMOR = 3;
const defenceAgainst = (u, e) => e.def * (e.armored && u.cls !== 'caster' ? ARMOR : 1);
export const FUSE = 2.5, BLAST = 1.5, BLAST_POWER = 3;
// Fast enemies' speed against their species' own.
export const FAST = 1.5;
export const stageById = id => STAGES.find(stage => stage.id === id) || null;
export const W = 10, H = 5;

// The path from each spawn to the goal over ground tiles (breadth-first, so the shortest).
export function pathsOf(stage) {
  const at = (x, y) => (stage.map[y] || '')[x] || '#';
  const walk = (x, y) => ['.', 'S', 'G'].includes(at(x, y));
  let goal = null;
  const spawns = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { if (at(x, y) === 'G') goal = [x, y]; if (at(x, y) === 'S') spawns.push([x, y]); }
  return spawns.map(([sx, sy]) => {
    const prev = new Map([[sx + ',' + sy, null]]);
    const queue = [[sx, sy]];
    while (queue.length) {
      const [x, y] = queue.shift();
      if (x === goal[0] && y === goal[1]) break;
      for (const [dx, dy] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const nx = x + dx, ny = y + dy, key = nx + ',' + ny;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev.has(key) || !walk(nx, ny)) continue;
        prev.set(key, [x, y]);
        queue.push([nx, ny]);
      }
    }
    const path = [];
    for (let cell = goal; cell; cell = prev.get(cell[0] + ',' + cell[1])) path.unshift(cell);
    return path;
  });
}

/* ── Units and enemies ────────────────────────────────────────────────── */

const typeIndex = name => DEX_TYPES.indexOf(name);
// Attack type against a defender's types: the chart's 0, h, 1, 2. Immunity is
// softened to a quarter so no stage can be impossible.
export function typeMultiplier(attack, defend) {
  const row = DEX_CHART[typeIndex(attack)];
  if (!row) return 1;
  return defend.reduce((m, type) => {
    const c = row[typeIndex(type)];
    return m * (c === '0' ? 0.25 : c === 'h' ? 0.5 : c === '2' ? 2 : 1);
  }, 1);
}
export const MAX_LEVEL = 10;
export const levelCost = level => 40 * level;
// Level caps by the most evolved form owned: 5 for a base form that can still evolve, 8 for a
// middle form, 10 once a final form is owned (a line that never evolves is final at once).
// Levels bought before the caps existed are kept; the cap only stops buying more.
export const LEVEL_CAPS = [5, 8, MAX_LEVEL];
export function lineCap(state, line) {
  const forms = (state.owned || []).filter(num => lineOf(num) === line);
  if (!forms.length) return LEVEL_CAPS[0];
  if (forms.some(num => !evolutionsOf(num).length)) return MAX_LEVEL;
  return LEVEL_CAPS[Math.min(LEVEL_CAPS.length, Math.max(...forms.map(stageOf))) - 1];
}
// The four skill slots play differently: power (damage, healing or energy) and charge (how much
// SP the skill needs, against the class's own). Steady is today's effect; quick fires more often
// for less; heavy hits harder and takes longer; the rare skill is stronger at the normal charge.
export const SKILL_KINDS = [
  { id: 'steady', name: 'Steady', power: 1, charge: 1 },
  { id: 'quick', name: 'Quick', power: 0.8, charge: 0.7 },
  { id: 'heavy', name: 'Heavy', power: 1.3, charge: 1.35 },
  { id: 'rare', name: 'Rare', power: 1.3, charge: 1 }
];

/** A squad member's battle stats: level from coins, passive and cost cuts from candy. */
export function unitStats(num, { level = 1, passive = false, costCut = 0, skills = [true, false, false, false], skill = null } = {}) {
  const m = mon(num), cls = classOf(num), c = CLASSES[cls];
  const grow = 1 + 0.08 * (level - 1);
  const special = cls === 'caster' || cls === 'medic';
  // The chosen skill if it is unlocked; else the rare one if unlocked; else the first.
  const skillAt = Number.isInteger(skill) && skills[skill] ? skill : skills[3] ? 3 : 0;
  const kind = SKILL_KINDS[skillAt];
  return {
    num, cls, name: m.name, types: m.types,
    hp: Math.round((m.hp * 5 + 140) * grow * (c.hp || 1)),
    atk: Math.round((special ? m.spa : m.atk) * 1.3 * grow * (passive ? 1.1 : 1)),
    def: Math.round(m.def * 0.6 * grow),
    interval: Math.max(0.6, Math.min(1.6, 1.7 - m.spe / 140)),
    cost: Math.max(4, c.cost + Math.round(m.bst / 160) - 2 - costCut),
    block: c.block, range: c.range, ground: c.ground, spMax: Math.round(c.sp * kind.charge),
    skill: skillsOf(num)[skillAt], skillAt, skillKind: kind.id, power: kind.power, rare: skillAt === 3
  };
}
export function enemyStats(num, level, boss = false, flying = false) {
  const m = mon(num);
  return {
    num, name: m.name, types: m.types, flying: !!flying,
    hp: Math.round((m.hp * 3 + 50) * level * (boss ? 4 : 1)),
    atk: Math.round(m.atk * 0.9 * level * (boss ? 1.5 : 1)),
    def: Math.round(m.def * 0.5 * level),
    speed: 0.45 + m.spe / 260,
    interval: 1.2
  };
}
const hit = (atk, def, mult) => Math.max(1, Math.round(Math.max(atk * 0.2, atk - def * 0.6) * mult));

/* ── The battle ──────────────────────────────────────────────────────── */

export const TICK = 0.05;
export const REDEPLOY = 18;
export const START_ENERGY = 10;

/** A fresh battle. `squad` is up to 8 unitStats(). */
/* ── The weekly challenge: one stage a week, with stacking risk modifiers ── */
// Like Arknights' Contingency Contract: pick any risks, win, and the risk total is
// the week's score. RISKS are applied by newBattle/step/canDeploy through b.mods.
export const RISKS = [
  { id: 'hp', label: 'Enemies have 30% more HP', risk: 1 },
  { id: 'atk', label: 'Enemies hit 30% harder', risk: 1 },
  { id: 'cost', label: 'Deploying costs 3 more', risk: 1 },
  { id: 'nomedic', label: 'No medics', risk: 1 },
  { id: 'fast', label: 'Enemies move 20% faster', risk: 2 },
  { id: 'energy', label: 'Energy refills 25% slower', risk: 2 },
  { id: 'six', label: 'At most 6 units on the field', risk: 2 },
  { id: 'onelife', label: 'One life', risk: 3 }
];
// The most risk a run can carry: every modifier at once.
export const MAX_RISK = RISKS.reduce((n, r) => n + r.risk, 0);
// The weekly challenge opens once the chapter 1 boss is cleared.
export const WEEKLY_UNLOCK = '1-8';
// Risk milestones: a win at or above each total pays once a week (ledger id
// td:wkm:<monday>:<index>). About 25%, 50%, 75% and 90% of MAX_RISK (13).
export const WEEKLY_MILESTONES = [
  { risk: 3, grant: { plus: 1 }, label: '1 Plus voucher' },
  { risk: 7, grant: { premium: 1 }, label: '1 Premium voucher' },
  { risk: 10, grant: { gold: 1 }, label: '1 Gold voucher' },
  { risk: 12, grant: { shards: 50 }, label: '50 shards' }
];
export const riskOf = mods => RISKS.filter(r => mods.includes(r.id)).reduce((n, r) => n + r.risk, 0);
/** This week's challenge: a non-boss story stage picked from the Monday's seed, the same for everyone. */
export function weeklyStage(monday) {
  const pool = STAGES.filter(s => !s.boss);
  const base = pool[(seedNumber('td-week:' + monday) >>> 0) % pool.length];
  return { ...base, id: 'W-' + monday, base: base.id, name: 'Weekly: ' + base.name, weekly: true,
    before: ['A Rocket squad is holding ' + base.name + ' this week. Add risks for a higher score.'], after: ['Challenge cleared.'] };
}
const costOf = (b, u) => u.cost + (b.mods.has('cost') ? 3 : 0);

export function newBattle(stage, squad, mods = []) {
  const paths = pathsOf(stage);
  const queue = [];
  stage.waves.forEach(([at, num, count, gap, boss, flying, explodes, armored, fast], wave) => {
    for (let i = 0; i < count; i++) queue.push({ at: at + i * gap, num, wave, path: (i + wave) % paths.length, boss: !!boss, flying: !!flying, explodes: !!explodes, armored: !!armored, fast: !!fast });
  });
  queue.sort((a, b) => a.at - b.at);
  const set = new Set(mods.filter(id => RISKS.some(r => r.id === id)));
  return { stage, paths, squad: squad.slice(0, 8), t: 0, energy: START_ENERGY, life: set.has('onelife') ? 1 : stage.lives, queue, spawned: 0,
    units: [], enemies: [], waveLeft: stage.waves.map(w => w[2]), wavesDone: 0, leaks: 0, kills: 0,
    deployed: new Set(), cooldown: {}, nextId: 1, over: null, log: [], mods: set };
}
const tileAt = (b, x, y) => (b.stage.map[y] || '')[x] || '#';
export function canDeploy(b, slot, x, y) {
  const u = b.squad[slot];
  if (!u || b.over) return 'none';
  if (b.units.some(unit => unit.slot === slot)) return 'deployed';
  if ((b.cooldown[slot] || 0) > b.t) return 'cooldown';
  if (b.mods?.has('nomedic') && u.cls === 'medic') return 'banned';
  if (b.mods?.has('six') && b.units.length >= 6) return 'full';
  if (b.energy < (b.mods ? costOf(b, u) : u.cost)) return 'energy';
  const tile = tileAt(b, x, y);
  if (u.ground ? tile !== '.' : tile !== 'H') return 'tile';
  if (b.units.some(unit => unit.x === x && unit.y === y)) return 'taken';
  return null;
}
export function deploy(b, slot, x, y) {
  const why = canDeploy(b, slot, x, y);
  if (why) return why;
  const u = b.squad[slot];
  b.energy -= b.mods ? costOf(b, u) : u.cost;
  b.units.push({ ...u, id: b.nextId++, slot, x, y, maxHp: u.hp, cd: 0, sp: 0, blocking: [] });
  b.deployed.add(u.num);
  return null;
}
export function retreat(b, id) {
  const i = b.units.findIndex(unit => unit.id === id);
  if (i < 0) return false;
  const [unit] = b.units.splice(i, 1);
  b.energy = Math.min(99, b.energy + Math.floor(unit.cost / 2));
  b.cooldown[unit.slot] = b.t + REDEPLOY;
  for (const e of b.enemies) if (e.blockedBy === unit.id) e.blockedBy = null;
  return true;
}
const dist = (a, x, y) => Math.hypot(a.x - x, a.y - y);
// How far an enemy still has to go: to its next point, then along the rest of its path.
function distanceLeft(e) {
  let left = e.path[e.seg + 1] ? Math.hypot(e.path[e.seg + 1][0] - e.x, e.path[e.seg + 1][1] - e.y) : 0;
  for (let i = e.seg + 2; i < e.path.length; i++) left += Math.hypot(e.path[i][0] - e.path[i - 1][0], e.path[i][1] - e.path[i - 1][1]);
  return left;
}
// Only snipers reach flying enemies.
export const canHit = (u, e) => !e.flying || !!CLASSES[u.cls]?.air;
function finishWaveFor(b, e) {
  b.waveLeft[e.wave]--;
  if (b.waveLeft[e.wave] === 0) b.wavesDone++;
}
function useSkill(b, u) {
  const power = u.power ?? (u.rare ? 1.3 : 1);
  if (u.cls === 'vanguard') b.energy = Math.min(99, b.energy + Math.round(8 * power));
  else if (u.cls === 'blocker') u.hp = Math.min(u.maxHp, u.hp + Math.round(u.maxHp * 0.4 * power));
  else if (u.cls === 'medic') { for (const a of b.units) if (dist(a, u.x, u.y) <= u.range) a.hp = Math.min(a.maxHp, a.hp + Math.round(u.atk * 1.5 * power)); }
  else {
    const targets = b.enemies.filter(e => canHit(u, e) && dist(e, u.x, u.y) <= u.range + 0.5);
    const list = u.cls === 'caster' ? targets : targets.slice(0, u.cls === 'sniper' ? 3 : 1);
    for (const e of list) e.hp -= hit(u.atk, defenceAgainst(u, e), typeMultiplier(u.types[0], e.types)) * (u.cls === 'guard' ? 3 : 1.5) * power;
  }
  b.log.push({ t: b.t, skill: u.skill, unit: u.id });
}

/** Advance the battle by one tick. Returns the battle. */
export function step(b, dt = TICK) {
  if (b.over) return b;
  b.t += dt;
  b.energy = Math.min(99, b.energy + dt * (b.mods?.has('energy') ? 0.75 : 1));
  // Spawns.
  while (b.queue.length && b.queue[0].at <= b.t) {
    const s = b.queue.shift();
    const ground = b.paths[s.path];
    // Flyers go straight from their spawn to the goal, over everything.
    const path = s.flying ? [ground[0], ground[ground.length - 1]] : ground;
    b.enemies.push({ ...enemyStats(s.num, b.stage.level, s.boss, s.flying), id: b.nextId++, wave: s.wave, boss: s.boss, path, seg: 0,
      x: path[0][0], y: path[0][1], cd: 0, blockedBy: null, maxHp: 0, explodes: s.explodes, fuse: null, armored: s.armored });
    const e = b.enemies[b.enemies.length - 1];
    if (b.mods?.has('hp')) e.hp = Math.round(e.hp * 1.3);
    if (b.mods?.has('atk')) e.atk = Math.round(e.atk * 1.3);
    if (b.mods?.has('fast')) e.speed *= 1.2;
    // Fast waves (chapter 5 on) run at 1.5x.
    if (s.fast) { e.speed *= FAST; e.fast = true; }
    e.maxHp = e.hp;
    b.spawned++;
  }
  // Movement and blocking.
  for (const e of b.enemies) {
    if (e.blockedBy && !b.units.some(u => u.id === e.blockedBy)) e.blockedBy = null;
    // A fuse burns only while its exploder is held; walk free and it goes out.
    if (e.explodes) e.fuse = e.blockedBy ? (e.fuse === null ? FUSE : e.fuse) : null;
    if (e.blockedBy) continue;
    const tx = Math.round(e.x), ty = Math.round(e.y);
    const blocker = !e.flying && b.units.find(u => u.ground && u.x === tx && u.y === ty && Math.abs(e.x - tx) + Math.abs(e.y - ty) < 0.35 &&
      b.enemies.filter(o => o.blockedBy === u.id).length < u.block);
    if (blocker) { e.blockedBy = blocker.id; if (e.explodes) e.fuse = FUSE; continue; }
    let move = e.speed * dt;
    while (move > 0 && e.seg < e.path.length - 1) {
      const [nx, ny] = e.path[e.seg + 1];
      const d = Math.hypot(nx - e.x, ny - e.y);
      if (d <= move) { e.x = nx; e.y = ny; e.seg++; move -= d; } else { e.x += (nx - e.x) / d * move; e.y += (ny - e.y) / d * move; move = 0; }
    }
    if (e.seg >= e.path.length - 1) { e.leaked = true; b.life--; b.leaks++; finishWaveFor(b, e); }
  }
  b.enemies = b.enemies.filter(e => !e.leaked);
  // Units act.
  for (const u of b.units) {
    u.sp = Math.min(u.spMax, u.sp + dt);
    if (u.sp >= u.spMax && (u.cls === 'vanguard' || u.cls === 'blocker' && u.hp < u.maxHp * 0.6 || u.cls === 'medic' && b.units.some(a => a.hp < a.maxHp) ||
        b.enemies.some(e => canHit(u, e) && dist(e, u.x, u.y) <= u.range))) { useSkill(b, u); u.sp = 0; }
    u.cd -= dt;
    if (u.cd > 0) continue;
    if (u.cls === 'medic') {
      const hurt = b.units.filter(a => a.hp < a.maxHp && dist(a, u.x, u.y) <= u.range).sort((a, c) => a.hp / a.maxHp - c.hp / c.maxHp)[0];
      if (hurt) { hurt.hp = Math.min(hurt.maxHp, hurt.hp + Math.round(u.atk * 0.9)); u.cd = u.interval; }
      continue;
    }
    const inRange = b.enemies.filter(e => canHit(u, e) && (e.blockedBy === u.id || dist(e, u.x, u.y) <= u.range));
    if (!inRange.length) continue;
    // Whoever it is blocking first, then (for snipers) flyers, since nothing else can
    // hit them; then the enemy with the least distance left to the goal, as in Arknights.
    const rank = e => (e.blockedBy === u.id ? -1e6 : 0) + (e.flying && CLASSES[u.cls].air ? -1e3 : 0) + distanceLeft(e);
    const target = inRange.sort((a, c) => rank(a) - rank(c))[0];
    const victims = u.cls === 'caster' ? b.enemies.filter(e => canHit(u, e) && dist(e, target.x, target.y) <= CLASSES.caster.splash) : [target];
    for (const e of victims) e.hp -= hit(u.atk, defenceAgainst(u, e), typeMultiplier(u.types[0], e.types));
    u.cd = u.interval;
  }
  // Exploders count down instead of attacking, then blow up on every unit nearby.
  for (const e of b.enemies) {
    if (!e.explodes || e.fuse === null || e.hp <= 0) continue;
    e.fuse -= dt;
    if (e.fuse > 0) continue;
    for (const u of b.units) if (dist(u, e.x, e.y) <= BLAST) u.hp -= hit(e.atk * BLAST_POWER, u.def, typeMultiplier(e.types[0], u.types));
    e.hp = 0; e.blasted = true; b.blasts = (b.blasts || 0) + 1;
  }
  // Enemies hit whoever blocks them.
  for (const e of b.enemies) {
    if (!e.blockedBy || e.explodes) continue;
    e.cd -= dt;
    if (e.cd > 0) continue;
    const u = b.units.find(unit => unit.id === e.blockedBy);
    if (u) u.hp -= hit(e.atk, u.def, typeMultiplier(e.types[0], u.types));
    e.cd = e.interval;
  }
  // The fallen.
  for (const e of b.enemies) if (e.hp <= 0) { b.kills++; finishWaveFor(b, e); }
  b.enemies = b.enemies.filter(e => e.hp > 0);
  for (const u of b.units) if (u.hp <= 0) b.cooldown[u.slot] = b.t + REDEPLOY;
  const fallen = new Set(b.units.filter(u => u.hp <= 0).map(u => u.id));
  if (fallen.size) { b.units = b.units.filter(u => u.hp > 0); for (const e of b.enemies) if (fallen.has(e.blockedBy)) e.blockedBy = null; }
  if (b.life <= 0) b.over = 'lose';
  else if (!b.queue.length && !b.enemies.length) b.over = 'win';
  return b;
}
export function starsFor(b) {
  if (b.over !== 'win') return 0;
  return b.leaks === 0 ? 3 : b.leaks === 1 ? 2 : 1;
}

/* ── Rewards and missions ─────────────────────────────────────────────── */

export const FIRST_CLEAR = { coins: 50, regular: 2 };
export const FIRST_STAR3 = { coins: 100, plus: 1 };
// After a stage's first clear, each later clear pays a little, up to a daily cap, so battles
// still pay once the story is done. Ids td:rep:<day>:<0-9>; a merge can only drop one, never add.
export const REPEAT_CLEAR = { coins: 15 }, REPEAT_PER_DAY = 10;
const repeatsOn = (entries, today) => Object.keys(entries).filter(id => id.startsWith('td:rep:' + today + ':')).length;
export const ADMIN_CLEAR = { gold: 1 };
export const DAILY_REWARD = { coins: 50, waves: 5 };
export const DAILY_ALL = { plus: 1 };
export const WEEKLY_REWARD = { plus: 1 };
export const WEEKLY_ALL = { gold: 1 };
export const DAILY_POOL = [
  { id: 'clear', label: 'Clear any stage' },
  { id: 'star3', label: '3-star a stage' },
  { id: 'mono', label: 'Clear using only one type' },
  { id: 'five', label: 'Clear with 5 or fewer mons deployed' },
  { id: 'admin', label: 'Clear a Rocket admin stage' },
  { id: 'big', label: 'Use a 5★ or better in a clear' }
];
export const WEEKLY = [
  { id: 'star3x5', label: '3-star 5 stages' },
  { id: 'daily5', label: 'Finish all daily missions on 5 days' },
  { id: 'boss5', label: 'Beat the Poké Idle daily boss on 5 days' },
  { id: 'teams3', label: 'Clear one stage with 3 different teams' },
  { id: 'doku10', label: 'Finish 10 Pokédoku dailies' }
];
const shiftDay = (date, days) => { const at = new Date(date + 'T00:00:00Z'); at.setUTCDate(at.getUTCDate() + days); return at.toISOString().slice(0, 10); };
export function mondayOf(date) {
  const dow = new Date(date + 'T00:00:00Z').getUTCDay();
  return shiftDay(date, -((dow + 6) % 7));
}
// "Clear a Rocket admin stage" stays out of the draw for now: 2-6 is the only
// admin stage, so on most days most players could not finish it, and it would
// block the all-4 Plus. Turn it on when the owner decides.
export const ADMIN_DAILY = false;
/** Today's 4 daily missions, the same for everyone. */
export function dailyMissions(date) {
  const pool = DAILY_POOL.filter(m => m.id !== 'admin' || (ADMIN_DAILY && STAGES.some(s => s.admin)));
  let seed = seedNumber('td:' + date) || 1;
  const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
  const list = pool.slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, 4);
}
function runs(entries) {
  const out = [];
  for (const [id, entry] of Object.entries(entries)) {
    if (!id.startsWith('td:run:')) continue;
    const x = object(entry.x);
    if (!stageById(x.st) || !Array.isArray(x.tm) || typeof x.d !== 'string') continue;
    out.push({ stage: x.st, stars: Number(x.s) || 0, team: x.tm.filter(n => Number.isInteger(n) && n >= 1 && n <= DEX.length), day: x.d, at: entry.at });
  }
  return out;
}
const sharesType = team => team.length > 0 && mon(team[0]).types.some(type => team.every(num => mon(num).types.includes(type)));
const lineStar = num => (DEX[lineOf(num) - 1] || [])[9] || 0;
function dailyDone(id, list) {
  const won = list.filter(r => r.stars > 0);
  if (id === 'clear') return won.length > 0;
  if (id === 'star3') return won.some(r => r.stars === 3);
  if (id === 'mono') return won.some(r => sharesType(r.team));
  if (id === 'five') return won.some(r => r.team.length <= 5);
  if (id === 'admin') return won.some(r => stageById(r.stage).admin);
  if (id === 'big') return won.some(r => r.team.some(num => lineStar(num) >= 5));
  return false;
}
// How far a weekly mission is this week: [have, need]. It is done at have >= need.
function weeklyCount(id, entries, list, monday) {
  const inWeek = day => day >= monday && day < shiftDay(monday, 7);
  const week = list.filter(r => r.stars > 0 && inWeek(r.day));
  const count = re => Object.keys(entries).filter(k => re.test(k) && inWeek(k.match(/\d{4}-\d{2}-\d{2}/)[0])).length;
  if (id === 'star3x5') return [new Set(week.filter(r => r.stars === 3).map(r => r.stage)).size, 5];
  if (id === 'daily5') return [count(/^td:daily:\d{4}-\d{2}-\d{2}:all$/), 5];
  if (id === 'teams3') {
    const teams = {};
    for (const r of week) (teams[r.stage] ||= new Set()).add(r.team.slice().sort((a, b) => a - b).join(','));
    return [Math.max(0, ...Object.values(teams).map(set => set.size)), 3];
  }
  // Read from the wallet: rewards.js writes `pi:boss:<date>` when Poké Idle reports a daily boss win.
  if (id === 'boss5') return [count(/^pi:boss:\d{4}-\d{2}-\d{2}$/), 5];
  if (id === 'doku10') return [count(/^pdoku:daily:[a-z]+:\d{4}-\d{2}-\d{2}$/), 10];
  return [0, 1];
}
function weeklyDone(id, entries, list, monday) {
  const [have, need] = weeklyCount(id, entries, list, monday);
  return have >= need;
}
/** Grant whatever missions are now complete. */
function claimMissions(wallet, today, now) {
  let next = mergeWallet(wallet);
  const list = runs(next.entries);
  const todays = list.filter(r => r.day === today);
  const daily = dailyMissions(today);
  for (const m of daily) if (dailyDone(m.id, todays)) next = grantOnce(next, 'td:daily:' + today + ':' + m.id, DAILY_REWARD, { now }).wallet;
  if (daily.every(m => next.entries['td:daily:' + today + ':' + m.id])) next = grantOnce(next, 'td:daily:' + today + ':all', DAILY_ALL, { now }).wallet;
  const monday = mondayOf(today);
  for (const m of WEEKLY) if (!m.later && weeklyDone(m.id, next.entries, list, monday)) next = grantOnce(next, 'td:week:' + monday + ':' + m.id, WEEKLY_REWARD, { now }).wallet;
  if (WEEKLY.every(m => next.entries['td:week:' + monday + ':' + m.id])) next = grantOnce(next, 'td:week:' + monday + ':all', WEEKLY_ALL, { now }).wallet;
  return next;
}
/** Mission and stage progress for the screens. */
export function tdState(wallet, today = dailyDate()) {
  const merged = mergeWallet(wallet);
  const e = merged.entries;
  const list = runs(e);
  const best = {};
  for (const r of list) best[r.stage] = Math.max(best[r.stage] || 0, r.stars);
  const monday = mondayOf(today);
  const levels = {};
  for (const entry of Object.values(e)) {
    const x = object(entry.x);
    if (Number.isInteger(x.lv) && Number.isInteger(x.to)) levels[x.lv] = Math.max(levels[x.lv] || 1, Math.min(MAX_LEVEL, x.to));
  }
  return {
    best, levels,
    unlocked: STAGES.map((s, i) => i === 0 || (best[STAGES[i - 1].id] || 0) > 0),
    unlockedById: Object.fromEntries(STAGES.map((s, i) => [s.id, i === 0 || (best[STAGES[i - 1].id] || 0) > 0])),
    daily: dailyMissions(today).map(m => ({ ...m, done: !!e['td:daily:' + today + ':' + m.id] })),
    dailyAll: !!e['td:daily:' + today + ':all'],
    // Repeat clears paid today, of REPEAT_PER_DAY.
    repeatToday: repeatsOn(e, today), repeatMax: REPEAT_PER_DAY, repeatPay: REPEAT_CLEAR.coins,
    // have/need: how far each weekly mission is (a claimed one shows full).
    weekly: WEEKLY.map(m => {
      const done = !!e['td:week:' + monday + ':' + m.id], [have, need] = weeklyCount(m.id, e, list, monday);
      return { ...m, done, have: done ? need : Math.min(have, need), need };
    }),
    weeklyAll: !!e['td:week:' + monday + ':all'],
    // The weekly challenge: this week's stage and the best risk total won so far.
    challenge: weeklyStage(monday),
    challengeBest: Math.max(0, ...Object.entries(e).filter(([id, entry]) => id.startsWith('td:wk:') && object(entry.x).wk === monday && object(entry.x).s > 0)
      .map(([, entry]) => Number(entry.x.r) || 0)),
    challengeOpen: (best[WEEKLY_UNLOCK] || 0) > 0,
    // Which risk milestones this week's wins have paid.
    challengeClaimed: WEEKLY_MILESTONES.map((m, i) => !!e['td:wkm:' + monday + ':' + i]),
    monday
  };
}
/**
 * Record a finished battle and pay for it: waves cleared, first clears, first
 * 3-stars, the starter mission and any missions now complete. `team` is the
 * species that were deployed.
 */
export function tdFinish(wallet, { stage, stars, team = [], waves = 0 } = {}, { today = dailyDate(), now = Date.now() } = {}) {
  const s = stageById(stage);
  if (!s || !Number.isInteger(stars) || stars < 0 || stars > 3) return { wallet: mergeWallet(wallet), ok: false, reason: 'unknown' };
  const state = gachaState(wallet, today);
  const deployed = [...new Set(team)].filter(num => state.owned.includes(num)).slice(0, 8);
  if (!state.active) return { wallet: mergeWallet(wallet), ok: false, reason: 'inactive' };
  const cleared = Math.max(0, Math.min(s.waves.length, Math.floor(waves)));
  let next = mergeWallet(wallet);
  next.entries['td:run:' + uuid()] = { at: seconds(now), ...(cleared ? { g: { waves: cleared } } : {}), x: { st: s.id, s: stars, tm: deployed, d: today } };
  const before = Object.keys(next.entries).length;
  // A repeat clear: the stage was already cleared before this run.
  if (stars > 0 && next.entries['td:first:' + s.id]) {
    for (let i = 0; i < REPEAT_PER_DAY; i++) {
      const id = 'td:rep:' + today + ':' + i;
      if (!next.entries[id]) { next = grantOnce(next, id, REPEAT_CLEAR, { now }).wallet; break; }
    }
  }
  if (stars > 0) {
    next = grantOnce(next, 'td:first:' + s.id, FIRST_CLEAR, { now }).wallet;
    if (s.admin) next = grantOnce(next, 'td:admin:' + s.id, ADMIN_CLEAR, { now }).wallet;
    if (s.id === '1-1') next = grantOnce(next, 'gacha:start:stage', { regular: 2 }, { now }).wallet;
  }
  if (stars === 3) next = grantOnce(next, 'td:star3:' + s.id, FIRST_STAR3, { now }).wallet;
  next = claimMissions(next, today, now);
  return { wallet: next, ok: true, waves: cleared, newGrants: Object.keys(next.entries).length - before };
}
/**
 * Record a weekly challenge run: waves cleared pay hatch waves like any battle,
 * and a win keeps its risk total as the week's score. No other reward yet.
 */
export function tdWeekly(wallet, { mods = [], stars = 0, waves = 0 } = {}, { today = dailyDate(), now = Date.now() } = {}) {
  const monday = mondayOf(today), stage = weeklyStage(monday);
  if (!Number.isInteger(stars) || stars < 0 || stars > 3) return { wallet: mergeWallet(wallet), ok: false, reason: 'unknown' };
  if (!gachaState(wallet, today).active) return { wallet: mergeWallet(wallet), ok: false, reason: 'inactive' };
  if (!tdState(wallet, today).challengeOpen) return { wallet: mergeWallet(wallet), ok: false, reason: 'locked' };
  const cleared = Math.max(0, Math.min(stage.waves.length, Math.floor(waves)));
  const risk = riskOf(mods);
  let next = mergeWallet(wallet);
  next.entries['td:wk:' + uuid()] = { at: seconds(now), ...(cleared ? { g: { waves: cleared } } : {}), x: { wk: monday, r: risk, s: stars, m: mods.filter(id => RISKS.some(r => r.id === id)) } };
  // A win pays every milestone its risk reaches, each once this week.
  const claimed = [];
  if (stars > 0) WEEKLY_MILESTONES.forEach((m, i) => {
    if (risk < m.risk) return;
    const r = grantOnce(next, 'td:wkm:' + monday + ':' + i, m.grant, { now });
    next = r.wallet;
    if (r.changed) claimed.push(i);
  });
  return { wallet: next, ok: true, waves: cleared, risk, claimed };
}
/** Buy a level for a line with coins. */
export function levelUp(wallet, line, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  if (!state.lines[line]) return { wallet: mergeWallet(wallet), ok: false, reason: 'not-owned' };
  const level = tdState(wallet, today).levels[line] || 1;
  if (level >= MAX_LEVEL) return { wallet: mergeWallet(wallet), ok: false, reason: 'owned' };
  if (level >= lineCap(state, line)) return { wallet: mergeWallet(wallet), ok: false, reason: 'cap' };
  const result = spendFrom(wallet, { coins: levelCost(level) }, { id: uuid(), now, x: { lv: line, to: level + 1 } });
  return result.ok ? { wallet: result.wallet, ok: true } : { wallet: mergeWallet(wallet), ok: false, reason: 'coins' };
}
/** The squad's battle stats from the wallet: levels, passives, cost cuts, unlocked skills. */
export function squadFrom(wallet, species, today = dailyDate()) {
  const state = gachaState(wallet, today), td = tdState(wallet, today);
  return species.filter(num => state.owned.includes(num)).slice(0, 8).map(num => {
    const l = state.lines[lineOf(num)] || {};
    return { ...unitStats(num, { level: td.levels[lineOf(num)] || 1, passive: !!l.passive, costCut: l.cost || 0, skills: l.skills || [true, false, false, false], skill: l.skill ?? null }),
      look: lookFor(state, num), level: td.levels[lineOf(num)] || 1, cap: lineCap(state, lineOf(num)) };
  });
}

/* ── The bridge, merged into parent.__boredGacha.td ─────────────────── */
export function tdBridge({ onChange = () => {} } = {}) {
  const act = run => (options = {}) => {
    const { wallet, ...result } = run(readWallet(), options);
    if (result.ok && wallet) { writeWallet(wallet); try { onChange(); } catch {} }
    return result;
  };
  return {
    // `stages` stays chapter 1 for pages that predate chapters; `chapters` and `allStages` have every chapter.
    stages: CHAPTERS[0].stages, chapter: CHAPTER, chapters: CHAPTERS, allStages: STAGES, classes: CLASSES, W, H, TICK, REDEPLOY, maxLevel: MAX_LEVEL, levelCost,
    levelCaps: LEVEL_CAPS, skillKinds: SKILL_KINDS, capOf: line => lineCap(gachaState(readWallet()), line),
    classOf, pathsOf, newBattle, step, deploy, retreat, canDeploy, canHit, starsFor, typeMultiplier,
    state: () => tdState(readWallet()),
    squad: species => squadFrom(readWallet(), species),
    finish: act((w, o) => tdFinish(w, o)),
    levelUp: act((w, o) => levelUp(w, o.line)),
    // The weekly challenge (draft): stage and risks, and recording a run.
    risks: RISKS, riskOf, weeklyStage, maxRisk: MAX_RISK, milestones: WEEKLY_MILESTONES, weeklyUnlock: WEEKLY_UNLOCK,
    finishWeekly: act((w, o) => tdWeekly(w, o))
  };
}
