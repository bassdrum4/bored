import { hasIdentity, getSession, request, freshSession } from './backend.js';

// Trackbound's public tracks live on the Bored account, and only the hub has
// the account. The game has no credentials of its own, so it asks over a channel
// only its own document knows: the hub checks who asked, then calls the
// trackbound_track* functions with the player's session. No token, email or
// account id ever enters the page.
//
// What the game is given: a list of { id, name, handle, code, at }, whether the
// player is signed in, and the answer to a post. Nothing else about the account.

// Serialized into the game's document before its script runs, like the other
// bridges: call(op, payload) answers with the hub's result.
function tracksBridge(channel) {
  let serial = 0;
  const waiting = new Map();
  window.__boredTracks = {
    call(op, payload) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        waiting.set(id, { resolve, reject });
        parent.postMessage({ type: 'bored:tracks-call', channel, id, op, payload: payload || {} }, '*');
      });
    }
  };
  addEventListener('message', event => {
    const m = event.data;
    if (event.source !== parent || !m || m.channel !== channel || m.type !== 'bored:tracks-result') return;
    const task = waiting.get(m.id);
    if (!task) return;
    waiting.delete(m.id);
    if (m.error) task.reject(new Error(m.error)); else task.resolve(m.result);
  });
}

const LIST_LIMIT = 60;
const refuse = message => { const error = new Error(message); error.permanent = true; return error; };
const TRACK_CODE = /^TB1-([0-9a-z]{3,36})-([0-9a-z]{4})$/i;

function cleanName(value) {
  const name = String(value || '').trim().slice(0, 32);
  if (!name) throw refuse('Give the track a name.');
  return name;
}

// The editor writes TB1-<body>-<checksum>; accept any case and store the shape
// the game parses, so the checksum text stays comparable.
function cleanCode(value) {
  const match = TRACK_CODE.exec(String(value || '').trim());
  if (!match) throw refuse('That is not a saved track.');
  return 'TB1-' + match[1].toLowerCase() + '-' + match[2].toLowerCase();
}

// Public read: the list function is granted to the publishable key, so this
// answers signed out too.
async function listTracks() {
  const rows = await request('/rest/v1/rpc/trackbound_tracks_list', {
    method: 'POST', body: { p_limit: LIST_LIMIT }
  });
  return {
    tracks: (Array.isArray(rows) ? rows : []).filter(row => row && typeof row.code === 'string' && row.name)
      .slice(0, LIST_LIMIT)
      .map(row => ({
        id: String(row.id || ''),
        name: String(row.name).slice(0, 32),
        handle: String(row.handle || 'Bored player').slice(0, 32),
        code: String(row.code).slice(0, 90),
        at: Number(row.at) || 0
      }))
  };
}

async function postTrack(payload) {
  if (!hasIdentity()) throw refuse('Sign in to Bored to post a track.');
  const name = cleanName(payload.name);
  const code = cleanCode(payload.code);
  const owner = getSession()?.user?.id;
  const session = await freshSession();
  if (!session || session.user.id !== owner) throw refuse('Sign in again to post a track.');
  const result = await request('/rest/v1/rpc/trackbound_track_post', {
    method: 'POST', body: { p_name: name, p_code: code }, token: session.access_token
  });
  if (getSession()?.user?.id !== owner) throw refuse('Your account changed. Please try again.');
  return { posted: true, updated: !!(result && result.updated) };
}

export function createTracksBridge({ frame, deps = {} }) {
  const channel = crypto.randomUUID();
  const list = deps.list || listTracks, post = deps.post || postTrack;
  const signedIn = deps.signedIn || (() => hasIdentity());
  let disposed = false;
  const send = message => { try { frame.contentWindow?.postMessage(Object.assign({ channel }, message), '*'); } catch (error) { /* the frame is gone */ } };

  async function call(op, payload) {
    if (op === 'status') return { signedIn: signedIn() };
    if (op === 'list') return list();
    if (op === 'post') return post(payload || {});
    throw refuse('Unknown operation.');
  }

  return {
    channel,
    // Puts the bridge into the game's document before its own script runs.
    document(html) {
      const json = JSON.stringify([channel]).replace(/</g, '\\u003c');
      return html.replace(/<head([^>]*)>/i, head => head + '<script>(' + tracksBridge.toString() + ')(...' + json + ');<\/script>');
    },
    async message(event) {
      const asked = event.data;
      if (disposed || event.source !== frame.contentWindow || !asked || asked.channel !== channel || asked.type !== 'bored:tracks-call') return;
      try {
        const result = await call(asked.op, asked.payload);
        if (!disposed) send({ type: 'bored:tracks-result', id: asked.id, result: result === undefined ? null : result });
      } catch (error) {
        if (!disposed) send({ type: 'bored:tracks-result', id: asked.id, error: String((error && error.message) || 'Something went wrong.') });
      }
    },
    dispose() { disposed = true; }
  };
}
