/**
 * Aqua Desktop · 收藏中心
 * - 独立工具页：右下角浮动「收藏到桌面」按钮
 * - tools.html：侧边栏每个子工具注入收藏星标，并支持 ?tool= 深链
 * 收藏数据统一存于 localStorage['aquaFavorites']
 */
(function () {
    'use strict';

    const FAV_KEY = 'aquaFavorites';
    const REV_KEY = FAV_KEY + ':rev';

    // 独立工具页注册表：当前文件名 -> 元数据
    const PAGE_REGISTRY = {
        'novel.html':      { name: '小说下载',     icon: 'fa-book' },
        'data.html':       { name: '数据安全查询', icon: 'fa-database' },
        'dataspace.html':  { name: '可信数据空间', icon: 'fa-share-nodes' },
        'request.html':    { name: '数据授权申请', icon: 'fa-file-signature' },
        'log.html':        { name: '访问日志',     icon: 'fa-clipboard-list' },
        'permission.html': { name: '权限管理',     icon: 'fa-user-shield' },
        'upload.html':     { name: '数据上传',     icon: 'fa-upload' },
        'register.html':   { name: '注册',         icon: 'fa-user-plus' },
        'login.html':      { name: '登录',         icon: 'fa-right-to-bracket' }
    };

    const STAR_EMPTY = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z"/></svg>';
    const STAR_FILLED = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9l-5.25 2.76 1-5.86L3.5 9.66l5.9-.86z"/></svg>';

    // ---------- 数据读写 ----------
    function getFavs() {
        try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; }
        catch (e) { return []; }
    }
    function setFavs(list) {
        try {
            localStorage.setItem(FAV_KEY, JSON.stringify(list));
            localStorage.setItem(REV_KEY, String(Date.now())); // 触发跨页 storage 事件
        } catch (e) {}
    }
    function isFav(id) { return getFavs().some(f => f.id === id); }
    function addFav(item) {
        const list = getFavs();
        if (!list.some(f => f.id === item.id)) { list.push(item); setFavs(list); }
    }
    function removeFav(id) { setFavs(getFavs().filter(f => f.id !== id)); }
    function toggleFav(item) { isFav(item.id) ? removeFav(item.id) : addFav(item); }

    // 暴露给桌面（可选）
    window.AquaFavorites = { get: getFavs, isFav, addFav, removeFav, toggleFav };

    // ---------- 轻量提示 ----------
    function toast(msg) {
        const pageToast = document.getElementById('toast');
        if (pageToast) { // 复用页面原生 toast（如 tools.html）
            if (!pageToast.querySelector('.toast-msg')) {
                pageToast.innerHTML = '<i class="fas toast-icon"></i><span class="toast-msg"></span><div class="toast-bar"></div>';
            }
            pageToast.querySelector('.toast-icon').className = 'fas fa-check-circle toast-icon';
            pageToast.querySelector('.toast-msg').textContent = msg;
            const bar = pageToast.querySelector('.toast-bar');
            if (bar) { bar.style.animation = 'none'; bar.offsetHeight; bar.style.animation = ''; }
            pageToast.className = 'toast show success';
            clearTimeout(pageToast._timer);
            pageToast._timer = setTimeout(() => pageToast.classList.remove('show'), 2500);
            return;
        }
        let t = document.getElementById('aquaFavToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'aquaFavToast';
            t.style.cssText = 'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:99999;' +
                'background:rgba(28,34,51,.92);color:#fff;padding:10px 18px;border-radius:12px;font-size:13px;' +
                'box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;';
            document.body.appendChild(t);
        }
        t.textContent = msg;
        t.style.opacity = '1';
        t.style.transform = 'translateX(-50%) translateY(0)';
        clearTimeout(t._timer);
        t._timer = setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateX(-50%) translateY(8px)'; }, 1800);
    }

    // ---------- 注入样式 ----------
    function injectStyle() {
        const css = `
        .aqua-fav-btn{
            position:fixed; right:24px; bottom:24px; z-index:9999;
            width:52px; height:52px; border-radius:50%;
            border:1px solid rgba(255,255,255,.75); background:rgba(255,255,255,.6);
            box-shadow:0 10px 30px rgba(31,38,135,.2); color:#1c2233;
            cursor:pointer; display:grid; place-items:center;
            transition:transform .2s, background .2s, color .2s;
            -webkit-backdrop-filter:blur(10px); backdrop-filter:blur(10px);
        }
        .aqua-fav-btn:hover{ background:rgba(255,255,255,.85); transform:scale(1.06); }
        .aqua-fav-btn.active{ color:#ffb020; background:rgba(255,255,255,.85); }
        .aqua-fav-star{
            position:absolute; right:8px; top:50%; transform:translateY(-50%);
            width:22px; height:22px; border:none; background:transparent; color:#9aa3b8;
            cursor:pointer; display:grid; place-items:center; opacity:0;
            transition:opacity .15s, color .15s; z-index:2;
        }
        .nav-item{ position:relative; }
        .nav-item:hover .aqua-fav-star, .aqua-fav-star.active{ opacity:1; }
        .aqua-fav-star:hover{ color:#ffb020; }
        .aqua-fav-star.active{ color:#ffb020; }
        .fav-hint{ display:block; margin-top:6px; font-size:.82rem; color:var(--text-muted); }
        .fav-hint::before{ content:"收藏："; color:#5b6cff; font-weight:600; }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        document.head.appendChild(style);
    }

    function currentFile() { return location.pathname.split('/').pop(); }

    // ---------- 独立工具页：浮动收藏按钮 ----------
    function setupPageButton() {
        const file = currentFile();
        const meta = PAGE_REGISTRY[file];
        if (!meta) return;
        const id = file.replace(/\.html$/, '');
        const item = { id, name: meta.name, icon: meta.icon, href: file, kind: 'page' };
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'aqua-fav-btn' + (isFav(id) ? ' active' : '');
        btn.setAttribute('aria-label', isFav(id) ? '取消收藏' : '收藏到桌面');
        btn.innerHTML = isFav(id) ? STAR_FILLED : STAR_EMPTY;
        btn.addEventListener('click', () => {
            toggleFav(item);
            const on = isFav(id);
            btn.classList.toggle('active', on);
            btn.innerHTML = on ? STAR_FILLED : STAR_EMPTY;
            toast(on ? '已收藏到桌面' : '已取消收藏');
        });
        document.body.appendChild(btn);
    }

    // ---------- tools.html：侧边栏子工具收藏星标 ----------
    function setupToolFavorites() {
        const navs = Array.from(document.querySelectorAll('.nav-item'));
        navs.forEach(nav => {
            const tool = nav.dataset.tool;
            if (!tool || tool === 'home' || tool === 'data-space') return; // 概览/子系统不收藏
            const id = 'tools:' + tool;
            const label = (nav.textContent || tool).trim() || tool;
            const ic = nav.querySelector('i');
            const icon = ic ? (ic.className.match(/fa-[a-z0-9-]+/g) || ['fa-puzzle-piece']).pop() : 'fa-puzzle-piece';
            const item = { id, name: label, icon: icon || 'fa-puzzle-piece', href: 'tools.html?tool=' + tool, kind: 'tool' };
            const star = document.createElement('span');
            star.className = 'aqua-fav-star' + (isFav(id) ? ' active' : '');
            star.setAttribute('role', 'button');
            star.setAttribute('tabindex', '0');
            star.setAttribute('aria-label', isFav(id) ? '取消收藏' : '收藏到桌面');
            star.innerHTML = isFav(id) ? STAR_FILLED : STAR_EMPTY;
            const toggle = (e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFav(item);
                const on = isFav(id);
                star.classList.toggle('active', on);
                star.innerHTML = on ? STAR_FILLED : STAR_EMPTY;
                toast(on ? '已收藏：' + label : '已取消收藏：' + label);
            };
            star.addEventListener('click', toggle);
            star.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') toggle(e); });
            nav.appendChild(star);
        });
    }

    // ---------- tools.html：给每个工具简介追加收藏说明 ----------
    function appendToolFavHints() {
        document.querySelectorAll('.tool-panel .tool-header p').forEach(p => {
            if (p.querySelector('.fav-hint')) return;
            const hint = document.createElement('span');
            hint.className = 'fav-hint';
            hint.textContent = '点左侧导航本项星标，可加到桌面，下次一键直达。';
            p.appendChild(hint);
        });
    }

    // ---------- tools.html：?tool= 深链 ----------
    function handleDeepLink() {
        const tool = new URLSearchParams(location.search).get('tool');
        if (!tool) return;
        const tryClick = () => {
            const nav = document.querySelector('.nav-item[data-tool="' + tool + '"]');
            if (nav) { nav.click(); }
            else { setTimeout(tryClick, 60); }
        };
        tryClick();
    }

    function init() {
        injectStyle();
        const file = currentFile();
        if (PAGE_REGISTRY[file]) setupPageButton();
        if (file === 'tools.html') { setupToolFavorites(); handleDeepLink(); appendToolFavHints(); }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
