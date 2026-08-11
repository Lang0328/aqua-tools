/**
 * chat-server/server.js — Aqua Chat 服务器版
 * Express + SQLite，静态托管 public/，提供与前端 chat.js 数据层对应的 REST API。
 *
 * 启动：npm install && npm start   （默认端口 3000，可用 PORT 环境变量覆盖）
 */
const express = require('express');
const path = require('path');
const D = require('./db');
const RT = require('./realtime');
const Bots = require('./bots');

const app = express();
const PORT = process.env.PORT || 3000;

Bots.init();

/* 确保官方频道存在并让所有用户订阅（幂等，兼容历史数据库） */
function ensureOfficialChannels() {
  const ensure = (chId, name, desc, adminPostOnly) => {
    let ch = D.get('channels', chId);
    const userIds = D.getAll('users').map(u => u.id);
    const admin = D.byIndex('users', 'role', 'admin')[0];
    if (!ch) {
      ch = {
        id: chId, name: name, desc: desc, owner: admin ? admin.id : '',
        subscribers: userIds, postApproval: false, adminPostOnly: adminPostOnly,
        created: D.now(), type: 'channel'
      };
      D.put('channels', chId, ch);
    } else {
      let changed = false;
      if (ch.adminPostOnly !== adminPostOnly) { ch.adminPostOnly = adminPostOnly; changed = true; }
      if (!Array.isArray(ch.subscribers)) ch.subscribers = [];
      userIds.forEach(id => { if (ch.subscribers.indexOf(id) === -1) { ch.subscribers.push(id); changed = true; } });
      if (changed) D.put('channels', chId, ch);
    }
    // 无欢迎帖时补一条（频道帖子流）
    if (!D.getAll('channel_posts').some(p => p.channelId === chId && String(p.content || '').indexOf('欢迎') !== -1)) {
      D.put('channel_posts', 'post_' + chId + '_welcome', {
        id: 'post_' + chId + '_welcome', channelId: chId, authorId: admin ? admin.id : '',
        content: '欢迎来到' + name + '！' + (adminPostOnly ? '本频道仅管理员可发布。' : ''),
        status: 'approved', likeCount: 0, created: D.now()
      });
    }
    // 无欢迎消息时补一条（频道主消息流）
    if (admin && !D.byIndex('messages', 'chatId', chId).some(m => String(m.content || '').indexOf('欢迎') !== -1)) {
      D.put('messages', D.uid(), {
        id: D.uid(), chatId: chId, sender: admin.id, type: 'text',
        content: '欢迎来到' + name + '！' + (adminPostOnly ? '本频道由管理员发布，大家可阅读。' : ''),
        time: D.now(), edited: false, recalled: false, isExpired: false
      });
    }
  };
  ensure('c_ann', '系统公告', '平台更新与通知', true);
  ensure('c_official', '官方频道', 'Aqua Chat 官方信息与公告，仅管理员可发布', true);
  // 普通频道（用户创建的频道）：仅创建者可发布（兼容历史数据，避免覆盖已配置的频道）
  D.getAll('channels').forEach(ch => {
    if (ch.id === 'c_ann' || ch.id === 'c_official') return;
    if (!ch.ownerPostOnly && !ch.adminPostOnly) {
      ch.ownerPostOnly = true;
      D.put('channels', ch.id, ch);
    }
  });
}
ensureOfficialChannels();

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- 根路径 → 聊天页 ---------- */
app.get('/', (req, res) => res.redirect(302, '/chat.html'));

/* ---------- 认证 ---------- */
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'];
  const user = token ? D.userByToken(token) : null;
  if (!user) { res.status(401).json({ status: 401, ok: false, error: '未登录或登录已过期' }); return; }
  req.user = user;
  next();
}

function ok(res, data) { res.json(Object.assign({ ok: true }, data)); }

/* 自动订阅系统公告 / 官方频道（所有登录均可见） */
function subscribeChannels(user) {
  ['c_ann', 'c_official'].forEach(chId => {
    const ch = D.get('channels', chId);
    if (ch && Array.isArray(ch.subscribers)) {
      if (ch.subscribers.indexOf(user.id) === -1) ch.subscribers.push(user.id);
      D.put('channels', chId, ch);
      RT.sendToUser(user.id, 'channel-subscribe', { channelId: chId });
    }
  });
}

/* 超级群组：确保所有登录用户自动加入（幂等），新加入时推送刷新 */
function ensureGroupMembership(user) {
  if (D.ensureOfficialGroup(user && user.id)) {
    if (user && user.id) RT.sendToUser(user.id, 'group-update', { groupId: 'g_official_group' });
  }
}

/* 启动时补齐官方超级群组（含历史数据库的所有存量用户） */
D.ensureOfficialGroup();

/* ---------- POST /api/auth — 四种登录方式 ---------- */
app.post('/api/auth', (req, res) => {
  const { type } = req.body || {};
  if (!type) return res.status(400).json({ ok: false, error: '缺少登录类型' });

  let user = null;

  if (type === 'password') {
    const { username, secret } = req.body;
    const found = D.byIndex('users', 'username', String(username || '').trim());
    if (!found.length) return res.status(401).json({ ok: false, error: '用户名不存在' });
    const creds = D.byIndex('auth_creds', 'userId', found[0].id);
    const pc = creds.find(c => c.loginType === 'password');
    if (!pc || pc.credentialHash !== secret) return res.status(401).json({ ok: false, error: '密码错误' });
    user = found[0];
  }

  else if (type === 'device') {
    const { identifier, secret } = req.body;
    const ident = String(identifier || '');
    const creds = D.byIndex('auth_creds', 'identifier', ident);
    if (creds.length) {
      const devCred = creds.find(c => c.loginType === 'device') || creds[0];
      user = D.get('users', devCred.userId);
      if (!user) return res.status(401).json({ ok: false, error: '用户不存在' });
      // 密码未设置 → 仍允许一键登录，并提醒设置密码
      if (!user.devicePwdSet) {
        const tok = D.issueToken(user.id);
        D.put('admin_logs', D.uid(), { id: D.uid(), time: D.now(), userId: user.id, action: 'login', detail: '设备一键登录（未设置密码），提醒设置密码' });
        subscribeChannels(user);
        ensureGroupMembership(user);
        RT.sendToUsers(RT.onlineUserIds(), 'user-online', { userId: user.id, name: user.name || user.username, status: 'online' });
        RT.sendToUser(user.id, 'device-need-set-password', {});
        return ok(res, { token: tok, user: user, needSetPassword: true });
      }
      // 密码已设置 → 必须校验
      if (!secret || D.hashPass(String(secret)) !== (user.devicePasswordHash || '')) {
        return res.status(401).json({ ok: false, error: '请输入设备密码', needPassword: true });
      }
    } else {
      // 首次设备登录：允许无密码创建
      const id = 'u_' + D.uid();
      user = {
        id: id, username: 'dev_' + id.slice(-6), name: '设备用户_' + id.slice(-4),
        avatar: '', bio: '', role: 'user', status: 'online', created: D.now(),
        devicePwdSet: false, devicePasswordHash: ''
      };
      D.put('users', id, user);
      D.put('auth_creds', D.uid(), { id: D.uid(), userId: id, loginType: 'device', identifier: ident, credentialHash: D.hashPass(String(secret || ident)), createdAt: D.now(), passwordSet: !!secret });
      D.put('devices', D.uid(), { id: D.uid(), userId: id, deviceName: 'Server device', deviceFingerprint: ident, lastIp: req.ip, lastActiveAt: D.now(), isTrusted: true });
      const tok = D.issueToken(id);
      D.put('admin_logs', D.uid(), { id: D.uid(), time: D.now(), userId: id, action: 'login', detail: '设备一键登录（首次），提醒设置密码' });
      subscribeChannels(user);
      ensureGroupMembership(user);
      RT.sendToUsers(RT.onlineUserIds(), 'user-online', { userId: id, name: user.name || user.username, status: 'online' });
      RT.sendToUser(id, 'device-need-set-password', {});
      ok(res, { token: tok, user: user, needSetPassword: true });
      return; // 跳过公共登录尾部
    }
  }

  else if (type === 'key') {
    const { identifier } = req.body;
    const creds = D.byIndex('auth_creds', 'identifier', String(identifier || ''));
    if (creds.length) {
      user = D.get('users', creds[0].userId);
      if (!user) return res.status(401).json({ ok: false, error: '用户不存在' });
    } else {
      const id = 'u_' + D.uid();
      const code = D.uid().slice(0, 6).toUpperCase();
      user = {
        id: id, username: 'sen_' + code, name: '密匙用户_' + code,
        avatar: '', bio: '', role: 'user', status: 'online', created: D.now()
      };
      D.put('users', id, user);
      D.put('auth_creds', D.uid(), { id: D.uid(), userId: id, loginType: 'key', identifier: String(identifier), credentialHash: String(identifier), createdAt: D.now() });
    }
  }

  else if (type === 'register') {
    const { username, secret } = req.body;
    const uname = String(username || '').trim();
    if (!uname || !secret) return res.status(400).json({ ok: false, error: '请填写用户名和密码' });
    if (D.byIndex('users', 'username', uname).length) return res.status(409).json({ ok: false, error: '用户名已存在' });
    const id = 'u_' + D.uid();
    user = {
      id: id, username: uname, password: secret, name: uname,
      avatar: '', bio: '', role: 'user', status: 'online', created: D.now()
    };
    D.put('users', id, user);
    D.put('auth_creds', D.uid(), { id: D.uid(), userId: id, loginType: 'password', identifier: uname, credentialHash: secret, createdAt: D.now() });
  }

  else return res.status(400).json({ ok: false, error: '不支持的登录类型' });

  user.status = 'online';
  D.put('users', user.id, user);

  // 自动订阅系统公告 / 官方频道（对新注册 / 新设备用户生效，本地缓存刷新）
  subscribeChannels(user);
  ensureGroupMembership(user);

  const token = D.issueToken(user.id);
  D.put('admin_logs', D.uid(), { id: D.uid(), time: D.now(), userId: user.id, action: 'login', detail: '用户通过 ' + type + ' 登录' });
  RT.sendToUsers(RT.onlineUserIds(), 'user-online', { userId: user.id, name: user.name || user.username, status: 'online' });
  ok(res, { token, user });
});

/* ---------- POST /api/logout ---------- */
   app.post('/api/logout', requireAuth, (req, res) => {
     D.revokeToken(String(req.headers['x-auth-token']));
     const user = req.user;
     user.status = 'offline';
     D.put('users', user.id, user);
     RT.sendToUsers(RT.onlineUserIds(), 'user-online', { userId: user.id, name: user.name || user.username, status: 'offline' });
     ok(res, {});
   });

   /* ---------- 设置设备登录密码（首次设备登录后） ---------- */
   app.post('/api/auth/device/set-password', requireAuth, (req, res) => {
     const { secret } = req.body || {};
     if (!secret || secret.length < 4) return res.status(400).json({ ok: false, error: '密码至少 4 位' });
     const u = D.get('users', req.user.id);
     if (!u) return res.status(404).json({ ok: false, error: '用户不存在' });
     u.devicePasswordHash = D.hashPass(String(secret));
     u.devicePwdSet = true;
     D.put('users', u.id, u);
     ok(res, { ok: true, passwordSet: true });
   });

/* ---------- /api/db/:store 通用数据接口 ---------- */
app.get('/api/db/:store', requireAuth, (req, res) => {
  const { store } = req.params;
  const { idx, val } = req.query;
  ok(res, { list: idx ? D.byIndex(store, idx, val) : D.getAll(store) });
});

app.get('/api/db/:store/count', requireAuth, (req, res) => {
  ok(res, { count: D.count(req.params.store) });
});

app.get('/api/db/:store/:id', requireAuth, (req, res) => {
  const data = D.get(req.params.store, req.params.id);
  if (!data) return res.status(404).json({ ok: false, error: '记录不存在' });
  ok(res, { data });
});

app.post('/api/db/:store', requireAuth, (req, res) => {
  const { store } = req.params;
  const data = (req.body || {}).data;
  if (!data || typeof data !== 'object') return res.status(400).json({ ok: false, error: '缺少 data' });
  const id = data.id || D.uid();
  if (!data.id) data.id = id;
  // 频道权限：adminPostOnly 仅管理员；ownerPostOnly 仅创建者（平台管理员均可发布）
  if ((store === 'channel_posts' && data.channelId) || (store === 'messages' && data.chatId)) {
    const chId = store === 'channel_posts' ? data.channelId : data.chatId;
    const ch = D.get('channels', chId);
    if (ch) {
      if (ch.adminPostOnly && req.user.role !== 'admin') {
        return res.status(403).json({ ok: false, error: '该频道仅管理员可发布' });
      }
      if (ch.ownerPostOnly && req.user.role !== 'admin' && req.user.id !== ch.owner) {
        return res.status(403).json({ ok: false, error: '该频道仅创建者可发布' });
      }
    }
  }
  if (store === 'messages') {
    const existed = D.get('messages', id);
    if (existed) {
      RT.broadcastToChat(data.chatId, 'message-update', { id: id, message: data });
    } else {
      RT.broadcastToChat(data.chatId, 'message', { id: id, message: data });
      // 私聊机器人时，交给机器人引擎异步回复
      setImmediate(() => { try { Bots.onMessage(data); } catch (e) { console.error('Bot dispatch error:', e.message); } });
    }
  }
   D.put(store, id, data);
  if (store === 'contacts' && data && data.owner && data.contactId) {
    // 单向添加 → 建立双向联系人关系并通知对方
    var reverse = D.get('contacts', data.owner + '|' + data.contactId);
    if (!reverse) {
      var rev = { id: data.contactId + '|' + data.owner, owner: data.contactId, contactId: data.owner, created: data.created };
      D.put('contacts', rev.id, rev);
      RT.sendToUser(data.contactId, 'contact-added', { owner: data.contactId, contactId: data.owner });
    } else {
      RT.sendToUser(data.contactId, 'contact-added', { owner: data.contactId, contactId: data.owner });
    }
  }
  if (store === 'groups' && Array.isArray(data.members)) {
    RT.sendToUsers(data.members.map(m => m && m.id).filter(Boolean), 'group-update', { groupId: id });
  }
  ok(res, { id });
});

app.delete('/api/db/:store/:id', requireAuth, (req, res) => {
  if (req.params.store === 'messages') {
    const msg = D.get('messages', req.params.id);
    if (msg) RT.broadcastToChat(msg.chatId, 'message-delete', { id: req.params.id });
  }
  D.del(req.params.store, req.params.id);
  ok(res, {});
});

/* ---------- SSE 实时推送 ---------- */
app.get('/api/events', requireAuth, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  res.write('retry: 3000\n\n');
  RT.subscribe(req.user.id, res);
  req.on('close', () => { try { res.end(); } catch (e) {} });
});

/* ---------- 输入状态广播 ---------- */
app.post('/api/typing', requireAuth, (req, res) => {
  const { chatId, typing } = req.body || {};
  if (!chatId) return res.status(400).json({ ok: false, error: '缺少 chatId' });
  RT.broadcastToChat(chatId, 'typing', { chatId, userId: req.user.id, name: req.user.name || req.user.username, typing: !!typing });
  ok(res, {});
});

/* ---------- 单用户通知（用于加群审批等） ---------- */
app.post('/api/notify', requireAuth, (req, res) => {
  const { userId, type, extra } = req.body || {};
  if (!userId || !type) return res.status(400).json({ ok: false, error: '缺少 userId/type' });
  RT.sendToUser(userId, 'notification', { type, extra: extra || {} });
  ok(res, {});
});

/* ---------- 举报（服务器端存储，spam_bot 可查） ---------- */
app.post('/api/report', requireAuth, (req, res) => {
  const { targetUserId, reason } = req.body || {};
  if (!targetUserId) return res.status(400).json({ ok: false, error: '缺少被举报用户' });
  if (targetUserId === req.user.id) return res.status(400).json({ ok: false, error: '不能举报自己' });
  if (!D.get('users', targetUserId)) return res.status(404).json({ ok: false, error: '用户不存在' });
  const id = D.uid();
  D.put('reports', id, {
    id: id, targetUserId: targetUserId, reporterId: req.user.id,
    reason: String(reason || '未填写'), time: D.now(), status: 'pending'
  });
  D.byIndex('users', 'role', 'admin').forEach(a => {
    RT.sendToUser(a.id, 'notification', {
      type: 'report',
      extra: { reportId: id, targetUsername: D.get('users', targetUserId).username, reporterName: req.user.name || req.user.username, reason: String(reason || '') }
    });
  });
  ok(res, { id });
});

/* ---------- 机器人列表（发现机器人） ---------- */
app.get('/api/bots', requireAuth, (req, res) => {
  const list = D.getAll('bots').map(b => ({
    id: b.id, username: b.username, name: b.name, kind: b.kind, template: b.template,
    isOfficial: !!b.isOfficial, desc: b.desc, note: b.note || '', status: b.status
  }));
  ok(res, { list });
});

/* ---------- 机器人详情（命令 / 关键词，供输入框快捷命令栏） ---------- */
app.get('/api/bots/:username', requireAuth, (req, res) => {
  const rec = D.get('bots', 'u_' + String(req.params.username).toLowerCase());
  if (!rec || rec.status !== 'active') return res.status(404).json({ ok: false, error: '机器人不存在' });
  ok(res, {
    data: {
      id: rec.id, username: rec.username, name: rec.name, kind: rec.kind, template: rec.template,
      isOfficial: !!rec.isOfficial, desc: rec.desc, note: rec.note || '',
      commands: rec.commands || {}, keywords: rec.keywords || []
    }
  });
});

/* ---------- 管理员广播 ---------- */
function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  res.status(403).json({ ok: false, error: '需要管理员权限' });
}
app.post('/api/admin/broadcast', requireAuth, requireAdmin, (req, res) => {
  const { title, text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ ok: false, error: '广播内容不能为空' });
  const id = D.uid();
  const rec = {
    id: id,
    title: String(title || '管理员广播').trim(),
    text: String(text).trim(),
    authorId: req.user.id,
    authorName: req.user.name || req.user.username,
    time: D.now()
  };
  D.put('broadcasts', id, rec);
  RT.broadcastAll('broadcast', { id: id, title: rec.title, text: rec.text, from: req.user.id, name: rec.authorName, time: rec.time });
  ok(res, { id });
});

/* ---------- 管理员广播历史 ---------- */
app.get('/api/admin/broadcasts/history', requireAuth, requireAdmin, (req, res) => {
  const list = D.getAll('broadcasts').sort((a, b) => ((a.time || '') < (b.time || '') ? 1 : -1));
  ok(res, { list });
});

/* ---------- 文件快传：服务器中转取件码 ---------- */
const fs = require('fs');
const ftDir = path.join(__dirname, 'data', 'ft');
if (!fs.existsSync(ftDir)) fs.mkdirSync(ftDir, { recursive: true });
const FT_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FT_TTL = 24 * 60 * 60 * 1000;

function ftCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += FT_CHARS[Math.floor(Math.random() * FT_CHARS.length)];
  return c;
}

function ftCleanup() {
  try {
    fs.readdirSync(ftDir).forEach(f => {
      if (!f.endsWith('.json')) return;
      try {
        const m = JSON.parse(fs.readFileSync(path.join(ftDir, f), 'utf8'));
        if (Date.now() - (m.created || 0) > FT_TTL) {
          fs.unlinkSync(path.join(ftDir, f));
          fs.unlinkSync(path.join(ftDir, m.code + '.bin'));
        }
      } catch (e) { /* 忽略损坏元数据 */ }
    });
  } catch (e) { /* 忽略 */ }
}

app.post('/api/ft/upload', express.raw({ type: () => true, limit: '500mb' }), (req, res) => {
  if (!req.body || !req.body.length) return res.status(400).json({ ok: false, error: '空文件' });
  if (req.body.length > 500 * 1024 * 1024) return res.status(400).json({ ok: false, error: '文件过大（限制 500MB）' });
  ftCleanup();
  let code;
  do { code = ftCode(); } while (fs.existsSync(path.join(ftDir, code + '.bin')));
  const name = String(req.get('x-filename') || 'file').slice(0, 200);
  const size = req.body.length;
  fs.writeFileSync(path.join(ftDir, code + '.bin'), Buffer.from(req.body));
  fs.writeFileSync(path.join(ftDir, code + '.json'), JSON.stringify({ code, name, size, type: req.get('x-type') || '', created: Date.now() }));
  console.log('[file-transfer] upload ' + name + ' (' + size + 'B) -> ' + code);
  ok(res, { code, name, size });
});

app.get('/api/ft/:code/meta', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  try {
    const m = JSON.parse(fs.readFileSync(path.join(ftDir, code + '.json'), 'utf8'));
    ok(res, { code: m.code, name: m.name, size: m.size, type: m.type, created: m.created });
  } catch (e) {
    res.status(404).json({ ok: false, error: '取件码不存在或已过期' });
  }
});

app.get('/api/ft/:code', (req, res) => {
  const code = String(req.params.code || '').toUpperCase().trim();
  const file = path.join(ftDir, code + '.bin');
  if (!fs.existsSync(file)) return res.status(404).json({ ok: false, error: '取件码不存在或已过期' });
  let m = {};
  try { m = JSON.parse(fs.readFileSync(path.join(ftDir, code + '.json'), 'utf8')); } catch (e) {}
  const safeName = String(m.name || 'file').replace(/[\\/:*?"<>|\r\n]/g, '_');
  res.setHeader('Content-Type', m.type || 'application/octet-stream');
  res.setHeader('Content-Disposition', "attachment; filename=\"" + safeName + "\"");
  fs.createReadStream(file).pipe(res);
});

app.use('/api', (req, res) => res.status(404).json({ ok: false, error: '接口不存在' }));

app.listen(PORT, () => {
  console.log('Aqua Chat Server 已启动: http://localhost:' + PORT);
  console.log('演示账号: admin/admin123  alice/123456  bob/123456  carol/123456');
});
