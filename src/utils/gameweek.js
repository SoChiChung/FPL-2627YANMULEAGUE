/* ============================================================
 * src/utils/gameweek.js — 当前轮次解析
 *
 * Header 的徽标永远指向“下一个尚未到达 Deadline 的轮次”
 * （与 FPL App 一致：比赛中途它显示的是下一轮 DDL 倒计时）：
 *   - 现在 < GW1 Deadline          → 徽标 GW1，状态“未截止”
 *   - GWn Deadline ≤ 现在 < GW(n+1) Deadline
 *                                 → 徽标 GW(n+1)，状态“未截止”，
 *                                    previous 记录刚结束的 GWn
 *   - 现在 > GW38 Deadline         → 徽标 GW38，状态“已完成”
 * 倒计时永远指向徽标轮的 Deadline。
 *
 * 所有 deadline 先经 parseDeadline 转成绝对时间再比较（北京时间语义）。
 * 返回：{ gameweek, deadline, statusKey, statusLabel,
 *         previous: { gameweek, deadline } | null,
 *         countdownTarget: { gameweek, deadline } | null }
 * ============================================================ */

import { parseDeadline } from './date.js';

export function resolveCurrentGameweek(gameweeks, now) {
  const sorted = [...gameweeks].sort((a, b) => a.gameweek - b.gameweek);
  const last = sorted[sorted.length - 1];

  // 第一个尚未到期的 Deadline（其轮次即徽标轮）
  const upcoming = sorted.find((gw) => parseDeadline(gw.deadline) > now);

  if (!upcoming) {
    // 赛季已结束
    return {
      gameweek: last.gameweek,
      deadline: parseDeadline(last.deadline),
      statusKey: 'finished',
      statusLabel: '已完成',
      previous: null,
      countdownTarget: null,
    };
  }

  const upcomingDeadline = parseDeadline(upcoming.deadline);
  const previous = upcoming.gameweek === 1
    ? null
    : { gameweek: upcoming.gameweek - 1, deadline: parseDeadline(sorted[upcoming.gameweek - 2].deadline) };

  return {
    gameweek: upcoming.gameweek,
    deadline: upcomingDeadline,
    statusKey: 'pending',
    statusLabel: '未截止',
    previous,
    countdownTarget: { gameweek: upcoming.gameweek, deadline: upcomingDeadline },
  };
}
