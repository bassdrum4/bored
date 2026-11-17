// Poké Gacha engine: eggs, machines, pity, hatching, candy, shards, dex, buddy
// and SP skins. A port of PokéRogue's egg gacha onto the Bored wallet.
//
// Everything is an entry in the wallet ledger (src/hub/rewards.js), so it
// syncs and merges across devices like every other grant:
//   spend:<uuid>        a pull: vouchers spent, x = { m, e, b, w, n, d }
//                         m machine, e egg tiers, b banner species, w waves
//                         total when pulled, n pulls before it, d day
//   spend:<uuid>        candy and shard spends: x = { ev } | { up, l } | { sp: skin id }
//   hatch:<uuid>.<i>    egg i of that pull hatched: g = shards + candy,
//                         x = { s, t, n, sh, sp, k } species, tier, new, shiny, SP skin id, skill
//   cfg:buddy:<uuid>    the equipped buddy; the latest one counts
//   cfg:look:<uuid>     the look a line wears across Bored (x = { l, look }); the latest counts
// The hatch id is fixed by the egg, so an egg hatched on two devices pays once.
// Eggs count down on the wallet's running wave total, which is never spent:
// an egg's progress is the waves earned since it was pulled.
//
// Pulls are cosmetic everywhere but Poké Gacha's own tower defense.
import { DEX, DEX_TYPES } from './gacha-dex.js';
import { dailyDate, seedNumber } from '../daily.js';
import {
  mergeWallet, walletBalance, spendFrom, grantOnce, buyRegular, readWallet, writeWallet, walletTrophies
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
   Hand-drawn skins for a few species, listed in
   src/games/content/poke-gacha/sp/skins.json as { id, species, name } with
   the art at sp/<id>.png. The hub loads the list with setSkins(). Shiny UP
   rolls an SP skin only for a species that has one; the shard shop sells
   only listed skins. With an empty list there is no SP anywhere. */
export const SKIN_DIR = 'games/content/poke-gacha/sp/';
const SKIN_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
let SKINS = [];
export function setSkins(list) {
  const seen = new Set();
  SKINS = (Array.isArray(list) ? list : []).filter(skin => skin && SKIN_ID.test(skin.id) && !seen.has(skin.id) &&
    Number.isInteger(skin.species) && skin.species >= 1 && skin.species <= DEX.length && typeof skin.name === 'string' && skin.name.trim() &&
    seen.add(skin.id)).map(({ id, species, name }) => ({ id, species, name: name.trim().slice(0, 40) }));
  return SKINS.length;
}
export const skinList = () => SKINS.slice();
export const skinById = id => SKINS.find(skin => skin.id === id) || null;
const skinsOfSpecies = num => SKINS.filter(skin => skin.species === num);
export const COSTS = { evolve: [25, 100], passive: 50, cost1: 30, cost2: 60, sp: 300 };
export const LOGIN = { regular: 3 };
export const STARTER = { regular: 2 };
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

/* ── Reading the ledger ──────────────────────────────────────────────────── */

function readPulls(entries) {
  const pulls = [];
  for (const [id, entry] of Object.entries(entries)) {
    const x = object(entry.x);
    if (!id.startsWith('spend:') || !Array.isArray(x.e) || !MACHINES[x.m]) continue;
    const eggs = x.e.filter(t => Number.isInteger(t) && t >= 0 && t <= 4);
    if (eggs.length !== x.e.length || !eggs.length) continue;
    if (eggs.includes(4) && !validNum(x.b)) continue;
    pulls.push({ id, key: id.slice(6), at: entry.at, n: Number(x.n) || 0, machine: x.m, eggs,
      banner: x.b || 0, waves: Number(x.w) || 0, day: typeof x.d === 'string' ? x.d : '' });
  }
  return pulls.sort((a, b) => a.n - b.n || a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
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
  for (const pull of pulls) for (const tier of pull.eggs) countEgg(count, tier, pull.machine);
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
  const line = num => (lines[num] ||= { line: num, hatches: 0, shiny: false, skins: [], skills: [false, false, false, false],
    passive: false, cost: 0, look: 'normal' });
  for (const pull of pulls) {
    pull.eggs.forEach((tier, i) => {
      const egg = { id: pull.key + '.' + i, tier, machine: pull.machine, banner: tier === 4 ? pull.banner : 0, day: pull.day };
      const hatch = readHatch(entries['hatch:' + egg.id]);
      if (!hatch) {
        const progress = Math.max(0, balance.waves - pull.waves);
        eggs.push({ ...egg, need: HATCH_WAVES[tier], progress: Math.min(progress, HATCH_WAVES[tier]),
          ready: progress >= HATCH_WAVES[tier] });
        return;
      }
      hatched.push({ ...egg, ...hatch });
      const l = line(lineOf(hatch.species));
      l.hatches++;
      l.skills[hatch.skill] = true;
      if (hatch.shiny) l.shiny = true;
      if (hatch.sp && !l.skins.includes(hatch.sp)) l.skins.push(hatch.sp);
      owned.add(hatch.species);
      if (tier < 4) dupe[tier] = hatch.fresh ? 0 : dupe[tier] + 1;
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
    if (id.startsWith('cfg:look:')) {
      if (lines[x.l] && typeof x.look === 'string') lines[x.l].look = x.look;
      continue;
    }
    if (Array.isArray(x.ev) && validNum(x.ev[1])) owned.add(x.ev[1]);
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
  if (buddy && !owned.has(buddy.species)) buddy = null;
  if (buddy && buddy.skin && !(lines[lineOf(buddy.species)]?.skins.includes(buddy.skin) && skinById(buddy.skin).species === buddy.species)) buddy.skin = null;
  return {
    balance, eggs, hatched, owned: [...owned].sort((a, b) => a - b), lines,
    pity: rarityCounters(pulls), dupe, buddy, pulls: pulls.length,
    banner: bannerFor(today), today,
    login: !!entries['gacha:login:' + today],
    missions: Object.fromEntries(STARTER_MISSIONS.map(m => [m.id, !!entries['gacha:start:' + m.id]])),
    active: !!entries.on
  };
}

/* ── Actions: each takes a wallet and returns { wallet, ok, … } ─────────── */

const refuse = (wallet, reason) => ({ wallet: mergeWallet(wallet), ok: false, reason });
const starter = (wallet, id, now) => grantOnce(wallet, 'gacha:start:' + id, STARTER, { now }).wallet;

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
  const dupe = state.dupe.slice();
  const pools = eggPools();
  const at = seconds(now);
  const results = [];
  for (const egg of ready) {
    const { tier, machine } = egg;
    let pool = tier === 4 ? [egg.banner] : pools[tier];
    if (tier < 4 && dupe[tier] >= DUPE_PITY) {
      const unseen = pool.filter(num => !owned.has(num));
      if (unseen.length) pool = unseen;
    }
    const species = pool[Math.floor(rand() * pool.length)];
    const fresh = !owned.has(species);
    owned.add(species);
    if (tier < 4) dupe[tier] = fresh ? 0 : dupe[tier] + 1;
    const shiny = rand() < 1 / (machine === 'shiny' ? SHINY_ODDS.shiny : SHINY_ODDS.other);
    // SP only on Shiny UP, and only for a species that has a skin in the list.
    const skins = machine === 'shiny' ? skinsOfSpecies(species) : [];
    const sp = skins.length && rand() < 1 / SP_ODDS ? skins[Math.floor(rand() * skins.length)].id : null;
    const rare = rand() < (machine === 'move' ? 2 : 1) / RARE_SKILL[tier];
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

/** The shard shop: a listed SP skin, for a species line you own. */
export function buySp(wallet, skinId, { today = dailyDate(), now = Date.now() } = {}) {
  const skin = skinById(skinId);
  if (!skin) return refuse(wallet, 'unknown');
  const state = gachaState(wallet, today);
  const held = state.lines[lineOf(skin.species)];
  if (!held) return refuse(wallet, 'not-owned');
  if (held.skins.includes(skin.id)) return refuse(wallet, 'owned');
  const result = spendFrom(wallet, { shards: COSTS.sp }, { id: uuid(), now, x: { sp: skin.id } });
  return result.ok ? { wallet: result.wallet, ok: true } : refuse(wallet, 'shards');
}

/** Equip one owned mon as the buddy, in a look the player has unlocked. */
export function setBuddy(wallet, species, { shiny = false, skin = null, today = dailyDate(), now = Date.now() } = {}) {
  const state = gachaState(wallet, today);
  if (!state.owned.includes(species)) return refuse(wallet, 'not-owned');
  const held = state.lines[lineOf(species)] || {};
  if ((shiny && !held.shiny) || (skin && !((held.skins || []).includes(skin) && skinById(skin)?.species === species))) return refuse(wallet, 'locked');
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
 * A skin is drawn only on its own species; the rest of the line stays normal.
 */
export function lookFor(state, num) {
  const line = state.lines[lineOf(num)];
  if (!line) return 'normal';
  if (line.look === 'normal' || line.look === 'shiny') return line.look;
  return skinById(line.look)?.species === num ? line.look : 'normal';
}

/** Three Regulars, once a day. */
export function claimLogin(wallet, { today = dailyDate(), now = Date.now() } = {}) {
  if (!mergeWallet(wallet).entries.on) return refuse(wallet, 'inactive');
  const result = grantOnce(wallet, 'gacha:login:' + today, LOGIN, { now });
  return { wallet: result.wallet, ok: result.changed };
}

/* ── The bridge Poké Gacha's page calls through `parent.__boredGacha` ───── */

/**
 * Every action reads this browser's wallet, applies itself and writes it back,
 * so the hub's copy is the only one. `onChange` runs after each write (the
 * hub syncs the account and redraws the buddy).
 */
export function gachaBridge({ onChange = () => {} } = {}) {
  const act = run => (options = {}) => {
    const { wallet, ...result } = run(readWallet(), { ...options, today: dailyDate(), now: Date.now() });
    if (result.ok && wallet) { writeWallet(wallet); try { onChange(); } catch {} }
    return result;
  };
  return {
    dex: DEX, types: DEX_TYPES, tiers: EGG_TIERS, stars: EGG_STARS, machines: MACHINES, vouchers: VOUCHERS,
    costs: COSTS, missions: STARTER_MISSIONS, maxEggs: MAX_EGGS, batch: REGULAR_BATCH,
    skillsOf, lineOf, stageOf, evolutionsOf,
    state: () => gachaState(readWallet(), dailyDate()),
    trophies: () => walletTrophies(readWallet()),
    pull: act((w, o) => pullEggs(w, o)),
    hatch: act((w, o) => hatchReady(w, o)),
    buyRegular: act((w, o) => buyRegular(w, o.count || 1, { now: o.now })),
    evolve: act((w, o) => evolve(w, o.from, o.to, o)),
    upgrade: act((w, o) => upgrade(w, o.line, o.kind, o)),
    setBuddy: act((w, o) => setBuddy(w, o.species, o)),
    buySkin: act((w, o) => buySp(w, o.skin, o)),
    skins: () => skinList(), looksOf, lookFor: num => lookFor(gachaState(readWallet()), num), skinDir: SKIN_DIR,
    setLook: act((w, o) => setLook(w, o.line, o.look, o)),
    claimLogin: act((w, o) => claimLogin(w, o))
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
      return look === 'normal' || look === 'shiny' ? look : new URL(SKIN_DIR + look + '.png', location.href).href;
    } catch { return 'normal'; }
  };
}

/** The equipped buddy for the hub header, or null. */
export function storedBuddy() {
  try { return gachaState(readWallet()).buddy; } catch { return null; }
}
