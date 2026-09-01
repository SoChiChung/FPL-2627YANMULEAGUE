/* ============================================================
 * src/components/LeagueRules.js — 联赛规则
 * 文案为占位内容，结构已定；后续可直接改 RULES 数组。
 * ============================================================ */

const RULES = [
  (total) => `联赛共 <strong>${total}</strong> 轮，与 FPL 官方赛季同步。`,
  () => '每轮以 FPL 官方 <strong>Deadline</strong> 时间为刷新节点，截止后结算该轮周最佳。',
  () => '每轮记录本联赛<b>周最佳</b>（该轮总分最高者）。',
  () => '周最佳由<b>后台配置</b> FPL ID、微信名、微信头像后展示，前端只负责渲染。',
  () => '由于 FPL 账号与微信身份难以自动匹配，微信信息由后台<b>手动维护</b>。',
  () => '页面仅展示<b>已确认</b>的数据；未配置的轮次显示“暂未公布”。',
];

export function renderLeagueRules(container, totalGameweeks) {
  container.innerHTML = `
    <section class="card" aria-labelledby="rulesTitle">
      <div class="card-header">
        <h2 class="card-title" id="rulesTitle">联赛规则</h2>
      </div>
      <ol class="rules">
        ${RULES.map((rule) => `<li>${rule(totalGameweeks)}</li>`).join('')}
      </ol>
    </section>`;
}
