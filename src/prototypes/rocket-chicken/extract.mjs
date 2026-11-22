#!/usr/bin/env node
// Regenerate the data block inside src/games/content/rocket-chicken.html from
// the decompiled ActionScript in source/as3/. The Flash game keeps its shop and
// its unlock ladder in timeline frames rather than in readable code, so the
// numbers below are parsed out of the recovered scripts instead of retyped:
//
//   RocketChicken_fla/chicken_helmets_68.as   mood, protect, price per helmet
//   RocketChicken_fla/chicken_belt_65.as      protect, weight, price per belt
//   RocketChicken_fla/items_31.as             fuel, weight, power, price per rocket
//   globalVars.as                             the item name lists, in frame order
//   main.as                                   the distance that unlocks each item
//
//   node src/prototypes/rocket-chicken/extract.mjs           rewrite the data block
//   node src/prototypes/rocket-chicken/extract.mjs --check   verify it still matches
//
// The block is plain JSON so the game document stays a single self-contained
// file. No Java, no FFDec and no network are needed here — the scripts are
// already in source/as3/.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = fileURLToPath(new URL('../..', import.meta.url));
const scripts = here + 'source/as3/';
const gamePath = root + 'games/content/rocket-chicken.html';
const BEGIN = '<!-- BEGIN GENERATED DATA -->';
const END = '<!-- END GENERATED DATA -->';

const read = (path) => readFileSync(scripts + path, 'utf8').replace(/\r/g, '');

/* ── names, in the order the timeline uses them ─────────────────────────── */

function names(source, field) {
  const match = source.match(new RegExp(field + ':Vector\\.<String> = Vector\\.<String>\\(\\[([\\s\\S]*?)\\]\\)'));
  if (!match) throw new Error('could not find ' + field + ' in globalVars.as');
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/* ── timeline frames: `internal function frameN` sets the item's numbers ─── */

function frames(source, fields) {
  const parts = source.split(/internal function frame(\d+)\(\) : \*/);
  const out = [];
  for (let i = 1; i < parts.length; i += 2) {
    const body = parts[i + 1];
    const row = { frame: Number(parts[i]) };
    let found = 0;
    for (const field of fields) {
      const match = body.match(new RegExp('this\\.' + field + '\\s*=\\s*(-?[0-9.]+)'));
      if (match) { row[field] = Number(match[1]); found += 1; }
    }
    if (found) out.push(row);
  }
  return out;
}

const helmetFrames = frames(read('RocketChicken_fla/chicken_helmets_68.as'), ['mood', 'prot', 'num']);
const beltFrames = frames(read('RocketChicken_fla/chicken_belt_65.as'), ['prot', 'weight', 'num']);
const rocketFrames = frames(read('RocketChicken_fla/items_31.as'), ['fuel', 'weight', 'intensitet', 'num']);

const helmetNames = names(read('globalVars.as'), 'thelmet');
const beltNames = names(read('globalVars.as'), 'tbelt');
const rocketNames = names(read('globalVars.as'), 'trocket');

// The helmet sprite has one leading frame ("none", no price) before the 72
// named hats, so frame N is helmet N-1. Belts map one-to-one. Rockets are one
// symbol per rocket rather than one long timeline, so the priced frames are
// sorted by price and paired with the name list in purchase order.
const helmets = helmetNames.map((name, index) => {
  const row = helmetFrames.find((entry) => entry.frame === index + 2);
  if (!row || !row.num) throw new Error('missing helmet frame for ' + name);
  return [name, row.mood, row.prot, row.num];
});
const belts = beltNames.map((name, index) => {
  const row = beltFrames.find((entry) => entry.frame === index + 1);
  if (!row || !row.num) throw new Error('missing belt frame for ' + name);
  return [name, row.prot, row.weight, row.num];
});
const rocketRows = rocketFrames.filter((row) => row.num).sort((a, b) => a.num - b.num);
if (rocketRows.length < rocketNames.length) {
  throw new Error('only ' + rocketRows.length + ' priced rocket frames for ' + rocketNames.length + ' rockets');
}
const rockets = rocketNames.map((name, index) => {
  const row = rocketRows[Math.min(index, rocketRows.length - 1)];
  return [name, row.fuel, row.weight, row.intensitet, row.num];
});

/* ── unlock ladder: distance -> the items it hands over ─────────────────── */

function unlockLadder(source) {
  const start = source.indexOf('switch(this.unlockCount)');
  const end = source.indexOf('if(this.sTree.visible)', start);
  if (start < 0 || end < 0) throw new Error('could not find the unlock switch in main.as');
  const block = source.slice(start, end);
  const ladder = [];
  for (const match of block.matchAll(/case (\d+):\s*if\(this\.distance > (\d+)\)\s*\{([\s\S]*?)\n\s*\}\s*break;/g)) {
    const items = [...match[3].matchAll(/this\.unlock\("([^"]+)","([^"]+)"\)/g)].map((m) => m[1]);
    if (items.length) ladder.push([Number(match[2]), items]);
  }
  if (ladder.length < 50) throw new Error('only found ' + ladder.length + ' unlock steps');
  return ladder;
}

const unlocks = unlockLadder(read('main.as'));

const data = { helmets, belts, rockets, unlocks };
const block = BEGIN + '\n<script type="application/json" id="rocket-chicken-data">\n' +
  JSON.stringify(data) + '\n</script>\n' + END;

/* ── write or check ─────────────────────────────────────────────────────── */

const document = readFileSync(gamePath, 'utf8');
const from = document.indexOf(BEGIN);
const to = document.indexOf(END);
if (from < 0 || to < 0) throw new Error('game document has no generated-data markers');

if (process.argv.includes('--check')) {
  const current = document.slice(from, to + END.length);
  if (current !== block) {
    console.error('run the extracted data block: the game document no longer matches source/as3/.');
    process.exit(1);
  }
  console.log('extracted data matches source/as3/ (' + helmets.length + ' helmets, ' +
    belts.length + ' belts, ' + rockets.length + ' rockets, ' + unlocks.length + ' unlocks)');
} else {
  writeFileSync(gamePath, document.slice(0, from) + block + document.slice(to + END.length));
  console.log('wrote ' + helmets.length + ' helmets, ' + belts.length + ' belts, ' +
    rockets.length + ' rockets, ' + unlocks.length + ' unlock steps');
}
