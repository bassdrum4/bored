const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Import the real production module rather than reimplementing the schedule.
const source = fs.readFileSync(path.join(__dirname, '../src/daily.js'), 'utf8');
const daily = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('published daily challenge IDs survive removal of Cup Pong', async () => {
  const { dailyChallenge } = await daily;
  for (const [date, id] of [
    ['2026-10-27', 'v2:2026-10-27:pong'],
    ['2026-10-28', 'v3:2026-10-28:space-invaders'],
    ['2026-10-29', 'v3:2026-10-29:connect-four']
  ]) assert.equal(dailyChallenge(date).id, id, date);
});

test('retired Cup Pong remains historical only, never in new calendars', async () => {
  const { dailyChallenge, CHALLENGES, parseDailyId } = await daily;
  assert.equal(parseDailyId('v2:2026-10-27:cup-pong')?.definition.slug, 'cup-pong');
  assert.equal(CHALLENGES.some(item => item.slug === 'cup-pong'), false);
  for (let day = 0; day < 120; day++) {
    const date = new Date(Date.UTC(2026, 9, 31 + day)).toISOString().slice(0, 10);
    assert.notEqual(dailyChallenge(date).slug, 'cup-pong', date);
  }
  assert.equal(dailyChallenge('2026-11-04').id, 'v4:2026-11-04:ashcrown');
});
