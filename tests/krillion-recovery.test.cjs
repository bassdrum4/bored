const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { stripTypeScriptTypes } = require('node:module');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const source = stripTypeScriptTypes(readFileSync('supabase/functions/krillion/index.ts', 'utf8'));
const date = '2026-11-25';
const prompts = Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, text: `Name something ${i + 1}` }));
const reveal = {
  date,
  prompts: prompts.map(prompt => ({
    id: prompt.id,
    text: prompt.text,
    answers: [
      { answer: 'Nanda Devi', tier: 'krillion', score: 100 },
      { answer: 'Mercury', tier: 'schooler', score: 30, aliases: ['mercury planet'] }
    ]
  }))
};
const corpus = { date, dayNumber: 133, resetsAt: Date.parse(date + 'T05:00:00.000Z'), prompts };

function harness({ failInsert = 0, revealStatus = 200, todayStatus = 200 } = {}) {
  let handler, now = Date.parse(date + 'T12:00:00Z'), inserts = 0, upstream = 0;
  const rows = new Map();
  class Clock extends Date {
    static now() { return now; }
  }
  const json = (data, status = 200) => Response.json(data, { status });
  const fetch = async (input, init = {}) => {
    const url = new URL(input), path = url.pathname, method = init.method || 'GET', q = url.searchParams;
    if (url.hostname === 'krillion.io') {
      upstream++;
      if (path === '/api/today') return todayStatus === 200 ? json(corpus) : json({}, todayStatus);
      if (path === '/api/reveal') {
        assert.equal(q.get('date'), date);
        return revealStatus === 200 ? json(reveal) : json({ error: 'That answer sheet is not publicly available.' }, revealStatus);
      }
    }
    if (path.endsWith('/krillion_runs')) {
      const id = q.get('id')?.slice(3);
      if (method === 'GET') return json(rows.has(id) ? [rows.get(id)] : []);
      const body = JSON.parse(init.body);
      if (method === 'POST') {
        inserts++;
        if (rows.has(body.id)) return json([]);
        rows.set(body.id, body);
        if (failInsert-- > 0) return json({}, 522); // committed, but the response was lost
        return json([body], 201);
      }
      if (method === 'PATCH') {
        const row = rows.get(id);
        if (!row || q.has('round') && row.round !== Number(q.get('round').slice(3))) return json([]);
        Object.assign(row, body);
        return json([row]);
      }
    }
    throw new Error('Unexpected URL ' + url);
  };
  vm.runInNewContext(source, {
    Deno: { env: { get: () => 'https://db.test' }, serve: fn => { handler = fn; } },
    fetch, Date: Clock, Intl, URL, Response, Headers, AbortSignal, crypto: { randomUUID }, console,
    setTimeout: fn => fn()
  });
  return {
    rows,
    advance: ms => { now += ms; },
    stats: () => ({ inserts, upstream }),
    call: async (path, body) => {
      const req = new Request('https://db.test/functions/v1/krillion/' + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
      const res = await handler(req);
      const text = await res.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch { /* the reveal is JSON too */ }
      return { status: res.status, body: parsed, text, headers: res.headers };
    }
  };
}

test('today reads the reference site once and never exposes answers', async () => {
  const h = harness();
  const first = await h.call('today');
  assert.equal(first.status, 200);
  assert.equal(first.body.date, date);
  assert.equal(first.body.dayNumber, 133);
  assert.equal(first.body.prompts.length, 7);
  assert.ok(!('answers' in first.body.prompts[0]));
  assert.equal(h.stats().upstream, 1);
  const again = await h.call('today');
  assert.equal(again.status, 200);
  assert.equal(h.stats().upstream, 1);
});

test('the reveal is streamed through with CORS, because the reference has none', async () => {
  const h = harness();
  const res = await h.call('reveal?date=' + date);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('access-control-allow-origin'), '*');
  assert.equal(JSON.parse(res.text).prompts[6].answers[0].answer, 'Nanda Devi');
});

test('a reveal the reference will not publish keeps its own error', async () => {
  const h = harness({ revealStatus: 403 });
  const res = await h.call('reveal?date=' + date);
  assert.equal(res.status, 403);
  assert.match(res.body.error, /not publicly available/);
});

test('a daily start stores the prompts it was served and is idempotent', async () => {
  const h = harness({ failInsert: 1 }), runId = randomUUID();
  const first = await h.call('start', { runId });
  assert.equal(first.status, 200);
  assert.equal(first.body.runId, runId);
  assert.equal(first.body.prompts.length, 7);
  assert.equal(first.body.dayNumber, 133);
  const again = await h.call('start', { runId });
  assert.equal(again.body.runId, runId);
  assert.equal(h.rows.size, 1);
  assert.equal(h.stats().inserts, 2);
  assert.equal(h.rows.get(runId).prompts[3].text, 'Name something 4');
});

test('practice replays the day with the prompts in a different order', async () => {
  const h = harness();
  const res = await h.call('start', { practice: true });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, 'practice');
  assert.deepEqual(res.body.prompts.map(prompt => prompt.id).sort(), prompts.map(prompt => prompt.id).sort());
});

test('a browser-matched answer is scored from the tier and a retry never scores twice', async () => {
  const h = harness(), runId = randomUUID();
  await h.call('start', { runId });
  h.advance(4000);
  const payload = { runId, round: 0, answer: 'mercury', result: { answer: 'Mercury', tier: 'schooler' } };
  const first = await h.call('answer', payload), second = await h.call('answer', payload);
  assert.equal(first.body.result.score, 30);
  assert.equal(first.body.result.answer, 'Mercury');
  assert.equal(second.body.alreadyScored, true);
  assert.equal(second.body.state.score, 30);
  assert.equal(h.rows.get(runId).results.length, 1);
});

test('an unknown tier or a late answer scores nothing', async () => {
  const h = harness(), runId = randomUUID();
  await h.call('start', { runId });
  h.advance(4000);
  const unknown = await h.call('answer', { runId, round: 0, answer: 'x', result: { answer: 'x', tier: 'boss' } });
  assert.equal(unknown.body.result.score, 0);
  h.advance(2000);
  await h.call('next', { runId });
  h.advance(40_000);
  const late = await h.call('answer', { runId, round: 1, answer: 'nanda devi', result: { answer: 'Nanda Devi', tier: 'krillion' } });
  assert.equal(late.body.result.score, 0);
  assert.equal(late.body.result.tier, null);
});

test('the hint is spent once and the sounding follows the finished dive', async () => {
  const h = harness(), runId = randomUUID();
  await h.call('start', { runId });
  h.advance(4000);
  const hint = await h.call('hint', { runId, round: 0 });
  assert.equal(hint.status, 200);
  assert.equal(hint.body.used, true);
  assert.equal(hint.body.state.hintUsed, true);
  const again = await h.call('hint', { runId, round: 0 });
  assert.equal(again.status, 409);
  for (let round = 0; round < 7; round++) {
    if (round) { await h.call('next', { runId }); h.advance(4000); }
    await h.call('answer', { runId, round, answer: 'mercury', result: { answer: 'Mercury', tier: 'schooler' } });
  }
  assert.equal(h.rows.get(runId).completed, true);
  const sounding = await h.call('population?run=' + runId);
  assert.equal(sounding.status, 200);
  assert.equal(sounding.body.dist.length, 71);
  assert.equal(sounding.body.population, 0);
});
