import { request, getSession, freshSession, ANON_TOKEN } from './backend.js';
import { readStored, writeStored, removeStored } from './store.js';

// Installed before game scripts so startup failures are observed too. No error text is sent.
export const ANALYTICS_BRIDGE = '<script>addEventListener("error",function(){parent.postMessage({type:"bored:runtime-error"},"*")});addEventListener("unhandledrejection",function(){parent.postMessage({type:"bored:runtime-error"},"*")});<\/script>';

export const ANALYTICS_PREFERENCE = 'bored.analytics.enabled';
export const VISITOR_KEY = 'bored.analytics.visitor';
// This identifies one browser, not a real person. Never create it on opt-out.
export function getVisitorId() {
  if (readStored(ANALYTICS_PREFERENCE, true) === false) return null;
  const value = readStored(VISITOR_KEY, null);
  if (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)) return value;
  const id = crypto.randomUUID();
  return writeStored(VISITOR_KEY, id) ? id : null;
}
export function cleanSnapshot(value) {
  const result = {};
  if (!value || typeof value !== 'object') return result;
  for (const [key, item] of Object.entries(value).slice(0, 40)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,29}$/.test(key)) continue;
    if (typeof item === 'boolean' || (typeof item === 'number' && Number.isFinite(item))) result[key] = item;
  }
  return result;
}

// Integrates time over short samples. Input *values* are never observed or stored.
export function timeSlice(previous, now, lastInput, { visible, focused, ready, paused }) {
  const elapsed = Math.max(0, Math.min(2000, now - previous)); // sleep/throttling is not play
  const visibleMs = visible && ready ? elapsed : 0;
  const activeMs = focused && !paused ? Math.min(visibleMs, Math.max(0, lastInput + 60000 - previous)) : 0;
  return { activeMs, visibleMs };
}

export function createAnalytics({ frame, snapshot, score, paused = () => false, isLower = () => false, now = () => performance.now() }) {
  let enabled = readStored(ANALYTICS_PREFERENCE, true) !== false;
  let run = null, last = now(), lastInput = -Infinity, pending = [], busy = false;
  let visitor = enabled ? getVisitorId() : null;
  let detach = () => {}, lastFlush = now();
  const owner = () => getSession()?.user?.id || null;
  const input = () => {
    lastInput = now();
    if (run?.ready && !run.context.external && !run.interacted) {
      run.interacted = true;
      emit('interaction');
      void flush();
    }
  };
  const uuid = () => crypto.randomUUID();

  function sample() {
    const time = now();
    if (run) {
      const slice = timeSlice(last, time, lastInput, {
        visible: !document.hidden, focused: document.hasFocus() && !run.context.external, ready: run.ready, paused: paused()
      });
      run.active += slice.activeMs;
      run.totalActive += slice.activeMs;
      run.visible += slice.visibleMs;
    }
    last = time;
  }
  function emit(kind, details = {}) {
    if (!enabled || !run) return;
    sample();
    const current = run.ready ? snapshot(run.game) : null;
    const valid = current?.slug === run.game ? current : null;
    const value = score(run.game, valid);
    if (value > 0 && (!run.best || (isLower(run.game) ? value < run.best : value > run.best))) run.best = value;
    pending.push({ id: uuid(), visitor_id: visitor, session_id: run.id, user_id: run.user, game: run.game, kind,
      active_ms: Math.min(65000, Math.floor(run.active)), visible_ms: Math.min(65000, Math.floor(run.visible)),
      details: { ...run.context, ...details, best_score: run.best || 0, ...(Number.isFinite(value) ? { score: value } : {}), snapshot: cleanSnapshot(valid) }
    });
    run.active = run.visible = 0;
    // Memory-only bounded retries; never leave private activity in shared-browser storage.
    if (pending.length > 200) pending.splice(0, pending.length - 200);
  }
  async function flush(keepalive = false) {
    if (busy || !pending.length || !enabled) return;
    busy = true;
    let delivered = false;
    try {
      const id = owner();
      // A former user's tokens are not retained and their records never become the next user's.
      pending = pending.filter(event => event.user_id === null || event.user_id === id);
      const user = pending[0]?.user_id;
      if (user === undefined) return;
      const batch = pending.filter(event => event.user_id === user).slice(0, 20);
      let token = ANON_TOKEN;
      if (user) {
        const fresh = await freshSession();
        if (fresh?.user?.id !== user) return;
        token = fresh.access_token;
      }
      // Insert individually with stable IDs: a retry receiving 23505 is already delivered.
      for (const event of batch) {
        if (!enabled) break;
        try {
          const { _table, ...body } = event;
          await request('/rest/v1/' + (_table === 'product_events' ? 'product_events' : 'play_events'),
            { method: 'POST', body, token, keepalive });
        } catch (error) { if (error.code !== '23505') throw error; }
        pending = pending.filter(item => item.id !== event.id);
      }
      delivered = true;
    } catch { /* Offline analytics must never interrupt a game. Retry on the next tick. */ }
    finally {
      busy = false;
      // Events queued while a request was in flight (including close/pagehide)
      // should follow it immediately, not wait for the next 30-second checkpoint.
      if (delivered && enabled && pending.length) queueMicrotask(() => void flush(keepalive));
    }
  }
  function end(reason = 'close') {
    if (!run) return null;
    emit('end', { reason });
    const summary = { game: run.game, active_ms: Math.floor(run.totalActive), interacted: !!run.interacted,
      finished: !!run.everFinished, external: !!run.context.external };
    run = null;
    detach(); detach = () => {};
    void flush();
    return summary;
  }
  function start(game, context = {}) {
    end('switch');
    if (!enabled) return;
    last = now(); lastInput = -Infinity;
    run = { id: uuid(), user: owner(), game, context, active: 0, totalActive: 0, visible: 0, ready: false, interacted: false, everFinished: false, opened: now() };
    emit('start');
    void flush();
  }
  function ready(external = false) {
    if (!run) return;
    if (!external && snapshot(run.game)?.slug !== run.game) return;
    if (run.ready) return;
    sample(); run.ready = true;
    emit('checkpoint', { loaded: true, load_ms: Math.round(now() - run.opened) });
    void flush();
    detach();
    if (external) return; // cross-origin internals are deliberately inaccessible
    try {
      const doc = frame.contentDocument;
      const types = ['pointerdown', 'keydown', 'touchstart'];
      types.forEach(type => doc.addEventListener(type, input, { passive: true }));
      detach = () => {
        types.forEach(type => doc.removeEventListener(type, input));
      };
    } catch {}
  }
  const tick = setInterval(() => {
    if (run && owner() !== run.user) { const { game, context } = run; end('account_change'); start(game, context); ready(!!context.external); }
    sample();
    if (run?.ready) {
      const state = snapshot(run.game);
      const value = score(run.game, state);
      if (value > 0 && (!run.best || (isLower(run.game) ? value < run.best : value > run.best))) run.best = value;
      const finished = !!(state?.finished || state?.won || state?.solved || state?.handOver);
      if (finished && !run.finished) { run.everFinished = true; emit('checkpoint', { round_finished: true }); void flush(); }
      if (run) run.finished = finished;
    }
    if (now() - lastFlush >= 30000) {
      if (run?.ready) emit('checkpoint');
      lastFlush = now(); void flush();
    }
  }, 1000);
  const visibility = () => { sample(); emit('checkpoint'); void flush(true); };
  let suspended = null;
  const leave = () => { suspended = run && { game: run.game, context: run.context }; emit('end', { reason: 'page_exit' }); run = null; detach(); void flush(true); };
  const resume = event => { if (event.persisted && suspended) { start(suspended.game, suspended.context); ready(!!suspended.context.external); suspended = null; } };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', leave);
  window.addEventListener('pageshow', resume);
  window.addEventListener('online', () => void flush());
  document.addEventListener('pointerdown', input, { passive: true });
  document.addEventListener('keydown', input, { passive: true });
  function track(kind, { game = null, match_id = null } = {}) {
    const allowed = ['visit','bt_view','bt_enroll','bt_challenge','bt_random','bt_open','bt_move','bt_complete','bt_rematch','bt_delete','bt_leave'];
    if (!enabled || !allowed.includes(kind)) return;
    const safeGame = typeof game === 'string' && /^[a-z0-9][a-z0-9-]{0,49}$/.test(game) ? game : null;
    const safeMatch = typeof match_id === 'string' && /^[0-9a-f-]{36}$/i.test(match_id) ? match_id : null;
    pending.push({ _table: 'product_events', id: uuid(), user_id: owner(),
      visitor_id: visitor, kind, game: safeGame,
      details: safeMatch ? { match_id: safeMatch } : {} });
    if (pending.length > 200) pending.splice(0, pending.length - 200);
    void flush();
  }
  track('visit');
  return {
    start, end, ready, track,
    visitorId: () => enabled ? visitor : null,
    event(kind, details) {
      if (kind === 'error' && run && (run.errors = (run.errors || 0) + 1) > 5) return;
      emit(kind, details); void flush();
    },
    enabled: () => enabled,
    setEnabled(value) {
      if (!value) { run = null; pending = []; detach(); visitor = null; removeStored(VISITOR_KEY); }
      enabled = !!value; writeStored(ANALYTICS_PREFERENCE, enabled);
      if (enabled && !visitor) { visitor = getVisitorId(); track('visit'); }
    },
    // Used by isolated tests; the app creates one tracker for its lifetime.
    dispose() { clearInterval(tick); detach(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', resume); }
  };
}
