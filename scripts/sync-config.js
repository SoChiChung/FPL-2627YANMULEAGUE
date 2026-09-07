#!/usr/bin/env node
/* ============================================================
 * scripts/sync-config.js — 主配置自动派生字段同步
 *
 * 目标：让管理员只需维护「每轮获奖者」这类源数据，其余派生字段
 * 由本脚本自动计算并写回 public/config.json，省去手工算账。
 *
 * 自动更新的字段：
 *   1. picks3PrizePool.currentGameweek
 *      —— 从 classicWinners / picks3WeeklyWinners 已配置获奖者的
 *         最大轮次推断（即「已结算到第几轮」）。
 *   2. predictionLeaderboard.entries
 *      —— 从 picks3WeeklyWinners 自动生成（每轮获奖者 → 一条竞猜记录），
 *         每条 prize 由 Picks 3 累计奖池规则（calculatePicks3PrizePool）
 *         自动算出，无需手工填金额。
 *
 * 不动的字段：league / gameweeks / classicWinners / picks3WeeklyWinners /
 *            predictionLeaderboard.totalPrizePool（语义为奖池总额，保留手工值）。
 *
 * 用法：
 *   node scripts/sync-config.js        # 单独运行
 *   npm run build                      # 已集成到构建流程（先 sync 再 vite build）
 * ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { calculatePicks3PrizePool } from '../src/services/picks3Service.js';

const CONFIG_PATH = 'public/config.json';

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const changed = [];

  // 1) 自动计算 currentGameweek：已配置获奖者（周最佳 + Pick 3）的最大轮次
  const winnerGws = [
    ...(config.classicWinners || []).map((w) => w.gameweek),
    ...(config.picks3WeeklyWinners || []).map((w) => w.gameweek),
  ];
  const currentGameweek = winnerGws.length ? Math.max(...winnerGws) : 0;

  const poolCfg = config.picks3PrizePool || {};
  const prevCurrent = poolCfg.currentGameweek;
  if (currentGameweek !== prevCurrent) {
    poolCfg.currentGameweek = currentGameweek;
    config.picks3PrizePool = poolCfg;
    changed.push(`currentGameweek ${prevCurrent} → ${currentGameweek}`);
  }

  // 2) 从 picks3WeeklyWinners 自动生成 predictionLeaderboard.entries
  const base = poolCfg.basePrizePerWeek ?? 5;
  const settledGws = (config.gameweeks || []).filter((g) => g.gameweek <= currentGameweek);
  const rows = calculatePicks3PrizePool(settledGws, config.picks3WeeklyWinners || [], base);
  const payoutByGw = new Map(rows.filter((r) => r.hasWinner).map((r) => [r.gameweek, r.payout]));

  const entries = (config.picks3WeeklyWinners || []).map((w) => ({
    username: w.winnerName,
    awardImageBaseName: w.avatarBaseName,
    prediction: 'pick3获奖',
    prize: payoutByGw.get(w.gameweek) ?? Number(w.prize) ?? 0,
  }));

  const lb = config.predictionLeaderboard || {};
  lb.entries = entries;
  config.predictionLeaderboard = lb;
  changed.push(`predictionLeaderboard.entries 生成 ${entries.length} 条`);

  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
  console.log(`[sync-config] 已更新 ${CONFIG_PATH}`);
  for (const msg of changed) console.log(`  · ${msg}`);
  if (!changed.length) console.log('  · 无变化（字段已是最新）');
}

main().catch((err) => {
  console.error('[sync-config] 同步失败：', err);
  process.exit(1);
});
