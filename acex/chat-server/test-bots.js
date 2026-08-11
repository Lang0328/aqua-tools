/**
 * chat-server/test-bots.js — 机器人功能冒烟测试
 * 覆盖：官方机器人种子 / MOSS / spam_bot 检查与举报 / bot_father 创建与删除 / 模板机器人。
 * 用法：node test-bots.js
 */
const { spawn } = require('child_process');
const path = require('path');
const D = require('./db');

const PORT = 3898;
const BASE = 'http://localhost:' + PORT;

const server = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT) }),
  stdio: ['ignore', 'pipe', 'pipe']
});

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let failures = 0;
function check(name, cond, extra) {
  console.log((cond ? '  ✓ ' : '  ✗ ') + name + (extra ? '  [' + extra + ']' : ''));
  if (!cond) failures++;
}

async function api(p, opts) {
  opts = opts || {};
  const res = await fetch(BASE + p, {
    method: opts.method || 'GET',
    headers: Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function dmChat(a, b) { return 'dm_' + [a, b].sort().join('|'); }

async function sendMsg(token, chatId, content, sender) {
  return api('/api/db/messages', {
    method: 'POST',
    headers: { 'X-Auth-Token': token },
    body: { data: { id: 'm_' + Math.random().toString(36).slice(2, 10), chatId: chatId, sender: sender, type: 'text', content: content, time: Date.now() } }
  });
}

async function waitBotReply(token, chatId, botId, expect, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 5000);
  while (Date.now() < deadline) {
    const q = await api('/api/db/messages?idx=chatId&val=' + encodeURIComponent(chatId), { headers: { 'X-Auth-Token': token } });
    const list = (q.json.list || []).filter(m => m.sender === botId);
    if (list.length) return list[list.length - 1];
    await sleep(150);
  }
  return null;
}

(async () => {
  await sleep(800);
  try {
    const login = await api('/api/auth', { method: 'POST', body: { type: 'password', username: 'alice', secret: D.hashPass('123456') } });
    check('登录 alice', login.status === 200 && !!login.json.token);
    const token = login.json.token;
    const alice = login.json.user;
    const headers = { 'X-Auth-Token': token };

    const bots = await api('/api/bots', { headers });
    const names = (bots.json.list || []).map(b => b.username);
    check('官方机器人已注册', ['moss', 'spam_bot', 'bot_father'].every(n => names.indexOf(n) !== -1), names.join(','));

    // 机器人详情接口（快捷命令栏数据源）
    const bfDetail = await api('/api/bots/bot_father', { headers });
    check('机器人详情接口返回命令', bfDetail.status === 200 && bfDetail.json.data && typeof bfDetail.json.data.commands === 'object');
    const notFound = await api('/api/bots/no_such_bot_xyz', { headers });
    check('不存在的机器人返回 404', notFound.status === 404);

    // MOSS
    const mossChat = dmChat(alice.id, 'u_moss');
    await sendMsg(token, mossChat, '/start', alice.id);
    const mossReply = await waitBotReply(token, mossChat, 'u_moss', 'MOSS');
    check('MOSS 回复 /start', !!mossReply && mossReply.sender === 'u_moss' && mossReply.content.indexOf('MOSS') !== -1, mossReply ? mossReply.content.split('\n')[0] : '无回复');

    await sendMsg(token, mossChat, '/info', alice.id);
    const mossInfo = await waitBotReply(token, mossChat, 'u_moss', 'alice');
    check('MOSS /info 返回账号信息', !!mossInfo && mossInfo.content.indexOf('alice') !== -1);

    // spam_bot /check
    const spamChat = dmChat(alice.id, 'u_spam_bot');
    await sendMsg(token, spamChat, '/check alice', alice.id);
    const spamCheck = await waitBotReply(token, spamChat, 'u_spam_bot', 'alice');
    check('spam_bot /check 返回账号信息', !!spamCheck && spamCheck.content.indexOf('垃圾评分') !== -1);

    // 举报 bob + 再检查（评分应上升）
    const bob = D.byIndex('users', 'username', 'bob')[0];
    const rep = await api('/api/report', { method: 'POST', headers, body: { targetUserId: bob.id, reason: '测试举报' } });
    check('举报接口', rep.status === 200 && rep.json.ok);
    await sendMsg(token, spamChat, '/check bob', alice.id);
    const spamCheck2 = await waitBotReply(token, spamChat, 'u_spam_bot', '举报记录');
    check('spam_bot 显示举报记录', !!spamCheck2 && spamCheck2.content.indexOf('待处理') !== -1 && spamCheck2.content.indexOf('垃圾评分') !== -1);

    // bot_father 创建流程
    const bfChat = dmChat(alice.id, 'u_bot_father');
    await sendMsg(token, bfChat, '/newbot', alice.id);
    const bf1 = await waitBotReply(token, bfChat, 'u_bot_father', '名字');
    check('bot_father /newbot 询问名字', !!bf1);
    await sendMsg(token, bfChat, '我的复读机', alice.id);
    const bf2 = await waitBotReply(token, bfChat, 'u_bot_father', '用户名');
    check('bot_father 询问用户名', !!bf2 && bf2.content.indexOf('bot 结尾') !== -1);
    await sendMsg(token, bfChat, 'myechobot', alice.id);
    const bf3 = await waitBotReply(token, bfChat, 'u_bot_father', '模板');
    check('bot_father 询问类型', !!bf3 && bf3.content.indexOf('/template') !== -1);
    await sendMsg(token, bfChat, '/template echo', alice.id);
    const bf4 = await waitBotReply(token, bfChat, 'u_bot_father', 'myechobot');
    check('bot_father 创建模板机器人', !!bf4 && bf4.content.indexOf('令牌') !== -1 && bf4.content.indexOf('myechobot') !== -1);

    // 新机器人可对话（复读）
    const newBotChat = dmChat(alice.id, 'u_myechobot');
    await sendMsg(token, newBotChat, '你好世界', alice.id);
    const echo = await waitBotReply(token, newBotChat, 'u_myechobot', '🔁');
    check('模板机器人复读回复', !!echo && echo.content.indexOf('你好世界') !== -1, echo ? echo.content : '无回复');

    // mybots 列表
    await sendMsg(token, bfChat, '/mybots', alice.id);
    const mybots = await waitBotReply(token, bfChat, 'u_bot_father', 'myechobot');
    check('bot_father /mybots 列出机器人', !!mybots && mybots.content.indexOf('myechobot') !== -1);

    // 自定义关键词机器人流程
    await sendMsg(token, bfChat, '/newbot', alice.id);
    await waitBotReply(token, bfChat, 'u_bot_father', '名字');
    await sendMsg(token, bfChat, '关键词机器人', alice.id);
    await waitBotReply(token, bfChat, 'u_bot_father', '用户名');
    await sendMsg(token, bfChat, 'kwbotbot', alice.id);
    const bfk = await waitBotReply(token, bfChat, 'u_bot_father', '模板');
    check('关键词机器人：询问类型', !!bfk);
    await sendMsg(token, bfChat, '/custom', alice.id);
    const bfk2 = await waitBotReply(token, bfChat, 'u_bot_father', '关键词');
    check('关键词机器人：进入关键词配置', !!bfk2 && bfk2.content.indexOf('=>') !== -1);
    await sendMsg(token, bfChat, '你好 => 你好呀！欢迎', alice.id);
    const bfk3 = await waitBotReply(token, bfChat, 'u_bot_father', '已添加');
    check('关键词机器人：添加规则', !!bfk3);
    await sendMsg(token, bfChat, 'done', alice.id);
    const bfk4 = await waitBotReply(token, bfChat, 'u_bot_father', '配置完成');
    check('关键词机器人：完成配置', !!bfk4);

    const kwChat = dmChat(alice.id, 'u_kwbotbot');
    await sendMsg(token, kwChat, '有人叫我吗，你好呀', alice.id);
    const kw = await waitBotReply(token, kwChat, 'u_kwbotbot', '你好呀');
    check('关键词机器人命中回复', !!kw && kw.content.indexOf('欢迎') !== -1, kw ? kw.content : '无回复');
    await sendMsg(token, kwChat, '完全无关内容', alice.id);
    await sleep(800);
    const kwBefore = await api('/api/db/messages?idx=chatId&val=' + encodeURIComponent(kwChat), { headers });
    const kwCountBefore = (kwBefore.json.list || []).filter(m => m.sender === 'u_kwbotbot').length;
    await sendMsg(token, kwChat, '完全无关内容2', alice.id);
    await sleep(800);
    const kwAfter = await api('/api/db/messages?idx=chatId&val=' + encodeURIComponent(kwChat), { headers });
    const kwCountAfter = (kwAfter.json.list || []).filter(m => m.sender === 'u_kwbotbot').length;
    check('关键词机器人无命中不回复', kwCountAfter === kwCountBefore);

    // /setkeyword 补充规则
    await sendMsg(token, bfChat, '/setkeyword kwbotbot 再见 => 拜拜~', alice.id);
    const sk = await waitBotReply(token, bfChat, 'u_bot_father', '已添加');
    check('bot_father /setkeyword 添加规则', !!sk);
    await sendMsg(token, kwChat, '再见啦', alice.id);
    const kw2 = await waitBotReply(token, kwChat, 'u_kwbotbot', '拜拜');
    check('新规则生效', !!kw2 && kw2.content.indexOf('拜拜') !== -1);

    // 删除机器人
    await sendMsg(token, bfChat, '/delete myechobot', alice.id);
    const del = await waitBotReply(token, bfChat, 'u_bot_father', '已删除');
    check('bot_father /delete 删除机器人', !!del && del.content.indexOf('myechobot') !== -1);
    const afterDel = await api('/api/db/users/u_myechobot', { headers });
    check('删除后用户记录移除', afterDel.status === 404);

    // 清理关键词机器人
    await sendMsg(token, bfChat, '/delete kwbotbot', alice.id);
    const del2 = await waitBotReply(token, bfChat, 'u_bot_father', '已删除');
    check('删除关键词机器人', !!del2);
  } catch (e) {
    console.log('  ✗ 测试异常: ' + e.message);
    failures++;
  }

  server.kill();
  await sleep(300);
  console.log(failures === 0 ? '\n全部通过 ✓' : '\n' + failures + ' 项失败 ✗');
  process.exit(failures === 0 ? 0 : 1);
})();
