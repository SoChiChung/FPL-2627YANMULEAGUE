#!/usr/bin/env node
/* ============================================================
 * scripts/build-fpl-cache.js — FPL 阵容静态缓存构建器
 *
 * 职责：读取根目录 config.json 的 weeklyWinners，
 *       为每个获奖者生成 squad，写入 public/data/cachedSquads.json。
 *       前端只读该文件，浏览器不发任何外部请求。
 *
 * 用法：
 *   npm run build:cache         # Mock 模式（默认，无需联网，本地演示用）
 *   npm run build:cache:real    # 真实模式（请求 FPL 官方 API）
 *
 * 真实接入流程（配合 .github/workflows/update-fpl-cache.yml）：
 *   1. 每轮 Deadline 后，管理员把获奖者写入 config.json
 *      （gameweek / fplId / wechatName / avatar）
 *   2. 定时或手动运行本脚本 --real，脚本依次调用 FPL API：
 *        bootstrap-static            → 球员/球队/位置字典
 *        entry/<fplId>/event/<gw>/picks/ → 首发/替补/队长/副队长
 *        event/<gw>/live/            → 每个球员得分
 *   3. 结果经 transformPicksToSquad 整理成前端直接可读的结构
 *   4. 写入 public/data/cachedSquads.json 并提交
 *   5. GitHub Pages 部署后前端只读这个静态 JSON
 *
 * 演示辅助环境变量：
 *   FPL_CACHE_SKIP_GWS="2,3"  跳过某些轮次不生成缓存，
 *   用于演示“缓存未命中 → 前端 Mock 兜底”的流程。
 * ============================================================ */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { generateMockSquad } from '../src/data/mockSquads.js';
import {
  fetchBootstrapStatic,
  fetchEntryPicks,
  fetchEventLive,
  transformPicksToSquad,
} from '../src/services/fplApiClient.js';

const REAL = process.argv.includes('--real');
const SKIP_GWS = new Set(
  (process.env.FPL_CACHE_SKIP_GWS || '')
    .split(',')
    .map((n) => Number(n))
    .filter(Boolean),
);

const OUT_PATH = 'public/data/cachedSquads.json';

async function main() {
  // 主配置在 public/config.json（Vite public 目录，运行时以 /config.json 提供）
  const config = JSON.parse(await readFile('public/config.json', 'utf8'));
  const winners = config.classicWinners || [];
  if (!winners.length) {
    console.warn('public/config.json 中暂无 classicWinners，跳过');
    return;
  }

  let bootstrap = null;
  if (REAL) bootstrap = await fetchBootstrapStatic();

  const squads = [];
  for (const winner of winners) {
    if (SKIP_GWS.has(winner.gameweek)) {
      console.log(`跳过 GW${winner.gameweek}（FPL_CACHE_SKIP_GWS）→ 前端将走 Mock 兜底`);
      continue;
    }

    try {
      if (REAL) {
        const [picks, live] = await Promise.all([
          fetchEntryPicks(winner.fplId, winner.gameweek),
          fetchEventLive(winner.gameweek),
        ]);
        squads.push(transformPicksToSquad({
          fplId: winner.fplId,
          gameweek: winner.gameweek,
          bootstrap,
          picks,
          live,
        }));
        console.log(`GW${winner.gameweek} fplId=${winner.fplId}（真实 FPL API）✓`);
      } else {
        squads.push(generateMockSquad(winner.fplId, winner.gameweek));
        console.log(`GW${winner.gameweek} fplId=${winner.fplId}（Mock 生成）✓`);
      }
    } catch (err) {
      // 单轮失败不中断整体：跳过该轮，前端会用 Mock 兜底展示
      console.error(`GW${winner.gameweek} fplId=${winner.fplId} 获取失败，已跳过：`, err.message);
    }
  }

  const output = {
    _generatedBy: 'scripts/build-fpl-cache.js',
    _mode: REAL ? 'real' : 'mock',
    _note: '本文件为构建产物，由脚本生成后随仓库提交，前端只读；不要手工编辑。',
    squads,
  };

  await mkdir('public/data', { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`已写入 ${OUT_PATH}（${squads.length} 轮，${REAL ? '真实' : 'Mock'} 模式）`);
}

main().catch((err) => {
  console.error('构建失败：', err);
  process.exit(1);
});
