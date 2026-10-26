// Optional account-backed record of daily completions. The existing browser
// snapshot remains authoritative for offline play and streak display; failures
// here never prevent a player from completing or sharing a daily challenge.
// The server accepts a first submission per user/challenge for a future
// cross-account board, but a snapshot alone is not proof of a legitimate run.
import { dailyChallenge, dailyCheck } from '../daily.js';
import { backendReady, freshSession, getSession, request, ensureProfile } from './backend.js';

const sent = new Set();

// Extracting the date here makes a subtle escaped-regex failure testable.
export function dailyResultDate(id) {
  if (typeof id !== 'string' || !/^v2:\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/.test(id)) return null;
  const date = id.split(':')[1];
  return Number.isFinite(Date.parse(date + 'T12:00:00Z')) ? date : null;
}

export async function submitDailyResult(result) {
  if (!result?.id || !result.snapshot || !backendReady()) return false;
  const session = getSession();
  if (!session || !(await freshSession()) || getSession()?.user?.id !== session.user.id) return false;
  const key = session.user.id + ':' + result.id;
  if (sent.has(key)) return true;
  try {
    if (!(await ensureProfile()) || getSession()?.user?.id !== session.user.id) return false;
    const date = dailyResultDate(result.id);
    if (!date) return false;
    const challenge = dailyChallenge(date);
    if (challenge.id !== result.id || !dailyCheck(challenge, result.snapshot).complete) return false;
    const value = Math.max(0, Math.round(result.snapshot[challenge.metric]));
    await request('/rest/v1/rpc/submit_daily', {
      method: 'POST',
      body: { p_challenge: result.id, p_value: value, p_snapshot: result.snapshot }
    });
    if (getSession()?.user?.id !== session.user.id) return false;
    sent.add(key);
    return true;
  } catch {
    return false;
  }
}
