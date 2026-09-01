/* ============================================================
 * src/services/leagueStandingsService.js — Classic 联赛分数排名
 *
 * GitHub Pages 没有后端，且 FPL standings API 当前没有 CORS 头。
 * 因此前端优先读取 scripts/build-league-standings.js 生成的
 * data/leagueStandings.json；缓存缺失时再尝试直连 FPL API，仍失败
 * 则使用 Mock，保证页面可展示。
 * ============================================================ */

const DEFAULT_LEAGUE_ID = 12968;
const CACHE_URL = 'data/leagueStandings.json';
const FPL_BASE = 'https://fantasy.premierleague.com/api';
const PAGE_LIMIT = 50;

const MOCK_RESULTS = [
  { entry: 22535, entry_name: 'BaBaXi', player_name: 'Xi Yang', event_total: 135, total: 206, rank: 1, last_rank: 46 },
  { entry: 1440306, entry_name: 'Isaac FC', player_name: 'Isaac Greyson', event_total: 121, total: 198, rank: 2, last_rank: 8 },
  { entry: 18092, entry_name: 'Sunny Smoke', player_name: 'Classic Winner', event_total: 116, total: 191, rank: 3, last_rank: 12 },
  { entry: 73188, entry_name: 'Blue Hour', player_name: 'Ryyyy', event_total: 110, total: 183, rank: 4, last_rank: 4 },
  { entry: 90217, entry_name: 'GW Hunters', player_name: 'Demo Player', event_total: 108, total: 180, rank: 5, last_rank: 6 },
  { entry: 32019, entry_name: 'Chain FC', player_name: 'Mock A', event_total: 104, total: 176, rank: 6, last_rank: 9 },
  { entry: 56233, entry_name: 'Navy Press', player_name: 'Mock B', event_total: 101, total: 172, rank: 7, last_rank: 3 },
  { entry: 88001, entry_name: 'Halftone XI', player_name: 'Mock C', event_total: 99, total: 170, rank: 8, last_rank: 11 },
  { entry: 45772, entry_name: 'Smoke Screen', player_name: 'Mock D', event_total: 97, total: 168, rank: 9, last_rank: 7 },
  { entry: 67554, entry_name: 'Diamond City', player_name: 'Mock E', event_total: 96, total: 166, rank: 10, last_rank: 10 },
];

export async function loadLeagueStandings(config) {
  const leagueId = config?.league?.classicLeagueId || DEFAULT_LEAGUE_ID;

  const cached = await tryLoadCache();
  if (cached?.results?.length) {
    return buildStandingsView(cached.results, {
      leagueId: cached.league?.id || leagueId,
      leagueName: cached.league?.name || config?.league?.name || '',
      source: cached.source || 'data/leagueStandings.json',
      updatedAt: cached.updatedAt,
    });
  }

  const live = await tryFetchLiveLeague(leagueId);
  if (live?.results?.length) {
    return buildStandingsView(live.results, {
      leagueId,
      leagueName: live.league?.name || config?.league?.name || '',
      source: 'FPL API live',
      updatedAt: new Date().toISOString(),
    });
  }

  return buildStandingsView(MOCK_RESULTS, {
    leagueId,
    leagueName: config?.league?.name || '',
    source: 'Mock standings',
    updatedAt: null,
  });
}

async function tryLoadCache() {
  try {
    const res = await fetch(CACHE_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    return res.json();
  } catch (err) {
    console.warn('[leagueStandingsService] standings cache unavailable:', err);
    return null;
  }
}

async function tryFetchLiveLeague(leagueId) {
  try {
    const results = [];
    let league = null;

    for (let page = 1; page <= PAGE_LIMIT; page += 1) {
      const url = `${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}`;
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      league = league || data.league;
      results.push(...(data.standings?.results || []));
      if (!data.standings?.has_next) break;
    }

    return { league, results };
  } catch (err) {
    console.warn('[leagueStandingsService] FPL live standings unavailable:', err);
    return null;
  }
}

function buildStandingsView(results, meta) {
  const normalized = results.map(normalizeEntry).filter(Boolean);
  return {
    meta,
    eventTop10: rankAndLimit(normalized, 'eventTotal'),
    totalTop10: rankAndLimit(normalized, 'total'),
  };
}

function normalizeEntry(row) {
  if (!row) return null;
  return {
    entry: row.entry,
    entryName: row.entry_name || row.entryName || 'Unknown Team',
    playerName: row.player_name || row.playerName || '',
    eventTotal: Number(row.event_total ?? row.eventTotal ?? 0),
    total: Number(row.total ?? 0),
    rank: Number(row.rank ?? 0),
    lastRank: Number(row.last_rank ?? row.lastRank ?? 0),
  };
}

function rankAndLimit(entries, scoreKey) {
  const sorted = [...entries]
    .sort((a, b) => (b[scoreKey] - a[scoreKey]) || (b.total - a.total) || a.entryName.localeCompare(b.entryName, 'zh-Hans-CN'))
    .slice(0, 10);

  let displayRank = 0;
  let lastScore = null;
  return sorted.map((entry, index) => {
    if (entry[scoreKey] !== lastScore) {
      displayRank = index + 1;
      lastScore = entry[scoreKey];
    }
    return { ...entry, displayRank };
  });
}
