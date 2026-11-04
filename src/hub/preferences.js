import { readStored, writeStored, removeStored } from './store.js';

const STORAGE_KEY = 'bored.ui.preferences';
const DEFAULTS = Object.freeze({
  theme: 'system',
  density: 'comfortable',
  descriptions: true,
  reducedMotion: false
});
const $ = id => document.getElementById(id);

function normalize(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULTS };
  return {
    theme: ['system', 'light', 'dark'].includes(saved.theme) ? saved.theme : DEFAULTS.theme,
    density: ['comfortable', 'compact'].includes(saved.density) ? saved.density : DEFAULTS.density,
    descriptions: typeof saved.descriptions === 'boolean' ? saved.descriptions : DEFAULTS.descriptions,
    reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : DEFAULTS.reducedMotion
  };
}

// Deliberately device-local: account/cloud state stores favorites, scores and saves separately.
export function initPreferences({ clearFavorites, resetAnalytics }) {
  let settings = normalize(readStored(STORAGE_KEY));
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
  const status = $('settings-saved');

  function apply() {
    const mode = settings.theme === 'system' ? (systemDark.matches ? 'dark' : 'light') : settings.theme;
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.density = settings.density;
    document.documentElement.dataset.descriptions = settings.descriptions ? 'shown' : 'hidden';
    document.documentElement.dataset.reduceMotion = settings.reducedMotion ? 'true' : 'false';
    document.documentElement.style.colorScheme = mode;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = mode === 'dark' ? '#202a23' : '#f7f5ef';
  }
  function sync() {
    $('setting-theme').value = settings.theme;
    $('setting-density').value = settings.density;
    $('setting-descriptions').checked = settings.descriptions;
    $('setting-reduced-motion').checked = settings.reducedMotion;
  }
  function persist() {
    status.textContent = writeStored(STORAGE_KEY, settings)
      ? 'Saved on this device.'
      : 'Storage unavailable. Changes will last until you reload.';
  }
  function change(field, value) {
    settings = normalize({ ...settings, [field]: value });
    apply();
    persist();
  }

  $('setting-theme').addEventListener('change', event => change('theme', event.target.value));
  $('setting-density').addEventListener('change', event => change('density', event.target.value));
  $('setting-descriptions').addEventListener('change', event => change('descriptions', event.target.checked));
  $('setting-reduced-motion').addEventListener('change', event => change('reducedMotion', event.target.checked));

  $('settings-reset').addEventListener('click', () => {
    settings = { ...DEFAULTS };
    removeStored(STORAGE_KEY);
    resetAnalytics();
    apply();
    sync();
    status.textContent = 'Default preferences restored.';
  });
  $('settings-clear-favorites').addEventListener('click', () => {
    if (!window.confirm('Remove all your Bored favorites? This also updates your saved favorites if you are signed in.')) return;
    clearFavorites();
    status.textContent = 'Favorites cleared. Your scores and saved games are untouched.';
  });
  if (systemDark.addEventListener) systemDark.addEventListener('change', () => {
    if (settings.theme === 'system') apply();
  });

  apply();
  sync();
  return { get: () => ({ ...settings }) };
}
