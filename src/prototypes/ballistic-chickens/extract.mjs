#!/usr/bin/env node
// The shop ladder and the obstacle row are data in the Scratch project, not in
// my head: the `upgrades` and `Obstacles` lists are rebuilt at the green flag
// by a script inside the project. This reads project.json (the project's own
// sb3 JSON, saved from projects.scratch.mit.edu) and writes the two tables the
// game uses, so a typo cannot drift the port away from the source.
//
//   node src/prototypes/ballistic-chickens/extract.mjs           # rewrite
//   node src/prototypes/ballistic-chickens/extract.mjs --check   # verify only
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const project = JSON.parse(readFileSync(join(here, 'project.json'), 'utf8'));
const docPath = join(here, '../../games/content/ballistic-chickens.html');

const BEGIN = '/* BEGIN GENERATED DATA (extract.mjs rewrites this from project.json) */';
const END = '/* END GENERATED DATA */';

const stage = project.targets.find((target) => target.isStage);
if (!stage) throw new Error('project.json has no stage');

const lists = {};
for (const list of Object.values(stage.lists || {})) lists[list[0]] = list[1];

const upgrades = lists.upgrades;
const obstacles = lists.Obstacles;
if (!Array.isArray(upgrades) || upgrades.length % 6 !== 0) {
  throw new Error('the upgrades list is not six values per upgrade');
}
if (!Array.isArray(obstacles) || obstacles.length % 5 !== 0) {
  throw new Error('the Obstacles list is not five values per row');
}

const quote = (value) => "'" + String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

const rows = [];
for (let i = 0; i < upgrades.length; i += 6) {
  const [name, blurb, costMultiplier, firstCost, delta] = upgrades.slice(i, i + 6);
  // the sixth value is the saved level; a fresh player starts at zero.
  rows.push(`  [${quote(name)}, ${quote(blurb)}, ${costMultiplier}, ${firstCost}, ${delta}, 0],`);
}

const obstacleRows = [];
for (let i = 0; i < obstacles.length; i += 5) {
  // [name, hardness in px/s, cash, distance in px, destroyed]
  const [name, hardness, cash, distance] = obstacles.slice(i, i + 5);
  if (name === 'Empty') continue;  // the list's terminator, not an obstacle
  obstacleRows.push(`  [${quote(name)}, ${hardness}, ${distance}, ${cash}],`);
}

const block = [
  BEGIN,
  '// [name, blurb, costMultiplier, firstCost, delta, level]',
  'const UPGRADES = [',
  ...rows,
  '];',
  '// [name, hardness in px/s, distance in px, cash]',
  'const OBSTACLES = [',
  ...obstacleRows,
  '];',
  END
].join('\n');

const html = readFileSync(docPath, 'utf8');
const start = html.indexOf(BEGIN);
const end = html.indexOf(END);
if (start < 0 || end < 0) throw new Error('the game document has no generated-data markers');

const current = html.slice(start, end + END.length);
const check = process.argv.includes('--check');

if (check) {
  if (current !== block) {
    console.error('Ballistic Chickens: the game data no longer matches project.json');
    console.error('Run: node src/prototypes/ballistic-chickens/extract.mjs');
    process.exit(1);
  }
  console.log(`extracted data matches project.json (${rows.length} upgrades, ${obstacleRows.length} obstacles)`);
} else {
  writeFileSync(docPath, html.slice(0, start) + block + html.slice(end + END.length));
  console.log(`wrote ${rows.length} upgrades and ${obstacleRows.length} obstacles into the game document`);
}
