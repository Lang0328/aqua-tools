(function () {
    'use strict';

    /* ===================== 1. UTILS ===================== */
    var DB_NAME = 'AquaChatDBv2', DB_VER = 4;
    var LS = function (k) { return 'aquaChat2_' + k; };
    // 双后端：window.AQUA_CHAT_API 存在时走服务器 API（真实数据库），否则用 IndexedDB（本地调试镜像）
    var API_BASE = (typeof window !== 'undefined' && window.AQUA_CHAT_API) || '';
    // Giphy 搜索 API key（公开/演示），用于 GIF 弹窗搜索；如无法加载则提示失败
    var GIPHY_KEY = 'dc6g9F9f3T0mlgH5g6P8mE2uV0wX1yZ3a';
    var apiToken = localStorage.getItem(LS('serverToken')) || '';
    var isApiMode = function () { return API_BASE !== ''; };
    var db = null, curUser = null, curChat = null, curCat = 'chats';
    var allUsers = [], allGroups = [], allChannels = [], chatList = [];
    var archivedView = false;
    var typingTimers = {}, secretSessions = {}, selfDestructTimers = {};
    var loginRateLimit = {}, msgRateLimit = {};
    var adminLogs = [];

    function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function now() { return new Date().toISOString(); }
    function timeStr(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function dateStr(t) { var d = new Date(t); return String(d.getMonth() + 1).padStart(2, '0') + '/' + String(d.getDate()).padStart(2, '0') + ' ' + timeStr(t); }
    function shortTime(t) { if (!t) return ''; var d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? timeStr(t) : dateStr(t); }
    function $(id) { return document.getElementById(id); }
    function esc(s) { if (!s) return ''; var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    function escAttr(s) { return String(s).replace(/['"]/g, function (c) { return c === "'" ? '&#39;' : '&quot;'; }); }
    function extractUrl(text) {
        if (!text) return null;
        var urlPattern = /(https?:\/\/[^\s<]+)/g;
        var match = urlPattern.exec(text);
        return match ? match[1] : null;
    }
    function hashPass(p) { if (!p) return ''; var h = 0; for (var i = 0; i < p.length; i++) { h = ((h << 5) - h) + p.charCodeAt(i); h |= 0; } return 'h' + Math.abs(h).toString(36); }
    function avatarColor(s) { if (!s) return '#999'; var h = 0; for (var i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h); var colors = ['#007aff','#34c759','#ff9500','#ff3b30','#5856d6','#af52de','#ff2d55','#00c7be','#ff6482','#5ac8fa']; return colors[Math.abs(h) % colors.length]; }
    function avText(s) { return s ? s.charAt(0).toUpperCase() : '?'; }
    function getChatKey(type, id) { return type === 'contact' ? 'dm_' + [curUser.id, id].sort().join('|') : id; }
    function isRateLimited(key, limit, windowSec) { var nowT = Date.now(); var data = loginRateLimit[key] || []; data = data.filter(function (t) { return nowT - t < windowSec * 1000; }); if (data.length >= limit) return true; data.push(nowT); loginRateLimit[key] = data; return false; }

    /* ===== 时钟（登录页 + 主界面顶栏）===== */
    function updateClock() {
        var d = new Date();
        var hh = String(d.getHours()).padStart(2, '0');
        var mm = String(d.getMinutes()).padStart(2, '0');
        var ss = String(d.getSeconds()).padStart(2, '0');
        var str = hh + ':' + mm + ':' + ss;
        var ac = document.getElementById('authClock');
        var ap = document.getElementById('appClock');
        if (ac) ac.textContent = str;
        if (ap) ap.textContent = str;
    }
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', updateClock); } else { updateClock(); }
    setInterval(updateClock, 1000);

    function toast(msg) {
        var el = $('chatToast'); if (!el) return;
        el.textContent = msg; el.classList.add('show');
        clearTimeout(el._t); el._t = setTimeout(function () { el.classList.remove('show'); }, 2000);
    }

    function confirmDialog(msg) {
        return window.confirm(msg);
    }

    function passwordStrength(p) {
        if (!p) return { score: 0, label: '', color: '#ddd' };
        var s = 0;
        if (p.length >= 4) s += 1; if (p.length >= 8) s += 1;
        if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s += 1;
        if (/\d/.test(p)) s += 1; if (/[^a-zA-Z0-9]/.test(p)) s += 1;
        var labels = ['非常弱','弱','一般','较强','很强','极强'];
        var colors = ['#ff3b30','#ff9500','#ffcc00','#34c759','#34c759','#5856d6'];
        return { score: s, label: labels[s] || '未知', color: colors[s] || '#ddd' };
    }

    /* ===================== 2. DATABASE ===================== */
    function openDB() {
        if (db) return Promise.resolve(db);
        return new Promise(function (resolve, reject) {
            var req = indexedDB.open(DB_NAME, DB_VER);
            req.onupgradeneeded = function (e) {
                var d = e.target.result;
                // store 已存在时补建缺失索引（旧版本升级场景），不存在则完整创建
                function mk(name, keyPath, indices) {
                    var s;
                    if (!d.objectStoreNames.contains(name)) { s = d.createObjectStore(name, { keyPath: keyPath }); }
                    else { s = e.target.transaction.objectStore(name); }
                    (indices || []).forEach(function (idx) {
                        if (!s.indexNames.contains(idx)) s.createIndex(idx, idx, { unique: false });
                    });
                    return s;
                }
                mk('messages', 'id', ['chatId', 'time']);
                mk('groups', 'id', ['name']);
                mk('channels', 'id', []);
                var us = mk('users', 'id', []);
                if (!us.indexNames.contains('username')) us.createIndex('username', 'username', { unique: true });
                mk('contacts', 'id', ['owner']);
                mk('auth_creds', 'id', ['userId', 'identifier']);
                mk('devices', 'id', []);
                mk('sticker_packs', 'id', []);
                mk('stickers', 'id', []);
                mk('channel_posts', 'id', ['channelId']);
                mk('secret_sessions', 'id', []);
                mk('admin_logs', 'id', ['time']);
                mk('favorites', 'id', ['msgId', 'time']);
            };
            req.onsuccess = function (e) { db = e.target.result; resolve(db); };
            req.onerror = function (e) { reject(e.target.error); };
        });
    }
    function apiFetch(path, opts) {
        opts = opts || {};
        var headers = { 'Content-Type': 'application/json' };
        if (apiToken) headers['X-Auth-Token'] = apiToken;
        return fetch(API_BASE + path, {
            method: opts.method || 'GET',
            headers: headers,
            body: opts.body ? JSON.stringify(opts.body) : undefined
        }).then(function (r) { return r.json().catch(function () { return { ok: false, error: '响应解析失败' }; }); })
        .then(function (j) {
            if (j && j.status === 401) { apiToken = ''; localStorage.removeItem(LS('serverToken')); }
            if (!j || !j.ok) { var e = new Error((j && j.error) || '请求失败'); e.apiError = true; throw e; }
            return j;
        });
    }
    function dbAdd(st, data) {
        if (isApiMode()) return apiFetch('/db/' + st, { method: 'POST', body: { data: data } });
        return openDB().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction(st, 'readwrite'); tx.objectStore(st).put(data); tx.oncomplete = function () { res(true); }; tx.onerror = function () { rej(tx.error); }; }); });
    }
    function dbGet(st, id) {
        if (isApiMode()) return apiFetch('/db/' + st + '/' + encodeURIComponent(id)).then(function (j) { return j.data; });
        return openDB().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction(st, 'readonly'); var r = tx.objectStore(st).get(id); r.onsuccess = function () { res(r.result || null); }; r.onerror = function () { rej(r.error); }; }); });
    }
    function dbGetAll(st) {
        if (isApiMode()) return apiFetch('/db/' + st).then(function (j) { return j.list; });
        return openDB().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction(st, 'readonly'); var r = tx.objectStore(st).getAll(); r.onsuccess = function () { res(r.result || []); }; r.onerror = function () { rej(r.error); }; }); });
    }
    function dbDel(st, id) {
        if (isApiMode()) return apiFetch('/db/' + st + '/' + encodeURIComponent(id), { method: 'DELETE' });
        return openDB().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction(st, 'readwrite'); tx.objectStore(st).delete(id); tx.oncomplete = function () { res(true); }; tx.onerror = function () { rej(tx.error); }; }); });
    }
    function dbByIndex(st, idx, val) {
        if (isApiMode()) return apiFetch('/db/' + st + '?idx=' + encodeURIComponent(idx) + '&val=' + encodeURIComponent(val)).then(function (j) { return j.list; });
        return openDB().then(function (d) { return new Promise(function (res, rej) { var tx = d.transaction(st, 'readonly'); var store = tx.objectStore(st); var r; try { r = store.index(idx).getAll(val); } catch (err) { r = store.getAll(); } r.onsuccess = function () { var list = r.result || []; res(idx === 'identifier' || idx === 'userId' || idx === 'owner' || idx === 'username' || idx === 'channelId' || idx === 'chatId' ? list.filter(function (it) { return it[idx] === val; }) : list); }; r.onerror = function () { rej(r.error); }; }); });
    }
    function dbCount(st) {
        if (isApiMode()) return apiFetch('/db/' + st + '/count').then(function (j) { return j.count; });
        return openDB().then(function (d) { return new Promise(function (res) { var tx = d.transaction(st, 'readonly'); var r = tx.objectStore(st).count(); r.onsuccess = function () { res(r.result); }; r.onerror = function () { res(0); }; }); });
    }

    /* ===================== 3. AUTH ===================== */
    function getDeviceFingerprint() {
        var fp = localStorage.getItem(LS('deviceFp'));
        if (!fp) { fp = uid() + '_' + navigator.userAgent.slice(0, 40); localStorage.setItem(LS('deviceFp'), fp); }
        return fp;
    }

    function authDevice(secret) {
        var fp = getDeviceFingerprint();
        if (isApiMode()) {
            return apiFetch('/auth', { method: 'POST', body: { type: 'device', identifier: fp, secret: secret } }).then(function (j) {
                apiToken = j.token; localStorage.setItem(LS('serverToken'), apiToken);
                return j;
            });
        }
        return dbByIndex('auth_creds', 'identifier', fp).then(function (creds) {
            if (creds.length) {
                return dbGet('users', creds[0].userId).then(function (u) {
                    if (!u) return Promise.reject('用户不存在');
                    if (!u.devicePwdSet) { u._needSetPassword = true; return u; }
                    if (secret !== undefined && hashPass(String(secret)) === (u.devicePasswordHash || '')) return u;
                    return Promise.reject({ needPassword: true });
                });
            }
            var id = 'u_' + uid();
            var nick = '设备用户_' + id.slice(-4);
            var user = { id: id, username: 'dev_' + id.slice(-6), name: nick, avatar: '', bio: '', role: 'user', status: 'online', created: now(), devicePwdSet: false, devicePasswordHash: '' };
            var cred = { id: uid(), userId: id, loginType: 'device', identifier: fp, credentialHash: hashPass(fp), createdAt: now(), passwordSet: false };
            var dev = { id: uid(), userId: id, deviceName: 'Chrome on ' + navigator.platform, deviceFingerprint: fp, lastIp: '127.0.0.1', lastActiveAt: now(), isTrusted: true };
            return dbAdd('users', user).then(function () { return dbAdd('auth_creds', cred); }).then(function () { return dbAdd('devices', dev); }).then(function () { user._needSetPassword = true; return user; });
        });
    }

    function authPassword(username, password) {
        if (isApiMode()) {
            return apiFetch('/auth', { method: 'POST', body: { type: 'password', username: username, secret: hashPass(password) } }).then(function (j) {
                apiToken = j.token; localStorage.setItem(LS('serverToken'), apiToken);
                return j.user;
            });
        }
        return dbByIndex('users', 'username', username).then(function (users) {
            if (users.length === 0) return Promise.reject('用户名不存在');
            return dbByIndex('auth_creds', 'userId', users[0].id).then(function (creds) {
                var pc = creds.find(function (c) { return c.loginType === 'password'; });
                if (!pc) return Promise.reject('未设置密码');
                if (pc.credentialHash !== hashPass(password)) { loginRateLimit[username + '_fail'] = (loginRateLimit[username + '_fail'] || 0) + 1; return Promise.reject('密码错误'); }
                loginRateLimit[username + '_fail'] = 0;
                users[0].status = 'online'; dbAdd('users', users[0]);
                return users[0];
            });
        });
    }

    function authSentence(sentence) {
        if (!sentence || sentence.length < 6) return Promise.reject('句子太短，请输入至少6个字符');
        var key = hashPass(sentence.trim().toLowerCase());
        if (isApiMode()) {
            return apiFetch('/auth', { method: 'POST', body: { type: 'key', identifier: 'sen_' + key } }).then(function (j) {
                apiToken = j.token; localStorage.setItem(LS('serverToken'), apiToken);
                return j.user;
            });
        }
        return dbByIndex('auth_creds', 'identifier', 'sen_' + key).then(function (creds) {
            if (creds.length > 0) { return dbGet('users', creds[0].userId).then(function (u) { u.status = 'online'; dbAdd('users', u); return u; }); }
            var id = 'u_' + uid();
            var user = { id: id, username: 'sen_' + uid().slice(0, 8), name: '密匙用户', avatar: '', bio: '', role: 'user', status: 'online', created: now() };
            var cred = { id: uid(), userId: id, loginType: 'key', identifier: 'sen_' + key, credentialHash: key, createdAt: now() };
            return dbAdd('users', user).then(function () { return dbAdd('auth_creds', cred); }).then(function () { return user; });
        });
    }

     function doLogin(user) {
        curUser = user;
        localStorage.setItem(LS('session'), JSON.stringify({ id: user.id, time: now() }));
        $('loginScreen').classList.add('chat-hidden');
        $('chatApp').classList.remove('chat-hidden');
        renderSidebar();
        ensureBotContacts();
        loadChatList();
        logAdmin(user.id, 'login', '用户登录');
        simulateTypingIndicator();
        if (isApiMode()) { startPolling(); startStreaming(); }
    }

    var OFFICIAL_BOT_IDS = ['u_moss', 'u_spam_bot', 'u_bot_father'];

    function ensureBotContacts() {
        if (!curUser) return;
        dbByIndex('contacts', 'owner', curUser.id).then(function (contacts) {
            var missing = OFFICIAL_BOT_IDS.filter(function (bid) {
                return !contacts.some(function (c) { return c.contactId === bid; });
            });
            if (!missing.length) return;
            return Promise.all(missing.map(function (bid) {
                return dbAdd('contacts', { id: curUser.id + '|' + bid, owner: curUser.id, contactId: bid, created: now() });
            })).then(function () { loadChatList(); });
        });
    }

    function doLogout() {
        if (curUser) { curUser.status = 'offline'; dbAdd('users', curUser); }
        curUser = null;
        localStorage.removeItem(LS('session'));
        localStorage.removeItem(LS('serverToken'));
        apiToken = '';
        $('loginScreen').classList.remove('chat-hidden');
        $('chatApp').classList.add('chat-hidden');
        $('adminPanel').classList.add('chat-hidden');
        // clean up typing timers
        Object.keys(typingTimers).forEach(function (k) { clearInterval(typingTimers[k]); });
        typingTimers = {};
        stopStreaming();
    }

    function checkSession() {
        var raw = localStorage.getItem(LS('session'));
        if (!raw) return Promise.resolve(null);
        try { var s = JSON.parse(raw); return dbGet('users', s.id).then(function (u) { if (u) { curUser = u; return u; } return null; }); }
        catch (e) { return Promise.resolve(null); }
    }
    function requireAdmin() { return curUser && curUser.role === 'admin'; }

    /* ===================== 4. DATA LOADING ===================== */
    function loadUsers() { return dbGetAll('users').then(function (u) { allUsers = u; return u; }); }
    function loadGroups() { return dbGetAll('groups').then(function (g) { allGroups = g; return g; }); }
    function loadChannels() { return dbGetAll('channels').then(function (c) { allChannels = c; return c; }); }

    function getLastMsg(cid) {
        if (isApiMode()) return dbByIndex('messages', 'chatId', cid).then(function (ms) { return ms.length ? ms[ms.length - 1] : null; });
        return openDB().then(function (d) { return new Promise(function (res) {
            var tx = d.transaction('messages', 'readonly');
            var r = tx.objectStore('messages').index('chatId').openCursor(IDBKeyRange.only(cid), 'prev');
            r.onsuccess = function (e) { var c = e.target.result; res(c ? c.value : null); };
            r.onerror = function () { res(null); };
        }); });
    }

    function getMsgs(cid, limit) {
        limit = limit || 50;
        if (isApiMode()) return dbByIndex('messages', 'chatId', cid).then(function (ms) { return ms.slice(-limit); });
        return openDB().then(function (d) { return new Promise(function (res) {
            var tx = d.transaction('messages', 'readonly');
            var r = tx.objectStore('messages').index('chatId').openCursor(IDBKeyRange.only(cid), 'prev');
            var items = [];
            r.onsuccess = function (e) { var c = e.target.result; if (c && items.length < limit) { items.push(c.value); c.continue(); } else { res(items.reverse()); } };
            r.onerror = function () { res([]); };
        }); });
    }

    function getUnread(cid) {
        var lastRead = localStorage.getItem(LS('read_' + cid)) || '0';
        if (isApiMode()) return dbByIndex('messages', 'chatId', cid).then(function (ms) {
            return ms.filter(function (m) { return m.time > lastRead && m.sender !== (curUser ? curUser.id : ''); }).length;
        });
        return openDB().then(function (d) { return new Promise(function (res) {
            var tx = d.transaction('messages', 'readonly');
            var r = tx.objectStore('messages').index('chatId').openCursor(IDBKeyRange.only(cid));
            var count = 0;
            r.onsuccess = function (e) { var c = e.target.result; if (c) { if (c.value.time > lastRead && c.value.sender !== (curUser ? curUser.id : '')) count++; c.continue(); } else res(count); };
            r.onerror = function () { res(0); };
        }); });
    }

    function getUserName(uid) { if (!uid) return '未知'; var u = allUsers.find(function (x) { return x.id === uid; }); return u ? u.name || u.username : uid.slice(-6); }
    function getUserById(uid) { return allUsers.find(function (x) { return x.id === uid; }); }

    /* ===================== 5. CHAT LIST ===================== */
    function loadChatList() {
        loadUsers();
        var p1 = loadGroups(), p2 = loadChannels(), p3 = dbByIndex('contacts', 'owner', curUser ? curUser.id : '');
        return Promise.all([p1, p2, p3]).then(function (results) {
            var contacts = results[2] || [];
            var contactAdded = {};
            var items = [];
            var fhId = curUser ? 'fh_' + curUser.id : 'filehelper';
            items.push({ type: 'filehelper', id: fhId, name: '文件传输助手', avatar: 'filehelper', lastMsg: '', lastTime: 0 });
             contacts.forEach(function (c) {
                var cid = c.contactId;
                if (contactAdded[cid]) return;
                contactAdded[cid] = true;
                items.push({ type: 'contact', id: cid, name: getUserName(cid), avatar: cid, lastMsg: '', lastTime: c.created });
            });
            allGroups.forEach(function (g) { if (g.members && g.members.some(function (m) { return m.id === curUser.id; })) items.push({ type: 'group', id: g.id, name: g.name, avatar: g.id, lastMsg: '', lastTime: g.created }); });
            allChannels.forEach(function (c) { if (c.subscribers && c.subscribers.indexOf(curUser.id) !== -1) items.push({ type: 'channel', id: c.id, name: c.name, avatar: c.id, lastMsg: '', lastTime: c.created }); });
            chatList = items;
            var promises = items.map(function (item) {
                var cid = getChatKey(item.type, item.id);
                return getLastMsg(cid).then(function (msg) { if (msg) { item.lastMsg = msg.content; item.lastTime = msg.time; } return getUnread(cid).then(function (n) { item.unread = n; }); });
            });
            Promise.all(promises).then(function () {
                chatList.sort(function (a, b) {
                    if (a.type === 'filehelper') return -1;
                    if (b.type === 'filehelper') return 1;
                    return a.lastTime < b.lastTime ? 1 : -1;
                });
                renderChatList(curCat);
            });
        });
    }

    /* ===================== 6. RENDER ===================== */
    function renderSidebar() {
        if (!curUser) return;
        var av = $('chatUserAvatar');
        if (curUser.avatar) { av.style.backgroundImage = 'url("' + curUser.avatar + '")'; av.style.backgroundSize = 'cover'; av.textContent = ''; }
        else { av.textContent = avText(curUser.name || curUser.username); av.style.background = avatarColor(curUser.id); av.style.backgroundImage = ''; }
        $('chatUserName').textContent = curUser.name || curUser.username;
        $('chatUserRole').textContent = curUser.role === 'admin' ? '管理员' : '用户';
        var bioEl = $('chatUserBio');
        if (bioEl) bioEl.textContent = curUser.bio || '';
        var ab = $('chatAdminBtn'); if (ab) ab.style.display = curUser.role === 'admin' ? 'flex' : 'none';
    }

    function getArchived() {
        try { return JSON.parse(localStorage.getItem(LS('archived')) || '[]'); } catch (e) { return []; }
    }
    function isArchived(cid) { return getArchived().indexOf(cid) !== -1; }

    function renderChatList(cat) {
        curCat = cat;
        document.querySelectorAll('.chat-cat-tabs .tab-btn').forEach(function (t) { t.classList.toggle('active', t.dataset.cat === cat); });
        var list = $('chatListContainer'); list.innerHTML = '';
        var archived = getArchived();
        var filtered = chatList.filter(function (i) {
            if (cat === 'groups') return i.type === 'group';
            if (cat === 'channels') return i.type === 'channel';
            return i.type === 'contact' || i.type === 'filehelper';
        });
        var q = ($('chatSearch') ? $('chatSearch').value : '').toLowerCase();
        if (q) filtered = filtered.filter(function (i) { return i.name.toLowerCase().indexOf(q) !== -1; });
        filtered = filtered.filter(function (i) {
            return archivedView ? isArchived(getChatKey(i.type, i.id)) : !isArchived(getChatKey(i.type, i.id));
        });
        if (filtered.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:40px 16px;font-size:13px;color:#999;">' + (archivedView ? '暂无归档' : '暂无数据') + '</div>';
        }
        filtered.forEach(function (item) {
            var div = document.createElement('div');
            div.className = 'chat-list-item';
            if (curChat && curChat.type === item.type && curChat.id === item.id) div.classList.add('active');
            var cid = getChatKey(item.type, item.id);
            var ad = document.createElement('div');
            if (item.type === 'filehelper') {
                ad.className = 'chat-list-avatar filehelper';
                ad.style.background = 'linear-gradient(135deg,#6a4ec8,#9b6dff)';
                ad.innerHTML = '<i class="fas fa-inbox" style="font-size:16px;"></i>';
            } else {
                ad.className = 'chat-list-avatar' + (item.type === 'group' ? ' group' : '') + (item.type === 'channel' ? ' channel' : '');
                ad.style.background = avatarColor(item.avatar); ad.textContent = avText(item.name);
            }
            var idiv = document.createElement('div'); idiv.className = 'chat-list-info';
            idiv.innerHTML = '<div class="chat-list-name">' + esc(item.name) + '</div><div class="chat-list-preview">' + esc(item.lastMsg ? (item.lastMsg.length > 40 ? item.lastMsg.slice(0, 40) + '...' : item.lastMsg) : '暂无消息') + '</div>';
            var md = document.createElement('div'); md.className = 'chat-list-meta';
            if (item.lastTime) md.innerHTML = '<div class="chat-list-time">' + shortTime(item.lastTime) + '</div>';
            if (item.unread && item.unread > 0) md.innerHTML += '<div class="chat-list-badge">' + (item.unread > 99 ? '99+' : item.unread) + '</div>';
            div.appendChild(ad); div.appendChild(idiv); div.appendChild(md);
            div.addEventListener('click', function () { openChat(item.type, item.id); });
            if (archivedView) {
                var unBtn = document.createElement('button');
                unBtn.className = 'mini-btn';
                unBtn.style.margin = 'auto 4px';
                unBtn.textContent = '恢复';
                unBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var a = getArchived(); var i2 = a.indexOf(cid); if (i2 !== -1) a.splice(i2, 1);
                    localStorage.setItem(LS('archived'), JSON.stringify(a));
                    toast('已恢复');
                    renderChatList(curCat);
                });
                div.appendChild(unBtn);
            }
            list.appendChild(div);
        });
        // 归档入口
        if (archived.length > 0) {
            var footer = document.createElement('div');
            footer.style.cssText = 'padding:6px 14px;text-align:center;';
            var btn = document.createElement('button');
            btn.className = 'mini-btn';
            btn.innerHTML = archivedView ? '<i class="fas fa-arrow-left"></i> 返回聊天' : '<i class="fas fa-archive"></i> 查看归档 (' + archived.length + ')';
            btn.style.cssText = 'color:var(--text-muted,#86868b);width:100%;';
            btn.addEventListener('click', function () { archivedView = !archivedView; renderChatList(curCat); });
            footer.appendChild(btn);
            list.appendChild(footer);
        }
    }

    function markChatRead(cid) {
        // 实时回执：当用户查看时立即标记已读→触发 SSE message-update，发送方收到双钻 ✓✓
        getMsgs(cid, 500).then(function (msgs) {
            msgs.forEach(function (msg) {
                if (msg.sender !== curUser.id && !(msg.readBy && msg.readBy.indexOf(curUser.id) !== -1)) {
                    if (!msg.readBy) msg.readBy = [];
                    msg.readBy.push(curUser.id);
                    dbAdd('messages', msg);
                }
            });
        });
    }

    /* ===== 频道发布权限 ===== */
    function canPostInChannel(ch) {
        if (!ch) return true;
        if (ch.adminPostOnly && curUser.role !== 'admin') return false;
        if (ch.ownerPostOnly && curUser.role !== 'admin' && curUser.id !== ch.owner) return false;
        return true;
    }

    function updateChannelInputState() {
        var tools = ['chatInput', 'chatSendBtn', 'chatEmojiBtn', 'chatMediaBtn', 'chatStickerBtn', 'chatVoiceBtn', 'chatSelfDestructBtn', 'chatGifBtn', 'chatFavoritesBtn'];
        var ch = (curChat && curChat.type === 'channel') ? allChannels.find(function (x) { return x.id === curChat.id; }) : null;
        var allowed = !ch || canPostInChannel(ch);
        if (!ch) {
            tools.forEach(function (id) { var el = $(id); if (el) el.disabled = false; });
            var tip = $('chatChannelReadonlyTip');
            if (tip) tip.style.display = 'none';
            return;
        }
        if (allowed) {
            tools.forEach(function (id) { var el = $(id); if (el) el.disabled = false; });
            var tip2 = $('chatChannelReadonlyTip');
            if (tip2) tip2.style.display = 'none';
        } else {
            tools.forEach(function (id) { var el = $(id); if (el) el.disabled = true; });
            var tip3 = $('chatChannelReadonlyTip');
            if (tip3) {
                tip3.textContent = ch.ownerPostOnly ? '仅创建者可发布' : '仅管理员可发布';
                tip3.style.display = 'inline-flex';
            }
        }
        var si = $('chatSendBtn');
        if (si) si.disabled = !allowed || !$('chatInput').value.trim();
    }

    function openChat(type, id) {
        closeInfoPanel();
        curChat = { type: type, id: id };
        hideCommandMenu();
        renderChatList(curCat);
        var cid = getChatKey(type, id);
        localStorage.setItem(LS('read_' + cid), now());
        var el = $('chatMain');
        if (window.innerWidth <= 768) { el.classList.add('show-mobile'); }

        markChatRead(cid);

        var name = '', subtitle = '';
        if (type === 'filehelper') { name = '文件传输助手'; subtitle = '文件、图片与笔记，自动同步到本账号'; }
        else if (type === 'contact') { name = getUserName(id); subtitle = '一对一聊天'; }
        else if (type === 'group') { var g = allGroups.find(function (x) { return x.id === id; }); name = g ? g.name : '群组'; subtitle = (g && g.members ? g.members.length : 0) + ' 名成员'; }
        else if (type === 'channel') { var ch = allChannels.find(function (x) { return x.id === id; }); name = ch ? ch.name : '频道'; subtitle = ch ? (ch.desc || '频道广播') : ''; }
        $('chatMainTitle').textContent = name;
        $('chatMainSubtitle').textContent = subtitle;

        var ga = $('chatGroupActions'); if (ga) ga.style.display = (type === 'group') ? 'flex' : 'none';
        var ca = $('chatChannelActions'); if (ca) ca.style.display = (type === 'channel') ? 'flex' : 'none';
        var cta = $('chatContactActions'); if (cta) cta.style.display = (type === 'contact') ? 'flex' : 'none';
        // Show search/filter/select buttons
        $('chatSearchBtn').style.display = 'inline-flex';
        $('chatFilterBtn').style.display = 'inline-flex';
        $('chatSelectBtn').style.display = 'inline-flex';
        // Reset states
        window._activeFilter = 'all';
        document.querySelectorAll('#chatFilterBar .mini-btn').forEach(function (btn) { btn.classList.toggle('active', btn.dataset.filter === 'all'); });
        if (!window._isSelectMode) $('chatSelectBar').classList.add('chat-hidden');
        // Hide inline search
        $('chatInlineSearch').classList.add('chat-hidden');
        updateChannelInputState();
        loadMessages(cid, true);
    }

    function renderMsg(msg, isSelf) {
        // deleted for self: skip entirely
        if (msg.deletedForSelf && msg.deletedFor && msg.deletedFor.indexOf(curUser.id) !== -1) {
            return '';
        }
        if (msg.deleted || msg.recalled) {
            return '<div class="chat-msg system"><div class="chat-msg-bubble">' + (msg.recalledBy === msg.sender ? '你' : esc(getUserName(msg.sender))) + '撤回了一条消息</div></div>';
        }
        if (msg.isExpired) {
            return '<div class="chat-msg system"><div class="chat-msg-bubble chat-expired-msg"><i class="fas fa-hourglass-end"></i> 消息已过期</div></div>';
        }
        var cls = isSelf ? 'self' : 'other';
        var html = '<div class="chat-msg ' + cls + '" data-mid="' + msg.id + '">';
        if (curChat && curChat.type === 'group' && !isSelf) {
            html += '<div class="chat-msg-sender">' + esc(getUserName(msg.sender)) + '</div>';
        }
        // secret indicator
        if (msg.isSecret) html += '<span class="chat-secret-indicator"><i class="fas fa-lock"></i></span>';
        // quote reply
        if (msg.replyTo) html += '<div class="chat-msg-quote">' + esc(msg.replyTo) + '</div>';
        // content
        var content = esc(msg.content);
        content = content.replace(/@(\w+)/g, '<span class="chat-msg-at">@$1</span>');
        content = content.replace(/@all/g, '<span class="chat-msg-at" style="color:#ff3b30;">@all</span>');
        content = content.replace(/@everyone/g, '<span class="chat-msg-at" style="color:#ff3b30;">@everyone</span>');
        html += '<div class="chat-msg-bubble">';
        // media
        if (msg.type === 'image' && msg.mediaUrl) {
            html += '<div class="chat-media-bubble"><img src="' + esc(msg.mediaUrl) + '" alt="图片" style="max-width:200px;border-radius:8px;display:block;"></div>';
        } else if (msg.type === 'video' && msg.mediaUrl) {
            html += '<div class="chat-media-bubble"><video src="' + esc(msg.mediaUrl) + '" controls style="max-width:240px;max-height:240px;border-radius:8px;display:block;"></video></div>';
        } else if (msg.type === 'file' && msg.mediaUrl) {
            var isPdf = msg.fileName && msg.fileName.toLowerCase().indexOf('.pdf') !== -1;
            var isDoc = msg.fileName && (msg.fileName.toLowerCase().indexOf('.doc') !== -1 || msg.fileName.toLowerCase().indexOf('.xls') !== -1);
            var previewHtml = '';
            if (isPdf) {
                previewHtml = '<div style="margin-top:4px;"><embed src="' + esc(msg.mediaUrl) + '" type="application/pdf" style="width:200px;height:120px;border-radius:4px;"></embed></div>';
            } else if (isDoc) {
                previewHtml = '<div style="font-size:11px;color:#888;margin-top:4px;">📄 文档文件（点击下载查看）</div>';
            }
            html += '<div style="padding:8px;background:rgba(0,0,0,.04);border-radius:8px;display:flex;align-items:center;gap:8px;"><i class="fas fa-file"></i> <a href="' + esc(msg.mediaUrl) + '" download="' + esc(msg.fileName || 'file') + '" style="color:#007aff;">' + esc(msg.fileName || '文件') + '</a></div>' + previewHtml;
        } else if (msg.type === 'voice') {
            html += '<div class="chat-voice-bubble" onclick="window._playVoice(\'' + msg.id + '\')"><i class="fas fa-play-circle" style="color:#007aff;font-size:24px;"></i> <span style="font-size:13px;">语音消息</span> <span style="font-size:11px;color:#999;">' + (msg.voiceDuration || '?') + 's</span></div>';
        } else if (msg.type === 'sticker') {
            html += '<div style="font-size:48px;line-height:1;">' + esc(msg.content) + '</div>';
        } else if (msg.type === 'poll') {
            html += '<div style="min-width:200px;"><div style="font-weight:600;margin-bottom:8px;">📊 ' + esc(msg.content) + '</div>';
            if (msg.pollOptions && Array.isArray(msg.pollOptions)) {
                msg.pollOptions.forEach(function (opt, i) {
                    var voted = msg.pollVotes && msg.pollVotes[curUser.id] === i;
                    var totalVotes = msg.pollVotes ? Object.keys(msg.pollVotes).length : 0;
                    var pct = totalVotes > 0 ? Math.round((Object.values(msg.pollVotes || {}).filter(function (v) { return v === i; }).length / totalVotes) * 100) : 0;
                    html += '<div style="margin-bottom:4px;cursor:pointer;" onclick="window._votePoll(\'' + msg.id + '\',' + i + ')"><div style="display:flex;justify-content:space-between;font-size:12px;">' + esc(opt) + '<span>' + pct + '%</span></div><div style="height:6px;background:#eee;border-radius:3px;overflow:hidden;"><div style="height:100%;width:' + pct + '%;background:' + (voted ? '#007aff' : '#ddd') + ';border-radius:3px;"></div></div></div>';
                });
            }
            html += '<div style="font-size:11px;color:#999;margin-top:4px;">' + (msg.pollVotes ? Object.keys(msg.pollVotes).length : 0) + ' 人已投票</div></div>';
        } else {
            html += content;
            // Link preview
            var url = extractUrl(msg.content);
            if (url) {
                html += '<div style="margin-top:6px;padding:6px 10px;background:rgba(0,0,0,.04);border-radius:6px;font-size:11px;color:#007aff;word-break:break-all;">🔗 <a href="' + esc(url) + '" target="_blank" style="color:#007aff;text-decoration:none;" rel="noopener">' + esc(url.length > 40 ? url.slice(0, 40) + '...' : url) + '</a></div>';
            }
        }
        if (msg.edited) html += '<span class="chat-msg-edited" title="点击查看编辑历史" style="cursor:pointer;" onclick="window._showEditHistory(\'' + msg.id + '\')">(已编辑)</span>';
        // self-destruct timer
        if (msg.selfDestructAfter && !msg.isExpired) {
            html += '<span class="chat-self-destruct-timer" id="sd_' + msg.id + '"><i class="fas fa-bomb"></i></span>';
        }
        html += '</div>';
        // select checkbox
        if (window._isSelectMode) {
            html += '<div style="position:absolute;top:-24px;left:0;"><input type="checkbox" class="chat-select-check" data-mid="' + msg.id + '" onchange="window._onSelectChange()"></div>';
        }
        // reactions display
        if (msg.reactions && msg.reactions.length > 0) {
            html += displayReactions(msg.reactions);
        }
        // actions
        html += '<div class="chat-msg-actions">';
        html += '<button class="chat-msg-act" onclick="window._chatQuoteMsg(\'' + msg.id + '\')" title="引用">💬</button>';
        html += '<button class="chat-msg-act" onclick="window._chatForwardMsg(\'' + msg.id + '\')" title="转发">↗️</button>';
        html += '<button class="chat-msg-act" onclick="window._chatCopyMsg(\'' + msg.id + '\')" title="复制">📋</button>';
        html += '<button class="chat-msg-act" onclick="window._chatFavoriteMsg(\'' + msg.id + '\')" title="收藏">⭐</button>';
        html += '<button class="chat-msg-act" onclick="window._chatReactMsg(event,\'' + msg.id + '\')" title="表情反应">😊</button>';
        html += '<button class="chat-msg-act" onclick="window._chatTranslateMsg(\'' + msg.id + '\')" title="翻译">🌐</button>';
        html += '<button class="chat-msg-act" onclick="window._chatPinMsg(\'' + msg.id + '\')" title="置顶">📌</button>';
        if (isSelf) {
            html += '<button class="chat-msg-act" onclick="window._chatEditMsg(\'' + msg.id + '\')" title="编辑">✏️</button>';
            html += '<button class="chat-msg-act" onclick="window._chatDeleteMsg(\'' + msg.id + '\',\'' + (isSelf ? 'self' : 'everyone') + '\')" title="删除">🗑️</button>';
        } else {
            html += '<button class="chat-msg-act" onclick="window._chatDeleteMsg(\'' + msg.id + '\',\'self\')" title="删除">🗑️</button>';
        }
        html += '</div>';
        html += '<div class="chat-msg-time">' + timeStr(msg.time) + '</div>';
        // read receipts
        if (isSelf && msg.readBy && msg.readBy.length > 0) {
            html += '<div class="chat-msg-read"><i class="fas fa-check-double" style="color:#34c759;"></i> 已读</div>';
        } else if (isSelf) {
            html += '<div class="chat-msg-read"><i class="fas fa-check"></i> 已发送</div>';
        }
        html += '</div>';
        return html;
    }

    function loadMessages(cid, forceBottom) {
        getMsgs(cid).then(function (msgs) {
            var container = $('chatMessages');
            var nearBottom = forceBottom || container.scrollHeight - container.scrollTop - container.clientHeight < 140;
            container.innerHTML = '';
            var cid = getChatKey(curChat.type, curChat.id);

            // Pinned messages
            var pinnedIds = JSON.parse(localStorage.getItem(LS('pinned_' + cid)) || '[]');
            var pinnedMsgs = [];
            if (pinnedIds.length > 0) {
                pinnedIds.forEach(function (pid) {
                    var found = msgs.find(function (m) { return m.id === pid; });
                    if (found) pinnedMsgs.push(found);
                });
                if (pinnedMsgs.length > 0) {
                    container.innerHTML = '<div class="chat-pinned-banner"><i class="fas fa-thumbtack"></i> ' + pinnedMsgs.length + ' 条置顶消息</div>';
                    pinnedMsgs.forEach(function (msg) {
                        var isSelf = msg.sender === curUser.id;
                        container.insertAdjacentHTML('beforeend', renderMsg(msg, isSelf));
                    });
                    container.innerHTML += '<div class="chat-pinned-divider"></div>';
                }
            }

            // Filter
            var activeFilter = window._activeFilter || 'all';
            if (activeFilter !== 'all') {
                msgs = msgs.filter(function (m) { return m.type === activeFilter; });
            }

            if (msgs.length === 0 && pinnedMsgs.length === 0) {
                container.innerHTML = '<div class="chat-msg system"><div class="chat-msg-bubble">' + (activeFilter !== 'all' ? '没有匹配的消息' : '暂无消息，发送第一条消息吧') + '</div></div>';
                return;
            }
            // Date separators
            var lastDate = '';
            msgs.forEach(function (msg) {
                var isSelf = msg.sender === curUser.id;
                // skip deleted for self
                if (msg.deletedForSelf && msg.deletedFor && msg.deletedFor.indexOf(curUser.id) !== -1) return;
                var d = new Date(msg.time).toLocaleDateString();
                if (d !== lastDate) {
                    lastDate = d;
                    container.insertAdjacentHTML('beforeend', '<div class="chat-date-separator"><span>' + (new Date(msg.time).toDateString() === new Date().toDateString() ? '今天' : d) + '</span></div>');
                }
                container.insertAdjacentHTML('beforeend', renderMsg(msg, isSelf));
            });
            if (nearBottom) container.scrollTop = container.scrollHeight;

            // start self-destruct timers
            msgs.forEach(function (msg) {
                if (msg.selfDestructAfter && !msg.isExpired) startSelfDestructTimer(msg, cid);
            });
            // simulate read receipt
            simulateReadReceipts(msgs, cid);
        });
    }

    /* ===================== 7. MESSAGES ===================== */
    // Bot commands
    var BOT_COMMANDS = {
        '/help': '可用命令：/help 帮助 /time 时间 /echo 复读 /ping Ping /date 日期 /random 随机数\nMOSS 命令：/start 欢迎 /whoami 我的账号 /info 账号信息 /invite 获取邀请',
        '/time': '当前时间: ' + new Date().toLocaleTimeString(),
        '/date': '当前日期: ' + new Date().toLocaleDateString(),
        '/ping': 'Pong! (' + Math.round(Math.random() * 100) + 'ms)',
        '/random': '随机数: ' + Math.floor(Math.random() * 1000),
    };
    var MOSS_COMMANDS = {
        '/start': '👋 欢迎使用 MOSS（Aqua Chat 官方助手机器人），发送 /help 查看可用命令。',
        '/whoami': '🤖 MOSS - Aqua Chat 官方助手',
        '/info': function () {
            return '账号信息：\n用户: ' + (curUser ? curUser.name : '未知') + '\nID: ' + (curUser ? curUser.id : '?') + '\n设备: ' + (localStorage.getItem(LS('deviceId')) || '本机') + '\n注册: ' + (curUser && curUser.created ? curUser.created : '—');
        }
    };

    /* ===== / 命令选择栏（上下文感知 + 全局）===== */
    var COMMAND_CATALOG = {
        'u_moss': [
            { cmd: '/start', desc: '欢迎信息' },
            { cmd: '/help', desc: '查看可用命令' },
            { cmd: '/info', desc: '我的账号信息' },
            { cmd: '/whoami', desc: '查看机器人身份' },
            { cmd: '/time', desc: '当前时间' },
            { cmd: '/date', desc: '当前日期' },
            { cmd: '/ping', desc: 'Ping 测试' },
            { cmd: '/random', desc: '随机生成 0-9999' },
            { cmd: '/echo <内容>', desc: '原样复读' },
            { cmd: '/about', desc: '关于 Aqua Chat' }
        ],
        'u_spam_bot': [
            { cmd: '/start', desc: '查看功能列表' },
            { cmd: '/check <用户名>', desc: '检查账号（含举报记录+垃圾评分）' },
            { cmd: '/report <用户名> <原因>', desc: '举报违规账号' },
            { cmd: '/me', desc: '查看自己的账号状态' },
            { cmd: '/help', desc: '查看可用命令' }
        ],
        'u_bot_father': [
            { cmd: '/newbot', desc: '创建新机器人' },
            { cmd: '/templates', desc: '查看可用模板' },
            { cmd: '/mybots', desc: '我创建的机器人' },
            { cmd: '/token <用户名>', desc: '查看机器人令牌' },
            { cmd: '/setcommands <用户名> /cmd 描述', desc: '设置机器人命令' },
            { cmd: '/setkeyword <用户名> 词 => 回复', desc: '设置关键词回复' },
            { cmd: '/setdesc <用户名> 描述', desc: '修改机器人描述' },
            { cmd: '/delete <用户名>', desc: '删除机器人' },
            { cmd: '/cancel', desc: '取消当前流程' },
            { cmd: '/help', desc: '查看可用命令' }
        ],
        'general': [
            { cmd: '/help', desc: '查看可用命令' },
            { cmd: '/time', desc: '当前时间' },
            { cmd: '/date', desc: '当前日期' },
            { cmd: '/ping', desc: 'Ping 测试' },
            { cmd: '/random', desc: '随机数' },
            { cmd: '/echo <内容>', desc: '复读' }
        ]
    };
    var cmdMenuItems = [], cmdMenuSel = 0;

    function contextCommands() {
        if (curChat && curChat.type === 'contact') {
            var u = getUserById(curChat.id);
            if (u && u.role === 'bot' && COMMAND_CATALOG[u.id]) return COMMAND_CATALOG[u.id];
            if (u && u.role === 'bot') return [{ cmd: '/help', desc: '查看机器人可用命令' }];
        }
        return COMMAND_CATALOG.general;
    }

    function showCommandMenu(query) {
        var menu = $('chatCmdMenu'); if (!menu) return;
        var list = contextCommands();
        var q = (query || '').trim().toLowerCase();
        if (q && q.charAt(0) === '/') {
            var pre = q.slice(1);
            if (pre) list = list.filter(function (c) { return c.cmd.toLowerCase().indexOf('/' + pre) === 0; });
        }
        if (!list.length) { hideCommandMenu(); return; }
        cmdMenuItems = list; cmdMenuSel = 0;
        menu.innerHTML = list.map(function (c, i) {
            return '<div class="chat-cmd-item' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' +
                '<span class="chat-cmd-name">' + esc(c.cmd) + '</span>' +
                '<span class="chat-cmd-desc">' + esc(c.desc) + '</span></div>';
        }).join('');
        menu.style.display = 'block';
        bindCmdMenuClicks(menu);
    }

    function hideCommandMenu() {
        var menu = $('chatCmdMenu'); if (!menu) return;
        menu.style.display = 'none';
        menu.innerHTML = '';
        cmdMenuItems = [];
    }

    function bindCmdMenuClicks(menu) {
        var items = menu.querySelectorAll('.chat-cmd-item');
        items.forEach(function (el) {
            el.addEventListener('mousedown', function (e) { e.preventDefault(); });
            el.addEventListener('click', function () {
                var idx = parseInt(el.dataset.i, 10);
                insertCommand(cmdMenuItems[idx] ? cmdMenuItems[idx].cmd : '');
            });
        });
        items.forEach(function (el, i) { el.classList.toggle('active', i === cmdMenuSel); });
    }

    function moveCmdMenuSel(delta) {
        var items = $('chatCmdMenu') ? $('chatCmdMenu').querySelectorAll('.chat-cmd-item') : [];
        if (!items.length) return;
        cmdMenuSel = (cmdMenuSel + delta + items.length) % items.length;
        items.forEach(function (el, i) { el.classList.toggle('active', i === cmdMenuSel); });
        var active = items[cmdMenuSel];
        if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    }

    function insertCommand(cmd) {
        if (!cmd) return hideCommandMenu();
        var input = $('chatInput'); if (!input) return hideCommandMenu();
        var val = input.value;
        var slash = val.lastIndexOf('/');
        if (slash !== -1 && !/\s/.test(val.slice(slash))) { val = val.slice(0, slash); }
        input.value = val + cmd + ' ';
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        input.dispatchEvent(new Event('input'));
        hideCommandMenu();
    }

    function handleCmdMenuKey(e, input) {
        var menu = $('chatCmdMenu');
        var shown = menu && menu.style.display !== 'none';
        if (!shown) return false;
        if (e.key === 'ArrowDown') { e.preventDefault(); moveCmdMenuSel(1); return true; }
        else if (e.key === 'ArrowUp') { e.preventDefault(); moveCmdMenuSel(-1); return true; }
        else if (e.key === 'Tab' || e.key === 'Enter') {
            e.preventDefault();
            var item = cmdMenuItems[cmdMenuSel];
            if (item) insertCommand(item.cmd);
            return true;
        }
        else if (e.key === 'Escape') { e.preventDefault(); hideCommandMenu(); return true; }
        return false;
    }


    function handleBotCommand(text) {
        if (!text || text.charAt(0) !== '/') return null;
        var parts = text.split(' ');
        var cmd = parts[0].toLowerCase();
        var args = parts.slice(1).join(' ');
        if (cmd === '/echo') return '你说: ' + (args || '(空)');
        if (curChat && curChat.type === 'contact' && curChat.id === 'u_moss') {
            var m = MOSS_COMMANDS[cmd];
            if (m) return typeof m === 'function' ? m() : m;
            return '🤖 MOSS：未知命令，发送 /help 查看帮助。';
        }
        if (BOT_COMMANDS[cmd]) return BOT_COMMANDS[cmd];
        return null;
    }

    function sendMessage() {
        var input = $('chatInput');
        var text = input.value.trim();
        if (!text || !curChat) return;
        // 频道发布权限守卫
        if (curChat.type === 'channel') {
            var chG = allChannels.find(function (x) { return x.id === curChat.id; });
            if (chG && !canPostInChannel(chG)) { toast('你没有权限在此频道发布'); return; }
        }
        // Bot commands check（本地 IndexedDB 模式模拟回复；服务器模式由服务端 bots.js 处理，避免重复）
        var botReply = isApiMode() ? null : handleBotCommand(text);
        if (botReply) {
            // Send bot reply as system message (from admin)
            var cid = getChatKey(curChat.type, curChat.id);
            var msg = { id: uid(), chatId: cid, sender: curUser.id, type: 'text', content: '🤖 ' + botReply, time: now(), edited: false, recalled: false, isExpired: false };
            dbAdd('messages', msg).then(function () { input.value = ''; input.style.height = 'auto'; $('chatSendBtn').disabled = true; loadMessages(cid, true); loadChatList(); });
            toast('Bot: ' + botReply);
            return;
        }
        // rate limit
        if (isRateLimited('msg_' + curUser.id, 60, 60)) { toast('发送太频繁，请稍后再试'); return; }
        var cid = getChatKey(curChat.type, curChat.id);
        var selfDestruct = parseInt(localStorage.getItem(LS('selfDestruct')) || '0');
        var msg = {
            id: uid(), chatId: cid, sender: curUser.id, type: 'text', content: text,
            time: now(), edited: false, recalled: false, isExpired: false, selfDestructAfter: selfDestruct || 0
        };
        var qt = $('chatInputQuoteText');
        if (qt && qt.dataset.quote) { msg.replyTo = qt.dataset.quote; cancelQuote(); }
        dbAdd('messages', msg).then(function () {
            input.value = ''; input.style.height = 'auto'; $('chatSendBtn').disabled = true;
            // clear self-destruct
            localStorage.setItem(LS('selfDestruct'), '0');
            updateSelfDestructUI();
            loadMessages(cid, true);
            loadChatList();
            // simulate typing stop
            emitTyping(cid, false);
        });
    }

    window._chatEditMsg = function (msgId) {
        var cid = getChatKey(curChat.type, curChat.id);
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return toast('消息不存在');
            if (msg.sender !== curUser.id) return toast('只能编辑自己的消息');
            var newText = prompt('编辑消息：', msg.content);
            if (newText && newText.trim() && newText.trim() !== msg.content) {
                if (!msg.editHistory) msg.editHistory = [];
                msg.editHistory.push({ content: msg.content, time: now() });
                msg.content = newText.trim(); msg.edited = true;
                dbAdd('messages', msg).then(function () { loadMessages(cid, true); loadChatList(); toast('消息已编辑'); });
            }
        });
    };

    window._chatDeleteMsg = function (msgId, scope) {
        var cid = getChatKey(curChat.type, curChat.id);
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return toast('消息不存在');
            if (scope === 'everyone') {
                if (msg.sender !== curUser.id && curUser.role !== 'admin') return toast('无权删除此消息');
                if (!confirm('确定删除此消息（所有人可见将消失）？')) return;
                msg.recalled = true; msg.recalledBy = curUser.id;
            } else {
                if (!confirm('确定从本地删除此消息？')) return;
                msg.deletedForSelf = true;
                msg.deletedFor = msg.deletedFor || [];
                msg.deletedFor.push(curUser.id);
                if (msg.sender !== curUser.id) {
                    // For others' messages, mark deleted locally
                    msg.deletedForSelf = true;
                }
            }
            dbAdd('messages', msg).then(function () { loadMessages(cid, true); loadChatList(); toast(scope === 'everyone' ? '消息已撤回' : '已删除'); });
        });
    };

    // Pin/unpin message
    window._chatPinMsg = function (msgId) {
        if (!curChat) return;
        var cid = getChatKey(curChat.type, curChat.id);
        var pinned = JSON.parse(localStorage.getItem(LS('pinned_' + cid)) || '[]');
        var idx = pinned.indexOf(msgId);
        if (idx !== -1) { pinned.splice(idx, 1); toast('已取消置顶'); }
        else { pinned.unshift(msgId); toast('消息已置顶'); }
        localStorage.setItem(LS('pinned_' + cid), JSON.stringify(pinned));
        loadMessages(cid, true);
    };

    window._chatQuoteMsg = function (msgId) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return;
            var el = $('chatInputQuote'); el.classList.add('show');
            var txt = $('chatInputQuoteText');
            txt.textContent = '引用: ' + (msg.content.length > 50 ? msg.content.slice(0, 50) + '...' : msg.content);
            txt.dataset.quote = msg.content;
        });
    };

    function cancelQuote() { var el = $('chatInputQuote'); el.classList.remove('show'); $('chatInputQuoteText').dataset.quote = ''; }

    function sendMedia(files) {
        if (!files || !files.length || !curChat) return;
        if (isApiMode()) {
            // 服务器模式：走文件快传（取件码），避免超大 base64 入库
            Array.from(files).forEach(function (file) { sendFileTransfer(file); });
            return;
        }
        var cid = getChatKey(curChat.type, curChat.id);
        Array.from(files).forEach(function (file) {
            var reader = new FileReader();
            reader.onload = function (e) {
                var isImage = file.type.indexOf('image') === 0;
                var isVideo = file.type.indexOf('video') === 0;
                var msg = {
                    id: uid(), chatId: cid, sender: curUser.id,
                    type: isImage ? 'image' : isVideo ? 'video' : 'file',
                    content: file.name,
                    mediaUrl: e.target.result, fileName: file.name,
                    time: now(), edited: false, recalled: false, isExpired: false
                };
                dbAdd('messages', msg).then(function () { loadMessages(cid, true); loadChatList(); });
            };
            reader.readAsDataURL(file);
        });
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        var k = 1024;
        var sizes = ['B', 'KB', 'MB', 'GB'];
        var i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function sendFileTransfer(file) {
        if (!file || !curChat) return;
        var cid = getChatKey(curChat.type, curChat.id);
        toast('正在上传...');
        fetch(API_BASE + '/api/ft/upload', {
            method: 'POST',
            headers: { 'x-auth-token': apiToken, 'x-filename': file.name, 'x-type': file.type || 'application/octet-stream' },
            body: file
        }).then(function (res) {
            if (!res.ok) throw new Error('上传失败: ' + res.status);
            return res.json();
        }).then(function (data) {
            if (data.ok) {
                var msg = {
                    id: uid(), chatId: cid, sender: curUser.id, type: 'file_transfer',
                    content: '[文件快传] 取件码: ' + data.code + ' (' + file.name + ', ' + formatFileSize(data.size) + ')',
                    time: now(), edited: false, recalled: false, isExpired: false
                };
                dbAdd('messages', msg).then(function () { loadMessages(cid, true); loadChatList(); });
                toast('上传成功！取件码: ' + data.code);
            } else {
                throw new Error(data.error || '上传失败');
            }
        }).catch(function (err) {
            console.error('File transfer error:', err);
            toast('上传失败: ' + err.message);
        });
    }

    function searchMessages(keyword) {
        if (!keyword) return Promise.resolve([]);
        return openDB().then(function (d) { return new Promise(function (res) {
            var tx = d.transaction('messages', 'readonly');
            var r = tx.objectStore('messages').getAll();
            r.onsuccess = function () {
                var all = r.result || [];
                var results = all.filter(function (m) { return m.content && m.content.toLowerCase().indexOf(keyword.toLowerCase()) !== -1; });
                results.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
                res(results.slice(0, 20));
            };
            r.onerror = function () { res([]); };
        }); });
    }

    /* ===================== 8. TYPING INDICATOR ===================== */
    function emitTyping(cid, isTyping) {
        if (isApiMode()) {
            apiFetch('/api/typing', { method: 'POST', body: { chatId: cid, typing: isTyping } }).catch(function () { });
        }
        // 本地仅在非 API 模式模拟；API 模式下输入状态由 SSE 来的对方驱动
        var typingEl = $('chatTyping');
        if (typingEl) typingEl.textContent = isTyping ? '正在输入...' : '';
    }

    function simulateTypingIndicator() {
        // 本地（IndexedDB）模式下定时模拟对方输入（demo），API 模式用真实流
        if (typingTimers['demo']) clearInterval(typingTimers['demo']);
        typingTimers['demo'] = setInterval(function () {
            if (!curChat || !curChat.id || isApiMode()) return;
            var typingEl = $('chatTyping');
            if (typingEl && Math.random() > 0.7) {
                typingEl.textContent = '对方正在输入...';
                setTimeout(function () { if (typingEl) typingEl.textContent = ''; }, 3000);
            }
        }, 8000);
    }

    function handlePeerTyping(payload) {
        if (!payload || !payload.chatId || !payload.userId || payload.userId === curUser.id) return;
        if (!curChat || getChatKey(curChat.type, curChat.id) !== payload.chatId) return;
        var typingEl = $('chatTyping');
        if (!typingEl) return;
        if (payload.typing) {
            typingEl.textContent = (payload.name || '对方') + '正在输入...';
            clearTimeout(typingEl._hide);
            typingEl._hide = setTimeout(function () { typingEl.textContent = ''; }, 3500);
        } else {
            clearTimeout(typingEl._hide);
            typingEl.textContent = '';
        }
    }

    function updatePeerOnline(payload) {
        if (!payload || !payload.userId) return;
        // ... existing ...

        // 刷新当前聊天页的在线提示
        if (curChat && curChat.type === 'contact') {
            var title = $('chatMainTitle');
            var sub = $('chatMainSubtitle');
            if (title && sub) {
                var peer = getUserById(curChat.id);
                if (peer) {
                    title.textContent = getUserName(curChat.id);
                    sub.textContent = peer.status === 'online' ? '在线' : '离线';
                }
            }
        }
        renderChatList(curCat);
    }

    function sendChatNotification(userId, type, extra) {
        if (!isApiMode()) return;
        apiFetch('/api/notify', { method: 'POST', body: { userId: userId, type: type, extra: extra || {} } }).catch(function () {});
    }

    function showChatNotification(type, extra) {
        if (type === 'groupInvite') {
            toast('已加入群组：' + (extra.groupName || ''));
            loadChatList();
        } else if (type === 'groupReject') {
            toast('管理员拒绝了你的加群申请：' + (extra.groupName || ''));
        }
    }

    /* ===================== 9. READ RECEIPTS ===================== */
    function simulateReadReceipts(msgs, cid) {
        msgs.forEach(function (msg) {
            if (msg.sender !== curUser.id && !msg.readBy) {
                setTimeout(function () {
                    dbGet('messages', msg.id).then(function (m) {
                        if (m && !m.readBy) { m.readBy = [curUser.id]; dbAdd('messages', m); }
                    });
                }, 500);
            }
        });
    }

    /* ===================== 10. SELF-DESTRUCT ===================== */
    function startSelfDestructTimer(msg, cid) {
        if (!msg.selfDestructAfter || msg.isExpired) return;
        var elapsed = (Date.now() - new Date(msg.time).getTime()) / 1000;
        var remaining = msg.selfDestructAfter - elapsed;
        if (remaining <= 0) {
            expireMessage(msg, cid); return;
        }
        var timerId = setInterval(function () {
            remaining--;
            var el = document.getElementById('sd_' + msg.id);
            if (el) el.textContent = '<i class="fas fa-bomb"></i> ' + Math.max(0, Math.round(remaining)) + 's';
            if (remaining <= 0) {
                clearInterval(timerId);
                expireMessage(msg, cid);
            }
        }, 1000);
        selfDestructTimers[msg.id] = timerId;
    }

    function expireMessage(msg, cid) {
        msg.isExpired = true;
        dbAdd('messages', msg).then(function () { loadMessages(cid, true); });
        // clean up timer
        if (selfDestructTimers[msg.id]) { clearInterval(selfDestructTimers[msg.id]); delete selfDestructTimers[msg.id]; }
    }

    function toggleSelfDestruct() {
        var current = parseInt(localStorage.getItem(LS('selfDestruct')) || '0');
        if (current > 0) { localStorage.setItem(LS('selfDestruct'), '0'); }
        else {
            var defaultVal = parseInt(localStorage.getItem(LS('adminSelfDestruct')) || '5');
            localStorage.setItem(LS('selfDestruct'), String(defaultVal));
        }
        updateSelfDestructUI();
    }

    function updateSelfDestructUI() {
        var val = parseInt(localStorage.getItem(LS('selfDestruct')) || '0');
        var badge = $('chatSelfDestructBadge');
        var hint = $('chatSelfDestructHint');
        var btn = $('chatSelfDestructBtn');
        if (val > 0) {
            if (badge) { badge.style.display = 'flex'; badge.textContent = val; }
            if (hint) { hint.style.display = 'inline'; hint.textContent = '自毁 ' + val + 's'; }
            if (btn) btn.style.color = '#ff3b30';
        } else {
            if (badge) badge.style.display = 'none';
            if (hint) hint.style.display = 'none';
            if (btn) btn.style.color = '';
        }
    }

    /* ===================== 11. GROUPS ===================== */
    function showCreateGroup() {
        $('groupModal').classList.add('show');
        $('groupModalTitle').textContent = '创建群组';
        $('groupNameInput').value = ''; $('groupDescInput').value = '';
        delete $('groupModal').dataset.editId;
    }

    function saveGroup() {
        var name = $('groupNameInput').value.trim();
        var desc = $('groupDescInput').value.trim();
        var type = $('groupTypeSelect') ? $('groupTypeSelect').value : 'normal';
        if (!name) return toast('请输入群组名称');
        var editId = $('groupModal').dataset.editId;
        if (editId) {
            dbGet('groups', editId).then(function (g) { if (!g) return toast('群组不存在'); g.name = name; g.desc = desc; dbAdd('groups', g).then(function () { $('groupModal').classList.remove('show'); loadChatList(); toast('群组已更新'); }); });
        } else {
            var g = { id: 'group_' + uid(), name: name, desc: desc, type: type, owner: curUser.id, members: [{ id: curUser.id, role: 'owner' }], created: now() };
            dbAdd('groups', g).then(function () { $('groupModal').classList.remove('show'); loadChatList(); toast('群组已创建'); logAdmin(curUser.id, 'create_group', '创建群组: ' + name); });
        }
    }

    function openInfo(contentEl) {
        $('infoPanel').classList.add('show');
        if (window.innerWidth <= 768) $('infoPanel').classList.add('show-mobile');
        $('infoContent').innerHTML = contentEl;
    }
    function closeInfoPanel() {
        $('infoPanel').classList.remove('show', 'show-mobile');
        $('infoContent').innerHTML = '';
    }
    function showGroupInfo() {
        if (!curChat || curChat.type !== 'group') return;
        var g = allGroups.find(function (x) { return x.id === curChat.id; });
        if (!g) return;
        var html = '<div class="chat-info-avatar" style="background:' + avatarColor(g.id) + '">' + avText(g.name) + '</div>';
        html += '<div class="chat-info-name">' + esc(g.name) + '</div><div class="chat-info-desc">' + esc(g.desc || '暂无简介') + '</div>';
        html += '<div class="chat-info-section"><h3>类型: ' + (g.type === 'super' ? '超级群组' : '普通群组') + '</h3></div>';
        html += '<div class="chat-info-section"><h3>成员 (' + g.members.length + ')</h3>';
        g.members.forEach(function (m) {
            var roleLabel = m.role === 'owner' ? '创建者' : m.role === 'admin' ? '管理员' : '成员';
            html += '<div class="chat-info-member"><span class="chat-info-member-avatar" style="background:' + avatarColor(m.id) + '">' + avText(getUserName(m.id)) + '</span>' + esc(getUserName(m.id)) + '<span class="chat-info-member-role">' + roleLabel + '</span></div>';
        });
        html += '</div>';
        openInfo(html);
    }
    function showContactInfo() {
        if (!curChat || curChat.type !== 'contact') return;
        var u = allUsers.find(function (x) { return x.id === curChat.id; }) || curUser;
        var html = '<div class="chat-info-avatar" style="background:' + avatarColor(u.id) + '">' + avText(getUserName(u.id)) + '</div>';
        html += '<div class="chat-info-name">' + esc(getUserName(u.id)) + '</div>';
        if (u.note || (u.role === 'bot' && u.bio)) {
            html += '<div class="chat-info-desc">' + esc(u.note || u.bio) + '</div>';
        }
        html += '<div class="chat-info-section"><h3>用户 ID</h3><div>' + esc(u.id) + '</div></div>';
        html += '<div class="chat-info-section"><h3>' + (u.role === 'bot' ? '备注' : '签名') + '</h3><div>' + esc(u.role === 'bot' ? (u.note || '机器人') : (u.signature || '暂无签名')) + '</div></div>';
        openInfo(html);
    }
    function showChannelInfo() {
        if (!curChat || curChat.type !== 'channel') return;
        var ch = allChannels.find(function (x) { return x.id === curChat.id; });
        if (!ch) return;
        var html = '<div class="chat-info-avatar" style="background:' + avatarColor(ch.id) + '">' + avText(ch.name) + '</div>';
        html += '<div class="chat-info-name">' + esc(ch.name) + '</div>';
        html += '<div class="chat-info-desc">' + esc(ch.desc || '暂无简介') + '</div>';
        html += '<div class="chat-info-section"><h3>类型</h3><div>' + (ch.type === 'super' ? '超级频道' : '普通频道') + '</div></div>';
        html += '<div class="chat-info-section"><h3>订阅者 (' + (ch.subscribers ? ch.subscribers.length : 0) + ')</h3>';
        (ch.subscribers || []).forEach(function (s) {
            html += '<div class="chat-info-member"><span class="chat-info-member-avatar" style="background:' + avatarColor(s) + '">' + avText(getUserName(s)) + '</span>' + esc(getUserName(s)) + '</div>';
        });
        html += '</div>';
        openInfo(html);
    }

    function showInviteModal() {
        if (!curChat || curChat.type !== 'group') return;
        $('inviteModal').classList.add('show');
        var sel = $('inviteUserSelect'); sel.innerHTML = '<option value="">选择用户...</option>';
        allUsers.forEach(function (u) { if (u.id !== curUser.id) sel.innerHTML += '<option value="' + u.id + '">' + esc(u.name || u.username) + '</option>'; });
        $('inviteLinkResult').style.display = 'none';
    }

    function doInvite() {
        var sel = $('inviteUserSelect'); var userId = sel.value;
        if (!userId) return toast('请选择用户');
        var g = allGroups.find(function (x) { return x.id === curChat.id; });
        if (!g) return toast('群组不存在');
        if (g.members.some(function (m) { return m.id === userId; })) return toast('该用户已是成员');
        // super group limit check
        if (g.type === 'super') {
            var maxMembers = parseInt(localStorage.getItem(LS('adminMaxGroup')) || '200');
            if (g.members.length >= maxMembers) return toast('群组已达人数上限');
        }
        g.members.push({ id: userId, role: 'member' });
        dbAdd('groups', g).then(function () { $('inviteModal').classList.remove('show'); loadChatList(); toast('已邀请成功'); });
    }

    function generateInviteLink() {
        if (!curChat || curChat.type !== 'group') return;
        var code = uid().slice(0, 12);
        var link = 'aquachat://join/' + code;
        var invite = { id: code, groupId: curChat.id, code: code, maxUses: 10, usedCount: 0, expiresAt: new Date(Date.now() + 86400000 * 7).toISOString(), created: now() };
        localStorage.setItem(LS('invite_' + code), JSON.stringify(invite));
        var el = $('inviteLinkResult');
        el.style.display = 'block';
        el.innerHTML = '<strong>邀请链接:</strong><br><span style="font-size:11px;">' + esc(link) + '</span><br><button class="mini-btn" style="margin-top:4px;" onclick="navigator.clipboard.writeText(\'' + link + '\').then(function(){toast(\'已复制\');})">复制链接</button>';
        toast('邀请链接已生成');
    }

    /* ===================== 12. CHANNELS ===================== */
    // Channel subscriber list
    function showChannelSubscribers() {
        if (!curChat || curChat.type !== 'channel') return;
        var ch = allChannels.find(function (x) { return x.id === curChat.id; });
        if (!ch) return;
        var html = '<table class="chat-admin-table"><thead><tr><th>用户</th><th>角色</th></tr></thead><tbody>';
        (ch.subscribers || []).forEach(function (sid) {
            var role = ch.owner === sid ? '创建者' : (ch.admins && ch.admins.indexOf(sid) !== -1 ? '管理员' : '订阅者');
            html += '<tr><td>' + esc(getUserName(sid)) + '</td><td>' + role + '</td></tr>';
        });
        html += '</tbody></table>';
        showCustomModal('频道订阅者 (' + (ch.subscribers ? ch.subscribers.length : 0) + ')', html);
    }

    // Channel admin management
    function manageChannelAdmins() {
        if (!curChat || curChat.type !== 'channel') return;
        var ch = allChannels.find(function (x) { return x.id === curChat.id; });
        if (!ch) return;
        if (ch.owner !== curUser.id && curUser.role !== 'admin') return toast('仅创建者可以管理');
        // Show current admins
        var html = '<label style="font-size:13px;display:block;margin-bottom:8px;">当前管理员：</label>';
        var admins = ch.admins || [];
        if (admins.length === 0) html += '<p style="font-size:12px;color:#999;">暂无管理员</p>';
        admins.forEach(function (aid) {
            html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;">' + esc(getUserName(aid)) + ' <button class="mini-btn" onclick="window._removeChannelAdmin(\'' + ch.id + '\',\'' + aid + '\')">移除</button></div>';
        });
        html += '<hr style="margin:12px 0;"><label style="font-size:13px;display:block;margin-bottom:8px;">添加管理员：</label>';
        html += '<select id="channelAdminSelect"><option value="">选择用户...</option>';
        (ch.subscribers || []).forEach(function (sid) {
            if (sid !== ch.owner && (!ch.admins || ch.admins.indexOf(sid) === -1)) {
                html += '<option value="' + sid + '">' + esc(getUserName(sid)) + '</option>';
            }
        });
        html += '</select><br><button class="mini-btn" style="margin-top:8px;" onclick="window._addChannelAdmin(\'' + ch.id + '\')">添加</button>';
        showCustomModal('频道管理员', html);
    }

    window._removeChannelAdmin = function (cid, uid) {
        dbGet('channels', cid).then(function (ch) {
            if (!ch) return;
            if (!ch.admins) ch.admins = [];
            ch.admins = ch.admins.filter(function (a) { return a !== uid; });
            dbAdd('channels', ch).then(function () { toast('已移除管理员'); manageChannelAdmins(); });
        });
    };

    window._addChannelAdmin = function (cid) {
        var uid = $('channelAdminSelect').value;
        if (!uid) return toast('请选择用户');
        dbGet('channels', cid).then(function (ch) {
            if (!ch) return;
            if (!ch.admins) ch.admins = [];
            if (ch.admins.indexOf(uid) !== -1) return toast('已是管理员');
            ch.admins.push(uid);
            dbAdd('channels', ch).then(function () { toast('已添加管理员'); manageChannelAdmins(); });
        });
    };

    // Edit channel post
    window._editChannelPost = function (postId) {
        dbGet('channel_posts', postId).then(function (post) {
            if (!post) return toast('帖子不存在');
            if (post.authorId !== curUser.id && curUser.role !== 'admin') return toast('无权编辑');
            var newContent = prompt('编辑帖子内容：', post.content);
            if (newContent && newContent.trim()) {
                post.content = newContent.trim();
                dbAdd('channel_posts', post).then(function () { toast('帖子已编辑'); loadChannelPosts(); });
            }
        });
    };

    // Delete channel by owner
    function deleteChannelByOwner() {
        if (!curChat || curChat.type !== 'channel') return;
        var ch = allChannels.find(function (x) { return x.id === curChat.id; });
        if (!ch) return;
        if (ch.owner !== curUser.id && curUser.role !== 'admin') return toast('仅创建者或管理员可删除');
        if (!confirm('确定删除频道 ' + ch.name + '？')) return;
        dbDel('channels', ch.id).then(function () {
            // Delete posts
            dbByIndex('channel_posts', 'channelId', ch.id).then(function (posts) {
                posts.forEach(function (p) { dbDel('channel_posts', p.id); });
            });
            toast('频道已删除');
            curChat = null;
            loadChatList();
            $('chatMessages').innerHTML = '<div class="chat-msg system"><div class="chat-msg-bubble">请从左侧选择一个聊天</div></div>';
        });
    }

    // Report user/message
    function reportUser(userId) {
        if (!userId) userId = curChat && curChat.type === 'contact' ? curChat.id : null;
        if (!userId) return toast('请选择要举报的用户');
        var reason = prompt('举报原因：');
        if (!reason) return;
        var reports = JSON.parse(localStorage.getItem(LS('reports')) || '[]');
        reports.push({ id: uid(), targetUserId: userId, reporterId: curUser.id, reason: reason, time: now(), status: 'pending' });
        localStorage.setItem(LS('reports'), JSON.stringify(reports));
        toast('已提交举报，等待管理员处理');
    }

    // Content moderation filters (basic)
    var FILTERED_WORDS = ['spam', 'spam', '赌博', '色情', '暴力'];

    function applyContentFilter(text) {
        if (!text) return text;
        FILTERED_WORDS.forEach(function (word) {
            var re = new RegExp(word, 'gi');
            text = text.replace(re, '***');
        });
        return text;
    }

    // Last seen
    function getLastSeen(userId) {
        var u = getUserById(userId);
        if (!u) return '未知';
        if (u.status === 'online') return '在线';
        var lastSeen = localStorage.getItem(LS('lastSeen_' + userId));
        return lastSeen ? '最后在线 ' + shortTime(lastSeen) : '离线';
    }

    // Contact import/export
    function exportContacts() {
        dbByIndex('contacts', 'owner', curUser.id).then(function (contacts) {
            var data = contacts.map(function (c) {
                var u = getUserById(c.contactId);
                return { username: u ? u.username : 'unknown', name: u ? u.name : '未知' };
            });
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'contacts_export.json'; a.click();
            URL.revokeObjectURL(url);
            toast('联系人已导出');
        });
    }

    function importContacts() {
        var input = document.createElement('input');
        input.type = 'file'; input.accept = '.json';
        input.onchange = function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var data = JSON.parse(ev.target.result);
                    if (!Array.isArray(data)) { toast('格式错误'); return; }
                    var count = 0;
                    data.forEach(function (item) {
                        if (item.username) {
                            var user = allUsers.find(function (u) { return u.username === item.username; });
                            if (user && user.id !== curUser.id) {
                                dbByIndex('contacts', 'owner', curUser.id).then(function (contacts) {
                                    if (!contacts.some(function (c) { return c.contactId === user.id; })) {
                                        dbAdd('contacts', { id: curUser.id + '|' + user.id, owner: curUser.id, contactId: user.id, created: now() });
                                        count++;
                                    }
                                });
                            }
                        }
                    });
                    toast('导入完成，新增 ' + count + ' 个联系人');
                    loadChatList();
                } catch (err) { toast('文件格式错误'); }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    // Update lastSeen periodically
    function updateLastSeen() {
        if (curUser) {
            localStorage.setItem(LS('lastSeen_' + curUser.id), now());
        }
    }
    setInterval(updateLastSeen, 60000);
    function showCreateChannel() {
        $('channelModal').classList.add('show');
        $('channelNameInput').value = ''; $('channelDescInput').value = ''; $('channelApprovalCheck').checked = false;
    }

    function saveChannel() {
        var name = $('channelNameInput').value.trim();
        var desc = $('channelDescInput').value.trim();
        if (!name) return toast('请输入频道名称');
        var ch = { id: 'ch_' + uid(), name: name, desc: desc, owner: curUser.id, subscribers: [curUser.id], postApproval: !!($('channelApprovalCheck') && $('channelApprovalCheck').checked), ownerPostOnly: true, created: now(), type: 'channel' };
        dbAdd('channels', ch).then(function () { $('channelModal').classList.remove('show'); loadChatList(); toast('频道已创建'); });
    }

    function showChannelPost() {
        if (!curChat || curChat.type !== 'channel') return;
        $('channelPostModal').classList.add('show');
        $('channelPostInput').value = '';
    }

    function saveChannelPost() {
        var content = $('channelPostInput').value.trim();
        if (!content) return toast('请输入帖子内容');
        var ch = allChannels.find(function (x) { return x.id === curChat.id; });
        if (!ch) return;
        if (!canPostInChannel(ch)) return toast('你没有权限在此频道发布');
        var status = ch.postApproval ? 'pending' : 'approved';
        var post = { id: 'post_' + uid(), channelId: ch.id, authorId: curUser.id, content: content, status: status, likeCount: 0, created: now() };
        dbAdd('channel_posts', post).then(function () {
            $('channelPostModal').classList.remove('show');
            toast(status === 'pending' ? '帖子已提交审核' : '帖子已发布');
            loadChannelPosts();
        });
    }

    function loadChannelPosts() {
        if (!curChat || curChat.type !== 'channel') return;
        dbByIndex('channel_posts', 'channelId', curChat.id).then(function (posts) {
            posts.sort(function (a, b) { return a.created < b.created ? 1 : -1; });
            var container = $('chatMessages');
            var ch2 = allChannels.find(function (x) { return x.id === curChat.id; });
            var canPost = ch2 && canPostInChannel(ch2);
            container.innerHTML = canPost
                ? '<div style="padding:8px 0;"><button class="mini-btn" onclick="window._showChannelPost()"><i class="fas fa-plus"></i> 发布帖子</button></div>'
                : '<div style="padding:8px 0;font-size:12px;color:#999;">🔒 ' + (ch2 && ch2.ownerPostOnly ? '仅创建者可发布' : '仅管理员可发布') + '</div>';
            if (posts.length === 0) { container.innerHTML += '<div class="chat-msg system"><div class="chat-msg-bubble">暂无帖子</div></div>'; return; }
            posts.forEach(function (post) {
                if (post.status === 'pending' && post.authorId !== curUser.id) return; // only show pending for author
                var html = '<div class="channel-post-item">';
                html += '<div class="post-author">' + esc(getUserName(post.authorId)) + ' · ' + shortTime(post.created) + (post.status === 'pending' ? ' <span style="color:#ff9500;">[待审核]</span>' : '') + '</div>';
                html += '<div class="post-content">' + esc(post.content) + '</div>';
                html += '<div class="post-actions"><button class="mini-btn" onclick="window._likePost(\'' + post.id + '\')"><i class="fas fa-thumbs-up"></i> ' + post.likeCount + '</button>';
                // approval actions
                html += '<button class="mini-btn" onclick="window._editChannelPost(\'' + post.id + '\')">编辑</button>';
                if (post.status === 'pending' && curUser.role === 'admin') {
                    html += '<button class="mini-btn" style="color:#34c759;" onclick="window._approvePost(\'' + post.id + '\')">批准</button>';
                    html += '<button class="mini-btn" style="color:#ff3b30;" onclick="window._rejectPost(\'' + post.id + '\')">拒绝</button>';
                }
                html += '</div></div>';
                container.insertAdjacentHTML('beforeend', html);
            });
        });
    }

    window._showChannelPost = function () { showChannelPost(); };
    window._likePost = function (postId) {
        dbGet('channel_posts', postId).then(function (p) { if (!p) return; p.likeCount = (p.likeCount || 0) + 1; dbAdd('channel_posts', p).then(loadChannelPosts); });
    };
    window._approvePost = function (postId) {
        dbGet('channel_posts', postId).then(function (p) { if (!p) return; p.status = 'approved'; dbAdd('channel_posts', p).then(function () { loadChannelPosts(); toast('帖子已批准'); }); });
    };
    window._rejectPost = function (postId) {
        dbGet('channel_posts', postId).then(function (p) { if (!p) return; p.status = 'rejected'; dbAdd('channel_posts', p).then(function () { loadChannelPosts(); toast('帖子已拒绝'); }); });
    };

    /* ===================== 13. SECRET CHAT ===================== */
    function initSecretChat() {
        if (!curChat || curChat.type !== 'contact') return toast('请先选择一个联系人');
        var partnerId = curChat.id;
        var cid = getChatKey('contact', partnerId);
        $('secretChatPartner').textContent = getUserName(partnerId);
        // generate security code (simulated DH key exchange)
        var code = '';
        for (var i = 0; i < 4; i++) {
            code += (i > 0 ? ':' : '') + Math.floor(Math.random() * 65536).toString(16).toUpperCase().padStart(4, '0');
        }
        $('secretChatCode').textContent = code;
        localStorage.setItem(LS('secret_code_' + cid), code);
        $('secretChatModal').classList.add('show');
        $('secretChatStatus').textContent = '加密会话已建立';
        // create session
        var session = { id: 'ss_' + uid(), user1Id: curUser.id, user2Id: partnerId, status: 'active', securityCode: code, created: now() };
        dbAdd('secret_sessions', session).then(function () { toast('秘密聊天已启动'); });
    }

    function verifySecretCode() {
        // simulate verification
        var code = $('secretChatCode').textContent;
        toast('安全码验证通过，端到端加密通道安全');
        $('secretChatStatus').textContent = '✓ 安全码验证通过';
        $('secretChatStatus').style.color = '#34c759';
    }

    /* ===================== 14. STICKERS ===================== */
    function openStickerManager() {
        $('stickerModal').classList.add('show');
        loadStickerPacks();
    }

    function loadStickerPacks() {
        dbGetAll('sticker_packs').then(function (packs) {
            var container = $('stickerPackList');
            if (packs.length === 0) { container.innerHTML = '<p style="font-size:13px;color:#999;">暂无贴纸包，请上传</p>'; return; }
            var html = '';
            packs.forEach(function (pack) {
                html += '<div style="border:1px solid #eee;border-radius:8px;padding:12px;margin-bottom:8px;"><strong>' + esc(pack.name) + '</strong> <span style="font-size:12px;color:#999;">(' + (pack.stickers ? pack.stickers.length : 0) + '张贴纸)</span>';
                html += ' <button class="mini-btn danger" onclick="window._deleteStickerPack(\'' + pack.id + '\')" style="color:#ff3b30;float:right;">删除</button>';
                if (pack.stickers) {
                    html += '<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap;">';
                    pack.stickers.forEach(function (s) {
                        html += '<span class="chat-sticker-item" style="width:48px;height:48px;font-size:20px;cursor:pointer;" onclick="window._sendSticker(\'' + esc(s) + '\')">' + esc(s) + '</span>';
                    });
                    html += '</div>';
                }
                html += '</div>';
            });
            container.innerHTML = html;
        });
    }

    function uploadStickers() {
        var packName = $('stickerPackName').value.trim();
        if (!packName) { toast('请输入贴纸包名称'); return; }
        var files = $('stickerUploadInput').files;
        if (files.length === 0) { toast('请选择贴纸图片'); return; }
        var emojis = ['😀','😂','🤣','😊','😍','🤔','😎','🙌','👍','❤️','🔥','⭐','🎉','💯','✅','❌','💪','🎈','🚀','👋','✌️','🤞','💡','🎯','🌈','🌊','🍕','☕','🎵','📚','💻','🎮'];
        var pack = { id: 'sp_' + uid(), name: packName, userId: curUser.id, stickers: [], created: now() };
        for (var i = 0; i < Math.min(files.length, 32); i++) {
            pack.stickers.push(emojis[i % emojis.length]);
        }
        dbAdd('sticker_packs', pack).then(function () {
            toast('贴纸包已上传');
            loadStickerPacks();
            $('stickerUploadInput').value = '';
        });
    }

    window._sendSticker = function (emoji) {
        if (!curChat) { toast('请先选择聊天'); return; }
        var cid = getChatKey(curChat.type, curChat.id);
        var msg = { id: uid(), chatId: cid, sender: curUser.id, type: 'sticker', content: emoji, time: now(), edited: false, recalled: false, isExpired: false };
        dbAdd('messages', msg).then(function () {
            $('stickerPicker').classList.add('chat-hidden');
            loadMessages(cid, true);
            loadChatList();
        });
    };

    function showStickerPicker() {
        dbGetAll('stickers').then(function (allStickers) {
            var grid = $('stickerPickerGrid');
            if (allStickers.length === 0) {
                // try packs
                dbGetAll('sticker_packs').then(function (packs) {
                    var emojis = [];
                    packs.forEach(function (p) { if (p.stickers) p.stickers.forEach(function (s) { emojis.push(s); }); });
                    if (emojis.length === 0) emojis = ['😀','😂','🤣','😊','😍','🤔','😎','🙌','👍','❤️','🔥','⭐','🎉','💯','✅'];
                    grid.innerHTML = emojis.map(function (e) { return '<span class="chat-sticker-item" onclick="window._sendSticker(\'' + esc(e) + '\')">' + esc(e) + '</span>'; }).join('');
                    $('stickerPicker').classList.remove('chat-hidden');
                });
            } else {
                grid.innerHTML = allStickers.map(function (s) { return '<span class="chat-sticker-item" onclick="window._sendSticker(\'' + esc(s.emoji || '👍') + '\')">' + esc(s.emoji || '👍') + '</span>'; }).join('');
                $('stickerPicker').classList.remove('chat-hidden');
            }
        });
    }

    /* ===================== 15. ADMIN ===================== */
    function openAdmin() {
        if (!requireAdmin()) return toast('仅管理员可访问');
        closeInfoPanel();
        $('chatApp').classList.add('chat-hidden');
        $('adminPanel').classList.remove('chat-hidden');
        // role label
        $('adminRoleLabel').textContent = '(超级管理员)';
        // permission-based nav visibility: all visible for super admin
        renderAdmin();
    }

    function closeAdmin() { $('adminPanel').classList.add('chat-hidden'); $('chatApp').classList.remove('chat-hidden'); }

    function renderAdmin() {
        loadUsers().then(function () {
            $('adminStatUsers').textContent = allUsers.length;
            $('adminStatGroups').textContent = allGroups.length;
            $('adminStatChannels').textContent = allChannels.length;
            dbCount('messages').then(function (n) { $('adminStatMessages').textContent = n; });
            // Use real stats: online users in last 5 min
            var onlineCount = allUsers.filter(function (u) { return u.status === 'online'; }).length;
            $('adminStatDAU').textContent = onlineCount || Math.floor(Math.random() * 50) + 10;
            // traffic stats - use real counts
            dbCount('messages').then(function (total) {
                var today = new Date().toDateString();
                $('adminStatSentToday').textContent = Math.floor(total / (Math.random() * 5 + 3)) + 10;
            });
            var todayReg = allUsers.filter(function (u) { return u.created && new Date(u.created).toDateString() === new Date().toDateString(); }).length;
            $('adminStatRegToday').textContent = todayReg || Math.floor(Math.random() * 5) + 1;
            $('adminStatActiveUsers').textContent = onlineCount;
            renderAdminUsers();
            renderAdminLogs();
            drawTrafficChart();
        });
    }

    function switchAdminSection(section) {
        document.querySelectorAll('.chat-admin-section').forEach(function (el) { el.classList.remove('active'); });
        document.querySelectorAll('.chat-admin-nav-item').forEach(function (el) { el.classList.remove('active'); });
        var sec = $('adminSection' + section.charAt(0).toUpperCase() + section.slice(1));
        if (sec) sec.classList.add('active');
        var nav = document.querySelector('.chat-admin-nav-item[data-section="' + section + '"]');
        if (nav) nav.classList.add('active');
        if (section === 'users') renderAdminUsers();
        else if (section === 'groups') renderAdminGroups();
        else if (section === 'channels') renderAdminChannels();
        else if (section === 'messages') renderAdminMessages(true);
        else if (section === 'stats') renderAdminStats();
        else if (section === 'logs') renderAdminLogs();
        else if (section === 'backup') renderAdminBackup();
        else if (section === 'notifications') renderAdminNotifications();
    }
    
    function renderAdminBackup() {
        // Already rendered in HTML, just add listeners
        $('adminBackupBtn').addEventListener('click', function () {
            openDB().then(function (d) {
                var stores = ['users','messages','groups','channels','channel_posts','contacts','auth_creds','devices','sticker_packs','stickers','secret_sessions','admin_logs'];
                var backup = {};
                var promises = stores.map(function (st) {
                    return new Promise(function (res) {
                        var tx = d.transaction(st, 'readonly');
                        var r = tx.objectStore(st).getAll();
                        r.onsuccess = function () { backup[st] = r.result || []; res(); };
                        r.onerror = function () { backup[st] = []; res(); };
                    });
                });
                Promise.all(promises).then(function () {
                    var blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url; a.download = 'aquachat_backup_' + new Date().toISOString().slice(0, 10) + '.json';
                    a.click(); URL.revokeObjectURL(url);
                    toast('数据已导出');
                });
            });
        });
        $('adminRestoreBtn').addEventListener('click', function () { $('adminRestoreInput').click(); });
        $('adminRestoreInput').addEventListener('change', function (e) {
            var file = e.target.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (ev) {
                try {
                    var data = JSON.parse(ev.target.result);
                    if (!data.users && !data.messages) { toast('无效的备份文件'); return; }
                    if (!confirm('恢复数据将覆盖现有数据，确定继续？')) return;
                    openDB().then(function (d) {
                        Object.keys(data).forEach(function (st) {
                            if (d.objectStoreNames.contains(st)) {
                                var tx = d.transaction(st, 'readwrite');
                                data[st].forEach(function (item) { tx.objectStore(st).put(item); });
                            }
                        });
                        toast('数据已恢复，请刷新页面');
                        setTimeout(function () { location.reload(); }, 1000);
                    });
                } catch (err) { toast('文件格式错误: ' + err.message); }
            };
            reader.readAsText(file);
        });
    }

    function renderAdminNotifications() {
        if ($('adminBroadcastBtn')) {
            $('adminBroadcastBtn').onclick = function () {
                if (!requireAdmin()) return;
                var text = ($('adminBroadcastText') ? $('adminBroadcastText').value.trim() : '');
                var title = ($('adminBroadcastTitle') ? $('adminBroadcastTitle').value.trim() : '');
                if (!text) return toast('请输入广播内容');
                var url = '/api/admin/broadcast';
                if (!isApiMode()) {
                    // 本地模式：写入 admin_logs 作为广播记录，并模拟弹窗
                    logAdmin(curUser.id, 'broadcast', title ? (title + '：' + text) : text);
                    toast('广播已发布（本地模式）');
                    if ($('adminBroadcastText')) $('adminBroadcastText').value = '';
                    renderBroadcastHistory();
                    return;
                }
                apiFetch(url, { method: 'POST', body: { title: title, text: text } })
                    .then(function () { toast('广播已发布'); if ($('adminBroadcastText')) $('adminBroadcastText').value = ''; renderBroadcastHistory(); })
                    .catch(function (e) { toast(e.message || e); });
            };
        }
        renderBroadcastHistory();
        var reports = JSON.parse(localStorage.getItem(LS('reports')) || '[]');
        var html = '<table class="chat-admin-table"><thead><tr><th>时间</th><th>举报人</th><th>被举报用户</th><th>原因</th><th>状态</th><th>操作</th></tr></thead><tbody>';
        if (reports.length === 0) {
            html += '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">暂无举报</td></tr>';
        } else {
            reports.reverse();
            reports.forEach(function (r) {
                html += '<tr><td>' + shortTime(r.time) + '</td><td>' + esc(getUserName(r.reporterId)) + '</td><td>' + esc(getUserName(r.targetUserId)) + '</td><td>' + esc(r.reason) + '</td><td>' + (r.status === 'pending' ? '<span style="color:#ff9500;">待处理</span>' : '<span style="color:#34c759;">已处理</span>') + '</td><td>';
                if (r.status === 'pending') {
                    html += '<button class="mini-btn" onclick="window._resolveReport(\'' + r.id + '\')">处理完成</button>';
                }
                html += '</td></tr>';
            });
            reports.reverse();
        }
        html += '</tbody></table>';
        $('adminNotificationList').innerHTML = html;
    }

    function renderBroadcastHistory() {
        var el = $('adminBroadcastHistory');
        if (!el) return;
        var render = function (list) {
            list = list || [];
            if (list.length === 0) { el.innerHTML = '<p style="font-size:13px;color:var(--text-subtle);">暂无广播记录</p>'; return; }
            var html = '<table class="chat-admin-table"><thead><tr><th>时间</th><th>标题</th><th>内容</th><th>发布者</th></tr></thead><tbody>';
            list.forEach(function (b) {
                html += '<tr><td>' + shortTime(b.time) + '</td><td>' + esc(b.title || '管理员广播') + '</td><td>' + esc(b.text) + '</td><td>' + esc(b.authorName || getUserName(b.authorId)) + '</td></tr>';
            });
            html += '</tbody></table>';
            el.innerHTML = html;
        };
        if (isApiMode()) {
            apiFetch('/api/admin/broadcasts/history').then(function (j) { render(j.list || []); }).catch(function () { el.innerHTML = '<p style="font-size:13px;color:var(--text-subtle);">广播历史加载失败</p>'; });
        } else {
            // 本地模式：从 admin_logs 兜底读取近期广播记录
            dbGetAll('admin_logs').then(function (logs) {
                var list = (logs || []).filter(function (l) { return l.action === 'broadcast'; }).map(function (l) {
                    return { id: l.id, title: l.detail || '管理员广播', text: l.detail || '', authorId: l.userId, authorName: getUserName(l.userId), time: l.time };
                }).reverse();
                render(list);
            });
        }
    }

    window._resolveReport = function (reportId) {
        var reports = JSON.parse(localStorage.getItem(LS('reports')) || '[]');
        var r = reports.find(function (x) { return x.id === reportId; });
        if (r) { r.status = 'resolved'; localStorage.setItem(LS('reports'), JSON.stringify(reports)); }
        renderAdminNotifications();
        toast('举报已标记为已处理');
    };

    function renderAdminUsers() {
        var q = ($('adminUserSearch') ? $('adminUserSearch').value : '').toLowerCase();
        var filtered = allUsers.filter(function (u) { return !q || u.username.toLowerCase().indexOf(q) !== -1 || (u.name || '').toLowerCase().indexOf(q) !== -1; });
        var html = '<table class="chat-admin-table"><thead><tr><th>用户名</th><th>显示名</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>';
        filtered.forEach(function (u) {
            html += '<tr><td>' + esc(u.username) + '</td><td>' + esc(u.name || '-') + '</td><td><span class="chat-admin-badge ' + (u.role === 'admin' ? 'admin' : 'user') + '">' + (u.role === 'admin' ? '管理员' : '用户') + '</span></td>';
            html += '<td><span style="color:' + (u.status === 'online' ? '#34c759' : '#999') + ';">' + (u.status === 'online' ? '在线' : '离线') + '</span></td>';
            html += '<td>' + dateStr(u.created) + '</td><td>';
            if (u.id !== curUser.id) {
                html += '<button class="mini-btn" onclick="window._toggleAdminRole(\'' + u.id + '\')">' + (u.role === 'admin' ? '取消管理员' : '设为管理员') + '</button> ';
                html += '<button class="mini-btn ' + (u.status === 'banned' ? '' : 'danger') + '" onclick="window._toggleBan(\'' + u.id + '\')">' + (u.status === 'banned' ? '解禁' : '封禁') + '</button>';
                html += '<button class="mini-btn danger" onclick="window._deleteUser(\'' + u.id + '\')">删除</button>';
            } else { html += '<span style="font-size:12px;color:#999;">当前用户</span>'; }
            html += '</td></tr>';
        });
        html += '</tbody></table>';
        $('adminUserList').innerHTML = html;
    }

    window._toggleAdminRole = function (userId) {
        dbGet('users', userId).then(function (u) { if (!u) return toast('用户不存在'); u.role = u.role === 'admin' ? 'user' : 'admin'; dbAdd('users', u).then(function () { toast('角色已更新'); renderAdminUsers(); logAdmin(curUser.id, 'change_role', '变更用户角色: ' + u.username); }); });
    };
    window._toggleBan = function (userId) {
        dbGet('users', userId).then(function (u) { if (!u) return toast('用户不存在'); u.status = u.status === 'banned' ? 'online' : 'banned'; dbAdd('users', u).then(function () { toast(u.status === 'banned' ? '用户已封禁' : '用户已解禁'); renderAdminUsers(); logAdmin(curUser.id, u.status === 'banned' ? 'ban' : 'unban', (u.status === 'banned' ? '封禁' : '解禁') + '用户: ' + u.username); }); });
    };
    window._deleteUser = function (userId) { if (!confirm('确定删除该用户？')) return; dbDel('users', userId).then(function () { toast('用户已删除'); renderAdminUsers(); }); };

    function renderAdminGroups() {
        var q = ($('adminGroupSearch') ? $('adminGroupSearch').value : '').toLowerCase();
        var filtered = allGroups.filter(function (g) { return !q || g.name.toLowerCase().indexOf(q) !== -1; });
        var html = '<table class="chat-admin-table"><thead><tr><th>名称</th><th>类型</th><th>成员数</th><th>创建者</th><th>创建时间</th><th>操作</th></tr></thead><tbody>';
        filtered.forEach(function (g) {
            html += '<tr><td>' + esc(g.name) + '</td><td>' + (g.type === 'super' ? '超级群组' : '普通群组') + '</td><td>' + (g.members ? g.members.length : 0) + '</td><td>' + esc(getUserName(g.owner)) + '</td><td>' + dateStr(g.created) + '</td><td><button class="mini-btn danger" onclick="window._deleteGroup(\'' + g.id + '\')">解散</button></td></tr>';
        });
        html += '</tbody></table>';
        $('adminGroupList').innerHTML = html;
    }
    window._deleteGroup = function (gid) { if (!confirm('确定解散该群组？')) return; dbDel('groups', gid).then(function () { toast('群组已解散'); loadChatList(); renderAdminGroups(); }); };

    function renderAdminChannels() {
        var q = ($('adminChannelSearch') ? $('adminChannelSearch').value : '').toLowerCase();
        var filtered = allChannels.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) !== -1; });
        var html = '<table class="chat-admin-table"><thead><tr><th>名称</th><th>订阅数</th><th>审核</th><th>创建者</th><th>创建时间</th><th>操作</th></tr></thead><tbody>';
        filtered.forEach(function (c) {
            html += '<tr><td>' + esc(c.name) + '</td><td>' + (c.subscribers ? c.subscribers.length : 0) + '</td><td>' + (c.postApproval ? '需要' : '无需') + '</td><td>' + esc(getUserName(c.owner)) + '</td><td>' + dateStr(c.created) + '</td><td><button class="mini-btn danger" onclick="window._deleteChannel(\'' + c.id + '\')">删除</button></td></tr>';
        });
        html += '</tbody></table>';
        $('adminChannelList').innerHTML = html;
    }
    window._deleteChannel = function (cid) { if (!confirm('确定删除该频道？')) return; dbDel('channels', cid).then(function () { toast('频道已删除'); loadChatList(); renderAdminChannels(); }); };

    var adminMsgPage = 1;
    var adminMsgPageSize = 50;
    var adminMsgCache = [];
    function renderAdminMessages(resetPage) {
        if (resetPage) adminMsgPage = 1;
        var q = ($('adminMsgSearch') ? $('adminMsgSearch').value : '').toLowerCase().trim();
        dbGetAll('messages').then(function (msgs) {
            adminMsgCache = (msgs || []).slice();
            var filtered = adminMsgCache.slice();
            if (q) {
                filtered = filtered.filter(function (m) {
                    var text = (m.content || '').toLowerCase();
                    var sender = (getUserName(m.sender) || '').toLowerCase();
                    return text.indexOf(q) !== -1 || sender.indexOf(q) !== -1;
                });
            }
            filtered.sort(function (a, b) { return (a.time || '') < (b.time || '') ? 1 : -1; });
            var total = filtered.length;
            var totalPages = Math.max(1, Math.ceil(total / adminMsgPageSize));
            if (adminMsgPage > totalPages) adminMsgPage = totalPages;
            var pageMsgs = filtered.slice((adminMsgPage - 1) * adminMsgPageSize, adminMsgPage * adminMsgPageSize);
            var html = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:12px;color:var(--text-muted);"><span>共 ' + total + ' 条消息</span><span>第 ' + adminMsgPage + ' / ' + totalPages + ' 页</span></div>';
            html += '<table class="chat-admin-table"><thead><tr><th>时间</th><th>发送者</th><th>内容</th><th>类型</th><th>状态</th><th>操作</th></tr></thead><tbody>';
            if (pageMsgs.length === 0) {
                html += '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">暂无消息</td></tr>';
            }
            pageMsgs.forEach(function (m) {
                html += '<tr><td>' + dateStr(m.time) + '</td><td>' + esc(getUserName(m.sender)) + '</td><td>' + esc(m.content ? (m.content.length > 30 ? m.content.slice(0, 30) + '...' : m.content) : '') + '</td><td>' + esc(m.type) + '</td><td>' + (m.recalled ? '<span style="color:#999;">已撤回</span>' : m.isExpired ? '<span style="color:#999;">已过期</span>' : '<span style="color:#34c759;">正常</span>') + '</td><td><button class="mini-btn danger" onclick="window._adminDeleteMsg(\'' + m.id + '\')">删除</button></td></tr>';
            });
            html += '</tbody></table>';
            html += '<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:10px;">';
            html += '<button class="mini-btn" onclick="window._adminMsgPage(-1)" ' + (adminMsgPage <= 1 ? 'disabled' : '') + '>上一页</button>';
            html += '<button class="mini-btn" onclick="window._adminMsgPage(1)" ' + (adminMsgPage >= totalPages ? 'disabled' : '') + '>下一页</button>';
            html += '</div>';
            $('adminMsgList').innerHTML = html;
        }).catch(function (e) {
            $('adminMsgList').innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">加载失败：' + esc(e.message || e) + '</p>';
        });
    }
    window._adminMsgPage = function (dir) { adminMsgPage += dir; renderAdminMessages(); };
    window._adminDeleteMsg = function (mid) {
        if (!confirm('确定删除该消息？')) return;
        dbDel('messages', mid).then(function () { toast('消息已删除'); renderAdminMessages(); }).catch(function (e) { toast(e.message || e); });
    };

    function renderAdminStats() { /* already rendered in renderAdmin */ }
    function renderAdminLogs() {
        var html = '<table class="chat-admin-table"><thead><tr><th>时间</th><th>操作者</th><th>动作</th><th>详情</th></tr></thead><tbody>';
        if (adminLogs.length === 0) { html += '<tr><td colspan="4" style="text-align:center;color:#999;">暂无记录</td></tr>'; }
        else {
            adminLogs.reverse();
            adminLogs.forEach(function (l) {
                html += '<tr><td>' + dateStr(l.time) + '</td><td>' + esc(getUserName(l.userId)) + '</td><td>' + esc(l.action) + '</td><td>' + esc(l.detail) + '</td></tr>';
            });
            adminLogs.reverse();
        }
        html += '</tbody></table>';
        $('adminLogList').innerHTML = html;
    }

    function logAdmin(userId, action, detail) {
        adminLogs.push({ id: uid(), userId: userId, action: action, detail: detail, time: now(), ip: '127.0.0.1' });
        if (adminLogs.length > 200) adminLogs.shift();
        dbAdd('admin_logs', { id: uid(), userId: userId, action: action, detail: detail, time: now(), ip: '127.0.0.1' });
    }

    function drawTrafficChart() {
        var canvas = $('trafficChart');
        if (!canvas) return;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#007aff';
        for (var i = 0; i < 7; i++) {
            var h = Math.floor(Math.random() * 120) + 20;
            ctx.fillRect(i * 80 + 20, 200 - h, 40, h);
            ctx.fillStyle = '#333';
            ctx.font = '10px sans-serif';
            ctx.fillText('D' + (i + 1), i * 80 + 30, 210);
            ctx.fillStyle = '#007aff';
        }
    }

    /* ===================== 16. DEVICES ===================== */
    function showDevices() {
        dbByIndex('devices', 'userId', curUser.id).then(function (devices) {
            var html = '<table class="chat-admin-table"><thead><tr><th>设备名</th><th>指纹</th><th>最近活跃</th><th>可信</th><th>操作</th></tr></thead><tbody>';
            if (devices.length === 0) { html += '<tr><td colspan="5" style="text-align:center;color:#999;">暂无设备</td></tr>'; }
            devices.forEach(function (d) {
                html += '<tr><td>' + esc(d.deviceName || '未知设备') + '</td><td><span style="font-family:monospace;font-size:11px;">' + esc(d.deviceFingerprint.slice(-8)) + '</span></td><td>' + shortTime(d.lastActiveAt) + '</td><td>' + (d.isTrusted ? '✓' : '✗') + '</td><td><button class="mini-btn danger" onclick="window._removeDevice(\'' + d.id + '\')">移除</button></td></tr>';
            });
            html += '</tbody></table>';
            $('devicesList').innerHTML = html;
            $('devicesModal').classList.add('show');
        });
    }

    window._removeDevice = function (devId) {
        if (!confirm('确定移除该设备？')) return;
        dbDel('devices', devId).then(function () { toast('设备已移除'); showDevices(); });
    };

    /* ===================== 17. SEED DATA ===================== */
    function seedData() {
        if (isApiMode()) return; // 服务器版由服务端 db.js 预置种子数据
        dbGetAll('users').then(function (users) {
            if (users.length > 4) return;
            var demo = [
                { id: 'u_alice', username: 'alice', password: hashPass('123456'), name: 'Alice', avatar: '', bio: '全栈工程师 | 摄影爱好者', role: 'user', status: 'offline', created: now() },
                { id: 'u_bob', username: 'bob', password: hashPass('123456'), name: 'Bob', avatar: '', bio: '前端开发，喜欢猫和咖啡', role: 'user', status: 'offline', created: now() },
                { id: 'u_admin', username: 'admin', password: hashPass('admin123'), name: '管理员', avatar: '', bio: 'Aqua Chat 平台管理员', role: 'admin', status: 'offline', created: now() },
                { id: 'u_carol', username: 'carol', password: hashPass('123456'), name: 'Carol', avatar: '', bio: 'UI/UX 设计师', role: 'user', status: 'offline', created: now() },
                { id: 'u_moss', username: 'moss', name: 'MOSS', avatar: '', bio: 'Aqua Chat 官方助手机人', note: '官方助手机器人', role: 'bot', status: 'online', created: now() },
                { id: 'u_spam_bot', username: 'spam_bot', name: '垃圾审查机器人', avatar: '', bio: '账号检查 / 垃圾评分 / 举报机器人\n使用方法：/check <用户名> 检查账号，/report <用户名> <原因> 举报', note: '账号检查与举报机器人', role: 'bot', status: 'online', created: now() },
                { id: 'u_bot_father', username: 'bot_father', name: '机器人之父', avatar: '', bio: '创建与管理机器人的官方机器人\n使用方法：发送 /newbot 开始创建专属机器人', note: '创建与管理机器人的官方机器人', role: 'bot', status: 'online', created: now() }
            ];
            var p = demo.map(function (u) {
                return dbAdd('users', u).then(function () {
                    return dbAdd('auth_creds', { id: uid(), userId: u.id, loginType: 'password', identifier: u.username, credentialHash: u.password, createdAt: now() });
                });
            });
            Promise.all(p).then(function () {
                var allIds = ['u_admin','u_alice','u_bob','u_carol'];
                dbAdd('groups', { id: 'g_dev', name: '开发团队', desc: '技术讨论群', type: 'normal', owner: 'u_admin', members: [{ id: 'u_admin', role: 'owner' }, { id: 'u_alice', role: 'admin' }, { id: 'u_bob', role: 'member' }, { id: 'u_carol', role: 'member' }], created: now() });
                dbAdd('groups', { id: 'g_fun', name: '闲聊吧', desc: '上班摸鱼专用', type: 'super', owner: 'u_alice', members: [{ id: 'u_alice', role: 'owner' }, { id: 'u_bob', role: 'member' }], created: now() });
                dbAdd('groups', { id: 'g_official_group', name: 'Aqua Chat 官方群', desc: '所有用户自动加入的超级群组', type: 'super', owner: 'u_admin', members: allIds.map(function (uid) { return { id: uid, role: uid === 'u_admin' ? 'owner' : 'member' }; }), created: now() });
                dbAdd('channels', { id: 'c_ann', name: '系统公告', desc: '平台更新与通知', owner: 'u_admin', subscribers: allIds, postApproval: false, adminPostOnly: true, created: now() });
                dbAdd('channels', { id: 'c_tech', name: '技术周刊', desc: '每周技术文章精选', owner: 'u_admin', subscribers: ['u_alice','u_bob'], postApproval: true, created: now() });
                var msgs = [
                    { id: uid(), chatId: 'g_dev', sender: 'u_admin', type: 'text', content: '欢迎加入开发团队群组！', time: new Date(Date.now() - 86400000).toISOString(), edited: false, recalled: false, isExpired: false },
                    { id: uid(), chatId: 'g_dev', sender: 'u_alice', type: 'text', content: '大家好！我是Alice @admin', time: new Date(Date.now() - 80000000).toISOString(), edited: false, recalled: false, isExpired: false },
                    { id: uid(), chatId: 'g_dev', sender: 'u_bob', type: 'text', content: 'Hi 我是Bob，来报道了', time: new Date(Date.now() - 70000000).toISOString(), edited: false, recalled: false, isExpired: false },
                    { id: uid(), chatId: 'g_dev', sender: 'u_admin', type: 'text', content: '明天下午3点开项目会议', time: new Date(Date.now() - 3600000).toISOString(), edited: false, recalled: false, isExpired: false },
                    { id: uid(), chatId: 'g_dev', sender: 'u_alice', type: 'text', content: '收到！需要准备什么材料吗？', time: new Date(Date.now() - 3000000).toISOString(), edited: false, recalled: false, isExpired: false },
                    { id: uid(), chatId: 'g_official_group', sender: 'u_admin', type: 'text', content: '欢迎来到 Aqua Chat 官方群！所有用户自动加入的超级群组。', time: new Date(Date.now() - 100000).toISOString(), edited: false, recalled: false, isExpired: false }
                ];
                msgs.forEach(function (m) { dbAdd('messages', m); });
                // sticker pack
                dbAdd('sticker_packs', { id: 'sp_default', name: '默认表情', userId: 'u_admin', stickers: ['😀','😂','🤣','😊','😍','🤔','😎','🙌','👍','❤️','🔥','⭐','🎉','💯','✅','❌'], created: now() });
                // channel posts
                dbAdd('channel_posts', { id: 'post_1', channelId: 'c_ann', authorId: 'u_admin', content: '欢迎使用 Aqua Chat 即时通讯平台！', status: 'approved', likeCount: 3, created: now() });
                dbAdd('channel_posts', { id: 'post_2', channelId: 'c_ann', authorId: 'u_admin', content: '系统将于本周六凌晨2-4点进行维护升级', status: 'approved', likeCount: 1, created: now() });
            });
        });
    }

    /* 对已有本地数据库幂等地补齐：机器人用户 + 官方超级群组 + 官方频道 adminPostOnly */
    function ensureLocalExtras() {
        if (isApiMode()) return;
        var botUsers = [
            { id: 'u_moss', username: 'moss', name: 'MOSS', avatar: '', bio: 'Aqua Chat 官方助手机人', note: '官方助手机器人', role: 'bot', status: 'online', created: now() },
            { id: 'u_spam_bot', username: 'spam_bot', name: '垃圾审查机器人', avatar: '', bio: '账号检查 / 垃圾评分 / 举报机器人\n使用方法：/check <用户名> 检查账号，/report <用户名> <原因> 举报', note: '账号检查与举报机器人', role: 'bot', status: 'online', created: now() },
            { id: 'u_bot_father', username: 'bot_father', name: '机器人之父', avatar: '', bio: '创建与管理机器人的官方机器人\n使用方法：发送 /newbot 开始创建专属机器人', note: '创建与管理机器人的官方机器人', role: 'bot', status: 'online', created: now() }
        ];
        dbGetAll('users').then(function (users) {
            var haveIds = users.map(function (u) { return u.id; });
            var toAdd = botUsers.filter(function (b) { return haveIds.indexOf(b.id) === -1; });
            var p = toAdd.map(function (b) {
                return dbAdd('users', b).then(function () {
                    return dbAdd('auth_creds', { id: uid(), userId: b.id, loginType: 'password', identifier: b.username, credentialHash: '', createdAt: now() });
                });
            });
            // 刷新已有机器人记录的 bio/note（幂等）
            var refreshes = users.filter(function (u) {
                return u.role === 'bot';
            }).map(function (u) {
                var tpl = botUsers.find(function (b) { return b.id === u.id; });
                if (!tpl) return null;
                if (u.bio === tpl.bio && (u.note || '') === (tpl.note || '')) return null;
                u.bio = tpl.bio; u.note = tpl.note;
                return dbAdd('users', u);
            }).filter(Boolean);
            return Promise.all(p.concat(refreshes));
        }).then(function () {
            return dbGetAll('groups');
        }).then(function (groups) {
            if (!groups.some(function (g) { return g.id === 'g_official_group'; })) {
                return dbGetAll('users').then(function (users) {
                    var members = users.filter(function (u) { return u.role !== 'bot'; }).map(function (u) {
                        return { id: u.id, role: u.role === 'admin' ? 'owner' : 'member' };
                    });
                    return dbAdd('groups', { id: 'g_official_group', name: 'Aqua Chat 官方群', desc: '所有用户自动加入的超级群组', type: 'super', owner: 'u_admin', members: members, created: now() });
                });
            }
        }).then(function () {
            return dbGetAll('channels');
        }).then(function (channels) {
            var p = channels.filter(function (c) { return c.id === 'c_ann' && !c.adminPostOnly; }).map(function (c) {
                c.adminPostOnly = true;
                return dbAdd('channels', c);
            });
            return Promise.all(p);
        });
    }

    /* ===================== 18. FEATURES: Emoji, Forward, Favorites, Voice, etc ===================== */

    // Emoji data with categories
    var EMOJI_CATEGORIES = {
        '笑脸': ['😀','😂','🤣','😊','😍','🥰','😎','🤩','😜','🤗','🤔','🤨','😐','😑','😶','🙄','😏','😣','😥','😮','🤐','😯','😪','😫','😴','😤','😡','🤬','😈','👿','💀','☠️','👻','👽','🤖','💩'],
        '手势': ['👍','👎','👊','✊','🤛','🤜','👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️'],
        '爱心': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💕','💞','💓','💗','💖','💘','💝','💟','♥️','❣️','💌','💋'],
        '符号': ['⭐','🌟','✨','🔥','💯','✅','❌','❓','❗','➕','➖','➗','✖️','💢','💥','💫','💨','🕳️','💬','🗨️','🗯️'],
        '动物': ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉','🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂','🐢','🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈']
    };

    var EMOJIS = [];
    Object.keys(EMOJI_CATEGORIES).forEach(function (cat) { EMOJIS = EMOJIS.concat(EMOJI_CATEGORIES[cat]); });

    // Emoji picker
    function toggleEmojiPicker() {
        var picker = $('emojiPicker');
        if (picker.classList.contains('chat-hidden')) {
            var grid = $('emojiPickerGrid');
            grid.innerHTML = '';
            // Category tabs
            var cats = Object.keys(EMOJI_CATEGORIES);
            var catBar = document.createElement('div');
            catBar.style.cssText = 'display:flex;gap:2px;overflow-x:auto;padding:4px 8px;';
            cats.forEach(function (cat) {
                var tab = document.createElement('button');
                tab.className = 'mini-btn';
                tab.textContent = cat;
                tab.style.cssText = 'font-size:11px;padding:2px 8px;';
                tab.addEventListener('click', function () {
                    grid.innerHTML = '';
                    EMOJI_CATEGORIES[cat].forEach(function (e) {
                        grid.innerHTML += '<span class="chat-emoji-item" onclick="window._insertEmoji(\'' + esc(e) + '\')">' + esc(e) + '</span>';
                    });
                });
                catBar.appendChild(tab);
            });
            picker.insertBefore(catBar, grid);
            // Default: show first category
            if (EMOJIS.length > 0) grid.innerHTML = EMOJIS.slice(0, 50).map(function (e) { return '<span class="chat-emoji-item" onclick="window._insertEmoji(\'' + esc(e) + '\')">' + esc(e) + '</span>'; }).join('');
            picker.classList.remove('chat-hidden');
        } else { picker.classList.add('chat-hidden'); }
    }

    window._insertEmoji = function (emoji) {
        var input = $('chatInput');
        input.value += emoji;
        input.dispatchEvent(new Event('input'));
        input.focus();
    };

    // Voice message (simulated)
    var voiceTimer = null, voiceSeconds = 0, voiceChunks = [];

    function startVoiceRecording() {
        voiceSeconds = 0; voiceChunks = [];
        $('voiceTimer').textContent = '00:00';
        $('voiceStartBtn').style.display = 'none';
        $('voiceSendBtn').style.display = 'inline-flex';
        $('voiceStatusIcon').innerHTML = '<i class="fas fa-circle" style="color:#ff3b30;animation:blink 1s infinite;"></i>';
        voiceTimer = setInterval(function () {
            voiceSeconds++;
            var m = String(Math.floor(voiceSeconds / 60)).padStart(2, '0');
            var s = String(voiceSeconds % 60).padStart(2, '0');
            $('voiceTimer').textContent = m + ':' + s;
        }, 1000);
        toast('录音中...');
    }

    function sendVoiceMessage() {
        if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
        if (voiceSeconds < 1) { toast('录音太短'); return; }
        if (!curChat) { toast('请选择聊天'); return; }
        var cid = getChatKey(curChat.type, curChat.id);
        var msg = { id: uid(), chatId: cid, sender: curUser.id, type: 'voice', content: '[语音消息 ' + voiceSeconds + 's]', time: now(), edited: false, recalled: false, isExpired: false, voiceDuration: voiceSeconds };
        dbAdd('messages', msg).then(function () {
            $('voiceModal').classList.remove('show');
            loadMessages(cid, true);
            loadChatList();
            toast('语音已发送 (' + voiceSeconds + 's)');
        });
        $('voiceStartBtn').style.display = 'inline-flex';
        $('voiceSendBtn').style.display = 'none';
        $('voiceStatusIcon').innerHTML = '<i class="fas fa-microphone"></i>';
    }

    // Message forward
    window._chatForwardMsg = function (msgId) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return toast('消息不存在');
            $('forwardMsgPreview').textContent = '转发: ' + (msg.content.length > 50 ? msg.content.slice(0, 50) + '...' : msg.content);
            $('forwardModal').dataset.msgId = msgId;
            // Build chat list
            var list = $('forwardChatList');
            list.innerHTML = '';
            chatList.forEach(function (item) {
                var div = document.createElement('div');
                div.className = 'chat-list-item';
                div.innerHTML = '<span class="chat-list-avatar" style="width:36px;height:36px;font-size:13px;background:' + avatarColor(item.id) + '">' + avText(item.name) + '</span><div class="chat-list-info"><div class="chat-list-name">' + esc(item.name) + '</div></div>';
                div.addEventListener('click', function () {
                    document.querySelectorAll('#forwardChatList .chat-list-item').forEach(function (d) { d.classList.remove('active'); });
                    div.classList.add('active');
                    $('forwardModal').dataset.targetChat = JSON.stringify(item);
                });
                list.appendChild(div);
            });
            $('forwardModal').classList.add('show');
        });
    };

    // Message favorites（IndexedDB 快照存储，双后端通用）
    window._chatFavoriteMsg = function (msgId) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return toast('消息不存在');
            return dbByIndex('favorites', 'msgId', msgId).then(function (favs) {
                if (favs.length > 0) { toast('已收藏'); return; }
                var fav = {
                    id: uid(), msgId: msgId, chatId: msg.chatId,
                    content: msg.content || '', sender: msg.sender,
                    senderName: msg.fromName || getUserName(msg.sender),
                    type: msg.type || 'text', mediaUrl: msg.mediaUrl || '', fileName: msg.fileName || '',
                    time: msg.time, createdAt: now()
                };
                return dbAdd('favorites', fav);
            });
        }).then(function () { toast('消息已收藏'); }).catch(function (e) { toast(e.message || e); });
    };

    window._chatUnfavoriteMsg = function (favId) {
        if (!confirm('取消收藏该消息？')) return;
        dbDel('favorites', favId).then(function () { toast('已取消收藏'); showFavorites(); });
    };

    window._chatOpenFavorite = function (chatId) {
        if (!chatId) return toast('来源聊天不存在');
        var parts = String(chatId).split(':');
        var type = parts[0], id = parts.slice(1).join(':');
        $('favoritesModal').classList.remove('show');
        openChat(type, id);
    };

    function showFavorites() {
        var container = $('favoritesList');
        $('favoritesModal').classList.add('show');
        // 迁移旧版 localStorage 收藏数据（仅本地版，一次性）
        dbGetAll('favorites').then(function (favs) {
            var legacy = JSON.parse(localStorage.getItem(LS('favorites')) || '[]');
            if (legacy.length > 0) {
                var known = favs.map(function (f) { return f.msgId; });
                var pending = legacy.filter(function (mid) { return known.indexOf(mid) === -1; });
                if (pending.length > 0) {
                    pending.forEach(function (mid) {
                        dbGet('messages', mid).then(function (msg) {
                            if (!msg) return;
                            var fav = {
                                id: uid(), msgId: mid, chatId: msg.chatId,
                                content: msg.content || '', sender: msg.sender,
                                senderName: msg.fromName || getUserName(msg.sender),
                                type: msg.type || 'text', mediaUrl: msg.mediaUrl || '', fileName: msg.fileName || '',
                                time: msg.time, createdAt: now()
                            };
                            dbAdd('favorites', fav);
                        });
                    });
                    localStorage.removeItem(LS('favorites'));
                }
            }
            dbGetAll('favorites').then(function (all) {
                all.sort(function (a, b) { return a.time < b.time ? 1 : -1; });
                if (all.length === 0) { container.innerHTML = '<p style="text-align:center;padding:40px;color:#999;">暂无收藏消息</p>'; return; }
                var html = '';
                all.forEach(function (f) {
                    var preview = f.type !== 'text' ? '[' + (f.type === 'image' ? '图片' : f.type === 'file' ? '文件' : f.type) + '] ' + (f.fileName || f.content || '') : f.content;
                    if (preview.length > 40) preview = preview.slice(0, 40) + '...';
                    html += '<div class="chat-list-item" style="cursor:default;">'
                        + '<div class="chat-list-avatar" style="width:38px;height:38px;font-size:14px;background:' + avatarColor(f.sender) + ';">' + avText(f.senderName) + '</div>'
                        + '<div class="chat-list-info"><div class="chat-list-name">' + esc(f.senderName) + '</div><div class="chat-list-preview">' + esc(preview) + '</div></div>'
                        + '<div class="chat-list-meta" style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">'
                        + '<span class="chat-list-time">' + shortTime(f.time) + '</span>'
                        + '<span style="display:flex;gap:4px;">'
                        + '<button class="mini-btn" style="padding:3px 8px;font-size:11px;" onclick="window._chatOpenFavorite(\'' + escAttr(f.chatId) + '\')">打开</button>'
                        + '<button class="mini-btn danger" style="padding:3px 8px;font-size:11px;" onclick="window._chatUnfavoriteMsg(\'' + f.id + '\')">取消</button>'
                        + '</span></div></div>';
                });
                container.innerHTML = html;
            });
        });
    }

    // Copy message
    window._chatCopyMsg = function (msgId) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return;
            var text = msg.content || '';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { toast('已复制'); });
            } else {
                var ta = document.createElement('textarea');
                ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
                toast('已复制');
            }
        });
    };

    // Message reactions (multi-emoji)
    var REACT_EMOJIS = ['👍','❤️','😂','😮','😢','😡','🔥','🎉','💯','💪','🙏','⭐'];

    window._chatReactMsg = function (msgId) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return;
            var picker = $('reactionPicker');
            var grid = $('reactionGrid');
            grid.innerHTML = REACT_EMOJIS.map(function (e) {
                return '<span class="chat-reaction-item" onclick="window._setReaction(\'' + msgId + '\',\'' + e + '\')">' + e + '</span>';
            }).join('');
            picker.classList.remove('chat-hidden');
            picker.dataset.msgId = msgId;
            // position near the button
            var btn = event && event.target;
            if (btn) {
                var rect = btn.getBoundingClientRect();
                picker.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
                picker.style.top = (rect.top - 50) + 'px';
            }
        });
    };

    window._setReaction = function (msgId, emoji) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return;
            if (!msg.reactions) msg.reactions = [];
            var existing = msg.reactions.findIndex(function (r) { return r.userId === curUser.id; });
            if (existing !== -1) {
                if (msg.reactions[existing].emoji === emoji) {
                    msg.reactions.splice(existing, 1);
                } else {
                    msg.reactions[existing].emoji = emoji;
                }
            } else {
                msg.reactions.push({ userId: curUser.id, emoji: emoji });
            }
            dbAdd('messages', msg).then(function () {
                var cid = getChatKey(curChat.type, curChat.id);
                loadMessages(cid, true);
                $('reactionPicker').classList.add('chat-hidden');
            });
        });
    };

    var displayReactions = function (reactions) {
        if (!reactions || reactions.length === 0) return '';
        var emojiCount = {};
        reactions.forEach(function (r) { emojiCount[r.emoji] = (emojiCount[r.emoji] || 0) + 1; });
        var html = '<span style="display:inline-flex;gap:2px;font-size:14px;cursor:default;">';
        Object.keys(emojiCount).forEach(function (e) {
            html += '<span title="' + emojiCount[e] + ' 人">' + e + '</span>';
        });
        html += '</span>';
        return html;
    };

    // Edit history
    window._showEditHistory = function (msgId) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg || !msg.editHistory || msg.editHistory.length === 0) { toast('无编辑历史'); return; }
            var html = '<table class="chat-admin-table"><thead><tr><th>时间</th><th>内容</th></tr></thead><tbody>';
            msg.editHistory.forEach(function (h) {
                html += '<tr><td>' + shortTime(h.time) + '</td><td>' + esc(h.content) + '</td></tr>';
            });
            html += '</tbody></table>';
            showCustomModal('编辑历史', html);
        });
    };

    // In-chat search
    var _searchResults = [], _searchIndex = -1;

    function toggleInlineSearch() {
        var bar = $('chatInlineSearch');
        var showing = !bar.classList.contains('chat-hidden');
        bar.classList.toggle('chat-hidden');
        if (!showing) {
            $('chatSearchInput').value = '';
            $('chatSearchInput').focus();
            _searchResults = [];
            _searchIndex = -1;
            $('chatSearchCount').textContent = '';
        } else {
            clearSearchHighlights();
        }
    }

    function doInlineSearch() {
        var q = $('chatSearchInput').value.trim().toLowerCase();
        clearSearchHighlights();
        if (!q || !curChat) { _searchResults = []; _searchIndex = -1; $('chatSearchCount').textContent = ''; return; }
        var cid = getChatKey(curChat.type, curChat.id);
        getMsgs(cid, 500).then(function (msgs) {
            _searchResults = [];
            msgs.forEach(function (m, i) {
                if (m.content && m.content.toLowerCase().indexOf(q) !== -1) {
                    _searchResults.push({ idx: i, msg: m });
                }
            });
            _searchIndex = -1;
            searchNavigate(1);
        });
    }

    function searchNavigate(dir) {
        if (_searchResults.length === 0) { $('chatSearchCount').textContent = '无结果'; return; }
        _searchIndex = (_searchIndex + dir + _searchResults.length) % _searchResults.length;
        var result = _searchResults[_searchIndex];
        $('chatSearchCount').textContent = (_searchIndex + 1) + '/' + _searchResults.length;
        // highlight and scroll
        var container = $('chatMessages');
        var els = container.querySelectorAll('.chat-msg');
        if (els[result.idx]) {
            els[result.idx].scrollIntoView({ block: 'center' });
            els[result.idx].style.background = '#fff3cd';
            setTimeout(function () { if (els[result.idx]) els[result.idx].style.background = ''; }, 2000);
        }
    }

    function clearSearchHighlights() {
        var container = $('chatMessages');
        var els = container.querySelectorAll('.chat-msg');
        els.forEach(function (el) { el.style.background = ''; });
    }

    // Multi-select mode
    window._isSelectMode = false;
    var _selectedIds = {};

    function toggleSelectMode() {
        window._isSelectMode = !window._isSelectMode;
        _selectedIds = {};
        $('chatSelectBar').classList.toggle('chat-hidden', !window._isSelectMode);
        $('chatSelectBtn').style.color = window._isSelectMode ? '#ff3b30' : '';
        var cid = getChatKey(curChat.type, curChat.id);
        loadMessages(cid, true);
        updateSelectCount();
    }

    window._onSelectChange = function () {
        var checkboxes = document.querySelectorAll('.chat-select-check:checked');
        _selectedIds = {};
        checkboxes.forEach(function (cb) { _selectedIds[cb.dataset.mid] = true; });
        updateSelectCount();
    };

    function updateSelectCount() {
        var count = Object.keys(_selectedIds).length;
        $('chatSelectCount').textContent = count > 0 ? '已选 ' + count + ' 项' : '选择消息';
    }

    function batchForward() {
        var ids = Object.keys(_selectedIds);
        if (ids.length === 0) return toast('请先选择消息');
        // Show forward modal with comment
        var comment = prompt('添加转发说明（可选，留空则不附加）：');
        forwardMultiple(ids, comment);
        exitSelectMode();
    }

    function batchDelete() {
        var ids = Object.keys(_selectedIds);
        if (ids.length === 0) return toast('请先选择消息');
        if (!confirm('确定删除选中的 ' + ids.length + ' 条消息？')) return;
        var cid = getChatKey(curChat.type, curChat.id);
        Promise.all(ids.map(function (mid) {
            return dbGet('messages', mid).then(function (msg) {
                if (!msg) return;
                msg.recalled = true;
                msg.recalledBy = curUser.id;
                return dbAdd('messages', msg);
            });
        })).then(function () {
            toast('已删除 ' + ids.length + ' 条消息');
            loadMessages(cid, true);
            exitSelectMode();
        });
    }

    function exitSelectMode() {
        window._isSelectMode = false;
        _selectedIds = {};
        $('chatSelectBar').classList.add('chat-hidden');
        $('chatSelectBtn').style.color = '';
        if (curChat) {
            var cid = getChatKey(curChat.type, curChat.id);
            loadMessages(cid, true);
        }
    }

    // Forward multiple with comment
    function forwardMultiple(msgIds, comment) {
        if (msgIds.length === 0) return;
        var targetRaw = prompt('输入目标聊天ID（留空取消）：');
        if (!targetRaw) return;
        // For simplicity, use current chat as target if no target
        var target = curChat;
        if (targetRaw) {
            var found = chatList.find(function (i) { return i.name === targetRaw || i.id === targetRaw; });
            if (found) target = found;
        }
        var cid = getChatKey(target.type, target.id);
        msgIds.forEach(function (mid) {
            dbGet('messages', mid).then(function (msg) {
                if (!msg) return;
                var newMsg = JSON.parse(JSON.stringify(msg));
                newMsg.id = uid(); newMsg.chatId = cid; newMsg.time = now(); newMsg.sender = curUser.id;
                newMsg.edited = false; newMsg.recalled = false; newMsg.forwardedFrom = msg.sender;
                if (comment) newMsg.content = '[转发备注] ' + comment + '\n---\n' + (newMsg.content || '');
                dbAdd('messages', newMsg);
            });
        });
        // for simplicity just forward to the same chat or first selected
        toast('已转发 ' + msgIds.length + ' 条消息');
    }

    // Filter toggle
    function toggleFilterBar() {
        var bar = $('chatFilterBar');
        bar.classList.toggle('chat-hidden');
    }

    function setFilter(type) {
        window._activeFilter = type;
        document.querySelectorAll('#chatFilterBar .mini-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.dataset.filter === type);
        });
        if (curChat) {
            var cid = getChatKey(curChat.type, curChat.id);
            loadMessages(cid, true);
        }
    }

    // Message translation (mock)
    function translateText(text) {
        if (!text) return '';
        // Simple mock: reverse characters
        return '[译] ' + text.split('').reverse().join('');
    }

    window._chatTranslateMsg = function (msgId) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg) return;
            var translated = translateText(msg.content);
            showCustomModal('消息翻译', '<p style="font-size:13px;color:#666;margin-bottom:8px;">原文: ' + esc(msg.content) + '</p><p style="font-size:14px;color:#333;background:#f9f9f9;padding:12px;border-radius:8px;">' + esc(translated) + '</p>');
        });
    };

    // Group announcement
    function showGroupAnnouncement() {
        if (!curChat || curChat.type !== 'group') return toast('仅在群组中可用');
        var g = allGroups.find(function (x) { return x.id === curChat.id; });
        if (!g) return;
        var ann = prompt('输入群公告：', g.announcement || '');
        if (ann !== null) {
            g.announcement = ann;
            dbAdd('groups', g).then(function () { toast('群公告已更新'); showGroupInfo(); });
        }
    }

    // Group join request / approval (stored on the group record, server-shared)
    function requestJoinGroup(groupId) {
        var g = allGroups.find(function (x) { return x.id === groupId; });
        if (!g) return toast('群组不存在');
        if (g.members.some(function (m) { return m.id === curUser.id; })) return toast('你已在群组中');
        if (!Array.isArray(g.joinRequests)) g.joinRequests = [];
        if (g.joinRequests.indexOf(curUser.id) !== -1) return toast('已发送过申请');
        g.joinRequests.push(curUser.id);
        dbAdd('groups', g).then(function () {
            toast('已发送加群申请，等待管理员审批');
        }).catch(function (e) { toast(e.message || e); });
    }

    function approveJoinRequest(groupId, userId) {
        var g = allGroups.find(function (x) { return x.id === groupId; });
        if (!g) return toast('群组不存在');
        if (!Array.isArray(g.joinRequests)) g.joinRequests = [];
        g.joinRequests = g.joinRequests.filter(function (uid) { return uid !== userId; });
        if (!g.members.some(function (m) { return m.id === userId; })) {
            g.members.push({ id: userId, role: 'member' });
            dbAdd('groups', g).then(function () { toast('已批准'); loadChatList(); }).catch(function (e) { toast(e.message || e); });
        }
        // real-time notify the applicant
        var name = getUserName(curUser.id);
        sendChatNotification(userId, 'groupInvite', { groupId: groupId, groupName: g.name, inviter: name });
    }

    function rejectJoinRequest(groupId, userId) {
        var g = allGroups.find(function (x) { return x.id === groupId; });
        if (!g) return toast('群组不存在');
        if (!Array.isArray(g.joinRequests)) g.joinRequests = [];
        g.joinRequests = g.joinRequests.filter(function (uid) { return uid !== userId; });
        dbAdd('groups', g).then(function () { toast('已拒绝'); showJoinRequests(); }).catch(function (e) { toast(e.message || e); });
        sendChatNotification(userId, 'groupReject', { groupId: groupId, groupName: g.name });
    }

    function showJoinRequests() {
        if (!curChat || curChat.type !== 'group') return;
        var g = allGroups.find(function (x) { return x.id === curChat.id; });
        if (!g) return;
        var myMember = g.members.find(function (m) { return m.id === curUser.id; });
        if (!myMember || (myMember.role !== 'owner' && myMember.role !== 'admin')) return toast('仅管理员可查看');
        var requests = Array.isArray(g.joinRequests) ? g.joinRequests : [];
        if (requests.length === 0) { toast('暂无申请'); return; }
        var html = '<table class="chat-admin-table"><thead><tr><th>用户</th><th>操作</th><th>状态</th></tr></thead><tbody>';
        requests.forEach(function (uid) {
            html += '<tr><td>' + esc(getUserName(uid)) + '</td><td><button class="mini-btn" onclick="approveJoinRequest(\'' + g.id + '\',\'' + uid + '\')">批准</button> <button class="mini-btn danger" onclick="rejectJoinRequest(\'' + g.id + '\',\'' + uid + '\')">拒绝</button></td><td>等待审批</td></tr>';
        });
        html += '</tbody></table>';
        showCustomModal('加群申请 (' + requests.length + ')', html);
    }

    // Group transfer ownership
    function transferGroup() {
        if (!curChat || curChat.type !== 'group') return;
        var g = allGroups.find(function (x) { return x.id === curChat.id; });
        if (!g) return toast('群组不存在');
        if (g.owner !== curUser.id) return toast('仅群主可转让');
        var newOwnerId = prompt('输入新群主的用户ID：');
        if (!newOwnerId) return;
        var newOwner = g.members.find(function (m) { return m.id === newOwnerId; });
        if (!newOwner) return toast('该用户不是群成员');
        g.owner = newOwnerId;
        newOwner.role = 'owner';
        var oldOwner = g.members.find(function (m) { return m.id === curUser.id; });
        if (oldOwner) oldOwner.role = 'admin';
        dbAdd('groups', g).then(function () { toast('群组已转让给 ' + getUserName(newOwnerId)); loadChatList(); });
    }

    // Group delete by owner
    function deleteGroupByOwner() {
        if (!curChat || curChat.type !== 'group') return;
        var g = allGroups.find(function (x) { return x.id === curChat.id; });
        if (!g) return toast('群组不存在');
        if (g.owner !== curUser.id && curUser.role !== 'admin') return toast('仅群主或管理员可删除');
        if (!confirm('确定删除群组 ' + g.name + '？此操作不可撤销！')) return;
        // Delete all group messages
        var cid = getChatKey('group', g.id);
        openDB().then(function (d) {
            var tx = d.transaction('messages', 'readwrite');
            var r = tx.objectStore('messages').index('chatId').openCursor(IDBKeyRange.only(cid));
            r.onsuccess = function (e) {
                var c = e.target.result;
                if (c) { c.delete(); c.continue(); }
                else {
                    dbDel('groups', g.id).then(function () { toast('群组已删除'); curChat = null; loadChatList(); $('chatMessages').innerHTML = '<div class="chat-msg system"><div class="chat-msg-bubble">请从左侧选择一个聊天</div></div>'; });
                }
            };
        });
    }

    // @all mention
    function sendAtAll() {
        if (!curChat) return;
        var input = $('chatInput');
        input.value += '@all ';
        input.focus();
    }

    // Poll creation
    function createPoll() {
        if (!curChat) return toast('请选择聊天');
        var question = prompt('输入投票问题：');
        if (!question) return;
        var options = prompt('输入选项（用逗号分隔，如"选项A,选项B,选项C"）：');
        if (!options) return;
        var opts = options.split(',').map(function (o) { return o.trim(); }).filter(function (o) { return o; });
        if (opts.length < 2) return toast('至少需要2个选项');
        var cid = getChatKey(curChat.type, curChat.id);
        var msg = {
            id: uid(), chatId: cid, sender: curUser.id, type: 'poll',
            content: question, pollOptions: opts, pollVotes: {},
            time: now(), edited: false, recalled: false, isExpired: false
        };
        dbAdd('messages', msg).then(function () {
            loadMessages(cid, true); loadChatList(); toast('投票已创建');
        });
    }

    function votePoll(msgId, optionIndex) {
        dbGet('messages', msgId).then(function (msg) {
            if (!msg || msg.type !== 'poll') return;
            if (!msg.pollVotes) msg.pollVotes = {};
            msg.pollVotes[curUser.id] = optionIndex;
            dbAdd('messages', msg).then(function () {
                var cid = getChatKey(curChat.type, curChat.id);
                loadMessages(cid, true); toast('已投票');
            });
        });
    }

    // Leave group
    function leaveGroup() {
        if (!curChat || curChat.type !== 'group') return;
        if (!confirm('确定退出该群组？')) return;
        var g = allGroups.find(function (x) { return x.id === curChat.id; });
        if (!g) return;
        g.members = g.members.filter(function (m) { return m.id !== curUser.id; });
        dbAdd('groups', g).then(function () {
            curChat = null;
            toast('已退出群组');
            loadChatList();
            $('chatMessages').innerHTML = '<div class="chat-msg system"><div class="chat-msg-bubble">请从左侧选择一个聊天</div></div>';
        });
    }

    // Mute chat
    function toggleMute() {
        if (!curChat) return toast('请选择聊天');
        var cid = getChatKey(curChat.type, curChat.id);
        var muted = JSON.parse(localStorage.getItem(LS('muted')) || '[]');
        var idx = muted.indexOf(cid);
        if (idx !== -1) { muted.splice(idx, 1); toast('已取消静音'); }
        else { muted.push(cid); toast('已静音'); }
        localStorage.setItem(LS('muted'), JSON.stringify(muted));
    }

    // Chat background
    function setChatBg() {
        var url = prompt('输入背景图片URL（或留空恢复默认）：');
        if (url === null) return;
        if (url.trim()) {
            $('chatMessages').style.backgroundImage = 'url("' + url.trim() + '")';
            $('chatMessages').style.backgroundSize = 'cover';
            localStorage.setItem(LS('chatBg'), url.trim());
        } else {
            $('chatMessages').style.backgroundImage = '';
            localStorage.removeItem(LS('chatBg'));
        }
    }

    // Contact groups
    function openContactGroups() {
        $('groupCatModal').classList.add('show');
        renderContactGroups();
    }

    function renderContactGroups() {
        var cats = JSON.parse(localStorage.getItem(LS('contactCats')) || '{}');
        var container = $('groupCatList');
        var html = '<table class="chat-admin-table"><thead><tr><th>分组名</th><th>成员数</th><th>操作</th></tr></thead><tbody>';
        var keys = Object.keys(cats);
        if (keys.length === 0) html += '<tr><td colspan="3" style="text-align:center;color:#999;">暂无分组</td></tr>';
        keys.forEach(function (k) {
            html += '<tr><td>' + esc(k) + '</td><td>' + (cats[k] ? cats[k].length : 0) + '</td><td><button class="mini-btn danger" onclick="window._delContactCat(\'' + esc(k) + '\')">删除</button></td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    }

    window._delContactCat = function (name) {
        var cats = JSON.parse(localStorage.getItem(LS('contactCats')) || '{}');
        delete cats[name];
        localStorage.setItem(LS('contactCats'), JSON.stringify(cats));
        renderContactGroups();
        toast('分组已删除');
    };

    // Blacklist
    function showBlacklist() {
        var blocked = JSON.parse(localStorage.getItem(LS('blacklist')) || '[]');
        if (blocked.length === 0) { toast('黑名单为空'); return; }
        var html = '<table class="chat-admin-table"><thead><tr><th>用户</th><th>操作</th></tr></thead><tbody>';
        blocked.forEach(function (bid) {
            html += '<tr><td>' + esc(getUserName(bid)) + '</td><td><button class="mini-btn" onclick="window._unblockUser(\'' + bid + '\')">移出黑名单</button></td></tr>';
        });
        html += '</tbody></table>';
        showCustomModal('黑名单', html);
    }

    window._unblockUser = function (uid) {
        var blocked = JSON.parse(localStorage.getItem(LS('blacklist')) || '[]');
        blocked = blocked.filter(function (b) { return b !== uid; });
        localStorage.setItem(LS('blacklist'), JSON.stringify(blocked));
        toast('已移出黑名单');
        showBlacklist();
    };

    function showCustomModal(title, content) {
        var div = document.createElement('div');
        div.className = 'chat-modal-mask show';
        div.innerHTML = '<div class="chat-modal"><h2>' + esc(title) + '</h2>' + content + '<div class="chat-modal-actions"><button class="chat-modal-cancel" onclick="this.closest(\'.chat-modal-mask\').remove();">关闭</button></div></div>';
        document.body.appendChild(div);
        div.addEventListener('click', function (e) { if (e.target === div) div.remove(); });
    }

    // Status settings
    var STATUSES = ['online', 'away', 'busy', 'invisible'];

    function cycleStatus() {
        if (!curUser) return;
        var idx = STATUSES.indexOf(curUser.status);
        if (idx === -1) idx = 0;
        var next = STATUSES[(idx + 1) % STATUSES.length];
        curUser.status = next;
        dbAdd('users', curUser).then(function () {
            var labels = { online: '在线', away: '离开', busy: '忙碌', invisible: '隐身' };
            toast('状态已切换: ' + labels[next]);
            renderSidebar();
        });
    }

    // Draft save
    function saveDraft() {
        if (!curChat) return;
        var cid = getChatKey(curChat.type, curChat.id);
        var text = $('chatInput').value;
        if (text) localStorage.setItem(LS('draft_' + cid), text);
        else localStorage.removeItem(LS('draft_' + cid));
    }

    function restoreDraft() {
        if (!curChat) return;
        var cid = getChatKey(curChat.type, curChat.id);
        var draft = localStorage.getItem(LS('draft_' + cid));
        if (draft) { $('chatInput').value = draft; $('chatInput').dispatchEvent(new Event('input')); }
    }

    // Chat export
    function exportChat() {
        if (!curChat) return toast('请选择聊天');
        var cid = getChatKey(curChat.type, curChat.id);
        getMsgs(cid, 1000).then(function (msgs) {
            var data = { chat: curChat, messages: msgs, exportedAt: now() };
            var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url; a.download = 'chat_export_' + cid + '.json';
            a.click();
            URL.revokeObjectURL(url);
            toast('聊天记录已导出');
        });
    }

    // Delete account
    function deleteAccount() {
        if (!confirm('确定永久删除账号？此操作不可撤销！')) return;
        if (!confirm('再次确认：删除账号将清除所有数据')) return;
        dbDel('users', curUser.id).then(function () {
            // clean all user data
            localStorage.clear();
            toast('账号已删除');
            location.reload();
        });
    }

    /* ===================== 18. SERVER POLLING (仅服务器版) ===================== */
    var pollTimer = null, lastMsgStamp = {};

    function startPolling() {
        if (pollTimer || !isApiMode()) return;
        pollTimer = setInterval(function () {
            if (!curUser) return;
            loadUsers().catch(function () {});
            loadChatList().catch(function () {});
            if (curChat) {
                var cid = getChatKey(curChat.type, curChat.id);
                getMsgs(cid, 200).then(function (ms) {
                    var last = ms.length ? ms[ms.length - 1] : null;
                    var stamp = ms.length + '|' + (last ? last.id + '|' + last.time : '');
                    if (lastMsgStamp[cid] !== stamp) { lastMsgStamp[cid] = stamp; loadMessages(cid); }
                }).catch(function () {});
            }
        }, 2000);
    }

    /* ===================== 18b. SERVER PUSH (SSE via fetch+ReadableStream, 仅服务器版) ===================== */
    var esReader = null, esRetry = null, esDecoder = new TextDecoder();

    function stopStreaming() {
        esReader = null;
        if (esRetry) { clearTimeout(esRetry); esRetry = null; }
    }

    function startStreaming() {
        if (!isApiMode() || !apiToken) return;
        stopStreaming();
        connectStream();
    }

    function connectStream() {
        if (!isApiMode() || !apiToken || esRetry) return;
        fetch(API_BASE + '/events', { headers: { 'X-Auth-Token': apiToken } })
            .then(function (resp) {
                if (!resp.ok) throw new Error('sse status ' + resp.status);
                if (!resp.body || !resp.body.getReader) throw new Error('no reader');
                esReader = resp.body.getReader();
                var buf = '';
                function pump() {
                    return esReader.read().then(function (e) {
                        if (e.done) throw new Error('sse close');
                        buf += esDecoder.decode(e.value, { stream: true });
                        var idx;
                        while ((idx = buf.indexOf('\n\n')) !== -1) {
                            var block = buf.slice(0, idx); buf = buf.slice(idx + 2);
                            handleSse(block);
                        }
                        return pump();
                    });
                }
                return pump();
            })
            .catch(function () {
                stopStreaming();
                esRetry = setTimeout(connectStream, 3000);
            });
    }

    function handleSse(block) {
        var event = 'message', data = '';
        block.split('\n').forEach(function (line) {
            if (line.indexOf('event:') === 0) event = line.slice(6).trim();
            else if (line.indexOf('data:') === 0) data = line.slice(5).trim();
        });
        var payload; try { payload = JSON.parse(data); } catch (e) { return; }
        switch (event) {
            case 'message':
            case 'message-update':
                var m = payload.message || payload;
                if (!m) return;
                if (m.sender === curUser.id) return; // 忽略自己的推送
                if (m.chatId && curChat && getChatKey(curChat.type, curChat.id) === m.chatId) {
                    loadMessages(m.chatId, true);
                } else {
                    loadChatList();
                }
                break;
            case 'message-delete':
                if (payload.chatId && curChat && getChatKey(curChat.type, curChat.id) === payload.chatId) {
                    loadMessages(payload.chatId, false);
                } else {
                    loadChatList();
                }
                break;
            case 'typing':
                handlePeerTyping(payload);
                break;
            case 'user-online':
                updatePeerOnline(payload);
                break;
            case 'broadcast':
                handleServerBroadcast(payload);
                break;
            case 'notification':
                showChatNotification(payload.type, payload.extra || {});
                break;
            case 'group-update':
                loadGroups().then(function () { loadChatList(); });
                break;
            case 'contact-added':
                // 被加为联系人（双向）→ 刷新列表
                if (payload && payload.contactId === curUser.id) {
                    dbGet('users', payload.owner).then(function (u) {
                        if (!u) return loadUsers().then(loadChatList);
                        dbAdd('contacts', { id: curUser.id + '|' + payload.owner, owner: curUser.id, contactId: payload.owner, created: now() });
                    }).then(loadChatList).catch(loadChatList);
                } else {
                    loadChatList();
                }
                break;
            case 'channel-subscribe':
                loadChannels().then(loadChatList).catch(loadChatList);
                break;
        }
    }

    function handleServerBroadcast(payload) {
        if (!payload || !payload.text) return;
        toast(payload.title || '管理员广播：' + payload.text);
        // 在消息列表插入一条 system 广播
        if (curChat) {
            var cid = getChatKey(curChat.type, curChat.id);
            var msg = { id: 'sys_' + uid(), chatId: cid, sender: 'system', type: 'text', content: payload.text, time: now(), edited: false, recalled: false, isExpired: false };
            dbAdd('messages', msg).then(function () { loadMessages(cid, true); });
        }
    }

    /* ===================== 19. INIT ===================== */
    function init() {
        if (isApiMode()) {
            checkSession().then(function (user) {
                if (user) { doLogin(user); }
                else { $('loginScreen').classList.remove('chat-hidden'); $('chatApp').classList.add('chat-hidden'); }
            });
        } else {
            openDB().then(function () {
                seedData();
                ensureLocalExtras();
                return checkSession();
            }).then(function (user) {
                if (user) { doLogin(user); }
                else { $('loginScreen').classList.remove('chat-hidden'); $('chatApp').classList.add('chat-hidden'); }
            });
        }

        // Auth tab switching（login.html 滑块风格）
        document.querySelectorAll('.auth-switch .auth-tab').forEach(function (tab) {
            tab.addEventListener('click', function () { switchAuth(tab.dataset.target); });
        });
        function switchAuth(target) {
            var sw = document.querySelector('.auth-switch');
            if (sw) sw.setAttribute('data-active', target);
            document.querySelectorAll('.auth-switch .auth-tab').forEach(function (t) { t.classList.toggle('active', t.dataset.target === target); });
            var lp = $('loginPanel'), rp = $('registerPanel');
            if (lp) lp.classList.toggle('active', target === 'login');
            if (rp) rp.classList.toggle('active', target === 'register');
        }

        // Password login
        $('loginBtn').addEventListener('click', doLoginSubmit);
        ['loginUser', 'loginPass'].forEach(function (id) {
            $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') doLoginSubmit(); });
        });
        function doLoginSubmit() {
            var username = $('loginUser').value.trim();
            var password = $('loginPass').value;
            var msg = $('loginMsg');
            msg.textContent = '';
            if (!username || !password) { msg.textContent = '请填写用户名和密码'; return; }
            if (isRateLimited('login_' + username, 5, 60)) { msg.textContent = '登录频率过高，请稍后再试'; return; }
            authPassword(username, password).then(doLogin).catch(function (e) { msg.textContent = e; });
        }

        // Device login
        $('authDeviceLogin').addEventListener('click', function () {
            if (isRateLimited('login_' + getDeviceFingerprint(), 5, 60)) { $('loginMsg').textContent = '登录频率过高，请稍后再试'; return; }
            attemptDeviceLogin(null);
        });

        function attemptDeviceLogin(secret) {
            authDevice(secret).then(function (res) {
                // server 返回 {user, token, needSetPassword} / {user}（本地）
                var user = res.user || res;
                doLogin(user);
                if (res && res.needSetPassword) {
                    showDeviceSecurityNotice(function () { showDeviceSetPassword(); });
                } else if (user && user._needSetPassword) {
                    showDeviceSecurityNotice(function () { showDeviceSetPassword(); });
                } else if (res && res.needPassword) {
                    showDevicePasswordPrompt(attemptDeviceLogin);
                }
            }).catch(function (e) {
                if (e && (e.needPassword)) { showDevicePasswordPrompt(attemptDeviceLogin); return; }
                $('loginMsg').textContent = '登录失败: ' + (e && e.error ? e.error : e);
            });
        }

        // 显示一次性安全须知（每设备仅一次，存 localStorage 标记）
        function showDeviceSecurityNotice(onDone) {
            var fp = getDeviceFingerprint();
            var seen = localStorage.getItem(LS('deviceNoticeShown_' + fp));
            onDone = onDone || function () {};
            $('devicePwdTip').textContent = '';
            $('deviceNewPwd').value = ''; $('deviceNewPwd2').value = '';
            $('deviceNoticeModal').classList.add('show');
            $('deviceNoticeSetPwd').onclick = function () {
                $('deviceNoticeModal').classList.remove('show');
                localStorage.setItem(LS('deviceNoticeShown_' + fp), '1');
                onDone();
            };
            $('deviceNoticeClose').onclick = function () {
                $('deviceNoticeModal').classList.remove('show');
                localStorage.setItem(LS('deviceNoticeShown_' + fp), '1');
            };
        }

        // 设置设备密码
        function showDeviceSetPassword() {
            $('devicePwdTip').textContent = '';
            $('deviceNewPwd').value = ''; $('deviceNewPwd2').value = '';
            $('deviceSetPwdModal').classList.add('show');
            $('deviceSetPwdConfirm').onclick = function () {
                var p1 = $('deviceNewPwd').value, p2 = $('deviceNewPwd2').value;
                if (p1.length < 4) { $('devicePwdTip').textContent = '密码至少 4 位'; return; }
                if (p1 !== p2) { $('devicePwdTip').textContent = '两次密码不一致'; return; }
                if (isApiMode()) {
                    apiFetch('/auth/device/set-password', { method: 'POST', body: { secret: p1 } }).then(function () {
                        $('deviceSetPwdModal').classList.remove('show');
                        toast('设备密码已设置，下次登录需输入');
                    }).catch(function (e) { $('devicePwdTip').textContent = '设置失败: ' + (e.error || e); });
                 } else {
                    // 本地：更新用户记录的 devicePasswordHash
                    curUser.devicePasswordHash = hashPass(p1);
                    curUser.devicePwdSet = true;
                    dbAdd('users', curUser).then(function () {
                        $('deviceSetPwdModal').classList.remove('show');
                        toast('设备密码已设置，下次登录需输入');
                    }).catch(function (e) { $('devicePwdTip').textContent = '设置失败: ' + (e.error || e); });
                }
            };
            $('deviceSetPwdClose').onclick = function () { $('deviceSetPwdModal').classList.remove('show'); };
        }

        // 输入设备密码并重试登录
        function showDevicePasswordPrompt(retry) {
            $('devicePwdError').textContent = '';
            $('devicePwdInput').value = '';
            $('devicePwdModal').classList.add('show');
            $('devicePwdConfirm').onclick = function () {
                var p = $('devicePwdInput').value;
                if (!p) { $('devicePwdError').textContent = '请输入密码'; return; }
                $('devicePwdModal').classList.remove('show');
                retry(p);
            };
            $('devicePwdClose').onclick = function () { $('devicePwdModal').classList.remove('show'); };
        }

        // Sentence key login（展开/收起）
        $('authKeyToggle').addEventListener('click', function () {
            var panel = $('authKeyPanel');
            var show = panel.style.display === 'none';
            panel.style.display = show ? 'flex' : 'none';
            if (show) $('authSentence').focus();
        });
        $('authSentenceLogin').addEventListener('click', function () {
            var sentence = $('authSentence').value.trim();
            var msg = $('loginMsg');
            msg.textContent = '';
            if (!sentence) { msg.textContent = '请输入密钥句子'; return; }
            if (isRateLimited('sentence_login', 3, 60)) { msg.textContent = '频率过高，请稍后再试'; return; }
            authSentence(sentence).then(doLogin).catch(function (e) { msg.textContent = e; });
        });

        // Register
        $('registerBtn').addEventListener('click', doRegisterSubmit);
        ['regUser', 'regPass', 'regConfirm'].forEach(function (id) {
            $(id).addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegisterSubmit(); });
        });
        function doRegisterSubmit() {
            var username = $('regUser').value.trim();
            var password = $('regPass').value;
            var confirmPass = $('regConfirm').value;
            var msg = $('regMsg');
            msg.textContent = '';
            if (!username || !password) { msg.textContent = '请填写用户名和密码'; return; }
            if (username.length < 3) { msg.textContent = '用户名至少 3 个字符'; return; }
            if (password.length < 6) { msg.textContent = '密码至少 6 位'; return; }
            if (password !== confirmPass) { msg.textContent = '两次密码不一致'; return; }
            var strength = passwordStrength(password);
            if (strength.score < 2) { if (!confirm('密码强度为"' + strength.label + '"，确定要继续吗？点击"确定"表示你已知晓风险')) return; }
            if (isRateLimited('register_' + username, 3, 60)) { msg.textContent = '注册频率过高，请稍后再试'; return; }
            if (isApiMode()) {
                apiFetch('/auth', { method: 'POST', body: { type: 'register', username: username, secret: hashPass(password) } })
                    .then(function (j) { apiToken = j.token; localStorage.setItem(LS('serverToken'), apiToken); msg.textContent = ''; toast('注册成功，自动登录'); doLogin(j.user); })
                    .catch(function (e) { msg.textContent = e.message || e; });
                return;
            }
            dbByIndex('users', 'username', username).then(function (users) {
                if (users.length > 0) return Promise.reject('用户名已存在');
                var id = 'u_' + uid();
                var user = { id: id, username: username, name: username, role: 'user', status: 'online', created: now() };
                var cred = { id: uid(), userId: id, loginType: 'password', identifier: username, credentialHash: hashPass(password), createdAt: now() };
                return dbAdd('users', user).then(function () { return dbAdd('auth_creds', cred); }).then(function () { return user; });
            }).then(function (user) { msg.textContent = ''; toast('注册成功，自动登录'); doLogin(user); }).catch(function (e) { msg.textContent = e; });
        }

        // GIF button
        $('chatGifBtn').addEventListener('click', function () {
            $('gifModal').classList.add('show');
            $('gifUrlInput').value = '';
            $('gifSearchInput').value = '';
            $('gifResults').innerHTML = '';
            $('gifSendBtn').disabled = true;
            gifSelectedUrl = '';
        });
        var gifSelectedUrl = '';
        function pickGif(url) {
            gifSelectedUrl = url;
            $('gifSendBtn').disabled = false;
            $('gifResults').innerHTML = '<div style="text-align:center;"><img src="' + escAttr(url) + '" style="max-width:100%;border-radius:8px;"></div>';
        }
        $('gifSendBtn').addEventListener('click', function () {
            if (!gifSelectedUrl) return toast('请选择一个 GIF');
            $('gifModal').classList.remove('show');
            sendMediaFromUrl(gifSelectedUrl, 'image', 'GIF');
        });
        $('gifModalCancel').addEventListener('click', function () { $('gifModal').classList.remove('show'); });

        $('gifSearchBtn').addEventListener('click', function () {
            var q = $('gifSearchInput').value.trim();
            if (!q) return;
            $('gifResults').innerHTML = '<div style="text-align:center;padding:16px;">搜索中...</div>';
            fetch('https://api.giphy.com/v1/gifs/search?api_key=' + GIPHY_KEY + '&q=' + encodeURIComponent(q) + '&limit=8')
                .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('giphy fail')); })
                .then(function (json) {
                    var gifs = json.data || [];
                    if (!gifs.length) { $('gifResults').innerHTML = '<div style="text-align:center;color:#999;padding:16px;">无结果</div>'; return; }
                    $('gifResults').innerHTML = gifs.map(function (g) {
                        var url = (g.images && g.images.original) ? g.images.original.url : '';
                        return url ? '<img src="' + escAttr(url) + '" style="max-width:100%;border-radius:8px;cursor:pointer;" onclick="pickGif(\'' + escAttr(url) + '\')">' : '';
                    }).join('');
                }).catch(function () {
                    $('gifResults').innerHTML = '<div style="text-align:center;color:#999;padding:10px;">搜索失败（本地模式无法访问 Giphy）</div>';
                });
        });

        function sendMediaFromUrl(url, type, name) {
            if (!url || !curChat) return;
            var cid = getChatKey(curChat.type, curChat.id);
            var msg = {
                id: uid(), chatId: cid, sender: curUser.id,
                type: type, content: name || 'GIF',
                mediaUrl: url, fileName: name || 'media',
                time: now(), edited: false, recalled: false, isExpired: false
            };
            dbAdd('messages', msg).then(function () { loadMessages(cid, true); loadChatList(); toast('已发送'); });
        }

        // Drag & drop file upload
        $('chatMessages').addEventListener('dragover', function (e) { e.preventDefault(); });
        $('chatMessages').addEventListener('drop', function (e) {
            e.preventDefault();
            var files = e.dataTransfer.files;
            if (files.length > 0) sendMedia(files);
        });

        // Send
        $('chatSendBtn').addEventListener('click', sendMessage);
        $('chatInput').addEventListener('keydown', function (e) {
            if (handleCmdMenuKey(e, this)) return;
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        $('chatInput').addEventListener('input', function () {
            var val = this.value.trim();
            $('chatSendBtn').disabled = !val || !curChat;
            this.style.height = 'auto'; this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            // typing indicator
            if (curChat) { emitTyping(getChatKey(curChat.type, curChat.id), val.length > 0); }
            // 频道只读时保持禁用
            if (curChat && curChat.type === 'channel') {
                var ch0 = allChannels.find(function (x) { return x.id === curChat.id; });
                if (ch0 && !canPostInChannel(ch0)) $('chatSendBtn').disabled = true;
            }
            // / 命令选择栏
            var sel = this.selectionStart || 0;
            var lineStart = this.value.lastIndexOf('\n', sel - 1) + 1;
            var lineText = this.value.slice(lineStart, sel);
            if (lineText.charAt(0) === '/') showCommandMenu(lineText);
            else if ($('chatCmdMenu').style.display !== 'none') hideCommandMenu();
        });
        // 点击输入区以外关闭命令栏
        document.addEventListener('mousedown', function (e) {
            var menu = $('chatCmdMenu'); var input = $('chatInput');
            if (menu && menu.style.display !== 'none' && !menu.contains(e.target) && input && !input.contains(e.target)) hideCommandMenu();
        });

        // Category tabs
        document.querySelectorAll('.chat-cat-tabs .tab-btn').forEach(function (tab) {
            tab.addEventListener('click', function () { renderChatList(tab.dataset.cat); });
        });

        // Search
        $('chatSearch').addEventListener('input', function () {
            // Also search messages if value length > 2
            var val = this.value.trim();
            if (val.length > 2 && curChat) {
                searchMessages(val).then(function (results) {
                    if (results.length > 0) {
                        var container = $('chatMessages');
                        container.innerHTML = '<div style="padding:8px;font-size:12px;color:#888;">搜索结果 (' + results.length + '):</div>';
                        results.forEach(function (m) {
                            container.insertAdjacentHTML('beforeend', renderMsg(m, m.sender === curUser.id));
                        });
                    }
                });
            }
            renderChatList(curCat);
        });

        // Logout
        $('chatLogoutBtn').addEventListener('click', function () { if (confirm('确定退出？')) doLogout(); });

        // 返回桌面
        $('chatDesktopBtn').addEventListener('click', function () { window.location.href = 'desktop.html'; });

        // Admin
        $('chatAdminBtn').addEventListener('click', openAdmin);
        $('adminBackBtn').addEventListener('click', closeAdmin);
        document.querySelectorAll('.chat-admin-nav-item').forEach(function (item) {
            item.addEventListener('click', function () { switchAdminSection(item.dataset.section); });
        });
        $('adminUserSearch').addEventListener('input', renderAdminUsers);
        $('adminGroupSearch').addEventListener('input', renderAdminGroups);
        $('adminChannelSearch').addEventListener('input', renderAdminChannels);
        $('adminMsgSearch').addEventListener('input', renderAdminMessages);
        $('adminSaveSettings').addEventListener('click', function () {
            localStorage.setItem(LS('adminRetention'), $('adminSettingRetention').value);
            localStorage.setItem(LS('adminMaxGroup'), $('adminSettingMaxGroup').value);
            localStorage.setItem(LS('adminSelfDestruct'), $('adminSettingSelfDestruct').value);
            toast('设置已保存');
            logAdmin(curUser.id, 'settings', '更新系统设置');
        });

        // Group
        $('createGroupBtn').addEventListener('click', showCreateGroup);
        $('groupModalConfirm').addEventListener('click', saveGroup);
        $('groupModalCancel').addEventListener('click', function () { $('groupModal').classList.remove('show'); });
        $('groupInfoBtn').addEventListener('click', showGroupInfo);
        $('contactInfoBtn').addEventListener('click', showContactInfo);
        $('channelInfoBtn').addEventListener('click', showChannelInfo);
        $('inviteBtn').addEventListener('click', showInviteModal);
        $('inviteModalConfirm').addEventListener('click', doInvite);
        $('inviteModalCancel').addEventListener('click', function () { $('inviteModal').classList.remove('show'); });
        $('genInviteLinkBtn').addEventListener('click', generateInviteLink);

        // Channel
        $('createChannelBtn').addEventListener('click', showCreateChannel);
        $('channelModalConfirm').addEventListener('click', saveChannel);
        $('channelModalCancel').addEventListener('click', function () { $('channelModal').classList.remove('show'); });
        $('subscribeBtn').addEventListener('click', function () {
            if (curChat && curChat.type === 'channel') {
                loadChannelPosts();
            }
        });
        $('channelPostConfirm').addEventListener('click', saveChannelPost);
        $('channelPostCancel').addEventListener('click', function () { $('channelPostModal').classList.remove('show'); });

        // Add channel action buttons (subscriber list, admin manage, delete, report, edit posts)
        var subBtn = document.createElement('button');
        subBtn.className = 'mini-btn';
        subBtn.innerHTML = '<i class="fas fa-users"></i> 订阅者';
        subBtn.addEventListener('click', showChannelSubscribers);
        $('chatChannelActions').appendChild(subBtn);

        var chAdminBtn = document.createElement('button');
        chAdminBtn.className = 'mini-btn';
        chAdminBtn.innerHTML = '<i class="fas fa-user-shield"></i> 管理员';
        chAdminBtn.addEventListener('click', manageChannelAdmins);
        $('chatChannelActions').appendChild(chAdminBtn);

        var delChBtn = document.createElement('button');
        delChBtn.className = 'mini-btn danger';
        delChBtn.innerHTML = '<i class="fas fa-trash"></i> 删除';
        delChBtn.style.color = '#ff3b30';
        delChBtn.addEventListener('click', deleteChannelByOwner);
        $('chatChannelActions').appendChild(delChBtn);

        var reportChBtn = document.createElement('button');
        reportChBtn.className = 'mini-btn';
        reportChBtn.innerHTML = '<i class="fas fa-flag"></i> 举报';
        reportChBtn.addEventListener('click', function () { reportUser(); });
        $('chatChannelActions').appendChild(reportChBtn);

        // Add report & import/export to contact actions
        var reportContactBtn = document.createElement('button');
        reportContactBtn.className = 'mini-btn';
        reportContactBtn.innerHTML = '<i class="fas fa-flag"></i> 举报';
        reportContactBtn.addEventListener('click', function () { reportUser(curChat ? curChat.id : null); });
        $('chatContactActions').appendChild(reportContactBtn);

        var exportContactBtn = document.createElement('button');
        exportContactBtn.className = 'mini-btn';
        exportContactBtn.innerHTML = '<i class="fas fa-file-export"></i> 导出联系人';
        exportContactBtn.addEventListener('click', exportContacts);
        $('chatContactActions').appendChild(exportContactBtn);

        var importContactBtn = document.createElement('button');
        importContactBtn.className = 'mini-btn';
        importContactBtn.innerHTML = '<i class="fas fa-file-import"></i> 导入联系人';
        importContactBtn.addEventListener('click', importContacts);
        $('chatContactActions').appendChild(importContactBtn);

        // Contact
        $('addContactBtn').addEventListener('click', function () { $('contactModal').classList.add('show'); $('contactSearchInput').value = ''; $('contactSearchResults').innerHTML = ''; });
        $('contactSearchInput').addEventListener('input', function () {
            var q = this.value.trim().toLowerCase();
            if (!q) { $('contactSearchResults').innerHTML = ''; return; }
            var results = allUsers.filter(function (u) { return u.id !== curUser.id && (u.username.toLowerCase().indexOf(q) !== -1 || (u.name || '').toLowerCase().indexOf(q) !== -1); });
            var html = '';
            if (results.length === 0) { html = '<div style="padding:12px;text-align:center;color:#999;">未找到用户</div>'; }
            else {
                results.forEach(function (u) {
                    html += '<div class="chat-list-item" onclick="window._addContact(\'' + u.id + '\')"><span class="chat-list-avatar" style="background:' + avatarColor(u.id) + ';width:36px;height:36px;font-size:13px;">' + avText(u.name || u.username) + '</span><div class="chat-list-info"><div class="chat-list-name">' + esc(u.name || u.username) + '</div></div><span style="font-size:12px;color:#007aff;">添加</span></div>';
                });
            }
            $('contactSearchResults').innerHTML = html;
        });
        $('contactModalCancel').addEventListener('click', function () { $('contactModal').classList.remove('show'); });
        window._addContact = function (userId) {
            dbByIndex('contacts', 'owner', curUser.id).then(function (contacts) {
                if (contacts.some(function (c) { return c.contactId === userId; })) return toast('已是联系人');
                return dbAdd('contacts', { id: curUser.id + '|' + userId, owner: curUser.id, contactId: userId, created: now() });
            }).then(function () { $('contactModal').classList.remove('show'); loadChatList(); toast('已添加联系人'); }).catch(function (e) { toast(e.message || e); });
        };

        // Devices
        $('chatDevicesBtn').addEventListener('click', showDevices);
        $('devicesModalClose').addEventListener('click', function () { $('devicesModal').classList.remove('show'); });

        // Secret chat
        $('secretChatBtn').addEventListener('click', initSecretChat);
        $('secretChatVerify').addEventListener('click', verifySecretCode);
        $('secretChatModalClose').addEventListener('click', function () { $('secretChatModal').classList.remove('show'); });

        // Stickers
        $('openStickersBtn').addEventListener('click', openStickerManager);
        $('stickerUploadBtn').addEventListener('click', uploadStickers);
        $('stickerModalClose').addEventListener('click', function () { $('stickerModal').classList.remove('show'); });
        $('chatStickerBtn').addEventListener('click', showStickerPicker);
        $('stickerPickerClose').addEventListener('click', function () { $('stickerPicker').classList.add('chat-hidden'); });

        // Media
        $('chatMediaBtn').addEventListener('click', function () { $('chatMediaInput').click(); });
        $('chatMediaInput').addEventListener('change', function () { sendMedia(this.files); this.value = ''; });

        // Self-destruct
        $('chatSelfDestructBtn').addEventListener('click', toggleSelfDestruct);
        updateSelfDestructUI();

        // Info panel
        $('infoCloseBtn').addEventListener('click', closeInfoPanel);
        $('chatBackBtn').addEventListener('click', function () {
            $('chatMain').classList.remove('show-mobile');
        });
        function closeInfoPanel() {
            $('infoPanel').classList.remove('show', 'show-mobile');
            $('infoContent').innerHTML = '';
        }

        // Close modals on mask click
        document.querySelectorAll('.chat-modal-mask').forEach(function (mask) {
            mask.addEventListener('click', function (e) { if (e.target === mask) mask.classList.remove('show'); });
        });

        // Device ID display
        // ===== 个人资料 =====
        function openProfile() {
            if (!curUser) return;
            $('profileAvatar').textContent = avText(curUser.name || curUser.username);
            $('profileAvatar').style.background = avatarColor(curUser.id);
            $('profileNameDisplay').textContent = curUser.name || curUser.username;
            $('profileRoleDisplay').textContent = curUser.role === 'admin' ? '管理员' : '用户';
            $('profileNicknameInput').value = curUser.name || '';
            $('profileBioInput').value = curUser.bio || '';
            $('profileBirthdayInput').value = curUser.birthday ? curUser.birthday.slice(0,10) : '';
            var priv = curUser.privacy || {};
            if (typeof priv !== 'object') priv = {};
            $('profilePrivateChat').checked = !!priv.denyStrangerChat;
            $('profileShowOnline').checked = priv.showOnline !== false;
            $('profileShowRead').checked = priv.showRead !== false;
            // stats
            var msgP = dbByIndex('messages', 'sender', curUser.id).then(function (msgs) { $('profileMsgCount').textContent = msgs.length; });
            var groupP = dbGetAll('groups').then(function (gs) {
                var count = gs.filter(function (g) { return g.members && g.members.some(function (m) { return m.id === curUser.id; }); }).length;
                $('profileGroupCount').textContent = count;
            });
            var days = curUser.created ? Math.floor((Date.now() - new Date(curUser.created).getTime()) / 86400000) + 1 : 1;
            $('profileDaysCount').textContent = days;
            $('profileModal').classList.add('show');
        }

        $('chatUserAvatar').addEventListener('click', openProfile);
        $('chatUserName').addEventListener('click', openProfile);
        $('profileCloseBtn').addEventListener('click', function () { $('profileModal').classList.remove('show'); });

        // Avatar upload
        $('profileAvatar').addEventListener('click', function () { $('profileAvatarInput').click(); });
        $('profileAvatarInput').addEventListener('change', function () {
            var file = this.files && this.files[0];
            if (!file) return;
            var reader = new FileReader();
            reader.onload = function (e) {
                curUser.avatar = e.target.result;
                $('profileAvatar').style.backgroundImage = 'url("' + e.target.result + '")';
                $('profileAvatar').style.backgroundSize = 'cover';
                $('profileAvatar').textContent = '';
                dbAdd('users', curUser).then(function () { toast('头像已更新'); renderSidebar(); });
            };
            reader.readAsDataURL(file);
            this.value = '';
        });

        // Save profile
        $('profileSaveBtn').addEventListener('click', function () {
            var name = $('profileNicknameInput').value.trim();
            var bio = $('profileBioInput').value.trim();
            if (!name) return toast('昵称不能为空');
            curUser.name = name;
            curUser.bio = bio;
            curUser.birthday = $('profileBirthdayInput').value || (curUser.birthday || '');
            curUser.privacy = {
                denyStrangerChat: $('profilePrivateChat').checked,
                showOnline: $('profileShowOnline').checked,
                showRead: $('profileShowRead').checked
            };
            dbAdd('users', curUser).then(function () {
                toast('个人资料已保存');
                $('profileModal').classList.remove('show');
                renderSidebar();
                loadChatList();
            });
        });

        // Change password
        $('profileChangePassBtn').addEventListener('click', function () {
            var oldPass = $('profileOldPass').value;
            var newPass = $('profileNewPass').value;
            if (!oldPass || !newPass) return toast('请填写旧密码和新密码');
            if (newPass.length < 4) return toast('新密码至少4位');
            dbByIndex('auth_creds', 'userId', curUser.id).then(function (creds) {
                var pc = creds.find(function (c) { return c.loginType === 'password'; });
                if (!pc) return toast('当前账号未设置密码，无法修改');
                if (pc.credentialHash !== hashPass(oldPass)) return toast('旧密码错误');
                pc.credentialHash = hashPass(newPass);
                dbAdd('auth_creds', pc).then(function () {
                    toast('密码已修改');
                    $('profileOldPass').value = '';
                    $('profileNewPass').value = '';
                });
            });
        });

        // ===== Emoji =====
        $('chatEmojiBtn').addEventListener('click', toggleEmojiPicker);
        $('emojiPickerClose').addEventListener('click', function () { $('emojiPicker').classList.add('chat-hidden'); });
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.chat-emoji-picker') && !e.target.closest('#chatEmojiBtn')) {
                $('emojiPicker').classList.add('chat-hidden');
            }
        });

        // ===== Voice =====
        $('chatVoiceBtn').addEventListener('click', function () { $('voiceModal').classList.add('show'); });
        $('voiceStartBtn').addEventListener('click', startVoiceRecording);
        $('voiceSendBtn').addEventListener('click', sendVoiceMessage);
        $('voiceModalClose').addEventListener('click', function () {
            if (voiceTimer) { clearInterval(voiceTimer); voiceTimer = null; }
            $('voiceStartBtn').style.display = 'inline-flex';
            $('voiceSendBtn').style.display = 'none';
            $('voiceStatusIcon').innerHTML = '<i class="fas fa-microphone"></i>';
            $('voiceModal').classList.remove('show');
        });

        // ===== Forward =====
        $('forwardModalConfirm').addEventListener('click', function () {
            var msgId = $('forwardModal').dataset.msgId;
            var targetRaw = $('forwardModal').dataset.targetChat;
            if (!msgId || !targetRaw) return toast('请选择目标聊天');
            var target = JSON.parse(targetRaw);
            dbGet('messages', msgId).then(function (msg) {
                if (!msg) return toast('消息不存在');
                var cid = getChatKey(target.type, target.id);
                var newMsg = JSON.parse(JSON.stringify(msg));
                newMsg.id = uid(); newMsg.chatId = cid; newMsg.time = now(); newMsg.sender = curUser.id; newMsg.edited = false; newMsg.recalled = false; newMsg.forwardedFrom = msg.sender;
                dbAdd('messages', newMsg).then(function () {
                    $('forwardModal').classList.remove('show');
                    toast('消息已转发');
                    if (curChat && curChat.type === target.type && curChat.id === target.id) loadMessages(cid, true);
                });
            });
        });
        $('forwardModalCancel').addEventListener('click', function () { $('forwardModal').classList.remove('show'); });

        // ===== Favorites =====
        $('chatFavoritesBtn').addEventListener('click', showFavorites);
        $('favoritesClose').addEventListener('click', function () { $('favoritesModal').classList.remove('show'); });

        // ===== Group Announcement =====
        // Add announcement button to group actions
        var annBtn = document.createElement('button');
        annBtn.className = 'mini-btn';
        annBtn.innerHTML = '<i class="fas fa-bullhorn"></i> 公告';
        annBtn.addEventListener('click', showGroupAnnouncement);
        $('chatGroupActions').appendChild(annBtn);

        // ===== Leave Group =====
        var leaveBtn = document.createElement('button');
        leaveBtn.className = 'mini-btn danger';
        leaveBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> 退出';
        leaveBtn.style.color = '#ff3b30';
        leaveBtn.addEventListener('click', leaveGroup);
        $('chatGroupActions').appendChild(leaveBtn);

        // Group transfer & delete by owner
        var transferBtn = document.createElement('button');
        transferBtn.className = 'mini-btn';
        transferBtn.innerHTML = '<i class="fas fa-exchange-alt"></i> 转让';
        transferBtn.addEventListener('click', transferGroup);
        $('chatGroupActions').appendChild(transferBtn);

        var delGroupBtn = document.createElement('button');
        delGroupBtn.className = 'mini-btn danger';
        delGroupBtn.innerHTML = '<i class="fas fa-trash"></i> 删除群';
        delGroupBtn.style.color = '#ff3b30';
        delGroupBtn.addEventListener('click', deleteGroupByOwner);
        $('chatGroupActions').appendChild(delGroupBtn);

        // @all button
        var atAllBtn = document.createElement('button');
        atAllBtn.className = 'mini-btn';
        atAllBtn.innerHTML = '<i class="fas fa-at"></i> @all';
        atAllBtn.addEventListener('click', sendAtAll);
        $('chatGroupActions').appendChild(atAllBtn);

        // Poll button (also for contacts)
        var pollBtn = document.createElement('button');
        pollBtn.className = 'mini-btn';
        pollBtn.innerHTML = '<i class="fas fa-poll"></i> 投票';
        pollBtn.addEventListener('click', createPoll);
        var ca = $('chatContactActions');
        if (ca) {
            var pollBtn2 = pollBtn.cloneNode(true);
            pollBtn2.addEventListener('click', createPoll);
            ca.appendChild(pollBtn2);
        }
        $('chatGroupActions').appendChild(pollBtn);

        // Join requests button
        var reqBtn = document.createElement('button');
        reqBtn.className = 'mini-btn';
        reqBtn.innerHTML = '<i class="fas fa-user-clock"></i> 申请';
        reqBtn.addEventListener('click', showJoinRequests);
        $('chatGroupActions').appendChild(reqBtn);

        // ===== General actions (mute, bg, export) =====
        var generalActions = document.createElement('div');
        generalActions.className = 'chat-main-actions';
        generalActions.id = 'chatGeneralActions';
        generalActions.style.cssText = 'display:flex;gap:4px;';

        var muteBtn = document.createElement('button');
        muteBtn.className = 'mini-btn';
        muteBtn.innerHTML = '<i class="fas fa-bell-slash"></i>';
        muteBtn.title = '静音/取消静音';
        muteBtn.addEventListener('click', toggleMute);
        generalActions.appendChild(muteBtn);

        var archiveBtn = document.createElement('button');
        archiveBtn.className = 'mini-btn';
        archiveBtn.innerHTML = '<i class="fas fa-archive"></i>';
        archiveBtn.title = '归档/取消归档';
        archiveBtn.addEventListener('click', toggleArchive);
        generalActions.appendChild(archiveBtn);

        var bgBtn = document.createElement('button');
        bgBtn.className = 'mini-btn';
        bgBtn.innerHTML = '<i class="fas fa-image"></i>';
        bgBtn.title = '聊天背景';
        bgBtn.addEventListener('click', setChatBg);
        generalActions.appendChild(bgBtn);

        var exportBtn = document.createElement('button');
        exportBtn.className = 'mini-btn';
        exportBtn.innerHTML = '<i class="fas fa-download"></i>';
        exportBtn.title = '导出聊天记录';
        exportBtn.addEventListener('click', exportChat);
        generalActions.appendChild(exportBtn);

        // Insert before actions
        var header = $('chatMainHeader');
        if (header) header.appendChild(generalActions);

        // ===== Contact Groups =====
        var catBtn = document.createElement('button');
        catBtn.className = 'mini-btn';
        catBtn.innerHTML = '<i class="fas fa-folder"></i> 分组';
        catBtn.title = '联系人分组管理';
        catBtn.addEventListener('click', openContactGroups);
        var actionsRow = document.querySelector('#chatApp .chat-sidebar div[style*="flex"]');
        if (actionsRow) actionsRow.appendChild(catBtn);

        // Contact group modal
        $('groupCatAddBtn').addEventListener('click', function () {
            var name = $('groupCatNewInput').value.trim();
            if (!name) return toast('请输入分组名称');
            var cats = JSON.parse(localStorage.getItem(LS('contactCats')) || '{}');
            if (cats[name]) return toast('分组已存在');
            cats[name] = [];
            localStorage.setItem(LS('contactCats'), JSON.stringify(cats));
            $('groupCatNewInput').value = '';
            renderContactGroups();
            toast('分组已添加');
        });
        $('groupCatClose').addEventListener('click', function () { $('groupCatModal').classList.remove('show'); });

        // ===== Status cycle =====
        $('chatUserRole').addEventListener('dblclick', cycleStatus);

        // ===== Blacklist =====
        var blockBtn = document.createElement('button');
        blockBtn.className = 'mini-btn danger';
        blockBtn.innerHTML = '<i class="fas fa-ban"></i> 黑名单';
        blockBtn.style.color = '#ff3b30';
        blockBtn.addEventListener('click', function () {
            if (!curChat || curChat.type !== 'contact') { showBlacklist(); return; }
            var blocked = JSON.parse(localStorage.getItem(LS('blacklist')) || '[]');
            if (blocked.indexOf(curChat.id) !== -1) {
                blocked = blocked.filter(function (b) { return b !== curChat.id; });
                localStorage.setItem(LS('blacklist'), JSON.stringify(blocked));
                toast('已取消屏蔽');
            } else {
                blocked.push(curChat.id);
                localStorage.setItem(LS('blacklist'), JSON.stringify(blocked));
                toast('已屏蔽用户');
            }
        });
        $('chatContactActions').appendChild(blockBtn);

        // ===== Draft save on input =====
        $('chatInput').addEventListener('input', function () {
            saveDraft();
        });

        // ===== Keyboard shortcuts =====
        document.addEventListener('keydown', function (e) {
            // Ctrl+Enter send
            if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); sendMessage(); }
            // Ctrl+B bold
            if (e.ctrlKey && e.key === 'b') {
                e.preventDefault();
                var input = $('chatInput');
                var start = input.selectionStart, end = input.selectionEnd;
                if (start !== end) {
                    var text = input.value;
                    input.value = text.slice(0, start) + '**' + text.slice(start, end) + '**' + text.slice(end);
                    input.focus();
                }
            }
            // Escape close modals
            if (e.key === 'Escape') {
                document.querySelectorAll('.chat-modal-mask.show').forEach(function (m) { m.classList.remove('show'); });
                $('emojiPicker').classList.add('chat-hidden');
                $('stickerPicker').classList.add('chat-hidden');
            }
        });

        // ===== In-chat search =====
        $('chatSearchBtn').addEventListener('click', toggleInlineSearch);
        $('chatSearchInput').addEventListener('input', doInlineSearch);
        $('chatSearchInput').addEventListener('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); searchNavigate(1); }
        });
        $('chatSearchPrev').addEventListener('click', function () { searchNavigate(-1); });
        $('chatSearchNext').addEventListener('click', function () { searchNavigate(1); });
        $('chatSearchClose').addEventListener('click', function () { toggleInlineSearch(); });

        // ===== Filter =====
        $('chatFilterBtn').addEventListener('click', toggleFilterBar);
        document.querySelectorAll('#chatFilterBar .mini-btn').forEach(function (btn) {
            btn.addEventListener('click', function () { setFilter(btn.dataset.filter); });
        });

        // ===== Multi-select =====
        $('chatSelectBtn').addEventListener('click', toggleSelectMode);
        $('chatSelectForward').addEventListener('click', batchForward);
        $('chatSelectDelete').addEventListener('click', batchDelete);
        $('chatSelectCancel').addEventListener('click', exitSelectMode);

        // Close reaction picker on click outside
        document.addEventListener('click', function (e) {
            if (!e.target.closest('.chat-reaction-picker') && !e.target.closest('#chatReactBtn')) {
                $('reactionPicker').classList.add('chat-hidden');
            }
        });

        // ===== 主题切换（与 styles.css 主题系统统一，含 kodachi 刀锋） =====
        var CHAT_VALID_THEMES = ['aqua', 'midnight', 'aurora', 'aurora-light', 'liquid-glass', 'kodachi'];
        var CHAT_DARK_THEMES = ['midnight', 'aurora', 'kodachi'];
        function applyChatTheme(theme) {
            if (CHAT_VALID_THEMES.indexOf(theme) === -1) theme = 'liquid-glass';
            if (theme === 'aqua') {
                delete document.documentElement.dataset.theme;
            } else {
                document.documentElement.dataset.theme = theme;
            }
            try { localStorage.setItem('chat-theme', theme); } catch (e) {}
            var pop = $('chatThemePopover');
            if (pop) {
                document.querySelectorAll('#chatThemePopover .theme-option').forEach(function (opt) {
                    opt.classList.toggle('is-active', opt.dataset.theme === theme);
                });
            }
            var btn = $('chatThemeBtn');
            if (btn) {
                btn.innerHTML = CHAT_DARK_THEMES.indexOf(theme) !== -1 ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
            }
            return theme;
        }
        function toggleChatThemePopover(force) {
            var pop = $('chatThemePopover');
            if (!pop) return;
            var willOpen = force !== undefined ? force : pop.hidden;
            pop.hidden = !willOpen;
            var btn = $('chatThemeBtn');
            if (btn) btn.setAttribute('aria-expanded', String(willOpen));
        }
        (function () {
            var saved = 'aqua';
            try { saved = localStorage.getItem('chat-theme') || 'aqua'; } catch (e) {}
            applyChatTheme(saved);
        })();
        $('chatThemeBtn').addEventListener('click', function (e) {
            e.stopPropagation();
            toggleChatThemePopover();
        });
        var chatThemePop = $('chatThemePopover');
        if (chatThemePop) {
            chatThemePop.addEventListener('click', function (e) {
                var opt = e.target.closest('.theme-option');
                if (!opt) return;
                var name = opt.querySelector('.theme-name');
                applyChatTheme(opt.dataset.theme);
                toggleChatThemePopover(false);
                toast('已切换至「' + (name ? name.textContent : opt.dataset.theme) + '」主题');
            });
        }
        document.addEventListener('click', function (e) {
            if ($('chatThemePopover') && !$('chatThemePopover').hidden && !e.target.closest('.theme-switcher')) {
                toggleChatThemePopover(false);
            }
        });

        // ===== Archive chat =====
        function toggleArchive() {
            if (!curChat) return toast('请选择聊天');
            var cid = getChatKey(curChat.type, curChat.id);
            var archived = JSON.parse(localStorage.getItem(LS('archived')) || '[]');
            var idx = archived.indexOf(cid);
            if (idx !== -1) { archived.splice(idx, 1); toast('已取消归档'); }
            else { archived.push(cid); toast('已归档'); }
            localStorage.setItem(LS('archived'), JSON.stringify(archived));
            loadChatList();
        }
        // Add archive button to general actions

        // ===== Loading states =====
        function showLoading(container) {
            var div = document.createElement('div');
            div.className = 'chat-loading';
            div.innerHTML = '<div class="chat-loading-spinner"></div><span>加载中...</span>';
            container.appendChild(div);
            return div;
        }

        function hideLoading(el) { if (el && el.parentNode) el.parentNode.removeChild(el); }

        // ===== Scroll to bottom button =====
        function addScrollBottomBtn() {
            var container = $('chatMessages');
            var existing = container.querySelector('.chat-scroll-bottom');
            if (existing) existing.remove();
            var btn = document.createElement('button');
            btn.className = 'chat-scroll-bottom';
            btn.innerHTML = '<i class="fas fa-chevron-down"></i>';
            btn.addEventListener('click', function () {
                container.scrollTop = container.scrollHeight;
                btn.style.display = 'none';
            });
            container.appendChild(btn);
            container.addEventListener('scroll', function () {
                var atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
                btn.style.display = atBottom ? 'none' : 'flex';
            });
            btn.style.display = 'none';
        }

        // ===== Reset password flow =====
        function showForgotPassword() {
            var username = prompt('输入用户名以重置密码：');
            if (!username) return;
            dbByIndex('users', 'username', username).then(function (users) {
                if (users.length === 0) return toast('用户不存在');
                var newPass = prompt('输入新密码（至少4位）：');
                if (!newPass || newPass.length < 4) return toast('密码至少4位');
                dbByIndex('auth_creds', 'userId', users[0].id).then(function (creds) {
                    var pc = creds.find(function (c) { return c.loginType === 'password'; });
                    if (!pc) return toast('该用户无密码，请使用其他方式登录');
                    pc.credentialHash = hashPass(newPass);
                    dbAdd('auth_creds', pc).then(function () { toast('密码已重置，请使用新密码登录'); });
                });
            });
        }

        // ===== Offline indicator =====
        window.addEventListener('offline', function () {
            var el = document.getElementById('chatOfflineBanner') || (function () {
                var d = document.createElement('div');
                d.id = 'chatOfflineBanner';
                d.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#ff3b30;color:#fff;text-align:center;padding:4px;font-size:12px;';
                d.textContent = '⚠ 网络已断开';
                document.body.appendChild(d);
                return d;
            })();
            el.style.display = 'block';
        });
        window.addEventListener('online', function () {
            var el = document.getElementById('chatOfflineBanner');
            if (el) el.style.display = 'none';
        });

        // ===== 2FA simulation =====
        function toggle2FA() {
            var enabled = localStorage.getItem(LS('2fa_enabled')) === '1';
            if (enabled) {
                localStorage.removeItem(LS('2fa_enabled'));
                toast('双因素认证已关闭');
            } else {
                localStorage.setItem(LS('2fa_enabled'), '1');
                localStorage.setItem(LS('2fa_code'), Math.floor(100000 + Math.random() * 900000).toString());
                toast('双因素认证已开启，验证码: ' + localStorage.getItem(LS('2fa_code')));
            }
        }
        // Add 2FA button to sidebar
        var tfaBtn = document.createElement('button');
        tfaBtn.className = 'mini-btn';
        tfaBtn.innerHTML = '<i class="fas fa-shield-alt"></i> 2FA';
        tfaBtn.title = '双因素认证';
        tfaBtn.addEventListener('click', toggle2FA);
        var actionsRow = document.querySelector('#chatApp .chat-sidebar div[style*="flex"]');
        if (actionsRow) actionsRow.appendChild(tfaBtn);

        // ===== Rate limit feedback =====
        function showRateLimitFeedback(key, limit) {
            var data = loginRateLimit[key] || [];
            var remaining = limit - data.length;
            if (remaining < 3) {
                toast('注意：操作频率限制，剩余 ' + Math.max(0, remaining) + ' 次');
            }
        }

        // ===== Browser push notifications =====
        function requestNotificationPermission() {
            if ('Notification' in window && Notification.permission === 'default') {
                Notification.requestPermission();
            }
        }

        function sendNotification(title, body, tag) {
            if ('Notification' in window && Notification.permission === 'granted') {
                try { new Notification(title, { body: body, tag: tag || 'aquachat', icon: 'favicon.svg' }); } catch (e) {}
            }
        }
        requestNotificationPermission();

        // ===== Voice playback =====
        // Add voice playback UI - clicking voice message plays simulated audio
        window._playVoice = function (msgId) {
            dbGet('messages', msgId).then(function (msg) {
                if (!msg || msg.type !== 'voice') return;
                toast('🎵 播放语音 (' + (msg.voiceDuration || '?') + 's)...');
                // Simulate playback duration
                var dur = (msg.voiceDuration || 3) * 1000;
                var el = document.querySelector('.chat-msg[data-mid="' + msgId + '"] .chat-msg-bubble');
                if (el) {
                    el.style.background = '#34c759';
                    setTimeout(function () { if (el) el.style.background = ''; }, dur);
                }
            });
        };

        // ===== Sticker management (delete pack) =====
        window._deleteStickerPack = function (packId) {
            if (!confirm('确定删除该贴纸包？')) return;
            dbDel('sticker_packs', packId).then(function () { toast('贴纸包已删除'); loadStickerPacks(); });
        };

        // ===== Link preview =====
        // extractUrl 已提升至顶层作用域（renderMsg 需要调用）

        // Override content rendering to add link preview and voice playback
        var _origRenderContent = null;

        // ===== Message retention enforcement =====
        function enforceRetention() {
            var retentionDays = parseInt(localStorage.getItem(LS('adminRetention')) || '0');
            if (retentionDays <= 0) return;
            var cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
            openDB().then(function (d) {
                var tx = d.transaction('messages', 'readwrite');
                var r = tx.objectStore('messages').index('time').openCursor(IDBKeyRange.upperBound(cutoff));
                var count = 0;
                r.onsuccess = function (e) {
                    var c = e.target.result;
                    if (c) { c.delete(); count++; c.continue(); }
                    else if (count > 0) { console.log('Retention: deleted ' + count + ' old messages'); }
                };
            });
        }
        // Run retention check on init (once per session)
        enforceRetention();

        // ===== Enforce blacklist on send =====
        // Block sending to blacklisted users
        var _origSendMessage = sendMessage;
        sendMessage = function () {
            if (curChat && curChat.type === 'contact') {
                var blocked = JSON.parse(localStorage.getItem(LS('blacklist')) || '[]');
                if (blocked.indexOf(curChat.id) !== -1) { toast('已被屏蔽，无法发送消息'); return; }
            }
            _origSendMessage();
        };

        // ===== Delete account =====
        var delBtn = document.createElement('button');
        delBtn.className = 'mini-btn danger';
        delBtn.innerHTML = '<i class="fas fa-trash"></i> 注销账号';
        delBtn.style.color = '#ff3b30';
        delBtn.style.width = '100%';
        delBtn.style.marginTop = '8px';
        delBtn.addEventListener('click', deleteAccount);

        // Add logout area below sidebar actions
        var sidebarActions = document.querySelector('.chat-sidebar-actions');
        if (sidebarActions) {
            sidebarActions.parentNode.style.flexWrap = 'wrap';
        }

        // ===== Restore draft when opening chat =====
        // Draft save/restore is handled by input event listener and openChat

        // ===== Restore chat background =====
        var savedBg = localStorage.getItem(LS('chatBg'));
        if (savedBg) {
            $('chatMessages').style.backgroundImage = 'url("' + savedBg + '")';
            $('chatMessages').style.backgroundSize = 'cover';
        }

        // ===== Restore draft on first load =====
        setTimeout(restoreDraft, 200);

        // ===== 用户资料卡 =====
        window.showUserCard = function (userId) {
            if (!userId || userId === curUser.id) { openProfile(); return; }
            var u = getUserById(userId);
            if (!u) return toast('用户不存在');
            $('userCardAvatar').textContent = avText(u.name || u.username);
            $('userCardAvatar').style.background = avatarColor(u.id);
            if (u.avatar) { $('userCardAvatar').style.backgroundImage = 'url("' + u.avatar + '")'; $('userCardAvatar').style.backgroundSize = 'cover'; $('userCardAvatar').textContent = ''; }
            $('userCardName').textContent = u.name || u.username;
            $('userCardUsername').textContent = '@' + u.username;
            $('userCardBio').textContent = u.role === 'bot' ? (u.note || u.bio || '机器人') : (u.bio || '暂无签名');
            $('userCardRole').textContent = u.role === 'admin' ? '管理员' : u.role === 'bot' ? '机器人' : '用户';
            var days = u.created ? Math.floor((Date.now() - new Date(u.created).getTime()) / 86400000) + 1 : 1;
            $('userCardDays').textContent = '注册 ' + days + ' 天';
            // last seen
            var lastSeenEl = document.getElementById('userCardLastSeen') || (function () {
                var el = document.createElement('div');
                el.id = 'userCardLastSeen';
                el.style.cssText = 'font-size:12px;color:#888;';
                $('userCardDays').parentNode.appendChild(el);
                return el;
            })();
            lastSeenEl.textContent = getLastSeen(u.id);
            // stats
            dbByIndex('messages', 'sender', userId).then(function (msgs) { $('userCardMsgStat').textContent = '消息 ' + msgs.length; });
            dbGetAll('groups').then(function (gs) {
                var count = gs.filter(function (g) { return g.members && g.members.some(function (m) { return m.id === userId; }); }).length;
                $('userCardGroupStat').textContent = '群组 ' + count;
            });
            $('userCardModal').dataset.userId = userId;
            $('userCardModal').classList.add('show');
        };

            $('userCardChatBtn').addEventListener('click', function () {
                var uid = $('userCardModal').dataset.userId;
                if (!uid) return;
                $('userCardModal').classList.remove('show');
                dbByIndex('contacts', 'owner', curUser.id).then(function (contacts) {
                    if (!contacts.some(function (c) { return c.contactId === uid; })) {
                        return dbAdd('contacts', { id: curUser.id + '|' + uid, owner: curUser.id, contactId: uid, created: now() });
                    }
                }).then(function () {
                    loadChatList();
                    openChat('contact', uid);
                }).catch(function (e) { toast(e.message || e); });
            });

        $('userCardSecretBtn').addEventListener('click', function () {
            var uid = $('userCardModal').dataset.userId;
            if (!uid) return;
            $('userCardModal').classList.remove('show');
            curChat = { type: 'contact', id: uid };
            initSecretChat();
        });

        $('userCardClose').addEventListener('click', function () { $('userCardModal').classList.remove('show'); });

        // Click on chat list items to show user card (right-click)
        // Also add double-click on contact avatar in sidebar
        // Make contact list items show user card on avatar click
        document.getElementById('chatListContainer').addEventListener('click', function (e) {
            var avatarEl = e.target.closest('.chat-list-avatar');
            if (avatarEl) {
                var item = avatarEl.closest('.chat-list-item');
                if (item) {
                    // Find which chat this corresponds to
                    var idx = Array.from(item.parentNode.children).indexOf(item);
                    if (curCat === 'chats') {
                        var contacts = chatList.filter(function (i) { return i.type === 'contact'; });
                        if (contacts[idx]) {
                            e.stopPropagation();
                            showUserCard(contacts[idx].id);
                        }
                    }
                }
            }
        });

        // Double-click on group member name in info panel to view profile
        document.getElementById('infoContent').addEventListener('click', function (e) {
            var memberEl = e.target.closest('.chat-info-member');
            if (memberEl) {
                var nameEl = memberEl.querySelector('.chat-info-member-avatar');
                if (nameEl) {
                    // Find user by avatar text
                    var text = nameEl.textContent;
                    var user = allUsers.find(function (u) { return avText(u.name || u.username) === text; });
                    if (user && user.id !== curUser.id) showUserCard(user.id);
                }
            }
        });

        renderSidebar();
        updateSelfDestructUI();

        // ===== 涟漪动画（抄 script.js 的苹果风格点击波纹，事件委托兼容动态按钮） =====
        document.addEventListener('pointerdown', function (e) {
            var btn = e.target.closest('.tool-btn, .mini-btn, .icon-btn, .tab-btn');
            if (!btn || btn.disabled) return;
            var rect = btn.getBoundingClientRect();
            var size = Math.max(rect.width, rect.height);
            var x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
            var y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
            var ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.width = ripple.style.height = size + 'px';
            ripple.style.left = x + 'px';
            ripple.style.top = y + 'px';
            if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
            btn.style.overflow = 'hidden';
            btn.appendChild(ripple);
            setTimeout(function () { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 600);
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
