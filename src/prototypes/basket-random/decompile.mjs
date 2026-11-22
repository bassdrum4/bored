// Extract, index, verify, and rebuild Basket Random's Construct 3 export.
// The gameplay is in data.json's event sheets; the generic Construct runtime
// and the game's host/runtime glue are preserved byte-for-byte.
import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deepStrictEqual } from 'node:assert/strict';
import { createHash } from 'node:crypto';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HERE = fileURLToPath(new URL('.', import.meta.url));
const VENDOR = resolve(ROOT, 'src/games/content/basket-random');
const SRC = join(HERE, 'source');
const ORIGINAL = join(VENDOR, 'data.json');
const RUNTIME = ['scripts/main.js', 'scripts/c3runtime.js'];

function loadJSON(file) { return JSON.parse(readFileSync(file, 'utf8')); }
function writeText(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
}
function writeJSON(file, value) { writeText(file, JSON.stringify(value, null, 2) + '\n'); }
function digest(buffer) { return createHash('sha256').update(buffer).digest('hex'); }
function sheetFile(name) {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('unsafe event sheet name: ' + name);
  return name + '.json';
}
function sourcePath(file) { return join(SRC, file); }
function originalProject() {
  const data = loadJSON(ORIGINAL);
  if (!data || !Array.isArray(data.project) || data.project[0] !== 'Basket Random') {
    throw new Error('unexpected Construct 3 project data');
  }
  return data.project;
}

function objectName(project, id) {
  if (id === -1) return 'System';
  if (!Number.isInteger(id) || !project[3][id]) return 'object#' + id;
  return project[3][id][0];
}
function describeOpcode(project, op) {
  const target = objectName(project, op[0]);
  const behavior = typeof op[2] === 'string' ? '.' + op[2] : '';
  const params = Array.isArray(op[op.length - 1]) ? JSON.stringify(op[op.length - 1]) : '[]';
  return target + behavior + '#' + op[1] + '(' + params + ')';
}
function eventLines(project, items) {
  const lines = [];
  function visit(node, depth) {
    if (!Array.isArray(node)) return;
    const pad = '  '.repeat(depth);
    if (node[0] === 1) {
      lines.push(pad + 'VARIABLE ' + node[1] + ' = ' + JSON.stringify(node[3]));
      return;
    }
    if (node[0] === 2) {
      lines.push(pad + 'INCLUDE ' + node[1]);
      return;
    }
    if (node[0] === 3) {
      lines.push(pad + 'GROUP ' + JSON.stringify(node[1]));
    } else if (node[0] === 4) {
      lines.push(pad + 'FUNCTION ' + JSON.stringify(node[1]));
    } else if (node[0] === 0) {
      lines.push(pad + 'EVENT #' + node[5] + ' ' + JSON.stringify(node.slice(1, 5)));
    } else {
      lines.push(pad + 'UNKNOWN NODE ' + JSON.stringify(node));
      return;
    }
    if (node[0] !== 3) {
      for (const condition of (node[6] || [])) {
        lines.push(pad + '  IF  ' + describeOpcode(project, condition));
      }
      for (const action of (node[7] || [])) {
        lines.push(pad + '  DO  ' + describeOpcode(project, action));
      }
    } else {
      for (const condition of (node[6] || [])) {
        lines.push(pad + '  IF  ' + describeOpcode(project, condition));
      }
      for (const action of (node[7] || [])) {
        lines.push(pad + '  DO  ' + describeOpcode(project, action));
      }
    }
    for (const child of (node[8] || [])) visit(child, depth + 1);
  }
  for (const item of items) visit(item, 0);
  return lines.join('\n') + '\n';
}
function countEvents(items) {
  let count = 0;
  function visit(n) {
    if (!Array.isArray(n)) return;
    if (n[0] === 0) count++;
    if ([0, 3, 4].includes(n[0])) for (const child of (n[8] || [])) visit(child);
  }
  for (const item of items) visit(item);
  return count;
}
function renderIndex(project) {
  const lines = [
    '# Basket Random — recovered source index', '',
    'Generated from the original Construct 3 project. The JSON is the authoritative',
    'editable source; the event listings below preserve opcode IDs and serialized',
    'expression trees. Numeric opcode IDs are **not** invented event names.', '',
    '## Event sheets', '',
    '| Sheet | Events | Top-level entries |', '| --- | ---: | ---: |'
  ];
  for (const [name, items] of project[6]) {
    lines.push('| ' + name + ' | ' + countEvents(items) + ' | ' + items.length + ' |');
  }
  lines.push('', '## Objects', '', '| ID | Object | Instance variables | Behaviors |',
    '| ---: | --- | --- | --- |');
  for (let id = 0; id < project[3].length; id++) {
    const object = project[3][id];
    const vars = (object[3] || []).map(v => v[2]).join(', ') || '—';
    const behaviors = (object[8] || []).map(b => b[0]).join(', ') || '—';
    lines.push('| ' + id + ' | ' + object[0] + ' | ' + vars + ' | ' + behaviors + ' |');
  }
  lines.push('', '## Layouts', '', '| Layout | Width | Height | Event sheet | Layers |',
    '| --- | ---: | ---: | --- | ---: |');
  for (const layout of project[5]) {
    lines.push('| ' + layout[0] + ' | ' + layout[1] + ' | ' + layout[2] + ' | ' + layout[4] + ' | ' + (layout[6] || []).length + ' |');
  }
  lines.push('', '## Important encoding boundaries', '',
    '- Event sheets are stored as arrays, not Construct editor event blocks.',
    '- Conditions and actions use their original numeric engine opcode IDs.',
    '- Expression parameters retain their original token-array encoding.',
    '- The shipped Construct runtime, Box2D WebAssembly, sprites, and audio',
    '  remain in the vendored folder and are copied into rebuilt packages.',
    '- The generated .txt event listings are navigation aids. Edit the .json files',
    '  and rebuild; editing a .txt listing has no effect.', '');
  return lines.join('\n') + '\n';
}

function extract() {
  const project = originalProject();
  const names = project[6].map(sheet => sheet[0]);
  if (new Set(names).size !== names.length) throw new Error('duplicate event sheet names');
  const slots = project.map((value, i) => i >= 3 && i <= 7 ? null : value);
  writeJSON(sourcePath('project.json'), {
    format: 'bored-basket-random-construct3-recovery-v1',
    originalDataSha256: digest(readFileSync(ORIGINAL)),
    slots,
    eventSheetNames: names
  });
  for (const [file, idx] of [['objects.json', 3], ['families.json', 4], ['layouts.json', 5], ['audio.json', 7]]) {
    writeJSON(sourcePath(file), project[idx]);
  }
  for (const [name, entries] of project[6]) {
    writeJSON(sourcePath('event-sheets/' + sheetFile(name)), [name, entries]);
    writeText(sourcePath('event-listings/' + name + '.txt'), eventLines(project, entries));
  }
  writeText(sourcePath('INDEX.md'), renderIndex(project));
  for (const file of RUNTIME) {
    const data = readFileSync(join(VENDOR, file));
    const to = sourcePath('runtime/' + file.slice('scripts/'.length));
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, data);
  }
  console.log('Extracted ' + project[3].length + ' objects, ' + project[5].length +
    ' layouts, and ' + names.length + ' event sheets to ' + SRC);
}

function rebuildProject() {
  const manifest = loadJSON(sourcePath('project.json'));
  if (manifest.format !== 'bored-basket-random-construct3-recovery-v1' ||
      !Array.isArray(manifest.slots) || manifest.slots.length !== 39) {
    throw new Error('bad project manifest');
  }
  const project = structuredClone(manifest.slots);
  project[3] = loadJSON(sourcePath('objects.json'));
  project[4] = loadJSON(sourcePath('families.json'));
  project[5] = loadJSON(sourcePath('layouts.json'));
  project[6] = manifest.eventSheetNames.map(name => {
    const sheet = loadJSON(sourcePath('event-sheets/' + sheetFile(name)));
    if (!Array.isArray(sheet) || sheet[0] !== name || !Array.isArray(sheet[1])) {
      throw new Error('invalid event sheet ' + name);
    }
    return sheet;
  });
  project[7] = loadJSON(sourcePath('audio.json'));
  if (project[0] !== 'Basket Random' || project[3].length < 90 || project[6].length < 8) {
    throw new Error('rebuild appears to have lost essential project data');
  }
  return { project };
}

function check() {
  const actual = rebuildProject();
  const original = loadJSON(ORIGINAL);
  deepStrictEqual(actual, original, 'the recovered project must match the shipped export');
  const built = JSON.stringify(actual);
  const canonical = JSON.stringify(original);
  if (built !== canonical) throw new Error('rebuild changed serialized game data');
  for (const file of RUNTIME) {
    const edited = readFileSync(sourcePath('runtime/' + file.slice('scripts/'.length)));
    const shipped = readFileSync(join(VENDOR, file));
    if (!edited.equals(shipped)) throw new Error(file + ' differs from the shipped runtime');
  }
  if (readFileSync(sourcePath('INDEX.md'), 'utf8') !== renderIndex(original.project)) {
    throw new Error('the generated source index has drifted');
  }
  console.log('Verified: all ' + actual.project[3].length + ' objects, ' +
    actual.project[6].length + ' event sheets, layouts, audio, and both runtime JS files round-trip.');
  console.log('Construct data SHA-256: ' + digest(Buffer.from(built, 'utf8')));
}

function rebuild(targetPath) {
  if (!targetPath) throw new Error('usage: --rebuild <output-directory>');
  const target = resolve(process.cwd(), targetPath);
  if (target !== VENDOR) cpSync(VENDOR, target, { recursive: true, force: true });
  const data = JSON.stringify(rebuildProject());
  writeText(join(target, 'data.json'), data);
  for (const file of RUNTIME) {
    const bytes = readFileSync(sourcePath('runtime/' + file.slice('scripts/'.length)));
    mkdirSync(dirname(join(target, file)), { recursive: true });
    writeFileSync(join(target, file), bytes);
  }
  deepStrictEqual(loadJSON(join(target, 'data.json')), rebuildProject());
  if (!existsSync(join(target, 'index.html')) || !existsSync(join(target, 'box2d.wasm'))) {
    throw new Error('rebuilt package is missing the HTML loader or Box2D payload');
  }
  console.log('Rebuilt playable Construct 3 package at: ' + target);
}

const [mode, argument] = process.argv.slice(2);
if (mode === undefined || mode === '--extract') extract();
else if (mode === '--check') check();
else if (mode === '--rebuild') rebuild(argument);
else throw new Error('Usage: node decompile.mjs [--extract | --check | --rebuild <directory>]');
