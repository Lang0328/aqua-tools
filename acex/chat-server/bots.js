/**
 * chat-server/bots.js — 服务端机器人引擎
 *
 * 架构：机器人是 users 表中的角色 'bot' 账号 + bots 表中的元数据。
 * 当用户给机器人发私聊消息时，服务器拦截并交给对应的机器人处理器，
 * 处理器回复的文本以机器人的身份写入同一条私聊会话（SSE 实时推送）。
 *
 * 内置官方机器人：
 *   - moss       官方助手机器人（/start /help /info …）
 *   - spam_bot   账号检查 / 垃圾评分 / 举报（/check /report /me）
 *   - bot_father 机器人之父（/newbot 创建机器人，模板 or 关键词回复）
 *
 * 自定义机器人：模板（echo 复读机 / dice 骰子 / keyword 关键词回复）或自由关键词配置。
 */
'use strict';
const D = require('./db');
const RT = require('./realtime');

const FILTERED_WORDS = ['spam', '赌博', '色情', '暴力', '博彩', '代购', '刷单', '兼职'];

const OFFICIAL_BOTS = [
  { username: 'moss', name: 'MOSS', bio: 'Aqua Chat 官方助手机器人\n使用方法：发送 /start 或 /help 查看全部命令', note: '官方助手机器人' },
  { username: 'spam_bot', name: '垃圾审查机器人', bio: '账号检查 / 垃圾评分 / 举报机器人\n使用方法：/check <用户名> 检查账号，/report <用户名> <原因> 举报', note: '账号检查与举报机器人' },
  { username: 'bot_father', name: '机器人之父', bio: '创建与管理机器人的官方机器人\n使用方法：发送 /newbot 开始创建专属机器人', note: '创建与管理机器人的官方机器人' }
];

const TEMPLATES = {
  echo: { name: '复读机', desc: '把你的消息原样回复给你', note: '复读机模板机器人' },
  dice: { name: '骰子', desc: '/dice 掷骰子，/num 随机数字', note: '骰子模板机器人' },
  keyword: { name: '关键词回复', desc: '按设定关键词自动回复（创建后可用 /setkeyword 配置）', note: '关键词回复模板机器人' }
};

const RESERVED_USERNAMES = ['admin', 'moss', 'spam_bot', 'bot_father'];

/* ===================== 基础工具 ===================== */

function parseCmd(text) {
  text = String(text || '').trim();
  if (text.charAt(0) !== '/') return { name: '', args: text };
  const parts = text.split(/\s+/);
  const name = parts[0].toLowerCase();
  const args = parts.slice(1).join(' ').trim();
  return { name, args };
}

function fmtTime(t) {
  if (!t) return '—';
  const d = new Date(t);
  return d.toLocaleString('zh-CN', { hour12: false });
}

function userToBotId(username) { return 'u_' + username; }

function isBot(uid) {
  const u = D.get('users', uid);
  if (!u) return false;
  if (u.role === 'bot') return true;
  return !!D.get('bots', uid);
}

function genToken() {
  return 'b' + D.uid().slice(0, 10) + ':' + D.uid().slice(0, 22);
}

function isReserved(username) {
  return RESERVED_USERNAMES.indexOf(username) !== -1 || !!D.byIndex('users', 'username', username).length;
}

function reply(chatId, botId, text) {
  const m = {
    id: D.uid(), chatId: chatId, sender: botId, type: 'text', content: text,
    time: D.now(), edited: false, recalled: false, isExpired: false
  };
  D.put('messages', m.id, m);
  RT.broadcastToChat(chatId, 'message', { id: m.id, message: m });
}

function resolveTarget(raw) {
  if (!raw) return null;
  let key = String(raw).trim().replace(/^@/, '');
  if (!key) return null;
  const byName = D.byIndex('users', 'username', key);
  if (byName.length) return byName[0];
  return D.get('users', key) || null;
}

/* ===================== 垃圾评分 ===================== */

function spamScore(target) {
  let score = 0;
  const reports = D.byIndex('reports', 'targetUserId', target.id);
  const pending = reports.filter(r => r.status === 'pending').length;
  const resolved = reports.filter(r => r.status === 'resolved').length;
  score += pending * 5 + resolved * 2;
  const age = D.now() - (target.created || D.now());
  if (age < 86400000) score += 3;          // 注册不足 1 天
  else if (age < 604800000) score += 1;    // 不足 7 天
  if (/^(ad|spam|bot)[0-9]{3,}/i.test(target.username || '')) score += 4;
  if (/^[0-9]{6,}$/.test(target.username || '')) score += 3;
  const bioText = ((target.bio || '') + ' ' + (target.name || '') + ' ' + (target.username || '')).toLowerCase();
  FILTERED_WORDS.forEach(w => { if (bioText.indexOf(w.toLowerCase()) !== -1) score += 3; });
  score = Math.min(100, score);
  const verdict = score === 0 ? '正常' : score < 15 ? '正常' : score < 35 ? '需留意' : score < 60 ? '疑似垃圾账号' : '高风险垃圾账号';
  return { score, verdict, pending, resolved, total: reports.length };
}

function accountReport(target) {
  const s = spamScore(target);
  const role = target.role === 'admin' ? '管理员' : target.role === 'bot' ? '机器人' : '用户';
  const isBotUser = target.role === 'bot';
  return [
    '📋 账号信息',
    '用户名: ' + target.username + (isBotUser ? ' 🤖' : ''),
    '昵称: ' + (target.name || '—'),
    'ID: ' + target.id,
    '角色: ' + role,
    '状态: ' + (target.status === 'online' ? '在线' : '离线'),
    '注册时间: ' + fmtTime(target.created),
    '个性签名: ' + (target.bio || '—'),
    '',
    '🚩 举报记录: 共 ' + s.total + ' 条（待处理 ' + s.pending + '，已处理 ' + s.resolved + '）',
    '⚠️ 垃圾评分: ' + s.score + '/100 → ' + s.verdict
  ].join('\n');
}

/* ===================== 官方机器人：MOSS ===================== */

function mossHandler(ctx) {
  const { user, text } = ctx;
  const c = parseCmd(text);
  switch (c.name) {
    case '':
      return '你好，我是 MOSS 🤖\n发送 /start 或 /help 查看可用命令。';
    case '/start':
      return [
        '👋 欢迎使用 MOSS —— Aqua Chat 官方助手机器人',
        '',
        '可用命令：',
        '/start 重新开始',
        '/help 帮助',
        '/info 我的账号信息',
        '/time 当前时间',
        '/date 当前日期',
        '/ping 网络延迟测试',
        '/random 随机数',
        '/echo <内容> 复读',
        '/about 关于本平台'
      ].join('\n');
    case '/help':
      return [
        '📖 MOSS 帮助',
        '/start 欢迎信息',
        '/help 本帮助',
        '/info 显示我的账号信息',
        '/time 当前时间',
        '/date 当前日期',
        '/ping Ping 测试',
        '/random 随机生成 0-9999',
        '/echo <内容> 原样复读',
        '/about 关于 Aqua Chat'
      ].join('\n');
    case '/whoami':
      return '🤖 我是 MOSS，Aqua Chat 官方助手机器人。\n管理员机器人：spam_bot（账号检查/举报）、bot_father（创建机器人）。';
    case '/info':
      return [
        '👤 账号信息',
        '用户: ' + (user.name || user.username),
        '用户名: @' + user.username,
        'ID: ' + user.id,
        '角色: ' + (user.role === 'admin' ? '管理员' : '用户'),
        '注册时间: ' + fmtTime(user.created),
        '签名: ' + (user.bio || '—')
      ].join('\n');
    case '/time':
      return '🕐 当前时间: ' + fmtTime(D.now());
    case '/date':
      return '📅 当前日期: ' + new Date().toLocaleDateString('zh-CN');
    case '/ping':
      return '🏓 Pong! (' + Math.round(Math.random() * 100) + 'ms)';
    case '/random':
      return '🎲 随机数: ' + Math.floor(Math.random() * 10000);
    case '/echo':
      return c.args ? '🔁 ' + c.args : '用法：/echo <内容>';
    case '/about':
      return 'Aqua Chat —— 实时聊天平台\n服务端: Node.js + Express + SQLite + SSE\n由机器人 bot_father 创建专属机器人。';
    default:
      return '🤖 MOSS：未知命令「' + c.name + '」，发送 /help 查看可用命令。';
  }
}

/* ===================== 官方机器人：spam_bot ===================== */

function spamHandler(ctx) {
  const { user, text } = ctx;
  const c = parseCmd(text);
  switch (c.name) {
    case '':
      return '你好，我是垃圾审查机器人 🛡️\n发送 /start 查看账号检查功能。';
    case '/start':
      return [
        '🛡️ 垃圾审查机器人 spam_bot',
        '',
        '功能：',
        '/check <用户名或ID> 检查账号（含举报记录 + 垃圾评分）',
        '/report <用户名> <原因> 举报违规账号',
        '/me 查看我自己的账号状态',
        '/help 帮助',
        '',
        '例如：/check alice'
      ].join('\n');
    case '/help':
      return [
        '📖 spam_bot 命令',
        '/check <用户名|ID> 账号信息 + 举报记录 + 垃圾评分',
        '/report <用户名> <原因> 提交举报',
        '/me 查看自己的账号状态',
        '/start 欢迎信息'
      ].join('\n');
    case '/me':
      return accountReport(user);
    case '/check': {
      if (!c.args) return '用法：/check <用户名或ID>\n例如：/check alice';
      const target = resolveTarget(c.args);
      if (!target) return '未找到账号：' + c.args;
      return accountReport(target);
    }
    case '/report': {
      const parts = c.args.split(/\s+/);
      const name = parts[0] ? parts[0].replace(/^@/, '') : '';
      const reason = parts.slice(1).join(' ').trim();
      if (!name) return '用法：/report <用户名> <原因>\n例如：/report bob 广告骚扰';
      const target = resolveTarget(name);
      if (!target) return '未找到账号：' + name;
      if (target.id === user.id) return '不能举报自己哦';
      const id = D.uid();
      D.put('reports', id, {
        id: id, targetUserId: target.id, reporterId: user.id,
        reason: reason || '未填写', time: D.now(), status: 'pending'
      });
      D.byIndex('users', 'role', 'admin').forEach(a => {
        RT.sendToUser(a.id, 'notification', {
          type: 'report',
          extra: { reportId: id, targetUsername: target.username, reporterName: user.name || user.username, reason: reason || '' }
        });
      });
      return '✅ 已提交举报：@' + target.username + '\n原因: ' + (reason || '未填写') + '\n管理员将尽快处理。';
    }
    default:
      return '🛡️ spam_bot：未知命令「' + c.name + '」，发送 /help 查看帮助。';
  }
}

/* ===================== 官方机器人：bot_father ===================== */

function bfSessionKey(userId) { return 'bf_' + userId; }

function bfSession(userId) {
  return D.get('bot_sessions', bfSessionKey(userId)) || null;
}
function bfSet(userId, step, pending) {
  D.put('bot_sessions', bfSessionKey(userId), { id: bfSessionKey(userId), userId: userId, step: step, pending: pending || {}, time: D.now() });
}
function bfClear(userId) { D.del('bot_sessions', bfSessionKey(userId)); }

function createBotRecord(owner, pending, templateId, keywords) {
  const username = String(pending.username).toLowerCase();
  const id = userToBotId(username);
  const token = genToken();
  const note = (pending.note || '').trim() || (templateId && TEMPLATES[templateId] ? TEMPLATES[templateId].note : '') || '由用户创建的机器人';
  const rec = {
    id: id, username: username, name: pending.name, ownerId: owner.id,
    kind: 'custom', template: templateId || null, keywords: keywords || [],
    commands: {}, desc: '', note: note, token: token, status: 'active', isOfficial: false,
    created: D.now(), updated: D.now()
  };
  const botUser = {
    id: id, username: username, name: pending.name, avatar: '', bio: '由 @' + owner.username + ' 创建的机器人',
    note: note, role: 'bot', status: 'offline', created: D.now()
  };
  D.put('users', id, botUser);
  D.put('bots', id, rec);
  return rec;
}

function validUsername(username) {
  return /^[a-zA-Z][a-zA-Z0-9_]{2,30}bot$/i.test(username);
}

function botFatherHandler(ctx) {
  const { user, text, chatId } = ctx;
  const c = parseCmd(text);
  const sess = bfSession(user.id);

  /* 进行中的多步流程优先 */
  if (sess && sess.step && c.name !== '/cancel') {
    const p = sess.pending || {};
    if (sess.step === 'name') {
      if (!text || text.length < 1 || text.length > 30) return '名字太长或为空，请重新发送机器人名字（1-30 字符）。';
      p.name = text.trim();
      bfSet(user.id, 'username', p);
      return '👌 好名字：' + p.name + '\n现在给它一个用户名（必须以 bot 结尾，仅字母数字下划线）：\n例如 my_echo_bot\n发送 /cancel 取消。';
    }
    if (sess.step === 'username') {
      const uname = (text || '').trim().toLowerCase();
      if (!validUsername(uname)) return '❌ 用户名不合法。必须以 bot 结尾，仅字母数字下划线，3-32 字符。\n例如 my_echo_bot\n发送 /cancel 取消。';
      if (isReserved(uname)) return '❌ 用户名 ' + uname + ' 已被占用，换一个吧。\n发送 /cancel 取消。';
      p.username = uname;
      bfSet(user.id, 'template', p);
      const tpl = Object.keys(TEMPLATES).map(id => '  /template ' + id + ' - ' + TEMPLATES[id].name + '（' + TEMPLATES[id].desc + '）').join('\n');
      return [
        '✅ 用户名可用：@' + uname,
        '',
        '选择机器人类型（模板或自定义）：',
        tpl,
        '  /none - 无模板（仅基础回复）',
        '  /custom - 自定义关键词回复（推荐，可自由配置）',
        '',
        '发送 /cancel 取消。'
      ].join('\n');
    }
    if (sess.step === 'template') {
      const choice = c.name === '/none' ? 'none' : c.name === '/custom' ? 'keyword' : (c.name === '/template' ? c.args.trim().toLowerCase() : '');
      if (!choice || (choice !== 'none' && choice !== 'keyword' && !TEMPLATES[choice])) {
        return '请从上面选择一个类型：/template echo / /template dice / /custom / /none';
      }
      const rec = createBotRecord(user, p, choice === 'none' ? null : choice, []);
      if (rec.template === 'keyword') {
        bfSet(user.id, 'keyword', { username: rec.username });
        return [
          '🎉 机器人创建成功！',
          '名称: ' + rec.name,
          '用户名: @' + rec.username,
          '令牌: ' + rec.token,
          '',
          '它使用「关键词回复」模板，现在配置关键词：',
          '发送格式：关键词 => 回复内容',
          '例如：你好 => 你好呀！',
          '配置完成后发送 done 结束（发送 /cancel 跳过）。'
        ].join('\n');
      }
      bfClear(user.id);
      return [
        '🎉 机器人创建成功！',
        '名称: ' + rec.name,
        '用户名: @' + rec.username,
        '令牌: ' + rec.token,
        '',
        '把它添加为联系人即可对话。',
        '管理命令：/mybots /token /setcommands /setdesc /delete'
      ].join('\n');
    }
    if (sess.step === 'keyword') {
      if (c.name === 'done' || (text.trim() === 'done')) {
        bfClear(user.id);
        const rec = D.get('bots', userToBotId(sess.pending.username));
        return '✅ 关键词配置完成，共 ' + ((rec && rec.keywords) || []).length + ' 条。\n' + (rec ? '随时可用 /setkeyword @' + rec.username + ' 关键词 => 回复 添加新规则。' : '');
      }
      const m = /^(.+?)\s*=>\s*(.+)$/.exec(text || '');
      if (!m) return '格式错误。请用：关键词 => 回复内容\n例如：你好 => 你好呀！\n发送 done 完成，/cancel 取消。';
      const rec = D.get('bots', userToBotId(sess.pending.username));
      if (!rec) { bfClear(user.id); return '机器人不存在，流程已重置。'; }
      if (!rec.keywords) rec.keywords = [];
      rec.keywords.push({ pattern: m[1].trim(), reply: m[2].trim() });
      rec.updated = D.now();
      D.put('bots', rec.id, rec);
      return '✅ 已添加：' + m[1].trim() + ' => ' + m[2].trim() + '（共 ' + rec.keywords.length + ' 条）\n继续发送下一条，或发送 done 完成。';
    }
    return '流程状态异常，发送 /cancel 重置。';
  }

  /* 命令模式 */
  switch (c.name) {
    case '':
    case '/start':
      bfClear(user.id);
      return [
        '🤖 欢迎使用机器人之父 bot_father',
        '在这里创建和管理你自己的机器人。',
        '',
        '命令：',
        '/newbot 创建新机器人（名字 → 用户名 → 类型）',
        '/templates 查看可用模板',
        '/mybots 我创建的机器人',
        '/token <用户名> 查看令牌',
        '/setcommands <用户名> 命令 描述 | 命令 描述',
        '/setkeyword <用户名> 关键词 => 回复',
        '/setdesc <用户名> 描述',
        '/delete <用户名> 删除机器人',
        '/help 帮助',
        '/cancel 取消当前流程'
      ].join('\n');
    case '/help':
      return [
        '📖 bot_father 帮助',
        '/newbot 开始创建机器人',
        '/templates 列出模板',
        '/mybots 列出我的机器人',
        '/token <用户名> 显示令牌',
        '/setcommands <用户名> /cmd 描述 | /cmd2 描述',
        '/setkeyword <用户名> 关键词 => 回复',
        '/setdesc <用户名> 新描述',
        '/delete <用户名> 删除',
        '/cancel 取消流程'
      ].join('\n');
    case '/cancel':
      bfClear(user.id);
      return '已取消当前操作。';
    case '/templates':
      return '📦 机器人模板：\n' + Object.keys(TEMPLATES).map(id => '  ' + id + ' - ' + TEMPLATES[id].name + '（' + TEMPLATES[id].desc + '）').join('\n') + '\n\n创建时在类型选择中发送 /template <id> 使用。';
    case '/newbot': {
      bfSet(user.id, 'name', {});
      return '🤖 好的，开始创建机器人！\n第一步：给它起个名字（1-30 字符）：\n例如：我的小助手\n发送 /cancel 取消。';
    }
    case '/mybots': {
      const mine = D.getAll('bots').filter(b => b.ownerId === user.id && b.kind === 'custom');
      if (!mine.length) return '你还没有创建机器人。发送 /newbot 开始创建吧。';
      return '📋 我创建的机器人：\n\n' + mine.map(b => '  @' + b.username + ' ' + (b.template ? '(' + (TEMPLATES[b.template] ? TEMPLATES[b.template].name : b.template) + ')' : '') + '\n    令牌: ' + b.token).join('\n');
    }
    case '/token': {
      const uname = (c.args || '').replace(/^@/, '').toLowerCase();
      if (!uname) return '用法：/token <用户名>';
      const rec = D.get('bots', userToBotId(uname));
      if (!rec || rec.ownerId !== user.id) return '未找到你拥有的机器人 @' + uname;
      return '🔑 机器人令牌：' + rec.token;
    }
    case '/setcommands': {
      const m = /^(@?\S+)\s+(.+)$/.exec(c.args || '');
      if (!m) return '用法：/setcommands <用户名> /命令 描述 | /命令2 描述2';
      const rec = D.get('bots', userToBotId(m[1].replace(/^@/, '').toLowerCase()));
      if (!rec || rec.ownerId !== user.id) return '未找到你拥有的机器人：' + m[1];
      const map = {};
      m[2].split('|').forEach(pair => {
        const p = pair.trim().split(/\s{2,}|,|;/, 2);
        if (p[0] && p[1]) map[p[0].trim()] = p[1].trim();
      });
      if (!Object.keys(map).length) return '命令格式错误，示例：/setcommands mybot /hi 打招呼 | /help 帮助';
      rec.commands = map;
      rec.updated = D.now();
      D.put('bots', rec.id, rec);
      return '✅ 已设置 ' + Object.keys(map).length + ' 条命令：\n' + Object.keys(map).map(k => '  ' + k + ' - ' + map[k]).join('\n');
    }
    case '/setkeyword': {
      const m = /^(@?\S+)\s+(.+?)\s*=>\s*(.+)$/.exec(c.args || '');
      if (!m) return '用法：/setkeyword <用户名> 关键词 => 回复内容';
      const rec = D.get('bots', userToBotId(m[1].replace(/^@/, '').toLowerCase()));
      if (!rec || rec.ownerId !== user.id) return '未找到你拥有的机器人：' + m[1];
      if (!rec.keywords) rec.keywords = [];
      rec.keywords.push({ pattern: m[2].trim(), reply: m[3].trim() });
      rec.updated = D.now();
      D.put('bots', rec.id, rec);
      return '✅ 已添加关键词：' + m[2].trim() + ' => ' + m[3].trim() + '（共 ' + rec.keywords.length + ' 条）';
    }
    case '/setdesc': {
      const m = /^(@?\S+)\s+(.+)$/.exec(c.args || '');
      if (!m) return '用法：/setdesc <用户名> 描述';
      const rec = D.get('bots', userToBotId(m[1].replace(/^@/, '').toLowerCase()));
      if (!rec || rec.ownerId !== user.id) return '未找到你拥有的机器人：' + m[1];
      rec.desc = m[2].trim();
      rec.updated = D.now();
      D.put('bots', rec.id, rec);
      const bu = D.get('users', rec.id);
      if (bu) { bu.bio = m[2].trim(); D.put('users', bu.id, bu); }
      return '✅ 已更新描述：' + rec.desc;
    }
    case '/delete': {
      const uname = (c.args || '').replace(/^@/, '').toLowerCase();
      if (!uname) return '用法：/delete <用户名>';
      const rec = D.get('bots', userToBotId(uname));
      if (!rec || rec.ownerId !== user.id) return '未找到你拥有的机器人：@' + uname;
      D.del('bots', rec.id);
      D.del('users', rec.id);
      return '🗑️ 机器人 @' + uname + ' 已删除。';
    }
    default:
      return '🤖 bot_father：未知命令「' + c.name + '」，发送 /help 查看帮助。';
  }
}

/* ===================== 自定义机器人 ===================== */

function customHandler(ctx) {
  const { user, bot, text } = ctx;
  const c = parseCmd(text);
  if (c.name && bot.commands && bot.commands[c.name]) {
    return '📌 ' + bot.name + '：' + bot.commands[c.name];
  }
  if (bot.template === 'echo') {
    if (!text || text.charAt(0) === '/') return '🔁 我是复读机，发送任意文字即可。';
    return '🔁 ' + text;
  }
  if (bot.template === 'dice') {
    if (c.name === '/dice') return '🎲 你掷出了 ' + (1 + Math.floor(Math.random() * 6));
    if (c.name === '/num') {
      const n = parseInt(c.args, 10);
      if (n > 0) return '🔢 随机数 (0-' + n + '): ' + Math.floor(Math.random() * (n + 1));
      return '用法：/num <上限>';
    }
    return '🎲 骰子机器人\n/dice 掷骰子\n/num <上限> 随机数字';
  }
  if (bot.template === 'keyword' && bot.keywords && bot.keywords.length) {
    for (const k of bot.keywords) {
      if (text.indexOf(k.pattern) !== -1) return k.reply;
    }
    return null; // 无匹配不回复
  }
  return '🤖 我是 ' + bot.name + '（@' + bot.username + '）\n由 @' + (ctx.ownerName || '?') + ' 创建。';
}

/* ===================== 入口 ===================== */

function ensureBots() {
  OFFICIAL_BOTS.forEach(b => {
    const id = userToBotId(b.username);
    let u = D.get('users', id);
    if (!u) {
      u = { id: id, username: b.username, name: b.name, avatar: '', bio: b.bio, note: b.note, role: 'bot', status: 'offline', created: D.now() };
      D.put('users', id, u);
    } else {
      // 刷新签名（含使用方法备注），保证历史库拿到最新 bio
      if (u.bio !== b.bio) { u.bio = b.bio; D.put('users', id, u); }
      if ((u.note || '') !== (b.note || '')) { u.note = b.note; D.put('users', id, u); }
      if (u.role !== 'bot') { u.role = 'bot'; D.put('users', id, u); }
    }
    const rec = D.get('bots', id);
    if (!rec) {
      D.put('bots', id, {
        id: id, username: b.username, name: b.name, ownerId: null, kind: 'official',
        template: null, keywords: [], commands: {}, desc: b.bio, note: b.note, token: null,
        status: 'active', isOfficial: true, created: D.now(), updated: D.now()
      });
    } else {
      if (rec.desc !== b.bio) {
        rec.desc = b.bio;
        rec.updated = D.now();
      }
      if ((rec.note || '') !== (b.note || '')) {
        rec.note = b.note;
        rec.updated = D.now();
      }
      D.put('bots', id, rec);
    }
  });
}

function onMessage(msg) {
  if (!msg || !msg.chatId || !msg.sender) return;
  if (msg.type !== 'text') return;
  if (isBot(msg.sender)) return;               // 机器人自己发的消息不再分发
  const chatId = msg.chatId;
  if (chatId.indexOf('dm_') !== 0) return;     // 仅私聊触发机器人
  const rest = chatId.slice(3);
  const sep = rest.indexOf('|');
  if (sep === -1) return;
  const a = rest.slice(0, sep);
  const b = rest.slice(sep + 1);
  const botId = isBot(a) ? a : isBot(b) ? b : null;
  if (!botId) return;
  const bot = D.get('bots', botId);
  if (!bot || bot.status !== 'active') return;
  const user = D.get('users', msg.sender);
  if (!user) return;

  const ctx = { user: user, bot: bot, text: msg.content || '', chatId: chatId };
  let out = null;
  try {
    if (bot.username === 'moss') out = mossHandler(ctx);
    else if (bot.username === 'spam_bot') out = spamHandler(ctx);
    else if (bot.username === 'bot_father') out = botFatherHandler(ctx);
    else {
      const owner = D.get('users', bot.ownerId);
      ctx.ownerName = owner ? owner.username : '?';
      out = customHandler(ctx);
    }
  } catch (e) {
    console.error('Bot error (' + (bot.username || botId) + '):', e.message);
    return;
  }
  if (out) reply(chatId, botId, out);
}

function init() { ensureBots(); }

module.exports = { init, onMessage, ensureBots, isBot, TEMPLATES };
