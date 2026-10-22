// Optional account-backed record of daily completions. The existing browser
// snapshot remains authoritative for offline play and streak display; failures
// here never prevent a player from completing or sharing a daily challenge.
// The server accepts a first submission per user/challenge for a future
// cross-account board, but a snapshot alone is not proof of a legitimate run.
import { backendReady, freshSession, getSession, request, ensureProfile } from './backend.js';

const sent = new Set();

export async function submitDailyResult(result) {
  if (!result?.id || !result.snapshot || !backendReady()) return false;
  const session = getSession();
  if (!session || !(await freshSession()) || getSession()?.user?.id !== session.user.id) return false;
  const key = session.user.id + ':' + result.id;
  if (sent.has(key)) return true;
  try {
    if (!(await ensureProfile()) || getSession()?.user?.id !== session.user.id) return false;
    // The value is the recorded game metric for future comparison; do not
    // invent a score when the snapshot doesn't contain the expected metric.
    const snapshot = result.snapshot;
    const candidates = ['score', 'points', 'lines', 'apples', 'moves', 'guesses',
      'waves', 'cleared', 'wins', 'seconds', 'cards', 'hits', 'layouts',
      'levels', 'homes', 'tile', 'rounds', 'plants', 'files', 'cells', 'profit', 'won'];
    const metric = candidates.find(k => Number.isFinite(snapshot[k]) && snapshot[k] >= 0);
    const value = metric ? Math.round(snapshot[metric]) : 0;
    await request('/rest/v1/rpc/submit_daily', {
      method: 'POST',
      body: { p_challenge: result.id, p_value: Math.max(0, value), p_snapshot: snapshot }
    });
    if (getSession()?.user?.id !== session.user.id) return false;
    sent.add(key);
    return true;
  } catch {
    return false;
  }
}
