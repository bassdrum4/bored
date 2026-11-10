import { hasIdentity, getSession, request, freshSession } from './backend.js';

// Civ Lite's saves follow the player's Bored account (5.3). The game has no network and no credentials, so
// whatever it keeps in the account goes through this bridge, which exists whenever Civ Lite is open in Bored's
// player and is not in a match or a live game. The game asks with postMessage on a channel only this document
// knows. The hub checks who asked (the game's own window), the channel and the signed-in account, then calls
// the save_* functions itself with the player's session. No token ever goes into the page.
//
// What the game is given: its own saves (header, version, size, time, and the game itself only when it asks for
// one slot), and an opaque reference for the account so it can keep its notes per account. Never a token, an
// email or an account id.

const GAME = 'ashcrown';
const SLOTS = ['auto', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8'];
const MAX_TEXT = 16 * 1024 * 1024;     // a game, as the page sends it, before compression
const MAX_DATA = 2 * 1024 * 1024;      // what the server keeps (data, after compression and base64)
const MAX_OPEN = 64 * 1024 * 1024;     // what a download may grow to when it is unpacked
const KEEPALIVE = 60 * 1024;           // browsers only let a request outlive its page with a body under 64 KB
const HEADER_KEYS = { v: 'n', mv: 'n', at: 'n', kind: 's', name: 's', meta: 's', turn: 'n', seed: 'n', civ: 's', color: 's', ink: 's', era: 's' };

// Serialized into the game's document before its script runs, like the other bridges: call(op, payload) answers
// with the hub's result, and on(fn) hears what the hub pushes.
function savesBridge(channel) {
  let serial = 0, listener = null;
  const waiting = new Map(), early = [];
  window.__boredSaves = {
    call(op, payload) {
      return new Promise((resolve, reject) => {
        const id = ++serial;
        waiting.set(id, { resolve, reject });
        parent.postMessage({ type: 'bored:saves-call', channel, id, op, payload: payload || {} }, '*');
      });
    },
    on(fn) {
      listener = fn;
      while (early.length) fn(early.shift());
    }
  };
  addEventListener('message', event => {
    const m = event.data;
    if (event.source !== parent || !m || m.channel !== channel) return;
    if (m.type === 'bored:saves-result') {
      const task = waiting.get(m.id);
      if (!task) return;
      waiting.delete(m.id);
      if (m.error) task.reject(Object.assign(new Error(m.error), { retry: !!m.retry, conflict: m.conflict || null }));
      else task.resolve(m.result);
    } else if (m.type === 'bored:saves-event') {
      if (listener) listener(m.event); else early.push(m.event);
    }
  });
}

// An error that retrying will not fix: the page asked for something wrong, or there is no account.
function refuse(message) {
  const error = new Error(message);
  error.permanent = true;
  return error;
}

// A short opaque name for an account, the same every time, so the game can keep its notes about what it has
// synced per account without ever being told the account id. Not a secret and not meant to be one.
export function accountRef(id) {
  const text = 'civlite-saves:' + String(id);
  let a = 0x811c9dc5, b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 0x01000193) >>> 0;
    b = Math.imul(b ^ text.charCodeAt(text.length - 1 - i), 0x85ebca6b) >>> 0;
  }
  return 'a' + a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

// The page's header, cut down to the keys a header has, with plain values and short text.
export function cleanHeader(head) {
  if (!head || typeof head !== 'object' || Array.isArray(head)) throw refuse('Invalid save.');
  const out = {};
  for (const key of Object.keys(HEADER_KEYS)) {
    const value = head[key];
    if (HEADER_KEYS[key] === 'n' && Number.isFinite(value)) out[key] = value;
    else if (HEADER_KEYS[key] === 's' && typeof value === 'string') out[key] = value.slice(0, 200);
  }
  if (!Number.isFinite(out.at)) throw refuse('Invalid save.');
  return out;
}

const base64 = bytes => {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(text);
};

async function pipe(bytes, stream, limit) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { reader.cancel().catch(() => {}); throw refuse('That save is too large to open.'); }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) { out.set(part, at); at += part.length; }
  return out;
}

// gzip then base64, with a plain copy ("plain:" and the text itself) where the browser can not compress.
export async function encodeSave(text) {
  if (typeof text !== 'string' || !text || text.length > MAX_TEXT) throw refuse('Invalid save.');
  if (typeof CompressionStream === 'function' && typeof Blob === 'function') {
    try {
      const packed = await pipe(new TextEncoder().encode(text), new CompressionStream('gzip'), MAX_TEXT);
      return 'gz:' + base64(packed);
    } catch (error) { /* fall through to the plain copy */ }
  }
  return 'plain:' + text;
}

export async function decodeSave(data) {
  if (typeof data !== 'string') throw refuse('That save can’t be opened.');
  if (data.startsWith('plain:')) return data.slice(6);
  if (!data.startsWith('gz:')) throw refuse('That save can’t be opened.');
  if (typeof DecompressionStream !== 'function') throw refuse('This browser can’t open saves from your account.');
  const raw = atob(data.slice(3));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(await pipe(bytes, new DecompressionStream('gzip'), MAX_OPEN));
}

const slotOf = value => {
  if (typeof value !== 'string' || !SLOTS.includes(value)) throw refuse('That isn’t a save slot.');
  return value;
};
const versionOf = value => {
  if (!Number.isInteger(value) || value < 0 || value > 1e9) throw refuse('Invalid request.');
  return value;
};

// What the game is told about a refusal: whether trying again can help, and for a 409 what is stored now.
function failure(error) {
  const status = Number(error && error.status);
  const out = { error: String((error && error.message) || 'Something went wrong.'), retry: false };
  if (status === 409 || (error && error.code === 'PT409')) {
    let stored = null;
    try { stored = JSON.parse(error.details); } catch (parseError) { /* the page will list again */ }
    out.error = 'This save changed on another device.';
    out.conflict = {
      version: stored && Number.isInteger(stored.version) ? stored.version : null,
      header: stored && stored.header && typeof stored.header === 'object' ? stored.header : null,
      stamp: stored && Number.isFinite(stored.stamp) ? stored.stamp : null
    };
  } else if (!error || !error.permanent) {
    out.retry = !status || status === 408 || status === 429 || status >= 500;
  }
  return out;
}

// The saves bridge for one document of Civ Lite. Everything it needs from the page around it is injected, so it
// can be tested without a browser or a network:
//   rpc(fn, args, options)   one of the save_* functions, with the player's session
//   account()                who is signed in now, as { id }, or null
export function createSavesBridge({ frame, deps = {} }) {
  const channel = crypto.randomUUID();
  const account = deps.account || (() => (hasIdentity() ? { id: getSession()?.user?.id } : null));
  const encode = deps.encode || encodeSave, decode = deps.decode || decodeSave;
  let disposed = false, listing = null;

  async function realRpc(fn, args, options) {
    const owner = getSession()?.user?.id;
    const session = await freshSession();
    if (!hasIdentity() || !session || session.user.id !== owner) throw refuse('Sign in to Bored to keep saves in your account.');
    const result = await request('/rest/v1/rpc/' + fn, {
      method: 'POST', body: args, token: session.access_token, keepalive: !!(options && options.keepalive)
    });
    if (getSession()?.user?.id !== owner) throw refuse('Your account changed. Please try again.');
    return result;
  }
  const rpc = deps.rpc || realRpc;

  const post = message => { try { frame.contentWindow?.postMessage(Object.assign({ channel }, message), '*'); } catch (error) { /* the frame is gone */ } };
  const same = id => { const now = account(); return !!now && now.id === id; };

  async function list() {
    // A screen that asks twice while the first answer is on its way gets that answer.
    if (listing) return listing;
    const task = Promise.resolve().then(async () => {
      const rows = await rpc('save_list', { p_game: GAME });
      return { saves: (Array.isArray(rows) ? rows : []).filter(r => r && SLOTS.includes(r.slot)).map(r => ({
        slot: r.slot, version: Number(r.version) || 0, bytes: Number(r.bytes) || 0, stamp: Number(r.stamp) || 0, header: r.header && typeof r.header === 'object' ? r.header : {}
      })) };
    });
    listing = task;
    const done = () => { if (listing === task) listing = null; };
    task.then(done, done);
    return task;
  }

  async function call(op, p) {
    p = p && typeof p === 'object' ? p : {};
    const me = account();
    if (op === 'status') return me ? { signedIn: true, account: accountRef(me.id) } : { signedIn: false, account: null };
    if (!me) throw refuse('Sign in to Bored to keep saves in your account.');
    switch (op) {
      case 'list': return list();
      case 'get': {
        const row = await rpc('save_get', { p_game: GAME, p_slot: slotOf(p.slot) });
        return { slot: row.slot, version: Number(row.version) || 0, stamp: Number(row.stamp) || 0, header: row.header || {}, state: await decode(row.data) };
      }
      case 'put': {
        const slot = slotOf(p.slot), expected = versionOf(p.expected), head = cleanHeader(p.header);
        const data = await encode(p.state);
        if (data.length > MAX_DATA) throw refuse('That save is larger than your account keeps (2 MB).');
        // A page that is closing leaves the request with the browser; that only works for a small body.
        const row = await rpc('save_put', { p_game: GAME, p_slot: slot, p_header: head, p_data: data, p_expected: expected }, { keepalive: !!p.leaving && data.length < KEEPALIVE });
        return { slot, version: Number(row.version) || 0, bytes: Number(row.bytes) || 0, stamp: Number(row.stamp) || 0 };
      }
      case 'delete': {
        const row = await rpc('save_delete', { p_game: GAME, p_slot: slotOf(p.slot), p_expected: versionOf(p.expected) });
        return { slot: slotOf(p.slot), deleted: !!(row && row.deleted), version: Number(row && row.version) || 0 };
      }
      default: throw refuse('Unknown operation.');
    }
  }

  return {
    channel,
    // Puts the bridge into the game's document before its own script runs.
    document(html) {
      const json = JSON.stringify([channel]).replace(/</g, '\\u003c');
      return html.replace(/<head([^>]*)>/i, head => head + '<script>(' + savesBridge.toString() + ')(...' + json + ');<\/script>');
    },
    async message(event) {
      const asked = event.data;
      if (disposed || event.source !== frame.contentWindow || !asked || asked.channel !== channel || asked.type !== 'bored:saves-call') return;
      const before = account(), owner = before ? before.id : null;
      try {
        const result = await call(asked.op, asked.payload);
        // A write the page asked for just before it closed still finishes; only the answer has nowhere to go.
        if (disposed) return;
        // An answer meant for one account is never handed to the page after the account changed.
        if (owner !== null && !same(owner)) throw refuse('Your account changed. Please try again.');
        post({ type: 'bored:saves-result', id: asked.id, result: result === undefined ? null : result });
      } catch (error) {
        if (!disposed) post(Object.assign({ type: 'bored:saves-result', id: asked.id }, failure(error)));
      }
    },
    // The player signed in, out or switched accounts: the page is told, and asks again who is here.
    accountChanged() {
      listing = null;
      post({ type: 'bored:saves-event', event: { event: 'account' } });
    },
    dispose() { disposed = true; listing = null; }
  };
}
