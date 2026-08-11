/**
 * chat-server/verify-msg-audit.js — 验证消息审计数据源
 * 管理员可通过 /api/db/messages 看到所有用户的消息。
 * 用法：node verify-msg-audit.js
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3897;
const BASE = 'http://localhost:' + PORT;

const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  \u2713 ' : '  \u2717 ') + name + (extra ? '  [' + extra + ']' : ''));
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

async function loginAs(username, pw) {
  const r = await api('/api/auth', { method: 'POST', body: { type: 'password', username: username, secret: require('./db').hashPass(pw) } });
  return { status: r.status, token: r.json && r.json.token, json: r.json };
}

(async () => {
  await sleep(800);
  try {
    const admin = await loginAs('admin', 'admin123');
    const alice = await loginAs('alice', '123456');
    const bob = await loginAs('bob', '123456');
    check('admin 登录', admin.status === 200 && !!admin.token);
    check('alice 登录', alice.status === 200 && !!alice.token);
    check('bob 登录', bob.status === 200 && !!bob.token);

    const hdrs = { 'X-Auth-Token': admin.token };
    const ah = { 'X-Auth-Token': alice.token };
    const bh = { 'X-Auth-Token': bob.token };
    const aliceId = alice.json.user.id;
    const bobId = bob.json.user.id;

    // alice 与 bob 各发一条私聊消息（聊到不同会话）
    const m1 = 'audit_1_' + Date.now();
    const m2 = 'audit_2_' + Date.now();
    const dmA = 'dm_' + [aliceId, admin.json.user.id].sort().join('|');
    const dmB = 'dm_' + [bobId, admin.json.user.id].sort().join('|');
    await api('/api/db/messages', { method: 'POST', headers: ah, body: { data: { id: m1, chatId: dmA, sender: aliceId, type: 'text', content: '审计私聊消息Alice', time: Date.now() } } });
    await api('/api/db/messages', { method: 'POST', headers: bh, body: { data: { id: m2, chatId: dmB, sender: bobId, type: 'text', content: '审计私聊消息Bob', time: Date.now() } } });

    // 管理员查看全部消息
    const all = await api('/api/db/messages', { headers: hdrs });
    const found1 = (all.json.list || []).find(m => m.id === m1);
    const found2 = (all.json.list || []).find(m => m.id === m2);
    check('管理员可看到 Alice 消息', !!found1 && found1.content === '审计私聊消息Alice');
    check('管理员可看到 Bob 消息', !!found2 && found2.content === '审计私聊消息Bob');
    check('管理员列表含私聊 chatId', !!found1 && !!found1.chatId && String(found1.chatId).indexOf('dm_') === 0);

    // 清理
    await api('/api/db/messages/' + m1, { method: 'DELETE', headers: hdrs }).catch(() => {});
    await api('/api/db/messages/' + m2, { method: 'DELETE', headers: hdrs }).catch(() => {});
  } catch (e) {
    failures++;
    console.log('  \u2717 异常: ' + e.message);
  } finally {
    server.kill();
    console.log(failures === 0 ? '\n全部通过 \u2713' : '\n失败 ' + failures + ' 项 \u2717');
    process.exit(failures === 0 ? 0 : 1);
  }
})();
