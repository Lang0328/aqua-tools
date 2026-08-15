'use strict';
/**
 * 本地 HTTP 服务入口（托管整个网页 + 通用小说搜索后端）
 * 仅用于个人备份用途，请遵守相关法律法规与平台服务条款，下载内容请勿传播。
 *
 * 运行：  node server.js   （需 Node 18+）
 * 启动后浏览器打开： http://localhost:8787
 */
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 8787;
// 网站根目录（server.js 位于 cloudfunctions/fanqie，上一个两级是网页根）
const WEB_ROOT = path.resolve(__dirname, '..', '..');
const NOVEL_API_PORT = 8088;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// ---------------- 拉起 novel-api 子进程（通用小说搜索后端）----------------
let novelChild = null;
function startNovelApi() {
  const mainPy = path.join(__dirname, 'novel-api', 'main.py');
  if (!fs.existsSync(mainPy)) {
    console.log('[novel-api] 未找到 main.py，跳过通用小说搜索功能');
    return;
  }
  try {
    novelChild = spawn('python', [mainPy], {
      cwd: path.join(__dirname, 'novel-api'),
      stdio: ['ignore', fs.openSync(path.join(__dirname, 'novel-api', '_svc_out.log'), 'a'), fs.openSync(path.join(__dirname, 'novel-api', '_svc_err.log'), 'a')],
      windowsHide: true
    });
    novelChild.on('exit', (code) => {
      console.log('[novel-api] 子进程退出，code=' + code);
    });
    console.log('[novel-api] 已启动 (端口 ' + NOVEL_API_PORT + ')');
  } catch (e) {
    console.log('[novel-api] 启动失败：' + e.message);
  }
}
function stopNovelApi() {
  if (novelChild) { try { novelChild.kill(); } catch (e) {} novelChild = null; }
}
process.on('exit', stopNovelApi);
process.on('SIGINT', () => { stopNovelApi(); process.exit(0); });

// ---------------- novel-api 代理 ----------------
async function fetchTextRetry(target, timeout = 15000, retries = 12) {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const r = await fetch(target, { signal: ctrl.signal });
      clearTimeout(t);
      return r;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (e.name === 'AbortError') break; // 超时不再重试
      await new Promise(res => setTimeout(res, 800)); // 等 novel-api 起来
    }
  }
  throw lastErr || new Error('novel-api 请求失败');
}

async function handleNovel(req, res, pathname, params) {
  try {
    if (pathname === '/api/novel/search') {
      const q = (params.q || '').toString();
      if (!q) { res.writeHead(400); res.end(JSON.stringify({ error: '缺少 q' })); return; }
      const r = await fetchTextRetry('http://127.0.0.1:' + NOVEL_API_PORT + '/search/' + encodeURIComponent(q));
      const txt = await r.text();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(txt);
      return;
    }
    if (pathname === '/api/novel/page') {
      const u = (params.url || '').toString();
      if (!u) { res.writeHead(400); res.end(JSON.stringify({ error: '缺少 url' })); return; }
      const r = await fetchTextRetry('http://127.0.0.1:' + NOVEL_API_PORT + '/page?url=' + encodeURIComponent(u));
      const txt = await r.text();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(txt);
      return;
    }
    if (pathname === '/api/novel/content') {
      const link = (params.link || '').toString();
      if (!link) { res.writeHead(400); res.end(JSON.stringify({ error: '缺少 link' })); return; }
      const r = await fetchTextRetry('http://127.0.0.1:' + NOVEL_API_PORT + '/content?link=' + encodeURIComponent(link));
      const txt = await r.text();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(txt);
      return;
    }
    if (pathname === '/api/novel/batch') {
      const linksRaw = (params.links || '').toString();
      if (!linksRaw) { res.writeHead(400); res.end(JSON.stringify({ error: '缺少 links' })); return; }
      const links = linksRaw.split(',').map(s => s.trim()).filter(Boolean);
      const CONC = 8;
      let idx = 0;
      const results = new Array(links.length);
      async function batchWorker() {
        while (idx < links.length) {
          const i = idx++;
          try {
            const cR = await fetchTextRetry('http://127.0.0.1:' + NOVEL_API_PORT + '/content?link=' + encodeURIComponent(links[i]));
            const cData = JSON.parse(await cR.text());
            results[i] = (cData.str || '');
          } catch (e) {
            results[i] = '【本章获取失败】';
          }
        }
      }
      await Promise.all(Array.from({ length: CONC }, batchWorker));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ chapters: results }));
      return;
    }
    if (pathname === '/api/novel/download') {
      const bookUrl = (params.url || '').toString();
      if (!bookUrl) { res.writeHead(400); res.end('缺少 url'); return; }
      const pageR = await fetchTextRetry('http://127.0.0.1:' + NOVEL_API_PORT + '/page?url=' + encodeURIComponent(bookUrl));
      const pageData = JSON.parse(await pageR.text());
      const list = Array.isArray(pageData.list) ? pageData.list : [];
      let txt = '';
      if (pageData.name) txt += '《' + pageData.name + '》' + (pageData.author ? ' 作者：' + pageData.author : '') + '\n\n';
      if (pageData.desc) txt += pageData.desc + '\n\n';
      // 并发抓取章节
      const CONC = 8;
      let idx = 0;
      const results = new Array(list.length);
      async function worker() {
        while (idx < list.length) {
          const i = idx++;
          const ch = list[i];
          try {
            const cR = await fetchTextRetry('http://127.0.0.1:' + NOVEL_API_PORT + '/content?link=' + encodeURIComponent(ch.link));
            const cData = JSON.parse(await cR.text());
            results[i] = (ch.name || ('第' + (i + 1) + '章')) + '\n' + (cData.str || '') + '\n';
          } catch (e) {
            results[i] = (ch.name || ('第' + (i + 1) + '章')) + '\n【本章获取失败】\n';
          }
        }
      }
      await Promise.all(Array.from({ length: CONC }, worker));
      txt += results.join('\n');
      const fname = (params.name || pageData.name || 'novel') + '.txt';
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="' + encodeURIComponent(fname) + '"'
      });
      res.end(txt);
      return;
    }
    res.writeHead(404); res.end(JSON.stringify({ error: '未知 novel 接口' }));
  } catch (e) {
    res.writeHead(502); res.end(JSON.stringify({ error: 'novel-api 代理失败：' + e.message }));
  }
}

function serveStatic(req, res, pathname) {
  let rel = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(WEB_ROOT, rel));
  if (!filePath.startsWith(WEB_ROOT)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      fs.readFile(path.join(WEB_ROOT, 'index.html'), (e2, d2) => {
        if (e2) { res.writeHead(404); res.end('Not Found'); }
        else { res.writeHead(200, { 'Content-Type': MIME['.html'] }); res.end(d2); }
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const u = url.parse(req.url, true);
  const params = u.query || {};
  const pathname = u.pathname || '/';

  // 通用小说搜索代理
  if (pathname.startsWith('/api/novel')) {
    return handleNovel(req, res, pathname, params);
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
  console.log('本地服务已启动（托管网页 + 通用小说搜索）：');
  console.log('  → 浏览器打开  http://localhost:' + PORT);
  console.log('通用小说搜索： 工具箱「小说下载」页（/ → 阅读 → 小说下载），自动拉起 novel-api 子进程');
  startNovelApi();
  warmUpNovelApi();
});

// 预热 novel-api：提前触发首请求，避免用户首次搜索被冷启动拖慢
function warmUpNovelApi() {
  fetch('http://127.0.0.1:' + NOVEL_API_PORT + '/')
    .then(() => console.log('[novel-api] 预热完成'))
    .catch(() => {});
}
