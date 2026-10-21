// Feedback is write-only from the browser: the publishable key may insert a row
// and nothing else, so a submitted note can never be read back out of the page.
// Reading it takes the service key, off this site.

import { request, ANON_TOKEN, getSession, getHandle } from './backend.js';

const TABLE = '/rest/v1/feedback';

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
  return request(TABLE, {
    method: 'POST',
    token: ANON_TOKEN,
    prefer: 'return=minimal',
    body: {
      message: text,
      email: address || null,
      page: (location.pathname + location.search).slice(0, 200),
      handle: getHandle() || null,
      user_id: getSession()?.user?.id || null,
      user_agent: String(navigator.userAgent || '').slice(0, 300)
    }
  });
}
