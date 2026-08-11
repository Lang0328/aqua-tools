const { spawn } = require('child_process');
const path = require('path');

const PORT = 3899;
const BASE = 'http://localhost:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'ignore', 'ignore']
});
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  await sleep(1200);
  let fail = 0;
  for (const p of ['/tools.html', '/script.js', '/chat.html', '/api-init.js', '/js/fun-tools.js', '/js/favorite.js', '/js/chat.js', '/styles.css']) {
    try {
      const r = await fetch(BASE + p);
      const ok = r.status === 200;
      console.log((ok ? '  ok ' : '  FAIL ') + p + ' -> ' + r.status + ' (' + r.headers.get('content-length') + ' bytes)');
      if (!ok) fail++;
    } catch (e) {
      console.log('  FAIL ' + p + ' -> ' + e.message);
      fail++;
    }
  }
  console.log(fail === 0 ? 'ALL STATIC OK' : fail + ' FAILURES');
  server.kill();
  process.exit(fail === 0 ? 0 : 1);
})();
