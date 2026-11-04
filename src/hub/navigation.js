// URL-addressable views around the existing Bored game launcher. The library remains
// directly below Jump Back In: "All Games" scrolls there instead of loading another page.
const $ = id => document.getElementById(id);
const PAGES = new Set(['home', 'library', 'leaderboard', 'together', 'settings']);

export function createHubNavigation({ togetherUI, onLeaderboard }) {
  let view = 'home';

  function setView(next, { scroll = false } = {}) {
    if (!PAGES.has(next)) next = 'home';
    const isHome = next === 'home' || next === 'library';
    const isTogether = next === 'together';
    if (isTogether) {
      if ($('together').hidden) togetherUI.open();
    } else {
      togetherUI.close();
    }
    for (const id of ['daily', 'recent', 'library']) $(id).hidden = !isHome;
    $('leaderboard').hidden = next !== 'leaderboard';
    $('settings').hidden = next !== 'settings';
    if (!isTogether) $('together').hidden = true;

    document.body.dataset.boredView = next;
    for (const id of ['home', 'library', 'leaderboard', 'together', 'settings']) {
      const nav = $(id + '-nav');
      if (!nav) continue;
      if (id === next) nav.setAttribute('aria-current', 'page');
      else nav.removeAttribute('aria-current');
    }
    // The multiplayer badge remains controlled by the multiplayer module.
    if (next === 'leaderboard' && view !== 'leaderboard') onLeaderboard();
    view = next;
    if (!scroll || isTogether) return;
    if (next === 'library') $('library').scrollIntoView({ block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function navigate(next) {
    history.pushState(null, '', '#' + next);
    setView(next, { scroll: true });
  }

  for (const id of ['home', 'library', 'leaderboard', 'settings']) {
    $(id + '-nav').addEventListener('click', event => {
      event.preventDefault();
      navigate(id);
    });
  }
  // Together has its own established entry points; update the outer page state
  // after its click handler opens or closes the match view.
  $('together-nav').addEventListener('click', () => setView('together'));
  $('together-home-link').addEventListener('click', () => setView('together'));
  $('together-back').addEventListener('click', () => setView('library', { scroll: true }));
  window.addEventListener('bored:together-open', () => setView('together'));
  window.addEventListener('popstate', () => syncFromHash());

  function syncFromHash() {
    const hash = location.hash.slice(1);
    if (PAGES.has(hash)) setView(hash, { scroll: hash === 'library' });
    else if (hash === 'daily') {
      setView('home');
      $('daily').scrollIntoView({ block: 'start' });
    } else if (!hash) {
      // A just-closed game should return to the page the player came from.
      setView(view);
    } else {
      // Other hashes belong to game deep links handled by main.js.
      // For a cold direct link, make sure there is a usable hub beneath the game.
      if (!PAGES.has(view)) setView('home');
    }
  }
  return { setView, syncFromHash, navigate };
}
