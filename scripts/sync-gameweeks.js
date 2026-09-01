#!/usr/bin/env node
/* ============================================================
 * scripts/sync-gameweeks.js — 从 FPL 官方 API 同步真实 DDL
 *
 * 读取 bootstrap-static 的 events（权威的 Deadline 数据源），
 * 把 public/config.json 的 gameweeks 更新为最新真实 DDL，
 * 统一转成北京时间（UTC+8）ISO 字符串存储。
 *
 * 用法：
 *   npm run sync:gameweeks
 *
 * FPL API 返回的 deadline_time 是 UTC（如 2026-09-04T17:30:00Z），
 * 转换后写入 config：2026-09-05T01:30:00+08:00（北京）。
 * ============================================================ */

import { readFile, writeFile } from 'node:fs/promises';
import { fetchBootstrapStatic } from '../src/services/fplApiClient.js';

const CONFIG_PATH = 'public/config.json';
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** UTC ISO → 北京时间 ISO（带 +08:00 偏移） */
function toBeijingIso(utcIso) {
  const bj = new Date(new Date(utcIso).getTime() + BEIJING_OFFSET_MS);
  const p = (n) => String(n).padStart(2, '0');
  return `${bj.getUTCFullYear()}-${p(bj.getUTCMonth() + 1)}-${p(bj.getUTCDate())}T${p(bj.getUTCHours())}:${p(bj.getUTCMinutes())}:${p(bj.getUTCSeconds())}+08:00`;
}

async function main() {
  const bootstrap = await fetchBootstrapStatic();
  const events = bootstrap.events || [];
  if (!events.length) throw new Error('bootstrap-static 中没有 events');

  const config = JSON.parse(await readFile(CONFIG_PATH, 'utf8'));
  const gameweeks = events.map((e) => ({ gameweek: e.id, deadline: toBeijingIso(e.deadline_time) }));
  config.gameweeks = gameweeks;

  await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);

  console.log(`已从 FPL API 同步 ${gameweeks.length} 轮 DDL 到 ${CONFIG_PATH}（北京时间）：`);
  for (const gw of gameweeks.slice(0, 6)) {
    console.log(`  GW${gw.gameweek} → ${gw.deadline}`);
  }
}

main().catch((err) => {
  console.error('同步失败：', err);
  process.exit(1);
});
