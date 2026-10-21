/* ============================================================
 * src/components/ManagerStats.js — 每轮队长 / 转会统计
 *
 * 展示「最近一个已开始轮次」的四项统计：
 *   1. 转入最多（5）
 *   2. 转出最多（5）
 *   3. 队长选择最多（5）
 *   4. 持有率最高（10）
 *
 * 布局（主人要求）：
 *   · 转入 / 转出 / 队长 三个榜单**合成一个轮播板块**，标签页切换
 *   · 持有率最高**单独成一个板块**
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

/**
 * 轮播板块的三个榜单。
 * 顺序按主人要求：转入最多 → 选择队长最多 → 转出最多。
 */
const CAROUSEL_PANELS = [
  {
    key: 'transfersIn',
    title: '转入最多',
    hint: '本轮新买入',
    icon: '↓',
    accent: 'in',
  },
  {
    key: 'captains',
    title: '选择队长最多',
    hint: '本轮担任队长',
    icon: 'C',
    accent: 'cap',
  },
  {
    key: 'transfersOut',
    title: '转出最多',
    hint: '本轮卖出',
    icon: '↑',
    accent: 'out',
  },
];

/** 独立板块：持有率最高（10 名） */
const OWNERSHIP_PANEL = {
  key: 'ownership',
  title: '持有率最高',
  hint: '本轮阵容持有人数占比 · 前十名',
  icon: '%',
  accent: 'own',
};

/** 自动轮播间隔（毫秒） */
const AUTOPLAY_MS = 6000;

export async function renderManagerStats(container) {
  if (!container) return;
  container.innerHTML = '<div class="loading">统计加载中…</div>';

  const data = await loadManagerStats();

  if (!data) {
    container.innerHTML = `
      <section class="card ms-card">
        <div class="card-header">
          <h2 class="card-title">每轮选人统计</h2>
          <span class="card-hint">队长 · 转入 · 转出 · 持有率</span>
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

  // 副标题说明统计口径：转会只统计本轮消耗了转会次数的成员
  const sampleNote = data.transferSampleCount
    ? `，${data.transferSampleCount} 人计入转会`
    : '';

  const hasAny = [...CAROUSEL_PANELS, OWNERSHIP_PANEL]
    .some((p) => data.stats[p.key]?.length);

  container.innerHTML = `
    <section class="card ms-card" aria-labelledby="msTitle">
      <div class="card-header ms-header">
        <div>
          <h2 class="card-title" id="msTitle">每轮选人统计</h2>
          <p class="ms-sub">
            GW${data.gameweek} · ${data.participantCount} 名成员参与${sampleNote}
            · 数据更新于 ${escapeHtml(updated)}
          </p>
        </div>
        <span class="ms-gw-badge">GW${data.gameweek}</span>
      </div>
      ${hasAny ? renderLayout(data) : renderEmpty(data)}
    </section>`;

  if (hasAny) setupCarousel(container);
}

/**
 * 整体布局：左轮播板块（转入/队长/转出），右持有率独立板块。
 */
function renderLayout(data) {
  return `
    <div class="ms-layout">
      <div class="ms-carousel" data-carousel>
        <div class="ms-tabs" role="tablist" aria-label="统计榜单切换">
          ${CAROUSEL_PANELS.map((p, i) => `
            <button
              type="button"
              class="ms-tab${i === 0 ? ' is-active' : ''}"
              role="tab"
              aria-selected="${i === 0 ? 'true' : 'false'}"
              data-tab-index="${i}"
            >
              <span class="ms-tab-icon ms-tab-icon-${p.accent}">${escapeHtml(p.icon)}</span>
              <span class="ms-tab-text">${escapeHtml(p.title)}</span>
            </button>`).join('')}
        </div>

        <div class="ms-slides">
          ${CAROUSEL_PANELS.map((p, i) => `
            <div
              class="ms-slide${i === 0 ? ' is-active' : ''}"
              role="tabpanel"
              data-slide-index="${i}"
              ${i === 0 ? '' : 'hidden'}
            >
              ${renderPanel(p, data.stats[p.key] || [])}
            </div>`).join('')}
        </div>

        <button type="button" class="ms-nav ms-nav-prev" data-nav="prev" aria-label="上一项">
          <span aria-hidden="true">‹</span>
        </button>
        <button type="button" class="ms-nav ms-nav-next" data-nav="next" aria-label="下一项">
          <span aria-hidden="true">›</span>
        </button>
      </div>

      <div class="ms-own-block">
        ${renderPanel(OWNERSHIP_PANEL, data.stats.ownership || [])}
      </div>
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
  // 持有率榜单显示百分比，人数榜单显示绝对人数
  const value = row.pct !== undefined && row.pct !== null
    ? `${row.pct}%`
    : String(row.count);

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
      <span class="ms-count">${escapeHtml(value)}</span>
    </li>`;
}

function renderEmpty(data) {
  return `
    <div class="empty-state">
      <p class="empty-title">GW${data.gameweek} 暂无统计数据</p>
      <p>该轮尚未产生有效选人记录，请检查缓存内容。</p>
    </div>`;
}

/* ---------- 轮播交互 ---------- */

/**
 * 绑定轮播行为：标签页点击、左右箭头、自动播放、悬停暂停、键盘支持。
 * 采用「就地更新」策略：只切换 hidden 属性与 is-active class，
 * 不重建 DOM（与项目「手风琴刷新时不重建 DOM」的约定一致）。
 */
function setupCarousel(container) {
  const root = container.querySelector('[data-carousel]');
  if (!root) return;

  const tabs = [...root.querySelectorAll('.ms-tab')];
  const slides = [...root.querySelectorAll('.ms-slide')];
  const total = tabs.length;
  let current = 0;
  let timer = null;

  function goTo(index) {
    current = (index + total) % total;
    tabs.forEach((t, i) => {
      const active = i === current;
      t.classList.toggle('is-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    slides.forEach((s, i) => {
      const active = i === current;
      s.classList.toggle('is-active', active);
      if (active) s.removeAttribute('hidden');
      else s.setAttribute('hidden', '');
    });
  }

  function startAutoplay() {
    stopAutoplay();
    timer = setInterval(() => goTo(current + 1), AUTOPLAY_MS);
  }

  function stopAutoplay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => {
      goTo(i);
      startAutoplay();
    });
  });

  root.querySelector('[data-nav="prev"]')?.addEventListener('click', () => {
    goTo(current - 1);
    startAutoplay();
  });
  root.querySelector('[data-nav="next"]')?.addEventListener('click', () => {
    goTo(current + 1);
    startAutoplay();
  });

  // 悬停时暂停自动播放，方便用户阅读
  root.addEventListener('mouseenter', stopAutoplay);
  root.addEventListener('mouseleave', startAutoplay);

  // 键盘左右方向键切换
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { goTo(current - 1); startAutoplay(); }
    else if (e.key === 'ArrowRight') { goTo(current + 1); startAutoplay(); }
  });

  // 页面切到后台时停止计时器，回来再继续
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopAutoplay();
    else startAutoplay();
  });

  startAutoplay();
}
