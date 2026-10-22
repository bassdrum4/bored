import { backendReady, getSession } from './backend.js';
import { sendFeedback, feedbackErrorMessage } from './feedback.js';
export function createFeedbackUI() {
const $ = selector => document.querySelector(selector);
/* ── Feedback ─────────────────────────────────────────────────────────────── */

let feedbackBusy = false;

function openFeedbackDialog() {
  if (!backendReady()) return;
  const dialog = $('#feedback-dialog');
  $('#feedback-status').textContent = '';
  $('#feedback-email').value = getSession()?.user?.email || '';
  if (!dialog.open) {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  setTimeout(() => $('#feedback-text').focus(), 40);
}

function closeFeedbackDialog() {
  const dialog = $('#feedback-dialog');
  if (dialog.close) dialog.close();
  else dialog.removeAttribute('open');
}

async function submitFeedback(event) {
  event.preventDefault();
  if (feedbackBusy) return;
  const message = $('#feedback-text').value.trim();
  const email = $('#feedback-email').value.trim();
  const status = $('#feedback-status');
  if (message.length < 4) { status.textContent = 'Tell us a little more first.'; return; }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { status.textContent = 'That email does not look right.'; return; }
  feedbackBusy = true;
  $('#feedback-submit').disabled = true;
  status.textContent = 'Sending…';
  try {
    await sendFeedback({ message, email });
    $('#feedback-text').value = '';
    closeFeedbackDialog();
    const button = $('#feedback-open');
    button.textContent = 'Thanks — sent';
    button.disabled = true;
    setTimeout(() => { button.textContent = 'Send feedback'; button.disabled = false; }, 4000);
  } catch (err) {
    status.textContent = feedbackErrorMessage(err);
  } finally {
    feedbackBusy = false;
    $('#feedback-submit').disabled = false;
  }
}

function initFeedback() {
  $('#feedback-open').onclick = openFeedbackDialog;
  $('#feedback-cancel').onclick = closeFeedbackDialog;
  $('#feedback-form').addEventListener('submit', submitFeedback);
  $('#feedback-dialog').addEventListener('click', event => {
    if (event.target === $('#feedback-dialog')) closeFeedbackDialog();
  });
}


return { initFeedback };
}
