/* ============================================================
 * src/components/PredictionLeaderboard.js — 竞猜排行榜总榜
 *
 * 总榜由 predictionService 从原始竞猜记录自动汇总排序（见其注释），
 * 前端只负责展示计算结果。
 * 头像统一复用 Picks 3 Weekly Winner 的头像
 * （public/assets/pick3weeklywinner/，按 baseName 匹配扩展名）；
 * 匹配不到时显示名字首字占位，不请求不存在的路径。
 * ============================================================ */

import { ASSET_DIRS, resolveImageByBaseName, makeAvatarFallback } from '../utils/image.js';
import { formatNumber } from '../utils/date.js';
import { getLeaderboardData, resolveLeaderboardAvatarBaseName } from '../services/predictionService.js';

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
  const subline = entry.wins > 1
    ? `获奖 ${entry.wins} 次`
    : (entry.prediction || '竞猜获奖');

  return `
    <li class="lb-item">
      <span class="lb-rank${rankClass}">${index + 1}</span>
      <span class="lb-avatar" data-base="${escapeHtml(entry.avatarBaseName || '')}" data-name="${escapeHtml(entry.username)}"></span>
      <div class="lb-meta">
        <div class="lb-name">${escapeHtml(entry.username)}</div>
        <div class="lb-pred">${escapeHtml(subline)}</div>
      </div>
      <span class="lb-prize">¥${formatNumber(entry.totalPrize)}</span>
    </li>`;
}

/**
 * @param {HTMLElement} container #leaderboardView
 * @param {HTMLElement} prizeEl 奖池金额元素
 * @param {object} config 主配置
 */
export async function renderPredictionLeaderboard(container, prizeEl, config) {
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

  // 头像复用 Picks 3：用户名匹配优先，其次记录自带 baseName
  container.querySelectorAll('.lb-avatar[data-base]').forEach(async (el) => {
    const username = el.dataset.name || '';
    const entry = entries.find((e) => e.username === username) || {};
    const baseName = resolveLeaderboardAvatarBaseName(config, entry);
    const url = await resolveImageByBaseName(ASSET_DIRS.picks3Winner, baseName);
    if (url) {
      const img = document.createElement('img');
      img.className = 'avatar avatar-sm';
      img.src = url;
      img.alt = username;
      img.loading = 'lazy';
      img.addEventListener('error', () => img.replaceWith(makeAvatarFallback(username, 'avatar-sm')), { once: true });
      el.replaceWith(img);
    } else {
      el.replaceWith(makeAvatarFallback(username, 'avatar-sm'));
    }
  });
}
