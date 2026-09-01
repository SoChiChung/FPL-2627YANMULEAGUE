/* ============================================================
 * src/services/predictionService.js — 竞猜排行榜数据
 * 从 config 读取排行榜，按奖金从高到低排序。
 * ============================================================ */

export function getLeaderboardData(config) {
  const lb = config.predictionLeaderboard || {};
  const entries = [...(lb.entries || [])].sort((a, b) => b.prize - a.prize);
  return { pool: lb.totalPrizePool ?? 0, entries };
}
