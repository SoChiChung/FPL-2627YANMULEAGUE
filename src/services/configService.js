/* ============================================================
 * src/services/configService.js — 主配置读取
 *
 * 只读取 public/config.json —— 这是管理员手工维护的唯一真实配置源。
 *
 * ⚠️ 宁缺毋假：读取失败时**直接抛错**，不再回退任何内置演示配置。
 *    此前这里会兜底到 src/data/mockConfig.js，一旦 config.json 读取失败，
 *    页面会静默渲染一套与真实联赛无关的假赛程、假获奖者、假奖池，
 *    而且只在页脚显示一行小字提示，很容易被忽略。
 *    配置是页面的地基：地基读不到就该让页面明确报错，而不是画一个假的。
 * ============================================================ */

// 注意：文件实际在 public/config.json 下，但运行时访问路径不带 public/ 前缀
const CONFIG_URL = 'config.json';

/** 校验配置结构；不合法直接抛错，绝不放宽到"能渲染就行" */
export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config 不是合法对象');
  if (!Array.isArray(config.gameweeks) || config.gameweeks.length === 0) {
    throw new Error('config 缺少 gameweeks');
  }
  if (!config.league) throw new Error('config 缺少 league');
}

/**
 * 读取并校验主配置。
 *
 * @returns {Promise<{ config: object, source: string }>}
 * @throws {Error} config.json 不可读 / JSON 损坏 / 结构不合法
 */
export async function loadConfig() {
  const res = await fetch(CONFIG_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${CONFIG_URL} 不可读（HTTP ${res.status}）`);

  let config;
  try {
    config = await res.json();
  } catch (err) {
    throw new Error(`${CONFIG_URL} 不是合法 JSON：${err.message}`);
  }

  validateConfig(config);
  return { config, source: CONFIG_URL };
}
