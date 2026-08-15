/**
 * chat-server/test-smoke.js — 冒烟测试
 * 启动服务器 → 演示账号登录 → 发消息 → 查消息 → 按字段查询 → 登出。
 * 用法：node test-smoke.js （npm test）
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3899;
const BASE = 'http://localhost:' + PORT;

const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let failures = 0;
function check(name, cond) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name);
  if (!cond) failures++;
}

async function api(pathStr, opts) {
  opts = opts || {};
  const res = await fetch(BASE + pathStr, {
    method: opts.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

(async () => {
  await sleep(800);
  try {
    // 1. 密码登录
    const login = await api('/api/auth', { method: 'POST', body: { type: 'password', username: 'alice', secret: require('./db').hashPass('123456') } });
    check('密码登录(alice/123456)', login.status === 200 && !!login.json.token && login.json.user.username === 'alice');
    if (login.status !== 200) { console.log('   响应: ' + JSON.stringify(login.json)); process.exit(1); }
    const token = login.json.token;
    const alice = login.json.user;
    const headers = { 'X-Auth-Token': token };

    // 2. 未带 token 访问应 401
    const noAuth = await api('/api/db/users');
    check('未登录访问被拒(401)', noAuth.status === 401);

    // 3. 发消息
    const msg = { id: 'm_smoke_1', chatId: 'contact:u_bob', fromId: alice.id, fromName: 'Alice', type: 'text', content: '冒烟测试消息', time: Date.now() };
    const post = await api('/api/db/messages', { method: 'POST', headers, body: { data: msg } });
    check('发送消息', post.status === 200 && post.json.ok);

    // 4. 查消息（按 chatId 索引）
    const q = await api('/api/db/messages?idx=chatId&val=contact:u_bob', { headers });
    const found = (q.json.list || []).find(m => m.id === 'm_smoke_1');
    check('按索引查询到消息', !!found && found.content === '冒烟测试消息');

    // 5. 管理员登录 + 管理端数据
    const adminLogin = await api('/api/auth', { method: 'POST', body: { type: 'password', username: 'admin', secret: require('./db').hashPass('admin123') } });
    check('管理员登录', adminLogin.status === 200 && adminLogin.json.user.role === 'admin');
    const adminUsers = await api('/api/db/users', { headers: { 'X-Auth-Token': adminLogin.json.token } });
    check('用户列表 >= 4', (adminUsers.json.list || []).length >= 4);

    // 6. 错误密码
    const bad = await api('/api/auth', { method: 'POST', body: { type: 'password', username: 'alice', secret: 'wrong' } });
    check('错误密码被拒(401)', bad.status === 401);

    // 7. 重复注册
    const dup = await api('/api/auth', { method: 'POST', body: { type: 'register', username: 'alice', secret: 'x' } });
    check('重复用户名被拒(409)', dup.status === 409);

    // 8. 删除 + 登出
    const del = await api('/api/db/messages/m_smoke_1', { method: 'DELETE', headers });
    check('删除消息', del.status === 200 && del.json.ok);
    const logout = await api('/api/logout', { method: 'POST', headers });
    check('登出', logout.status === 200);
    const afterLogout = await api('/api/db/users', { headers });
    check('登出后 token 失效(401)', afterLogout.status === 401);

    // 9. 静态页面
    const page = await fetch(BASE + '/chat.html');
    check('静态页 chat.html 可访问', page.status === 200 && (await page.text()).includes('api-init.js'));
  } catch (e) {
    console.log('  ✗ 测试异常: ' + e.message);
    failures++;
  }

  server.kill();
  await sleep(300);
  console.log(failures === 0 ? '\n全部通过 ✓' : '\n' + failures + ' 项失败 ✗');
  process.exit(failures === 0 ? 0 : 1);
})();
