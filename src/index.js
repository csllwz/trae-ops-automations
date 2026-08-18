// 入口：编排 "拉取用量 → 聚合日报 → 推送钉钉" 全流程。
// 真实模式使用环境变量中的密钥；--dry-run 使用内置 mock 数据并打印到控制台。

import { parseArgs, loadConfig, isHttpUrl } from './config.js';
import { computeReportDates } from './dates.js';
import { createTraeClient } from './traeApi.js';
import { buildMockData } from './fixtures.js';
import { buildReportModel } from './aggregate.js';
import { renderMarkdown, buildDingtalkPayload } from './format.js';
import { sendToDingtalk } from './dingtalk.js';

/**
 * 获取账期起点（epoch ms）。
 * 优先使用环境变量 BILLING_CYCLE_START_SEC，否则默认当月 1 日。
 */
function getCycleStartMs(config, dates) {
  if (config.cycleStartSec) {
    return config.cycleStartSec * 1000;
  }
  // 默认当月 1 日
  const y = new Date(dates.yesterday.startMs);
  return Date.UTC(y.getUTCFullYear(), y.getUTCMonth(), 1);
}

/**
 * 获取数据：真实模式调用 Trae API，dry-run 返回 mock 数据。
 */
async function gatherData(config, dates) {
  if (config.dryRun) {
    const mock = buildMockData(dates);
    return {
      users: mock.users,
      yesterdayUsage: mock.yesterdayUsage,
      dayBeforeUsage: mock.dayBeforeUsage,
      cycleUsage: mock.cycleUsage,
      cycleStartMs: mock.cycleStartMs,
    };
  }

  // 真实模式：创建 Trae 客户端，拉取用户列表和用量数据
  const client = createTraeClient({
    baseUrl: config.apiBaseUrl,
    appId: config.appId,
    appSecret: config.appSecret,
  });

  const users = await client.getUsers();
  console.log(`[日报] 获取到 ${users.length} 名成员`);

  // 时间窗口
  const yesterdayStartSec = Math.floor(dates.yesterday.startMs / 1000);
  const yesterdayEndSec = Math.floor(dates.yesterday.endMs / 1000);
  const dayBeforeStartSec = Math.floor(dates.dayBefore.startMs / 1000);
  const dayBeforeEndSec = Math.floor(dates.dayBefore.endMs / 1000);

  const cycleStartMs = getCycleStartMs(config, dates);
  const cycleStartSec = Math.floor(cycleStartMs / 1000);

  // 并行拉取昨日、前日、账期用量
  const [yesterdayUsage, dayBeforeUsage, cycleUsage] = await Promise.all([
    client.getUserModelUsage({
      startTime: yesterdayStartSec,
      endTime: yesterdayEndSec,
    }),
    client.getUserModelUsage({
      startTime: dayBeforeStartSec,
      endTime: dayBeforeEndSec,
    }),
    client.getUserModelUsage({
      startTime: cycleStartSec,
      endTime: yesterdayEndSec,
    }),
  ]);

  console.log(
    `[日报] 用量数据：昨日 ${yesterdayUsage.length} 条、前日 ${dayBeforeUsage.length} 条、账期 ${cycleUsage.length} 条`
  );

  return { users, yesterdayUsage, dayBeforeUsage, cycleUsage, cycleStartMs };
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
    users: raw.users,
    yesterdayUsage: raw.yesterdayUsage,
    dayBeforeUsage: raw.dayBeforeUsage,
    cycleUsage: raw.cycleUsage,
    cycleStartMs: raw.cycleStartMs,
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
  console.error(`[日报] 执行失败：${err.message}`);
  process.exit(1);
});