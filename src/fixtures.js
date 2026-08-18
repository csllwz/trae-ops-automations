// dry-run 用的内置 mock 数据：模拟 Trae Admin API 响应结构
// 使 T-2/T-1 的费用、Token、成员排行、部门排行等均有可展示的样例数据。

const MEMBERS = [
  { user_id: '12345', email: 'alice@xizi.com', name: 'Alice', role: 'member', department: '前端组' },
  { user_id: '12346', email: 'bob@xizi.com', name: 'Bob', role: 'member', department: '后端组' },
  { user_id: '12347', email: 'carol@xizi.com', name: 'Carol', role: 'owner', department: '前端组' },
  { user_id: '12348', email: 'dave@xizi.com', name: 'Dave', role: 'member', department: '后端组' },
  { user_id: '12349', email: 'erin@xizi.com', name: 'Erin', role: 'member', department: '数据组' },
  { user_id: '12350', email: 'frank@xizi.com', name: 'Frank', role: 'member', department: '平台组' },
  { user_id: '12351', email: 'grace@xizi.com', name: 'Grace', role: 'member', department: '前端组' },
  { user_id: '12352', email: 'henry@xizi.com', name: 'Henry', role: 'member', department: '后端组' },
  { user_id: '12353', email: 'iris@xizi.com', name: 'Iris', role: 'member', department: '数据组' },
  { user_id: '12354', email: 'jack@xizi.com', name: 'Jack', role: 'member', department: '平台组' },
  { user_id: '12355', email: 'kate@xizi.com', name: 'Kate', role: 'member', department: '前端组' },
];

// 各成员的费用配置（美元），构造出环比、告警、零活跃等场景
// 模型可配置多个以展示模型分布
const PROFILE = {
  'alice@xizi.com': {
    dayBeforeUsd: 8.0, yesterdayUsd: 26.5, cycleUsd: 180.0,
    models: [
      { name: 'Claude Opus 5 (Auto Balanced)', usd: 18.0, inputTokens: 800000, outputTokens: 200000 },
      { name: 'claude-opus-5-thinking-high', usd: 8.5, inputTokens: 400000, outputTokens: 100000 },
    ],
  },
  'bob@xizi.com': {
    dayBeforeUsd: 6.2, yesterdayUsd: 12.3, cycleUsd: 90.0,
    models: [
      { name: 'DeepSeek-V4-Pro', usd: 12.3, inputTokens: 600000, outputTokens: 150000 },
    ],
  },
  'carol@xizi.com': {
    dayBeforeUsd: 4.0, yesterdayUsd: 7.8, cycleUsd: 55.0,
    models: [
      { name: 'Claude Opus 5 (Auto Balanced)', usd: 7.8, inputTokens: 350000, outputTokens: 90000 },
    ],
  },
  'dave@xizi.com': {
    dayBeforeUsd: 2.5, yesterdayUsd: 3.1, cycleUsd: 25.0,
    models: [
      { name: 'DeepSeek-V4-Pro', usd: 3.1, inputTokens: 150000, outputTokens: 40000 },
    ],
  },
  'erin@xizi.com': {
    dayBeforeUsd: 1.0, yesterdayUsd: 0.0, cycleUsd: 8.0,
    models: [],
  },
  'frank@xizi.com': {
    dayBeforeUsd: 0.0, yesterdayUsd: 0.0, cycleUsd: 2.0,
    models: [],
  },
  'grace@xizi.com': {
    dayBeforeUsd: 5.5, yesterdayUsd: 9.2, cycleUsd: 65.0,
    models: [
      { name: 'Doubao-Seed-2.0-Code', usd: 9.2, inputTokens: 500000, outputTokens: 120000 },
    ],
  },
  'henry@xizi.com': {
    dayBeforeUsd: 3.8, yesterdayUsd: 5.6, cycleUsd: 40.0,
    models: [
      { name: 'Claude Opus 5 (Auto Balanced)', usd: 5.6, inputTokens: 250000, outputTokens: 70000 },
    ],
  },
  'iris@xizi.com': {
    dayBeforeUsd: 1.2, yesterdayUsd: 2.0, cycleUsd: 15.0,
    models: [
      { name: 'DeepSeek-V4-Flash', usd: 2.0, inputTokens: 100000, outputTokens: 30000 },
    ],
  },
  'jack@xizi.com': {
    dayBeforeUsd: 0.0, yesterdayUsd: 0.0, cycleUsd: 0.5,
    models: [],
  },
  'kate@xizi.com': {
    dayBeforeUsd: 7.0, yesterdayUsd: 14.5, cycleUsd: 100.0,
    models: [
      { name: 'Claude Opus 5 (Auto Balanced)', usd: 10.0, inputTokens: 500000, outputTokens: 130000 },
      { name: 'claude-opus-5-thinking-high', usd: 4.5, inputTokens: 200000, outputTokens: 50000 },
    ],
  },
};

/**
 * 构建 user-model-usage 响应格式（Trae API 实际结构）。
 * @param {object} opts
 * @param {number} opts.usd 总费用（美元）
 * @param {Array} opts.models 模型明细
 * @returns {object} { email, model_usage: [...] }
 */
function buildModelUsage(email, usd, models) {
  const modelUsage = models.map((m) => ({
    model_name: m.name,
    model_type: 'Chat',
    model_source: 'Trae',
    usage: {
      input_tokens: m.inputTokens || 0,
      output_tokens: m.outputTokens || 0,
    },
    amount: {
      basic_amount: (m.usd * 0.7).toFixed(6),
      pay_go_amount: (m.usd * 0.3).toFixed(6),
      total_amount: m.usd.toFixed(6),
      currency: 'USD',
    },
  }));
  return { email, model_usage: modelUsage };
}

/**
 * 生成与给定日期窗口对齐的 mock 数据。
 * @param {object} dates computeReportDates 结果
 */
export function buildMockData(dates) {
  // 1. 用户列表
  const users = MEMBERS.map((m) => ({ ...m }));

  // 2. 昨日用量
  const yesterdayUsage = MEMBERS
    .map((m) => {
      const p = PROFILE[m.email];
      return buildModelUsage(m.email, p.yesterdayUsd, p.models);
    })
    .filter((u) => u.model_usage.length > 0);

  // 3. 前日用量
  const dayBeforeUsage = MEMBERS
    .map((m) => {
      const p = PROFILE[m.email];
      if (p.dayBeforeUsd <= 0) return null;
      // 前日也用相同模型列表，按比例缩放
      const scale = p.dayBeforeUsd / (p.yesterdayUsd || 1);
      const models = p.models.map((m2) => ({
        ...m2,
        usd: m2.usd * scale,
        inputTokens: Math.round(m2.inputTokens * scale),
        outputTokens: Math.round(m2.outputTokens * scale),
      }));
      return buildModelUsage(m.email, p.dayBeforeUsd, models);
    })
    .filter(Boolean);

  // 4. 账期总用量
  const cycleUsage = MEMBERS
    .map((m) => {
      const p = PROFILE[m.email];
      if (p.cycleUsd <= 0) return null;
      const scale = p.cycleUsd / (p.yesterdayUsd || 1);
      const models = p.models.map((m2) => ({
        ...m2,
        usd: m2.usd * scale,
        inputTokens: Math.round(m2.inputTokens * scale),
        outputTokens: Math.round(m2.outputTokens * scale),
      }));
      return buildModelUsage(m.email, p.cycleUsd, models);
    })
    .filter(Boolean);

  // 账期起点（当月 1 日）
  const y = new Date(dates.yesterday.startMs);
  const cycleStartMs = Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), 1);

  return { users, yesterdayUsage, dayBeforeUsage, cycleUsage, cycleStartMs };
}