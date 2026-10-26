import { hasIdentity, getSession } from './backend.js';

// Only games with an original-game adapter and authoritative backend are offered.
export const TOGETHER_ADAPTERS = Object.freeze({
  'connect-four': { rulesVersion: 1, action: 'move' },
  '8ball': { rulesVersion: 1, action: 'pool_move' }
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

export function createTogetherPlayer({ match, owner, frame, submit, reload, close, onExit }) {
  const adapter = TOGETHER_ADAPTERS[match.game];
  if (!adapter || match.rules_version !== adapter.rulesVersion) throw new Error('This game version is not available yet.');
  const channel = crypto.randomUUID();
  let current = match, saving = false, disposed = false, confirmed = false;
  const identity = () => !disposed && hasIdentity() && getSession()?.user?.id === owner;
  const context = m => ({ state: m.state, status: m.status, seat: m.p1 === owner ? 1 : 2,
    canPlay: m.status === 'active' && m.turn_user === owner,
    players: [m.p1_handle, m.p2_handle] });
  return {
    isOwner: identity,
    document(html) {
      const json = JSON.stringify([context(current), channel, new URL('./games/pool-engine.js', location.href).href]).replace(/</g, '\\u003c');
      return html.replace(/<head([^>]*)>/i, head => head + '<script>(' + gameBridge.toString() + ')(...' + json + ');<\/script>');
    },
    async message(event) {
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
    dispose() { disposed = true; onExit(); }
  };
}
