// 格式化层：将日报数值模型渲染为钉钉 markdown 消息（不含明细/原始 JSON/密钥）。

const usd = (n) => `$${(Number(n) || 0).toFixed(2)}`;
const int = (n) => (Number(n) || 0).toLocaleString('en-US');

function dod(p) {
  if (p == null) return '（无环比基准）';
  const sign = p >= 0 ? '↑' : '↓';
  return `${sign}${Math.abs(p * 100).toFixed(1)}%`;
}

function tokensH(t) {
  const m = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);
  return `总 ${m(t.total)}（入 ${m(t.input)} / 出 ${m(t.output)}）`;
}

/**
 * 渲染钉钉 markdown 文本。
 */
export function renderMarkdown(model) {
  const { header, cost, members, deptRanking, usage, suggestions } = model;
  const lines = [];

  lines.push(`# ${header.title}`);
  lines.push('');
  lines.push(`> 统计日（T-1）：**${header.statDay}** ｜ 账期起：${header.cycleStartYmd}`);
  lines.push(`> 数据时间戳：${header.generatedAtIso}`);
  lines.push('');

  // ===== 一、成本总览 =====
  lines.push('## 一、成本总览');
  lines.push(`- 按需花费（额外账单）：**${usd(cost.cycleOnDemandUsd)}**`);
  lines.push(`- 订阅内已用（不另计费）：**${usd(cost.cycleIncludedUsd)}**`);
  lines.push(`- 消耗合计（按需+订阅内）：**${usd(cost.cycleOverallUsd)}**`);
  lines.push(`- 昨日花费：**${usd(cost.yesterdayUsd)}**，环比前日 ${dod(cost.spendDodPct)}（前日 ${usd(cost.dayBeforeUsd)}）`);
  lines.push(`- 日均：${usd(cost.avgDailyUsd)}（账期已过 ${cost.cycleProgress.elapsedDays}/${cost.cycleProgress.totalDays} 天）`);
  lines.push(`- 预估期末：**${usd(cost.projectedCycleEndUsd)}**`);
  lines.push('');

  // ===== 二、成员排行 =====
  lines.push('## 二、成员排行');
  lines.push('#### 昨日 Top5（按费用）');
  lines.push(rankList(members.yesterdayTop5));
  lines.push('');
  lines.push('#### 账期 Top5（按费用）');
  lines.push(rankList(members.cycleTop5));
  lines.push('');
  lines.push('#### 其他');
  lines.push(`- 昨日零活跃：${members.inactiveCount}/${members.totalMembers} 人`);
  if (members.alerts.length > 0) {
    const names = members.alerts
      .map((m) => {
        const why = m.reasons && m.reasons.length ? `，${m.reasons.join('且')}` : '';
        return `${m.name}（${usd(m.usd)}${why}）`;
      })
      .join('、');
    lines.push(`- ⚠️ 异常高消耗告警：${names}`);
  } else {
    lines.push('- ✅ 无异常高消耗告警');
  }
  lines.push('');

  // ===== 三、部门用量排行 =====
  lines.push('## 三、部门用量排行');
  lines.push('#### 昨日部门 Top5（按费用）');
  lines.push(deptRankList(deptRanking.yesterdayRanking.slice(0, 5)));
  lines.push('');
  lines.push('#### 账期部门排行（按费用）');
  lines.push(deptRankList(deptRanking.cycleRanking));
  lines.push('');

  // ===== 四、用量结构 =====
  lines.push('## 四、用量结构');
  if (usage.yesterdayRequests != null) {
    lines.push(`- 昨日请求：**${int(usage.yesterdayRequests)}**，环比 ${dod(usage.reqDodPct)}`);
  }
  lines.push(`- 昨日 Token：${tokensH(usage.tokens)}`);
  if (usage.topModels.length > 0) {
    const models = usage.topModels.map((m, i) => `${i + 1}）${m.model}（${usd(m.usd)}）`).join('；');
    lines.push(`- 模型 Top${usage.topModels.length}：${models}`);
  }
  lines.push('');

  // 行动建议仅每周指定日出现
  if (suggestions && suggestions.length > 0) {
    lines.push('## 五、行动建议（本周）');
    suggestions.forEach((s, i) => lines.push(`- ${i + 1}）${s}`));
  }

  return lines.join('\n');
}

/**
 * 渲染成员排行列表。
 */
function rankList(rows) {
  if (!rows || rows.length === 0) return '- （无数据）';
  return rows.map((r, i) => `- ${i + 1}）${r.name} — ${usd(r.usd)}`).join('\n');
}

/**
 * 渲染部门排行列表。
 */
function deptRankList(rows) {
  if (!rows || rows.length === 0) return '- （无数据）';
  return rows.map((r, i) => `- ${i + 1}）${r.dept} — ${usd(r.usd)}（${r.memberCount}人）`).join('\n');
}

/**
 * 组装钉钉机器人 markdown 消息体。
 */
export function buildDingtalkPayload(model) {
  return {
    msgtype: 'markdown',
    markdown: {
      title: `${model.header.title} ${model.header.statDay}`,
      text: renderMarkdown(model),
    },
  };
}