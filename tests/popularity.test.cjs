const { test } = require('node:test');
const assert = require('node:assert/strict');

test('popular sorting uses distinct-player rank, not repeated starts', async () => {
  const { popularityRanks, sortPopularGames } = await import('../src/hub/popularity.js');
  const rankings = popularityRanks([
    {game: 'clicker', ranking: 2}, {game: 'krillion', ranking: 1},
    {game: 'trackbound', ranking: 1}, {game: 'bad', ranking: -1},
    {game: 'clicker', ranking: 3}, {game: '', ranking: 4}
  ]);
  const games = [['new-game','New'], ['clicker','Clicker'], ['trackbound','Trackbound'],
    ['krillion','Krillion'], ['old-game','Old']];
  assert.deepEqual(sortPopularGames(games, rankings).map(row => row[0]),
    ['trackbound','krillion','clicker','new-game','old-game']);
  assert.equal(rankings.has('bad'), false);
  assert.equal(rankings.get('clicker'), 2);
});

test('a new game is boosted above the ranked shelf until its window closes', async () => {
  const { sortPopularGames } = await import('../src/hub/popularity.js');
  const ranks = new Map([['clicker', 1], ['trackbound', 2]]);
  const games = () => [['clicker','Clicker'], ['trackbound','Trackbound'], ['fresh','Fresh'], ['old','Old']];
  const launches = { fresh: '2026-11-16' };
  assert.deepEqual(
    sortPopularGames(games(), ranks, { launches, now: Date.parse('2026-11-17T12:00:00Z') })
      .map(row => row[0]),
    ['fresh','clicker','trackbound','old']);
  // Four days later the boost has ended and the unranked game drops back below
  // the ranked ones, which is what the window is there to prevent.
  assert.deepEqual(
    sortPopularGames(games(), ranks, { launches, now: Date.parse('2026-11-20T12:00:00Z') })
      .map(row => row[0]),
    ['clicker','trackbound','fresh','old']);
});

test('popular fallback preserves newest order and ignores invalid ranking payloads', async () => {
  const { popularityRanks, sortPopularGames } = await import('../src/hub/popularity.js');
  const games = [['a','A'], ['b','B']];
  assert.deepEqual(sortPopularGames(games, popularityRanks(null)), games);
  assert.equal(popularityRanks([{game:'a',ranking:'not a number'}]).size, 0);
  assert.deepEqual(sortPopularGames(games, popularityRanks([{game:'b',ranking:1}]))
    .map(row => row[0]), ['b','a']);
});


test('Crossword editorial spotlight expires at Detroit midnight November 25', async () => {
  const { sortPopularGames, isFeatured } = await import('../src/hub/popularity.js');
  const featuredUntil = { crossword: '2026-11-25T05:00:00Z' };
  const launches = { new: '2026-11-22', crossword: '2026-11-20' };
  const games = () => [['new','New'], ['clicker','Clicker'], ['crossword','Crossword']];
  const ranks = new Map([['clicker', 1], ['crossword', 99]]);
  const active = Date.parse('2026-11-24T23:59:00-05:00');
  assert.equal(isFeatured('crossword', featuredUntil, active), true);
  assert.deepEqual(sortPopularGames(games(), ranks, { launches, featuredUntil, now: active }).map(x => x[0]), ['crossword', 'clicker', 'new']);
  const expired = Date.parse('2026-11-25T00:00:00-05:00');
  assert.equal(isFeatured('crossword', featuredUntil, expired), false);
  assert.deepEqual(sortPopularGames(games(), ranks, { launches, featuredUntil, now: expired }).map(x => x[0]), ['clicker', 'crossword', 'new']);
});
