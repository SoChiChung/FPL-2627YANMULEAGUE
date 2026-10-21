/* ============================================================
 * src/services/managerStatsService.js — 队长 / 转会统计
 *
 * 数据来自 scripts/build-manager-stats.js 生成的
 * data/managerStats.json（构建产物，随仓库提交）。
 * 浏览器不发任何外部请求（FPL API 无 CORS，实测确认）。
 *
 * ⚠️ 宁缺毋假：缓存缺失时返回 null，由页面渲染空状态，
 *    绝不返回任何虚构的球员或次数。
 * ============================================================ */

const CACHE_URL = 'data/managerStats.json';

/** 缓存有效期：统计内容仅在新轮次开始时变化，但产物由 CI 滚动更新 */
const TTL_MS = 5 * 60 * 1000;

let cacheState = { loaded: false, data: null, expiresAt: 0, inflight: null };

/**
 * 加载统计缓存。
 * @param {boolean} [force] 忽略 TTL 立即重新拉取
 * @returns {Promise<object|null>} 统计对象；缺失时返回 null
 */
export async function loadManagerStats({ force = false } = {}) {
  const now = Date.now();

  if (!force && cacheState.loaded && cacheState.expiresAt > now) return cacheState.data;
  if (cacheState.inflight) return cacheState.inflight;

  cacheState.inflight = (async () => {
    try {
      const res = await fetch(CACHE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();

      const gameweek = Number(raw.gameweek);
      if (!Number.isFinite(gameweek)) throw new Error('缺少 gameweek 字段');

      const data = {
        gameweek,
        previousGameweek: Number.isFinite(Number(raw.previousGameweek))
          ? Number(raw.previousGameweek)
          : null,
        participantCount: Number(raw.participantCount ?? 0),
        generatedAt: raw._generatedAt ?? null,
        stats: {
          transfersIn: normalizeList(raw.stats?.transfersIn),
          transfersOut: normalizeList(raw.stats?.transfersOut),
          captains: normalizeList(raw.stats?.captains),
        },
      };

      cacheState.data = data;
      cacheState.expiresAt = now + TTL_MS;
      return data;
    } catch (err) {
      console.warn(`[managerStatsService] ${CACHE_URL} 不可读（${err.message}）`);
      cacheState.expiresAt = now + TTL_MS;
      return cacheState.data;
    } finally {
      cacheState.inflight = null;
      cacheState.loaded = true;
    }
  })();

  return cacheState.inflight;
}

function normalizeList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((row) => row && typeof row === 'object')
    .map((row) => ({
      id: Number(row.id),
      name: String(row.name ?? ''),
      club: String(row.club ?? ''),
      position: String(row.position ?? ''),
      count: Number(row.count ?? 0),
    }))
    .filter((row) => row.name && row.count > 0);
}

/** 仅用于测试 / 强制重载场景，重置内存缓存 */
export function resetManagerStatsCache() {
  cacheState = { loaded: false, data: null, expiresAt: 0, inflight: null };
}
