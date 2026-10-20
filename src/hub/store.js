// Safe storage helpers. Private browsing and file:// contexts throw on access,
// and the arcade has to keep working when they do, so every call swallows the
// error instead of letting it reach the UI.

export function readStored(key, fallback = null) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return value === null || value === undefined ? fallback : value;
  } catch {
    return fallback;
  }
}

export function writeStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// Plain string values (score numbers) are written raw so older storage keys keep
// the exact text the games themselves wrote.
export function writeRaw(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStored(key) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function readNumber(key) {
  const value = Number(readStored(key, 0));
  return Number.isFinite(value) ? value : 0;
}
