// Penguin's Leaderboard: points, standings and the boards it reads.
const test = require('node:test');
const assert = require('node:assert/strict');

test('points scale a best to 1,000 and cap there', async () => {
  const { leaguePoints } = await import('../src/hub/league.js');
  assert.equal(leaguePoints(2050, 2050), 1000);
  assert.equal(leaguePoints(1025, 2050), 500);
  assert.equal(leaguePoints(55, 40), 1000, 'a Battle Tower floor past 40 is still a full 1,000');
  assert.equal(leaguePoints(0, 600), 0);
  assert.equal(leaguePoints('nope', 600), 0);
});

test('standings add the six events, share tied ranks and skip other games', async () => {
  const { leagueStandings, LEAGUE_EVENTS } = await import('../src/hub/league.js');
  const rows = [
    { handle: 'Misty', game: 'poke-idle', value: 2050 }, { handle: 'misty', game: 'pokedoku-shiny', value: 350 },
    { handle: 'Brock', game: 'pokedoku-doku', value: 1350 }, { handle: 'Brock', game: 'poke-idle-ach', value: 33.5 },
    { handle: 'Gary', game: 'poke-idle-tower', value: 80 }, { handle: 'Gary', game: 'poke-idle-ach', value: 34 },
    { handle: 'Ash', game: 'tetris', value: 99999 }, { handle: '', game: 'poke-idle', value: 100 }, { handle: 'Zero', game: 'pokedoku-inverse', value: 0 }
  ];
  const list = leagueStandings(rows);
  // Gary: floor 80 (capped, 1,000) + 34 of 67 achievements (507). Brock and Misty tie on 1,500 and share second, A to Z.
  assert.deepEqual(list.map(p => [p.handle, p.total, p.rank]), [['Gary', 1507, 1], ['Brock', 1500, 2], ['Misty', 1500, 2]]);
  assert.equal(list.find(p => p.handle === 'Misty').events['pokedoku-shiny'].points, 500, 'one handle, any capitalisation, is one trainer');
  assert.ok(!list.some(p => p.handle === 'Ash'), 'only Pokémon events count');
  assert.equal(LEAGUE_EVENTS.length, 6);
});

test('every event is a board the hub captures, kept out of the overall standings where it would double up', async () => {
  const { LEAGUE_EVENTS } = await import('../src/hub/league.js');
  const { LB_GAMES } = await import('../src/hub/scores.js');
  const rules = require('../src/games/score-rules.json');
  for (const event of LEAGUE_EVENTS) {
    const spec = LB_GAMES.find(game => game.id === event.id);
    assert.ok(spec, event.id + ' has a score spec');
    assert.ok(rules[event.id], event.id + ' has a score rule');
    assert.ok(LB_GAMES.some(game => game.id === event.play), event.id + ' plays a real game');
  }
  for (const id of ['poke-idle-ach', 'pokedoku-doku', 'pokedoku-inverse', 'pokedoku-shiny']) {
    assert.equal(LB_GAMES.find(game => game.id === id).standings, false, id + " ranks on Penguin's Leaderboard only");
  }
});
