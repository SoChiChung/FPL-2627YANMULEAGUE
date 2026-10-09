/* ============================================================
 * src/services/leagueStandingsService.js — Classic 联赛分数排名
 *
 * GitHub Pages 没有后端，且 FPL standings API 当前没有 CORS 头。
 * 因此前端优先读取 scripts/build-league-standings.js 生成的
 * data/leagueStandings.json；缓存缺失时再尝试直连 FPL API。
 *
 * ⚠️ 宁缺毋假：两条路径都拿不到数据时返回空榜（页面显示「暂无排名数据」），
 *    绝不返回任何虚构的队伍与分数。此前的 MOCK_RESULTS 硬编码假榜单已删除。
 * ============================================================ */

const DEFAULT_LEAGUE_ID = 12968;
const CACHE_URL = 'data/leagueStandings.json';
const FPL_BASE = 'https://fantasy.premierleague.com/api';
const PAGE_LIMIT = 50;

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

  // 无数据：返回空榜，由页面渲染「暂无排名数据」空状态
  return buildStandingsView([], {
    leagueId,
    leagueName: config?.league?.name || '',
    source: 'data/leagueStandings.json（尚未生成）',
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
