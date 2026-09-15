#!/usr/bin/env node
/* ============================================================
 * scripts/build-fpl-cache.js — FPL 阵容静态缓存构建器
 *
 * 职责：读取 public/config.json 的 classicWinners，
 *       为每个获奖者生成 squad，写入 public/data/cachedSquads.json。
 *       前端只读该文件，浏览器不发任何外部请求。
 *
 * 用法：
 *   npm run build:cache         # Mock 模式（默认，无需联网，本地演示用）
 *   npm run build:cache:real    # 真实模式（请求 FPL 官方 API）
 *
 * 真实接入流程（配合 .github/workflows/update-fpl-cache.yml）：
 *   1. 管理员把获奖者写入 public/config.json
 *      （gameweek / fplId / wechatName / avatar）
 *   2. 定时或手动运行本脚本 --real，脚本依次调用 FPL API：
 *        bootstrap-static                → 球员/球队/位置字典 + 各轮结算状态
 *        entry/<fplId>/event/<gw>/picks/ → 首发/替补/队长/副队长
 *        event/<gw>/live/                → 每个球员得分
 *   3. 结果经 transformPicksToSquad 整理，并附加结算状态 status
 *   4. 写入 public/data/cachedSquads.json 并提交
 *   5. GitHub Pages 部署后前端只读这个静态 JSON
 *
 * ── 结算状态（status）──
 * 前端据此区分「终值」与「临时值」，不再把进行中的快照当成最终结果：
 *   settled —— 该轮已结算（events[].finished === true），快照永久有效
 *   live    —— 该轮进行中，已有比赛结束，得分仍在变化
 *   pending —— DDL 已过但尚无比赛结束，得分全为 0
 *   mock    —— Mock 模式产物（非真实数据）
 *
 * ── 幂等输出（重要）──
 * 本脚本被 CI 每 5 分钟调用一次。若每次运行都刷新 fetchedAt / _generatedAt，
 * 产物将永远存在 diff，导致 CI 每 5 分钟提交一次并反复触发部署。
 * 因此：仅当 squad 实际内容（含 status）变化时才刷新时间戳，
 * 否则沿用上一次的值 —— 保证「数据不变则产物不变」。
 *
 * ── 失败处理 ──
 * 单轮失败不再静默跳过：失败信息收集进 _failures 字段，
 * 且脚本以非 0 退出码结束，让 CI 明确变红。已成功的轮次仍会写出，
 * 避免一轮失败导致整体产物丢失。
 *
 * 演示辅助环境变量：
 *   FPL_CACHE_SKIP_GWS="2,3"  跳过某些轮次不生成缓存，
 *   用于演示「缓存未命中 → 前端缺省状态」的流程。
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

/**
 * 判定某轮的结算状态。
 * 依据 bootstrap-static 的 events[].finished，
 * 配合 event/<gw>/live/ 的 elements 长度（该轮未开赛时为空数组）。
 */
function statusOf(events, gameweek, live) {
  const ev = events.get(gameweek);
  if (!ev) return 'pending';
  if (ev.finished) return 'settled';
  return (live?.elements?.length ?? 0) > 0 ? 'live' : 'pending';
}

/** 规范化序列化：忽略对象键顺序与 undefined，用于稳定比对 */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** 剥离时间戳，得到用于「内容是否变化」判断的形态 */
function withoutTimestamp({ fetchedAt: _ignored, ...rest }) {
  return rest;
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
  // 主配置在 public/config.json（Vite public 目录，运行时以 /config.json 提供）
  const config = JSON.parse(await readFile('public/config.json', 'utf8'));
  const winners = config.classicWinners || [];
  if (!winners.length) {
    console.warn('public/config.json 中暂无 classicWinners，跳过');
    return;
  }

  const previous = await readPrevious();
  const prevByKey = new Map((previous?.squads || []).map((s) => [`${s.gameweek}:${s.fplId}`, s]));

  let bootstrap = null;
  if (REAL) bootstrap = await fetchBootstrapStatic();
  const events = new Map((bootstrap?.events ?? []).map((e) => [e.id, e]));

  const squads = [];
  const failures = [];

  for (const winner of winners) {
    if (SKIP_GWS.has(winner.gameweek)) {
      console.log(`跳过 GW${winner.gameweek}（FPL_CACHE_SKIP_GWS）→ 前端将显示缺省状态`);
      continue;
    }

    try {
      let squad;
      let status;

      if (REAL) {
        const [picks, live] = await Promise.all([
          fetchEntryPicks(winner.fplId, winner.gameweek),
          fetchEventLive(winner.gameweek),
        ]);
        status = statusOf(events, winner.gameweek, live);
        squad = transformPicksToSquad({
          fplId: winner.fplId,
          gameweek: winner.gameweek,
          bootstrap,
          picks,
          live,
        });
      } else {
        status = 'mock';
        squad = generateMockSquad(winner.fplId, winner.gameweek);
      }

      // 幂等：内容（除时间戳外）与上一版一致时沿用旧 fetchedAt，避免无意义 diff
      const prev = prevByKey.get(`${winner.gameweek}:${winner.fplId}`);
      const unchanged = prev
        && stable(withoutTimestamp(prev)) === stable(withoutTimestamp({ ...squad, status }));

      squads.push({
        ...squad,
        status,
        fetchedAt: unchanged ? prev.fetchedAt : new Date().toISOString(),
      });

      console.log(`GW${winner.gameweek} fplId=${winner.fplId}（${REAL ? '真实 FPL API' : 'Mock'} · ${status}）✓`);
    } catch (err) {
      // 单轮失败不中断整体：记录失败，前端对缺失轮次显示缺省状态
      failures.push({ gameweek: winner.gameweek, fplId: winner.fplId, reason: err.message });
      console.error(`GW${winner.gameweek} fplId=${winner.fplId} 获取失败：${err.message}`);
    }
  }

  // 仅当实际内容变化时才刷新文件级时间戳，保证产物幂等
  const dataChanged =
    stable(previous?.squads || []) !== stable(squads)
    || stable(previous?._failures || []) !== stable(failures);

  const output = {
    _generatedBy: 'scripts/build-fpl-cache.js',
    _mode: REAL ? 'real' : 'mock',
    _generatedAt: dataChanged
      ? new Date().toISOString()
      : (previous?._generatedAt ?? new Date().toISOString()),
    _note: '本文件为构建产物，由脚本生成后随仓库提交，前端只读；不要手工编辑。逐轮结算状态见各 squad 的 status 字段。',
    _failures: failures,
    squads,
  };

  await mkdir('public/data', { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  console.log(`已写入 ${OUT_PATH}（${squads.length} 轮，${REAL ? '真实' : 'Mock'} 模式）`);

  if (failures.length) {
    console.error(`⚠️ ${failures.length} 轮获取失败，已记录到 _failures：`);
    for (const f of failures) console.error(`  · GW${f.gameweek} fplId=${f.fplId}：${f.reason}`);
    console.error('产物已写出，但进程以非 0 退出码结束以便 CI 报警。');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('构建失败：', err);
  process.exit(1);
});
