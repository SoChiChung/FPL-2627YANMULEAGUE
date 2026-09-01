#!/usr/bin/env node
/* ============================================================
 * scripts/build-mock-html.js — 生成静态设计稿 mock/mock.html
 *
 * 用途：把当前 config.json + cachedSquads.json 的数据全部静态渲染
 * 成一份零 JS 的 HTML（折叠交互用原生 <details>/<summary>），
 * CSS 分离在 mock/styles/，方便交给 Open Design 或任何 AI 改样式。
 *
 * 用法：
 *   npm run build:mock
 *
 * 产物（mock/ 已 gitignore，不入库）：
 *   mock/mock.html
 *   mock/styles/  ← 从 src/styles 拷贝，可在里面直接改样式
 *   mock/assets/  ← 用到的头像 / 颁奖图拷贝
 * 重新生成：数据更新后再次运行即可（覆盖写）。
 * ============================================================ */

import { readFile, writeFile, mkdir, copyFile, appendFile, readdir } from 'node:fs/promises';
import { resolveCurrentGameweek } from '../src/utils/gameweek.js';
import { formatDateTimeBeijing } from '../src/utils/date.js';
import { getCountdownParts, formatCountdown } from '../src/utils/countdown.js';
import { calculatePicks3PrizePool, getPicks3CurrentPool } from '../src/services/picks3Service.js';
import { getLeaderboardData, resolveLeaderboardAvatarBaseName } from '../src/services/predictionService.js';
import { leagueRulesHtml } from '../src/components/LeagueRules.js';

const OUT_DIR = 'mock';
const OUT_HTML = `${OUT_DIR}/mock.html`;

const IMAGE_EXTENSIONS = ['.webp', '.jpg', '.jpeg', '.png'];
const POSITION_ORDER = ['GK', 'DEF', 'MID', 'FWD'];
const POSITION_LABELS = { GK: '门将', DEF: '后卫', MID: '中场', FWD: '前锋' };
const BENCH_LABEL = '替补（Bench）';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));

/**
 * 在 public/assets/<dir>/ 里按 baseName 匹配真实文件名（大小写不敏感）。
 * 用 readdir 拿磁盘上的真实文件名返回——不能用 existsSync：
 * Windows 文件系统大小写不敏感，会把 GW1.png 误判为存在，
 * 生成的路径到 Linux / GitHub Pages 上会 404。
 */
async function findAssetFile(dir, baseName) {
  if (!baseName) return null;
  const files = await readdir(`public/assets/${dir}`);
  const wanted = baseName.toLowerCase();
  return files.find((f) => {
    const dot = f.lastIndexOf('.');
    const stem = f.slice(0, dot);
    const ext = f.slice(dot + 1).toLowerCase();
    return stem.toLowerCase() === wanted && IMAGE_EXTENSIONS.includes(`.${ext}`);
  }) || null;
}

function playerRow(p) {
  const marks =
    (p.isCaptain ? '<span class="mark mark-c" title="队长（得分×2）">C</span>' : '') +
    (p.isViceCaptain ? '<span class="mark mark-vc" title="副队长">VC</span>' : '');
  return `
        <li class="player">
          <span class="player-name">${esc(p.name)}${marks}</span>
          <span class="player-club">${esc(p.club)}</span>
          <span class="player-points">${p.points}分</span>
        </li>`;
}

function squadHtml(squad) {
  const groups = { GK: [], DEF: [], MID: [], FWD: [] };
  for (const p of squad.players || []) if (groups[p.position]) groups[p.position].push(p);
  const bench = squad.bench || [];

  let html = `
        <div class="squad-summary">
          总分 ${esc(squad.totalPoints)} · 队长 ${esc(squad.captain ?? '—')}（C） · 副队长 ${esc(squad.viceCaptain ?? '—')}（VC）
        </div>`;
  for (const pos of POSITION_ORDER) {
    if (!groups[pos].length) continue;
    html += `
        <div class="squad-group">
          <h4 class="squad-group-title">${POSITION_LABELS[pos]}</h4>
          <ul class="player-list">${groups[pos].map(playerRow).join('')}</ul>
        </div>`;
  }
  if (bench.length) {
    html += `
        <div class="squad-group squad-group-bench">
          <h4 class="squad-group-title">${BENCH_LABEL}</h4>
          <ul class="player-list">${bench.map(playerRow).join('')}</ul>
        </div>`;
  }
  return html;
}

function classicRowHtml({ gw, winner, squad, avatarFile, awardFile, isDefaultOpen }) {
  const status = winner
    ? `<span class="cw-status is-published">已公布</span>`
    : `<span class="cw-status is-pending">暂未公布</span>`;
  const points = squad ? `${squad.totalPoints}分` : '—';
  const name = winner ? esc(winner.wechatName) : '—';
  const avatar = winner
    ? avatarFile
      ? `<span class="cw-avatar-wrap"><img class="avatar avatar-sm" src="${esc(avatarFile)}" alt="${esc(winner.wechatName)}" /></span>`
      : `<span class="cw-avatar-wrap"><span class="avatar avatar-sm avatar-fallback">${esc((winner.wechatName || '?').trim().charAt(0) || '?')}</span></span>`
    : '<span class="cw-avatar-wrap cw-avatar-empty" aria-hidden="true"></span>';

  let body;
  if (!winner) {
    body = `
        <div class="cw-fplid"></div>
        <div class="cw-squad">
          <div class="empty-state">
            <p class="empty-title">本轮周最佳暂未公布</p>
            <p>GW${gw} 结算后由后台配置获奖者后展示</p>
          </div>
        </div>`;
  } else {
    body = `
        <div class="cw-fplid">FPL ID：${esc(winner.fplId)} · GW${gw} 周最佳</div>
        <div class="cw-squad">${squad ? squadHtml(squad) + `
          <div class="squad-source">数据来源：FPL 官方 API（按配置 fplId=${esc(winner.fplId)} 生成，构建脚本拉取）</div>` : `
          <div class="empty-state"><p class="empty-title">阵容数据待生成</p><p>运行 npm run build:cache:real 后重新生成</p></div>`}
        </div>
        <div class="cw-award">${awardFile ? `
          <h4 class="squad-group-title">本轮颁奖图</h4>
          <a class="cw-award-link" href="${esc(awardFile)}" target="_blank" rel="noopener" title="点击查看大图">
            <img class="award-image" src="${esc(awardFile)}" alt="GW${gw} 颁奖图" />
          </a>` : `
          <div class="award-empty">
            <p class="empty-title">颁奖图待上传</p>
            <p>请将 GW${gw} 图片放入 classicweeklywinnerwords/</p>
          </div>`}
        </div>`;
  }

  return `
      <details class="cw-row"${isDefaultOpen ? ' open' : ''}>
        <summary class="cw-head">
          ${avatar}
          <span class="cw-gw">GW${gw}</span>
          <span class="cw-points">${points}</span>
          <span class="cw-name">${name}</span>
          ${status}
          <span class="cw-chevron" aria-hidden="true"></span>
        </summary>
        <div class="cw-body">${body}
        </div>
      </details>`;
}

function picks3RowHtml({ gameweek, row, winner, avatarFile, through }) {
  if (gameweek > through) {
    return `
        <li class="p3-row p3-future">
          <span class="p3-gw">GW${gameweek}</span>
          <span class="p3-detail">未开奖</span>
        </li>`;
  }
  if (row.hasWinner) {
    const avatar = avatarFile
      ? `<img class="avatar avatar-sm" src="${esc(avatarFile)}" alt="${esc(row.winnerName || '')}" />`
      : `<span class="avatar avatar-sm avatar-fallback">${esc((row.winnerName || '?').trim().charAt(0) || '?')}</span>`;
    return `
        <li class="p3-row p3-win">
          <span class="p3-gw">GW${gameweek}</span>
          ${avatar}
          <span class="p3-detail">${esc(row.winnerName || '?')} 获奖</span>
          <span class="p3-pool is-win">¥${row.payout} · 清零</span>
        </li>`;
  }
  return `
        <li class="p3-row">
          <span class="p3-gw">GW${gameweek}</span>
          <span class="p3-detail">无人获奖 · +${row.added} 元</span>
          <span class="p3-pool">累计 ¥${row.poolAfter}</span>
        </li>`;
}

/* ---- 联赛分数排名静态快照（与线上 LeagueStandings 同构） ---- */
const STANDINGS_FALLBACK = [
  { entry_name: 'BaBaXi', player_name: 'Xi Yang', event_total: 135, total: 206 },
  { entry_name: 'Isaac FC', player_name: 'Isaac Greyson', event_total: 121, total: 198 },
  { entry_name: 'Sunny Smoke', player_name: 'Classic Winner', event_total: 116, total: 191 },
  { entry_name: 'Blue Hour', player_name: 'Ryyyy', event_total: 110, total: 183 },
  { entry_name: 'GW Hunters', player_name: 'Demo Player', event_total: 108, total: 180 },
];

async function loadStandingsSnapshot() {
  let results = null;
  let meta = { source: '演示数据', updatedAt: null };
  try {
    const data = JSON.parse(await readFile('public/data/leagueStandings.json', 'utf8'));
    results = data.results || null;
    meta = {
      leagueId: data.league?.id,
      leagueName: data.league?.name,
      source: data.source || 'data/leagueStandings.json',
      updatedAt: data.updatedAt || null,
    };
  } catch {
    results = STANDINGS_FALLBACK;
  }
  if (!results || !results.length) results = STANDINGS_FALLBACK;

  const top10 = (rows, scoreKey) =>
    [...rows]
      .sort((a, b) => b[scoreKey] - a[scoreKey])
      .slice(0, 10)
      .map((r, i) => ({ ...r, displayRank: i + 1 }));

  return { meta, eventTop10: top10(results, 'event_total'), totalTop10: top10(results, 'total') };
}

function standingsPanel(title, scoreLabel, rows, scoreKey) {
  if (!rows.length) {
    return `
      <div class="standings-panel">
        <h3>${esc(title)}</h3>
        <div class="empty-state"><p class="empty-title">暂无排名数据</p></div>
      </div>`;
  }
  return `
    <div class="standings-panel">
      <h3>${esc(title)}</h3>
      <ol class="standings-list">
        ${rows.map((row) => standingsRow(row, scoreLabel, scoreKey)).join('')}
      </ol>
    </div>`;
}

function standingsRow(row, scoreLabel, scoreKey) {
  const rankClass = row.displayRank <= 3 ? ` r${row.displayRank}` : '';
  return `
    <li class="standings-row">
      <span class="lb-rank${rankClass}">${row.displayRank}</span>
      <div class="standings-team">
        <strong>${esc(row.entry_name || row.entryName || '—')}</strong>
        <span>${esc(row.player_name || row.playerName || 'Manager')}</span>
      </div>
      <div class="standings-score">
        <strong>${esc(String(row[scoreKey] ?? 0))}</strong>
        <span>${esc(scoreLabel)}</span>
      </div>
      <span class="rank-move neutral">-</span>
    </li>`;
}

async function main() {
  const config = JSON.parse(await readFile('public/config.json', 'utf8'));
  const cache = JSON.parse(await readFile('public/data/cachedSquads.json', 'utf8'));

  const winnerByGw = new Map((config.classicWinners || []).map((w) => [w.gameweek, w]));
  const squadByGw = new Map((cache.squads || []).map((s) => [s.gameweek, s]));
  const p3WinnerByGw = new Map((config.picks3WeeklyWinners || []).map((w) => [w.gameweek, w]));

  // 当前轮状态（生成时刻的静态快照）
  const gwState = resolveCurrentGameweek(config.gameweeks, new Date());
  const deadlineLine = gwState.previous
    ? `GW${gwState.previous.gameweek} 已结束 · 距 GW${gwState.gameweek} Deadline：${formatDateTimeBeijing(gwState.countdownTarget.deadline)}（北京时间）`
    : `距 GW${gwState.gameweek} Deadline：${formatDateTimeBeijing(gwState.countdownTarget.deadline)}（北京时间）`;
  const countdownText = gwState.countdownTarget
    ? formatCountdown(getCountdownParts(gwState.countdownTarget.deadline.getTime()))
    : '赛季已完成';

  // Picks 3 奖池（与线上逻辑一致）
  const poolCfg = config.picks3PrizePool || {};
  const base = poolCfg.basePrizePerWeek ?? 5;
  const through = poolCfg.currentGameweek ?? gwState.gameweek;
  const settledGws = config.gameweeks.filter((g) => g.gameweek <= through);
  const p3Rows = calculatePicks3PrizePool(settledGws, config.picks3WeeklyWinners, base);
  const p3Pool = getPicks3CurrentPool(p3Rows);
  const p3ByGw = new Map(p3Rows.map((r) => [r.gameweek, r]));

  // 静态资源引用（mock/assets/ 下）
  const avatarFor = async (winner) => {
    const f = await findAssetFile('classicweeklywinneravatar', winner.avatarBaseName);
    return f ? `assets/classicweeklywinneravatar/${f}` : null;
  };
  const awardFor = async (winner) => {
    const f = await findAssetFile('classicweeklywinnerwords', winner.awardImageBaseName);
    return f ? `assets/classicweeklywinnerwords/${f}` : null;
  };
  const p3AvatarFor = async (winner) => {
    const f = await findAssetFile('pick3weeklywinner', winner.avatarBaseName);
    return f ? `assets/pick3weeklywinner/${f}` : null;
  };

  // 默认展开最新已公布的一轮
  const winners = [...(config.classicWinners || [])].sort((a, b) => b.gameweek - a.gameweek);
  const defaultOpenGw = winners.length ? winners[0].gameweek : null;

  const classicRows = (
    await Promise.all(
      config.gameweeks.map(async (gw) => {
        const winner = winnerByGw.get(gw.gameweek) || null;
        return classicRowHtml({
          gw: gw.gameweek,
          winner,
          squad: squadByGw.get(gw.gameweek) || null,
          avatarFile: winner ? await avatarFor(winner) : null,
          awardFile: winner ? await awardFor(winner) : null,
          isDefaultOpen: gw.gameweek === defaultOpenGw,
        });
      }),
    )
  ).join('\n');

  const p3List = (
    await Promise.all(
      config.gameweeks.map(async (gw) => {
        const winner = p3WinnerByGw.get(gw.gameweek) || null;
        return picks3RowHtml({
          gameweek: gw.gameweek,
          row: p3ByGw.get(gw.gameweek),
          winner,
          avatarFile: winner ? await p3AvatarFor(winner) : null,
          through,
        });
      }),
    )
  ).join('\n');

  // 竞猜总榜：与线上一致，由原始竞猜记录自动汇总排序（不写回配置）
  const { pool: lbPool, entries: lbEntries } = getLeaderboardData(config);
  const lbRowsHtml = (
    await Promise.all(
      lbEntries.map(async (entry, i) => {
        // 头像复用 Picks 3（pick3weeklywinner 目录），匹配不到用首字占位
        const baseName = resolveLeaderboardAvatarBaseName(config, entry);
        const file = baseName ? await findAssetFile('pick3weeklywinner', baseName) : null;
        const avatar = file
          ? `<img class="avatar avatar-sm" src="assets/pick3weeklywinner/${esc(file)}" alt="${esc(entry.username)}" />`
          : `<span class="avatar avatar-sm avatar-fallback">${esc((entry.username || '?').trim().charAt(0) || '?')}</span>`;
        const subline = entry.wins > 1 ? `获奖 ${entry.wins} 次` : (entry.prediction || '竞猜获奖');
        return `
          <li class="lb-item">
            <span class="lb-rank${i < 3 ? ` r${i + 1}` : ''}">${i + 1}</span>
            ${avatar}
            <div class="lb-meta">
              <div class="lb-name">${esc(entry.username)}</div>
              <div class="lb-pred">${esc(subline)}</div>
            </div>
            <span class="lb-prize">¥${entry.totalPrize}</span>
          </li>`;
      }),
    )
  ).join('\n');

  // 联赛分数排名（静态快照：读 data/leagueStandings.json，缺失时用演示行）
  const standings = await loadStandingsSnapshot();

  const html = `<!DOCTYPE html>
<!-- ============================================================
  设计稿 Mock 页面（零 JS，纯静态）
  · 数据为生成时刻的快照，来源：public/config.json + public/data/cachedSquads.json
  · 重新生成：npm run build:mock
  · 样式文件在 mock/styles/，可直接替换重写，class 结构与线上一致
============================================================ -->
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(config.league.name)}（设计稿 Mock）</title>
  <link rel="stylesheet" href="styles/theme.css" />
  <link rel="stylesheet" href="styles/base.css" />
  <link rel="stylesheet" href="styles/layout.css" />
  <link rel="stylesheet" href="styles/components.css" />
</head>
<body>

  <header class="site-header">
    <div class="container header-inner">
      <div class="brand">
        <h1 class="brand-name">${esc(config.league.name)}</h1>
        <span class="brand-season">${esc(config.league.season)} 赛季</span>
      </div>
      <div class="gw-banner">
        <div class="gw-badge">
          <span class="gw-badge-num">GW${gwState.gameweek}</span>
          <span class="gw-badge-status" data-key="${gwState.statusKey}">${gwState.statusLabel}</span>
        </div>
        <div class="gw-timer-block">
          <div class="gw-deadline-line">${esc(deadlineLine)}</div>
          <div class="gw-countdown">${esc(countdownText)}（静态快照）</div>
        </div>
      </div>
    </div>
  </header>

  <main class="container layout">

    <div class="column column-main">
      <section class="card" aria-labelledby="classicTitle">
        <div class="card-header">
          <h2 class="card-title" id="classicTitle">Classic Weekly Winner</h2>
          <span class="card-hint">每轮周最佳 · 点击展开阵容与颁奖图</span>
        </div>
        <div class="cw-list">
${classicRows}
        </div>
      </section>
    </div>

    <div class="column column-side">
      <section class="card" aria-labelledby="picks3Title">
        <div class="card-header">
          <h2 class="card-title" id="picks3Title">Picks 3 Weekly Winner</h2>
          <div class="prize-pool">
            <span class="prize-pool-label">当前累计奖池</span>
            <span class="prize-pool-amount">¥${p3Pool}</span>
          </div>
        </div>
        <p class="picks3-note">每轮基础 +${base} 元 · 无人猜中则累计 · 猜中者拿走当前奖池并清零</p>
        <ol class="picks3-list">
${p3List}
        </ol>
      </section>

      <section class="card" aria-labelledby="lbTitle">
        <div class="card-header">
          <h2 class="card-title" id="lbTitle">竞猜排行榜</h2>
          <div class="prize-pool">
            <span class="prize-pool-label">累计奖池</span>
            <span class="prize-pool-amount">¥${lbPool}</span>
          </div>
        </div>
        <ol class="leaderboard">
${lbRowsHtml}
        </ol>
      </section>

      <section class="card standings-card" aria-labelledby="standingsTitle">
        <div class="card-header standings-header">
          <div>
            <h2 class="card-title" id="standingsTitle">联赛分数排名</h2>
            <p class="standings-sub">联赛号 ${standings.meta.leagueId ?? '—'} · ${esc(standings.meta.source)} · ${standings.meta.updatedAt ? esc(new Date(standings.meta.updatedAt).toLocaleString('zh-CN', { hour12: false })) : '演示数据'}</p>
          </div>
        </div>
        <div class="standings-grid">
          ${standingsPanel('单轮分数前十', '本轮', standings.eventTop10, 'event_total')}
          ${standingsPanel('总分前十', '总分', standings.totalTop10, 'total')}
        </div>
      </section>

      ${leagueRulesHtml(config.league.totalGameweeks)}
    </div>
  </main>

  <footer class="site-footer">
    <div class="container">
      <p>设计稿 Mock 页面：数据为静态快照（scripts/build-mock-html.js 生成）· 真实页面由 Vite 应用渲染</p>
    </div>
  </footer>
</body>
</html>
`;

  await mkdir(`${OUT_DIR}/styles`, { recursive: true });
  await mkdir(`${OUT_DIR}/assets/classicweeklywinneravatar`, { recursive: true });
  await mkdir(`${OUT_DIR}/assets/classicweeklywinnerwords`, { recursive: true });
  await mkdir(`${OUT_DIR}/assets/pick3weeklywinner`, { recursive: true });

  await writeFile(OUT_HTML, html);

  // 拷贝样式（分离式 CSS，交给设计改的就是这几份）
  for (const f of ['theme.css', 'base.css', 'layout.css', 'components.css']) {
    await copyFile(`src/styles/${f}`, `${OUT_DIR}/styles/${f}`);
  }

  // 拷贝字体（存在才拷；mock 页面与线上同主题）
  try {
    const fontFiles = await readdir('src/styles/fonts');
    await mkdir(`${OUT_DIR}/styles/fonts`, { recursive: true });
    for (const f of fontFiles) {
      if (f === 'README.md') continue;
      await copyFile(`src/styles/fonts/${f}`, `${OUT_DIR}/styles/fonts/${f}`);
    }
  } catch {
    // src/styles/fonts 不存在或为空：忽略，页面使用降级字体
  }

  // mock 静态页专用适配：线上版手风琴由 JS 控制 .is-open，
  // 静态稿用原生 <details>/<summary> 实现（追加在 components.css 末尾）
  await appendFile(
    `${OUT_DIR}/styles/components.css`,
    `
/* ============================================================
 * mock 静态页专用适配（details/summary 手风琴）
 * 线上版由 JS 控制 .is-open；静态稿用原生 details 实现。
 * ============================================================ */
summary {
  display: block;
  cursor: pointer;
  list-style: none;
}

summary::-webkit-details-marker {
  display: none;
}

details.cw-row .cw-body {
  display: none;
}

details.cw-row[open] .cw-body {
  display: block;
}

details.cw-row[open] .cw-chevron::before {
  transform: rotate(225deg) translateY(-1px);
}
`,
  );

  // 拷贝用到的图片
  const copies = [
    ['public/assets/classicweeklywinneravatar', 'classicweeklywinneravatar'],
    ['public/assets/classicweeklywinnerwords', 'classicweeklywinnerwords'],
    ['public/assets/pick3weeklywinner', 'pick3weeklywinner'],
  ];
  for (const [srcDir, dstDir] of copies) {
    const files = await readdir(srcDir);
    for (const f of files) await copyFile(`${srcDir}/${f}`, `${OUT_DIR}/assets/${dstDir}/${f}`);
  }
  await copyFile('public/assets/avatar-wangwu.svg', `${OUT_DIR}/assets/avatar-wangwu.svg`);

  console.log(`已生成 ${OUT_HTML}（样式 ${OUT_DIR}/styles/，图片 ${OUT_DIR}/assets/）`);
}

main().catch((err) => {
  console.error('生成失败：', err);
  process.exit(1);
});
