import { readStored, writeStored, removeStored } from './store.js';

const STORAGE_KEY = 'bored.ui.preferences';
const DEFAULTS = Object.freeze({
  theme: 'light',
  reducedMotion: false
});
const $ = id => document.getElementById(id);

function normalize(saved) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return { ...DEFAULTS };
  return {
    theme: saved.theme === 'dark' ? 'dark' : DEFAULTS.theme,
    reducedMotion: typeof saved.reducedMotion === 'boolean' ? saved.reducedMotion : DEFAULTS.reducedMotion
  };
}

// Deliberately device-local: account/cloud state stores favorites, scores and saves separately.
export function initPreferences({ clearFavorites, resetAnalytics }) {
  const stored = readStored(STORAGE_KEY);
  let settings = normalize(stored);
  const status = $('settings-saved');

  function apply() {
    const dark = settings.theme === 'dark';
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.reduceMotion = settings.reducedMotion ? 'true' : 'false';
    document.documentElement.style.colorScheme = settings.theme;
    const themeColor = document.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.content = dark ? '#17150f' : '#f5f2ea';
  }
  function sync() {
    $('setting-theme').value = settings.theme;
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
  $('setting-reduced-motion').addEventListener('change', event => change('reducedMotion', event.target.checked));

  $('settings-reset').addEventListener('click', () => {
    settings = { ...DEFAULTS };
    removeStored(STORAGE_KEY);
    $('sort').value = 'popular';
    $('sort').dispatchEvent(new Event('change'));
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
  apply();
  sync();
  return { get: () => ({ ...settings }) };
}
