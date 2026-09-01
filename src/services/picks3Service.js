/* ============================================================
 * src/services/picks3Service.js — Picks 3 累计奖池逻辑
 *
 * 规则（从 GW1 开始逐轮推进）：
 *   · 每轮基础增加 basePrizePerWeek（默认 5 元）
 *   · 该轮无人猜中 → 奖池继续累计
 *   · 该轮有人猜中 → 获奖者获得“当前累计奖池”，奖池清空归零
 *   · 下一轮重新开始累计
 *
 * 示例（base = 5，GW2 有人获奖）：
 *   GW1：+5 → 奖池 5（无人获奖）
 *   GW2：+5 → 奖池 10 → 获奖者拿 10，奖池归零
 *   GW3：+5 → 奖池 5（无人获奖）……
 * ============================================================ */

/**
 * 计算逐轮奖池状态。
 * @param {Array} gameweeks 参与计算的轮次（通常只传“已开奖”的轮次）
 * @param {Array} winners picks3WeeklyWinners 配置
 * @param {number} basePrizePerWeek 每轮基础增加金额
 * @returns {Array<{gameweek, added, hasWinner, winnerName, payout, poolAfter}>}
 *   added    本轮新增金额
 *   hasWinner 本轮是否有人获奖
 *   payout   获奖者获得的金额（无人获奖时为 0）
 *   poolAfter 本轮结算后的累计奖池
 */
export function calculatePicks3PrizePool(gameweeks, winners, basePrizePerWeek = 5) {
  const winnerByGw = new Map((winners || []).map((w) => [w.gameweek, w]));
  let pool = 0;

  return gameweeks.map((gw) => {
    pool += basePrizePerWeek;
    const winner = winnerByGw.get(gw.gameweek) || null;
    const payout = winner ? pool : 0;
    if (winner) pool = 0;
    return {
      gameweek: gw.gameweek,
      added: basePrizePerWeek,
      hasWinner: !!winner,
      winnerName: winner ? winner.winnerName : null,
      payout,
      poolAfter: pool,
    };
  });
}

/** 取最新一轮结算后的累计奖池 */
export function getPicks3CurrentPool(rows) {
  return rows.length ? rows[rows.length - 1].poolAfter : 0;
}
