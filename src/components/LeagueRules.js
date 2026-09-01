/* ============================================================
 * src/components/LeagueRules.js — 联赛规则 + 竞猜规则
 * 内容为联赛公告原文，结构固定；如需改文案直接改下方数组。
 * ============================================================ */

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

const LEAGUE_RULES = [
  (total) => `烟幕二群群友均可参赛，每位玩家最多允许注册 <strong>3 个账号</strong>。`,
  (total) => `联赛共 <strong>${total}</strong> 轮，与 FPL 官方赛季同步。`,
  () => `每轮以 FPL 官方 <strong>Deadline（DDL）</strong> 为结算节点，截止后统计当轮成绩。`,
  () => `每轮记录本联赛<strong>周最佳</strong>（该轮总分最高玩家）。`,
  () => `周最佳奖金：每轮 <strong>5 元</strong>，赛季共计 <strong>190 元</strong>。`,
  () => `联赛最终排名奖金：
    <ul>
      <li>冠军：100 元</li>
      <li>亚军：30 元</li>
      <li>季军：10 元</li>
    </ul>`,
  () => `特别奖项：<strong>Daka 进球奖</strong>（赞助商：英国人画像，奖金由赞助商单独发放）
    <ul>
      <li>赛季结束后结算。</li>
      <li>若玩家最终联赛排名与 Daka 本赛季参与进球数（德甲 + 德国国内杯赛）相同，则获得奖励。</li>
      <li>奖金金额 = 联赛排名 × 10 元。</li>
    </ul>`,
  () => `由于 FPL 账号与微信身份无法自动匹配，相关微信昵称及头像信息由后台人工维护。`,
  () => `页面仅展示已确认数据，未配置轮次显示“暂未公布”。`,
  () => `联赛最终解释权归主办方所有。`,
];

const PICKS3_RULES = [
  () => `每位玩家需选择本轮 <strong>3 名 FPL 球员</strong>：
    <ul>
      <li>2 名前场球员（MID / FWD）</li>
      <li>1 名后场球员（DEF / GKP）</li>
    </ul>`,
  () => `获奖条件：
    <ul>
      <li>两名前场球员均达到 10 分及以上；</li>
      <li>后场球员达到 6 分及以上。</li>
    </ul>`,
  () => `若有多名玩家满足获奖条件，则按照当轮 DDL 时的球队总身价进行排序，<strong>总身价更低者获胜</strong>。`,
  () => `若满足条件的玩家总身价完全相同（即选择阵容一致），则按照提交时间排序，<strong>提交时间更早者获奖</strong>。`,
  () => `每位玩家每轮仅可提交一次，提交后不可修改。`,
  () => `请确保填写的昵称能够与群昵称对应，否则可能影响领奖资格。`,
  () => `竞猜活动最终解释权归主办方所有。`,
];

const rulesList = (rules, total) =>
  rules.map((rule) => `<li>${rule(total)}</li>`).join('');

/** 规则卡片 HTML（纯字符串，供线上渲染与 mock 生成器复用） */
export function leagueRulesHtml(totalGameweeks) {
  const total = escapeHtml(String(totalGameweeks));
  return `
    <section class="card" aria-labelledby="rulesTitle">
      <h3 class="rules-heading">联赛规则</h3>
      <ol class="rules">
        ${rulesList(LEAGUE_RULES, total)}
      </ol>
      <h3 class="rules-heading">竞猜规则</h3>
      <ol class="rules">
        ${rulesList(PICKS3_RULES, total)}
      </ol>
    </section>`;
}

export function renderLeagueRules(container, totalGameweeks) {
  container.innerHTML = leagueRulesHtml(totalGameweeks);
}
