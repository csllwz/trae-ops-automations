// Trae Admin API 客户端：OAuth2 认证（app_id + app_secret → access_token）。
// 封装日报所需的端点，统一处理分页与错误。

// ========== 认证 ==========

/**
 * 获取访问令牌。令牌有效期 2 小时，建议提前 5 分钟刷新。
 * @param {string} baseUrl
 * @param {string} appId
 * @param {string} appSecret
 * @returns {Promise<{accessToken: string, expire: number}>}
 */
async function getAccessToken(baseUrl, appId, appSecret) {
  const res = await fetch(`${baseUrl}/openapi/v1/auth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`获取 access_token 失败：HTTP ${res.status} ${text}`);
  }
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`获取 access_token 失败：code=${json.code} message=${json.message}`);
  }
  return { accessToken: json.access_token, expire: json.expire };
}

// ========== 通用请求封装 ==========

async function traeGet(baseUrl, path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`调用 ${path} 失败：HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`调用 ${path} 失败：code=${json.code} message=${json.message}`);
  }
  return json;
}

async function traePost(baseUrl, path, token, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`调用 ${path} 失败：HTTP ${res.status}`);
  }
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`调用 ${path} 失败：code=${json.code} message=${json.message}`);
  }
  return json;
}

// ========== 业务接口 ==========

/**
 * 查询成员列表（支持分页）。
 * @returns {Promise<Array>} 成员列表
 */
export async function fetchUsers({ baseUrl, token, pageSize = 100 }) {
  const all = [];
  let page = 1;
  for (;;) {
    const json = await traeGet(baseUrl, `/openapi/v1/users?page=${page}&page_size=${pageSize}`, token);
    const items = json.data?.items || [];
    all.push(...items);
    const pagination = json.data?.pagination;
    if (!pagination || page >= pagination.total_pages) break;
    page += 1;
  }
  return all;
}

/**
 * 查询指定时间范围内成员在各模型中的用量。
 * 自动翻页，支持按 emails 或 user_ids 筛选。
 * @param {object} opts
 * @param {string} opts.baseUrl
 * @param {string} opts.token
 * @param {number} opts.startTime Unix 秒时间戳
 * @param {number} opts.endTime Unix 秒时间戳
 * @param {string[]} [opts.emails] 成员邮箱列表（最多 100 个）
 * @param {string[]} [opts.userIds] 成员用户 ID 列表（最多 100 个）
 * @returns {Promise<Array>} [{ email, model_usage: [...] }]
 */
export async function fetchUserModelUsage({ baseUrl, token, startTime, endTime, emails, userIds }) {
  const all = [];
  const body = { start_time: startTime, end_time: endTime };
  if (emails && emails.length > 0) body.emails = emails;
  if (userIds && userIds.length > 0) body.user_ids = userIds;

  const json = await traePost(baseUrl, '/openapi/v1/statistics/user-model-usage', token, body);
  all.push(...(json.data?.items || []));
  return all;
}

/**
 * 按 Session ID 查询用量明细。
 * @param {object} opts
 * @param {string[]} opts.sessionIds 会话 ID 列表（最多 100 个）
 * @returns {Promise<Array>}
 */
export async function fetchSessionUsageDetail({ baseUrl, token, sessionIds }) {
  const json = await traePost(baseUrl, '/openapi/v1/statistics/session_usage_detail', token, {
    session_ids: sessionIds,
  });
  return json.data?.items || [];
}

// ========== 高层封装（供 index.js 使用） ==========

/**
 * 创建带自动刷新令牌的 Trae API 客户端。
 * 内部管理 token 生命周期（提前 5 分钟刷新）。
 */
export function createTraeClient({ baseUrl, appId, appSecret }) {
  let tokenPromise = null;
  let tokenExpireAt = 0;

  async function ensureToken() {
    const now = Date.now();
    // 提前 5 分钟刷新
    if (tokenPromise && now < tokenExpireAt - 5 * 60 * 1000) {
      return tokenPromise;
    }
    tokenPromise = getAccessToken(baseUrl, appId, appSecret).then(({ accessToken, expire }) => {
      tokenExpireAt = now + expire * 1000;
      return accessToken;
    });
    return tokenPromise;
  }

  return {
    /** 获取成员列表 */
    async getUsers() {
      const token = await ensureToken();
      return fetchUsers({ baseUrl, token });
    },

    /** 获取指定时间范围内成员模型用量 */
    async getUserModelUsage({ startTime, endTime, emails, userIds }) {
      const token = await ensureToken();
      return fetchUserModelUsage({ baseUrl, token, startTime, endTime, emails, userIds });
    },
  };
}