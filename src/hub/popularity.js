// Pure ranking helpers. The RPC exposes only ranked game slugs, not identities,
// session data or precise audience sizes. Equal ranks keep newest-first order.
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

export function sortPopularGames(games, ranks) {
  if (!ranks?.size) return games; // offline: keep newest-first catalog order
  return games.sort((a, b) => {
    const first = ranks.get(a[0]) ?? Infinity;
    const second = ranks.get(b[0]) ?? Infinity;
    return first === second ? 0 : first < second ? -1 : 1;
  });
}
