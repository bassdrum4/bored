const test = require('node:test');
const assert = require('node:assert/strict');

test('daily challenge IDs accept actual ISO dates but reject malformed IDs', async () => {
  const { dailyResultDate } = await import('../src/hub/daily-sync.js');
  assert.equal(dailyResultDate('v2:2026-10-26:pac-man'), '2026-10-26');
  assert.equal(dailyResultDate('v2:2026-10-23:frogger'), '2026-10-23');
  // The current calendar is v3; its completions have to reach the account too.
  assert.equal(dailyResultDate('v3:2026-10-29:aim-lab'), '2026-10-29');
  for (const invalid of ['v2:garbage:pac-man', 'v2:2026-10-26:../foo', 'v3:2026-10-29:../foo', 'abc', null])
    assert.equal(dailyResultDate(invalid), null);
});
