// Cross-browser player data, written with optimistic concurrency. The previous
// last-writer-wins upsert silently erased progress from another device.
// Conditional updates on updated_at make each merge atomic with respect to
// concurrent clients, without changing the existing Supabase schema.
import { request, getSession, freshSession } from './backend.js';

const TABLE = '/rest/v1/player_state';
const LOWER_BESTS = new Set(['wordle', 'solitaire']);
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function eventsFrom(state) {
  const result = {};
  for (const [slug, event] of Object.entries(object(state.library?.favoriteEvents))) {
    if (!event || typeof event.saved !== 'boolean' || !Number.isFinite(event.at) || event.at < 0) continue;
    result[slug] = { saved: event.saved, at: event.at };
  }
  return result;
}

export function mergeCloudState(remote, incoming) {
  const a = object(remote), b = object(incoming);
  const al = object(a.library), bl = object(b.library);
  const events = eventsFrom(a);
  for (const [slug, event] of Object.entries(eventsFrom(b))) {
    if (!events[slug] || event.at >= events[slug].at) events[slug] = event;
  }
  // Existing rows have only favorites arrays. Treat those as historical adds,
  // but honor newer explicit remove events instead of resurrecting favorites.
  const favorites = new Set([
    ...(Array.isArray(al.favorites) ? al.favorites : []),
    ...(Array.isArray(bl.favorites) ? bl.favorites : [])
  ].filter(slug => typeof slug === 'string'));
  for (const [slug, event] of Object.entries(events)) {
    if (event.saved) favorites.add(slug);
    else favorites.delete(slug);
  }
  const recent = [...new Set([
    ...(Array.isArray(bl.recent) ? bl.recent : []),
    ...(Array.isArray(al.recent) ? al.recent : [])
  ])].filter(slug => typeof slug === 'string').slice(0, 4);

  const bests = {};
  for (const source of [object(a.bests), object(b.bests)]) {
    for (const [slug, raw] of Object.entries(source)) {
      const score = Number(raw);
      if (!Number.isFinite(score) || score <= 0) continue;
      if (!(slug in bests) ||
          (LOWER_BESTS.has(slug) ? score < bests[slug] : score > bests[slug])) bests[slug] = score;
    }
  }
  const daily = { ...object(a.daily) };
  for (const [id, result] of Object.entries(object(b.daily))) {
    if (result && result.id === id && !daily[id]) daily[id] = result;
  }
  return { library: { favorites: [...favorites], recent, favoriteEvents: events }, bests, daily };
}

function sameSession(id) {
  return getSession()?.user?.id === id;
}

async function currentRow(id) {
  const rows = await request(TABLE + '?select=data,updated_at&user_id=eq.' + encodeURIComponent(id));
  return rows?.[0] || null;
}

export async function pullPlayerState() {
  const session = getSession();
  if (!session || !(await freshSession()) || !sameSession(session.user.id)) return null;
  const row = await currentRow(session.user.id);
  return sameSession(session.user.id) ? object(row?.data) : null;
}

export async function pushPlayerState(incoming) {
  const session = getSession();
  if (!session || !(await freshSession()) || !sameSession(session.user.id)) return null;
  const id = session.user.id;
  for (let attempt = 0; attempt < 8; attempt++) {
    if (!sameSession(id)) return null;
    const row = await currentRow(id);
    if (!sameSession(id)) return null;
    const data = mergeCloudState(row?.data, incoming);
    const body = { data, updated_at: new Date().toISOString() };
    try {
      let result;
      if (row) {
        // With the existing touch_player_state trigger each update gets a
        // fresh DB timestamp. Zero returned rows means another device won
        // the race, so re-read and merge rather than overwriting it.
        result = await request(TABLE +
          '?user_id=eq.' + encodeURIComponent(id) +
          '&updated_at=eq.' + encodeURIComponent(row.updated_at) +
          '&select=data', {
          method: 'PATCH', body, prefer: 'return=representation'
        });
        if (!result?.length) continue;
      } else {
        result = await request(TABLE + '?select=data', {
          method: 'POST', body: { ...body, user_id: id },
          prefer: 'return=representation'
        });
      }
      return sameSession(id) ? (result?.[0]?.data || data) : null;
    } catch (error) {
      if (!row && error.status === 409) continue; // concurrent first insert
      throw error;
    }
  }
  throw new Error('Player state changed too many times; will retry next save.');
}
