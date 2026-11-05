// A module request that fails once leaves the hub shell on screen with nothing
// in it, and the failure is cached for the life of the document, so no amount
// of in-page retrying can recover. Reloading is the only recovery; this module
// loads before main.js so it is still here when main.js never runs. Once per
// session, and never under a browser driver, which would detach its own frame.
addEventListener('load', () => setTimeout(() => {
  if (window.__boredHubReady) return;
  if (navigator.webdriver) return;
  try {
    if (sessionStorage.getItem('bored.boot-retry')) return;
    sessionStorage.setItem('bored.boot-retry', '1');
  } catch { return; }
  location.reload();
}, 2000));
