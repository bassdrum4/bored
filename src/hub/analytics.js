import { request, getSession, freshSession, ANON_TOKEN } from './backend.js';
import { readStored, writeStored } from './store.js';

// Installed before game scripts so startup failures are observed too. No error text is sent.
export const ANALYTICS_BRIDGE = '<script>addEventListener("error",function(){parent.postMessage({type:"bored:runtime-error"},"*")});addEventListener("unhandledrejection",function(){parent.postMessage({type:"bored:runtime-error"},"*")});<\/script>';

export const ANALYTICS_PREFERENCE = 'bored.analytics.enabled';
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
  let detach = () => {}, lastFlush = now();
  const owner = () => getSession()?.user?.id || null;
  const input = () => { lastInput = now(); };
  const uuid = () => crypto.randomUUID();

  function sample() {
    const time = now();
    if (run) {
      const slice = timeSlice(last, time, lastInput, {
        visible: !document.hidden, focused: document.hasFocus() && !run.context.external, ready: run.ready, paused: paused()
      });
      run.active += slice.activeMs;
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
    pending.push({ id: uuid(), session_id: run.id, user_id: run.user, game: run.game, kind,
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
          await request('/rest/v1/play_events', { method: 'POST', body: event, token, keepalive });
        } catch (error) { if (error.code !== '23505') throw error; }
        pending = pending.filter(item => item.id !== event.id);
      }
    } catch { /* Offline analytics must never interrupt a game. Retry on the next tick. */ }
    finally { busy = false; }
  }
  function end(reason = 'close') {
    if (!run) return;
    emit('end', { reason });
    run = null;
    detach(); detach = () => {};
    void flush();
  }
  function start(game, context = {}) {
    end('switch');
    if (!enabled) return;
    last = now(); lastInput = -Infinity;
    run = { id: uuid(), user: owner(), game, context, active: 0, visible: 0, ready: false, opened: now() };
    emit('start');
    void flush();
  }
  function ready(external = false) {
    if (!run) return;
    if (!external && snapshot(run.game)?.slug !== run.game) return;
    if (run.ready) return;
    sample(); run.ready = true; input();
    emit('checkpoint', { loaded: true, load_ms: Math.round(now() - run.opened) });
    void flush();
    detach();
    if (external) return; // cross-origin internals are deliberately inaccessible
    try {
      const doc = frame.contentDocument;
      const types = ['pointerdown', 'pointermove', 'keydown', 'touchstart'];
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
      if (finished && !run.finished) { emit('checkpoint', { round_finished: true }); void flush(); }
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
  return {
    start, end, ready,
    event(kind, details) {
      if (kind === 'error' && run && (run.errors = (run.errors || 0) + 1) > 5) return;
      emit(kind, details); void flush();
    },
    enabled: () => enabled,
    setEnabled(value) {
      if (!value) { run = null; pending = []; detach(); }
      enabled = !!value; writeStored(ANALYTICS_PREFERENCE, enabled);
    },
    // Used by isolated tests; the app creates one tracker for its lifetime.
    dispose() { clearInterval(tick); detach(); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', resume); }
  };
}
