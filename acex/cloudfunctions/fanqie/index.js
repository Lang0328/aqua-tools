'use strict';
/**
 * 番茄小说下载器 —— CloudBase HTTP 云函数 / 本机服务通用后端
 * 仅用于个人备份用途，请遵守相关法律法规与平台服务条款，下载内容请勿传播。
 *
 * 动作(action)：
 *   search?q=关键词|书籍链接|书籍ID  -> 返回书籍列表 [{id,title,author,cover}]
 *   chapters?bookId=xxx              -> 返回章节列表 [{id,title}]
 *   batch?ids=id1,id2,...            -> 返回 [{id,title,content}] (已解密)
 *
 * 可选参数：cookie=xxx  (被拦截时可填入浏览器 Cookie)
 *
 * 说明：番茄小说阅读页正文使用自定义字体加密（Unicode 私有区码点），
 *       通过 charset.json 映射表还原为明文；当前番茄搜索 API 已加签名，
 *       故搜索支持“粘贴书籍页链接/ID”直达，书名搜索可能返回空。
 */
const fs = require('fs');
const path = require('path');

const CHARSET = JSON.parse(fs.readFileSync(path.join(__dirname, 'charset.json'), 'utf8'));
const CODE = [[58344, 58715], [58345, 58716]]; // e3e8~e55b / e3e9~e55c

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const DEFAULT_IID = '466614321180296';

function decodeContent(content) {
  if (!content) return '';
  function dec(mode) {
    let out = '';
    for (const ch of content) {
      const uni = ch.codePointAt(0);
      if (uni >= CODE[mode][0] && uni <= CODE[mode][1]) {
        const bias = uni - CODE[mode][0];
        const c = CHARSET[mode][bias];
        out += (c && c !== '?') ? c : ch;
      } else {
        out += ch;
      }
    }
    return out;
  }
  try { return dec(0); } catch (e) { try { return dec(1); } catch (e2) { return content; } }
}

function stripTags(html) {
  return (html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchText(url, headers, timeout = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      headers: Object.assign({ 'User-Agent': UA, 'Referer': 'https://fanqienovel.com/' }, headers || {}),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// 从输入中解析书籍 ID（支持 fanqienovel.com/page/<id> 或 /reader/<id> 或纯数字）
function parseBookId(s) {
  if (!s) return null;
  const m = s.match(/fanqienovel\.com\/(?:page|reader)\/(\d+)/i);
  if (m) return m[1];
  if (/^\d{10,}$/.test(s.trim())) return s.trim();
  return null;
}

// ---------- 搜索 ----------
async function doSearch(q, cookie) {
  const q2 = (q || '').trim();

  // 1) 直接粘贴了书籍链接 / ID -> 当作单本书，跳到加载章节
  const linkId = parseBookId(q2);
  if (linkId) {
    return { books: [{ id: linkId, title: '(书籍ID: ' + linkId + ')', author: '', cover: '' }], note: '已识别书籍链接/ID，点击加载章节即可下载' };
  }

  // 2) 书名搜索：番茄官方搜索 API 已加签名(100103)，第三方源也无法按关键词精准匹配。
  //    降级为：提示用户粘贴书籍链接/ID，并附上热门书供浏览（明确非搜索结果，避免误导下错书）。
  let hot = [];
  try {
    const txt = await fetchText('https://api.xcvts.cn/api/xiaoshuo/fanqie?q=' + encodeURIComponent(q2), {});
    const data = JSON.parse(txt);
    const list = Array.isArray(data.data) ? data.data : [];
    hot = list.map(b => ({
      id: String(b.book_id || ''),
      title: b.title || '(未知)',
      author: b.author || '',
      cover: b.thumb_url || ''
    })).filter(b => b.id);
  } catch (e) { /* 热门书仅作推荐，失败不阻塞 */ }
  return {
    books: hot,
    hint: '番茄按书名搜索接口已加签名(100103)，第三方源也无法精准匹配关键词，书名搜索暂不可用。请改用「书籍页链接 / ID」直达：在番茄 App 或网页打开书 → 分享 → 复制链接（形如 fanqienovel.com/page/数字），粘贴到此处即可下载。下方为热门书（非搜索结果，点选可直接下载）。'
  };
}

// ---------- 章节列表 ----------
async function doChapters(bookId, cookie) {
  const url = 'https://fanqienovel.com/page/' + encodeURIComponent(bookId);
  const headers = cookie ? { cookie } : {};
  const html = await fetchText(url, headers);

  // 章节链接形如 /reader/<id> ；全页提取并按出现顺序去重
  const re = /href="[^"]*reader\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  const chapters = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (seen.has(id)) continue;
    seen.add(id);
    const title = stripTags(m[2]) || ('第' + (chapters.length + 1) + '章');
    chapters.push({ id, title });
  }
  if (!chapters.length) return { chapters: [], debug: html.slice(0, 500) };
  return { chapters };
}

// ---------- 单章内容（HTML 阅读页 + 解码）----------
async function fetchChapter(id, cookie) {
  const headers = cookie ? { cookie } : {};
  const html = await fetchText('https://fanqienovel.com/reader/' + encodeURIComponent(id), headers);
  const block = html.match(/<div class="muye-reader-content noselect">([\s\S]*?)<\/div>/);
  const inner = block ? block[1] : html;
  const ps = [...inner.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)];
  let content = ps.map(p => stripTags(p[1])).join('\n');
  content = decodeContent(content);
  const titleM = html.match(/<h1[^>]*class="muye-reader-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? stripTags(titleM[1]) : '';
  return { title, content };
}

async function doBatch(ids, cookie) {
  const out = [];
  for (const id of ids) {
    try {
      const c = await fetchChapter(id, cookie);
      out.push({ id, title: c.title, content: c.content });
    } catch (e) {
      out.push({ id, title: '', content: '【本章获取失败：' + e.message + '】' });
    }
  }
  return { chapters: out };
}

// ---------- HTTP 入口 ----------
function send(status, obj, isText, filename) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  };
  if (isText) {
    headers['Content-Type'] = 'text/plain; charset=utf-8';
    if (filename) headers['Content-Disposition'] = 'attachment; filename="' + encodeURIComponent(filename) + '"';
    return { statusCode: status, headers, body: obj };
  }
  headers['Content-Type'] = 'application/json; charset=utf-8';
  return { statusCode: status, isBase64Encoded: false, headers, body: JSON.stringify(obj) };
}

function resolveParams(event) {
  if (event.queryString && typeof event.queryString === 'object') return event.queryString;
  if (event.queryStringParameters) return event.queryStringParameters;
  if (event && typeof event === 'object' && 'action' in event) return event;
  return {};
}

exports.main = async (event, context) => {
  const isHttp = !!(event && (event.httpMethod || event.queryString || event.queryStringParameters));
  try {
    const q = resolveParams(event);
    const action = (q.action || '').toString();
    const cookie = (q.cookie || '').toString().trim();
    let r;
    if (action === 'search') {
      r = await doSearch((q.q || '').toString(), cookie);
    } else if (action === 'chapters') {
      r = await doChapters((q.bookId || '').toString(), cookie);
    } else if (action === 'batch') {
      const ids = (q.ids || '').toString().split(',').map(s => s.trim()).filter(Boolean);
      if (!ids.length) r = { error: '缺少 ids' };
      else r = await doBatch(ids, cookie);
    } else {
      r = { error: '未知 action，支持 search / chapters / batch' };
    }
    return isHttp ? send(200, r) : r;
  } catch (e) {
    return isHttp ? send(500, { error: e.message, stack: e.stack }) : { error: e.message, stack: e.stack };
  }
};
