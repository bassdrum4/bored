const test = require('node:test');
const assert = require('node:assert/strict');
test('CI scope is narrow and fails closed on shared or unknown changes', async () => {
  const { classify, detect } = await import('../scripts/ci-scope.mjs');
  assert.deepEqual(classify(['src/games/content/relic-song.html', 'tests/relic-song.test.cjs']), {full:false,games:['relic-song']});
  assert.deepEqual(classify(['src/games/content/relic-song-charts/index.json','src/games/content/relic-song-charts/onix-rising-ez.json','src/games/previews/relic-song.webp']), {full:false,games:['relic-song']});
  assert.deepEqual(classify(['src/games/content/poke-idle.html','src/games/content/pokedoku/sprites/thaw-grunt.png','tests/poke-idle.test.cjs']), {full:false,games:['poke-idle']});
  assert.deepEqual(classify(['src/games/content/shotgun-roulette.html','src/games/content/relic-song.html']), {full:false,games:['relic-song','shotgun-roulette']});
  assert.equal(classify(['src/games/content/pokedoku.html']).full,true);
  for (const file of ['src/main.js','src/hub/relic-song.js','src/hub/gacha.js','src/games/catalog.js','src/games/content/ashcrown.html','sql/relic-song.sql','.github/workflows/ci.yml','src/games/content/pokedoku/sprites/1.png','tests/together-browser.test.cjs']) {
    assert.equal(classify(['src/games/content/relic-song.html',file]).full,true,file);
  }
  assert.equal(classify([]).full,true);
  assert.equal(detect({GITHUB_EVENT_NAME:'push'}).full,true);
  assert.equal(detect({GITHUB_EVENT_NAME:'pull_request',CI_BASE_SHA:'wrong'}).full,true);
});
test('auto-merge permits Relic Song only in its own game scope', async () => {
  const { isAllowedGameFile } = await import('../.github/scripts/auto-merge-vettel.mjs');
  for(const file of ['src/games/content/relic-song.html','tests/relic-song.test.cjs','src/games/previews/relic-song.svg','src/games/previews/relic-song.webp','src/hub/relic-song.js','src/games/content/relic-song-charts/index.json','src/games/content/relic-song-charts/onix-rising-ez.json','docs/relic-song-design.md','src/games/content/pokedoku/sprites/thaw-sleet.png']) assert.ok(isAllowedGameFile(file),file);
  for(const file of ['src/games/content/relic-song-charts/script.js','src/games/content/relic-song-charts/nested/chart.json','src/hub/leaderboard-view.js','sql/relic-song-leaderboard.sql','src/main.js','.github/workflows/ci.yml']) assert.equal(isAllowedGameFile(file),false,file);
});
