/* ============================================================
 * src/main.js — 应用入口（组合根）
 *
 * 职责：
 *   1. 读取主配置（configService：只读 config.json，读不到直接报错）
 *   2. 解析当前轮次与倒计时（utils/gameweek.js）
 *   3. 渲染 Header / Classic Winner 手风琴 / Picks3 / 排行榜 / 规则
 *   4. 驱动每秒倒计时
 *
 * 不在这里堆业务逻辑：数据读取在 services/，计算在 utils/，
 * 渲染在 components/。
 * ============================================================ */

import { loadConfig } from './services/configService.js';
import { resolveCurrentGameweek } from './utils/gameweek.js';
import { renderHeader, updateCountdownText } from './components/Header.js';
import { renderClassicWinnerList } from './components/ClassicWinnerList.js';
import { renderPicks3Module } from './components/Picks3Module.js';
import { renderPredictionLeaderboard } from './components/PredictionLeaderboard.js';
import { renderLeagueStandings } from './components/LeagueStandings.js';
import { renderLeagueRules } from './components/LeagueRules.js';

/* ---------- 全局状态 ---------- */
let config = null;            // 主配置
let gwState = null;           // 当前轮次解析结果
let countdownTimer = null;    // 倒计时定时器

const els = {
  leagueName: null,
  leagueSeason: null,
  gwNumber: null,
  gwStatus: null,
  gwDeadlineLine: null,
  gwCountdown: null,
  classicWinnerList: null,
  picks3View: null,
  prizePoolAmount: null,
  leaderboardView: null,
  leagueStandingsView: null,
  leagueRulesView: null,
  footerNote: null,
};

// 允许在 Node 环境导入做语法校验（无 DOM 时不启动）
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    init().catch(showFatalError);
  });
}

async function init() {
  const { config: loaded } = await loadConfig();
  config = loaded;

  gwState = resolveCurrentGameweek(config.gameweeks, new Date());

  Object.assign(els, {
    leagueName: document.getElementById('leagueName'),
    leagueSeason: document.getElementById('leagueSeason'),
    gwNumber: document.getElementById('gwNumber'),
    gwStatus: document.getElementById('gwStatus'),
    gwDeadlineLine: document.getElementById('gwDeadlineLine'),
    gwCountdown: document.getElementById('gwCountdown'),
    classicWinnerList: document.getElementById('classicWinnerList'),
    picks3View: document.getElementById('picks3View'),
    prizePoolAmount: document.getElementById('prizePoolAmount'),
    leaderboardView: document.getElementById('leaderboardView'),
    leagueStandingsView: document.getElementById('leagueStandingsView'),
    leagueRulesView: document.getElementById('leagueRulesView'),
    footerNote: document.getElementById('footerNote'),
  });

  renderAll();
  startCountdown();
}

function renderAll() {
  renderHeader(els, { league: config.league, gwState });
  renderClassicWinnerList(els.classicWinnerList, {
    config,
    currentGameweek: gwState.gameweek,
  });
  renderPicks3Module(els.picks3View, {
    config,
    currentGameweek: gwState.gameweek,
  });
  renderPredictionLeaderboard(els.leaderboardView, els.prizePoolAmount, config);
  renderLeagueStandings(els.leagueStandingsView, config);
  renderLeagueRules(els.leagueRulesView, config.league.totalGameweeks);
}

function startCountdown() {
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    const target = gwState.countdownTarget;
    if (!target) return; // 赛季已完成，无需倒计时

    if (target.deadline.getTime() <= Date.now()) {
      // Deadline 刚过：重新解析当前轮次，刷新 Header
      gwState = resolveCurrentGameweek(config.gameweeks, new Date());
      renderHeader(els, { league: config.league, gwState });
      return;
    }
    updateCountdownText(els.gwCountdown, gwState);
  }, 1000);
}

function showFatalError(err) {
  console.error('初始化失败：', err);
  if (els.leagueName) els.leagueName.textContent = '配置加载失败';
  if (els.classicWinnerList) {
    els.classicWinnerList.innerHTML = `
      <div class="empty-state">
        <p class="empty-title">配置加载失败</p>
        <p>未能读取 config.json：${escapeHtml(err?.message || String(err))}</p>
        <p>请通过本地服务器预览（npm start），或部署到 GitHub Pages 后访问。</p>
      </div>`;
  }
}

/** 极简 HTML 转义，仅用于错误提示文案 */
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}
