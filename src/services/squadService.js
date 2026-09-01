/* ============================================================
 * src/services/squadService.js — 阵容数据解析
 *
 * 前端获取阵容的唯一入口，优先级：
 *   1. 静态缓存 data/cachedSquads.json（构建脚本产物）
 *      —— 真实部署时永远命中这一层，浏览器不发任何外部请求
 *   2. Mock 生成（缓存文件缺失 / 该轮尚未被构建脚本缓存时兜底）
 *
 * 真实流程（见 scripts/build-fpl-cache.js）：
 *   后台脚本 / GitHub Actions 每轮 Deadline 后调 FPL API，
 *   把结果写入 cachedSquads.json 并提交，前端只读缓存。
 * ============================================================ */

import { generateMockSquad } from '../data/mockSquads.js';

// 注意：文件实际在 public/data/ 下，但运行时访问路径不带 public/ 前缀
const CACHE_URL = 'data/cachedSquads.json';

let cachedSquadsPromise = null;

/** 读取全部已缓存的阵容（只请求一次，结果复用）。返回 { squads, mode } */
export async function loadCachedSquads() {
  if (!cachedSquadsPromise) {
    cachedSquadsPromise = (async () => {
      try {
        const res = await fetch(CACHE_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return {
          squads: Array.isArray(data.squads) ? data.squads : [],
          // _mode: 'real' 表示构建脚本按配置 fplId 从 FPL 官方 API 拉取的真实数据
          mode: data._mode === 'real' ? 'real' : 'mock',
        };
      } catch (err) {
        console.warn(`[squadService] ${CACHE_URL} 不可读（${err.message}），使用 Mock 阵容兜底`);
        return null;
      }
    })();
  }
  return cachedSquadsPromise;
}

/**
 * 解析某轮获奖者的阵容。
 * 返回 { squad, source: 'cache' | 'mock', label }。
 * 说明：浏览器不能直连 FPL API（官方未开放 CORS，已实测），
 * 所以真实数据由构建脚本按配置 fplId 拉取后写入缓存
 * （npm run build:cache:real 或 GitHub Actions），前端只读缓存。
 */
export async function resolveSquad(gameweek, fplId) {
  const cached = await loadCachedSquads();
  const hit = cached?.squads.find((s) => s.gameweek === gameweek && s.fplId === fplId);
  if (hit) {
    const label = cached.mode === 'real'
      ? `数据来源：FPL 官方 API（按配置 fplId=${fplId} 生成，构建脚本拉取）`
      : '数据来源：静态缓存（演示数据）';
    return { squad: hit, source: 'cache', label };
  }
  const squad = await mockFetchSquadByFplId(fplId, gameweek);
  return { squad, source: 'mock', label: '数据来源：Mock 模拟（构建脚本尚未缓存该轮）' };
}

/**
 * 模拟“向 FPL 数据源获取阵容”的流程。
 * 真实实现中这一步由构建脚本完成；前端保留此兜底，
 * 保证新增获奖者后即使缓存未生成，页面也有可展示的内容。
 */
function mockFetchSquadByFplId(fplId, gameweek) {
  return new Promise((resolve) => {
    // 模拟网络延迟，方便观察加载态
    setTimeout(() => {
      console.log(`[mock] 获取 GW${gameweek} fplId=${fplId} 的阵容（真实流程由 scripts/build-fpl-cache.js 生成缓存）`);
      resolve(generateMockSquad(fplId, gameweek));
    }, 400);
  });
}
