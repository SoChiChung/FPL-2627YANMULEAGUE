/* ============================================================
 * src/components/PredictionLeaderboard.js — 竞猜排行榜
 * 数据经 predictionService 排序（按奖金从高到低）。
 * 字段容错：prediction / avatar 缺失时展示占位，不撑破布局。
 * ============================================================ */

import { bindAvatarFallback, makeAvatarFallback } from '../utils/image.js';
import { formatNumber } from '../utils/date.js';
import { getLeaderboardData } from '../services/predictionService.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function lbRow(entry, index) {
  const rankClass = index < 3 ? ` r${index + 1}` : '';
  const prediction = entry.prediction
    ? escapeHtml(entry.prediction)
    : '<span class="lb-pred-missing">竞猜内容待补充</span>';

  const avatar = entry.avatar
    ? `<img class="avatar avatar-sm" src="${escapeHtml(entry.avatar)}"
         alt="${escapeHtml(entry.username)}" data-name="${escapeHtml(entry.username)}" loading="lazy" />`
    : makeAvatarFallbackHtml(entry.username);

  return `
    <li class="lb-item">
      <span class="lb-rank${rankClass}">${index + 1}</span>
      ${avatar}
      <div class="lb-meta">
        <div class="lb-name">${escapeHtml(entry.username)}</div>
        <div class="lb-pred">${prediction}</div>
      </div>
      <span class="lb-prize">¥${formatNumber(entry.prize)}</span>
    </li>`;
}

function makeAvatarFallbackHtml(name) {
  return `<span class="avatar avatar-sm avatar-fallback">${escapeHtml((name || '?').trim().charAt(0) || '?')}</span>`;
}

/**
 * @param {HTMLElement} container #leaderboardView
 * @param {HTMLElement} prizeEl 奖池金额元素
 * @param {object} config 主配置
 */
export function renderPredictionLeaderboard(container, prizeEl, config) {
  const { pool, entries } = getLeaderboardData(config);
  prizeEl.textContent = `¥${formatNumber(pool)}`;

  if (!entries.length) {
    container.innerHTML = `
      <div class="empty-state">
        <p class="empty-title">暂无竞猜数据</p>
        <p>竞猜开启后由后台配置展示</p>
      </div>`;
    return;
  }

  container.innerHTML = `<ol class="leaderboard">${entries.map(lbRow).join('')}</ol>`;
  bindAvatarFallback(container);
}
