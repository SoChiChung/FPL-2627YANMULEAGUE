/* ============================================================
 * scripts/build-league-standings.js
 *
 * 生成 GitHub Pages 可直接读取的 public/data/leagueStandings.json。
 * FPL standings API 无 CORS，浏览器不能稳定直连，因此在
 * GitHub Actions 或本地执行本脚本，把缓存提交到仓库。
 *
 * ── 幂等输出（重要）──
 * 本脚本被 CI 每 5 分钟调用一次。若每次运行都无条件重写文件，
 * 产物将永远存在 diff，导致 CI 每 5 分钟提交一次并反复触发部署。
 * 因此做了两件事：
 *   1. results 按 entry 升序排序 —— FPL 接口返回顺序不保证稳定，
 *      不排序则同一份数据每次排列都不同。
 *   2. 仅当内容（results / league）真正变化时才刷新 updatedAt，
 *      否则沿用上一版的值 —— 保证「数据不变则产物不变」。
 * ============================================================ */

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const FPL_BASE = 'https://fantasy.premierleague.com/api';
const OUT_PATH = 'public/data/leagueStandings.json';
const PAGE_LIMIT = 50;

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

async function main() {
  const config = JSON.parse(await readFile('public/config.json', 'utf8'));
  const leagueId = config.league?.classicLeagueId || 12968;

  const results = [];
  let league = null;

  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const url = `${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`FPL standings page ${page} failed: HTTP ${res.status}`);
    const data = await res.json();
    league = league || data.league || { id: leagueId };
    results.push(...(data.standings?.results || []));
    if (!data.standings?.has_next) break;
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
    league,
    results,
  }, null, 2)}\n`);

  console.log(`Wrote ${OUT_PATH} with ${results.length} league entries.${unchanged ? '（内容无变化，沿用旧时间戳）' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
