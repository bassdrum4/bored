// Continue-where-you-left-off, one save per game and no slots. The helper is
// injected into every game document before the game's own script runs, so a
// game can offer a saved position while it wires itself up. A game calls arm()
// with a producer for the state worth keeping: the helper writes it while the
// player plays and on the way out, then offers it back through ask().
//
// The prompt lives inside the game's own frame, because the game is the only
// thing that knows what a useful label is ("Move 14 · vs computer").

const KEY_PREFIX = 'bored.resume.';

const HELPER = `
window.__boredResume = (function (slug) {
  var KEY = '__KEY__' + slug;
  var producer = null, prompt = null, timer = 0;

  function read() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (!saved || saved.v !== 1 || !saved.state) return null;
      return saved;
    } catch (error) { return null; }
  }

  function write(state, label) {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        v: 1, at: Date.now(), label: String(label || ''), state: state
      }));
      return true;
    } catch (error) { return false; }
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (error) {}
  }

  // The producer is asked for the current position; null means "nothing worth
  // resuming" (the run is over, or the player has not started).
  function flush() {
    if (!producer) return false;
    var current = null;
    try { current = producer(); } catch (error) { return false; }
    if (!current || !current.state) return false;
    return write(current.state, current.label);
  }

  function hide() {
    if (prompt && prompt.parentNode) prompt.parentNode.removeChild(prompt);
    prompt = null;
  }

  function ask(label, onContinue, onFresh) {
    hide();
    var card = document.createElement('div');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Continue saved game');
    card.style.cssText = 'position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;' +
      'padding:20px;background:rgba(25,23,19,.32);' +
      'font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#191713';
    var box = document.createElement('div');
    box.style.cssText = 'background:#f5f2ea;border:1px solid #cfc8b8;border-radius:3px;' +
      'padding:16px 18px 14px;max-width:280px;text-align:center';
    var title = document.createElement('p');
    title.textContent = 'Continue where you left off?';
    title.style.cssText = 'margin:0 0 4px;font:600 11px/1.4 inherit;letter-spacing:.09em;text-transform:uppercase';
    var detail = document.createElement('p');
    detail.textContent = label || 'A game in progress';
    detail.style.cssText = 'margin:0 0 14px;color:#6b6558';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:center';
    function choice(text, primary, run) {
      var button = document.createElement('button');
      button.type = 'button';
      button.textContent = text;
      button.style.cssText = 'font:12px/1 ui-monospace,SFMono-Regular,Menlo,monospace;padding:9px 12px;' +
        'border:1px solid ' + (primary ? '#191713' : '#cfc8b8') + ';border-radius:2px;cursor:pointer;' +
        'background:' + (primary ? '#191713' : 'transparent') + ';color:' + (primary ? '#f5f2ea' : '#191713');
      button.onclick = run;
      row.appendChild(button);
      return button;
    }
    var yes = choice('Continue', true, function () { hide(); onContinue(); });
    choice('Start over', false, function () { hide(); clear(); onFresh(); });
    box.appendChild(title); box.appendChild(detail); box.appendChild(row);
    card.appendChild(box);
    (document.body || document.documentElement).appendChild(card);
    prompt = card;
    yes.focus();
  }

  function arm(fn) {
    producer = fn;
    if (timer) clearInterval(timer);
    // Autosave, so a tab that is closed or crashes still leaves a position.
    timer = setInterval(flush, 4000);
    addEventListener('pagehide', flush);
    addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  return { read: read, save: write, clear: clear, arm: arm, ask: ask, flush: flush, hide: hide };
})(__SLUG__);
`;

/** The resume helper as a script tag for one game document. */
export function resumeScript(slug) {
  return '<scr' + 'ipt>' +
    HELPER.replace('__KEY__', KEY_PREFIX).replace('__SLUG__', JSON.stringify(String(slug))) +
    '</scr' + 'ipt>';
}
