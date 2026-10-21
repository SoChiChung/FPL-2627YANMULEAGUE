/* ============================================================
 * src/components/ManagerStats.js — 每轮队长 / 转会统计（瀑布流）
 *
 * 展示「最近一个已开始轮次」的三项统计，各取前五：
 *   1. 转入最多的球员
 *   2. 转出最多的球员
 *   3. 队长选择最多的球员
 *
 * 轮次切换由构建脚本决定（取 bootstrap events[].finished 的最大轮次），
 * 前端只读产物里写好的 gameweek，不自行推算。
 *
 * ⚠️ 宁缺毋假：数据缺失时渲染空状态并提示补数据命令，
 *    绝不显示任何虚构的球员名或次数。
 * ============================================================ */

import { loadManagerStats } from '../services/managerStatsService.js';
import { formatStampBeijing } from '../utils/date.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/** 各榜单的展示配置 */
const PANELS = [
  {
    key: 'transfersIn',
    title: '转入最多',
    hint: '本轮新买入',
    icon: '↓',
    accent: 'in',
  },
  {
    key: 'transfersOut',
    title: '转出最多',
    hint: '本轮卖出',
    icon: '↑',
    accent: 'out',
  },
  {
    key: 'captains',
    title: '队长最多',
    hint: '本轮担任队长',
    icon: 'C',
    accent: 'cap',
  },
];

/**
 * 渲染统计模块。
 * @param {HTMLElement} container 挂载容器
 */
export async function renderManagerStats(container) {
  if (!container) return;
  container.innerHTML = '<div class="loading">统计加载中…</div>';

  const data = await loadManagerStats();

  if (!data) {
    container.innerHTML = `
      <section class="card ms-card">
        <div class="card-header">
          <h2 class="card-title">每轮选人统计</h2>
          <span class="card-hint">队长 · 转入 · 转出</span>
        </div>
        <div class="empty-state">
          <p class="empty-title">统计数据尚未生成</p>
          <p>运行 <code>npm run build:stats</code> 从 FPL 官方 API 生成真实统计缓存后即可显示。</p>
        </div>
      </section>`;
    return;
  }

  const updated = data.generatedAt
    ? formatStampBeijing(new Date(data.generatedAt))
    : '尚未生成';

  const hasAny = PANELS.some((p) => data.stats[p.key]?.length);

  container.innerHTML = `
    <section class="card ms-card" aria-labelledby="msTitle">
      <div class="card-header ms-header">
        <div>
          <h2 class="card-title" id="msTitle">每轮选人统计</h2>
          <p class="ms-sub">
            GW${data.gameweek} · ${data.participantCount} 名成员参与
            · 数据更新于 ${escapeHtml(updated)}
          </p>
        </div>
        <span class="ms-gw-badge">GW${data.gameweek}</span>
      </div>
      ${hasAny ? renderColumns(data) : renderEmpty(data)}
    </section>`;
}

/** 三列瀑布流：每列一个榜单，条目按名次排布 */
function renderColumns(data) {
  return `
    <div class="ms-columns">
      ${PANELS.map((panel) => renderPanel(panel, data.stats[panel.key] || [])).join('')}
    </div>`;
}

function renderPanel(panel, rows) {
  if (!rows.length) {
    return `
      <div class="ms-panel ms-panel-${panel.accent}">
        <div class="ms-panel-head">
          <span class="ms-panel-icon">${escapeHtml(panel.icon)}</span>
          <div>
            <h3 class="ms-panel-title">${escapeHtml(panel.title)}</h3>
            <p class="ms-panel-hint">${escapeHtml(panel.hint)}</p>
          </div>
        </div>
        <div class="empty-state ms-empty">
          <p class="empty-title">暂无数据</p>
          <p>本轮无可统计的记录</p>
        </div>
      </div>`;
  }

  const maxCount = Math.max(...rows.map((r) => r.count));

  return `
    <div class="ms-panel ms-panel-${panel.accent}">
      <div class="ms-panel-head">
        <span class="ms-panel-icon">${escapeHtml(panel.icon)}</span>
        <div>
          <h3 class="ms-panel-title">${escapeHtml(panel.title)}</h3>
          <p class="ms-panel-hint">${escapeHtml(panel.hint)}</p>
        </div>
      </div>
      <ol class="ms-list">
        ${rows.map((row, index) => renderRow(row, index, maxCount)).join('')}
      </ol>
    </div>`;
}

function renderRow(row, index, maxCount) {
  const rankClass = index < 3 ? ` r${index + 1}` : '';
  // 条形长度按相对最高次数归一化，直观表达「多少人这么做」
  const width = Math.max(8, Math.round((row.count / maxCount) * 100));

  return `
    <li class="ms-row">
      <span class="ms-rank${rankClass}">${index + 1}</span>
      <div class="ms-main">
        <div class="ms-name-line">
          <span class="ms-name">${escapeHtml(row.name)}</span>
        </div>
        <div class="ms-meta">
          ${row.position ? `<span class="ms-pos">${escapeHtml(row.position)}</span>` : ''}
          ${row.club ? `<span class="ms-club">${escapeHtml(row.club)}</span>` : ''}
        </div>
        <div class="ms-bar-track">
          <div class="ms-bar" style="width:${width}%"></div>
        </div>
      </div>
      <span class="ms-count">${row.count}</span>
    </li>`;
}

function renderEmpty(data) {
  return `
    <div class="empty-state">
      <p class="empty-title">GW${data.gameweek} 暂无统计数据</p>
      <p>该轮尚未产生有效选人记录，请检查缓存内容。</p>
    </div>`;
}
