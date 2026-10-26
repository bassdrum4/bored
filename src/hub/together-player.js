import { hasIdentity, getSession } from './backend.js';

// Only games with an original-game adapter and authoritative backend are offered.
// `turns` games send each move for the server to validate. `duel` games give both
// players the same seed and compare one self-reported run, so there is no board
// for the server to referee — the same trust the single-player boards already use.
export const TOGETHER_ADAPTERS = Object.freeze({
  'connect-four': { rulesVersion: 1, action: 'move', mode: 'turns' },
  '8ball': { rulesVersion: 1, action: 'pool_move', mode: 'turns' },
  '2048': { rulesVersion: 1, action: 'submit_run', mode: 'duel', metric: 'score' },
  mahjong: { rulesVersion: 1, action: 'submit_run', mode: 'duel', metric: 'pairs' }
});

// Serialized into the ORIGINAL document before its script runs. No tokens,
// networking or result authority enter the game. Adapters render and collect input.
function gameBridge(context, channel, engineURL) {
  let pending = null, serial = 0;
  const bridge = window.__boredTogether = {
    context, engineURL,
    submit(move) {
      if (pending) return Promise.reject(new Error('A move is already saving.'));
      return new Promise((resolve, reject) => {
        const id = ++serial;
        pending = { id, resolve, reject };
        parent.postMessage({ type: 'bored:together-move', channel, id, move }, '*');
      });
    },
    finishTurn() { parent.postMessage({ type: 'bored:together-done', channel }, '*'); },
    error(error, retry) {
      document.getElementById('together-error')?.remove();
      const box = document.createElement('div'); box.id = 'together-error'; box.setAttribute('role', 'alert');
      box.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:9999;background:#fff9ed;color:#191713;border:1px solid #b3261e;padding:14px;font:14px/1.5 system-ui';
      const text = document.createElement('p'); text.textContent = 'Move not confirmed. ' + error.message;
      box.append(text);
      for (const [label, action] of [['Retry save', retry], ['Reload saved game', () => parent.postMessage({ type: 'bored:together-reload', channel }, '*')]]) {
        const b = document.createElement('button'); b.textContent = label;
        b.onclick = () => { box.remove(); action(); }; box.append(b);
      }
      document.body.append(box);
    }
  };
  addEventListener('message', event => {
    const reply = event.data;
    if (event.source !== parent || reply?.channel !== channel || reply.type !== 'bored:together-result' || reply.id !== pending?.id) return;
    const task = pending; pending = null;
    if (reply.error) task.reject(new Error(reply.error));
    else { bridge.context = reply.context; task.resolve(reply.context); }
  });
}

export function createTogetherPlayer({ match, owner, frame, submit, reload, close, onExit, notify }) {
  const adapter = TOGETHER_ADAPTERS[match.game];
  if (!adapter || match.rules_version !== adapter.rulesVersion) throw new Error('This game version is not available yet.');
  const duel = adapter.mode === 'duel';
  const channel = crypto.randomUUID();
  let current = match, saving = false, disposed = false, confirmed = false, live = true, pollTimer = 0, retryAt = 0;
  const identity = () => !disposed && hasIdentity() && getSession()?.user?.id === owner;
  const context = m => ({ state: m.state, status: m.status, seat: m.p1 === owner ? 1 : 2,
    canPlay: m.status === 'active' && m.turn_user === owner,
    players: [m.p1_handle, m.p2_handle] });
  const snapshot = () => { try { return frame.contentWindow?.__boredSnapshot?.() || null; } catch { return null; } };
  // A duel's result is whatever the game's own snapshot says right now; the hub
  // sends it when the run ends or the player asks to finish.
  const runValue = () => {
    const snap = snapshot();
    if (!snap || snap.slug !== match.game) return null;
    const value = Number(snap[adapter.metric]);
    return Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
  };
  async function sendRun() {
    if (!identity()) throw new Error('Your account changed.');
    if (saving || confirmed) return;
    const value = runValue();
    if (value === null) throw new Error('There is no run to send yet.');
    saving = true;
    try {
      const next = await submit(current, { value }, adapter.action);
      if (!identity()) return;
      current = next; confirmed = true;
      stop();
      close();
    } finally { saving = false; }
  }
  if (duel) {
    // The game ends itself when it runs out of moves or clears the board; waiting
    // for the player to leave would cost them a finished run they forgot to send.
    pollTimer = setInterval(() => {
      if (!live || disposed || confirmed || saving || !identity()) return;
      if (current.status !== 'active' || current.turn_user !== owner) return;
      if (Date.now() < retryAt) return;
      const snap = snapshot();
      if (!snap || snap.finished !== true || runValue() === null) return;
      sendRun().catch(error => {
        retryAt = Date.now() + 5000;
        notify?.('Your run is finished but not sent. ' + error.message);
      });
    }, 600);
  }
  function stop() { live = false; clearInterval(pollTimer); }
  return {
    isOwner: identity,
    mode: duel ? 'duel' : 'turns',
    stop,
    // Leaving a duel with a run in hand asks before it is sent.
    needsConfirm: () => duel && !confirmed && !saving && current.status === 'active' && (runValue() || 0) > 0,
    pendingRun: () => (duel ? runValue() : null),
    sendRun,
    document(html) {
      if (duel) {
        // The seed has to exist before the game's own script reads it, and both
        // players get the match's seed rather than the day's.
        const seed = current.state?.seed;
        const script = '<script>window.__boredSeed=' + JSON.stringify({ seed, match: true }).replace(/</g, '\\u003c') + ';<\/script>';
        return html.replace(/<head([^>]*)>/i, head => head + script);
      }
      const json = JSON.stringify([context(current), channel, new URL('./games/pool-engine.js', location.href).href]).replace(/</g, '\\u003c');
      return html.replace(/<head([^>]*)>/i, head => head + '<script>(' + gameBridge.toString() + ')(...' + json + ');<\/script>');
    },
    async message(event) {
      if (duel) return;
      const request = event.data;
      if (!identity() || event.source !== frame.contentWindow || request?.channel !== channel) return;
      if (request.type === 'bored:together-done') {
        // A renderer cannot decide whether the authoritative turn has ended.
        if (confirmed && !saving && !context(current).canPlay) close();
        return;
      }
      if (request.type === 'bored:together-reload') { if (!saving) reload(); return; }
      if (request.type !== 'bored:together-move' || saving) return;
      saving = true;
      try {
        if (!context(current).canPlay) throw new Error('It is not your turn.');
        const next = await submit(current, request.move, adapter.action);
        if (!identity()) return;
        current = next; confirmed = true;
        frame.contentWindow.postMessage({ type: 'bored:together-result', channel, id: request.id, context: context(current) }, '*');
      } catch (error) {
        if (identity()) frame.contentWindow.postMessage({ type: 'bored:together-result', channel, id: request.id, error: error.message }, '*');
      } finally { saving = false; }
    },
    dispose() { disposed = true; stop(); onExit(); }
  };
}
