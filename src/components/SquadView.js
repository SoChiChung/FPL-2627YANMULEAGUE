/* ============================================================
 * src/components/SquadView.js — 阵容展示（GK / DEF / MID / FWD / Bench）
 * 渲染到 Classic Weekly Winner 的展开面板内。
 * ============================================================ */

const POSITION_ORDER = ['GK', 'DEF', 'MID', 'FWD'];
const POSITION_LABELS = { GK: '门将', DEF: '后卫', MID: '中场', FWD: '前锋' };
const BENCH_LABEL = '替补（Bench）';

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function renderPlayerRow(p) {
  const marks =
    (p.isCaptain ? '<span class="mark mark-c" title="队长（得分×2）">C</span>' : '') +
    (p.isViceCaptain ? '<span class="mark mark-vc" title="副队长">VC</span>' : '');
  return `
    <li class="player">
      <span class="player-name">${escapeHtml(p.name)}${marks}</span>
      <span class="player-club">${escapeHtml(p.club)}</span>
      <span class="player-points">${p.points}分</span>
    </li>`;
}

/**
 * 渲染阵容到展开面板内。
 * @param {HTMLElement} container 展开面板的阵容容器（.cw-squad）
 * @param {object} squad 阵容数据（结构见 fplApiClient.transformPicksToSquad）
 * @param {string} sourceLabel 数据来源标注（缓存 / Mock）
 */
export function renderSquad(container, squad, sourceLabel) {
  // 按位置分组；位置字段统一为 GK/DEF/MID/FWD
  const groups = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad.players || []) {
    if (groups[p.position]) groups[p.position].push(p);
  }
  const bench = squad.bench || [];

  let html = `
    <div class="squad-summary">
      总分 ${escapeHtml(String(squad.totalPoints ?? '—'))}
      · 队长 ${escapeHtml(squad.captain ?? '—')}（C）
      · 副队长 ${escapeHtml(squad.viceCaptain ?? '—')}（VC）
    </div>`;

  for (const pos of POSITION_ORDER) {
    if (!groups[pos].length) continue;
    html += `
      <div class="squad-group">
        <h4 class="squad-group-title">${POSITION_LABELS[pos]}</h4>
        <ul class="player-list">${groups[pos].map(renderPlayerRow).join('')}</ul>
      </div>`;
  }
  if (bench.length) {
    html += `
      <div class="squad-group squad-group-bench">
        <h4 class="squad-group-title">${BENCH_LABEL}</h4>
        <ul class="player-list">${bench.map(renderPlayerRow).join('')}</ul>
      </div>`;
  }

  html += `<div class="squad-source">${escapeHtml(sourceLabel)}</div>`;
  container.innerHTML = html;
}
