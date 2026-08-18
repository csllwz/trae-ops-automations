// 聚合层：将 Trae Admin API 原始数据整理为日报所需的数值模型。
// 只做纯计算，不发起网络请求，便于单测与 mock。

import { cycleProgress } from './dates.js';

const centsToUsd = (cents) => Math.round((Number(cents) || 0)) / 100;

function pct(curr, prev) {
  if (!prev) return null;
  return (curr - prev) / prev;
}

function sumEventsCharged(events) {
  return events.reduce((acc, e) => acc + (Number(e.chargedCents) || 0), 0);
}

function memberOverallCents(s) {
  const overall = Number(s.overallSpendCents);
  if (Number.isFinite(overall) && overall > 0) return overall;
  return (Number(s.spendCents) || 0) + (Number(s.includedSpendCents) || 0);
}

function eventsInWindow(events, { startMs, endMs }) {
  return events.filter((e) => {
    const ts = Number(e.timestamp);
    return ts >= startMs && ts <= endMs;
  });
}

function usageInDay(dailyUsage, ymd) {
  return dailyUsage.filter((u) => u.day === ymd);
}

/**
 * 构建异常高消耗告警列表。
 */
function buildSpendAlerts(yesterdayMembers, config) {
  const active = yesterdayMembers.filter((m) => m.usd > 0);
  if (active.length === 0) return [];
  const avgUsd = active.reduce((s, m) => s + m.usd, 0) / active.length;

  return active
    .filter((m) => {
      if (m.usd <= config.alertMinSpendUsd) return false;
      return (
        m.usd >= config.alertDailySpendUsd ||
        (avgUsd > 0 && m.usd > config.alertAvgMultiplier * avgUsd)
      );
    })
    .map((m) => {
      const reasons = [];
      if (m.usd >= config.alertDailySpendUsd) reasons.push(`≥$${config.alertDailySpendUsd}`);
      if (avgUsd > 0 && m.usd > config.alertAvgMultiplier * avgUsd)
        reasons.push(`>${config.alertAvgMultiplier}×均值($${avgUsd.toFixed(2)})`);
      return { ...m, reasons };
    });
}

/**
 * 构建部门用量排行。
 * @param {Array} spend 账期成员消费明细
 * @param {Array} yEvents 昨日用量事件
 * @param {Map} nameByEmail 邮箱→姓名映射
 * @param {object} deptMapping 邮箱→部门配置映射
 */
function buildDeptRanking(spend, yEvents, nameByEmail, deptMapping) {
  // 先从成员数据中获取部门，优先 API 返回的 department 字段，其次配置映射
  const emailToDept = new Map();
  for (const s of spend) {
    const dept = s.department || deptMapping[s.email] || '未分配';
    emailToDept.set(s.email, dept);
  }

  // 账期按部门汇总
  const deptCycle = new Map();
  for (const s of spend) {
    const dept = emailToDept.get(s.email) || '未分配';
    const prev = deptCycle.get(dept) || { usd: 0, memberCount: 0 };
    deptCycle.set(dept, {
      usd: prev.usd + centsToUsd(memberOverallCents(s)),
      memberCount: prev.memberCount + 1,
    });
  }

  // 昨日按部门汇总
  const deptYesterday = new Map();
  const yUsdByEmail = new Map();
  for (const e of yEvents) {
    const email = e.userEmail || '未知';
    yUsdByEmail.set(email, (yUsdByEmail.get(email) || 0) + (Number(e.chargedCents) || 0));
  }
  for (const [email, cents] of yUsdByEmail) {
    const dept = emailToDept.get(email) || '未分配';
    const prev = deptYesterday.get(dept) || { usd: 0, memberCount: 0 };
    deptYesterday.set(dept, {
      usd: prev.usd + centsToUsd(cents),
      memberCount: prev.memberCount + 1,
    });
  }

  // 账期排行
  const cycleRanking = [...deptCycle.entries()]
    .map(([dept, v]) => ({ dept, usd: v.usd, memberCount: v.memberCount }))
    .sort((a, b) => b.usd - a.usd);

  // 昨日排行
  const yesterdayRanking = [...deptYesterday.entries()]
    .map(([dept, v]) => ({ dept, usd: v.usd, memberCount: v.memberCount }))
    .sort((a, b) => b.usd - a.usd);

  return { cycleRanking, yesterdayRanking };
}

/**
 * 构建日报数值模型。
 * @param {object} p
 * @param {object} p.dates computeReportDates 结果
 * @param {Array}  p.dailyUsage 每日用量（覆盖 T-2..T-1）
 * @param {Array}  p.spend 账期成员消费
 * @param {number} p.subscriptionCycleStart 账期起点 epoch ms
 * @param {Array}  p.usageEvents 用量事件（覆盖 T-2..T-1）
 * @param {object} p.config 运行配置
 */
export function buildReportModel({ dates, dailyUsage, spend, subscriptionCycleStart, usageEvents, config }) {
  const now = new Date(dates.generatedAtIso);

  // 邮箱 → 姓名映射
  const nameByEmail = new Map();
  for (const s of spend) if (s.email) nameByEmail.set(s.email, s.name || s.email);

  // ===== 成本总览 =====
  const cycleOnDemandUsd = centsToUsd(spend.reduce((a, s) => a + (Number(s.spendCents) || 0), 0));
  const cycleIncludedUsd = centsToUsd(spend.reduce((a, s) => a + (Number(s.includedSpendCents) || 0), 0));
  const cycleOverallUsd = centsToUsd(spend.reduce((a, s) => a + memberOverallCents(s), 0));

  const yEvents = eventsInWindow(usageEvents, dates.yesterday);
  const dEvents = eventsInWindow(usageEvents, dates.dayBefore);
  const yesterdayUsd = centsToUsd(sumEventsCharged(yEvents));
  const dayBeforeUsd = centsToUsd(sumEventsCharged(dEvents));
  const spendDodPct = pct(yesterdayUsd, dayBeforeUsd);

  const { totalDays, elapsedDays } = cycleProgress(subscriptionCycleStart, now);
  const avgDailyUsd = cycleOverallUsd / elapsedDays;
  const projectedCycleEndUsd = avgDailyUsd * totalDays;

  // ===== 产品拆分：Trae IDE vs Trae Work =====
  const yIdeUsd = centsToUsd(
    yEvents.filter((e) => e.product === 'trae_ide').reduce((a, e) => a + (Number(e.chargedCents) || 0), 0)
  );
  const yWorkUsd = centsToUsd(
    yEvents.filter((e) => e.product === 'trae_work').reduce((a, e) => a + (Number(e.chargedCents) || 0), 0)
  );

  // ===== 成员排行 =====
  const yUsdByEmail = new Map();
  for (const e of yEvents) {
    const email = e.userEmail || '未知';
    yUsdByEmail.set(email, (yUsdByEmail.get(email) || 0) + (Number(e.chargedCents) || 0));
  }
  const yesterdayMembers = [...yUsdByEmail.entries()]
    .map(([email, cents]) => ({ email, name: nameByEmail.get(email) || email, usd: centsToUsd(cents) }))
    .sort((a, b) => b.usd - a.usd);
  const yesterdayTop5 = yesterdayMembers.slice(0, 5);

  const cycleTop5 = [...spend]
    .map((s) => ({ email: s.email, name: s.name || s.email, usd: centsToUsd(memberOverallCents(s)) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5);

  // 昨日零活跃人数
  const yUsage = usageInDay(dailyUsage, dates.yesterdayYmd);
  const inactiveCount = yUsage.filter((u) => u.isActive === false).length;
  const totalMembers = yUsage.length || spend.length;

  // 异常高消耗告警
  const alerts = buildSpendAlerts(yesterdayMembers, config);

  // ===== 部门用量排行 =====
  const deptRanking = buildDeptRanking(spend, yEvents, nameByEmail, config.deptMapping);

  // ===== 用量结构 =====
  const reqFields = ['composerRequests', 'chatRequests', 'agentRequests', 'cmdkUsages'];
  const sumReq = (rows) => rows.reduce((a, u) => a + reqFields.reduce((s, f) => s + (Number(u[f]) || 0), 0), 0);
  const yesterdayRequests = sumReq(yUsage);
  const dayBeforeRequests = sumReq(usageInDay(dailyUsage, dates.dayBeforeYmd));
  const reqDodPct = pct(yesterdayRequests, dayBeforeRequests);

  const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
  for (const e of yEvents) {
    const t = e.tokenUsage;
    if (!t) continue;
    tokens.input += Number(t.inputTokens) || 0;
    tokens.output += Number(t.outputTokens) || 0;
    tokens.cacheRead += Number(t.cacheReadTokens) || 0;
    tokens.cacheWrite += Number(t.cacheWriteTokens) || 0;
  }
  tokens.total = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite;

  const usdByModel = new Map();
  for (const e of yEvents) {
    const model = e.model || '未知';
    usdByModel.set(model, (usdByModel.get(model) || 0) + (Number(e.chargedCents) || 0));
  }
  const topModels = [...usdByModel.entries()]
    .map(([model, cents]) => ({ model, usd: centsToUsd(cents) }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 3);

  // ===== 行动建议 =====
  const includeSuggestions = dates.todayWeekday === config.suggestionWeekday;
  const suggestions = includeSuggestions
    ? buildSuggestions({
        spendDodPct,
        projectedCycleEndUsd,
        cycleOverallUsd,
        alerts,
        inactiveCount,
        totalMembers,
      })
    : [];

  return {
    header: {
      title: 'Trae 团队用量日报',
      statDay: dates.yesterdayYmd,
      cycleStartYmd: new Date(subscriptionCycleStart).toISOString().slice(0, 10),
      generatedAtIso: dates.generatedAtIso,
    },
    cost: {
      cycleOnDemandUsd,
      cycleIncludedUsd,
      cycleOverallUsd,
      yesterdayUsd,
      dayBeforeUsd,
      spendDodPct,
      avgDailyUsd,
      projectedCycleEndUsd,
      cycleProgress: { totalDays, elapsedDays },
      yIdeUsd,
      yWorkUsd,
    },
    members: { yesterdayTop5, cycleTop5, inactiveCount, totalMembers, alerts },
    deptRanking,
    usage: { yesterdayRequests, dayBeforeRequests, reqDodPct, tokens, topModels },
    suggestions,
    includeSuggestions,
  };
}

function buildSuggestions({ spendDodPct, projectedCycleEndUsd, cycleOverallUsd, alerts, inactiveCount, totalMembers }) {
  const out = [];
  if (spendDodPct != null && spendDodPct >= 0.5) {
    out.push(`昨日费用环比上涨 ${(spendDodPct * 100).toFixed(0)}%，建议核查是否有异常长会话或大模型批量调用。`);
  }
  if (alerts.length > 0) {
    out.push(`有 ${alerts.length} 名成员昨日消耗偏高，建议确认用途并视情况设置每人消费上限。`);
  }
  if (projectedCycleEndUsd > cycleOverallUsd * 1.2 && cycleOverallUsd > 0) {
    out.push(`按当前日均预估期末约 $${projectedCycleEndUsd.toFixed(2)}，建议关注预算并评估是否调整套餐或限额。`);
  }
  if (inactiveCount > 0 && inactiveCount >= totalMembers * 0.3) {
    out.push(`昨日有 ${inactiveCount}/${totalMembers} 名成员零活跃，建议回收闲置席位或加强推广。`);
  }
  if (out.length === 0) out.push('各项指标平稳，无需特别关注。');
  return out.slice(0, 3);
}