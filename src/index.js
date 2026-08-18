// 入口：编排 "拉取账单 → 生成日报 → 推送钉钉" 全流程。
// 真实模式使用环境变量中的密钥；--dry-run 使用内置 mock 数据并打印到控制台。

import { parseArgs, loadConfig, isHttpUrl } from './config.js';
import { computeReportDates } from './dates.js';
import { fetchDailyUsage, fetchSpend, fetchUsageEvents } from './traeApi.js';
import { buildMockData } from './fixtures.js';
import { buildReportModel } from './aggregate.js';
import { renderMarkdown, buildDingtalkPayload } from './format.js';
import { sendToDingtalk } from './dingtalk.js';

async function gatherData(config, dates) {
  if (config.dryRun) {
    return buildMockData(dates);
  }
  // 真实模式：并发拉取三个端点。用量窗口覆盖 T-2..T-1。
  const startDate = dates.dayBefore.startMs;
  const endDate = dates.yesterday.endMs;
  const [dailyUsage, spendResult, usageEvents] = await Promise.all([
    fetchDailyUsage({ baseUrl: config.apiBaseUrl, apiKey: config.apiKey, startDate, endDate }),
    fetchSpend({ baseUrl: config.apiBaseUrl, apiKey: config.apiKey }),
    fetchUsageEvents({ baseUrl: config.apiBaseUrl, apiKey: config.apiKey, startDate, endDate }),
  ]);
  return {
    dailyUsage,
    spend: spendResult.spend,
    subscriptionCycleStart: spendResult.subscriptionCycleStart,
    usageEvents,
  };
}

async function main() {
  const args = parseArgs();
  const config = loadConfig(args);
  const dates = computeReportDates(config.timeZone);

  console.log(
    `[日报] 模式=${config.dryRun ? 'dry-run(mock)' : '真实'} 统计日=${dates.yesterdayYmd} 时区=${config.timeZone} 行动建议=${dates.todayWeekday === config.suggestionWeekday ? '本周展示' : '本周跳过'}`
  );

  const raw = await gatherData(config, dates);
  const model = buildReportModel({
    dates,
    dailyUsage: raw.dailyUsage,
    spend: raw.spend,
    subscriptionCycleStart: raw.subscriptionCycleStart,
    usageEvents: raw.usageEvents,
    config,
  });

  const markdown = renderMarkdown(model);
  console.log('\n===== 日报预览 =====\n');
  console.log(markdown);
  console.log('\n====================\n');

  // dry-run 下仅当配置了合法 Webhook URL 时才走真实推送链路，否则安全跳过。
  if (config.dryRun && !isHttpUrl(config.dingtalkWebhook)) {
    console.log('[日报] dry-run 未提供合法的 DINGTALK_WEBHOOK URL，跳过推送。');
    return;
  }

  const payload = buildDingtalkPayload(model);
  const result = await sendToDingtalk(config.dingtalkWebhook, payload, config.dingtalkSecret);
  console.log(`[日报] 已推送钉钉：${JSON.stringify(result)}`);
}

main().catch((err) => {
  // 仅输出可读错误信息，不打印堆栈中的敏感数据。
  console.error(`[日报] 执行失败：${err.message}`);
  process.exit(1);
});