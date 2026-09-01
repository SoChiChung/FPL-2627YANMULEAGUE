/* ============================================================
 * src/utils/date.js — 日期 / 数字格式化（统一北京时间）
 *
 * 联赛是国内的，所有展示时间一律按北京时间（UTC+8）显示，
 * 不随访问者本地时区变化。
 * 配置里的 deadline 兼容三种写法：
 *   "2026-09-05T01:30:00+08:00"（带偏移）→ 按原样解析
 *   "2026-09-04T17:30:00Z"（UTC）       → 按原样解析
 *   "2026-09-05T01:30:00"（无时区）     → 视为北京时间
 * 推荐用 npm run sync:gameweeks 从 FPL API 同步真实 DDL（已转 +08:00）。
 * ============================================================ */

export const pad2 = (n) => String(n).padStart(2, '0');

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

/** 解析 deadline 字符串为绝对时间；无时区信息的按北京时间（UTC+8）处理 */
export function parseDeadline(str) {
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(str);
  return new Date(hasTimezone ? str : `${str}+08:00`);
}

/** 按北京时间显示 "YYYY-MM-DD HH:mm"，不随访问者时区变化 */
export function formatDateTimeBeijing(d) {
  const bj = new Date(d.getTime() + BEIJING_OFFSET_MS);
  return `${bj.getUTCFullYear()}-${pad2(bj.getUTCMonth() + 1)}-${pad2(bj.getUTCDate())} ${pad2(bj.getUTCHours())}:${pad2(bj.getUTCMinutes())}`;
}

export function formatNumber(n) {
  return n.toLocaleString('zh-CN');
}
