/* ============================================================
 * src/services/fplApiClient.js — FPL 官方 API 客户端
 *
 * ⚠️ 仅供“构建期脚本”使用（Node.js ≥ 18，内置 fetch）。
 *    不要在浏览器里调用：已实测 FPL API 响应不含
 *    Access-Control-Allow-Origin（且带 cross-origin-resource-policy:
 *    same-origin），浏览器跨域请求会被拦截。
 *    浏览器端一律读取 data/cachedSquads.json 静态缓存
 *    （由构建脚本按配置 fplId 从本客户端拉取真实数据生成）。
 *
 * 相关官方接口（已实测验证字段结构）：
 *   · bootstrap-static  https://fantasy.premierleague.com/api/bootstrap-static/
 *       elements[]: { id, web_name, element_type(1-4), team }
 *       element_types[]: { id, plural_name_short: GKP/DEF/MID/FWD }
 *       teams[]: { id, short_name: ARS/LIV/... }
 *   · entry picks       https://fantasy.premierleague.com/api/entry/<fplId>/event/<gw>/picks/
 *       entry_history: { points, ... }
 *       picks[]: { element, position(1-15), multiplier, is_captain, is_vice_captain }
 *   · event live        https://fantasy.premierleague.com/api/event/<gw>/live/
 *       elements[]: { id, stats: { total_points, ... } }
 *   · fixtures          https://fantasy.premierleague.com/api/fixtures/
 * ============================================================ */

const BASE = 'https://fantasy.premierleague.com/api';

async function getJson(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`FPL API ${path} → HTTP ${res.status}`);
  return res.json();
}

/** 赛季静态字典：球员 / 位置 / 球队 */
export async function fetchBootstrapStatic() {
  return getJson('/bootstrap-static/');
}

/** 某个 fplId 在某轮的选择（首发 / 替补 / 队长 / 副队长） */
export async function fetchEntryPicks(fplId, gameweek) {
  return getJson(`/entry/${fplId}/event/${gameweek}/picks/`);
}

/** 某轮所有球员的实时 / 结算得分 */
export async function fetchEventLive(gameweek) {
  return getJson(`/event/${gameweek}/live/`);
}

/** 赛季赛程（可用于未来同步真实 Deadline，替代 config.json 手工维护） */
export async function fetchFixtures() {
  return getJson('/fixtures/');
}

/**
 * 把 FPL API 原始响应整理成 cachedSquads.json 的 squad 结构。
 * 输入：bootstrap / picks / live 三个接口的原始 JSON。
 * 说明：
 *   · picks 接口的 position 反映的是“自动换人后”的最终阵容
 *     （替补顶入时 position ≤ 11），因此 bench 里通常是没上场的人
 *   · 球员得分 = live 的 total_points × multiplier（队长 ×2）
 */
export function transformPicksToSquad({ fplId, gameweek, bootstrap, picks, live }) {
  const elementTypes = new Map(bootstrap.element_types.map((t) => [t.id, t.plural_name_short]));
  const teams = new Map(bootstrap.teams.map((t) => [t.id, t.short_name]));
  const elements = new Map(bootstrap.elements.map((e) => [e.id, e]));
  // live 返回的是数组 [{ id, stats }]，转成 id → stats 的映射
  const liveStats = new Map(live.elements.map((e) => [e.id, e.stats]));

  const players = [];
  const bench = [];
  for (const pick of picks.picks) {
    const el = elements.get(pick.element);
    // FPL 位置缩写是 GKP，前端统一用 GK
    const position = (elementTypes.get(el?.element_type) ?? '?').replace('GKP', 'GK');
    const points = (liveStats.get(pick.element)?.total_points ?? 0) * pick.multiplier;
    const row = {
      name: el?.web_name ?? String(pick.element),
      position,
      club: teams.get(el?.team) ?? '',
      points,
      isCaptain: pick.is_captain || undefined,
      isViceCaptain: pick.is_vice_captain || undefined,
    };
    (pick.position <= 11 ? players : bench).push(row);
  }

  const captain = players.find((p) => p.isCaptain);
  const vice = players.find((p) => p.isViceCaptain);

  return {
    gameweek,
    fplId,
    totalPoints: picks.entry_history?.points ?? 0,
    captain: captain?.name ?? null,
    viceCaptain: vice?.name ?? null,
    players,
    bench,
  };
}
