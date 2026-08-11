const puppeteer = require('puppeteer-core');
const EX = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const { hashPass } = require('./db');
const BASE = 'http://localhost:3000';

function api(path, opts, token) {
  opts = opts || {};
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['X-Auth-Token'] = token;
  return fetch(BASE + path, {
    method: opts.method || 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  }).then(r => r.json().catch(() => ({ ok: false, status: r.status })));
}

function nowISO() { return new Date().toISOString(); }

async function loginPage(browser, u, p) {
  const page = await browser.newPage();
  page.on('console', msg => { if (msg.type() === 'error' || /error|fail|warn/i.test(msg.text())) console.log(`[${u} page]`, msg.text()); });
  page.on('pageerror', e => console.log(`[${u} pageerror]`, e.message));
  await page.goto(BASE + '/chat.html', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.type('#loginUser', u);
  await page.type('#loginPass', p);
  await page.evaluate(() => { var b = document.getElementById('loginBtn'); if (b) b.click(); });
  await page.waitForSelector('.chat-main-header', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1500));
  page.userId = await page.evaluate(() => (window._curUid ? window._curUid() : null)); // may be undefined
  return page;
}

(async () => {
  const browser = await puppeteer.launch({ executablePath: EX, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,820'] });
  try {
    const aliceTok = await api('/api/auth', { method: 'POST', body: { type: 'password', username: 'alice', secret: hashPass('123456') } });
    const bobTok = await api('/api/auth', { method: 'POST', body: { type: 'password', username: 'bob', secret: hashPass('123456') } });
    const adminTok = await api('/api/auth', { method: 'POST', body: { type: 'password', username: 'admin', secret: hashPass('admin123') } });
    console.log('tokens ok:', aliceTok.ok, bobTok.ok, adminTok.ok);

    const aliceP = await loginPage(browser, 'alice', '123456');
    const bobP = await loginPage(browser, 'bob', '123456');
    await new Promise(r => setTimeout(r, 1500)); // establish SSE

    const alice = aliceTok.user, bob = bobTok.user;
    // build contact relationship via API
    await api('/api/db/contacts', { method: 'POST', body: { data: { owner: alice.id, contactId: bob.id, created: nowISO() } } }, aliceTok.token);
    await api('/api/db/contacts', { method: 'POST', body: { data: { owner: bob.id, contactId: alice.id, created: nowISO() } } }, bobTok.token);

    // alice opens dm & sends
    console.log('step: waiting alice see bob');
    const aliceSawBob = await aliceP.waitForFunction(() => Array.from(document.querySelectorAll('#chatListContainer .chat-list-item')).some(e => /Bob/.test(e.textContent)), { timeout: 10000 });
    console.log('alice sees bob in list:', aliceSawBob ? 'YES ✓' : 'NO ✗');
    await aliceP.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#chatListContainer .chat-list-item'));
      const it = items.find(e => /Bob/.test(e.textContent));
      if (it) it.click();
    });
    console.log('step: alice clicked bob');
    await new Promise(r => setTimeout(r, 800));
    console.log('step: alice typing');
    await aliceP.type('#chatInput', '浏览器实时消息');
    console.log('step: alice sending');
    await aliceP.evaluate(() => { var b = document.getElementById('chatSendBtn'); if (b) b.click(); });
    console.log('step: alice sent');
    await new Promise(r => setTimeout(r, 1500));

    // bob receives: dm appears in list, open it, find message
    const bobSawList = await bobP.waitForFunction(() => Array.from(document.querySelectorAll('#chatListContainer .chat-list-item')).length > 1, { timeout: 10000 });
    const bobListText = await bobP.evaluate(() => Array.from(document.querySelectorAll('#chatListContainer .chat-list-item')).map(e => e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40)));    console.log('bob list items:', JSON.stringify(bobListText));
    await bobP.evaluate(() => {
      const items = Array.from(document.querySelectorAll('#chatListContainer .chat-list-item'));
      // pick first non-filehelper contact
      const it = items.find(e => !e.querySelector('.chat-list-avatar.filehelper'));
      if (it) it.click();
    });
    await new Promise(r => setTimeout(r, 1200));
    const bobSawMsg = await bobP.waitForFunction(() => Array.from(document.querySelectorAll('.chat-msg-bubble')).some(b => /浏览器实时消息/.test(b.textContent)), { timeout: 8000 });
    console.log('bob sees alice real-time message:', bobSawMsg ? 'YES ✓' : 'NO ✗');

    // admin broadcast -> toast on bob
    await api('/api/admin/broadcast', { method: 'POST', body: { title: '播报', text: '全局实时广播' } }, adminTok.token);
    const toastSeen = await bobP.waitForFunction(() => {
      const t = document.getElementById('chatToast');
      return t && (t.textContent && /播报|全局实时广播/.test(t.textContent));
    }, { timeout: 8000 });
    console.log('bob receives admin broadcast toast:', toastSeen ? 'YES ✓' : 'NO ✗');

    console.log('ALL CHECKS DONE');
  } catch (e) {
    console.error('ERR', e.message);
  } finally {
    await browser.close();
  }
  process.exit(0);
})().catch(e => { console.error('FATAL', e.message); process.exit(1); });
