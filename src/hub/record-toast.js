import { LB_GAMES, formatScore } from './scores.js';

const seen = new Set();
let active, timer;
export function showRecordToast(record) {
  if (!record || typeof record.id !== 'string' || seen.has(record.id) ||
      !Number.isFinite(record.at) || Date.now() - record.at > 20000 ||
      typeof record.handle !== 'string' || !Number.isFinite(record.value)) return;
  const game = LB_GAMES.find(g => g.id === record.game);
  if (!game) return;
  seen.add(record.id);
  if (seen.size > 100) seen.delete(seen.values().next().value);
  clearTimeout(timer); active?.remove();
  const toast = document.createElement('aside');
  toast.setAttribute('role', 'status');
  toast.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;display:flex;gap:12px;align-items:flex-start;max-width:calc(100vw - 32px);box-sizing:border-box;padding:13px 16px;border:1px solid #d6c6a4;border-radius:12px;background:#fff9ed;color:#29251e;box-shadow:0 6px 22px #0003;font:14px/1.4 system-ui,sans-serif;pointer-events:auto';
  const content = document.createElement('div');
  const heading = document.createElement('strong');
  heading.textContent = 'New #1 on ' + game.name;
  const text = document.createElement('div');
  text.textContent = record.handle + ' ? ' + formatScore(record.value, game);
  content.append(heading, text);
  const close = document.createElement('button');
  close.type = 'button'; close.setAttribute('aria-label','Dismiss record announcement');
  close.textContent = '?'; close.style.cssText = 'border:0;background:none;color:inherit;font:22px/1 system-ui;cursor:pointer;padding:0 3px';
  const dismiss = () => { clearTimeout(timer); toast.remove(); if(active===toast) active=null; };
  close.addEventListener('click', dismiss);
  toast.append(content, close);
  active=toast; place(); timer=setTimeout(dismiss,5000);
}
function place() {
  if(active)(document.fullscreenElement||document.webkitFullscreenElement||document.body).append(active);
}
if(typeof document!=='undefined'){
  document.addEventListener('fullscreenchange',place);
  document.addEventListener('webkitfullscreenchange',place);
}
