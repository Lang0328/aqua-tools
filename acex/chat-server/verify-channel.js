/**
 * chat-server/verify-channel.js — 验证频道权限与广播修复
 * 用法：node verify-channel.js
 */
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3898;
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
    // 登录
    const admin = await loginAs('admin', 'admin123');
    const alice = await loginAs('alice', '123456');
    const bob = await loginAs('bob', '123456');
    check('admin 登录', admin.status === 200 && !!admin.token);
    check('alice 登录', alice.status === 200 && !!alice.token);

    const hdrs = { 'X-Auth-Token': admin.token };
    const ahdrs = { 'X-Auth-Token': alice.token };
    const bh = { 'X-Auth-Token': bob.token };
    const aliceId = alice.json.user.id;
    const bobId = bob.json.user.id;

    // 1. c_ann 为 adminPostOnly
    const ann = await api('/api/db/channels/c_ann', { headers: hdrs });
    check('c_ann adminPostOnly=true', !!(ann.json && ann.json.data && ann.json.data.adminPostOnly), JSON.stringify(ann.json && ann.json.data && ann.json.data.adminPostOnly));
    const off = await api('/api/db/channels/c_official', { headers: hdrs });
    check('c_official adminPostOnly=true', !!(off.json && off.json.data && off.json.data.adminPostOnly));

    // 2. 非管理员发消息到 c_ann → 403
    const aliceMsg = await api('/api/db/messages', { method: 'POST', headers: ahdrs, body: { data: { id: 'm_unauth_ann', chatId: 'c_ann', sender: aliceId, type: 'text', content: 'x', time: Date.now() } } });
    check('非管理员写入 c_ann → 403', aliceMsg.status === 403, 'status=' + aliceMsg.status + ' ' + (aliceMsg.json && aliceMsg.json.error));
    const alicePost = await api('/api/db/channel_posts', { method: 'POST', headers: ahdrs, body: { data: { id: 'p_unauth_ann', channelId: 'c_ann', authorId: aliceId, content: 'x', status: 'approved', created: Date.now() } } });
    check('非管理员写入 c_ann 帖子 → 403', alicePost.status === 403, 'status=' + alicePost.status);

    // 3. 创建 ownerPostOnly 频道（模拟用户创建，带 ownerPostOnly 标志）
    const chId = 'ch_verify_' + Date.now();
    await api('/api/db/channels', { method: 'POST', headers: ahdrs, body: { data: { id: chId, name: '验证频道', owner: aliceId, subscribers: [aliceId, admin.json.user.id], postApproval: false, ownerPostOnly: true, created: Date.now(), type: 'channel' } } });
    // alice（创建者）可发消息
    const aliceOk = await api('/api/db/messages', { method: 'POST', headers: ahdrs, body: { data: { id: 'm_own_ok', chatId: chId, sender: aliceId, type: 'text', content: 'hi', time: Date.now() } } });
    check('创建者写入自身频道 → 200', aliceOk.status === 200, 'status=' + aliceOk.status);
    // bob 不是创建者 → 403
    const bobMsg = await api('/api/db/messages', { method: 'POST', headers: bh, body: { data: { id: 'm_own_forbid', chatId: chId, sender: bobId, type: 'text', content: 'hi', time: Date.now() } } });
    check('非创建者写入 ownerPostOnly 频道 → 403', bobMsg.status === 403, 'status=' + bobMsg.status + ' ' + (bobMsg.json && bobMsg.json.error));
    const bobPost = await api('/api/db/channel_posts', { method: 'POST', headers: bh, body: { data: { id: 'p_own_forbid', channelId: chId, authorId: bobId, content: 'x', status: 'approved', created: Date.now() } } });
    check('非创建者写入 ownerPostOnly 帖子 → 403', bobPost.status === 403);
    // 平台管理员可写（即便不是创建者）
    const adminMsg = await api('/api/db/messages', { method: 'POST', headers: hdrs, body: { data: { id: 'm_own_admin', chatId: chId, sender: admin.json.user.id, type: 'text', content: 'admin', time: Date.now() } } });
    check('平台管理员写入 ownerPostOnly 频道 → 200', adminMsg.status === 200, 'status=' + adminMsg.status);

    // 5. 广播路由（修复后前端调用 /admin/broadcast，实际为 /api/admin/broadcast）
    const bcAdmin = await api('/api/admin/broadcast', { method: 'POST', headers: hdrs, body: { title: 't', text: '测试广播' } });
    check('管理员广播 → 200', bcAdmin.status === 200, 'status=' + bcAdmin.status);
    const bcBob = await api('/api/admin/broadcast', { method: 'POST', headers: bh, body: { title: 't', text: 'x' } });
    check('非管理员广播 → 403', bcBob.status === 403, 'status=' + bcBob.status);

    // 清理
    await api('/api/db/channels/' + chId, { method: 'DELETE', headers: hdrs }).catch(() => {});
    await api('/api/db/messages/m_own_ok', { method: 'DELETE', headers: hdrs }).catch(() => {});
    await api('/api/db/messages/m_own_admin', { method: 'DELETE', headers: hdrs }).catch(() => {});
    await api('/api/db/messages/m_own_forbid', { method: 'DELETE', headers: hdrs }).catch(() => {});
  } catch (e) {
    failures++;
    console.log('  \u2717 异常: ' + e.message);
  } finally {
    server.kill();
    console.log(failures === 0 ? '\n全部通过 \u2713' : '\n失败 ' + failures + ' 项 \u2717');
    process.exit(failures === 0 ? 0 : 1);
  }
})();
