'use strict';
/**
 * 番茄小说下载器 —— 本地 HTTP 服务入口
 * 仅用于个人备份用途，请遵守相关法律法规与平台服务条款，下载内容请勿传播。
 *
 * 运行：  node server.js   （需 Node 18+）
 * 默认监听 http://localhost:8787
 * 前端「高级选项」里的接口地址填： http://localhost:8787
 */
const http = require('http');
const url = require('url');
const fn = require('./index.js');

const PORT = process.env.PORT || 8787;

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = url.parse(req.url, true);
  const params = u.query || {};
  try {
    const out = await fn.main({ httpMethod: req.method, queryString: params });
    const code = out.statusCode || 200;
    if (out.headers) for (const k in out.headers) res.setHeader(k, out.headers[k]);
    res.writeHead(code);
    res.end(typeof out.body === 'string' ? out.body : JSON.stringify(out.body));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: e.message }));
  }
});

server.listen(PORT, () => {
  console.log('番茄小说下载器本地服务已启动： http://localhost:' + PORT);
  console.log('支持 action： search / chapters / batch');
});
