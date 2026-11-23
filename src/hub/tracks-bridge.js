import { hasIdentity, getSession, request, freshSession, ANON_TOKEN } from './backend.js';
import { loadMedals, medalFor } from './invites.js';

// Trackbound's public tracks live on the Bored account, and only the hub has
// the account. The game has no credentials of its own, so it asks over a channel
// only its own document knows: the hub checks who asked, then calls the
// trackbound_track* functions with the player's session. No token, email or
// account id ever enters the page.
//
// What the game is given: a list of { id, name, handle, code, at, best, mine }
// (best being that course's fastest four players, mine whether the signed-in
// player shared it), whether the player is signed in, and the answers to a
// post, a finished run and a delete. Nothing else about the account.

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
// TB1 is one character a piece, TB2 carries the road and its extras.
const TRACK_CODE = /^TB([12])-([0-9a-z]{3,72})-([0-9a-z]{4})$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cleanTrackId = value => (UUID.test(String(value || '').trim()) ? String(value).trim() : null);
const RUN_MIN_MS = 4000, RUN_MAX_MS = 600000;

function cleanName(value) {
  const name = String(value || '').trim().slice(0, 32);
  if (!name) throw refuse('Give the track a name.');
  return name;
}

// The editor writes TB<version>-<body>-<checksum>; accept any case and store
// the shape the game parses, so the checksum text stays comparable.
function cleanCode(value) {
  const match = TRACK_CODE.exec(String(value || '').trim());
  if (!match) throw refuse('That is not a saved track.');
  return 'TB' + match[1] + '-' + match[2].toLowerCase() + '-' + match[3].toLowerCase();
}

// Public read: the list function is granted to the publishable key, so this
// answers signed out too.
async function listTracks() {
  const ask = token => request('/rest/v1/rpc/trackbound_tracks_list', {
    method: 'POST', body: { p_limit: LIST_LIMIT }, token
  });
  let rows;
  try { rows = await ask(); }
  catch (error) {
    // A stale session must not hide the public list; `mine` simply reads false.
    if (!getSession() || error.status !== 401) throw error;
    rows = await ask(ANON_TOKEN);
  }
  // Public names carry the inviter's medal, so the medal list is read once here
  // rather than asking the game to decorate names later.
  await loadMedals();
  return {
    tracks: (Array.isArray(rows) ? rows : []).filter(row => row && typeof row.code === 'string' && row.name)
      .slice(0, LIST_LIMIT)
      .map(row => ({
        id: String(row.id || ''),
        name: String(row.name).slice(0, 32),
        handle: String(row.handle || 'Bored player').slice(0, 32),
        tier: medalFor(row.handle),
        code: String(row.code).slice(0, 90),
        at: Number(row.at) || 0,
        best: (Array.isArray(row.best) ? row.best : [])
          .filter(entry => entry && Number.isFinite(Number(entry.ms)))
          .slice(0, 4)
          .map(entry => ({
            handle: String(entry.handle || 'Bored player').slice(0, 32),
            tier: medalFor(entry.handle),
            ms: Math.round(Number(entry.ms))
          })),
        mine: row.mine === true
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
  // A repost names the row it replaces, so an edited course keeps one entry.
  const id = cleanTrackId(payload.id);
  const result = await request('/rest/v1/rpc/trackbound_track_post', {
    method: 'POST',
    body: id ? { p_name: name, p_code: code, p_id: id } : { p_name: name, p_code: code },
    token: session.access_token
  });
  if (getSession()?.user?.id !== owner) throw refuse('Your account changed. Please try again.');
  return { posted: true, updated: !!(result && result.updated),
    id: result && result.id ? String(result.id) : id };
}

// A finished public course reports its time. The server keeps the best one, so
// sending every run is cheap and a slower run changes nothing.
async function postTrackRun(payload) {
  if (!hasIdentity()) throw refuse('Sign in to Bored to post a time.');
  const track = cleanTrackId(payload.track);
  if (!track) throw refuse('That track is not shared.');
  const ms = Math.round(Number(payload.ms));
  if (!Number.isFinite(ms) || ms < RUN_MIN_MS || ms > RUN_MAX_MS) throw refuse('That is not a finished lap.');
  const owner = getSession()?.user?.id;
  const session = await freshSession();
  if (!session || session.user.id !== owner) throw refuse('Sign in again to post a time.');
  await request('/rest/v1/rpc/trackbound_track_run_post', {
    method: 'POST', body: { p_track: track, p_ms: ms }, token: session.access_token
  });
  if (getSession()?.user?.id !== owner) throw refuse('Your account changed. Please try again.');
  return { ok: true };
}

// Deleting a posted course: the author, checked by the function against the
// session. Its times go with it through the cascade.
async function removeTrack(payload) {
  if (!hasIdentity()) throw refuse('Sign in to Bored to remove a track.');
  const id = cleanTrackId(payload.id);
  if (!id) throw refuse('That track is not shared.');
  const owner = getSession()?.user?.id;
  const session = await freshSession();
  if (!session || session.user.id !== owner) throw refuse('Sign in again to remove a track.');
  await request('/rest/v1/rpc/trackbound_track_delete', {
    method: 'POST', body: { p_id: id }, token: session.access_token
  });
  if (getSession()?.user?.id !== owner) throw refuse('Your account changed. Please try again.');
  return { ok: true };
}

export function createTracksBridge({ frame, deps = {} }) {
  const channel = crypto.randomUUID();
  const list = deps.list || listTracks, post = deps.post || postTrack, run = deps.run || postTrackRun;
  const remove = deps.remove || removeTrack;
  const signedIn = deps.signedIn || (() => hasIdentity());
  let disposed = false;
  const send = message => { try { frame.contentWindow?.postMessage(Object.assign({ channel }, message), '*'); } catch (error) { /* the frame is gone */ } };

  async function call(op, payload) {
    if (op === 'status') return { signedIn: signedIn() };
    if (op === 'list') return list();
    if (op === 'post') return post(payload || {});
    if (op === 'run') return run(payload || {});
    if (op === 'remove') return remove(payload || {});
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
