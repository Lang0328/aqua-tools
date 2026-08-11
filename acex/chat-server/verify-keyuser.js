const { spawn } = require('child_process');
const path = require('path');
const PORT = 3901;
const BASE = 'http://localhost:' + PORT;
const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), DB_FILE: ':memory:' }),
  stdio: ['ignore', 'ignore', 'ignore']
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  await sleep(1200);
  let fail = 0;
  try {
    const r = await fetch(BASE + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'key', identifier: 'sen_k1', secret: 'x' }) });
    const j = await r.json();
    const u = j.user || {};
    const un = /^sen_[0-9A-Z]{6}$/.test(u.username || '');
    const nm = /^密匙用户_[0-9A-Z]{6}$/.test(u.name || '');
    console.log('  ' + (un ? 'ok ' : 'FAIL ') + 'username=' + u.username);
    console.log('  ' + (nm ? 'ok ' : 'FAIL ') + 'name=' + u.name);
    if (!un || !nm) fail++;
    if (!u.id || !j.token) { console.log('  FAIL missing id/token'); fail++; }
    // 再次登录同一密钥应返回同一用户
    const r2 = await fetch(BASE + '/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'key', identifier: 'sen_k1', secret: 'x' }) });
    const j2 = await r2.json();
    const same = j2.user && j2.user.id === u.id;
    console.log('  ' + (same ? 'ok ' : 'FAIL ') + '同一密钥二次登录返回同一用户');
    if (!same) fail++;
  } catch (e) { console.log('  FAIL ' + e.message); fail++; }
  console.log(fail === 0 ? 'KEY-USER OK' : fail + ' FAILURES');
  server.kill();
  process.exit(fail === 0 ? 0 : 1);
})();
