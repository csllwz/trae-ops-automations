// 本地 mock 钉钉服务器：接收 POST 并打印消息体，方便调试日报格式。
// 用法：node scripts/mock-dingtalk-server.js
// 然后设置 DINGTALK_WEBHOOK=http://localhost:18080/dingtalk/webhook

import http from 'node:http';

const PORT = process.env.MOCK_PORT || 18080;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/dingtalk/webhook') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      console.log('\n===== 收到钉钉推送 =====');
      console.log(`时间：${new Date().toISOString()}`);
      try {
        const msg = JSON.parse(body);
        if (msg.msgtype === 'markdown') {
          console.log(`标题：${msg.markdown?.title || '(无)'}`);
          console.log('--- 消息内容 ---');
          console.log(msg.markdown?.text || '(空)');
          console.log('--- 消息结束 ---');
        } else {
          console.log(JSON.stringify(msg, null, 2));
        }
      } catch {
        console.log('原始内容：', body);
      }
      console.log('========================\n');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ errcode: 0, errmsg: 'ok' }));
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('mock-dingtalk-server ok');
  }
});

server.listen(PORT, () => {
  console.log(`[mock-dingtalk] 监听 http://localhost:${PORT}/dingtalk/webhook`);
  console.log('设置环境变量: DINGTALK_WEBHOOK=http://localhost:18080/dingtalk/webhook');
});