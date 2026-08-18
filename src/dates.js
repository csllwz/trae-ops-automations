// 日期工具：按团队时区（默认北京时间）计算统计日 T-1 及各天窗口。

/**
 * 返回指定时区下某个时间点的 "YYYY-MM-DD"。
 */
function ymdInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

/**
 * 计算某时区下某个 "YYYY-MM-DD" 当天 [00:00:00.000, 23:59:59.999] 对应的 epoch 毫秒区间。
 * 通过时区偏移换算，避免依赖第三方时区库。
 */
function dayEpochRange(ymd, timeZone) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  const asUtc = new Date(utcMidnight);
  const tzString = asUtc.toLocaleString('en-US', { timeZone });
  const offsetMs = new Date(tzString).getTime() - utcMidnight;
  const startMs = utcMidnight - offsetMs;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return { startMs, endMs };
}

/**
 * 返回指定时区下某个时间点的星期（0=周日 … 6=周六）。
 */
export function weekdayInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
  }).formatToParts(date);
  const wd = parts.find((p) => p.type === 'weekday')?.value;
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[wd] ?? 0;
}

/**
 * 基于 "现在" 计算日报所需的关键日期。
 * @param {string} timeZone 团队时区
 * @param {Date} now 当前时间（可注入，便于测试/mock）
 */
export function computeReportDates(timeZone, now = new Date()) {
  const oneDay = 24 * 60 * 60 * 1000;
  // 统计日 T-1 与其前一日 T-2（用于环比）
  const yesterdayYmd = ymdInTimeZone(new Date(now.getTime() - oneDay), timeZone);
  const dayBeforeYmd = ymdInTimeZone(new Date(now.getTime() - 2 * oneDay), timeZone);

  return {
    yesterdayYmd,
    dayBeforeYmd,
    todayWeekday: weekdayInTimeZone(now, timeZone),
    yesterday: dayEpochRange(yesterdayYmd, timeZone),
    dayBefore: dayEpochRange(dayBeforeYmd, timeZone),
    generatedAtIso: now.toISOString(),
  };
}

/**
 * 计算账期已过天数与总天数（用于日均与预估期末）。
 * @param {number} cycleStartMs 账期开始 epoch 毫秒
 * @param {Date} now 当前时间
 */
export function cycleProgress(cycleStartMs, now = new Date()) {
  const oneDay = 24 * 60 * 60 * 1000;
  const start = new Date(cycleStartMs);
  const nextCycle = new Date(start);
  nextCycle.setUTCMonth(nextCycle.getUTCMonth() + 1);
  const totalDays = Math.max(1, Math.round((nextCycle.getTime() - start.getTime()) / oneDay));
  const elapsedDays = Math.min(
    totalDays,
    Math.max(1, Math.ceil((now.getTime() - cycleStartMs) / oneDay))
  );
  return { totalDays, elapsedDays };
}