// Poké Gacha engine: eggs, machines, pity, hatching, candy, shards, dex, buddy
// and SP skins. A port of PokéRogue's egg gacha onto the Bored wallet.
//
// Everything is an entry in the wallet ledger (src/hub/rewards.js), so it
// syncs and merges across devices like every other grant:
//   spend:<uuid>        a pull: vouchers spent, x = { m, e, b, w, n, d }
//                         m machine, e egg tiers, b banner species, w waves
//                         total when pulled, n pulls before it, d day
//   spend:<uuid>        a candy egg: candy spent, x = { m, e, w, n, d, s } like a pull, s = the line
//   spend:<uuid>        candy and shard spends: x = { ev } | { up, l } | { sp: skin id }
//   hatch:<uuid>.<i>    egg i of that pull hatched: g = shards + candy,
//                         x = { s, t, n, sh, sp, k } species, tier, new, shiny, SP skin id, skill
//   cfg:buddy:<uuid>    the equipped buddy; the latest one counts
//   cfg:look:<uuid>     the look a line wears across Bored (x = { l, look }); the latest counts
//   cfg:skill:<uuid>    the skill a line uses in tower defense (x = { l, k }, k = 0-3); the latest counts
//   gacha:cut:<line>    the one-time refund for an owned line cut from the egg roster (claimCutRefund):
//                         g = vouchers and coins, less the candy left on it; x = { l, s, c, k }
//                         line, its old star, the candy and the level coins it was paid for
//   spend:col:<uuid>    a Collector pull, paid in chips: x = { cp, n, d } (see the Collector below)
//   spend:cbuy:<num>    a Collector species bought with dust: x = { cb }
//   spend:cdust:<monday>:<slot>  10 shards bought with dust
//   col:set:<id>        a Collector set's chips, paid once
//   cfg:starter         the starter pick, once per account: x = { s, c } the chosen starter and
//                         the three gifted commons. The id is fixed, so it is written once and
//                         a second device's pick loses to the earlier one in a merge.
// The hatch id is fixed by the egg, so an egg hatched on two devices pays once.
// Eggs count down on the wallet's running wave total, which is never spent:
// an egg's progress is the waves earned since it was pulled.
//
// Pulls are cosmetic everywhere but Poké Gacha's own tower defense.
import { DEX, DEX_TYPES, DEX_LEGACY } from './gacha-dex.js';
import { dailyDate, seedNumber } from '../daily.js';
import {
  mergeWallet, walletBalance, spendFrom, grantOnce, buyRegular, readWallet, writeWallet, walletTrophies, walletTrophyList, bossStreak,
  addAchievements, achievement, claimTrophies, claimDailyChips, CHIPS
} from './rewards.js';

// Egg tiers: 0 Common 3★, 1 Rare 4★, 2 Epic 5★, 3 Legendary 6★, 4 the banner legendary (6★).
export const EGG_TIERS = ['Common', 'Rare', 'Epic', 'Legendary', 'Banner'];
export const EGG_STARS = [3, 4, 5, 6, 6];
// Out of 256 per egg. PokéRogue's Manaphy egg is left out; its 1/256 goes to Common.
export const EGG_RATES = { standard: [204, 44, 7, 1, 0], legend: [203, 44, 7, 1, 1] };
export const MACHINES = {
  move: 'Move UP',
  legend: 'Legendary UP',
  shiny: 'Shiny UP'
};
export const VOUCHERS = {
  regular: { eggs: 1, guarantee: 0 },
  plus: { eggs: 5, guarantee: 0 },
  premium: { eggs: 10, guarantee: 1 },
  gold: { eggs: 25, guarantee: 2 }
};
// Ten Regulars at once guarantee a Rare.
export const REGULAR_BATCH = 10;
// After this many eggs without a Rare, an Epic or a Legendary, the next Common egg is upgraded.
export const RARITY_PITY = [9, 59, 412];
// After this many hatches in a tier with no new species, the next one in that tier is new.
export const DUPE_PITY = 9;
export const MAX_EGGS = 99;
export const HATCH_WAVES = [5, 15, 30, 60, 60];
export const DUPE_SHARDS = [1, 5, 15, 50, 50];
// Candy per hatch is not in the spec yet; starting values.
export const HATCH_CANDY = [10, 20, 30, 50, 50];
// Rare skill: 1 in this many, halved by Move UP.
export const RARE_SKILL = [48, 24, 12, 6, 6];
export const SHINY_ODDS = { shiny: 64, other: 128 };
export const SP_ODDS = 200;

/* ── SP skins ────────────────────────────────────────────────────────────
   Hand-drawn skins, listed in src/games/content/poke-gacha/sp/skins.json as
   { id, name, species, forms? }. A skin belongs to its species' evolution line
   and is owned per line. `forms` makes it a set: one skin that covers every
   form listed (Pidgey, Pidgeotto, Pidgeot); without it the skin covers
   `species` alone. A line can have several skins (Eevee, Espeon, Umbreon).
   The art for each form is sp/<id>-<species>.png. The hub loads the list
   with setSkins(). Shiny UP rolls an SP skin for the line it hatches (one it
   does not own yet, at random if several); the shard shop sells any listed
   skin for a line you own, by size (SP_PRICES). With an empty list there is
   no SP anywhere. */
export const SKIN_DIR = 'games/content/poke-gacha/sp/';
const SKIN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
// Shards for a skin covering 1, 2 or 3 forms.
export const SP_PRICES = [300, 400, 500];
let SKINS = [];
const validSkin = skin => skin && SKIN_ID.test(skin.id) && validNum(skin.species) && typeof skin.name === 'string' && skin.name.trim() &&
  (skin.forms === undefined || (Array.isArray(skin.forms) && skin.forms.length >= 1 && skin.forms.length <= SP_PRICES.length &&
    skin.forms.includes(skin.species) && skin.forms.every(num => validNum(num) && lineOf(num) === lineOf(skin.species))));
export function setSkins(list) {
  const seen = new Set();
  SKINS = (Array.isArray(list) ? list : []).filter(skin => validSkin(skin) && !seen.has(skin.id) && seen.add(skin.id))
    .map(({ id, species, name, forms }) => ({ id, species, name: name.trim().slice(0, 40), forms: [...new Set(forms || [species])] }));
  return SKINS.length;
}
export const skinList = () => SKINS.map(skin => ({ ...skin, forms: skin.forms.slice() }));
export const skinById = id => SKINS.find(skin => skin.id === id) || null;
const skinsOfLine = line => SKINS.filter(skin => lineOf(skin.species) === line);
// Does this skin draw on this species?
const skinCovers = (id, num) => !!skinById(id)?.forms.includes(num);
/** The art file for a skin on one of its forms, relative to SKIN_DIR. */
export const skinFile = (id, num) => id + '-' + num + '.png';
/** Shards for a skin: 300 for one form, 400 for a two-form set, 500 for three. */
export const skinPrice = skin => SP_PRICES[Math.min(skin.forms.length, SP_PRICES.length) - 1];
export const COSTS = { evolve: [25, 100], passive: 50, cost1: 30, cost2: 60, sp: SP_PRICES[0] };
export const LOGIN = { regular: 3 };
// A one-time welcome pack for every account, paid with the starter pick. Accounts that picked
// before it existed get it on their next visit (claimLogin). One fixed ledger id, so a merge of
// two devices pays it once.
export const WELCOME = { gold: 1, coins: 1000 };
export const WELCOME_ID = 'gacha:welcome';
/* ── The coin shop ─────────────────────────────────────────────────────
   Coins buy candy for a caught line (5 for 200, 50 per line a day), shards (10 for
   500, 50 a week, so a 300-shard skin from coins alone takes about six weeks) and
   squad preset slots (3 to start, up to 5 in all: the 4th for 500, the 5th for 1000). Every purchase has a fixed ledger id, one per slot of its
   limit: spend:candy:<line>:<day>:<0-9>, spend:shards:<monday>:<0-4>, spend:preset:<n>.
   Two devices buying offline merge to one entry per id, cost and goods together, so
   nothing is paid twice and no limit can be passed. */
export const COIN_SHOP = {
  // Candy is 40 coins each, bought in any number up to 50 per line a day (5 for 200 is the old pack).
  candy: { coins: 200, candy: 5, perLineDay: 50, each: 40 },
  shards: { coins: 500, shards: 10, perWeek: 50 },
  presets: { start: 3, max: 5, prices: [500, 1000] }
};
const mondayOfDay = date => { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
// What the coin shop has sold today and this week, and the preset slots owned.
function coinShop(entries, today) {
  const monday = mondayOfDay(today), candyToday = {};
  let shardsWeek = 0, presets = COIN_SHOP.presets.start;
  for (const id of Object.keys(entries)) {
    if (!id.startsWith('spend:')) continue;
    const part = id.split(':');
    // Each purchase counts the candy it bought (older entries were all packs of 5).
    if (part[1] === 'candy' && part[3] === today) candyToday[part[2]] = (candyToday[part[2]] || 0) + (Number(entries[id]?.g?.['candy:' + part[2]]) || COIN_SHOP.candy.candy);
    if (part[1] === 'shards' && part[2] === monday) shardsWeek += COIN_SHOP.shards.shards;
    if (part[1] === 'preset') { const n = Number(part[2]); if (n > COIN_SHOP.presets.start && n <= COIN_SHOP.presets.max) presets++; }
  }
  const p = COIN_SHOP.presets, next = presets < p.max ? p.prices[presets - p.start] : null;
  return { candyToday, shardsWeek, shardsLeft: Math.max(0, COIN_SHOP.shards.perWeek - shardsWeek), presets, nextPreset: next, monday };
}
export const STARTER = { regular: 2 };
// The first time Poké Gacha opens, the player picks one first-stage starter and
// gets three commons with it, so the first squad is four and clears 1-1 (a
// blocker, a sniper for flyers and the one common medic). Old accounts get the
// same pick once. STARTER_GENS 9 offers every generation; 1 offers Kanto only.
export const STARTER_GENS = 9;
const STARTER_LINES = [1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
  650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912];
export const STARTERS = STARTER_LINES.slice(0, STARTER_GENS * 3);
export const STARTER_GIFTS = [74, 16, 531]; // Geodude, Pidgey, Audino
// The first FREE_HATCHES eggs a player ever pulls hatch at once; after that, waves.
export const FREE_HATCHES = 10;
export const STARTER_MISSIONS = [
  { id: 'pull', label: 'Pull your first egg' },
  { id: 'hatch', label: 'Hatch an egg' },
  { id: 'stage', label: 'Clear stage 1-1' },
  { id: 'buddy', label: 'Equip a buddy' }
];

// Each mon has three common skills and one rare skill, taken from its types:
// a single type gives its three commons, two types give two of the first and
// one of the second; the rare skill is the first type's.
export const TYPE_SKILLS = {
  Normal: ['Tackle', 'Quick Attack', 'Body Slam', 'Hyper Beam'],
  Fire: ['Ember', 'Flame Wheel', 'Fire Spin', 'Overheat'],
  Water: ['Water Gun', 'Bubble Beam', 'Aqua Tail', 'Hydro Pump'],
  Grass: ['Vine Whip', 'Razor Leaf', 'Giga Drain', 'Solar Beam'],
  Electric: ['Thunder Shock', 'Spark', 'Thunder Wave', 'Thunder'],
  Ice: ['Powder Snow', 'Ice Shard', 'Icy Wind', 'Blizzard'],
  Fighting: ['Low Kick', 'Karate Chop', 'Bulk Up', 'Close Combat'],
  Poison: ['Poison Sting', 'Acid', 'Toxic', 'Gunk Shot'],
  Ground: ['Mud-Slap', 'Bulldoze', 'Dig', 'Earthquake'],
  Flying: ['Gust', 'Wing Attack', 'Air Slash', 'Hurricane'],
  Psychic: ['Confusion', 'Psybeam', 'Calm Mind', 'Psychic'],
  Bug: ['Bug Bite', 'Struggle Bug', 'String Shot', 'Megahorn'],
  Rock: ['Rock Throw', 'Rock Tomb', 'Sandstorm', 'Stone Edge'],
  Ghost: ['Lick', 'Shadow Sneak', 'Hex', 'Shadow Ball'],
  Dragon: ['Twister', 'Dragon Breath', 'Dragon Dance', 'Draco Meteor'],
  Dark: ['Bite', 'Snarl', 'Taunt', 'Dark Pulse'],
  Steel: ['Metal Claw', 'Iron Defense', 'Iron Head', 'Meteor Mash'],
  Fairy: ['Fairy Wind', 'Draining Kiss', 'Charm', 'Moonblast']
};

const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const seconds = now => Math.floor(now / 1000);
const uuid = () => globalThis.crypto?.randomUUID?.() ||
  'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
const validNum = n => Number.isInteger(n) && n >= 1 && n <= DEX.length;

/* ── The dex ─────────────────────────────────────────────────────────────── */

export const mon = num => {
  const row = DEX[num - 1];
  if (!row) return null;
  const [name, types, hp, atk, def, spa, spd, spe, from, star, kind] = row;
  return { num, name, types: types.split('/'), hp, atk, def, spa, spd, spe, from, star, kind,
    bst: hp + atk + def + spa + spd + spe };
};
export function lineOf(num) {
  let at = num;
  for (let guard = 0; DEX[at - 1] && DEX[at - 1][8] && guard < 4; guard++) at = DEX[at - 1][8];
  return at;
}
export function stageOf(num) {
  let stage = 1;
  for (let at = num, guard = 0; DEX[at - 1] && DEX[at - 1][8] && guard < 4; guard++) { at = DEX[at - 1][8]; stage++; }
  return stage;
}
let children = null;
export function evolutionsOf(num) {
  if (!children) {
    children = {};
    DEX.forEach((row, i) => { if (row[8]) (children[row[8]] ||= []).push(i + 1); });
  }
  return children[num] || [];
}
export function skillsOf(num) {
  const [a, b] = mon(lineOf(num)).types;
  const first = TYPE_SKILLS[a], second = TYPE_SKILLS[b];
  return second ? [first[0], first[1], second[0], first[3]] : first.slice();
}
/** Each skill's type, in skillsOf order: a two-type line's third skill is its second type's. */
export function skillTypesOf(num) {
  const [a, b] = mon(lineOf(num)).types;
  return b && TYPE_SKILLS[b] ? [a, a, b, a] : [a, a, a, a];
}
let pools = null;
/** The species an egg of each tier can hatch. */
export function eggPools() {
  if (!pools) {
    pools = [[], [], [], [], []];
    DEX.forEach((row, i) => {
      const tier = EGG_STARS.indexOf(row[9]);
      if (tier >= 0 && tier < 4) pools[tier].push(i + 1);
      if (row[9] === 6 && row[10] === 'lg') pools[4].push(i + 1);
    });
  }
  return pools;
}
/** The day's Legendary UP banner, the same for everyone from the shared daily seed. */
export function bannerFor(date) {
  const legends = eggPools()[4];
  return legends[seedNumber(date) % legends.length];
}

/* ── The roster cut ──────────────────────────────────────────────────────
   Lines cut from the egg roster (DEX_LEGACY, star 0 in the dex) never hatch
   again and leave the Poké Gacha dex, squads and presets. Each cut line the
   account owned is refunded once, under the fixed id gacha:cut:<line>, so two
   devices merge to one payment, and a line whose hatches sync in later is still
   paid when it arrives: its old tier in vouchers (CUT_REFUND), 1 Regular per
   CUT_CANDY candy left on it (that candy is spent in the same entry), and the
   coins its levels cost. */
export const CUT_REFUND_PREFIX = 'gacha:cut:';
export const CUT_REFUND = { 3: { regular: 1 }, 4: { regular: 2 }, 5: { plus: 1 }, 6: { premium: 1 } };
export const CUT_CANDY = 25;
const CUT = Object.fromEntries(DEX_LEGACY);
/** Is this species in a line cut from the egg roster? */
export const isCut = num => !!CUT[lineOf(num)];
function cutRefundOf(l) {
  const out = { ...(CUT_REFUND[l.star] || {}) };
  const regular = Math.floor(l.candy / CUT_CANDY);
  if (regular) out.regular = (out.regular || 0) + regular;
  if (l.coins) out.coins = l.coins;
  return out;
}
/** Refund every owned cut line not refunded yet. ok only when something is paid now. */
export function claimCutRefund(wallet, { today = dailyDate(), now = Date.now() } = {}) {
  const next = mergeWallet(wallet);
  if (!next.entries.on) return refuse(wallet, 'inactive');
  const due = gachaState(next, today).legacy.filter(l => !l.refunded);
  if (!due.length) return refuse(wallet, 'none');
  const total = {};
  for (const l of due) {
    const g = { ...l.refund };
    for (const [k, n] of Object.entries(g)) total[k] = (total[k] || 0) + n;
    if (l.candy) g['candy:' + l.line] = -l.candy;
    next.entries[CUT_REFUND_PREFIX + l.line] = { at: seconds(now), g, x: { l: l.line, s: l.star, c: l.candy, k: l.coins } };
  }
  return { wallet: next, ok: true, lines: due.map(({ line, star, candy, coins, refund }) => ({ line, star, candy, coins, refund })), total };
}

/* ── Reading the ledger ──────────────────────────────────────────────────── */

function readPulls(entries) {
  const pulls = [];
  for (const [id, entry] of Object.entries(entries)) {
    const x = object(entry.x);
    if (!id.startsWith('spend:') || !Array.isArray(x.e) || !MACHINES[x.m]) continue;
    const eggs = x.e.filter(t => Number.isInteger(t) && t >= 0 && t <= 4);
    if (eggs.length !== x.e.length || !eggs.length) continue;
    if (eggs.includes(4) && !validNum(x.b)) continue;
    // A candy egg (buyCandyEgg) names its line: x.s, a base form on the roster.
    const species = validNum(x.s) && !DEX[x.s - 1][8] && DEX[x.s - 1][9] > 0 ? x.s : 0;
    if (x.s !== undefined && !species) continue;
    pulls.push({ id, key: id.slice(6), at: entry.at, n: Number(x.n) || 0, machine: x.m, eggs,
      banner: x.b || 0, waves: Number(x.w) || 0, day: typeof x.d === 'string' ? x.d : '', species });
  }
  return pulls.sort((a, b) => a.n - b.n || a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function readStarter(entry) {
  const x = object(entry?.x);
  if (!STARTER_LINES.includes(x.s) || !Array.isArray(x.c)) return null;
  return { species: x.s, gifts: x.c.filter(num => STARTER_GIFTS.includes(num)), at: entry.at };
}

function readHatch(entry) {
  const x = object(entry?.x);
  if (!validNum(x.s) || !Number.isInteger(x.t) || x.t < 0 || x.t > 4) return null;
  return { species: x.s, tier: x.t, fresh: x.n === 1, shiny: x.sh === 1, sp: typeof x.sp === 'string' && SKIN_ID.test(x.sp) ? x.sp : null,
    skill: Number.isInteger(x.k) && x.k >= 0 && x.k <= 3 ? x.k : 0, at: entry.at };
}

/** Pity counters after replaying every egg ever pulled, in order. */
function rarityCounters(pulls) {
  const count = { rare: 0, epic: 0, legendary: 0 };
  // Candy eggs are bought for a line already owned: they neither count toward nor reset the pity.
  for (const pull of pulls) if (!pull.species) for (const tier of pull.eggs) countEgg(count, tier, pull.machine);
  return count;
}
function countEgg(count, tier, machine) {
  const level = Math.min(tier, 3);
  count.rare = level >= 1 ? 0 : count.rare + 1;
  count.epic = level >= 2 ? 0 : count.epic + 1;
  // On Legendary UP each non-legendary egg counts double; a banner egg is a legendary.
  count.legendary = level >= 3 ? 0 : count.legendary + (machine === 'legend' ? 2 : 1);
}

/** Everything Poké Gacha shows, derived from the wallet. */
export function gachaState(wallet, today = dailyDate()) {
  const merged = mergeWallet(wallet);
  const entries = merged.entries;
  const balance = walletBalance(merged);
  const pulls = readPulls(entries);
  const eggs = [], hatched = [];
  const dupe = [0, 0, 0, 0];
  const lines = {};
  const owned = new Set();
  // Lines cut from the roster leave the state: no dex entry, no squad, no buddy.
  // What the player held of them is in `legacy` (and refunded once, claimCutRefund).
  const legacy = {};
  const line = num => (lines[num] ||= { line: num, hatches: 0, shiny: false, skins: [], skills: [false, false, false, false],
    passive: false, cost: 0, look: 'normal', skill: null });
  // The starter and its gifts are owned with their first common skill, like a hatch.
  const starterPick = readStarter(entries['cfg:starter']);
  if (starterPick) for (const num of [starterPick.species, ...starterPick.gifts]) {
    owned.add(num);
    line(lineOf(num)).skills[0] = true;
  }
  let nth = 0;
  for (const pull of pulls) {
    pull.eggs.forEach((tier, i) => {
      const egg = { id: pull.key + '.' + i, tier, machine: pull.machine, banner: tier === 4 ? pull.banner : 0, day: pull.day, species: pull.species || 0 };
      const hatch = readHatch(entries['hatch:' + egg.id]);
      // The first eggs ever pulled need no waves, so a new player hatches straight away.
      const need = nth++ < FREE_HATCHES ? 0 : HATCH_WAVES[tier];
      if (!hatch) {
        const progress = Math.max(0, balance.waves - pull.waves);
        eggs.push({ ...egg, need, free: need === 0, progress: Math.min(progress, need), ready: progress >= need });
        return;
      }
      hatched.push({ ...egg, ...hatch });
      if (tier < 4 && !egg.species) dupe[tier] = hatch.fresh ? 0 : dupe[tier] + 1;
      if (isCut(hatch.species)) {
        const at = lineOf(hatch.species);
        const held = legacy[at] ||= { line: at, star: CUT[at], hatches: 0, shiny: false, look: 'normal' };
        held.hatches++;
        if (hatch.shiny) held.shiny = true;
        return;
      }
      const l = line(lineOf(hatch.species));
      l.hatches++;
      l.skills[hatch.skill] = true;
      if (hatch.shiny) l.shiny = true;
      if (hatch.sp && !l.skins.includes(hatch.sp)) l.skins.push(hatch.sp);
      owned.add(hatch.species);
    });
  }
  // Candy and shard spends, in the order they were made.
  let buddy = null;
  const spends = Object.entries(entries).filter(([id]) => id.startsWith('spend:') || id.startsWith('cfg:'))
    .sort((a, b) => a[1].at - b[1].at || (a[0] < b[0] ? -1 : 1));
  for (const [id, entry] of spends) {
    const x = object(entry.x);
    if (id.startsWith('cfg:buddy:')) {
      if (validNum(x.s)) buddy = { species: x.s, shiny: x.sh === 1, skin: typeof x.sp === 'string' ? x.sp : null, at: entry.at };
      continue;
    }
    if (id === 'cfg:starter') continue;
    if (id.startsWith('cfg:look:')) {
      if (lines[x.l] && typeof x.look === 'string') lines[x.l].look = x.look;
      // A cut line keeps its shiny look elsewhere in Bored (Poké Idle draws every species).
      if (legacy[x.l] && (x.look === 'normal' || x.look === 'shiny')) legacy[x.l].look = x.look;
      continue;
    }
    if (id.startsWith('cfg:skill:')) {
      if (lines[x.l] && Number.isInteger(x.k) && x.k >= 0 && x.k <= 3) lines[x.l].skill = x.k;
      continue;
    }
    if (Array.isArray(x.ev) && validNum(x.ev[1]) && !isCut(x.ev[1])) owned.add(x.ev[1]);
    if (Number.isInteger(x.lv) && legacy[x.lv] && entry.g && entry.g.coins < 0) legacy[x.lv].coins = (legacy[x.lv].coins || 0) - entry.g.coins;
    if (typeof x.up === 'string' && lines[x.l]) {
      if (x.up === 'passive') lines[x.l].passive = true;
      if (x.up === 'cost1') lines[x.l].cost = Math.max(lines[x.l].cost, 1);
      if (x.up === 'cost2') lines[x.l].cost = 2;
    }
    if (typeof x.sp === 'string' && x.sp) {
      const skin = skinById(x.sp);
      const held = skin && lines[lineOf(skin.species)];
      if (held && !held.skins.includes(skin.id)) held.skins.push(skin.id);
    }
  }
  for (const l of Object.values(lines)) {
    l.candy = balance['candy:' + l.line] || 0;
    // A look stays only while it is unlocked (a merge can never lock one, but be safe).
    // Only skins still in the list count; a look stays only while it is unlocked.
    l.skins = l.skins.filter(id => skinById(id));
    if ((l.look === 'shiny' && !l.shiny) || (l.look !== 'normal' && l.look !== 'shiny' && !l.skins.includes(l.look))) l.look = 'normal';
  }
  for (const l of Object.values(legacy)) {
    // Once refunded, the entry says what was paid (its candy is spent by then).
    const paid = entries[CUT_REFUND_PREFIX + l.line];
    l.refunded = !!paid;
    l.candy = paid ? Number(object(paid.x).c) || 0 : Math.max(0, balance['candy:' + l.line] || 0);
    l.coins = paid ? Number(object(paid.x).k) || 0 : l.coins || 0;
    l.refund = cutRefundOf(l);
  }
  // A buddy may come from the Collector's Full Dex too (shiny only if pulled shiny there).
  const full = collectorOwned(entries);
  if (buddy && !owned.has(buddy.species) && !full.has(buddy.species)) buddy = null;
  if (buddy && buddy.shiny && !owned.has(buddy.species) && !full.get(buddy.species)) buddy.shiny = false;
  if (buddy && buddy.skin && !(lines[lineOf(buddy.species)]?.skins.includes(buddy.skin) && skinCovers(buddy.skin, buddy.species))) buddy.skin = null;
  return {
    balance, eggs, hatched, owned: [...owned].sort((a, b) => a - b), lines,
    pity: rarityCounters(pulls), dupe, buddy, pulls: pulls.length,
    starter: starterPick, needsStarter: !starterPick,
    banner: bannerFor(today), today,
    login: !!entries['gacha:login:' + today],
    missions: Object.fromEntries(STARTER_MISSIONS.map(m => [m.id, !!entries['gacha:start:' + m.id]])),
    shop: coinShop(entries, today),
    legacy: Object.values(legacy).sort((a, b) => a.line - b.line),
    active: !!entries.on
  };
}

/* ── Actions: each takes a wallet and returns { wallet, ok, … } ─────────── */

const refuse = (wallet, reason) => ({ wallet: mergeWallet(wallet), ok: false, reason });
const starter = (wallet, id, now) => grantOnce(wallet, 'gacha:start:' + id, STARTER, { now }).wallet;

/** Coin shop: 5 candy for a caught line, 200 coins, up to 50 for that line today. */
/** What buying `count` candy for a line would cost now: coins, what today's cap leaves, and any coins short. */
export function candyOffer(wallet, line, count, { today = dailyDate() } = {}) {
  const state = gachaState(wallet, today), c = COIN_SHOP.candy, n = Math.max(1, Math.floor(Number(count) || 0));
  const left = Math.max(0, c.perLineDay - (state.shop.candyToday[line] || 0)), coins = n * c.each;
  return { count: n, coins, left, have: state.balance.coins, short: Math.max(0, coins - state.balance.coins), fits: n <= left };
}
/** Buy `count` candy for a line (default the 5-pack) at 40 coins each, within 50 per line a day. */
export function buyCandy(wallet, line, { count = COIN_SHOP.candy.candy, today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today), c = COIN_SHOP.candy;
  if (!state.lines[line]) return refuse(wallet, 'not-owned');
  const offer = candyOffer(wallet, line, count, { today });
  if (!offer.fits) return { ...refuse(wallet, 'limit'), left: offer.left };
  if (offer.short) return { ...refuse(wallet, 'coins'), short: offer.short };
  const merged = mergeWallet(wallet);
  let slot = 0;
  while (merged.entries['spend:candy:' + line + ':' + today + ':' + slot]) slot++;
  const r = spendFrom(merged, { coins: offer.coins }, { id: 'candy:' + line + ':' + today + ':' + slot, now, gain: { ['candy:' + line]: offer.count } });
  return r.ok ? { wallet: r.wallet, ok: true, count: offer.count, coins: offer.coins } : { ...refuse(wallet, 'coins'), short: offer.short };
}
/** Coin shop: 10 shards for 500 coins, up to 50 shards a week (Monday to Sunday). */
export function buyShards(wallet, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today), c = COIN_SHOP.shards;
  if (state.shop.shardsLeft < c.shards) return refuse(wallet, 'limit');
  const merged = mergeWallet(wallet);
  let slot = 0;
  while (merged.entries['spend:shards:' + state.shop.monday + ':' + slot]) slot++;
  const r = spendFrom(merged, { coins: c.coins }, { id: 'shards:' + state.shop.monday + ':' + slot, now, gain: { shards: c.shards } });
  return r.ok ? { wallet: r.wallet, ok: true } : refuse(wallet, 'coins');
}
/** Coin shop: the next squad preset slot, up to COIN_SHOP.presets.max. Permanent. */
export function buyPreset(wallet, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  if (state.shop.nextPreset == null) return refuse(wallet, 'owned');
  const r = spendFrom(wallet, { coins: state.shop.nextPreset }, { id: 'preset:' + (state.shop.presets + 1), now });
  return r.ok ? { wallet: r.wallet, ok: true, presets: state.shop.presets + 1 } : refuse(wallet, 'coins');
}

/** Pick the starter, once per account; the three gifts come with it. */
export function pickStarter(wallet, species, { now = Date.now() } = {}) {
  const next = mergeWallet(wallet);
  if (!next.entries.on) return refuse(wallet, 'inactive');
  if (next.entries['cfg:starter']) return refuse(wallet, 'picked');
  if (!STARTERS.includes(species)) return refuse(wallet, 'unknown');
  next.entries['cfg:starter'] = { at: seconds(now), x: { s: species, c: STARTER_GIFTS.slice() } };
  const welcome = grantOnce(next, WELCOME_ID, WELCOME, { now });
  return { wallet: welcome.wallet, ok: true, species, gifts: STARTER_GIFTS.slice(), welcome: welcome.changed ? { ...WELCOME } : null };
}

function rollTier(rand, machine, count) {
  const table = machine === 'legend' ? EGG_RATES.legend : EGG_RATES.standard;
  let roll = Math.floor(rand() * 256);
  let tier = 0;
  for (; tier < table.length - 1 && roll >= table[tier]; tier++) roll -= table[tier];
  // Rarity pity: only a Common egg is upgraded, to the highest tier that is due.
  if (tier === 0) {
    if (count.legendary >= RARITY_PITY[2]) tier = 3;
    else if (count.epic >= RARITY_PITY[1]) tier = 2;
    else if (count.rare >= RARITY_PITY[0]) tier = 1;
  }
  return tier;
}

/**
 * Spend vouchers for eggs. `voucher` is regular, plus, premium or gold; a
 * Regular pull takes `count` 1 or 10. `machine` is move, legend or shiny.
 */
export function pullEggs(wallet, { voucher = 'regular', count = 1, machine = 'move', today = dailyDate(),
  now = Date.now(), rand = Math.random } = {}) {
  const kind = VOUCHERS[voucher];
  if (!kind || !MACHINES[machine]) return refuse(wallet, 'unknown');
  if (voucher === 'regular' && count !== 1 && count !== REGULAR_BATCH) return refuse(wallet, 'unknown');
  const spent = voucher === 'regular' ? count : 1;
  const eggsOut = voucher === 'regular' ? count : kind.eggs;
  const guarantee = voucher === 'regular' && count === REGULAR_BATCH ? 1 : kind.guarantee;
  const state = gachaState(wallet, today);
  if (!state.active) return refuse(wallet, 'inactive');
  if ((state.balance[voucher] || 0) < spent) return refuse(wallet, 'vouchers');
  if (state.eggs.length + eggsOut > MAX_EGGS) return refuse(wallet, 'full');

  const count_ = { ...state.pity };
  const eggs = [];
  for (let i = 0; i < eggsOut; i++) {
    const tier = rollTier(rand, machine, count_);
    eggs.push(tier);
    countEgg(count_, tier, machine);
  }
  if (guarantee && Math.max(...eggs.map(t => Math.min(t, 3))) < guarantee) {
    const lowest = eggs.indexOf(Math.min(...eggs));
    eggs[lowest] = guarantee;
  }
  const banner = machine === 'legend' ? state.banner : 0;
  const x = { m: machine, e: eggs, w: state.balance.waves, n: state.pulls, d: today };
  if (banner) x.b = banner;
  const result = spendFrom(wallet, { [voucher]: spent }, { id: uuid(), now, x });
  if (!result.ok) return refuse(wallet, 'vouchers');
  return { wallet: starter(result.wallet, 'pull', now), ok: true, eggs: eggs.map(tier => ({ tier, banner: tier === 4 ? banner : 0 })) };
}

/** Hatch every egg that has counted down. Results come back in pull order. */
export function hatchReady(wallet, { today = dailyDate(), now = Date.now(), rand = Math.random } = {}) {
  const state = gachaState(wallet, today);
  const ready = state.eggs.filter(egg => egg.ready);
  if (!ready.length) return { wallet: mergeWallet(wallet), ok: true, hatched: [] };
  const next = mergeWallet(wallet);
  const owned = new Set(state.hatched.map(h => h.species));
  if (state.starter) for (const num of [state.starter.species, ...state.starter.gifts]) owned.add(num);
  const dupe = state.dupe.slice();
  const spOwned = {};
  const pools = eggPools();
  const at = seconds(now);
  const results = [];
  for (const egg of ready) {
    const { tier, machine } = egg;
    // A banner egg whose legendary was cut hatches as a kept one: that day's banner.
    let pool = tier === 4 ? [validNum(egg.banner) && !isCut(egg.banner) ? egg.banner : bannerFor(egg.day || today)] : pools[tier];
    if (egg.species) pool = [egg.species];
    else if (tier < 4 && dupe[tier] >= DUPE_PITY) {
      const unseen = pool.filter(num => !owned.has(num));
      if (unseen.length) pool = unseen;
    }
    const species = pool[Math.floor(rand() * pool.length)];
    const fresh = !owned.has(species);
    owned.add(species);
    if (tier < 4 && !egg.species) dupe[tier] = fresh ? 0 : dupe[tier] + 1;
    const shiny = rand() < 1 / (machine === 'shiny' ? SHINY_ODDS.shiny : SHINY_ODDS.other);
    // SP only on Shiny UP, for the line it hatched: a skin of that line it does not own yet, at random if several.
    const line = lineOf(species), have = spOwned[line] ||= new Set(state.lines[line]?.skins || []);
    const skins = machine === 'shiny' ? skinsOfLine(line).filter(skin => !have.has(skin.id)) : [];
    const sp = skins.length && rand() < 1 / SP_ODDS ? skins[Math.floor(rand() * skins.length)].id : null;
    if (sp) have.add(sp);
    // A candy egg's better odds of the rare skill (CANDY_EGG.rare), on any machine.
    const rare = rand() < (egg.species ? 1 / CANDY_EGG.rare : (machine === 'move' ? 2 : 1) / RARE_SKILL[tier]);
    const skill = rare ? 3 : Math.floor(rand() * 3);
    const grant = { ['candy:' + lineOf(species)]: HATCH_CANDY[tier] };
    if (!fresh) grant.shards = DUPE_SHARDS[tier];
    const x = { s: species, t: tier, n: fresh ? 1 : 0, k: skill };
    if (shiny) x.sh = 1;
    if (sp) x.sp = sp;
    next.entries['hatch:' + egg.id] = { at, g: grant, x };
    results.push({ id: egg.id, tier, species, fresh, shiny, sp, skill, candy: HATCH_CANDY[tier], shards: grant.shards || 0 });
  }
  return { wallet: starter(next, 'hatch', now), ok: true, hatched: results };
}

/** Evolve an owned species into one of its evolutions, paid in its line's candy. */
export function evolve(wallet, from, to, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  if (!state.owned.includes(from)) return refuse(wallet, 'not-owned');
  if (!evolutionsOf(from).includes(to)) return refuse(wallet, 'unknown');
  if (state.owned.includes(to)) return refuse(wallet, 'owned');
  const cost = COSTS.evolve[Math.min(stageOf(from), 2) - 1];
  const result = spendFrom(wallet, { ['candy:' + lineOf(from)]: cost }, { id: uuid(), now, x: { ev: [from, to] } });
  return result.ok ? { wallet: result.wallet, ok: true } : refuse(wallet, 'candy');
}

/* ── Candy eggs ──────────────────────────────────────────────────────────
   Candy buys an egg of a line you own (PokéRogue's same-species egg): it hatches that
   line's base form after the usual waves for its tier, with a 1 in CANDY_EGG.rare chance of
   the rare skill (a normal egg's is 1 in 48 for a 3★ to 1 in 6 for a 6★, halved on Move UP).
   Price by the line's tier, about two hatches' candy. It is a pull entry (spend:<uuid>, x.s =
   the line) paid in candy; it never counts toward rarity or dupe pity. */
export const CANDY_EGG = { price: { 3: 20, 4: 40, 5: 60, 6: 100 }, rare: 4 };
export const candyEggPrice = line => CANDY_EGG.price[(DEX[line - 1] || [])[9]] || 0;
export function buyCandyEgg(wallet, line, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today), price = candyEggPrice(line);
  if (!state.active) return refuse(wallet, 'inactive');
  if (!state.lines[line] || !price) return refuse(wallet, 'not-owned');
  if (state.eggs.length >= MAX_EGGS) return refuse(wallet, 'full');
  const tier = EGG_STARS.indexOf(DEX[line - 1][9]);
  const x = { m: 'move', e: [tier], w: state.balance.waves, n: state.pulls, d: today, s: line };
  const result = spendFrom(wallet, { ['candy:' + line]: price }, { id: uuid(), now, x });
  return result.ok ? { wallet: result.wallet, ok: true, tier, price } : refuse(wallet, 'candy');
}

/** Unlock a line's passive, or cut its deploy cost by 1 and then by 2. */
export function upgrade(wallet, line, kind, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  const held = state.lines[line];
  if (!held) return refuse(wallet, 'not-owned');
  if (!['passive', 'cost1', 'cost2'].includes(kind)) return refuse(wallet, 'unknown');
  if ((kind === 'passive' && held.passive) || (kind === 'cost1' && held.cost >= 1) || (kind === 'cost2' && held.cost >= 2))
    return refuse(wallet, 'owned');
  if (kind === 'cost2' && held.cost < 1) return refuse(wallet, 'order');
  const result = spendFrom(wallet, { ['candy:' + line]: COSTS[kind] }, { id: uuid(), now, x: { up: kind, l: line } });
  return result.ok ? { wallet: result.wallet, ok: true } : refuse(wallet, 'candy');
}

/** The shard shop: a listed SP skin, for a species line you own, priced by how many forms it covers. */
export function buySp(wallet, skinId, { today = dailyDate(), now = Date.now() } = {}) {
  const skin = skinById(skinId);
  if (!skin) return refuse(wallet, 'unknown');
  const state = gachaState(wallet, today);
  const held = state.lines[lineOf(skin.species)];
  if (!held) return refuse(wallet, 'not-owned');
  if (held.skins.includes(skin.id)) return refuse(wallet, 'owned');
  const result = spendFrom(wallet, { shards: skinPrice(skin) }, { id: uuid(), now, x: { sp: skin.id } });
  return result.ok ? { wallet: result.wallet, ok: true } : refuse(wallet, 'shards');
}

/** Equip one owned mon as the buddy, in a look the player has unlocked. */
export function setBuddy(wallet, species, { shiny = false, skin = null, today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  // Owned in tower defense, or pulled (or bought) for the Full Dex. A Full Dex buddy wears
  // shiny only if it was pulled shiny there, and never an SP skin (skins belong to TD lines).
  const td = state.owned.includes(species), full = collectorOwned(mergeWallet(wallet).entries);
  if (!td && !full.has(species)) return refuse(wallet, 'not-owned');
  const held = td ? state.lines[lineOf(species)] || {} : { shiny: full.get(species), skins: [] };
  if (td && shiny && !held.shiny && full.get(species)) held.shiny = true;
  if ((shiny && !held.shiny) || (skin && !((held.skins || []).includes(skin) && skinCovers(skin, species)))) return refuse(wallet, 'locked');
  const next = mergeWallet(wallet);
  const x = { s: species };
  if (shiny) x.sh = 1;
  if (skin) x.sp = skin;
  // Two changes in the same second still sort in order: the id leads with the milliseconds.
  next.entries['cfg:buddy:' + Math.floor(now).toString(36).padStart(9, '0') + '-' + uuid()] = { at: seconds(now), x };
  return { wallet: starter(next, 'buddy', now), ok: true };
}

/** The looks a line can wear: normal, shiny if hatched shiny, and each SP skin it owns. */
export const looksOf = held => ['normal'].concat(held.shiny ? ['shiny'] : [], held.skins || []);

/** Choose which unlocked skill a line uses in tower defense (0-3; 3 is the rare one). */
export function setSkill(wallet, line, k, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  const held = state.lines[line];
  if (!held) return refuse(wallet, 'not-owned');
  if (!Number.isInteger(k) || k < 0 || k > 3) return refuse(wallet, 'unknown');
  if (!held.skills[k]) return refuse(wallet, 'locked');
  if (held.skill === k) return refuse(wallet, 'owned');
  const next = mergeWallet(wallet);
  next.entries['cfg:skill:' + Math.floor(now).toString(36).padStart(9, '0') + '-' + uuid()] = { at: seconds(now), x: { l: line, k } };
  return { wallet: next, ok: true };
}

/** Choose the look a line wears in Poké Gacha, Pokédoku and the buddy slot. Cosmetic only. */
export function setLook(wallet, line, look, { today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  const held = state.lines[line];
  if (!held) return refuse(wallet, 'not-owned');
  if (typeof look !== 'string') return refuse(wallet, 'unknown');
  if (!looksOf(held).includes(look)) return refuse(wallet, 'locked');
  if (held.look === look) return refuse(wallet, 'owned');
  const next = mergeWallet(wallet);
  next.entries['cfg:look:' + Math.floor(now).toString(36).padStart(9, '0') + '-' + uuid()] = { at: seconds(now), x: { l: line, look } };
  return { wallet: next, ok: true };
}

/**
 * The look Bored should draw a species in: 'normal', 'shiny', or an SP skin id.
 * A skin is drawn only on the forms it covers; the rest of the line stays normal.
 */
export function lookFor(state, num) {
  const line = state.lines[lineOf(num)];
  if (!line) {
    const cut = (state.legacy || []).find(l => l.line === lineOf(num));
    return cut && cut.shiny && cut.look === 'shiny' ? 'shiny' : 'normal';
  }
  if (line.look === 'normal' || line.look === 'shiny') return line.look;
  return skinCovers(line.look, num) ? line.look : 'normal';
}

/** Three Regulars and the day's casino chips, once a day. */
export function claimLogin(wallet, { today = dailyDate(), now = Date.now() } = {}) {
  if (!mergeWallet(wallet).entries.on) return refuse(wallet, 'inactive');
  const chips = claimDailyChips(wallet, { today, now });
  const result = grantOnce(chips.wallet, 'gacha:login:' + today, LOGIN, { now });

  // An account that picked its starter before the welcome pack existed gets it once, here.
  const welcome = result.wallet.entries['cfg:starter'] ? grantOnce(result.wallet, WELCOME_ID, WELCOME, { now }) : { wallet: result.wallet, changed: false };
  return { wallet: welcome.wallet, ok: result.changed || chips.changed || welcome.changed, login: result.changed, chips: chips.changed ? CHIPS.login : 0,
    welcome: welcome.changed ? { ...WELCOME } : null };
}

/* ── The Collector ───────────────────────────────────────────────────────
   A fourth machine, apart from tower defense: it pulls any of the 1025 species straight
   into the Full Dex, paid in casino chips (CHIPS.login a day, Shotgun Roulette winnings).
   Nothing it gives reaches TD: no line, no candy, no squad. A Full Dex mon can be the buddy.

   Tiers, out of 256 per pull like an egg: Legendary is every legendary and mythical,
   Epic the Ultra Beasts, the Paradox mons and anything else with a base stat total of
   530 or more, Rare 450 to 529, Common the rest. The rarity pity is the eggs' (RARITY_PITY),
   a 10-pull holds at least one Rare, and 1 in SHINY_ODDS.shiny is shiny, as on Shiny UP.

   A species pulled again is a dupe and pays dust by tier; a shiny of one held only plain
   is not a dupe, it adds the shiny. Dust buys any missing species (priced by tier) or shards
   (COLLECTOR.shards, a weekly limit of its own beside the coin shop's).

   Pacing, simulated with 10-pulls and dust spent on the cheapest missing species, sets paying
   chips as they complete: about 140 days to 1025 at 600 chips a day, 85 at 1000, 280 on
   login chips alone. 15 dust a shard makes the 50-a-week cap 750 dust, about a dedicated
   player's weekly dust over the first three months, so a 300-shard skin is six weeks either way.

   Sets pay chips once (col:set:<id>) and show as badges on the Trainer card; 'all' is the
   Full Dex itself and has a badge of its own. */
export const COLLECTOR = Object.freeze({
  pull: 100, ten: 900, batch: 10,
  rates: [204, 44, 7, 1],
  dust: [20, 40, 80, 200],
  price: [10, 20, 50, 100],
  shards: { dust: 150, shards: 10, perWeek: 50 },
  history: 30
});
export const COL_TIERS = ['Common', 'Rare', 'Epic', 'Legendary'];
const ULTRA_BEASTS = [793, 794, 795, 796, 797, 798, 799, 803, 804, 805, 806];
const PARADOX = [984, 985, 986, 987, 988, 989, 990, 991, 992, 993, 994, 995, 1005, 1006, 1009, 1010, 1020, 1021, 1022, 1023];
const bstOf = row => row[2] + row[3] + row[4] + row[5] + row[6] + row[7];
/** A species' Collector tier, 0 Common to 3 Legendary. */
export function colTier(num) {
  const row = DEX[num - 1];
  if (!row) return -1;
  if (row[10] === 'lg' || row[10] === 'my') return 3;
  if (ULTRA_BEASTS.includes(num) || PARADOX.includes(num) || bstOf(row) >= 530) return 2;
  return bstOf(row) >= 450 ? 1 : 0;
}
let colPoolCache = null;
export function colPools() {
  if (!colPoolCache) { colPoolCache = [[], [], [], []]; for (let n = 1; n <= DEX.length; n++) colPoolCache[colTier(n)].push(n); }
  return colPoolCache;
}

// The sets. Each pays its chips once, when every species in it is in the Full Dex.
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const GENS = [[1, 151, 'Kanto'], [152, 251, 'Johto'], [252, 386, 'Hoenn'], [387, 493, 'Sinnoh'], [494, 649, 'Unova'],
  [650, 721, 'Kalos'], [722, 809, 'Alola'], [810, 905, 'Galar'], [906, 1025, 'Paldea']];
const withLine = bases => { const out = []; const add = n => { out.push(n); for (const c of evolutionsOf(n)) add(c); }; bases.forEach(add); return out; };
let setCache = null;
export function collectorSets() {
  if (setCache) return setCache;
  const list = [];
  const set = (id, group, name, chips, nums) => list.push({ id, group, name, chips, nums: [...new Set(nums)].sort((a, b) => a - b) });
  GENS.forEach(([a, b, region], i) => set('gen' + (i + 1), 'Generations', 'Gen ' + (i + 1) + ': ' + region, 1000, range(a, b)));
  for (const type of DEX_TYPES) set('type-' + type.toLowerCase(), 'Types', type, 500, range(1, DEX.length).filter(n => DEX[n - 1][1].split('/').includes(type)));
  GENS.forEach(([, , region], i) => set('starters-' + region.toLowerCase(), 'Starters', region + ' starters', 300, withLine(STARTER_LINES.slice(i * 3, i * 3 + 3))));
  const kind = k => range(1, DEX.length).filter(n => DEX[n - 1][10] === k);
  set('birds', 'Legends', 'Legendary birds', 300, [144, 145, 146]);
  set('beasts', 'Legends', 'Legendary beasts', 300, [243, 244, 245]);
  set('eon', 'Legends', 'Eon duo', 200, [380, 381]);
  set('weather', 'Legends', 'Weather trio', 300, [382, 383, 384]);
  set('regis', 'Legends', 'Regis', 500, [377, 378, 379, 486, 894, 895]);
  set('lakes', 'Legends', 'Lake guardians', 300, [480, 481, 482]);
  set('creation', 'Legends', 'Creation trio', 300, [483, 484, 487]);
  set('swords', 'Legends', 'Swords of Justice', 300, [638, 639, 640, 647]);
  set('forces', 'Legends', 'Forces of Nature', 300, [641, 642, 645, 905]);
  set('tao', 'Legends', 'Tao trio', 300, [643, 644, 646]);
  set('tapus', 'Legends', 'Island guardians', 300, [785, 786, 787, 788]);
  set('ruin', 'Legends', 'Treasures of Ruin', 300, [1001, 1002, 1003, 1004]);
  set('loyal', 'Legends', 'Loyal Three', 300, [1014, 1015, 1016]);
  set('legendary', 'Legends', 'Every legendary', 2000, kind('lg'));
  set('mythical', 'Legends', 'Every mythical', 2000, kind('my'));
  set('eevee', 'Families', 'Eeveelutions', 500, [133, 134, 135, 136, 196, 197, 470, 471, 700]);
  set('fossils', 'Families', 'Fossils', 500, [138, 139, 140, 141, 142, 345, 346, 347, 348, 408, 409, 410, 411, 564, 565, 566, 567, 696, 697, 698, 699, 880, 881, 882, 883]);
  set('babies', 'Families', 'Babies', 500, [172, 173, 174, 175, 236, 238, 239, 240, 298, 360, 406, 433, 438, 439, 440, 446, 447, 458, 848]);
  set('mice', 'Families', 'Electric mice', 300, [25, 26, 172, 311, 312, 417, 587, 702, 777, 877, 921, 922, 923]);
  set('pseudo', 'Families', 'Pseudo-legendary lines', 1000, kind('pseudo'));
  set('ultra', 'Families', 'Ultra Beasts', 1000, ULTRA_BEASTS);
  set('paradox', 'Families', 'Paradox', 1000, PARADOX);
  set('all', 'Full Dex', 'Full Dex', 5000, range(1, DEX.length));
  return (setCache = list);
}

// Entry readers. A pull's x.cp is [[species, flags], …]: flags 1 new, 2 shiny, 4 a new shiny.
const COL_PULL = /^spend:col:/, COL_BUY = /^spend:cbuy:(\d{1,4})$/;
function readColPull(id, entry) {
  const x = object(entry.x);
  if (!COL_PULL.test(id) || !Array.isArray(x.cp) || !x.cp.length || x.cp.length > COLLECTOR.batch) return null;
  const mons = x.cp.filter(p => Array.isArray(p) && validNum(p[0]) && Number.isInteger(p[1]) && p[1] >= 0 && p[1] <= 7);
  if (mons.length !== x.cp.length) return null;
  return { id, at: entry.at, n: Number(x.n) || 0, day: typeof x.d === 'string' ? x.d : '', mons: mons.map(([s, f]) => ({ species: s, tier: colTier(s), fresh: !!(f & 1), shiny: !!(f & 2), newShiny: !!(f & 4) })),
    chips: -(Number(entry.g?.chips) || 0), dust: Number(entry.g?.dust) || 0 };
}
/** Species in the Full Dex, to whether one is shiny. Cheap; gachaState uses it for the buddy. */
export function collectorOwned(entries) {
  const out = new Map();
  for (const [id, entry] of Object.entries(entries)) {
    const buy = id.match(COL_BUY);
    if (buy) { const num = Number(buy[1]); if (validNum(num) && object(entry.x).cb === num && !out.has(num)) out.set(num, false); continue; }
    const pull = COL_PULL.test(id) && readColPull(id, entry);
    if (pull) for (const m of pull.mons) out.set(m.species, out.get(m.species) || m.shiny);
  }
  return out;
}
const colCounters = pulls => {
  const count = { rare: 0, epic: 0, legendary: 0 };
  for (const p of pulls) for (const m of p.mons) countEgg(count, m.tier, 'collector');
  return count;
};
/** Everything the Collector shows, from the wallet. */
export function collectorState(wallet, today = dailyDate()) {
  const merged = mergeWallet(wallet), entries = merged.entries, balance = walletBalance(merged);
  const pulls = Object.entries(entries).map(([id, e]) => readColPull(id, e)).filter(Boolean)
    .sort((a, b) => a.n - b.n || a.at - b.at || (a.id < b.id ? -1 : 1));
  const owned = collectorOwned(entries);
  const bought = Object.keys(entries).filter(id => COL_BUY.test(id)).length;
  const monday = mondayOfDay(today);
  let shardsWeek = 0;
  for (const id of Object.keys(entries)) if (id.startsWith('spend:cdust:' + monday + ':')) shardsWeek += COLLECTOR.shards.shards;
  const sets = collectorSets().map(set => {
    const have = set.nums.filter(n => owned.has(n)).length;
    return { id: set.id, group: set.group, name: set.name, chips: set.chips, need: set.nums.length, have,
      complete: have === set.nums.length, claimed: !!entries['col:set:' + set.id] };
  });
  return {
    owned: [...owned.keys()].sort((a, b) => a - b), shiny: [...owned].filter(([, sh]) => sh).map(([n]) => n).sort((a, b) => a - b),
    total: DEX.length, count: owned.size, bought,
    chips: balance.chips || 0, dust: balance.dust || 0,
    pity: colCounters(pulls), pulls: pulls.reduce((t, p) => t + p.mons.length, 0),
    history: pulls.slice(-COLLECTOR.history).reverse(),
    shop: { monday, shardsWeek, shardsLeft: Math.max(0, COLLECTOR.shards.perWeek - shardsWeek) },
    sets, badges: sets.filter(s => s.claimed).map(s => s.id),
    active: !!entries.on, login: !!entries['chips:login:' + today]
  };
}

/** Pull 1 (100 chips) or 10 (900 chips, at least one Rare). Dupes pay dust in the same entry. */
export function pullCollector(wallet, { count = 1, today = dailyDate(), now = Date.now(), rand = Math.random } = {}) {
  if (count !== 1 && count !== COLLECTOR.batch) return refuse(wallet, 'unknown');
  const state = collectorState(wallet, today);
  if (!state.active) return refuse(wallet, 'inactive');
  const cost = count === 1 ? COLLECTOR.pull : COLLECTOR.ten;
  if (state.chips < cost) return refuse(wallet, 'chips');
  const pools = colPools(), pity = { ...state.pity }, tiers = [];
  for (let i = 0; i < count; i++) {
    let roll = Math.floor(rand() * 256), tier = 0;
    for (; tier < 3 && roll >= COLLECTOR.rates[tier]; tier++) roll -= COLLECTOR.rates[tier];
    if (tier === 0) {
      if (pity.legendary >= RARITY_PITY[2]) tier = 3;
      else if (pity.epic >= RARITY_PITY[1]) tier = 2;
      else if (pity.rare >= RARITY_PITY[0]) tier = 1;
    }
    tiers.push(tier);
    countEgg(pity, tier, 'collector');
  }
  if (count === COLLECTOR.batch && Math.max(...tiers) < 1) tiers[tiers.indexOf(0)] = 1;
  const held = new Map(state.owned.map(n => [n, state.shiny.includes(n)]));
  let dust = 0;
  const mons = tiers.map(tier => {
    const pool = pools[tier], species = pool[Math.floor(rand() * pool.length)];
    const shiny = rand() < 1 / SHINY_ODDS.shiny, has = held.has(species), hadShiny = held.get(species);
    let flags = shiny ? 2 : 0;
    if (!has) flags |= 1;
    else if (shiny && !hadShiny) flags |= 4;
    else dust += COLLECTOR.dust[tier];
    held.set(species, hadShiny || shiny);
    return [species, flags];
  });
  const r = spendFrom(wallet, { chips: cost }, { id: 'col:' + uuid(), now, gain: dust ? { dust } : {}, x: { cp: mons, n: state.pulls, d: today } });
  if (!r.ok) return refuse(wallet, 'chips');
  const paid = claimCollectorSets(r.wallet, { today, now });
  return { wallet: paid.wallet, ok: true, dust, sets: paid.sets,
    mons: mons.map(([species, f]) => ({ species, tier: colTier(species), fresh: !!(f & 1), shiny: !!(f & 2), newShiny: !!(f & 4) })) };
}
/** Buy one missing species for the Full Dex with dust, priced by its tier. */
export function buyCollectorMon(wallet, species, { today = dailyDate(), now = Date.now() } = {}) {
  if (!validNum(species)) return refuse(wallet, 'unknown');
  const state = collectorState(wallet, today);
  if (!state.active) return refuse(wallet, 'inactive');
  if (state.owned.includes(species)) return refuse(wallet, 'owned');
  const price = COLLECTOR.price[colTier(species)];
  const r = spendFrom(wallet, { dust: price }, { id: 'cbuy:' + species, now, x: { cb: species } });
  if (!r.ok) return refuse(wallet, 'dust');
  const paid = claimCollectorSets(r.wallet, { today, now });
  return { wallet: paid.wallet, ok: true, price, sets: paid.sets };
}
/** 10 shards for 150 dust, up to 50 shards a week (Monday to Sunday), apart from the coin shop's 50. */
export function buyDustShards(wallet, { today = dailyDate(), now = Date.now() } = {}) {
  const state = collectorState(wallet, today), c = COLLECTOR.shards;
  if (state.shop.shardsLeft < c.shards) return refuse(wallet, 'limit');
  const merged = mergeWallet(wallet);
  let slot = 0;
  while (merged.entries['spend:cdust:' + state.shop.monday + ':' + slot]) slot++;
  const r = spendFrom(merged, { dust: c.dust }, { id: 'cdust:' + state.shop.monday + ':' + slot, now, gain: { shards: c.shards } });
  return r.ok ? { wallet: r.wallet, ok: true } : refuse(wallet, 'dust');
}
/** Pay every complete set not paid yet. ok when something paid; `sets` names them. */
export function claimCollectorSets(wallet, { today = dailyDate(), now = Date.now() } = {}) {
  let next = mergeWallet(wallet);
  const due = collectorState(next, today).sets.filter(s => s.complete && !s.claimed);
  for (const s of due) next = grantOnce(next, 'col:set:' + s.id, { chips: s.chips }, { now }).wallet;
  return { wallet: next, ok: due.length > 0, sets: due.map(s => ({ id: s.id, name: s.name, chips: s.chips })) };
}

/* ── The bridge Poké Gacha's page calls through `parent.__boredGacha` ───── */

/**
 * Every action reads this browser's wallet, applies itself and writes it back,
 * so the hub's copy is the only one. `onChange` runs after each write (the
 * hub syncs the account and redraws the buddy).
 */
export function gachaBridge({ onChange = () => {} } = {}) {
  const act = run => (options = {}) => {
    let { wallet, ...result } = run(readWallet(), { ...options, today: dailyDate(), now: Date.now() });
    // Any change can meet a trophy (a hatch, a skin, a clear): pay it in the same write.
    if (result.ok && wallet && typeof claimTrophies === 'function') wallet = claimTrophies(wallet).wallet;
    if (result.ok && wallet) { writeWallet(wallet); try { onChange(); } catch {} }
    return result;
  };
  return {
    dex: DEX, types: DEX_TYPES, tiers: EGG_TIERS, stars: EGG_STARS, machines: MACHINES, vouchers: VOUCHERS,
    costs: COSTS, missions: STARTER_MISSIONS, maxEggs: MAX_EGGS, batch: REGULAR_BATCH,
    starters: STARTERS, starterGifts: STARTER_GIFTS, freeHatches: FREE_HATCHES,
    skillsOf, skillTypesOf, lineOf, stageOf, evolutionsOf,
    state: () => gachaState(readWallet(), dailyDate()),
    trophies: () => walletTrophies(readWallet()),
    // Every trophy, earned or not, with its progress (have / need).
    trophyList: () => walletTrophyList(readWallet()),
    // The Poké Idle daily boss streak (weekdays in a row), for the Trainer card.
    bossStreak: () => bossStreak(readWallet(), dailyDate()),
    pickStarter: act((w, o) => pickStarter(w, o.species, o)),
    pull: act((w, o) => pullEggs(w, o)),
    hatch: act((w, o) => hatchReady(w, o)),
    buyRegular: act((w, o) => buyRegular(w, o.count || 1, { now: o.now })),
    evolve: act((w, o) => evolve(w, o.from, o.to, o)),
    upgrade: act((w, o) => upgrade(w, o.line, o.kind, o)),
    setBuddy: act((w, o) => setBuddy(w, o.species, o)),
    buySkin: act((w, o) => buySp(w, o.skin, o)),
    // The coin shop: candy for a line, shards, squad preset slots (limits in state().shop).
    coinShop: COIN_SHOP,
    buyCandy: act((w, o) => buyCandy(w, o.line, o)),
    // The missing-candy prompt: what count candy would cost now (no write).
    candyOffer: o => candyOffer(readWallet(), o.line, o.count, { today: dailyDate() }),
    buyShards: act((w, o) => buyShards(w, o)),
    buyPreset: act((w, o) => buyPreset(w, o)),
    skins: () => skinList(), looksOf, lookFor: num => lookFor(gachaState(readWallet()), num), skinDir: SKIN_DIR, skinFile, skinPrice,
    setLook: act((w, o) => setLook(w, o.line, o.look, o)),
    setSkill: act((w, o) => setSkill(w, o.line, o.skill, o)),
    claimLogin: act((w, o) => claimLogin(w, o)),
    // The one-time refund for owned lines cut from the roster: { ok, lines, total }.
    claimCutRefund: act((w, o) => claimCutRefund(w, o)),
    // Trophies met but not paid yet (ones that existed before their trophy did, for instance).
    claimTrophies: act((w, o) => claimTrophies(w, o)),
    // The Legendary UP banner on any day (it comes from the shared daily seed).
    bannerFor,
    // An egg of an owned line, for candy (better odds of the rare skill).
    buyCandyEgg: act((w, o) => buyCandyEgg(w, o.line, o)), candyEgg: CANDY_EGG, candyEggPrice,
    cutRefund: CUT_REFUND, cutCandy: CUT_CANDY, isCut,
    // The Collector: its own machine, Full Dex, dust shop and sets, paid in casino chips.
    collector: {
      rules: COLLECTOR, tiers: COL_TIERS, chipsPerDay: CHIPS.login, tierOf: colTier, sets: () => collectorSets(),
      state: () => collectorState(readWallet(), dailyDate()),
      pull: act((w, o) => pullCollector(w, o)),
      buy: act((w, o) => buyCollectorMon(w, o.species, o)),
      buyShards: act((w, o) => buyDustShards(w, o)),
      claimSets: act((w, o) => claimCollectorSets(w, o))
    }
  };
}

/**
 * Looks for other games (Pokédoku): `look(num)` is 'normal', 'shiny', or the
 * URL of an SP skin's art.
 * The state is cached for a few seconds, since a board asks once per sprite.
 */
export function storedLooks() {
  let cached = null, at = 0;
  return num => {
    try {
      if (!cached || Date.now() - at > 3000) { cached = gachaState(readWallet()); at = Date.now(); }
      const look = validNum(Number(num)) ? lookFor(cached, Number(num)) : 'normal';
      return look === 'normal' || look === 'shiny' ? look : new URL(SKIN_DIR + skinFile(look, Number(num)), location.href).href;
    } catch { return 'normal'; }
  };
}

/** The equipped buddy for the hub header, or null. */
export function storedBuddy() {
  try { return gachaState(readWallet()).buddy; } catch { return null; }
}

/* ── Poké Gacha trophies (the Trophies tab; S, M and B pay 1 Plus, 1 Premium, 1 Gold) ── */
const ROSTER_LINES = DEX.map((row, i) => (!row[8] && row[9] > 0 ? i + 1 : 0)).filter(Boolean);
export function gachaTrophyStats(entries) {
  const lines = new Set();
  let epic = 0, legend = 0, shiny = 0, sp = 0;
  const add = num => { if (validNum(num) && DEX[lineOf(num) - 1][9] > 0) lines.add(lineOf(num)); };
  for (const [id, entry] of Object.entries(entries)) {
    const x = object(entry.x);
    if (id.startsWith('hatch:')) { add(x.s); if (x.t >= 2) epic = 1; if (x.t >= 3) legend = 1; if (x.sh) shiny = 1; if (x.sp) sp = 1; }
    else if (id === 'cfg:starter') { add(x.s); for (const n of x.c || []) add(n); }
    else if (id.startsWith('spend:') && typeof x.sp === 'string' && x.sp) sp = 1;
  }
  return { dexPct: Math.floor(100 * lines.size / ROSTER_LINES.length), epic, legend, shiny, sp };
}
if (typeof addAchievements === 'function' && typeof achievement === 'function') addAchievements([
  ...[[25, 'S'], [50, 'M'], [75, 'M'], [100, 'B']].map(([n, tier]) => achievement('pg-dex-' + n, 'poke-gacha', 'Poké Gacha: Dex ' + n + '%', tier, s => s.ext.dexPct || 0, n)),
  achievement('pg-epic', 'poke-gacha', 'Poké Gacha: first Epic', 'S', s => s.ext.epic || 0, 1),
  achievement('pg-legend', 'poke-gacha', 'Poké Gacha: first Legendary', 'M', s => s.ext.legend || 0, 1),
  achievement('pg-shiny', 'poke-gacha', 'Poké Gacha: first shiny', 'M', s => s.ext.shiny || 0, 1),
  achievement('pg-sp', 'poke-gacha', 'Poké Gacha: first SP skin', 'B', s => s.ext.sp || 0, 1)
], gachaTrophyStats);
