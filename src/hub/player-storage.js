// Switch the legacy unprefixed game keys as one profile whenever an account changes.
// Games read/write several of these keys directly inside their srcdoc iframe, so
// changing only the hub's localStorage helper would leave scores shared.
const ACTIVE = 'bored.player.active';
const CACHE = 'bored.player.cache.';
const PENDING = 'bored.player.signup.';
const EXACT = new Set([
  'bored.library', 'bored.favoriteEvents',
  'snake.bestScore', 'pacHi', 'voidrunner_best', 'simonBest', 'minesweeper_scores',
  'bored.best.2048', 'bored.best.aim-lab.64', 'bored.best.memory'
]);
const isPlayerKey = key => EXACT.has(key) ||
  ['bored.daily.', 'bored.high.', 'bored.best.'].some(prefix => key.startsWith(prefix));

export function capturePlayerSnapshot() {
  const snapshot = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && isPlayerKey(key)) snapshot[key] = localStorage.getItem(key);
    }
  } catch {}
  return snapshot;
}

function put(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function restoreSnapshot(snapshot, onlyMissing = false) {
  if (!snapshot || typeof snapshot !== 'object') return;
  for (const [key, value] of Object.entries(snapshot)) {
    if (!isPlayerKey(key) || typeof value !== 'string') continue;
    try {
      if (!onlyMissing || localStorage.getItem(key) === null) localStorage.setItem(key, value);
    } catch {}
  }
}

export function activatePlayerStorage(scope) {
  if (!scope || !/^(guest|user:[a-f0-9-]+)$/.test(scope)) throw new Error('Invalid player scope.');
  let old;
  try { old = localStorage.getItem(ACTIVE); } catch { return false; }
  // First run after upgrading Bored: claim existing legacy data for the identity
  // that is *already authenticated*, or for guest if nobody is signed in.
  if (!old) return put(ACTIVE, scope);
  if (old === scope) return false;
  const snapshot = capturePlayerSnapshot();
  // Never delete scores if saving the previous account's copy failed.
  if (!put(CACHE + old, JSON.stringify(snapshot))) return false;
  try {
    for (const key of Object.keys(snapshot)) localStorage.removeItem(key);
    const saved = localStorage.getItem(CACHE + scope);
    if (saved) restoreSnapshot(JSON.parse(saved));
    localStorage.setItem(ACTIVE, scope);
  } catch {
    // Restore the previous visible state if storage is unavailable midway.
    restoreSnapshot(snapshot);
    return false;
  }
  return true;
}

export function stashPendingSignup(userId, snapshot) {
  if (userId && /^[a-f0-9-]+$/i.test(userId))
    put(PENDING + userId, JSON.stringify(snapshot));
}

export function adoptSignupProgress(userId, snapshot = null) {
  if (!userId) return false;
  try {
    const key = PENDING + userId;
    const saved = snapshot || JSON.parse(localStorage.getItem(key) || 'null');
    if (!saved) return false;
    restoreSnapshot(saved, true);
    localStorage.removeItem(key);
    return true;
  } catch { return false; }
}
