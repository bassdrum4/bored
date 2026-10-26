// Optional, infrequent enjoyment prompt. No marketing identifiers or typing telemetry.
import { request, freshSession, getSession, ANON_TOKEN } from './backend.js';
import { readStored, writeStored } from './store.js';

const COUNT_KEY = 'bored.enjoyment.qualified-count';
const ASKED_KEY = 'bored.enjoyment.asked-at';
const INTERVAL = 60 * 86400000;

export function createEnjoymentUI({ analytics }) {
  const dialog = document.querySelector('#enjoyment-dialog');
  const form = document.querySelector('#enjoyment-form');
  const status = document.querySelector('#enjoyment-status');
  const cancel = document.querySelector('#enjoyment-skip');
  let sending = false;
  const close = () => dialog.close ? dialog.close() : dialog.removeAttribute('open');
  cancel.onclick = close;
  dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (sending) return;
    const rating = Number(new FormData(form).get('rating'));
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) { status.textContent = 'Choose a rating first.'; return; }
    sending = true; status.textContent = 'Sending…';
    form.querySelector('button[type="submit"]').disabled = true;
    try {
      const before = getSession()?.user?.id || null;
      const session = before ? await freshSession() : null;
      if (before && session?.user?.id !== before) throw Error('Please try again after signing in.');
      await request('/rest/v1/enjoyment_feedback', {
        method: 'POST', token: session?.access_token || ANON_TOKEN,
        body: { id: crypto.randomUUID(), user_id: before, visitor_id: analytics.visitorId(),
          rating, comment: form.elements.comment.value.trim().slice(0, 500) || null }
      });
      form.reset(); close();
    } catch { status.textContent = 'Could not send. Try again or skip.'; }
    finally { sending = false; form.querySelector('button[type="submit"]').disabled = false; }
  });
  return {
    maybePrompt(summary) {
      if (!analytics.enabled() || !summary || summary.external ||
          !(summary.active_ms >= 60000 || summary.finished)) return;
      const count = Math.max(0, Number(readStored(COUNT_KEY, 0)) || 0) + 1;
      if (!writeStored(COUNT_KEY, count) || count < 3) return;
      const last = Number(readStored(ASKED_KEY, 0)) || 0;
      if (Date.now() - last < INTERVAL || document.hidden) return;
      // Don't interrupt account, feedback or other dialogs.
      setTimeout(() => {
        if (document.hidden || document.querySelector('dialog[open]') || !analytics.enabled()) return;
        if (!writeStored(ASKED_KEY, Date.now())) return;
        status.textContent = '';
        if (dialog.showModal) dialog.showModal();
        else dialog.setAttribute('open', '');
      }, 700);
    }
  };
}
