// 聚合层：将 Trae Admin API 原始数据整理为日报所需的数值模型。
// 只做纯计算，不发起网络请求，便于单测与 mock。

import { cycleProgress } from './dates.js';

/** 将金额字符串解析为浮点数（Trae API 返回 "1.500000" 格式） */
function parseAmount(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

function pct(curr, prev) {
  if (!prev) return null;
  return (curr - prev) / prev;
}

/**
 * 从 user-model-usage 条目中提取成员总费用（所有模型合计）。
 * @returns {{ totalUsd: number, basicUsd: number, payGoUsd: number }}
 */
function memberTotalUsd(item) {
  let basic = 0;
  let payGo = 0;
  for (const mu of item.model_usage || []) {
    if (mu.amount) {
      basic += parseAmount(mu.amount.basic_amount);
      payGo += parseAmount(mu.amount.pay_go_amount);
    }
  }
  return { totalUsd: basic + payGo, basicUsd: basic, payGoUsd: payGo };
}

/**
 * 从 user-model-usage 条目中提取 Token 总量。
 */
function memberTokens(item) {
  let input = 0;
  let output = 0;
  for (const mu of item.model_usage || []) {
    if (mu.usage) {
      input += mu.usage.input_tokens || 0;
      output += mu.usage.output_tokens || 0;
    }
  }
  return { input, output };
}

/**
 * 从 user-model-usage 全量数据中汇总各模型费用。
 */
function sumByModel(usageList) {
  const map = new Map();
  for (const item of usageList) {
    for (const mu of item.model_usage || []) {
      const name = mu.model_name || '未知模型';
      const usd = mu.amount ? parseAmount(mu.amount.total_amount) : 0;
      map.set(name, (map.get(name) || 0) + usd);
    }
  }
  return [...map.entries()]
    .map(([model, usd]) => ({ model, usd }))
    .sort((a, b) => b.usd - a.usd);
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
 * @param {Array} users 成员列表
 * @param {Array} yesterdayUsage 昨日用量
 * @param {Array} cycleUsage 账期用量
 * @param {object} deptMapping 邮箱→部门配置映射（兜底）
 */
function buildDeptRanking(users, yesterdayUsage, cycleUsage, deptMapping) {
  // 邮箱→部门映射（优先 API 返回的 department，其次配置映射）
  const emailToDept = new Map();
  for (const u of users) {
    emailToDept.set(u.email, u.department || deptMapping[u.email] || '未分配');
  }

  // 昨日按部门汇总
  const deptYesterday = new Map();
  for (const item of yesterdayUsage) {
    const dept = emailToDept.get(item.email) || '未分配';
    const usd = memberTotalUsd(item).totalUsd;
    const prev = deptYesterday.get(dept) || { usd: 0, memberCount: 0 };
    deptYesterday.set(dept, {
      usd: prev.usd + usd,
      memberCount: prev.memberCount + 1,
    });
  }

  // 账期按部门汇总
  const deptCycle = new Map();
  for (const item of cycleUsage) {
    const dept = emailToDept.get(item.email) || '未分配';
    const usd = memberTotalUsd(item).totalUsd;
    const prev = deptCycle.get(dept) || { usd: 0, memberCount: 0 };
    deptCycle.set(dept, {
      usd: prev.usd + usd,
      memberCount: prev.memberCount + 1,
    });
  }

  const yesterdayRanking = [...deptYesterday.entries()]
    .map(([dept, v]) => ({ dept, ...v }))
    .sort((a, b) => b.usd - a.usd);

  const cycleRanking = [...deptCycle.entries()]
    .map(([dept, v]) => ({ dept, ...v }))
    .sort((a, b) => b.usd - a.usd);

  return { yesterdayRanking, cycleRanking };
}

/**
 * 构建日报数值模型。
 * @param {object} p
 * @param {object} p.dates computeReportDates 结果
 * @param {Array}  p.users 成员列表
 * @param {Array}  p.yesterdayUsage 昨日用量
 * @param {Array}  p.dayBeforeUsage 前日用量
 * @param {Array}  p.cycleUsage 账期总用量
 * @param {number} p.cycleStartMs 账期起点 epoch ms
 * @param {object} p.config 运行配置
 */
export function buildReportModel({ dates, users, yesterdayUsage, dayBeforeUsage, cycleUsage, cycleStartMs, config }) {
  const now = new Date(dates.generatedAtIso);

  // 邮箱→姓名映射
  const nameByEmail = new Map();
  for (const u of users) {
    nameByEmail.set(u.email, u.name || u.email);
  }

  // ===== 成本总览 =====
  let cycleOnDemandUsd = 0;
  let cycleIncludedUsd = 0;
  for (const item of cycleUsage) {
    const { basicUsd, payGoUsd } = memberTotalUsd(item);
    cycleIncludedUsd += basicUsd;
    cycleOnDemandUsd += payGoUsd;
  }
  const cycleOverallUsd = cycleOnDemandUsd + cycleIncludedUsd;

  let yesterdayUsd = 0;
  for (const item of yesterdayUsage) {
    yesterdayUsd += memberTotalUsd(item).totalUsd;
  }

  let dayBeforeUsd = 0;
  for (const item of dayBeforeUsage) {
    dayBeforeUsd += memberTotalUsd(item).totalUsd;
  }

  const spendDodPct = pct(yesterdayUsd, dayBeforeUsd);

  const { totalDays, elapsedDays } = cycleProgress(cycleStartMs, now);
  const avgDailyUsd = elapsedDays > 0 ? cycleOverallUsd / elapsedDays : 0;
  const projectedCycleEndUsd = avgDailyUsd * totalDays;

  // ===== 成员排行 =====
  const yesterdayMembers = yesterdayUsage
    .map((item) => ({
      email: item.email,
      name: nameByEmail.get(item.email) || item.email,
      usd: memberTotalUsd(item).totalUsd,
    }))
    .sort((a, b) => b.usd - a.usd);
  const yesterdayTop5 = yesterdayMembers.slice(0, 5);

  const cycleMembers = cycleUsage
    .map((item) => ({
      email: item.email,
      name: nameByEmail.get(item.email) || item.email,
      usd: memberTotalUsd(item).totalUsd,
    }))
    .sort((a, b) => b.usd - a.usd);
  const cycleTop5 = cycleMembers.slice(0, 5);

  // 昨日零活跃人数
  const yesterdayEmails = new Set(yesterdayUsage.map((u) => u.email));
  const inactiveCount = users.filter(
    (u) => !yesterdayEmails.has(u.email)
  ).length;
  const totalMembers = users.length;

  // 异常高消耗告警
  const alerts = buildSpendAlerts(yesterdayMembers, config);

  // ===== 部门用量排行 =====
  const deptRanking = buildDeptRanking(users, yesterdayUsage, cycleUsage, config.deptMapping);

  // ===== 用量结构 =====
  // Token 汇总
  const tokens = { input: 0, output: 0, total: 0 };
  for (const item of yesterdayUsage) {
    const t = memberTokens(item);
    tokens.input += t.input;
    tokens.output += t.output;
  }
  tokens.total = tokens.input + tokens.output;

  // 模型排行
  const topModels = sumByModel(yesterdayUsage).slice(0, 3);

  // ===== Header =====
  const cycleStartYmd = new Date(cycleStartMs).toISOString().slice(0, 10);

  return {
    header: {
      title: 'TRAE 团队用量日报',
      statDay: dates.yesterdayYmd,
      cycleStartYmd,
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
      cycleProgress: { totalDays, elapsedDays },
      projectedCycleEndUsd,
    },
    members: {
      yesterdayTop5,
      cycleTop5,
      inactiveCount,
      totalMembers,
      alerts,
    },
    deptRanking,
    usage: {
      // Trae API 暂不支持请求数统计
      yesterdayRequests: null,
      reqDodPct: null,
      tokens,
      topModels,
    },
    suggestions: [],
  };
}