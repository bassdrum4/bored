import { backendReady, getSession, getHandle, suggestedHandle, hasIdentity, renameHandle, authErrorMessage, signIn, signUp, signOut, adoptToken, setHandle, loadRules, freshSession, ensureProfile } from './backend.js';
import { capturePlayerSnapshot, stashPendingSignup, adoptSignupProgress } from './player-storage.js';
export function createAccountUI({ state, activateProfile, applyPendingClaim, startClaimAuth, closeClaimDialog,
  loadLibrary, renderRecent, renderLibrary, renderDaily, renderLeaderboard, loadLeaderboard,
  syncSharedScores, restorePlayerState }) {
const $ = selector => document.querySelector(selector);
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
let authMode = 'signin';
let authBusy = false;
/* ── Account ──────────────────────────────────────────────────────────────── */

function renderAccount() {
  const guest = !hasIdentity();
  const state = $('#account-state');
  const action = $('#account-action');
  const rename = $('#account-rename');
  state.replaceChildren();
  if (!backendReady()) {
    state.textContent = 'Shared leaderboard is offline until Supabase is connected.';
    action.hidden = true;
    rename.hidden = true;
    return;
  }
  action.hidden = false;
  if (!guest) {
    state.append('Signed in as ', element('b', '', getHandle() || suggestedHandle()),
      state.lbNotice ? ' · ' + state.lbNotice : '. Best scores sync to the shared board.');
    action.textContent = 'Sign out';
    action.classList.remove('primary');
    rename.hidden = false;
  } else {
    state.textContent = 'Playing as a guest. Scores stay in this browser.';
    action.textContent = 'Sign in';
    // Signing in is the one thing a guest has to find, so it carries the weight.
    action.classList.add('primary');
    rename.hidden = true;
  }
}


function openAuthDialog(mode = 'signin') {
  if (!backendReady()) return;
  authMode = mode === 'name' && !hasIdentity() ? 'signin' : mode;
  const dialog = $('#auth-dialog');
  const naming = authMode === 'name';
  $('#auth-title').textContent = authMode === 'signup' ? 'Create an account' : naming ? 'Display name' : 'Sign in';
  $('#auth-blurb').textContent = authMode === 'signup'
    ? 'Pick a name for the leaderboard. The email is only used to sign in.'
    : naming ? 'This is the name other players see. 3–16 letters, numbers, _ or -.' : 'Save your best scores and see how everyone else is doing.';
  $('#auth-email-row').hidden = naming;
  $('#auth-pass-row').hidden = naming;
  $('#auth-name-row').hidden = authMode === 'signin';
  $('#auth-submit').textContent = authMode === 'signup' ? 'Create account' : naming ? 'Save name' : 'Sign in';
  const toggle = $('#auth-toggle');
  toggle.hidden = naming;
  toggle.textContent = authMode === 'signup' ? 'Already have an account? Sign in' : 'New here? Create an account';
  $('#auth-message').textContent = '';
  $('#auth-name').value = naming ? (getHandle() || suggestedHandle()) : '';
  $('#auth-password').value = '';
  if (!dialog.open) {
    if (dialog.showModal) dialog.showModal();
    else dialog.setAttribute('open', '');
  }
  setTimeout(() => (naming ? $('#auth-name') : $('#auth-email')).focus(), 40);
}

function closeAuthDialog() {
  const dialog = $('#auth-dialog');
  if (dialog.close) dialog.close();
  else dialog.removeAttribute('open');
}

async function submitAuth(event) {
  event.preventDefault();
  if (!backendReady() || authBusy) return;
  const message = $('#auth-message');
  const name = $('#auth-name').value.trim().slice(0, 20);
  const email = $('#auth-email').value.trim();
  const password = $('#auth-password').value;
  if (authMode === 'name') {
    if (!name) { message.textContent = 'Choose a name first.'; return; }
    authBusy = true;
    $('#auth-submit').disabled = true;
    message.textContent = 'Saving…';
    try {
      await renameHandle(name);
      state.lbCache.clear();
      closeAuthDialog();
      renderAccount();
      renderLeaderboard();
      loadLeaderboard(true);
    } catch (err) {
      message.textContent = authErrorMessage(err);
    } finally {
      authBusy = false;
      $('#auth-submit').disabled = false;
    }
    return;
  }
  if (!email || !password) { message.textContent = 'Email and password are required.'; return; }
  if (password.length < 6) { message.textContent = 'Use at least 6 characters for the password.'; return; }
  if (authMode === 'signup' && !name) { message.textContent = 'Choose a display name.'; return; }
  authBusy = true;
  $('#auth-submit').disabled = true;
  message.textContent = authMode === 'signup' ? 'Creating your account…' : 'Signing in…';
  try {
    if (authMode === 'signup') {
      // New accounts may inherit this browser's guest scores only at signup;
      // signing into an existing account never imports somebody else's data.
      const guest = capturePlayerSnapshot();
      const result = await signUp(email, password, name);
      if (!result.confirmed) {
        stashPendingSignup(result.userId, guest);
        openAuthDialog('signin');
        message.textContent = 'Check your email to confirm the account, then sign in. Your guest progress stays here until confirmation.';
        return;
      }
      activateProfile();
      adoptSignupProgress(result.userId, guest);
      // The guest profile carried the run already; this only clears the offer.
      applyPendingClaim();
      loadLibrary(); renderRecent(); renderLibrary(); renderDaily();
    } else {
      await signIn(email, password);
      activateProfile();
      // An email-confirmed signup may require a separate sign-in rather than
      // redirecting with a session. Transfer only that pending signup's data.
      if (adoptSignupProgress(getSession()?.user?.id)) {
        loadLibrary(); renderRecent(); renderLibrary(); renderDaily();
      }
      // A run the guest chose to keep when offered an account.
      applyPendingClaim();
    }
    state.lbNotice = '';
    closeAuthDialog();
    renderAccount();
    renderLeaderboard();
    await restorePlayerState();
    await syncSharedScores();
    renderAccount();
    loadLeaderboard(true);
  } catch (err) {
    message.textContent = authErrorMessage(err);
  } finally {
    authBusy = false;
    $('#auth-submit').disabled = false;
  }
}

async function signOutUser() {
  await signOut();
  activateProfile();
  setHandle('');
  state.lbNotice = '';
  state.lbCache.clear();
  renderAccount();
  renderLeaderboard();
  loadLeaderboard(true);
}

async function consumeAuthRedirect() {
  if (!location.hash || location.hash.length < 2) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const access = params.get('access_token');
  const refresh = params.get('refresh_token');
  const error = params.get('error_description') || params.get('error');
  if (!access && !error) return false;
  try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  if (error) {
    let reason = error;
    try { reason = decodeURIComponent(error.replace(/\+/g, ' ')); } catch {}
    state.lbNotice = reason;
    renderAccount();
    return true;
  }
  try {
    await adoptToken(access, refresh, Number(params.get('expires_in')) || 3600);
    activateProfile();
    if (adoptSignupProgress(getSession()?.user?.id)) {
      loadLibrary(); renderRecent(); renderLibrary(); renderDaily();
    }
    applyPendingClaim();
    state.lbNotice = '';
    renderAccount();
    renderLeaderboard();
    await restorePlayerState();
    await syncSharedScores();
    renderAccount();
    loadLeaderboard(true);
  } catch (err) {
    state.lbNotice = authErrorMessage(err);
    renderAccount();
  }
  return true;
}

function initAccount() {
  $('#lb-refresh').onclick = () => loadLeaderboard(true);
  $('#claim-signin').onclick = () => startClaimAuth('signin');
  $('#claim-signup').onclick = () => startClaimAuth('signup');
  $('#claim-cancel').onclick = () => closeClaimDialog();
  $('#claim-dialog').addEventListener('click', event => {
    if (event.target === $('#claim-dialog')) closeClaimDialog();
  });
  $('#account-action').onclick = () => { if (hasIdentity()) signOutUser(); else openAuthDialog('signin'); };
  $('#account-rename').onclick = () => openAuthDialog('name');
  $('#auth-cancel').onclick = closeAuthDialog;
  $('#auth-toggle').onclick = () => openAuthDialog(authMode === 'signup' ? 'signin' : 'signup');
  $('#auth-form').addEventListener('submit', submitAuth);
  $('#auth-dialog').addEventListener('click', event => { if (event.target === $('#auth-dialog')) closeAuthDialog(); });

  renderAccount();
  renderLeaderboard();
  loadRules().then(loaded => {
    if (!loaded) return;
    renderLeaderboard();
  });
  loadLeaderboard();
  consumeAuthRedirect().then(handled => {
    if (handled || !getSession()) return;
    freshSession().then(fresh => {
      if (!fresh) { activateProfile(); renderAccount(); renderLeaderboard(); return; }
      ensureProfile().then(async () => {
        activateProfile();
        renderAccount();
        await restorePlayerState();
        syncSharedScores();
      }).catch(err => {
        state.lbNotice = authErrorMessage(err);
        renderAccount();
      });
    });
  });
}


return { renderAccount, openAuthDialog, initAccount };
}
