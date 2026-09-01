/* ============================================================
 * src/components/ClassicWinnerList.js — Classic Weekly Winner 列表
 *
 * 38 行纵向手风琴（记录流），一行一轮：
 *   折叠态：头像 / GW / 分数 / 微信名 / 是否已公布
 *   展开态：FPL 阵容（GK/DEF/MID/FWD/Bench + C/VC）+ 竖屏颁奖图
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
  bindAvatarFallback,
} from '../utils/image.js';
import { loadCachedSquads, resolveSquad } from '../services/squadService.js';
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

/**
 * 渲染 38 行手风琴列表。默认展开最新已公布的一轮。
 * @param {HTMLElement} container #classicWinnerList
 * @param {object} opts { config, currentGameweek }
 */
export async function renderClassicWinnerList(container, { config, currentGameweek }) {
  const cached = await loadCachedSquads(); // 一次拉取全部缓存，折叠行秒显分数
  const winnerByGw = new Map((config.classicWinners || []).map((w) => [w.gameweek, w]));
  const squadByGw = new Map((cached?.squads || []).map((s) => [s.gameweek, s]));

  container.innerHTML = '';
  const rows = [];

  for (const gw of config.gameweeks) {
    const winner = winnerByGw.get(gw.gameweek) || null;
    const squad = squadByGw.get(gw.gameweek) || null;
    const row = buildRow({ gw: gw.gameweek, winner, squad, isCurrent: gw.gameweek === currentGameweek });
    rows.push(row);
    container.appendChild(row);
  }

  // 默认展开：最新已公布的一轮；没有已公布轮次则不展开
  const winners = [...(config.classicWinners || [])].sort((a, b) => b.gameweek - a.gameweek);
  if (winners.length) {
    const defaultRow = rows[winners[0].gameweek - 1];
    toggleRow(defaultRow);
    loadDetail(defaultRow);
  }
}

function buildRow({ gw, winner, squad, isCurrent }) {
  const row = document.createElement('div');
  row.className = 'cw-row';
  row.dataset.gw = gw;
  if (isCurrent) row.classList.add('is-current');

  const status = winner
    ? '<span class="cw-status is-published">已公布</span>'
    : '<span class="cw-status is-pending">暂未公布</span>';

  const points = squad ? `${squad.totalPoints}分` : '—';
  const name = winner ? escapeHtml(winner.wechatName) : '—';
  const avatarHtml = winner
    ? `<span class="cw-avatar-wrap"><span class="avatar avatar-sm" data-name="${escapeHtml(winner.wechatName)}"></span></span>`
    : '<span class="cw-avatar-wrap cw-avatar-empty" aria-hidden="true"></span>';

  row.innerHTML = `
    <button class="cw-head" type="button" aria-expanded="false" aria-controls="cw-body-${gw}">
      ${avatarHtml}
      <span class="cw-gw">GW${gw}</span>
      <span class="cw-points">${points}</span>
      <span class="cw-name">${name}</span>
      ${status}
      <span class="cw-chevron" aria-hidden="true"></span>
    </button>
    <div class="cw-body" id="cw-body-${gw}">
      <div class="cw-fplid"></div>
      <div class="cw-squad"><div class="loading">加载中…</div></div>
      <div class="cw-award"><div class="loading">加载中…</div></div>
    </div>`;

  row._winner = winner;
  row._squad = squad;
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
    toggleRow(row, list);
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

/** 首次展开时懒加载：阵容 + 颁奖图 */
function loadDetail(row) {
  row._loaded = true;
  const { _winner: winner, _squad: cachedSquad } = row;

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

  // 阵容：缓存命中直接渲染；未命中走 Mock 兜底
  resolveSquad(winner.gameweek, winner.fplId).then(({ squad, label }) => {
    if (!row.isConnected) return;
    renderSquad(row.querySelector('.cw-squad'), squad, label);
    // 折叠行头部的分数与展开后数据保持同步
    if (!cachedSquad) {
      const pointsEl = row.querySelector('.cw-points');
      if (pointsEl) pointsEl.textContent = `${squad.totalPoints}分`;
    }
  });

  // 颁奖图：按 awardImageBaseName 尝试 .webp/.jpg/.jpeg/.png
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
