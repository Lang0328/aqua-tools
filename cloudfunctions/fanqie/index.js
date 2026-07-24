'use strict';
/**
 * 番茄小说下载器 —— CloudBase HTTP 云函数
 * 仅用于个人备份用途，请遵守相关法律法规与平台服务条款，下载内容请勿传播。
 *
 * 动作(action)：
 *   search?q=关键词         -> 返回书籍列表 [{id,title,author,cover}]
 *   chapters?bookId=xxx     -> 返回章节列表 [{id,title}]
 *   batch?ids=id1,id2,...   -> 返回 [{id,title,content}] (已解密)
 *
 * 可选参数：cookie=xxx  (读者页/搜索被拦截时可填入浏览器 Cookie)
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

// ---------- 搜索 ----------
async function doSearch(q, cookie) {
  const params = new URLSearchParams({
    query: q, aid: '1967', channel: '0', os_version: '0',
    device_type: '0', device_platform: '0', iid: DEFAULT_IID,
    passback: '0', version_code: '999'
  });
  const url = 'https://api5-normal-lf.fqnovel.com/reading/bookapi/search/page/v/?' + params.toString();
  const headers = cookie ? { cookie } : {};
  const txt = await fetchText(url, headers);
  let data;
  try { data = JSON.parse(txt); } catch (e) { return { books: [], debug: txt.slice(0, 500) }; }

  const list = data.data && (data.data.books || data.data.items) || data.books || data.items || [];
  const books = list.map(b => ({
    id: b.book_id || b.id || b.bookId || '',
    title: b.book_name || b.title || b.name || '(未知)',
    author: b.author || b.author_name || b.pen_name || '',
    cover: b.cover || b.cover_url || b.thumb || ''
  })).filter(b => b.id);

  if (!books.length) return { books: [], debug: JSON.stringify(data).slice(0, 800) };
  return { books };
}

// ---------- 章节列表 ----------
async function doChapters(bookId, cookie) {
  const url = 'https://fanqienovel.com/page/' + encodeURIComponent(bookId);
  const headers = cookie ? { cookie } : {};
  const html = await fetchText(url, headers);

  // 章节链接形如 /reader/<id> ；优先在 chapter 容器内查找
  const chapterBlock = html.match(/<div[^>]*class="chapter"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const scope = chapterBlock ? chapterBlock[1] : html;
  const re = /href="[^"]*reader\/(\d+)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set();
  const chapters = [];
  let m;
  while ((m = re.exec(scope)) !== null) {
    const id = m[1];
    const title = stripTags(m[2]) || ('第' + (chapters.length + 1) + '章');
    if (seen.has(id)) continue;
    seen.add(id);
    chapters.push({ id, title });
  }
  if (!chapters.length) return { chapters: [], debug: html.slice(0, 500) };
  return { chapters };
}

// ---------- 单章内容 ----------
async function fetchChapter(id, cookie) {
  const headers = cookie ? { cookie } : {};
  // 1) JSON 接口
  try {
    const txt = await fetchText('https://fanqienovel.com/api/reader/full?itemId=' + encodeURIComponent(id), headers);
    const data = JSON.parse(txt);
    const cd = data && data.data && data.data.chapterData;
    if (cd && cd.content) {
      const title = cd.title || '';
      return { title: stripTags(title), content: decodeContent(stripTags(cd.content)) };
    }
  } catch (e) { /* 落到 HTML */ }

  // 2) 阅读页 HTML
  const html = await fetchText('https://fanqienovel.com/reader/' + encodeURIComponent(id), headers);
  const block = html.match(/<div[^>]*class="muye-reader-content[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  const raw = block ? block[1] : html;
  const titleM = html.match(/<h1[^>]*class="muye-reader-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const title = titleM ? stripTags(titleM[1]) : '';
  return { title: stripTags(title), content: decodeContent(stripTags(raw)) };
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
