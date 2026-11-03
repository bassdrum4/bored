// Browser regressions exercise many games. A test launch must never become
// real player activity, even when the test deliberately blocks localStorage.
function respondToAnalytics(request) {
  const url = new URL(request.url());
  if (!url.hostname.endsWith('.supabase.co')) return false;
  const headers = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS'
  };
  // Game regression tests must not depend on real, possibly active announcements.
  // The dedicated announcement suite injects its own messages and tests the banner.
  if (['/rest/v1/announcements', '/rest/v1/announcement_reads'].includes(url.pathname)) {
    const preflight = request.method() === 'OPTIONS';
    void request.respond({ status: preflight ? 204 : 200, headers,
      contentType: 'application/json', body: preflight ? '' : '[]' });
    return true;
  }
  if (!['/rest/v1/play_events','/rest/v1/product_events','/rest/v1/enjoyment_feedback'].includes(url.pathname)) return false;
  void request.respond({ status: 204, headers });
  return true;
}
async function isolateAnalytics(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!respondToAnalytics(request)) return request.continue();
  });
}
module.exports = { respondToAnalytics, isolateAnalytics };
