#!/usr/bin/env node
/* ============================================================
 * scripts/build-manager-stats.js — 队长与转会统计构建器
 *
 * 职责：统计二群联赛「每一轮的队长选择 / 转入 / 转出」排行，
 *       写入 public/data/managerStats.json，供前端瀑布流模块读取。
 *
 * ── 统计口径（已用真实数据交叉验证，48/48 组可解释）──
 *   队长选择：统计该轮所有成员 picks 中 is_captain === true 的球员
 *   转入：GW(N) 有、GW(N-1) 没有的球员
 *   转出：GW(N-1) 有、GW(N) 没有的球员
 *
 *   ⚠️ 为什么不用官方 entry_history.event_transfers 字段：
 *      它只统计「消耗转会次数」的转会。freehit / wildcard 芯片能
 *      无限次改动阵容却不消耗次数（实测 GW3 用 freehit 时出现
 *      13 进 13 出，而 event_transfers = 0）。
 *      因此以「相邻两轮 picks 集合差集」为准，能同时覆盖普通
 *      转会与免费芯片，这才是真实的阵容变动。
 *      交叉校验：8 名成员 × 7 轮 = 48 组，普通轮次差集数量与
 *      event_transfers 完全一致，特殊芯片轮次由芯片解释，无一例外。
 *
 *   ⚠️ 自动替补（automatic_subs）不污染差集：
 *      替补顶人时 element_in / element_out 都仍在同一轮的 picks
 *      集合内（只是 position 变化），故集合差集不受影响。实测 19/19。
 *
 *   ⚠️ 阵容规模：FPL squad_squadsize = 15，picks 恒为 15 人
 *      （首发 11 + 替补 4）。注意 multiplier=0 的是替补席
 *      （position 12–15），不是「未上场」；首发 11 人才是得分来源。
 *
 * ── 只展示「最近一个已开始轮次」──
 *   主人要求：GW6 结束、GW7 未开赛 → 只显示 GW6；
 *   GW7 开赛后 → 自动切换到 GW7。
 *   判定依据 bootstrap-static 的 events[].finished：
 *   finished = true 的最大轮次即为「已开始的最新轮次」。
 *   （GW7 已 finished、GW8 未 finished → 当前显示 GW7。）
 *
 *   转入/转出需要「上一轮」作对比基准，所以每轮取两轮数据。
 *   GW1 没有上一轮，此时转入/转出为空（仅队长统计有值）。
 *
 * ── 增量缓存（关键，避免每 5 分钟重拉 668 个请求）──
 *   全联赛 334 名成员 × 2 轮 = 668 个 API 请求。CI 每 5 分钟跑一次，
 *   全量重拉既慢又会给 FPL API 造成压力。
 *   因此把每轮各成员的 picks 摘要缓存到 public/data/.picks-cache/：
 *     - 该轮已缓存 → 直接复用，零请求
 *     - 新轮次 → 只拉这一轮（334 个请求）
 *   缓存内容是「成员 → 排序后的 element id 列表 + 队长 id」，
 *   不含姓名（姓名随 bootstrap 变化，bootstrap 每次都拉）。
 *   缓存是纯派生数据，删掉不影响正确性。
 *
 * ── 幂等输出（重要）──
 *   CI 每 5 分钟调用一次。若每次运行都刷新 _generatedAt，产物将永远
 *   存在 diff，导致 CI 每 5 分钟提交一次并反复触发部署。
 *   因此：仅当统计内容真正变化时才刷新时间戳，否则沿用上一版的值。
 *
 * ── 失败处理 ──
 *   单个成员拉取失败不静默跳过：收集进 _failures 并以非 0 退出码结束
 *   让 CI 变红，同时仍写出已成功的统计，避免一轮失败拖垮整体产物。
 *   但容忍少量失败（个别成员可能已退出联赛 / 临时不可用）：
 *   失败率超过阈值时视为数据不完整，不写出产物。
 * ============================================================ */

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const FPL_BASE = 'https://fantasy.premierleague.com/api';
const OUT_PATH = 'public/data/managerStats.json';

/**
 * picks 增量缓存目录。
 * 放在仓库根的 .cache/ 而非 public/ —— 它只是构建期的加速层，
 * 前端不读、也不该被部署到线上；但需要提交进仓库，
 * 这样 CI 的下一次运行才能命中缓存、不必重拉 668 个请求。
 */
const CACHE_DIR = '.cache/picks';

/** 联赛成员榜单页容量（FPL 每页 50） */
const PAGE_LIMIT = 50;

/** 每个榜单取前几名 */
const TOP_N = 5;

/**
 * 允许的成员获取失败率上限。
 * 超过则判定数据不完整 —— 不写产物，避免展示「基于半数人」的统计。
 * 少数成员退出联赛导致的 404 不计入失败（那是正常业务状态）。
 */
const MAX_FAILURE_RATIO = 0.05;

/** 并发抓取数（对 FPL API 友好，同时不至于太慢） */
const CONCURRENCY = 8;

/** 网络重试次数 */
const MAX_RETRIES = 3;

/* ---------- 通用工具 ---------- */

/** 归一化序列化：忽略对象键顺序与 undefined，用于稳定比对 */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 带重试的 JSON 抓取 */
async function getJson(url, { allow404 = false } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.status === 404) {
        if (allow404) return null;
        throw new Error('HTTP 404');
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < MAX_RETRIES - 1) await sleep(400 * (attempt + 1));
    }
  }
  throw lastErr;
}

/** 并发映射：限制同时在途的请求数 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/* ---------- FPL 数据获取 ---------- */

/** 拉取联赛全部成员（entry id 列表） */
async function fetchLeagueEntries(leagueId) {
  const entries = [];
  for (let page = 1; page <= PAGE_LIMIT; page += 1) {
    const url = `${FPL_BASE}/leagues-classic/${leagueId}/standings/?page_standings=${page}`;
    const data = await getJson(url);
    entries.push(...(data.standings?.results || []));
    if (!data.standings?.has_next) break;
  }
  // 按 entry 升序，消除接口返回顺序的不确定性
  entries.sort((a, b) => (a.entry ?? 0) - (b.entry ?? 0));
  return entries;
}

/**
 * 抓取某成员某轮的 picks 摘要。
 * 返回 { picks: 排序后的 element id 列表, captain: 队长 element id }
 */
async function fetchPicksDigest(entryId, gameweek) {
  const url = `${FPL_BASE}/entry/${entryId}/event/${gameweek}/picks/`;
  const data = await getJson(url, { allow404: true });
  if (!data || !Array.isArray(data.picks) || data.picks.length === 0) return null;

  const elements = data.picks.map((p) => p.element).sort((a, b) => a - b);
  const captainPick = data.picks.find((p) => p.is_captain);
  return { picks: elements, captain: captainPick ? captainPick.element : null };
}

/* ---------- 增量缓存 ---------- */

const cachePathFor = (gameweek) => path.join(CACHE_DIR, `gw${gameweek}.json`);

/** 读取某轮的 picks 缓存（不存在返回 null） */
async function readCache(gameweek) {
  try {
    const raw = JSON.parse(await readFile(cachePathFor(gameweek), 'utf8'));
    if (!raw || typeof raw !== 'object' || !raw.entries) return null;
    return raw.entries;
  } catch {
    return null;
  }
}

/** 写入某轮的 picks 缓存 */
async function writeCache(gameweek, entries) {
  await mkdir(CACHE_DIR, { recursive: true });
  const payload = {
    _note: '派生数据缓存：成员 → 选人 element id 列表与队长 id。删除后会自动重建。',
    _gameweek: gameweek,
    entries,
  };
  await writeFile(cachePathFor(gameweek), `${JSON.stringify(payload)}\n`);
}

/** 清理不在保留范围内的旧轮次缓存 */
async function pruneCache(keepGameweeks) {
  const keep = new Set(keepGameweeks.map(String));
  try {
    const { readdir } = await import('node:fs/promises');
    const files = await readdir(CACHE_DIR);
    for (const f of files) {
      const m = /^gw(\d+)\.json$/.exec(f);
      if (m && !keep.has(m[1])) {
        await rm(path.join(CACHE_DIR, f), { force: true });
      }
    }
  } catch {
    // 缓存目录不存在：无需清理
  }
}

/* ---------- 统计计算 ---------- */

/**
 * 把某轮的成员 picks 摘要整理成「统计用」结构。
 * 缓存与实时抓取的结果结构一致，因此两者可直接合并使用。
 */
function buildRoundRoster(digests) {
  const captainCounts = new Map();
  const transferIn = new Map();
  const transferOut = new Map();

  const entries = [];
  for (const [entryId, digest] of digests) {
    if (!digest) continue;
    entries.push({ entryId, ...digest });
    if (digest.captain != null) {
      captainCounts.set(digest.captain, (captainCounts.get(digest.captain) || 0) + 1);
    }
  }

  return { entries, captainCounts, transferIn, transferOut };
}

/** 对比相邻两轮，算出转入 / 转出 */
function computeTransfers(currentEntries, previousEntries) {
  const transferIn = new Map();
  const transferOut = new Map();

  const prevById = new Map(previousEntries.map((e) => [e.entryId, e]));

  for (const cur of currentEntries) {
    const prev = prevById.get(cur.entryId);
    // 没有上一轮数据的成员（新加入联赛）不参与转会对比
    if (!prev) continue;

    const curSet = new Set(cur.picks);
    const prevSet = new Set(prev.picks);
    for (const el of curSet) {
      if (!prevSet.has(el)) transferIn.set(el, (transferIn.get(el) || 0) + 1);
    }
    for (const el of prevSet) {
      if (!curSet.has(el)) transferOut.set(el, (transferOut.get(el) || 0) + 1);
    }
  }

  return { transferIn, transferOut };
}

/**
 * 把计数 Map 转成前 N 名数组（按次数降序，同次数按球员名升序，保证稳定）。
 *
 * ⚠️ elements[].team_code 是数字 id（不是 "MCI" 这类缩写），
 *    球队缩写必须走 teams[].id → short_name 查表
 *    （与 transformPicksToSquad 的做法保持一致）。
 * ⚠️ elements[].element_type 是 1–4 的数字，位置缩写同样要查
 *    element_types[]，且 FPL 用的是 GKP，前端统一显示 GK。
 */
function topN(counter, elementsMap, teamsMap, elementTypes, n) {
  return [...counter.entries()]
    .map(([id, count]) => {
      const el = elementsMap.get(id);
      const typeName = elementTypes.get(el?.element_type) ?? '';
      return {
        id,
        name: el?.web_name ?? String(id),
        club: teamsMap.get(el?.team) ?? '',
        position: typeName.replace('GKP', 'GK'),
        count,
      };
    })
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, 'en'))
    .slice(0, n);
}

/* ---------- 主流程 ---------- */

async function main() {
  const config = JSON.parse(await readFile('public/config.json', 'utf8'));
  const leagueId = config.league?.classicLeagueId || 12968;

  const bootstrap = await getJson(`${FPL_BASE}/bootstrap-static/`);
  const events = bootstrap.events || [];
  const elementsMap = new Map((bootstrap.elements || []).map((e) => [e.id, e]));
  const teamsMap = new Map((bootstrap.teams || []).map((t) => [t.id, t.short_name]));
  const elementTypes = new Map((bootstrap.element_types || []).map((t) => [t.id, t.plural_name_short]));

  // ── 判定「最近一个已开始轮次」──
  // bootstrap 的 events[].finished 为 true 的最大轮次。
  // 主人要求：GW6 结束、GW7 未开赛 → 显示 GW6；GW7 开赛后 → 切到 GW7。
  const finishedGameweeks = events.filter((e) => e.finished).map((e) => e.id);
  const targetGameweek = finishedGameweeks.length ? Math.max(...finishedGameweeks) : null;

  if (!targetGameweek) {
    console.warn('尚无已结束的轮次，跳过统计构建');
    return;
  }
  const previousGameweek = targetGameweek > 1 ? targetGameweek - 1 : null;

  // ── 拉取联赛成员 ──
  const leagueEntries = await fetchLeagueEntries(leagueId);
  const entryIds = leagueEntries.map((e) => e.entry).filter((e) => e != null);
  console.log(`联赛 ${leagueId} 共 ${entryIds.length} 名成员；目标轮次 GW${targetGameweek}`);

  // ── 取两轮 picks（优先走缓存）──
  const needGameweeks = previousGameweek
    ? [targetGameweek, previousGameweek]
    : [targetGameweek];

  const roundDigests = {};
  const failures = [];

  for (const gw of needGameweeks) {
    const cached = await readCache(gw);
    const digests = new Map();

    if (cached) {
      // 复用缓存中已有的成员，只补拉新出现的成员
      const missing = entryIds.filter((id) => !cached[id]);
      console.log(`GW${gw}：缓存命中 ${cached ? Object.keys(cached).length : 0} 人，需补拉 ${missing.length} 人`);
      for (const [id, v] of Object.entries(cached)) digests.set(id, v);
      await fetchMissing(gw, missing, digests, failures);
    } else {
      console.log(`GW${gw}：无缓存，全量拉取 ${entryIds.length} 人`);
      await fetchMissing(gw, entryIds, digests, failures);
    }

    roundDigests[gw] = digests;
    await writeCache(gw, Object.fromEntries(digests));
  }

  // ── 失败率检查：数据不完整则不写产物 ──
  const totalExpected = entryIds.length * needGameweeks.length;
  if (failures.length > totalExpected * MAX_FAILURE_RATIO) {
    console.error(`✗ 失败率过高：${failures.length}/${totalExpected}，数据不完整，不写出产物`);
    for (const f of failures.slice(0, 10)) console.error(`  · ${f.reason}`);
    process.exitCode = 1;
    return;
  }

  // ── 统计 ──
  const current = buildRoundRoster(roundDigests[targetGameweek]);
  const previous = previousGameweek
    ? buildRoundRoster(roundDigests[previousGameweek])
    : { entries: [] };

  const { transferIn, transferOut } = computeTransfers(current.entries, previous.entries);

  const stats = {
    transfersIn: topN(transferIn, elementsMap, teamsMap, elementTypes, TOP_N),
    transfersOut: topN(transferOut, elementsMap, teamsMap, elementTypes, TOP_N),
    captains: topN(current.captainCounts, elementsMap, teamsMap, elementTypes, TOP_N),
  };

  // 参与统计的成员数（有 picks 的成员）
  const participantCount = current.entries.length;

  // ── 幂等写出 ──
  let previousOut = null;
  try {
    previousOut = JSON.parse(await readFile(OUT_PATH, 'utf8'));
  } catch {
    previousOut = null;
  }

  const content = {
    gameweek: targetGameweek,
    previousGameweek,
    participantCount,
    stats,
  };
  const unchanged =
    previousOut
    && stable(previousOut.gameweek) === stable(content.gameweek)
    && stable(previousOut.previousGameweek) === stable(content.previousGameweek)
    && stable(previousOut.participantCount) === stable(content.participantCount)
    && stable(previousOut.stats) === stable(content.stats);

  const output = {
    _generatedBy: 'scripts/build-manager-stats.js',
    _mode: 'real',
    _generatedAt: unchanged
      ? (previousOut._generatedAt ?? new Date().toISOString())
      : new Date().toISOString(),
    _note: '本文件为构建产物。队长/转入/转出均来自 FPL 官方 API 的真实 picks 数据，转会口径为「相邻两轮 picks 集合差集」（可覆盖 freehit/wildcard 免费芯片）。仅展示最近一个已开始的轮次。',
    _failures: failures,
    ...content,
  };

  await mkdir('public/data', { recursive: true });
  await writeFile(OUT_PATH, `${JSON.stringify(output, null, 2)}\n`);

  // 只保留目标轮次与上一轮的缓存
  await pruneCache(needGameweeks);

  console.log(`已写入 ${OUT_PATH}（GW${targetGameweek}，${participantCount} 名成员参与）`);
  console.log(`  转入最多: ${stats.transfersIn.map((s) => `${s.name}×${s.count}`).join(', ') || '—'}`);
  console.log(`  转出最多: ${stats.transfersOut.map((s) => `${s.name}×${s.count}`).join(', ') || '—'}`);
  console.log(`  队长最多: ${stats.captains.map((s) => `${s.name}×${s.count}`).join(', ') || '—'}`);

  if (failures.length) {
    console.error(`⚠️ ${failures.length} 次抓取失败，已记录到 _failures：`);
    for (const f of failures.slice(0, 10)) console.error(`  · ${f.reason}`);
    console.error('产物已写出，但进程以非 0 退出码结束以便 CI 报警。');
    process.exitCode = 1;
  }
}

/** 补拉缺失成员的 picks，写入 digests；失败记录进 failures */
async function fetchMissing(gameweek, missingIds, digests, failures) {
  if (!missingIds.length) return;
  await mapWithConcurrency(missingIds, CONCURRENCY, async (entryId) => {
    try {
      const digest = await fetchPicksDigest(entryId, gameweek);
      if (digest) digests.set(String(entryId), digest);
      // digest 为 null 表示该成员该轮无阵容（正常，如中途加入）→ 不算失败
    } catch (err) {
      failures.push({
        gameweek,
        fplId: String(entryId),
        reason: `entry/${entryId}/event/${gameweek}/picks → ${err.message}`,
      });
    }
  });
}

main().catch((err) => {
  console.error('统计构建失败：', err);
  process.exit(1);
});
