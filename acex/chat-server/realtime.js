/**
 * chat-server/realtime.js — 实时推送核心（SSE）
 * 内存维护 userId -> Set<res> 的在线连接；提供定时定向广播。
 * 零依赖：服务端单向推送（新消息/更新/删除/typing/在线），客户端上传仍走 REST。
 */
'use strict';
const D = require('./db');

const clients = new Map(); // userId -> Set<res>

function onlineUserIds() { return Array.from(clients.keys()); }

function subscribe(userId, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
  res.on('close', () => {
    const set = clients.get(userId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) clients.delete(userId);
  });
}

function sendToUser(userId, event, data) {
  const set = clients.get(userId);
  if (!set || set.size === 0) return;
  const payload = 'event: ' + event + '\ndata: ' + JSON.stringify(data === undefined ? {} : data) + '\n\n';
  set.forEach(res => { try { res.write(payload); } catch (e) { /* 忽略写失败 */ } });
}

function sendToUsers(userIds, event, data) {
  (userIds || []).forEach(id => sendToUser(id, event, data));
}

function broadcastToChat(chatId, event, data) {
  sendToUsers(D.getChatParticipants(chatId), event, data);
}

function broadcastAll(event, data) {
  Array.from(clients.keys()).forEach(id => sendToUser(id, event, data));
}

module.exports = { subscribe, sendToUser, sendToUsers, broadcastToChat, broadcastAll, onlineUserIds };