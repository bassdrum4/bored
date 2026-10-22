import { seedNumber, seedCode } from '../daily.js';
export function createGameDocument(challengeDate) {
/* ── Game document plumbing ───────────────────────────────────────────────── */

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

// Shown in the frame while a document is downloading, and again when it never
// arrives, so the player gets a reason instead of a white rectangle.
function frameStandIn(message, detail) {
  return '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><title>Game</title><style>' +
    'html,body{height:100%}body{margin:0;display:grid;place-content:center;gap:6px;background:#fff;' +
    'color:#111;text-align:center;padding:24px;font:14px/1.5 system-ui,-apple-system,sans-serif}' +
    'p{margin:0;font-weight:600}span{color:#666}</style></head><body>' +
    '<p>' + escapeHtml(message) + '</p><span>' + escapeHtml(detail) + '</span></body></html>';
}

function injectHead(html, extra) {
  return html.replace(/<head([^>]*)>/i, (match, attrs) => '<head' + attrs + '>' + extra);
}

// Every game document learns the day's shared seed before its own script runs,
// so anything board-generated can be the same for everyone on the first run of
// the day. Games that ignore it behave exactly as before.
function injectSeed(html) {
  const date = challengeDate();
  const seed = seedNumber(date);
  const script = '<scr' + 'ipt>window.__boredSeed={date:' + JSON.stringify(date) +
    ',seed:' + seed + ',code:' + JSON.stringify(seedCode(seed)) + '};<\/scr' + 'ipt>';
  // The last closing tag is the document's; a game may well contain the text
  // "</body>" earlier as data (shadow-net's fake web pages do).
  const at = html.toLowerCase().lastIndexOf('</body>');
  return at < 0 ? html + script : html.slice(0, at) + script + html.slice(at);
}


return { escapeHtml, frameStandIn, injectHead, injectSeed };
}
