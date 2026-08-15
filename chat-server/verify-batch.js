const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 3999;
let passed = 0, failed = 0;
function check(name, cond, extra) {
  if (cond) { passed++; console.log('  PASS ' + name); }
  else { failed++; console.log('  FAIL ' + name + (extra ? '  ' + extra : '')); }
}

const server = spawn(process.execPath, ['server.js'], {
  cwd: __dirname, env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe']
});
server.stdout.on('data', d => process.stdout.write('  [srv] ' + d));
server.stderr.on('data', d => process.stdout.write('  [err] ' + d));

function get(p, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, headers: headers || {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function postBinary(p, buf, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: p, method: 'POST', headers: headers || {} }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.write(buf);
    req.end();
  });
}

const STATIC = [
  '/tools.html', '/script.js', '/js/fun-tools.js', '/chat.html', '/styles.css', '/api-init.js',
  '/login.html', '/desktop.html', '/index.html', '/dataspace.html', '/data.html', '/upload.html',
  '/permission.html', '/request.html', '/log.html', '/css/style.css', '/js/login.js', '/js/auth.js',
  '/js/db.js', '/js/data.js', '/js/upload.js', '/js/favorite.js', '/favicon.svg'
];

async function main() {
  await new Promise(r => setTimeout(r, 1500));
  console.log('== 静态资源 ==');
  for (const p of STATIC) {
    try {
      const r = await get(p);
      check(p + ' -> ' + r.status, r.status === 200, '(got ' + r.status + ')');
    } catch (e) { check(p, false, e.message); }
  }

  console.log('== 文件快传 API ==');
  try {
    const data = Buffer.from('Hello Aqua file transfer \u4f60\u597d\u4e16\u754c 0123456789');
    const up = await postBinary('/api/ft/upload', data, {
      'Content-Type': 'application/octet-stream',
      'x-filename': encodeURIComponent('测试文件.txt'),
      'x-type': 'text/plain'
    });
    check('/api/ft/upload 200', up.status === 200, 'body=' + up.body.toString());
    let code = null;
    try { code = JSON.parse(up.body.toString()).code; } catch (e) {}
    check('upload returns 6-char code', !!code && /^[A-Z2-9]{6}$/.test(code), 'code=' + code);

    const meta = await get('/api/ft/' + code + '/meta');
    check('meta 200', meta.status === 200);
    let metaOk = false;
    try {
      const m = JSON.parse(meta.body.toString());
      metaOk = m.size === data.length && decodeURIComponent(m.name) === '测试文件.txt';
      console.log('    meta size=' + m.size + ' name=' + m.name);
    } catch (e) {}
    check('meta size/name correct', metaOk);

    const dl = await get('/api/ft/' + code);
    check('download 200', dl.status === 200);
    check('download content matches', dl.body.equals(data));

    const bad = await get('/api/ft/NOPE99/meta');
    check('bad code -> 404', bad.status === 404);

    const up2 = await postBinary('/api/ft/upload', Buffer.from('no-content-type-body'), {
      'x-filename': encodeURIComponent('bare.bin')
    });
    check('upload without Content-Type works', up2.status === 200, 'body=' + up2.body.toString());
  } catch (e) { check('ft flow', false, e.message); }

  console.log('== 数据空间页面引用资源 ==');
  try {
    const pages = ['/dataspace.html', '/data.html', '/upload.html', '/permission.html', '/request.html', '/log.html'];
    const refs = [];
    for (const p of pages) {
      const r = await get(p);
      if (r.status !== 200) continue;
      const html = r.body.toString();
      const m = html.match(/src="([^"]+\.js[^"]*)"/g) || [];
      const l = html.match(/href="([^"]+\.css[^"]*)"/g) || [];
      m.concat(l).forEach(x => {
        const u = x.replace(/^(src|href)="/, '').replace(/"$/, '').split('?')[0];
        if (!u.startsWith('http')) refs.push({ page: p, url: u });
      });
    }
    for (const ref of refs) {
      const u = ref.url.startsWith('/') ? ref.url : '/' + ref.url;
      const r = await get(u);
      check(ref.page + ' -> ' + ref.url + ' -> ' + r.status, r.status === 200, '(got ' + r.status + ')');
    }
  } catch (e) { check('data space refs', false, e.message); }

  console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
  server.kill();
  process.exit(failed ? 1 : 0);
}
setTimeout(main, 300);
