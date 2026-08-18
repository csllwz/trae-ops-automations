// 运行配置：从环境变量与命令行参数读取，密钥仅从环境注入，禁止入库。

/** 判断是否为合法的 http(s) URL。 */
export function isHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 解析命令行参数。
 * 支持：--dry-run（使用内置 mock 数据，不调用真实 API、不发送钉钉）。
 */
export function parseArgs(argv = process.argv.slice(2)) {
  return {
    dryRun: argv.includes('--dry-run'),
  };
}

/**
 * 读取运行配置。
 * dry-run 模式下允许缺省密钥；真实模式下缺省密钥会抛出可读错误（不含密钥内容）。
 */
export function loadConfig({ dryRun }) {
  const apiKey = process.env.TRAE_ADMIN_API_KEY || '';
  const dingtalkWebhook = process.env.DINGTALK_WEBHOOK || '';
  const dingtalkSecret = process.env.DINGTALK_SECRET || '';

  if (!dryRun) {
    const missing = [];
    if (!apiKey) missing.push('TRAE_ADMIN_API_KEY');
    if (!dingtalkWebhook) missing.push('DINGTALK_WEBHOOK');
    if (missing.length > 0) {
      throw new Error(
        `缺少必要的环境变量：${missing.join('、')}。请在安全环境变量中配置，或使用 --dry-run 进行本地演示。`
      );
    }
    if (!isHttpUrl(dingtalkWebhook)) {
      throw new Error('DINGTALK_WEBHOOK 不是合法的 http(s) URL，请配置完整的钉钉群机器人 Webhook 地址。');
    }
  }

  // 行动建议仅在指定星期出现（默认周一=1；0=周日 … 6=周六）
  const suggestionWeekdayRaw = process.env.SUGGESTION_WEEKDAY;
  const suggestionWeekday =
    suggestionWeekdayRaw == null || suggestionWeekdayRaw === ''
      ? 1
      : Number(suggestionWeekdayRaw);

  // 部门映射：从环境变量 DEPT_MAPPING 解析，JSON 格式 key=邮箱 value=部门名
  let deptMapping = {};
  const deptRaw = process.env.DEPT_MAPPING;
  if (deptRaw) {
    try {
      deptMapping = JSON.parse(deptRaw);
    } catch {
      console.warn('[config] DEPT_MAPPING 解析失败，将使用默认值（未分配部门）。');
    }
  }

  return {
    dryRun,
    apiKey,
    dingtalkWebhook,
    dingtalkSecret,
    deptMapping,
    // 团队时区：日报统计日为北京时间 T-1
    timeZone: process.env.REPORT_TIMEZONE || 'Asia/Shanghai',
    // 异常高消耗：最低金额门槛（美元/日），默认 50；未超过则不告警
    alertMinSpendUsd: Number(process.env.ALERT_MIN_SPEND_USD || 50),
    // 异常高消耗：绝对阈值（美元/日），默认 100
    alertDailySpendUsd: Number(process.env.ALERT_DAILY_SPEND_USD || 100),
    // 相对阈值：超过「昨日有花费成员均值」的倍数，默认 3
    alertAvgMultiplier: Number(process.env.ALERT_AVG_MULTIPLIER || 3),
    suggestionWeekday: Number.isFinite(suggestionWeekday) ? suggestionWeekday : 1,
    apiBaseUrl: process.env.TRAE_API_BASE_URL || 'https://api.trae.ai',
  };
}