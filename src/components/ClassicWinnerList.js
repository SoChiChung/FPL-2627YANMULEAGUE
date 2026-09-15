/* ============================================================
 * src/components/ClassicWinnerList.js — Classic Weekly Winner 列表
 *
 * 38 行纵向手风琴（记录流），一行一轮：
 *   折叠态：头像 / GW / 分数 / 微信名 / 数据状态
 *   展开态：FPL 阵容（GK/DEF/MID/FWD/Bench + C/VC）+ 竖屏颁奖图
 *
 * ── 逐轮数据状态（由 squadService 提供，见 scripts/build-fpl-cache.js）──
 *   settled 已公布 —— 数据已结算，是终值
 *   live    结算中 —— 该轮进行中，分数仍在变化；页面每 5 分钟自动跟进
 *   pending 未开赛 —— DDL 已过但尚无比赛结束，暂无有效得分
 *   missing 待生成 —— 构建脚本尚未把该轮写入缓存
 *
 * ⚠️ 宁缺毋假：任何情况下都不会用 Mock 数据顶替缺失的真实阵容。
 *    未开赛时头部分数显示「—」而非「0分」，避免被误读为发挥不佳。
 *
 * 图片不写死扩展名：
 *   头像     → resolveImageByBaseName(classicWinnerAvatar, avatarBaseName)
 *   颁奖图   → resolveImageByBaseName(classicWinnerWords, awardImageBaseName)
 * 匹配失败时显示名字首字占位 / “颁奖图待上传”空状态。
 * ============================================================ */

import {
  ASSET_DIRS,
  resolveImageByBaseName,
  makeAvatarFallback,
} from '../utils/image.js';
import {
  loadCachedSquads,
  buildSourceLabel,
  normalizeStatus,
  isTerminalStatus,
  LIVE_REFRESH_MS,
} from '../services/squadService.js';
import { renderSquad } from './SquadView.js';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

/* ---------- 逐轮状态 → 展示形态 ---------- */

/** 折叠行右侧徽标 */
function badgeFor(winner, status) {
  if (!winner) return { cls: 'is-pending', text: '暂未公布' };
  switch (status) {
    case 'settled': return { cls: 'is-published', text: '已公布' };
    case 'live': return { cls: 'is-live', text: '结算中' };
    case 'pending': return { cls: 'is-pending', text: '未开赛' };
    case 'mock': return { cls: 'is-published', text: '演示数据' };
    default: return { cls: 'is-pending', text: '待生成' };
  }
}

/**
 * 折叠行头部分数。
 * 未开赛 / 无数据时显示「—」，绝不显示 0 分 —— 未开赛的 0 分会被误读成表现失常。
 */
function headerPoints(squad, status) {
  if (!squad || status === 'pending') return '—';
  return `${squad.totalPoints}分`;
}

/** 展开区在各缺省状态下的说明文案 */
function emptyStateHtml(gw, status, failures) {
  if (status === 'pending') {
    return `
      <div class="empty-state">
        <p class="empty-title">本轮尚未开赛</p>
        <p>GW${gw} 的比赛还没有开始，暂无有效得分。</p>
        <p>比赛开始后本页会自动更新。</p>
      </div>`;
  }

  const failed = (failures || []).find((f) => Number(f.gameweek) === Number(gw));
  if (failed) {
    return `
      <div class="empty-state">
        <p class="empty-title">本轮数据获取失败</p>
        <p>构建脚本访问 FPL 官方接口未成功（${escapeHtml(String(failed.reason || '未知原因'))}）。</p>
        <p>页面不会展示未经确认的数据，系统会自动重试。</p>
      </div>`;
  }

  return `
    <div class="empty-state">
      <p class="empty-title">本轮阵容数据尚未生成</p>
      <p>GW${gw} 的真实阵容由构建脚本从 FPL 官方接口拉取后写入缓存。</p>
      <p>在数据到位之前，页面不会展示任何未经确认的分数。</p>
    </div>`;
}

/* ---------- 列表渲染 ---------- */

/** 当前列表的刷新上下文（供定时跟进使用） */
let activeCtx = null;
let refreshTimer = null;
let visibilityBound = false;

/**
 * 渲染 38 行手风琴列表。默认展开最新已公布的一轮。
 * @param {HTMLElement} container #classicWinnerList
 * @param {object} opts { config, currentGameweek }
 */
export async function renderClassicWinnerList(container, { config, currentGameweek }) {
  const winners = config.classicWinners || [];
  // 已配置的最新周最佳轮次：缓存必须覆盖到它，否则说明数据还没跟上
  const latestWinnerGameweek = winners.length ? Math.max(...winners.map((w) => w.gameweek)) : null;

  activeCtx = { container, latestWinnerGameweek };

  const cached = await loadCachedSquads({ latestWinnerGameweek });
  const winnerByGw = new Map(winners.map((w) => [w.gameweek, w]));
  const squadByGw = new Map((cached?.squads || []).map((s) => [s.gameweek, s]));

  container.innerHTML = '';
  const rows = [];

  for (const gw of config.gameweeks) {
    const row = buildRow({
      gw: gw.gameweek,
      winner: winnerByGw.get(gw.gameweek) || null,
      squad: squadByGw.get(gw.gameweek) || null,
      isCurrent: gw.gameweek === currentGameweek,
    });
    rows.push(row);
    container.appendChild(row);
  }

  // 默认展开：最新已公布的一轮；没有已公布轮次则不展开
  if (winners.length) {
    const defaultRow = rows[Math.max(...winners.map((w) => w.gameweek)) - 1];
    toggleRow(defaultRow);
    loadDetail(defaultRow);
  }

  startRefreshLoop();
}

function buildRow({ gw, winner, squad, isCurrent }) {
  const row = document.createElement('div');
  row.className = 'cw-row';
  row.dataset.gw = gw;
  if (isCurrent) row.classList.add('is-current');

  const initialStatus = squad ? normalizeStatus(squad.status) : 'missing';
  const badge = badgeFor(winner, initialStatus);

  const name = winner ? escapeHtml(winner.wechatName) : '—';
  const avatarHtml = winner
    ? `<span class="cw-avatar-wrap"><span class="avatar avatar-sm" data-name="${escapeHtml(winner.wechatName)}"></span></span>`
    : '<span class="cw-avatar-wrap cw-avatar-empty" aria-hidden="true"></span>';

  row.innerHTML = `
    <button class="cw-head" type="button" aria-expanded="false" aria-controls="cw-body-${gw}">
      ${avatarHtml}
      <span class="cw-gw">GW${gw}</span>
      <span class="cw-points">${headerPoints(squad, initialStatus)}</span>
      <span class="cw-name">${name}</span>
      <span class="cw-status ${badge.cls}">${badge.text}</span>
      <span class="cw-chevron" aria-hidden="true"></span>
    </button>
    <div class="cw-body" id="cw-body-${gw}">
      <div class="cw-fplid"></div>
      <div class="cw-squad"><div class="loading">加载中…</div></div>
      <div class="cw-award"><div class="loading">加载中…</div></div>
    </div>`;

  row._winner = winner;
  row._squad = squad;
  row._status = winner ? initialStatus : 'none';
  row._loaded = false;

  // 异步解析头像（扩展名不固定，逐个尝试）
  if (winner) {
    const wrap = row.querySelector('.cw-avatar-wrap');
    resolveImageByBaseName(ASSET_DIRS.classicWinnerAvatar, winner.avatarBaseName).then((url) => {
      if (!row.isConnected) return;
      const img = document.createElement('img');
      img.className = 'avatar avatar-sm';
      img.alt = winner.wechatName || '';
      img.dataset.name = winner.wechatName || '';
      img.loading = 'lazy';
      if (url) {
        img.src = url;
      } else {
        // 目录里没有对应图片：名字首字占位
        wrap.replaceWith(makeAvatarFallback(winner.wechatName, 'avatar-sm'));
        return;
      }
      img.addEventListener('error', () => img.replaceWith(makeAvatarFallback(winner.wechatName, 'avatar-sm')), { once: true });
      wrap.replaceWith(img);
    });
  }

  row.querySelector('.cw-head').addEventListener('click', () => {
    const list = row.closest('.cw-list') || row.parentElement;
    const isOpen = row.classList.contains('is-open');
    // 手风琴：同时只展开一行
    if (!isOpen) list.querySelectorAll('.cw-row.is-open').forEach((r) => collapseRow(r));
    toggleRow(row);
    if (!isOpen && !row._loaded) loadDetail(row);
  });

  return row;
}

function toggleRow(row) {
  const isOpen = row.classList.toggle('is-open');
  row.querySelector('.cw-head').setAttribute('aria-expanded', String(isOpen));
}

function collapseRow(row) {
  row.classList.remove('is-open');
  row.querySelector('.cw-head').setAttribute('aria-expanded', 'false');
}

/* ---------- 状态应用 ---------- */

/** 更新折叠行头部：徽标 + 分数 + 记录状态 */
function applyHeaderState(row, squad) {
  const winner = row._winner;
  const status = winner ? (squad ? normalizeStatus(squad.status) : 'missing') : 'none';
  row._status = status;
  row._squad = squad || null;

  const badgeEl = row.querySelector('.cw-status');
  if (badgeEl) {
    const badge = badgeFor(winner, status);
    badgeEl.className = `cw-status ${badge.cls}`;
    badgeEl.textContent = badge.text;
  }

  const pointsEl = row.querySelector('.cw-points');
  if (pointsEl) pointsEl.textContent = headerPoints(squad, status);
}

/** 渲染展开区阵容面板（缺省状态 → 空状态；有数据 → 正式阵容） */
function renderSquadPanel(row, squad, cached) {
  const squadEl = row.querySelector('.cw-squad');
  if (!squadEl) return;

  const status = squad ? normalizeStatus(squad.status) : 'missing';
  if (!squad || status === 'pending') {
    squadEl.innerHTML = emptyStateHtml(row.dataset.gw, status, cached?.failures);
    return;
  }
  renderSquad(squadEl, squad, buildSourceLabel(status, squad.fetchedAt));
}

/** 同步应用一轮数据：头部 + （若已展开）面板 */
function applySquadState(row, squad, cached) {
  applyHeaderState(row, squad);
  if (row._loaded) renderSquadPanel(row, squad, cached);
}

/* ---------- 详情懒加载 ---------- */

/** 首次展开时懒加载：阵容 + 颁奖图 */
function loadDetail(row) {
  row._loaded = true;
  const winner = row._winner;

  if (!winner) {
    // 该轮未配置周最佳 → 空状态
    row.querySelector('.cw-squad').innerHTML = `
      <div class="empty-state">
        <p class="empty-title">本轮周最佳暂未公布</p>
        <p>GW${row.dataset.gw} 结算后由后台配置获奖者后展示</p>
      </div>`;
    row.querySelector('.cw-award').innerHTML = '';
    return;
  }

  // 展示配置中的真实 FPL ID
  row.querySelector('.cw-fplid').textContent = `FPL ID：${winner.fplId} · GW${winner.gameweek} 周最佳`;

  loadSquadPanel(row);
  loadAwardImage(row);
}

/** 读取当前缓存并渲染阵容面板；缓存未命中时显示缺省空状态 */
async function loadSquadPanel(row) {
  const winner = row._winner;
  const cached = await loadCachedSquads({ latestWinnerGameweek: activeCtx?.latestWinnerGameweek ?? null });
  if (!row.isConnected) return;
  const squad = cached?.squads.find((s) => s.gameweek === winner.gameweek && s.fplId === winner.fplId) || null;
  applySquadState(row, squad, cached);
}

/** 颁奖图：按 awardImageBaseName 尝试 .webp/.jpg/.jpeg/.png */
function loadAwardImage(row) {
  const winner = row._winner;
  resolveImageByBaseName(ASSET_DIRS.classicWinnerWords, winner.awardImageBaseName).then((url) => {
    if (!row.isConnected) return;
    const awardEl = row.querySelector('.cw-award');
    if (!url) {
      awardEl.innerHTML = `
        <div class="award-empty">
          <p class="empty-title">颁奖图待上传</p>
          <p>请将 ${escapeHtml(winner.awardImageBaseName || `GW${winner.gameweek}`)} 图片放入 ${ASSET_DIRS.classicWinnerWords}/</p>
        </div>`;
      return;
    }
    // 点击缩略图新窗口打开大图
    awardEl.innerHTML = `
      <h4 class="squad-group-title">本轮颁奖图</h4>
      <a class="cw-award-link" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="点击查看大图">
        <img class="award-image" src="${escapeHtml(url)}" alt="GW${winner.gameweek} 颁奖图" loading="lazy" />
      </a>`;
  });
}

/* ---------- 结算期自动跟进 ---------- */

/**
 * 定时跟进「尚未进入终态」的轮次。
 * 已结算的轮次是终值，永远不需要重复拉取；
 * 只有 live / pending / 缺数据时才继续轮询，全部终态后自动停止。
 */
function startRefreshLoop() {
  const hasFollowUp = () => {
    if (!activeCtx) return false;
    return [...activeCtx.container.querySelectorAll('.cw-row')]
      .some((row) => row._winner && !isTerminalStatus(row._status));
  };

  if (refreshTimer) clearInterval(refreshTimer);
  if (!hasFollowUp()) {
    refreshTimer = null;
  } else {
    refreshTimer = setInterval(() => {
      if (document.hidden) return; // 后台标签页不刷新，回到前台时补一次
      refreshLiveRows();
    }, LIVE_REFRESH_MS);
  }

  // 标签页从后台切回时立即补一次，避免显示过期数据
  if (!visibilityBound) {
    visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && refreshTimer) refreshLiveRows();
    });
  }
}

/** 拉取最新静态缓存，并把变化应用到对应行（不重建 DOM，保留展开态） */
async function refreshLiveRows() {
  if (!activeCtx) return;
  const { container, latestWinnerGameweek } = activeCtx;

  const rows = [...container.querySelectorAll('.cw-row')]
    .filter((row) => row._winner && !isTerminalStatus(row._status));
  if (!rows.length) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
    return;
  }

  const cached = await loadCachedSquads({ latestWinnerGameweek, force: true });
  if (!cached) return;

  for (const row of rows) {
    if (!row.isConnected) continue;
    const winner = row._winner;
    const squad = cached.squads.find(
      (s) => s.gameweek === winner.gameweek && s.fplId === winner.fplId,
    ) || null;
    applySquadState(row, squad, cached);
  }

  // 全部进入终态则停止轮询
  if (![...container.querySelectorAll('.cw-row')].some((r) => r._winner && !isTerminalStatus(r._status))) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }
}
