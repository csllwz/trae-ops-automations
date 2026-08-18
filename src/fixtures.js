// dry-run 用的内置 mock 数据：模拟 Trae Admin API 三个端点的返回，
// 使 T-2/T-1 的费用、请求、Token、成员排行、部门排行等均有可展示的样例数据。

const MEMBERS = [
  { userId: 12345, email: 'alice@xizi.com', name: 'Alice', role: 'member', dept: '前端组' },
  { userId: 12346, email: 'bob@xizi.com', name: 'Bob', role: 'member', dept: '后端组' },
  { userId: 12347, email: 'carol@xizi.com', name: 'Carol', role: 'owner', dept: '前端组' },
  { userId: 12348, email: 'dave@xizi.com', name: 'Dave', role: 'member', dept: '后端组' },
  { userId: 12349, email: 'erin@xizi.com', name: 'Erin', role: 'member', dept: '数据组' },
  { userId: 12350, email: 'frank@xizi.com', name: 'Frank', role: 'member', dept: '平台组' },
  { userId: 12351, email: 'grace@xizi.com', name: 'Grace', role: 'member', dept: '前端组' },
  { userId: 12352, email: 'henry@xizi.com', name: 'Henry', role: 'member', dept: '后端组' },
  { userId: 12353, email: 'iris@xizi.com', name: 'Iris', role: 'member', dept: '数据组' },
  { userId: 12354, email: 'jack@xizi.com', name: 'Jack', role: 'member', dept: '平台组' },
  { userId: 12355, email: 'kate@xizi.com', name: 'Kate', role: 'member', dept: '前端组' },
];

// 各成员在 [前日, 昨日] 的费用（美元）与请求量，构造出环比、告警、零活跃、产品分布等场景。
const PROFILE = {
  'alice@xizi.com': { dayBeforeUsd: 8.0, yesterdayUsd: 26.5, reqBefore: 120, reqYesterday: 210, model: 'claude-4.5-sonnet', product: 'trae_ide' },
  'bob@xizi.com': { dayBeforeUsd: 6.2, yesterdayUsd: 12.3, reqBefore: 90, reqYesterday: 140, model: 'deepseek-v3', product: 'trae_ide' },
  'carol@xizi.com': { dayBeforeUsd: 4.0, yesterdayUsd: 7.8, reqBefore: 60, reqYesterday: 88, model: 'claude-4.5-sonnet', product: 'trae_work' },
  'dave@xizi.com': { dayBeforeUsd: 2.5, yesterdayUsd: 3.1, reqBefore: 40, reqYesterday: 45, model: 'deepseek-v3', product: 'trae_work' },
  'erin@xizi.com': { dayBeforeUsd: 1.0, yesterdayUsd: 0.0, reqBefore: 15, reqYesterday: 0, model: null, product: 'trae_ide' },
  'frank@xizi.com': { dayBeforeUsd: 0.0, yesterdayUsd: 0.0, reqBefore: 0, reqYesterday: 0, model: null, product: 'trae_work' },
  'grace@xizi.com': { dayBeforeUsd: 5.5, yesterdayUsd: 9.2, reqBefore: 80, reqYesterday: 110, model: 'gpt-5', product: 'trae_ide' },
  'henry@xizi.com': { dayBeforeUsd: 3.8, yesterdayUsd: 5.6, reqBefore: 55, reqYesterday: 72, model: 'claude-4.5-sonnet', product: 'trae_work' },
  'iris@xizi.com': { dayBeforeUsd: 1.2, yesterdayUsd: 2.0, reqBefore: 25, reqYesterday: 35, model: 'deepseek-v3', product: 'trae_ide' },
  'jack@xizi.com': { dayBeforeUsd: 0.0, yesterdayUsd: 0.0, reqBefore: 0, reqYesterday: 0, model: null, product: 'trae_work' },
  'kate@xizi.com': { dayBeforeUsd: 7.0, yesterdayUsd: 14.5, reqBefore: 100, reqYesterday: 160, model: 'claude-opus-5', product: 'trae_ide' },
};

function dailyRow(m, ymd, dateMs, usd, requests, model, product) {
  const isActive = requests > 0;
  return {
    userId: m.userId,
    day: ymd,
    date: dateMs,
    email: m.email,
    name: m.name,
    department: m.dept,
    product: product || 'trae_ide',
    isActive,
    totalLinesAdded: requests * 12,
    totalLinesDeleted: requests * 4,
    acceptedLinesAdded: requests * 8,
    acceptedLinesDeleted: requests * 2,
    totalApplies: Math.round(requests * 0.6),
    totalAccepts: Math.round(requests * 0.5),
    totalRejects: Math.round(requests * 0.1),
    totalTabsShown: requests * 3,
    totalTabsAccepted: requests * 2,
    composerRequests: Math.round(requests * 0.3),
    chatRequests: Math.round(requests * 0.4),
    agentRequests: Math.round(requests * 0.2),
    cmdkUsages: Math.round(requests * 0.1),
    subscriptionIncludedReqs: requests,
    apiKeyReqs: 0,
    usageBasedReqs: Math.round(requests * 0.05),
    bugbotUsages: 0,
    mostUsedModel: model,
    applyMostUsedExtension: '.ts',
    tabMostUsedExtension: '.ts',
    clientVersion: '1.0.0',
  };
}

function eventsFor(m, ymd, dateMs, usd, requests, model, product) {
  if (usd <= 0 || requests <= 0) return [];
  const n = Math.min(5, Math.max(1, Math.round(requests / 40)));
  const perCents = Math.round((usd * 100) / n);
  const noon = dateMs + 12 * 60 * 60 * 1000;
  return Array.from({ length: n }, (_, i) => ({
    timestamp: String(noon + i * 60 * 1000),
    userEmail: m.email,
    userName: m.name,
    product: product || 'trae_ide',
    model: model || 'claude-4.5-sonnet',
    kind: 'Usage-based',
    maxMode: false,
    requestsCosts: 1,
    isTokenBasedCall: true,
    isChargeable: true,
    isHeadless: false,
    tokenUsage: {
      inputTokens: 8000,
      outputTokens: 2000,
      cacheWriteTokens: 1500,
      cacheReadTokens: 30000,
      totalCents: perCents,
    },
    chargedCents: perCents,
  }));
}

/**
 * 生成与给定日期窗口对齐的 mock 数据。
 * @param {object} dates computeReportDates 结果
 */
export function buildMockData(dates) {
  const dailyUsage = [];
  const usageEvents = [];

  for (const m of MEMBERS) {
    const p = PROFILE[m.email];
    dailyUsage.push(dailyRow(m, dates.yesterdayYmd, dates.yesterday.startMs, p.yesterdayUsd, p.reqYesterday, p.model, p.product));
    dailyUsage.push(dailyRow(m, dates.dayBeforeYmd, dates.dayBefore.startMs, p.dayBeforeUsd, p.reqBefore, p.model, p.product));
    usageEvents.push(...eventsFor(m, dates.yesterdayYmd, dates.yesterday.startMs, p.yesterdayUsd, p.reqYesterday, p.model, p.product));
    usageEvents.push(...eventsFor(m, dates.dayBeforeYmd, dates.dayBefore.startMs, p.dayBeforeUsd, p.reqBefore, p.model, p.product));
  }

  const y = new Date(dates.yesterday.startMs);
  const subscriptionCycleStart = Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), 1);

  const spend = MEMBERS.map((m) => {
    const p = PROFILE[m.email];
    const overallCents = Math.round((p.yesterdayUsd + p.dayBeforeUsd) * 100 * 6);
    const onDemandCents = Math.round(overallCents * 0.7);
    return {
      userId: `user_${m.userId}`,
      name: m.name,
      email: m.email,
      role: m.role,
      department: m.dept,
      spendCents: onDemandCents,
      includedSpendCents: overallCents - onDemandCents,
      overallSpendCents: overallCents,
      fastPremiumRequests: p.reqYesterday * 5,
      hardLimitOverrideDollars: 0,
      monthlyLimitDollars: null,
      effectivePerUserLimitDollars: 100,
    };
  });

  return { dailyUsage, spend, subscriptionCycleStart, usageEvents };
}