/**
 * chat-server/sync.js — 同步前端副本
 * 将根目录的 chat.html / chat.css / styles.css / js/ / favicon.svg
 * 复制到 chat-server/public/，并在 chat.html 中注入 api-init.js（开启服务器模式）。
 *
 * 用法：node sync.js （npm run sync）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(__dirname, 'public');

function cp(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log('  ✓ ' + path.relative(ROOT, src));
}

function cpDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  fs.readdirSync(srcDir).forEach(f => {
    const s = path.join(srcDir, f);
    if (fs.statSync(s).isDirectory()) cpDir(s, path.join(destDir, f));
    else cp(s, path.join(destDir, f));
  });
}

console.log('同步前端文件 → chat-server/public/');

const FILES = ['chat.html', 'chat.css', 'styles.css', 'favicon.svg', 'tools.html', 'script.js',
  'login.html', 'desktop.html', 'index.html', 'dataspace.html', 'data.html', 'upload.html',
  'permission.html', 'request.html', 'log.html'];
FILES.forEach(f => {
  const src = path.join(ROOT, f);
  if (fs.existsSync(src)) cp(src, path.join(PUBLIC, f));
});

cpDir(path.join(ROOT, 'js'), path.join(PUBLIC, 'js'));
cpDir(path.join(ROOT, 'css'), path.join(PUBLIC, 'css'));

// 注入 api-init.js（若尚未注入）
const htmlPath = path.join(PUBLIC, 'chat.html');
let html = fs.readFileSync(htmlPath, 'utf8');
if (!html.includes('api-init.js')) {
  html = html.replace(
    '<script src="js/chat.js"></script>',
    '<script src="api-init.js"></script>\n    <script src="js/chat.js"></script>'
  );
  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log('  ✓ chat.html 已注入 api-init.js');
}

// api-init.js：开启服务器模式
fs.writeFileSync(path.join(PUBLIC, 'api-init.js'), "window.AQUA_CHAT_API = '/api';\n", 'utf8');
console.log('  ✓ api-init.js');

console.log('完成。运行 npm start 后访问 http://localhost:3000/chat.html');
