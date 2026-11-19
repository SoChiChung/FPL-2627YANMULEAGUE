/* ============================================================
 * scripts/build-league-standings.js
 *
 * 生成 GitHub Pages 可直接读取的 public/data/leagueStandings.json。
 * FPL standings API 无 CORS，浏览器不能稳定直连，因此在
 * GitHub Actions 或本地执行本脚本，把缓存提交到仓库。
 *
 * ── 单轮成绩口径（联赛约定，2026-11-19 主人定）──
 * FPL 官方 standings 的 event_total 是「毛分」，不含转会扣分。
 * 本联赛的单轮成绩 = 毛分 + 当轮转会扣分（扣分为负向，即净值）。
 * 因此额外抓取每位成员的 event_transfers_cost，写出 event_total_net
 * 作为展示与排名依据；event_total 原样保留，便于核对。
 *
 * 例：entry 7673「memories」GW10 毛分 101、转会扣分 4 → 单轮成绩 97。
 *
 * ── 幂等输出（重要）──
 * 本脚本被 CI 每 5 分钟调用一次。若每次运行都无条件重写文件，
 * 产物将永远存在 diff，导致 CI 每 5 分钟提交一次并反复触发部署。
 * 因此做了三件事：
 *   1. results 按 entry 升序排序 —— FPL 接口返回顺序不保证稳定，
 *      不排序则同一份数据每次排列都不同。
 *   2. 转会扣分按 (entry, 轮次) 缓存到 .cache/transfers/gw<N>.json，
 *      只在缺失时拉取，避免每轮 335 个成员重复请求。
 *   3. 仅当内容（results / league）真正变化时才刷新 updatedAt，
 *      否则沿用上一版的值 —— 保证「数据不变则产物不变」。
 * ============================================================ */

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const FPL_BASE = 'https://fantasy.premierleague.com/api';
const OUT_PATH = 'public/data/leagueStandings.json';
const COST_DIR = '.cache/transfers';
const PAGE_LIMIT = 50;
const FETCH_CONCURRENCY = 12;

/** 归一化序列化：忽略对象键顺序与 undefined，用于稳定比对 */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** 读取上一版产物，用于幂等比对（文件不存在或损坏时返回 null） */
async function readPrevious() {
  try {
    return JSON.parse(await readFile(OUT_PATH, 'utf8'));
  } catch {
    return null;
  }
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

/** 当前进行中的轮次：优先 is_current，否则取最后一个已结算轮次 */
async function resolveCurrentEvent() {
  const bootstrap = await fetchJson(`${FPL_BASE}/bootstrap-static/`);
  const events = bootstrap?.events || [];
  const current = events.find((e) => e.is_current);
  if (current) return current.id;
  const finished = events.filter((e) => e.finished);
  return finished.length ? Math.max(...finished.map((e) => e.id)) : null;
}

async function readCostCache(gameweek) {
  try {
    const raw = JSON.parse(await readFile(`${COST_DIR}/gw${gameweek}.json`, 'utf8'));
    return raw && typeof raw.costs === 'object' ? raw : null;
  } catch {
    return null;
  }
}

/**
 * 收集某轮全体成员的转会扣分。
 * 命中 .cache/transfers/gw<N>.json 的成员不再请求；缺失的并发补齐。
 * 单个成员失败不致命：该成员本轮按 0 扣分展示（= 毛分），且不写入缓存，
 * 下一轮 CI 会重试。
 */
async function collectTransferCosts(entryIds, gameweek) {
  const cached = await readCostCache(gameweek);
  const known = new Map(
    Object.entries(cached?.costs || {}).map(([k, v]) => [String(k), Number(v) || 0]),
  );
  const missing = entryIds.filter((id) => !known.has(String(id)));

  const failures = [];
  let cursor = 0;

  async function worker() {
    while (cursor < missing.length) {
      const id = missing[cursor];
      cursor += 1;
      try {
        const picks = await fetchJson(`${FPL_BASE}/entry/${id}/event/${gameweek}/picks/`);
        const cost = Number(picks?.entry_history?.event_transfers_cost ?? 0) || 0;
        known.set(String(id), cost);
      } catch (err) {
        failures.push({ entry: id, reason: err.message });
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(FETCH_CONCURRENCY, missing.length || 1) }, worker),
  );

  // 写回缓存（键升序，保证字节稳定）
  const costs = {};
  for (const id of [...known.keys()].sort((a, b) => Number(a) - Number(b))) {
    costs[id] = known.get(id);
  }
  await mkdir(COST_DIR, { recursive: true });
  await writeFile(
    `${COST_DIR}/gw${gameweek}.json`,
    `${JSON.stringify({
      _note: '派生数据缓存：成员 → 该轮转会扣分（event_transfers_cost）。删除后会自动重建。',
      _gameweek: gameweek,
      costs,
    }, null, 2)}\n`,
  );

  return { costs: known, failures };
}

async function main() {
  const config = JSON.parse(await readFile('public/config.json', 'utf8'));
  const leagueId = config.league?.classicLeagueId || 12968;

  const results = [];
  let league = null;

  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const url = `${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}`;
    const data = await fetchJson(url);
    league = league || data.league || { id: leagueId };
    results.push(...(data.standings?.results || []));
    if (!data.standings?.has_next) break;
  }

  // 单轮成绩净值化：毛分 + 当轮转会扣分（扣分是负向）
  const gameweek = await resolveCurrentEvent();
  let costFailures = [];
  let netted = 0;
  if (gameweek) {
    const { costs, failures } = await collectTransferCosts(
      results.map((r) => r.entry),
      gameweek,
    );
    costFailures = failures;
    for (const row of results) {
      const cost = costs.get(String(row.entry)) ?? 0;
      row.event_total_net = Number(row.event_total ?? 0) - cost;
      row.event_transfers_cost = cost;
      if (cost) netted += 1;
    }
    console.log(
      `单轮成绩已扣转会分：GW${gameweek}，${netted} 人有扣分，${failures.length} 人抓取失败（按未扣分处理）`,
    );
  }

  // 按 entry 升序排序，消除接口返回顺序的不确定性
  results.sort((a, b) => (a.entry ?? 0) - (b.entry ?? 0));

  const previous = await readPrevious();
  const unchanged = previous
    && stable(previous.results || []) === stable(results)
    && stable(previous.league || null) === stable(league || null);

  const updatedAt = unchanged
    ? (previous.updatedAt ?? new Date().toISOString())
    : new Date().toISOString();

  await mkdir('public/data', { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify({
    source: `FPL API leagues-classic/${leagueId}/standings`,
    updatedAt,
    _note: '单轮成绩（event_total_net）= FPL 毛分（event_total）+ 当轮转会扣分（event_transfers_cost）。联赛口径，2026-11-19 定。',
    _gameweek: gameweek,
    league,
    results,
  }, null, 2)}\n`);

  console.log(`Wrote ${OUT_PATH} with ${results.length} league entries.${unchanged ? '（内容无变化，沿用旧时间戳）' : ''}`);

  if (costFailures.length) {
    console.error(`⚠️ ${costFailures.length} 人的转会扣分获取失败（本轮按毛分处理，下轮重试）：`);
    for (const f of costFailures.slice(0, 10)) console.error(`  · entry ${f.entry}：${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
