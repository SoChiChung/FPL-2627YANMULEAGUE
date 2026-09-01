/* ============================================================
 * src/components/Header.js — 顶部 Header：联赛信息 + GW 倒计时
 * 时间一律按北京时间显示（见 utils/date.js）。
 * ============================================================ */

import { formatDateTimeBeijing } from '../utils/date.js';
import { formatCountdown, getCountdownParts } from '../utils/countdown.js';

/**
 * 渲染 Header 全部内容。
 * @param {object} els 页面元素引用 { leagueName, leagueSeason, gwNumber, gwStatus, gwDeadlineLine, gwCountdown }
 * @param {object} state { league, gwState }
 */
export function renderHeader(els, { league, gwState }) {
  els.leagueName.textContent = league.name;
  els.leagueSeason.textContent = `${league.season} 赛季`;

  els.gwNumber.textContent = `GW${gwState.gameweek}`;
  els.gwStatus.textContent = gwState.statusLabel;
  els.gwStatus.dataset.key = gwState.statusKey;

  const target = gwState.countdownTarget;
  if (!target) {
    els.gwDeadlineLine.textContent = `GW${gwState.gameweek} Deadline：${formatDateTimeBeijing(gwState.deadline)}（赛季结束）`;
    els.gwCountdown.textContent = '赛季已完成';
    return;
  }

  // 例：GW2 已结束 · 距 GW3 Deadline：2026-09-05 01:30（北京时间）
  const prefix = gwState.previous ? `GW${gwState.previous.gameweek} 已结束 · ` : '';
  els.gwDeadlineLine.textContent =
    `${prefix}距 GW${target.gameweek} Deadline：${formatDateTimeBeijing(target.deadline)}（北京时间）`;

  updateCountdownText(els.gwCountdown, gwState);
}

/** 每秒更新倒计时数字（由 main.js 的 interval 调用） */
export function updateCountdownText(el, gwState) {
  const target = gwState.countdownTarget;
  if (target) el.textContent = formatCountdown(getCountdownParts(target.deadline.getTime()));
}
