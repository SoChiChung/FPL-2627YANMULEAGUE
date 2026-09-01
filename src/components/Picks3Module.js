/* ============================================================
 * src/components/Picks3Module.js — Picks 3 Weekly Winner
 *
 * 展示：累计奖池 + 按 GW 竖向排列的每轮记录。
 * 奖池规则见 src/services/picks3Service.js：
 *   每轮 +basePrizePerWeek，无人猜中则累计，
 *   猜中者拿走当前奖池并清零。
 *
 * 获奖者图片：resolveImageByBaseName(picks3Winner, avatarBaseName)
 * 扩展名不写死，匹配失败显示名字首字占位。
 * ============================================================ */

import { ASSET_DIRS, resolveImageByBaseName, makeAvatarFallback } from '../utils/image.js';
import { calculatePicks3PrizePool, getPicks3CurrentPool } from '../services/picks3Service.js';
import { formatNumber } from '../utils/date.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/**
 * @param {HTMLElement} container #picks3View
 * @param {object} opts { config, currentGameweek }
 */
export async function renderPicks3Module(container, { config, currentGameweek }) {
  const poolCfg = config.picks3PrizePool || {};
  const base = poolCfg.basePrizePerWeek ?? 5;
  // 奖池推进到：配置的 currentGameweek（优先，便于手动维护），否则当前解析轮
  const through = poolCfg.currentGameweek ?? currentGameweek;
  const settledGws = config.gameweeks.filter((g) => g.gameweek <= through);
  const rows = calculatePicks3PrizePool(settledGws, config.picks3WeeklyWinners, base);
  const currentPool = getPicks3CurrentPool(rows);
  const winnerByGw = new Map((config.picks3WeeklyWinners || []).map((w) => [w.gameweek, w]));

  container.innerHTML = `
    <section class="card" aria-labelledby="picks3Title">
      <div class="card-header">
        <h2 class="card-title" id="picks3Title">Picks 3 Weekly Winner</h2>
        <div class="prize-pool">
          <span class="prize-pool-label">当前累计奖池</span>
          <span class="prize-pool-amount">¥${formatNumber(currentPool)}</span>
        </div>
      </div>
      <p class="picks3-note">每轮基础 +${base} 元 · 无人猜中则累计 · 猜中者拿走当前奖池并清零</p>
      <ol class="picks3-list">
        ${config.gameweeks.map((gw) => rowHtml(gw.gameweek, rows, through, winnerByGw)).join('')}
      </ol>
    </section>`;

  // 异步解析获奖者头像（扩展名不固定）
  container.querySelectorAll('.p3-avatar[data-base]').forEach(async (el) => {
    const url = await resolveImageByBaseName(ASSET_DIRS.picks3Winner, el.dataset.base);
    const name = el.dataset.name || '';
    if (url) {
      const img = document.createElement('img');
      img.className = 'avatar avatar-sm';
      img.src = url;
      img.alt = name;
      img.loading = 'lazy';
      img.addEventListener('error', () => img.replaceWith(makeAvatarFallback(name, 'avatar-sm')), { once: true });
      el.replaceWith(img);
    } else {
      el.replaceWith(makeAvatarFallback(name, 'avatar-sm'));
    }
  });
}

function rowHtml(gameweek, rows, through, winnerByGw) {
  if (gameweek > through) {
    return `
      <li class="p3-row p3-future">
        <span class="p3-gw">GW${gameweek}</span>
        <span class="p3-detail">未开奖</span>
      </li>`;
  }

  const row = rows[gameweek - 1];
  if (!row) return '';

  if (row.hasWinner) {
    const winner = winnerByGw.get(gameweek) || {};
    return `
      <li class="p3-row p3-win">
        <span class="p3-gw">GW${gameweek}</span>
        <span class="p3-avatar" data-base="${escapeHtml(winner.avatarBaseName || '')}" data-name="${escapeHtml(row.winnerName || '')}"></span>
        <span class="p3-detail">${escapeHtml(row.winnerName || '?')} 获奖</span>
        <span class="p3-pool is-win">¥${formatNumber(row.payout)} · 清零</span>
      </li>`;
  }

  return `
    <li class="p3-row">
      <span class="p3-gw">GW${gameweek}</span>
      <span class="p3-detail">无人获奖 · +${row.added} 元</span>
      <span class="p3-pool">累计 ¥${formatNumber(row.poolAfter)}</span>
    </li>`;
}
