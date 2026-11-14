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

test('popular fallback preserves newest order and ignores invalid ranking payloads', async () => {
  const { popularityRanks, sortPopularGames } = await import('../src/hub/popularity.js');
  const games = [['a','A'], ['b','B']];
  assert.deepEqual(sortPopularGames(games, popularityRanks(null)), games);
  assert.equal(popularityRanks([{game:'a',ranking:'not a number'}]).size, 0);
  assert.deepEqual(sortPopularGames(games, popularityRanks([{game:'b',ranking:1}]))
    .map(row => row[0]), ['b','a']);
});
