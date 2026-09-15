/* ============================================================
 * src/services/squadService.js — 阵容数据解析
 *
 * 前端获取阵容的唯一入口，优先级：
 *   1. 静态缓存 data/cachedSquads.json（构建脚本产物）
 *      —— 真实部署时永远命中这一层，浏览器不发任何外部请求
 *   2. 缓存未命中 → 返回「数据尚未生成」的缺省状态（squad: null）
 *
 * ⚠️ 设计原则：宁缺毋假。
 *    真实部署中缓存未命中时，页面必须留白，绝不能编造一套阵容。
 *    此前这里会自动兜底 generateMockSquad()，而该生成器使用真实球员名
 *    配随机分数，外观与真实数据无法区分，导致页面静默展示假分数
 *    （实测 GW4：伪造 94 分，真实 110 分）。
 *    Mock 现仅在显式演示模式下启用（VITE_DEMO_MOCK=true）。
 *
 * ── 缓存时效策略（关键）──
 *   构建产物给每条 squad 打了 status（见 scripts/build-fpl-cache.js）：
 *     settled —— 已结算，数据是终值，快照永久有效
 *     live    —— 进行中，得分仍在变化，需要持续跟进
 *     pending —— 尚未开赛
 *     mock    —— Mock 模式产物
 *   若缓存中所有轮次都已 settled（且覆盖最新已配置的周最佳轮次），
 *   则视为「终态」，一次加载后不再重复请求；
 *   只要还有 live / pending / 缺数据 / 无 status 的轮次，就按 TTL
 *   定期重新拉取静态缓存，让页面在结算过程中自动跟上。
 * ============================================================ */

import { generateMockSquad } from '../data/mockSquads.js';
import { formatStampBeijing } from '../utils/date.js';

// 注意：文件实际在 public/data/ 下，但运行时访问路径不带 public/ 前缀
const CACHE_URL = 'data/cachedSquads.json';

/** 存在未进入终态的轮次时，重新拉取静态缓存的间隔 */
export const LIVE_REFRESH_MS = 5 * 60 * 1000;

const KNOWN_STATUSES = new Set(['settled', 'live', 'pending', 'mock']);

/**
 * 演示模式开关，默认关闭。
 * 仅在本地演示需要示例数据时显式开启：VITE_DEMO_MOCK=true npm start
 */
export const DEMO_MOCK_ENABLED = import.meta.env?.VITE_DEMO_MOCK === 'true';

/** 是否已进入终态（无需再轮询跟进） */
export function isTerminalStatus(status) {
  return status === 'settled' || status === 'mock';
}

/** 归一化 status 字段；缺失或未知一律视为 unknown（触发轮询，可自愈） */
export function normalizeStatus(status, mode) {
  if (KNOWN_STATUSES.has(status)) return status;
  // 兼容旧版缓存：无 status 字段但 _mode 为 real
  return 'unknown';
}

/* ---------- 缓存状态（带 TTL，替代此前的永久 memoize） ---------- */
let cacheState = { loaded: false, data: null, expiresAt: 0, inflight: null };

/**
 * 判断缓存是否已进入终态：
 * 所有轮次都已 settled，且覆盖了最新已配置的周最佳轮次。
 * 终态下 expiresAt 置为 Infinity，整页生命周期内不再重复请求。
 */
function isTerminalCache(data, latestWinnerGameweek) {
  if (!data || !data.squads.length) return false;
  if (!data.squads.every((s) => isTerminalStatus(normalizeStatus(s.status)))) return false;
  if (latestWinnerGameweek != null) {
    return data.squads.some((s) => s.gameweek === latestWinnerGameweek);
  }
  return true;
}

/**
 * 读取全部已缓存的阵容。
 *
 * @param {object}  [opts]
 * @param {number}  [opts.latestWinnerGameweek] 已配置的最新周最佳轮次，
 *        用于判断缓存是否已完整覆盖（未覆盖则持续跟进）
 * @param {boolean} [opts.force] 忽略 TTL 立即重新拉取
 * @returns {Promise<{squads:Array, mode:string, generatedAt:string|null, failures:Array}|null>}
 */
export async function loadCachedSquads({ latestWinnerGameweek = null, force = false } = {}) {
  const now = Date.now();

  // 已加载过且在有效期内 → 直接复用
  if (!force && cacheState.loaded && cacheState.expiresAt > now) return cacheState.data;
  // 并发去重：同一时刻只允许一个请求在飞
  if (cacheState.inflight) return cacheState.inflight;

  cacheState.inflight = (async () => {
    try {
      const res = await fetch(CACHE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      const data = {
        squads: Array.isArray(raw.squads) ? raw.squads : [],
        // _mode: 'real' 表示构建脚本按配置 fplId 从 FPL 官方 API 拉取的真实数据
        mode: raw._mode === 'real' ? 'real' : 'mock',
        generatedAt: raw._generatedAt ?? null,
        failures: Array.isArray(raw._failures) ? raw._failures : [],
      };
      cacheState.data = data;
      cacheState.expiresAt = isTerminalCache(data, latestWinnerGameweek)
        ? Number.POSITIVE_INFINITY
        : Date.now() + LIVE_REFRESH_MS;
      return data;
    } catch (err) {
      console.warn(`[squadService] ${CACHE_URL} 不可读（${err.message}）`);
      // 拉取失败：保留上一次可用数据，并在 TTL 之后再试，避免反复重试
      cacheState.expiresAt = Date.now() + LIVE_REFRESH_MS;
      return cacheState.data;
    } finally {
      cacheState.inflight = null;
      cacheState.loaded = true;
    }
  })();

  return cacheState.inflight;
}

/** 仅用于测试 / 强制重载场景，重置内存缓存 */
export function resetCacheState() {
  cacheState = { loaded: false, data: null, expiresAt: 0, inflight: null };
}

/** 生成数据来源 / 时效标注 */
export function buildSourceLabel(status, fetchedAt) {
  switch (status) {
    case 'settled':
      return '数据来源：FPL 官方 API · 本轮已结算';
    case 'live': {
      const when = fetchedAt ? formatStampBeijing(new Date(fetchedAt)) : null;
      return when ? `数据来源：FPL 官方 API · 结算中，数据更新于 ${when}` : '数据来源：FPL 官方 API · 结算中';
    }
    case 'pending':
      return '本轮尚未开赛，球员得分均为 0';
    case 'mock':
      return '数据来源：Mock 模拟（演示数据）';
    case 'missing':
      return '本轮数据尚未生成';
    default:
      return '数据来源：FPL 官方 API';
  }
}

/**
 * 解析某轮获奖者的阵容。
 * 返回 { squad, source, status, updatedAt, label }。
 *
 * squad 为 null 时表示「该轮数据尚不可用」，调用方应渲染缺省空状态，
 * **不得用其他数据顶替**。
 *
 * 说明：浏览器不能直连 FPL API（官方未开放 CORS，已实测），
 * 所以真实数据由构建脚本按配置 fplId 拉取后写入缓存
 * （npm run build:cache:real 或 GitHub Actions），前端只读缓存。
 */
export async function resolveSquad(gameweek, fplId, opts = {}) {
  const cached = await loadCachedSquads(opts);
  const hit = cached?.squads.find((s) => s.gameweek === gameweek && s.fplId === fplId);

  if (hit) {
    const status = normalizeStatus(hit.status, cached.mode);
    return {
      squad: hit,
      source: 'cache',
      status,
      updatedAt: hit.fetchedAt ?? cached.generatedAt,
      label: buildSourceLabel(status, hit.fetchedAt),
    };
  }

  // 演示模式：仅当显式开启时才用 Mock 填充，避免真实部署中伪造数据
  if (DEMO_MOCK_ENABLED) {
    const squad = await mockFetchSquadByFplId(fplId, gameweek);
    return {
      squad,
      source: 'mock',
      status: 'mock',
      updatedAt: null,
      label: '数据来源：Mock 模拟（演示模式 VITE_DEMO_MOCK=true）',
    };
  }

  return {
    squad: null,
    source: 'missing',
    status: 'missing',
    updatedAt: cached?.generatedAt ?? null,
    label: buildSourceLabel('missing'),
  };
}

/**
 * 模拟「向 FPL 数据源获取阵容」的流程，仅供演示模式使用。
 * 真实实现中这一步由构建脚本完成，前端不再自动兜底。
 */
function mockFetchSquadByFplId(fplId, gameweek) {
  return new Promise((resolve) => {
    // 模拟网络延迟，方便观察加载态
    setTimeout(() => {
      console.log(`[demo-mock] 获取 GW${gameweek} fplId=${fplId} 的演示阵容（真实数据由 scripts/build-fpl-cache.js 生成）`);
      resolve(generateMockSquad(fplId, gameweek));
    }, 400);
  });
}
