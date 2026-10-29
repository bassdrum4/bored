// Optional account-backed record of daily completions. The existing browser
// snapshot remains authoritative for offline play and streak display; failures
// here never prevent a player from completing or sharing a daily challenge.
// The server accepts a first submission per user/challenge for a future
// cross-account board, but a snapshot alone is not proof of a legitimate run.
import { dailyResultCheck } from '../daily.js';
import { backendReady, freshSession, getSession, request, ensureProfile } from './backend.js';

const sent = new Set();

// Extracting the date here makes a subtle escaped-regex failure testable.
export function dailyResultDate(id) {
  if (typeof id !== 'string' || !/^v\d+:\d{4}-\d{2}-\d{2}:[a-z0-9-]+$/.test(id)) return null;
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
    // Judge the run by the day it was earned on, so a retuned goal or a newer
    // calendar version does not hide a completion from the account.
    const check = dailyResultCheck(result.id, result);
    if (!check.complete) return false;
    const value = Math.max(0, Math.round(result.snapshot[check.challenge.metric]));
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
