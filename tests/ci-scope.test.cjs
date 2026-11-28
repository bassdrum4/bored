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

test('automerge retries only a transient main advance with the same PR head', async () => {
  const { mergeWithRetry } = await import('../.github/scripts/auto-merge-vettel.mjs');
  const repo = {full_name:'bassdrum4/bored'};
  const pr = {number:42,state:'open',draft:false,user:{id:188396997},head:{sha:'abc',ref:'game',repo},base:{ref:'main',repo}};
  let calls = [];
  const request = async (path, token, method='GET', body) => {
    calls.push({path,method,body});
    if (calls.length === 1) throw new Error('PUT pulls/42/merge: HTTP 405: Base branch was modified. Review and try the merge again.');
    return {payload:method === 'GET' ? pr : {merged:true}};
  };
  assert.equal((await mergeWithRetry(pr, request, async()=>{})).merged,true);
  assert.deepEqual(calls.map(c=>c.method),['PUT','GET','PUT']);
  assert.equal(calls[2].body.sha,pr.head.sha);
  let count = 0;
  await assert.rejects(mergeWithRetry(pr, async (path,token,method='GET') => {
    count++;
    if (method === 'PUT') throw new Error('HTTP 405: Base branch was modified');
    return {payload:{...pr,head:{...pr.head,sha:'new'}}};
  },async()=>{}),/changed while retrying/);
  assert.equal(count,2);
  count=0;
  await assert.rejects(mergeWithRetry(pr, async()=>{count++;throw new Error('HTTP 405: Pull Request is not mergeable');},async()=>{}),/not mergeable/);
  assert.equal(count,1);
});
