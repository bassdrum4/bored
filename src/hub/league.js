// Penguin's Leaderboard: one ranking across every Pokémon game on Bored.
//
// Each event turns a player's best into points out of 1,000 (their best divided
// by a full score, capped), and the combined total adds the six together,
// so the most anyone can hold is 6,000. The rows are the shared board's
// { game, handle, value }, the same ones the overall leaderboard reads.
//
// `full` is what earns the whole 1,000. Poké Idle's achievements count ACH.length
// in poke-idle.html: keep it in step when achievements are added.
export const LEAGUE_FULL = 1000;
export const LEAGUE_EVENTS = [
  { id: 'poke-idle', play: 'poke-idle', name: 'Pokédex', from: 'Poké Idle', full: 2050, unit: 'points',
    what: 'One point for every species in your Poké Idle Pokédex, and one more for each you have shiny.' },
  { id: 'poke-idle-ach', play: 'poke-idle', name: 'Achievements', from: 'Poké Idle', full: 67, unit: 'earned',
    what: 'Achievements earned in Poké Idle.' },
  { id: 'poke-idle-tower', play: 'poke-idle', name: 'Battle Tower', from: 'Poké Idle', full: 40, unit: 'floors',
    what: 'The highest Battle Tower floor you have cleared. It opens after Paldea.' },
  { id: 'pokedoku-doku', play: 'pokedoku', name: 'Pokédoku', from: 'Pokédoku', full: 1350, unit: 'points',
    what: 'Your best daily Pokédoku grid.' },
  { id: 'pokedoku-inverse', play: 'pokedoku', name: 'Inverse Doku', from: 'Pokédoku', full: 600, unit: 'points',
    what: 'Your best daily Inverse Doku.' },
  { id: 'pokedoku-shiny', play: 'pokedoku', name: 'Shiny Hunt', from: 'Pokédoku', full: 700, unit: 'points',
    what: 'Your best daily Shiny Hunt.' }
];

/** Points for one event: the best as a share of a full score, out of 1,000. */
export function leaguePoints(value, full) {
  const best = Number(value);
  if (!Number.isFinite(best) || best <= 0 || !(full > 0)) return 0;
  return Math.round(1000 * Math.min(1, best / full));
}

/**
 * Every player with a Pokémon score, best total first. Ties share a rank and
 * list A to Z. Each player carries { handle, key, total, rank, events } where
 * events[id] = { value, points }.
 */
export function leagueStandings(rows, events = LEAGUE_EVENTS) {
  const byId = new Map(events.map(event => [event.id, event]));
  const players = new Map();
  for (const row of rows || []) {
    const event = byId.get(row.game);
    const handle = String(row.handle || '').trim();
    const value = Number(row.value);
    if (!event || !handle || !Number.isFinite(value) || value <= 0) continue;
    const key = handle.toLowerCase();
    if (!players.has(key)) players.set(key, { key, handle, total: 0, rank: 0, events: {} });
    const player = players.get(key);
    const held = player.events[event.id];
    if (!held || value > held.value) {
      const best = Math.round(1000 * Math.min(1, value / event.full));
      player.events[event.id] = { value, points: best };
    }
  }
  for (const player of players.values()) player.total = Object.values(player.events).reduce((sum, event) => sum + event.points, 0);
  const list = [...players.values()].filter(player => player.total > 0);
  list.sort((a, b) => b.total - a.total || a.handle.localeCompare(b.handle));
  let rank = 0;
  let previous = null;
  list.forEach((player, index) => {
    if (player.total !== previous) rank = index + 1;
    previous = player.total;
    player.rank = rank;
  });
  return list;
}
