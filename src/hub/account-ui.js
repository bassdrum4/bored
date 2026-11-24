import { backendReady, getSession, getHandle, suggestedHandle, hasIdentity, renameHandle, authErrorMessage, signIn, signUp, signOut, adoptToken, setHandle, loadRules, freshSession, ensureProfile } from './backend.js';
import { capturePlayerSnapshot, stashPendingSignup, adoptSignupProgress } from './player-storage.js';
import { addMedal, syncInvite } from './invites.js';
export function createAccountUI({ state: ui, activateProfile, applyPendingClaim, startClaimAuth, closeClaimDialog,
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
  window.dispatchEvent(new Event('bored:identity'));
  const guest = !hasIdentity();
  const state = $('#account-state');
  const action = $('#account-action');
  const rename = $('#account-rename');
  state.replaceChildren();
  if (!backendReady()) {
    state.textContent = 'The leaderboard is down. Your local bests still work.';
    action.hidden = true;
    rename.hidden = true;
    return;
  }
  action.hidden = false;
  if (!guest) {
    const nameNode = element('b', '', getHandle() || suggestedHandle());
    addMedal(nameNode, getHandle());
    state.append('Signed in as ', nameNode,
      ui.lbNotice ? ' · ' + ui.lbNotice : '. Best scores sync to the shared board.');
    action.textContent = 'Sign out';
    action.classList.remove('primary');
    rename.hidden = false;
  } else {
    state.textContent = 'Playing as a guest. Your scores stay in this browser until you make an account.';
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
    ? 'Pick a name for the board. The email is just for signing in.'
    : naming ? 'What other players see. 1 to 16 characters, no spaces.' : 'Keep your scores between devices, and see who\'s beating you.';
  $('#auth-email-row').hidden = naming;
  $('#auth-pass-row').hidden = naming;
  $('#auth-name-row').hidden = authMode === 'signin';
  $('#auth-invite-row').hidden = authMode !== 'signup';
  if (authMode !== 'signup') $('#auth-invite').value = '';
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
  const invite = $('#auth-invite').value.trim();
  if (authMode === 'name') {
    if (!name) { message.textContent = 'Choose a name first.'; return; }
    authBusy = true;
    $('#auth-submit').disabled = true;
    message.textContent = 'Saving…';
    // The strip and the board are this browser's view of the account, so the
    // new name goes on immediately; the server still decides whether it is
    // taken, and a refusal puts the old name back and reopens the dialog.
    const previous = getHandle();
    setHandle(name);
    closeAuthDialog();
    renderAccount();
    renderLeaderboard();
    try {
      await renameHandle(name);
      ui.lbCache.clear();
      renderAccount();
      renderLeaderboard();
      loadLeaderboard(true);
    } catch (err) {
      setHandle(previous);
      renderAccount();
      renderLeaderboard();
      openAuthDialog('name');
      $('#auth-message').textContent = authErrorMessage(err);
    } finally {
      authBusy = false;
      $('#auth-submit').disabled = false;
    }
    return;
  }
  if (!email || !password) { message.textContent = 'Email and password are required.'; return; }
  if (password.length < 6) { message.textContent = 'Use at least 6 characters for the password.'; return; }
  if (authMode === 'signup' && !name) { message.textContent = 'Choose a display name.'; return; }
  if (authMode === 'signup' && invite && !/^\d{3,4}$/.test(invite)) {
    message.textContent = 'Invite codes are 3 or 4 digits.'; return;
  }
  authBusy = true;
  $('#auth-submit').disabled = true;
  message.textContent = authMode === 'signup' ? 'Creating your account…' : 'Signing in…';
  try {
    if (authMode === 'signup') {
      // New accounts may inherit this browser's guest scores only at signup;
      // signing into an existing account never imports somebody else's data.
      const guest = capturePlayerSnapshot();
      const result = await signUp(email, password, name, invite);
      if (!result.confirmed) {
        stashPendingSignup(result.userId, guest);
        openAuthDialog('signin');
        message.textContent = 'Check your email to confirm the account, then sign in. Your guest progress stays here until confirmation.';
        return;
      }
      activateProfile();
      adoptSignupProgress(result.userId, guest);
      // The profile row is what a recruit credit hangs off; a name collision is
      // handled the same way the next page load handles it.
      try { await ensureProfile(name); } catch {}
      if (invite) { try { await syncInvite(invite); } catch {} }
      // The guest profile carried the run already; this only clears the offer.
      applyPendingClaim();
      loadLibrary(); renderRecent(); renderLibrary(); renderDaily();
    } else {
      await signIn(email, password);
      activateProfile();
      // The invite code a confirmation page carried in the metadata is claimed
      // on the first real session.
      try { await ensureProfile(); } catch {}
      try { await syncInvite(); } catch {}
      // An email-confirmed signup may require a separate sign-in rather than
      // redirecting with a session. Transfer only that pending signup's data.
      if (adoptSignupProgress(getSession()?.user?.id)) {
        loadLibrary(); renderRecent(); renderLibrary(); renderDaily();
      }
      // A run the guest chose to keep when offered an account.
      applyPendingClaim();
    }
    ui.lbNotice = '';
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
  ui.lbNotice = '';
  ui.lbCache.clear();
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
    ui.lbNotice = reason;
    renderAccount();
    return true;
  }
  try {
    await adoptToken(access, refresh, Number(params.get('expires_in')) || 3600);
    activateProfile();
    try { await ensureProfile(); } catch {}
    try { await syncInvite(); } catch {}
    if (adoptSignupProgress(getSession()?.user?.id)) {
      loadLibrary(); renderRecent(); renderLibrary(); renderDaily();
    }
    applyPendingClaim();
    ui.lbNotice = '';
    renderAccount();
    renderLeaderboard();
    await restorePlayerState();
    await syncSharedScores();
    renderAccount();
    loadLeaderboard(true);
  } catch (err) {
    ui.lbNotice = authErrorMessage(err);
    renderAccount();
  }
  return true;
}

function initAccount() {
  // The refresh button lives on the board, so it asks for every row.
  $('#lb-refresh').onclick = () => loadLeaderboard(true, true);
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
        ui.lbNotice = authErrorMessage(err);
        renderAccount();
      });
    });
  });
}


return { renderAccount, openAuthDialog, initAccount };
}
