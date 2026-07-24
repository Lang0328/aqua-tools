/*
 * 统一 SVG 图标库（黑白线条简约风格）
 *
 * 用法:
 *   在 HTML 中: <span class="ico" data-ico="lock"></span>
 *   页面加载后自动渲染为 SVG
 *
 *   在 JS 中:   Icon.get("lock")  返回 SVG 字符串
 *
 * 图标列表:
 *   lock      锁
 *   unlock    开锁
 *   key       钥匙
 *   shield    盾牌
 *   file      文件
 *   folder    文件夹
 *   search    搜索
 *   globe     地球
 *   scroll    卷轴
 *   hospital  医院
 *   user      用户
 *   upload    上传
 *   download  下载
 *   edit      编辑/申请
 *   compass   指南针
 *   clipboard 剪贴板
 *   check     对勾
 *   cross     叉号
 *   warn      警告
 *   ban       禁止
 *   info      信息
 */

var Icon = (function() {

    // 通用 SVG 模板：24x24 viewBox，stroke=currentColor，无填充
    function svg(path) {
        return '<svg class="svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle">' + path + '</svg>';
    }

    var icons = {
        lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
        unlock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/>'),
        key: svg('<circle cx="8" cy="15" r="4"/><path d="M10.8 12.2 20 3"/><path d="M15 8l3 3"/><path d="M18 5l2 2"/>'),
        shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'),
        file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9 17h6"/>'),
        folder: svg('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
        search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
        globe: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/>'),
        scroll: svg('<path d="M8 21h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2z"/><path d="M6 3h12v4H6z"/><path d="M10 12h6"/><path d="M10 16h4"/>'),
        hospital: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M12 8v6"/><path d="M9 11h6"/>'),
        user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2"/>'),
        upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
        download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
        edit: svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
        compass: svg('<circle cx="12" cy="12" r="10"/><path d="M16 8l-2 6-6 2 2-6z"/>'),
        clipboard: svg('<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6"/><path d="M9 16h4"/>'),
        check: svg('<path d="M20 6L9 17l-5-5"/>'),
        cross: svg('<path d="M18 6L6 18"/><path d="M6 6l12 12"/>'),
        warn: svg('<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
        ban: svg('<circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/>'),
        info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
        database: svg('<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 5v14c0 1.7-4 3-9 3s-9-1.3-9-3V5"/><path d="M21 12c0 1.7-4 3-9 3s-9-1.3-9-3"/>'),
        link: svg('<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>'),
        arrowRight: svg('<path d="M5 12h14"/><path d="M12 5l7 7-7 7"/>')
    };

    return {
        get: function(name) {
            return icons[name] || "";
        },
        // 初始化页面中所有 [data-ico] 元素
        init: function() {
            var els = document.querySelectorAll("[data-ico]");
            for (var i = 0; i < els.length; i++) {
                var name = els[i].getAttribute("data-ico");
                els[i].innerHTML = icons[name] || "";
            }
        }
    };
})();

// 立即渲染图标（如果DOM已就绪），否则等DOMContentLoaded
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function() {
        Icon.init();
        if (document.documentElement.style.opacity === "0") {
            document.documentElement.style.opacity = "1";
        }
    });
} else {
    Icon.init();
}