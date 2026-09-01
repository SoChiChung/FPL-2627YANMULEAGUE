/* ============================================================
 * src/services/configService.js — 主配置读取
 *
 * 优先读取根目录 config.json（管理员手工维护的真实配置）；
 * 读取失败（未部署 / 文件缺失 / JSON 损坏）时回退到
 * src/data/mockConfig.js 内置演示配置，保证页面永远可渲染。
 * ============================================================ */

import { mockConfig } from '../data/mockConfig.js';

export function validateConfig(config) {
  if (!config || typeof config !== 'object') throw new Error('config 不是合法对象');
  if (!Array.isArray(config.gameweeks) || config.gameweeks.length === 0) {
    throw new Error('config 缺少 gameweeks');
  }
  if (!config.league) throw new Error('config 缺少 league');
}

/**
 * 返回 { config, source, isDemo }。
 * source：数据来源说明；isDemo：是否使用内置演示配置。
 */
export async function loadConfig() {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const config = await res.json();
    validateConfig(config);
    return { config, source: 'config.json', isDemo: false };
  } catch (err) {
    console.warn('[configService] config.json 读取失败，回退到内置演示配置：', err);
    validateConfig(mockConfig);
    return { config: mockConfig, source: '内置演示配置 src/data/mockConfig.js', isDemo: true };
  }
}
