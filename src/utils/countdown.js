/* ============================================================
 * src/utils/countdown.js — 倒计时计算与格式化
 * ============================================================ */

import { pad2 } from './date.js';

/** 计算距 targetTime 的剩余时间；已过期时 expired = true */
export function getCountdownParts(targetTime, now = Date.now()) {
  const diff = targetTime - now;
  if (diff <= 0) {
    return { expired: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const total = Math.floor(diff / 1000);
  return {
    expired: false,
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

export function formatCountdown(parts) {
  return `${parts.days}天 ${pad2(parts.hours)}小时 ${pad2(parts.minutes)}分 ${pad2(parts.seconds)}秒`;
}
