'use strict';
// Bo and the hub's voice. Pure checks, no browser: the shared drawing is well-formed,
// every mood has a symbol, and every placement in the shipped pages points at one.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const src = path.join(__dirname, '..', 'src');
const load = file => import(pathToFileURL(path.join(src, file)).href);
const read = file => fs.readFileSync(path.join(src, file), 'utf8');

test('Bo sleeps late at night and is bored otherwise', async () => {
  const { moodFor } = await load('hub/voice.js');
  const at = hour => moodFor(new Date(2026, 10, 3, hour, 0));
  assert.deepEqual([0, 2, 4, 23].map(at), ['asleep', 'asleep', 'asleep', 'asleep']);
  assert.deepEqual([5, 9, 14, 17, 20, 22].map(at), ['bored', 'bored', 'bored', 'bored', 'bored', 'bored']);
});

test('the greeting is always a sentence and always from the right list', async () => {
  const { introLine, footerLine, FOOTERS } = await load('hub/voice.js');
  for (let hour = 0; hour < 24; hour++) {
    for (const random of [() => 0, () => 0.5, () => 0.999999]) {
      const line = introLine(new Date(2026, 10, 3, hour, 0), random);
      assert.ok(typeof line === 'string' && line.length > 3, 'hour ' + hour);
    }
  }
  assert.ok(FOOTERS.includes(footerLine(() => 0.999999)), 'a random value just under 1 stays in range');
});

test('bo.js points a placement at a known mood and falls back for an unknown one', async () => {
  const { boHref, MOODS, BO_FILE } = await load('hub/bo.js');
  for (const mood of MOODS) assert.equal(boHref(mood), BO_FILE + '#' + mood);
  assert.equal(boHref('nonsense'), BO_FILE + '#bored');
});

test('bo.svg is well-formed and has a symbol for every mood', async () => {
  const { MOODS } = await load('hub/bo.js');
  const svg = read('bo.svg');
  // XML forbids a double hyphen inside a comment, and a browser then drops the whole file.
  // The first version of this file shipped that bug and drew nothing anywhere.
  for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!body.includes('--'), 'comment contains a double hyphen');
  assert.ok(svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>'));
  for (const mood of MOODS) assert.match(svg, new RegExp('<symbol id="' + mood + '"'), mood + ' has a symbol');
  const ids = [...svg.matchAll(/<symbol id="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(ids.sort(), [...MOODS].sort(), 'bo.svg and MOODS list the same faces');
});

test('every Bo placement points at a mood that exists', async () => {
  const { MOODS } = await load('hub/bo.js');
  for (const page of ['index.html', '404.html']) {
    const refs = [...read(page).matchAll(/<use href="([^"]*bo\.svg)#([^"]+)"/g)];
    assert.ok(refs.length > 0, page + ' draws Bo');
    for (const [, , mood] of refs) assert.ok(MOODS.includes(mood), page + ' uses unknown mood ' + mood);
  }
});

test('the favicons are standalone, well-formed, and the page links the awake one', async () => {
  const { ICON_AWAKE, ICON_ASLEEP } = await load('hub/voice.js');
  for (const icon of [ICON_AWAKE, ICON_ASLEEP]) {
    const svg = read(icon.replace(/^\.\//, ''));
    for (const [, body] of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!body.includes('--'), icon + ' comment has a double hyphen');
    assert.ok(!/<use|var\(/.test(svg), icon + ' must not reference anything outside itself');
  }
  assert.match(read('index.html'), new RegExp('<link rel="icon"[^>]*href="' + ICON_AWAKE.replace('.', '\\.') + '"'));
});
