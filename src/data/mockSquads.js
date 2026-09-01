/* ============================================================
 * src/data/mockSquads.js — Mock 阵容生成器（演示兜底）
 *
 * 用途：
 *   · 浏览器端：public/data/cachedSquads.json 未命中时生成占位阵容
 *   · 构建期：scripts/build-fpl-cache.js 的 Mock 模式（无需联网）
 *
 * 接入真实数据后：
 *   前端只读 scripts/build-fpl-cache.js --real 生成的缓存文件，
 *   本模块可作为本地演示兜底保留，也可删除。
 * ============================================================ */

/* Mock 数据池（接真实数据后整段可删） */
export const MOCK_POOL = {
  GK: ['Raya', 'Pickford', 'Vicario', 'Henderson'],
  DEF: ['Saliba', 'Gabriel', 'van Dijk', 'Alexander-Arnold', 'Gvardiol', 'Burn', 'Aina', 'Milenkovic'],
  MID: ['Salah', 'Saka', 'Palmer', 'Son', 'Mbeumo', 'Gordon', 'Rogers', 'Murphy'],
  FWD: ['Haaland', 'Isak', 'Watkins', 'Solanke'],
};

export const MOCK_CLUBS = {
  Raya: 'ARS', Pickford: 'EVE', Vicario: 'TOT', Henderson: 'CRY',
  Saliba: 'ARS', Gabriel: 'ARS', 'van Dijk': 'LIV', 'Alexander-Arnold': 'LIV',
  Gvardiol: 'MCI', Burn: 'NEW', Aina: 'NOT', Milenkovic: 'NOT',
  Salah: 'LIV', Saka: 'ARS', Palmer: 'CHE', Son: 'TOT',
  Mbeumo: 'BRE', Gordon: 'NEW', Rogers: 'AST', Murphy: 'NEW',
  Haaland: 'MCI', Isak: 'NEW', Watkins: 'AST', Solanke: 'TOT',
};

const MOCK_FORMATION = [['GK', 1], ['DEF', 4], ['MID', 4], ['FWD', 2]];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * 生成一份 squad 结构（与 fplApiClient.transformPicksToSquad 的输出结构一致）。
 * 使用确定性伪随机：同一 (fplId, gameweek) 永远生成同一份阵容，
 * 模拟“FPL 官方数据是稳定缓存”的效果。
 */
export function generateMockSquad(fplId, gameweek) {
  let seed = hashString(`${fplId}-${gameweek}`);
  const rand = () => (((seed = (seed * 1103515245 + 12345) >>> 0) % 1e9) / 1e9);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];

  // 保证首发 / 替补名单里没有重名
  const used = new Set();
  const pickUnique = (pool) => {
    let name = pick(pool);
    while (used.has(name)) name = pick(pool);
    used.add(name);
    return name;
  };

  const players = [];
  for (const [position, count] of MOCK_FORMATION) {
    for (let i = 0; i < count; i++) {
      const name = pickUnique(MOCK_POOL[position]);
      players.push({ name, position, club: MOCK_CLUBS[name], points: 2 + Math.floor(rand() * 12) });
    }
  }

  // 随机选队长 / 副队长；队长得分 ×2（FPL 规则）
  const captainIdx = Math.floor(rand() * players.length);
  const captain = players[captainIdx];
  captain.isCaptain = true;
  captain.points *= 2;

  const rest = players.filter((_, i) => i !== captainIdx);
  const vice = rest[Math.floor(rand() * rest.length)];
  vice.isViceCaptain = true;

  const bench = [];
  for (const [position, count] of [['GK', 1], ['DEF', 2], ['MID', 1]]) {
    for (let i = 0; i < count; i++) {
      const name = pickUnique(MOCK_POOL[position]);
      bench.push({ name, position, club: MOCK_CLUBS[name], points: Math.floor(rand() * 4) });
    }
  }

  const totalPoints = players.reduce((sum, p) => sum + p.points, 0) + bench.reduce((sum, p) => sum + p.points, 0);

  return { gameweek, fplId, totalPoints, captain: captain.name, viceCaptain: vice.name, players, bench };
}
