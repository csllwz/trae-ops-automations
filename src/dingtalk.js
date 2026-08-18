// 钉钉推送层：将日报消息体 POST 到群机器人 Webhook（支持加签）。

import crypto from 'node:crypto';

/**
 * 按钉钉加签规则生成带 timestamp/sign 的最终请求 URL。
 * 无 secret 时原样返回 webhook。
 * @param {string} webhook 机器人 Webhook
 * @param {string} [secret] 加签密钥（SEC 开头）
 * @returns {string}
 */
export function buildSignedWebhookUrl(webhook, secret) {
  if (!secret) return webhook;
  const timestamp = Date.now().toString();
  const stringToSign = `${timestamp}\n${secret}`;
  const sign = crypto.createHmac('sha256', secret).update(stringToSign).digest('base64');
  const url = new URL(webhook);
  url.searchParams.set('timestamp', timestamp);
  url.searchParams.set('sign', sign);
  return url.toString();
}

/**
 * 发送 markdown 消息到钉钉群机器人。
 * 成功时钉钉返回 { errcode: 0, errmsg: 'ok' }。
 * @param {string} webhook 机器人 Webhook
 * @param {object} payload 钉钉消息体
 * @param {string} [secret] 加签密钥；开启加签时必填
 */
export async function sendToDingtalk(webhook, payload, secret = '') {
  const signedUrl = buildSignedWebhookUrl(webhook, secret);
  const res = await fetch(signedUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }
  if (!res.ok || (body && body.errcode !== undefined && body.errcode !== 0)) {
    throw new Error(`钉钉推送失败：HTTP ${res.status}，errcode=${body.errcode}，errmsg=${body.errmsg || ''}`);
  }
  return body;
}