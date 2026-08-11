/**
 * chat-server/db.js — SQLite 数据层（Node 内置 node:sqlite，零依赖）
 * 与前端 js/chat.js 的 IndexedDB 数据结构同构：
 * 单表 kv(store, id, data) 存储全部 store，data 为 JSON 字符串。
 */
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'aquachat.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS kv (
  store TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY (store, id)
);
CREATE TABLE IF NOT EXISTS tokens (
  token TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
`);

/* ---------- 与前端一致的哈希与 ID 生成 ---------- */
function hashPass(p) {
  if (!p) return '';
  var h = 0;
  for (var i = 0; i < p.length; i++) { h = ((h << 5) - h) + p.charCodeAt(i); h |= 0; }
  return 'h' + Math.abs(h).toString(36);
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function now() { return Date.now(); }

/* ---------- kv 通用操作（JSON 存取） ---------- */
function put(store, id, data) {
  db.prepare('INSERT INTO kv (store, id, data) VALUES (?, ?, ?) ON CONFLICT(store, id) DO UPDATE SET data = excluded.data')
    .run(store, id, JSON.stringify(data));
  return data;
}

function get(store, id) {
  const row = db.prepare('SELECT data FROM kv WHERE store = ? AND id = ?').get(store, id);
  return row ? JSON.parse(row.data) : null;
}

function del(store, id) {
  db.prepare('DELETE FROM kv WHERE store = ? AND id = ?').run(store, id);
  return true;
}

function getAll(store) {
  return db.prepare('SELECT data FROM kv WHERE store = ? ORDER BY rowid').all(store).map(r => JSON.parse(r.data));
}

function byIndex(store, idx, val) {
  return getAll(store).filter(it => it && it[idx] === val);
}

function count(store) {
  return db.prepare('SELECT COUNT(*) AS n FROM kv WHERE store = ?').get(store).n;
}

/* ---------- 实时消息参与者判定（推送目标） ---------- */
function getChatParticipants(chatId) {
  if (!chatId) return [];
  // 单聊：dm_<uidA>|<uidB>  （uid 含下划线，用 | 隔离）
  if (chatId.indexOf('dm_') === 0) {
    const rest = chatId.slice(3);
    if (rest.indexOf('|') === -1) return [];
    return rest.split('|');
  }
  // 文件传输助手：fh_<uid>
  if (chatId.indexOf('fh_') === 0) return [chatId.slice(3)];
  // 群聊/频道：chatId 即 record id，读成员
  const g = get('groups', chatId);
  if (g && Array.isArray(g.members)) return g.members.map(m => m && m.id).filter(Boolean);
  const ch = get('channels', chatId);
  if (ch && Array.isArray(ch.subscribers)) return ch.subscribers.filter(Boolean);
  return [];
}

/* ---------- token ---------- */
function issueToken(userId) {
  const token = uid() + uid();
  db.prepare('INSERT INTO tokens (token, userId, createdAt) VALUES (?, ?, ?)').run(token, userId, now());
  return token;
}

function revokeToken(token) {
  db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
  return true;
}

function userByToken(token) {
  const row = db.prepare('SELECT userId FROM tokens WHERE token = ?').get(token);
  return row ? get('users', row.userId) : null;
}

/* ---------- 超级群组：全员自动加入（幂等） ---------- */
function ensureOfficialGroup(userId) {
  const admin = byIndex('users', 'role', 'admin')[0] || byIndex('users', 'username', 'admin')[0] || null;
  let g = get('groups', 'g_official_group');
  if (!g) {
    const members = getAll('users').filter(u => u.role !== 'bot').map(u => ({ id: u.id, role: u.role === 'admin' ? 'owner' : 'member' }));
    g = {
      id: 'g_official_group', name: 'Aqua Chat 官方群', desc: '所有用户自动加入的超级群组',
      type: 'super', owner: admin ? admin.id : '', members: members, created: now()
    };
    put('groups', g.id, g);
    if (admin) {
      const wid = uid();
      put('messages', wid, {
        id: wid, chatId: 'g_official_group', sender: admin.id, type: 'text',
        content: '欢迎来到 Aqua Chat 官方群！所有用户自动加入的超级群组。',
        time: now(), edited: false, recalled: false, isExpired: false
      });
    }
    return true;
  }
  if (userId && !(g.members || []).some(m => m && m.id === userId)) {
    g.members.push({ id: userId, role: 'member' });
    put('groups', g.id, g);
    return true;
  }
  return false;
}

/* ---------- 种子数据（演示账号） ---------- */
function seed() {
  const existing = count('users');
  if (existing > 0) return;

  const demo = [
    { username: 'alice', secret: '123456', name: 'Alice', bio: '全栈工程师 | 摄影爱好者', role: 'user' },
    { username: 'bob', secret: '123456', name: 'Bob', bio: '前端开发，喜欢猫和咖啡', role: 'user' },
    { username: 'admin', secret: 'admin123', name: '管理员', bio: 'Aqua Chat 平台管理员', role: 'admin' },
    { username: 'carol', secret: '123456', name: 'Carol', bio: 'UI/UX 设计师', role: 'user' },
    { username: 'moss', secret: 'mossbot', name: 'MOSS', bio: 'Aqua Chat 官方助手机人', role: 'bot' }
  ];

  demo.forEach(d => {
    const id = d.username === 'moss' ? 'u_moss' : 'u_' + uid();
    const user = {
      id: id, username: d.username, password: hashPass(d.secret), name: d.name,
      avatar: '', bio: d.bio, role: d.role, status: 'offline', created: now()
    };
    put('users', id, user);
    const cred = { id: uid(), userId: id, loginType: 'password', identifier: d.username, credentialHash: hashPass(d.secret), createdAt: now() };
    put('auth_creds', cred.id, cred);
  });

   const admin = byIndex('users', 'username', 'admin')[0];
  const alice = byIndex('users', 'username', 'alice')[0];
  const bob = byIndex('users', 'username', 'bob')[0];
  const carol = byIndex('users', 'username', 'carol')[0];
  // 系统公告频道（全体订阅）
  put('channels', 'c_ann', {
    id: 'c_ann', name: '系统公告', desc: '平台更新与通知', owner: admin && admin.id || '',
    subscribers: [admin && admin.id, alice && alice.id, bob && bob.id, carol && carol.id].filter(Boolean),
    postApproval: false, adminPostOnly: true, created: now()
  });
  put('channel_posts', 'post_welcome', {
    id: 'post_welcome', channelId: 'c_ann', authorId: admin && admin.id || '',
    content: '欢迎使用 Aqua Chat 即时通讯平台！', status: 'approved', likeCount: 0, created: now()
  });
  // 官方频道（全体订阅，仅管理员可发布）
  put('channels', 'c_official', {
    id: 'c_official', name: '官方频道', desc: 'Aqua Chat 官方信息与公告，仅管理员可发布', owner: admin && admin.id || '',
    subscribers: [admin && admin.id, alice && alice.id, bob && bob.id, carol && carol.id].filter(Boolean),
    postApproval: false, adminPostOnly: true, created: now()
  });
  put('channel_posts', 'post_official_welcome', {
    id: 'post_official_welcome', channelId: 'c_official', authorId: admin && admin.id || '',
    content: '欢迎来到官方频道！这里将发布 Aqua Chat 的平台动态，仅管理员可以发帖。', status: 'approved', likeCount: 0, created: now()
  });
  // 官方频道主消息流欢迎消息
  if (admin) {
    const wid = uid();
    put('messages', wid, {
      id: wid, chatId: 'c_official', sender: admin.id, type: 'text',
      content: '欢迎来到官方频道！本频道由管理员发布，大家可阅读。',
      time: now(), edited: false, recalled: false, isExpired: false
    });
  }

  const logId = uid();
  put('admin_logs', logId, { id: logId, time: now(), userId: admin.id, action: 'seed', detail: '服务器初始化，预置演示账号' });
}

seed();

module.exports = { db, hashPass, uid, now, put, get, del, getAll, byIndex, count, issueToken, revokeToken, userByToken, getChatParticipants, ensureOfficialGroup };
