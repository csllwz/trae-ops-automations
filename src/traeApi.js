// Trae Admin API 客户端：Bearer 认证（API Key 作为 Bearer Token）。
// 封装日报所需的端点，统一处理分页与错误（不泄露密钥）。

async function postJson(baseUrl, path, apiKey, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`调用 ${path} 失败：HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 拉取指定时间窗口内所有成员的每日用量（自动翻页）。
 * 返回数据包含 product 字段区分 Trae IDE / Trae Work。
 */
export async function fetchDailyUsage({ baseUrl, apiKey, startDate, endDate, pageSize = 1000 }) {
  const all = [];
  let page = 1;
  for (;;) {
    const json = await postJson(baseUrl, '/teams/daily-usage-data', apiKey, {
      startDate,
      endDate,
      page,
      pageSize,
    });
    all.push(...(json.data || []));
    const p = json.pagination;
    if (!p || !p.hasNextPage) break;
    page += 1;
  }
  return all;
}

/**
 * 拉取当前账期的成员消费（自动翻页），返回消费明细与账期起点。
 */
export async function fetchSpend({ baseUrl, apiKey, pageSize = 100 }) {
  const spend = [];
  let page = 1;
  let subscriptionCycleStart = null;
  for (;;) {
    const json = await postJson(baseUrl, '/teams/spend', apiKey, { page, pageSize });
    spend.push(...(json.teamMemberSpend || []));
    if (subscriptionCycleStart == null) subscriptionCycleStart = json.subscriptionCycleStart;
    const totalPages = json.totalPages || 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return { spend, subscriptionCycleStart };
}

/**
 * 拉取指定时间窗口内的用量事件（自动翻页），用于按天费用、Token 与模型结构。
 * 事件中包含 product 字段标识 Trae IDE / Trae Work。
 */
export async function fetchUsageEvents({ baseUrl, apiKey, startDate, endDate, pageSize = 1000 }) {
  const events = [];
  let page = 1;
  for (;;) {
    const json = await postJson(baseUrl, '/teams/filtered-usage-events', apiKey, {
      startDate,
      endDate,
      page,
      pageSize,
    });
    events.push(...(json.usageEvents || []));
    const p = json.pagination;
    if (!p || !p.hasNextPage) break;
    page += 1;
  }
  return events;
}