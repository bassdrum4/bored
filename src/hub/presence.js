import { backendReady, freshSession, getSession, hasIdentity, realtimeURL, request } from './backend.js';
import { subscribeChanges } from './realtime.js';

const TOPIC = 'bored-online-v1';
const TICKET_REFRESH_MS = 4 * 60 * 1000;
const VERIFY_MS = 60 * 1000;
const TICKET = /^[0-9a-f-]{36}\.[0-9a-f-]{36}\.[0-9]{1,12}\.[0-9a-f]{64}$/;

// QA is an analytics preference, not a social visibility preference.
export function isLivePresenceUrl(href) {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' && url.hostname === 'bassdrum4.github.io' &&
      /^\/bored(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

export function validPresenceTickets(tickets) {
  return [...new Set((tickets || []).filter(t => typeof t === 'string' && TICKET.test(t)))].sort().slice(0, 300);
}

export function onlineLabel(names) {
  return names.length + ' online';
}

export function mountPresence() {
  const details = document.getElementById('online-presence');
  const summary = document.getElementById('online-summary');
  const list = document.getElementById('online-names');
  const status = document.getElementById('online-status');
  const setting = document.getElementById('presence-enabled');
  const settingNote = document.getElementById('presence-setting-status');
  const settingsLink = document.getElementById('presence-settings-link');
  if (!details || !summary || !list || !status || !setting || !settingNote || !settingsLink) return;

  let owner = null, epoch = 0, channel = null, tickets = null, visible = null;
  let resolveTimer = 0, refreshTimer = 0, verifyTimer = 0, resolveSerial = 0;
  let preferencePending = false, suspended = false, preferenceReading = false, paused = false;
  const eligible = backendReady() && isLivePresenceUrl(location.href) &&
    typeof WebSocket !== 'undefined';

  function current(id, version) {
    return !suspended && owner === id && epoch === version && hasIdentity() && getSession()?.user?.id === id;
  }
  async function rpc(id, action, args = {}) {
    const session = await freshSession();
    if (!session || session.user?.id !== id || getSession()?.user?.id !== id) throw new Error('Account changed');
    const result = await request('/rest/v1/rpc/bored_presence_rpc', {
      method: 'POST', body: { action, args }, token: session.access_token
    });
    if (getSession()?.user?.id !== id) throw new Error('Account changed');
    return result;
  }
  function paint(names, message = '') {
    list.replaceChildren();
    if (Array.isArray(names)) {
      summary.textContent = onlineLabel(names);
      status.textContent = names.length ? '' : 'Nobody is online right now.';
      for (const name of names) {
        const li = document.createElement('li');
        li.textContent = name;
        list.appendChild(li);
      }
    } else {
      summary.textContent = visible === false ? 'Appear offline' : 'Online';
      status.textContent = message;
    }
  }
  function stopChannel() {
    clearTimeout(resolveTimer); clearInterval(verifyTimer);
    resolveSerial++; tickets = null;
    const old = channel; channel = null;
    old?.close();
  }
  function setVisible(next) {
    visible = next;
    setting.checked = next === true;
    setting.disabled = preferencePending || !owner || next === null || !eligible;
    document.getElementById('presence-privacy-note').firstChild.textContent = next === false
      ? 'Your online status is hidden. You can turn it back on in '
      : 'Your online status is visible to other participating players. You can turn it off in ';
    if (next !== true) {
      stopChannel();
      paint(null, next === false ? 'You are hidden. Turn online status back on in Settings to see the list.' : 'Checking online status…');
    }
  }
  function scheduleResolve(delay = 750) {
    clearTimeout(resolveTimer);
    if (visible !== true || tickets === null || !channel?.isOpen()) return;
    const id = owner, version = epoch, serial = ++resolveSerial;
    resolveTimer = setTimeout(async () => {
      try {
        const result = await rpc(id, 'resolve', { tickets: validPresenceTickets(tickets) });
        if (!current(id, version) || serial !== resolveSerial || visible !== true) return;
        if (result?.visible === false) {
          setVisible(false); settingNote.textContent = 'Online status is off.'; return;
        }
        if (!Array.isArray(result?.names)) throw new Error('Invalid presence response');
        paint(result.names.filter(n => typeof n === 'string').sort((a,b) => a.localeCompare(b)));
      } catch {
        if (current(id, version) && serial === resolveSerial) paint(null, 'Online list temporarily unavailable.');
      }
    }, delay);
  }
  function connect(ticket, id, version) {
    if (!current(id, version) || visible !== true || !TICKET.test(ticket)) return;
    if (channel) { channel.trackPresence(ticket); return; }
    paint(null, 'Connecting…');
    const socket = subscribeChanges({
      url: realtimeURL(), topic: TOPIC, private: true,
      getToken: async () => {
        if (!current(id, version) || visible !== true) return '';
        const session = await freshSession();
        return current(id, version) && session?.user?.id === id ? session.access_token : '';
      },
      onPresence(next) {
        if (!current(id, version) || channel !== socket || visible !== true) return;
        tickets = next;
        if (next === null) {
          clearTimeout(resolveTimer); resolveSerial++; paint(null, 'Reconnecting…');
        } else scheduleResolve();
      },
      onState(open) {
        if (!current(id, version) || channel !== socket || visible !== true) return;
        if (!open) paint(null, 'Reconnecting…');
        else if (tickets !== null) scheduleResolve();
      }
    });
    channel = socket;
    socket.trackPresence(ticket);
    verifyTimer = setInterval(() => scheduleResolve(0), VERIFY_MS);
  }
  async function refresh() {
    if (!owner || !eligible || suspended || preferencePending || preferenceReading || paused) return;
    const id = owner, version = epoch;
    preferenceReading = true;
    try {
      const result = await rpc(id, 'get');
      if (!current(id, version) || preferencePending) return;
      if (typeof result?.visible !== 'boolean') throw new Error('Invalid preference');
      setVisible(result.visible);
      settingNote.textContent = result.visible ? '' : 'Online status is off.';
      if (result.visible) {
        if (!TICKET.test(result.ticket || '')) throw new Error('Invalid ticket');
        connect(result.ticket, id, version);
      }
    } catch {
      if (current(id, version) && !preferencePending) {
        // Fail closed: never keep advertising a stale ticket.
        setVisible(null); paint(null, 'Online status temporarily unavailable.');
        settingNote.textContent = 'Could not load your online status.';
      }
    } finally {
      if (current(id, version)) preferenceReading = false;
    }
  }
  function identityChanged() {
    const id = hasIdentity() ? getSession()?.user?.id || null : null;
    if (id === owner && !suspended) return;
    epoch++; stopChannel(); clearInterval(refreshTimer);
    owner = id; visible = null; preferencePending = false; preferenceReading = false; paused = false;
    details.hidden = !id || !eligible; details.open = false;
    setting.checked = false; setting.disabled = true;
    settingNote.textContent = !id ? 'Sign in to manage your online status.' :
      !eligible ? 'Online status is available on the live site.' : 'Loading your preference…';
    if (id && eligible && !suspended) {
      paint(null, 'Checking online status…');
      void refresh();
      refreshTimer = setInterval(() => void refresh(), TICKET_REFRESH_MS);
    }
  }
  setting.addEventListener('change', async () => {
    if (!owner || visible === null || preferencePending || !eligible) return;
    const desired = setting.checked, id = owner, before = visible;
    epoch++; const version = epoch;
    preferenceReading = false; preferencePending = true; paused = false;
    stopChannel();
    setVisible(desired);
    settingNote.textContent = 'Saving…';
    try {
      const result = await rpc(id, 'set', { visible: desired });
      if (!current(id, version)) return;
      if (result?.visible !== desired) throw new Error('Preference was not saved');
      preferencePending = false;
      setVisible(desired);
      settingNote.textContent = desired ? 'Online status is on.' : 'Online status is off.';
      if (desired) connect(result.ticket, id, version);
    } catch {
      if (!current(id, version)) return;
      preferencePending = false;
      // A failed opt-out never silently starts publishing again in this tab.
      paused = true;
      setVisible(null); setting.disabled = false; setting.checked = before;
      settingNote.textContent = 'Could not save. Your presence is paused here; try again.';
      paint(null, 'Online status paused.');
      visible = before;
    }
  });
  details.addEventListener('toggle', () => { if (details.open) scheduleResolve(0); });
  settingsLink.addEventListener('click', () => { details.open = false; });
  document.addEventListener('pointerdown', e => {
    if (details.open && !details.contains(e.target)) details.open = false;
  });
  details.addEventListener('keydown', e => {
    if (e.key === 'Escape') { details.open = false; summary.focus(); }
  });
  window.addEventListener('bored:identity', identityChanged);
  window.addEventListener('online', () => { channel?.reconnect(); if (!channel) void refresh(); });
  window.addEventListener('pagehide', () => {
    suspended = true; epoch++; stopChannel(); clearInterval(refreshTimer); owner = null;
  });
  window.addEventListener('pageshow', e => {
    if (e.persisted) { suspended = false; identityChanged(); }
  });
  identityChanged();
  if (!owner) settingNote.textContent = 'Sign in to manage your online status.';
}

if (typeof document !== 'undefined') mountPresence();
