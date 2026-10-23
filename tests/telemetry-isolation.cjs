// Browser regressions exercise many games. A test launch must never become
// real player activity, even when the test deliberately blocks localStorage.
function respondToAnalytics(request) {
  const url = new URL(request.url());
  if (!url.hostname.endsWith('.supabase.co') || url.pathname !== '/rest/v1/play_events') return false;
  void request.respond({ status: 204, headers: {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST,OPTIONS'
  } });
  return true;
}
async function isolateAnalytics(page) {
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (!respondToAnalytics(request)) return request.continue();
  });
}
module.exports = { respondToAnalytics, isolateAnalytics };
