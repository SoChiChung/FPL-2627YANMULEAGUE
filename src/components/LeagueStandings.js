/* ============================================================
 * src/components/LeagueStandings.js — 联赛单轮 / 总分前十
 * ============================================================ */

import { loadLeagueStandings } from '../services/leagueStandingsService.js';
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

export async function renderLeagueStandings(container, config) {
  container.innerHTML = '<div class="loading">联赛排名加载中…</div>';

  try {
    const data = await loadLeagueStandings(config);
    const updated = data.meta.updatedAt
      ? new Date(data.meta.updatedAt).toLocaleString('zh-CN', { hour12: false })
      : '演示数据';

    container.innerHTML = `
      <section class="card standings-card" aria-labelledby="standingsTitle">
        <div class="card-header standings-header">
          <div>
            <h2 class="card-title" id="standingsTitle">联赛分数排名</h2>
            <p class="standings-sub">联赛号 ${escapeHtml(data.meta.leagueId)} · ${escapeHtml(data.meta.source)} · ${escapeHtml(updated)}</p>
          </div>
        </div>
        <div class="standings-grid">
          ${standingsTable('单轮分数前十', '本轮', data.eventTop10, 'eventTotal')}
          ${standingsTable('总分前十', '总分', data.totalTop10, 'total')}
        </div>
      </section>`;
  } catch (err) {
    console.error('[LeagueStandings] render failed:', err);
    container.innerHTML = `
      <section class="card standings-card">
        <div class="empty-state">
          <p class="empty-title">联赛排名加载失败</p>
          <p>请稍后重试，或运行缓存脚本生成 data/leagueStandings.json。</p>
        </div>
      </section>`;
  }
}

function standingsTable(title, scoreLabel, rows, scoreKey) {
  if (!rows.length) {
    return `
      <div class="standings-panel">
        <h3>${escapeHtml(title)}</h3>
        <div class="empty-state"><p class="empty-title">暂无排名数据</p></div>
      </div>`;
  }

  return `
    <div class="standings-panel">
      <h3>${escapeHtml(title)}</h3>
      <ol class="standings-list">
        ${rows.map((row) => standingsRow(row, scoreLabel, scoreKey)).join('')}
      </ol>
    </div>`;
}

function standingsRow(row, scoreLabel, scoreKey) {
  const rankClass = row.displayRank <= 3 ? ` r${row.displayRank}` : '';
  const movement = row.lastRank && row.rank
    ? rankMovement(row.lastRank, row.rank)
    : '<span class="rank-move neutral">-</span>';

  return `
    <li class="standings-row">
      <span class="lb-rank${rankClass}">${row.displayRank}</span>
      <div class="standings-team">
        <strong>${escapeHtml(row.entryName)}</strong>
        <span>${escapeHtml(row.playerName || 'Manager')}</span>
      </div>
      <div class="standings-score">
        <strong>${formatNumber(row[scoreKey])}</strong>
        <span>${escapeHtml(scoreLabel)}</span>
      </div>
      ${movement}
    </li>`;
}

function rankMovement(lastRank, rank) {
  const diff = lastRank - rank;
  if (diff > 0) return `<span class="rank-move up">▲${diff}</span>`;
  if (diff < 0) return `<span class="rank-move down">▼${Math.abs(diff)}</span>`;
  return '<span class="rank-move neutral">-</span>';
}
