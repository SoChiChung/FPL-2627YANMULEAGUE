/* ============================================================
 * scripts/build-league-standings.js
 *
 * 生成 GitHub Pages 可直接读取的 public/data/leagueStandings.json。
 * FPL standings API 无 CORS，浏览器不能稳定直连，因此真实部署建议在
 * GitHub Actions 或本地执行本脚本，把缓存提交到仓库。
 * ============================================================ */

import { readFile, writeFile, mkdir } from 'node:fs/promises';

const FPL_BASE = 'https://fantasy.premierleague.com/api';
const OUT_PATH = 'public/data/leagueStandings.json';
const PAGE_LIMIT = 50;

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

  await mkdir('public/data', { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify({
    source: `FPL API leagues-classic/${leagueId}/standings`,
    updatedAt: new Date().toISOString(),
    league,
    results,
  }, null, 2)}\n`);

  console.log(`Wrote ${OUT_PATH} with ${results.length} league entries.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
