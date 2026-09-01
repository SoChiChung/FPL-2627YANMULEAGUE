/* ============================================================
 * src/services/predictionService.js — 竞猜排行榜总榜（自动计算）
 *
 * config.json 里只维护「原始竞猜记录」predictionLeaderboard.entries
 * （一条记录 = 一次获奖），总榜由本模块在运行时汇总生成，
 * 不手工维护重复的排名数组，计算结果也不写回配置文件。
 *
 * 排序规则：
 *   1. 累计获奖金额从高到低
 *   2. 金额相同 → 获奖次数多者优先
 *   3. 仍相同 → 按配置文件中的原始顺序（稳定排序）
 * ============================================================ */

/**
 * 由原始竞猜记录计算竞猜总榜。
 * @param {object} config 主配置
 * @returns {{ pool: number, entries: Array<{
 *   username, totalPrize, wins, prediction, avatarBaseName, firstIndex
 * }> }}
 */
export function getLeaderboardData(config) {
  const lb = config.predictionLeaderboard || {};
  const raw = lb.entries || [];

  // 聚合：按用户累计金额 / 次数
  const byUser = new Map();
  raw.forEach((record, index) => {
    const username = record.username || `玩家${index + 1}`;
    const agg = byUser.get(username) || {
      username,
      totalPrize: 0,
      wins: 0,
      prediction: null,
      avatarBaseName: null,
      firstIndex: index, // 配置原始顺序，用于稳定排序
    };
    agg.totalPrize += Number(record.prize) || 0;
    agg.wins += 1;
    if (!agg.prediction && record.prediction) agg.prediction = record.prediction;
    if (!agg.avatarBaseName && record.awardImageBaseName) agg.avatarBaseName = record.awardImageBaseName;
    byUser.set(username, agg);
  });

  const entries = [...byUser.values()].sort(
    (a, b) =>
      b.totalPrize - a.totalPrize || // 金额高者优先
      b.wins - a.wins || // 次数多者优先
      a.firstIndex - b.firstIndex, // 配置原始顺序
  );

  return { pool: lb.totalPrizePool ?? 0, entries };
}

/**
 * 竞猜排行榜头像复用 Picks 3 头像：
 * 优先按用户名在 picks3WeeklyWinners 中匹配 avatarBaseName，
 * 否则用该用户竞猜记录自带的 awardImageBaseName；
 * 都没有时返回 null，由调用方显示默认占位（不会请求不存在的路径）。
 */
export function resolveLeaderboardAvatarBaseName(config, entry) {
  const picks3 = (config.picks3WeeklyWinners || []).find(
    (w) => w.winnerName === entry.username,
  );
  return picks3?.avatarBaseName || entry.avatarBaseName || null;
}
