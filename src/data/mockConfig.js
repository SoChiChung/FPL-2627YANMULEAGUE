/* ============================================================
 * src/data/mockConfig.js — 演示配置（兜底）
 *
 * 与 public/config.json 结构一致，仅用于 config.json 读取失败时
 * 的兜底，保证页面在纯演示环境也能完整渲染。真实验收后可删除。
 * ⚠️ 修改 public/config.json 时请同步本文件。
 * ============================================================ */

// Mock 轮次：GW1-4 与真实 FPL API 同步（sync:gameweeks 输出），
// 之后按每周一次均匀排布（真实赛季有国际比赛日，以 API 为准）
const REAL_GAMEWEEKS = [
  { gameweek: 1, deadline: '2026-08-22T01:30:00+08:00' },
  { gameweek: 2, deadline: '2026-08-29T01:30:00+08:00' },
  { gameweek: 3, deadline: '2026-09-05T01:30:00+08:00' },
  { gameweek: 4, deadline: '2026-09-12T20:30:00+08:00' },
];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function buildGameweeks(count) {
  const gameweeks = [...REAL_GAMEWEEKS];
  const base = new Date(REAL_GAMEWEEKS[REAL_GAMEWEEKS.length - 1].deadline).getTime();
  for (let i = REAL_GAMEWEEKS.length + 1; i <= count; i++) {
    const iso = new Date(base + (i - REAL_GAMEWEEKS.length) * WEEK_MS).toISOString().replace('Z', '+08:00');
    gameweeks.push({ gameweek: i, deadline: iso });
  }
  return gameweeks;
}

export const mockConfig = {
  league: {
    name: '18岁的蓝在sunny时刻——26/27烟幕二群联赛',
    season: '2026/27',
    totalGameweeks: 38,
    classicLeagueId: 12968,
  },
  gameweeks: buildGameweeks(38),
  classicWinners: [
    {
      gameweek: 1,
      fplId: '18092',
      wechatName: ',',
      avatarBaseName: 'GW1',
      awardImageBaseName: 'GW1',
    },
    {
      gameweek: 2,
      fplId: '1440306',
      wechatName: 'IsáacGrëysõn',
      avatarBaseName: 'GW2',
      awardImageBaseName: 'GW2',
    },
  ],
  picks3WeeklyWinners: [
    {
      gameweek: 2,
      winnerName: 'Ryyyy',
      avatarBaseName: 'GW2',
      prize: 10,
    },
  ],
  picks3PrizePool: {
    basePrizePerWeek: 5,
    currentGameweek: 2,
  },
  predictionLeaderboard: {
    totalPrizePool: 190,
    // 原始竞猜记录（一条 = 一次获奖）；总榜由前端自动汇总排序
    entries: [
      {
        username: 'Ryyyy',
        awardImageBaseName: 'GW2',
        prediction: 'pick3获奖',
        prize: 10,
      },
    ],
  },
};
