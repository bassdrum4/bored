// Pure ranking helpers. The RPC exposes only ranked game slugs, not identities,
// session data or precise audience sizes. Equal ranks keep newest-first order.
//
// Popular ranks the last seven days of plays, so a game nobody has opened yet
// has no rank at all and used to be pushed under every ranked game — where it
// stayed, because nobody could see it to play it. A launch inside the boost
// window can be lifted above ranked games. The hub instead passes its explicit
// NEW-badge list, keeping all four new arrivals together until the next release.

export const NEW_GAME_BOOST_DAYS = 3;

export function isFeatured(slug, featuredUntil, now = Date.now()) {
  const expiry = Date.parse(featuredUntil?.[slug] || '');
  return Number.isFinite(expiry) && now < expiry;
}
const DAY = 86400000;
const detroitCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Detroit', year: 'numeric', month: '2-digit', day: '2-digit'
});
function detroitCalendarTime(now) {
  const parts = Object.fromEntries(detroitCalendar.formatToParts(now).map(({type, value}) => [type, value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
}

// Check the cached public snapshot at most once a day, after 07:07 UTC.
// Its ranking changes only on Monday; daily checks allow recovery from a failed refresh.
export function popularityCacheDay(now = Date.now()) {
  return new Date(now - (7 * 60 + 7) * 60000).toISOString().slice(0, 10);
}

export function popularityRanks(rows) {
  const ranks = new Map();
  if (!Array.isArray(rows)) return ranks;
  for (const row of rows) {
    const rank = Number(row?.ranking);
    if (typeof row?.game !== 'string' || !row.game ||
        !Number.isSafeInteger(rank) || rank < 1) continue;
    ranks.set(row.game, Math.min(ranks.get(row.game) ?? Infinity, rank));
  }
  return ranks;
}

/** A game's launch as epoch milliseconds, or 0 when it has no recorded arrival. */
export function launchTime(slug, launches) {
  const date = launches?.[slug];
  if (typeof date !== 'string') return 0;
  const at = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(at) ? at : 0;
}

/** True while a game is still inside its post-launch boost window. */
export function isNewGame(slug, launches, now = Date.now(), days = NEW_GAME_BOOST_DAYS) {
  const at = launchTime(slug, launches);
  const age = detroitCalendarTime(now) - at;
  return at > 0 && age >= 0 && age < days * DAY;
}

/**
 * Popular order: editorial pins, then NEW-badged games in catalog release order,
 * then ranked games (or date-based boosts when no explicit fresh list is supplied). Ranked games
 * by rank, then everything without a rank in catalog order. With no rankings and
 * no launches in their window the list is returned untouched, which is the
 * offline fallback the library relies on.
 */
export function sortPopularGames(games, ranks, options = {}) {
  const { launches, freshGames, featuredUntil, now = Date.now(), days = NEW_GAME_BOOST_DAYS } = options;
  const boost = new Map();
  if (Array.isArray(freshGames)) {
    freshGames.forEach((slug, index) => boost.set(slug, freshGames.length - index));
  } else {
    for (const [slug] of games) {
      if (isNewGame(slug, launches, now, days)) boost.set(slug, launchTime(slug, launches));
    }
  }
  const featured = new Set(games.filter(([slug]) => isFeatured(slug, featuredUntil, now)).map(([slug]) => slug));
  if (!ranks?.size && !boost.size && !featured.size) return games;
  return games.sort((a, b) => {
    if (featured.has(a[0]) !== featured.has(b[0])) return featured.has(a[0]) ? -1 : 1;
    const firstLaunch = boost.get(a[0]) ?? 0;
    const secondLaunch = boost.get(b[0]) ?? 0;
    if (firstLaunch && secondLaunch) return secondLaunch - firstLaunch;
    if (firstLaunch) return -1;
    if (secondLaunch) return 1;
    const first = ranks?.get(a[0]) ?? Infinity;
    const second = ranks?.get(b[0]) ?? Infinity;
    return first === second ? 0 : first < second ? -1 : 1;
  });
}
