// Feedback is write-only from the browser: the publishable key may insert a row
// and nothing else, so a submitted note can never be read back out of the page.
// The same table also holds the optional enjoyment rating; only an analytics
// admin can read or delete either kind.

import { request, ANON_TOKEN, getSession, getHandle, freshSession } from './backend.js';

const TABLE = '/rest/v1/feedback_entries';

// The insert policy only lets a row carry the account its token belongs to.
// A guest writes with the publishable key and no user_id; a signed-in player
// must write with their own session, or the server refuses the note.
export function feedbackWriter(session) {
  const userId = session?.user?.id || null;
  return userId && session.access_token
    ? { userId, token: session.access_token }
    : { userId: null, token: ANON_TOKEN };
}

export function feedbackErrorMessage(err) {
  const message = String(err?.message || err);
  if (/could not find the table|does not exist|schema cache/i.test(message)) {
    return 'Feedback is not set up on the server yet. The setup script is in the repo.';
  }
  if (/permission|policy|row-level|violates/i.test(message)) {
    return 'The server refused that note. Try again in a moment.';
  }
  if (/failed to fetch|network|load failed/i.test(message)) {
    return 'Could not reach the server. Check your connection and try again.';
  }
  return message;
}

export async function sendFeedback({ message, email } = {}) {
  const text = String(message || '').trim();
  if (text.length < 4) throw new Error('Tell us a little more first.');
  if (text.length > 2000) throw new Error('Keep it under 2000 characters.');
  const address = String(email || '').trim();
  const before = getSession()?.user?.id || null;
  const session = before ? await freshSession() : null;
  // Never file a note under an account that is no longer the one signed in.
  if (before && session?.user?.id !== before) throw new Error('Sign in again to send feedback.');
  const writer = feedbackWriter(before ? session : null);
  return request(TABLE, {
    method: 'POST',
    token: writer.token,
    prefer: 'return=minimal',
    body: {
      kind: 'note',
      body: text,
      email: address || null,
      page: (location.pathname + location.search).slice(0, 200),
      handle: getHandle() || null,
      user_id: writer.userId,
      user_agent: String(navigator.userAgent || '').slice(0, 300)
    }
  });
}
