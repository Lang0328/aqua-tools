/**
 * Aqua Tools · 清新工具箱
 * 天蓝渐变 + 液态玻璃主题
 */

(function() {
    'use strict';

    // ============================================
    // 工具函数
    // ============================================
    const $ = (s, c = document) => c.querySelector(s);
    const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));

    // 常量（避免魔法数字）
    const TOAST_DURATION_MS = 2500;

    function showToast(msg, type = 'success') {
        const toast = $('#toast');
        const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        // 构建稳定结构：图标 + 文本节点 + 进度条，msg 用 textContent 防 XSS
        if (!toast.querySelector('.toast-msg')) {
            toast.innerHTML = '<i class="fas toast-icon"></i><span class="toast-msg"></span><div class="toast-bar"></div>';
        }
        toast.querySelector('.toast-icon').className = `fas ${iconClass} toast-icon`;
        toast.querySelector('.toast-msg').textContent = msg;
        // 重置进度条动画
        const bar = toast.querySelector('.toast-bar');
        if (bar) {
            bar.style.animation = 'none';
            bar.offsetHeight; // 触发回流
            bar.style.animation = '';
        }
        toast.className = `toast show ${type}`;
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('show'), TOAST_DURATION_MS);
    }

    async function copyText(text) {
        if (!text || text === '—') {
            showToast('没有可复制的内容', 'error');
            return false;
        }
        try {
            await navigator.clipboard.writeText(text);
            showToast('已复制到剪贴板');
            return true;
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                showToast('已复制到剪贴板');
                document.body.removeChild(ta);
                return true;
            } catch {
                document.body.removeChild(ta);
                showToast('复制失败', 'error');
                return false;
            }
        }
    }

    /**
     * rAF 节流：将高频事件（mousemove/scroll/resize）收敛到每帧一次，提升性能
     * 返回的函数会在下一动画帧执行回调，重复调用只触发一次
     */
    function rafThrottle(fn) {
        let ticking = false;
        return (...args) => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                fn(...args);
            });
        };
    }

    function escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * 净化富文本 HTML：移除脚本/样式/嵌入对象与事件处理器、javascript: 协议
     * 用于渲染 Markdown 等可信度较低的 HTML，防止 XSS
     */
    function sanitizeHTML(html) {
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        tpl.content.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach(el => el.remove());
        tpl.content.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                const name = attr.name.toLowerCase();
                const val = attr.value.trim().toLowerCase();
                if (name.startsWith('on') || val.startsWith('javascript:')) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return tpl.innerHTML;
    }

    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    // ============================================
    // 苹果风格动效辅助函数
    // ============================================

    // 1. 涟漪效果（点击波纹）
    function createRipple(e, element) {
        const rect = element.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = (e.clientX || rect.left + rect.width / 2) - rect.left - size / 2;
        const y = (e.clientY || rect.top + rect.height / 2) - rect.top - size / 2;
        
        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.width = ripple.style.height = size + 'px';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        
        // 确保容器有定位
        if (getComputedStyle(element).position === 'static') {
            element.style.position = 'relative';
        }
        element.style.overflow = 'hidden';
        
        element.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // 给按钮添加涟漪
    function attachRipple(selector) {
        $$(selector).forEach(btn => {
            btn.addEventListener('pointerdown', (e) => {
                createRipple(e, btn);
            });
        });
    }

    // 2. 数字变化弹跳动画
    function bumpNumber(el) {
        el.classList.remove('bump');
        void el.offsetWidth; // 触发重排
        el.classList.add('bump');
        setTimeout(() => el.classList.remove('bump'), 400);
    }

    // 3. 复制按钮成功反馈
    function showCopyFeedback(btn) {
        btn.classList.add('copied');
        const originalHTML = btn.innerHTML;
        const isSmall = btn.classList.contains('small');
        btn.innerHTML = isSmall ? '<i class="fas fa-check"></i>' : '<i class="fas fa-check"></i> 已复制';
        setTimeout(() => {
            btn.classList.remove('copied');
            btn.innerHTML = originalHTML;
        }, 1200);
    }

    // ============================================
    // 工具信息库（用于信息弹窗）
    // ============================================
    const toolInfo = {
        'home': {
            icon: 'fa-home',
            title: '主页',
            desc: '工具集总览，按类别浏览所有工具，点击卡片快速跳转。',
            tips: ['使用顶部筛选标签按类别筛选', '鼠标悬停卡片查看动画效果', '点击卡片直接进入对应工具']
        },
        'json': {
            icon: 'fa-code',
            title: 'JSON 格式化',
            desc: '用于美化、压缩、转义、校验 JSON 数据。开发与调试 API 接口时非常实用。',
            tips: ['左侧输入 JSON，右侧实时显示结果', '支持格式化（缩进美化）和压缩（单行）', '校验模式会检查 JSON 语法是否正确', '支持 Unicode 转义与反转义']
        },
        'markdown': {
            icon: 'fa-markdown',
            brand: true,
            title: 'Markdown 编辑器',
            desc: '所见即所得的 Markdown 编辑器，左侧编写右侧实时预览渲染结果，适合写文档与笔记。',
            tips: ['工具栏按钮可快速插入格式', '支持代码块、表格、引用等标准语法', '复制源码后可粘贴到任何 Markdown 平台']
        },
        'regex': {
            icon: 'fa-asterisk',
            title: '正则表达式测试',
            desc: '实时测试 JavaScript 正则表达式的匹配结果，高亮显示匹配位置。',
            tips: ['g = 全局匹配；i = 忽略大小写；m = 多行模式；s = 单行模式', '可点击标志芯片快速切换', '支持显示匹配分组（捕获组）']
        },
        'base64': {
            icon: 'fa-exchange-alt',
            title: 'Base64 编解码',
            desc: '对文本或文件进行 Base64 编码与解码，常用于数据传输与嵌入图片。',
            tips: ['文本模式处理字符串；文件模式处理任意文件', '完全在本地完成，文件不上传', '可使用「互换」按钮快速反转输入输出']
        },
        'hash': {
            icon: 'fa-fingerprint',
            title: '哈希计算',
            desc: '使用 Web Crypto API 计算文本的 SHA-256 / SHA-384 / SHA-512 哈希值，常用于数据校验与密码存储。',
            tips: ['哈希是单向函数，无法反向还原原文', 'SHA-256 是最常用的安全哈希算法', '适合校验文件或文本完整性']
        },
        'snippets': {
            icon: 'fa-code-branch',
            title: '代码片段管理',
            desc: '保存常用代码片段到本地，支持搜索、分类、多语言高亮。数据持久化在浏览器 localStorage 中。',
            tips: ['片段保存在浏览器本地，关闭页面不丢失', '支持 JavaScript / Python / Go / Rust 等 10 种语言', '可按标题或代码内容搜索', '适合保存常用工具函数、配置模板']
        },
        'cron': {
            icon: 'fa-clock-rotate-left',
            title: 'Cron 表达式生成器',
            desc: '可视化构建 Linux Cron 定时任务表达式，支持预设、字段构建、未来执行时间预测。',
            tips: ['Cron 表达式由 5 个字段组成：分 时 日 月 周', '* 表示任意值，*/N 表示每 N 个单位', '可点击预设快速选择常用表达式', '自动计算未来 5 次执行时间']
        },
        'http-status': {
            icon: 'fa-globe',
            title: 'HTTP 状态码速查',
            desc: '查询所有 HTTP 状态码的含义、使用场景与分类。支持关键词搜索。',
            tips: ['1xx 信息响应，2xx 成功，3xx 重定向', '4xx 客户端错误，5xx 服务端错误', '可搜索状态码数字或关键词如 "Not Found"', '点击卡片复制完整信息']
        },
        'timestamp': {
            icon: 'fa-stopwatch',
            title: 'Unix 时间戳转换',
            desc: '在 Unix 时间戳与人类可读日期之间互转，支持秒和毫秒单位。',
            tips: ['Unix 时间戳是从 1970-01-01 UTC 起的秒数', 'JavaScript Date.now() 返回毫秒', '可快速跳转到"现在"、"今天"、"一周后"等时间点', '顶部显示当前时间戳实时更新']
        },
        'word-count': {
            icon: 'fa-align-left',
            title: '字数统计',
            desc: '实时统计文本的字符数、单词数、行数、段落数与阅读时间。',
            tips: ['阅读时间按每分钟 200 词估算', '「无空格字符」用于统计实际文字量', '适合编辑文章时控制篇幅']
        },
        'text-diff': {
            icon: 'fa-code-branch',
            title: '文本对比',
            desc: '逐行对比两段文本的差异，使用颜色高亮新增与删除行。',
            tips: ['绿色 = 新增，红色 = 删除', '适用于代码审查、文档版本对比', '显示总计 +增加 / -删除 行数']
        },
        'lorem': {
            icon: 'fa-paragraph',
            title: '占位文本生成',
            desc: '快速生成 Lorem Ipsum 或中文占位文本，用于设计稿与排版测试。',
            tips: ['可生成段落、句子或单词', '支持中英文两种语言', '适合设计师与前端快速填充内容']
        },
        'color-picker': {
            icon: 'fa-eye-dropper',
            title: '颜色选择器',
            desc: '选取颜色并同时显示 HEX、RGB、HSL 三种格式，方便在代码中使用。',
            tips: ['HEX 用于 CSS 颜色', 'RGB 用于 JS 与设计软件', 'HSL 便于调整亮度与饱和度']
        },
        'palette-gen': {
            icon: 'fa-palette',
            title: '调色板生成',
            desc: '基于一个基础颜色生成和谐配色方案，遵循色彩理论。',
            tips: ['类似色：相邻色相，柔和统一', '互补色：对比强烈，视觉冲击', '三角色：平衡丰富', '单色阶：同一色相不同明度']
        },
        'gradient': {
            icon: 'fa-fill-drip',
            title: '渐变生成器',
            desc: '可视化创建 CSS 线性或径向渐变，一键复制 CSS 代码。',
            tips: ['线性渐变可调角度 0-360°', '径向渐变从中心向外扩散', '生成的代码可直接用于 background 属性']
        },
        'image-compress': {
            icon: 'fa-image',
            title: '图片压缩',
            desc: '本地压缩 JPG/PNG/WebP 图片，支持质量调节、格式转换与尺寸限制。',
            tips: ['质量越低文件越小，但会损失清晰度', 'WebP 格式压缩比高，兼容性较好', '限制最大宽度可大幅减小移动端图片体积', '所有处理在浏览器完成，图片不上传']
        },
        'qr-code': {
            icon: 'fa-qrcode',
            title: '二维码生成',
            desc: '将文本或网址转换为二维码，可下载为 PNG 图片。',
            tips: ['适合分享链接、WiFi 密码、联系方式', '可自定义前景色与背景色', '尺寸越大扫描越清晰']
        },
        'color-picker-image': {
            icon: 'fa-eye',
            title: '图片取色器',
            desc: '从图片中提取颜色值。鼠标悬停显示放大镜预览，点击记录颜色。',
            tips: ['悬停查看像素颜色，点击固定到历史记录', '放大镜方便精准取色', '历史记录最多保留 12 种颜色']
        },
        'unit-convert': {
            icon: 'fa-ruler-combined',
            title: '单位换算',
            desc: '在公制、英制等单位间进行换算，覆盖长度、重量、温度、面积、数据存储五大类。',
            tips: ['温度支持摄氏度、华氏度、开尔文', '数据存储采用二进制（1KB = 1024B）', '点击中间按钮可快速反转方向']
        },
        'password': {
            icon: 'fa-key',
            title: '密码生成器',
            desc: '使用加密安全的随机数生成密码，实时评估强度。',
            tips: ['建议密码长度 ≥ 16 位', '混合大小写、数字、符号强度更高', '使用 crypto.getRandomValues 确保随机性']
        },
        'pomodoro': {
            icon: 'fa-clock',
            title: '番茄钟',
            desc: '基于番茄工作法的时间管理工具，25 分钟专注 + 5 分钟休息，循环提升效率。',
            tips: ['专注 25 分钟 + 短休 5 分钟为一轮', '完成 4 轮可进行一次长休息 15 分钟', '时间到会播放提示音提醒']
        },
        'file-transfer': {
            icon: 'fa-share-alt',
            title: '文件快传',
            desc: '基于 WebRTC 的点对点加密文件传输，无需服务器中转。发送方生成取件码，接收方输入取件码即可下载。',
            tips: ['发送方选择文件后自动生成取件码', '接收方输入取件码建立 P2P 连接', '文件加密传输，不经过任何服务器', '支持任意格式，最大 2GB']
        },
        'encrypted-chat': {
            icon: 'fa-comment-dots',
            title: '加密聊天',
            desc: '基于 WebRTC DataChannel 的端到端加密点对点聊天。创建房间生成邀请码，对方加入即可开始加密对话，消息使用 AES-GCM 加密。',
            tips: ['创建房间后生成邀请码', '将邀请码发给对方，对方点击"加入房间"粘贴', '消息通过 WebRTC 直连，端到端加密', '无需服务器，断开连接即销毁']
        },
        'online-terminal': {
            icon: 'fa-terminal',
            title: '在线终端',
            desc: '浏览器内 JavaScript 沙箱终端，可执行 date、calc、uuid、base64 等安全命令。不会访问你的操作系统。',
            tips: ['输入 help 查看所有可用命令', 'calc 后接表达式可计算数学题', 'uuid 生成唯一标识符', '所有命令在沙箱内执行，安全无害']
        },
        'kms': {
            icon: 'fa-key',
            title: 'KMS 激活向导',
            desc: '为已购买合法批量授权的用户生成 Windows/Office 激活命令。三步完成：选择产品 → 填写服务器 → 复制命令执行。',
            tips: ['仅用于已购买合法授权的用户', '需以管理员身份运行 CMD', 'KMS 激活有效期 180 天，自动续期', '可自建 KMS 服务器（开源项目 vlmcsd）']
        },
        'backup': {
            icon: 'fa-database',
            title: '本地备份箱',
            desc: '基于浏览器 IndexedDB 的本地文件管理。可上传、下载、搜索、清空文件，所有数据保存在本地浏览器中。',
            tips: ['文件存储在浏览器本地，关闭页面不丢失', '支持多文件批量上传', '可搜索文件名快速定位', '清空浏览器数据将删除所有文件']
        },
        'opensource': {
            icon: 'fa-book',
            title: '开源广场',
            desc: '本地知识库管理系统，可创建栏目、发布文章笔记。所有内容保存在浏览器 localStorage 中，支持搜索与编辑。',
            tips: ['点击"新建栏目"创建分类', '在栏目下发布文章笔记', '支持随时编辑与删除', '数据保存在本地，可随时导出']
        },
        'reader': {
            icon: 'fa-book-open',
            title: '小说阅读器',
            desc: '导入 TXT / EPUB / HTML / Markdown 等格式文件，自动转换为纯文本阅读。支持字号、行距、夜间/护眼主题切换，章节目录跳转，进度记忆。',
            tips: ['EPUB 会自动解压并提取章节文本', 'TXT 文件按"第X章"等模式自动识别章节', '可一键导出为纯文本 TXT', '阅读进度自动记忆', '支持夜间 / 护眼 / 默认三种主题']
        },
        'deai': {
            icon: 'fa-wand-magic-sparkles',
            title: '文本润色（去AI味）',
            desc: '基于去AI味规则库去除 AI 写作痕迹：修复最毒句式、替换高频词、精简连接词、删套路开头结尾、规范标点（冒号/破折号/双引号），并给出 AI 味等级与诊断报告。',
            tips: ['新增「最毒句式」修复：不是A而是B、带着…、心中涌起…、眼中闪过…等', '禁用标点：冒号→逗号、破折号→逗号、双引号→「」', '处理后会给出 AI 味等级（轻度/中度/重度）与命中明细', '纯本地处理，文本不会上传，建议处理后再人工微调']
        },
        'watermark': {
            icon: 'fa-stamp',
            title: '图片去水印',
            desc: '上传图片后在画面上框选水印区域，使用马赛克、模糊或邻近填充在本地去除水印，处理全程不上传图片。',
            tips: ['按住鼠标拖拽框选水印区域', '可切换马赛克 / 模糊 / 邻近填充三种方式', '强度越大遮盖越明显', '「还原」可恢复到原图，处理满意后点「下载」']
        },
        'poster': {
            icon: 'fa-panorama',
            title: '海报生成器',
            desc: '输入标题文案、选择配色方案与尺寸比例，基于 Canvas 实时生成渐变海报，可导出高清 PNG。',
            tips: ['支持 3:4 / 1:1 / 9:16 / 16:9 多种比例', '提供多套精选配色', '可选择居中、左对齐、底部三种版式', '导出为 2 倍分辨率，适合直接分享']
        },
        'design-ref': {
            icon: 'fa-swatchbook',
            title: '设计风格参考卡',
            desc: '收录常见视觉设计风格的配色、字体与关键词，帮助快速找灵感，点击色块即可复制色值。',
            tips: ['涵盖极简、玻璃拟态、新拟态、赛博朋克等风格', '点击任意色块复制 HEX', '可作为配色与字体搭配参考', '适合快速确定项目视觉基调']
        },
        'dev-boards': {
            icon: 'fa-microchip',
            title: '开发板百科',
            desc: '涵盖 Arduino、树莓派、ESP32、STM32 等 15+ 主流开发板的详细参数、优缺点与适用场景，小白也能看懂。',
            tips: ['按品牌/架构分类筛选', '展开卡片查看完整参数表', '含难度评级和推荐指数', '适合选型对比与入门学习']
        }
    };

    // ============================================
    // 信息弹窗
    // ============================================
    const infoModal = $('#infoModal');
    const infoModalOverlay = $('#infoModalOverlay');
    const infoModalClose = $('#infoModalClose');

    function showInfo(toolId) {
        const info = toolInfo[toolId];
        if (!info) {
            if (toolId === 'home') {
                showInfo('home');
                return;
            }
            return;
        }
        const icon = $('#infoModalIcon');
        icon.innerHTML = `<i class="${info.brand ? 'fab' : 'fas'} ${info.icon}"></i>`;
        $('#infoModalTitle').textContent = info.title;
        $('#infoModalDesc').textContent = info.desc;
        
        const tipsEl = $('#infoModalTips');
        if (info.tips && info.tips.length) {
            tipsEl.innerHTML = `
                <div class="info-modal-tips-title"><i class="fas fa-lightbulb"></i>使用提示</div>
                <ul>${info.tips.map(t => `<li>${escapeHtml(t)}</li>`).join('')}</ul>
            `;
            tipsEl.style.display = 'block';
        } else {
            tipsEl.style.display = 'none';
        }
        infoModal.classList.add('show');
    }

    function hideInfo() {
        infoModal.classList.remove('show');
    }

    infoModalClose.addEventListener('click', hideInfo);
    infoModalOverlay.addEventListener('click', hideInfo);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && infoModal.classList.contains('show')) hideInfo();
    });

    $('#infoBtn').addEventListener('click', () => {
        const active = $$('.tool-panel.active')[0];
        if (active) showInfo(active.id.replace('tool-', ''));
    });

    // ============================================
    // 侧边栏（默认折叠）— 统一切换逻辑
    // ============================================
    const sidebar = $('#sidebar');
    const mainContent = $('#mainContent');
    const menuToggle = $('#menuToggle');

    function isMobile() {
        return window.innerWidth <= 768;
    }

    function isCollapsed() {
        return sidebar.classList.contains('collapsed');
    }

    // 统一切换侧边栏（桌面端折叠/展开，移动端滑入/滑出）
    function toggleSidebar() {
        if (isMobile()) {
            sidebar.classList.toggle('mobile-open');
        } else {
            sidebar.classList.toggle('collapsed');
            mainContent.classList.toggle('expanded');
        }
    }

    menuToggle.addEventListener('click', toggleSidebar);

    // 移动端：侧边栏右滑关闭手势
    let touchStartX = 0;
    sidebar.addEventListener('touchstart', (e) => {
        if (!isMobile()) return;
        touchStartX = e.touches[0].clientX;
    }, { passive: true });
    sidebar.addEventListener('touchend', (e) => {
        if (!isMobile()) return;
        const deltaX = e.changedTouches[0].clientX - touchStartX;
        if (deltaX < -60 && sidebar.classList.contains('mobile-open')) {
            sidebar.classList.remove('mobile-open');
        }
    });

    // ============================================
    // 工具切换
    // ============================================
    const navItems = $$('.nav-item');
    const toolPanels = $$('.tool-panel');
        const pageTitle = $('#pageTitle');
        const homeBtn = $('#homeBtn');
        const titleDot = $('#titleDot');

        // 进入新页面时强制回到顶端（真正的滚动容器是 #toolContainer）
        function scrollPageTop() {
            const tc = $('#toolContainer');
            if (tc) tc.scrollTop = 0;
            const mc = $('#mainContent');
            if (mc) mc.scrollTop = 0;
            if (window.scrollTo) window.scrollTo(0, 0);
        }

    // 分类强调色映射（与卡片/侧栏分类色统一，减少割裂感）
    const catAccent = (cat) => cat ? `var(--cat-${cat})` : 'var(--primary)';

    function switchTool(toolId) {
        // 「可信数据空间」是独立子系统，点击直接跳转到其登录页
        if (toolId === 'data-space') {
            window.location.href = 'login.html';
            return;
        }
        // 如果之前在全屏阅读模式，先退出
        if (toolId !== 'reader') {
            const rp = $('#tool-reader');
            if (rp && rp.classList.contains('reader-immersive')) exitReaderImmersive();
        }
        // 每次重新查询以处理可能的 DOM 替换
        $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.tool === toolId));
        $$('.tool-panel').forEach(panel => panel.classList.toggle('active', panel.id === `tool-${toolId}`));
        pageTitle.textContent = (toolInfo[toolId] && toolInfo[toolId].title) || '工具';

        // 联动分类强调色：顶栏标题点、工具标题竖条、信息按钮等统一色调
        const tool = (typeof allTools !== 'undefined') ? allTools.find(t => t.id === toolId) : null;
        const accent = catAccent(tool ? tool.cat : null);
        document.documentElement.style.setProperty('--accent-active', accent);
        if (titleDot) {
            titleDot.style.background = accent;
            titleDot.style.boxShadow = `0 0 8px ${tool ? `var(--cat-${tool.cat})` : 'var(--primary)'}`;
            titleDot.classList.toggle('is-home', toolId === 'home');
        }
        if (homeBtn) homeBtn.classList.toggle('is-active', toolId === 'home');

        if (isMobile()) {
            sidebar.classList.remove('mobile-open');
        } else if (!isCollapsed()) {
            // 桌面端：菜单展开时点击工具，自动折叠侧边栏
            sidebar.classList.add('collapsed');
            mainContent.classList.add('expanded');
        }
        scrollPageTop();
    }

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            switchTool(item.dataset.tool);
        });
    });

    $('.logo').addEventListener('click', (e) => {
        e.preventDefault();
        switchTool('home');
    });
    if (homeBtn) {
        homeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            switchTool('home');
        });
    }

    // ============================================
    // 主题切换器
    // ============================================
    (function initThemeSwitcher() {
        const themeBtn = $('#themeBtn');
        const popover = $('#themePopover');
        if (!themeBtn || !popover) return;
        const STORAGE_KEY = 'aqua-theme';
        const VALID_THEMES = ['aqua', 'midnight', 'aurora'];

        function applyTheme(theme) {
            if (!VALID_THEMES.includes(theme)) theme = 'aqua';
            if (theme === 'aqua') {
                delete document.documentElement.dataset.theme;
            } else {
                document.documentElement.dataset.theme = theme;
            }
            // 更新弹层激活态
            $$('.theme-option', popover).forEach(opt => {
                opt.classList.toggle('is-active', opt.dataset.theme === theme);
            });
            try { localStorage.setItem(STORAGE_KEY, theme); } catch (e) {}
        }

        // 初始化激活态（主题已由 head 内联脚本应用）
        let saved = 'aqua';
        try { saved = localStorage.getItem(STORAGE_KEY) || 'aqua'; } catch (e) {}
        applyTheme(saved);

        function togglePopover(force) {
            const willOpen = force !== undefined ? force : popover.hidden;
            popover.hidden = !willOpen;
            themeBtn.setAttribute('aria-expanded', String(willOpen));
        }

        themeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            togglePopover();
        });

        popover.addEventListener('click', (e) => {
            const opt = e.target.closest('.theme-option');
            if (!opt) return;
            applyTheme(opt.dataset.theme);
            togglePopover(false);
            showToast(`已切换至「${$$('.theme-name', opt)[0]?.textContent || ''}」主题`);
        });

        // 点击外部或按 Esc 关闭
        document.addEventListener('click', (e) => {
            if (popover.hidden) return;
            if (!e.target.closest('.theme-switcher')) togglePopover(false);
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !popover.hidden) togglePopover(false);
        });
    })();

    // ============================================
    // 实时时钟
    // ============================================
    (function initClock() {
        const el = $('#tbClock');
        if (!el) return;
        function tick() {
            const now = new Date();
            el.textContent = [
                String(now.getHours()).padStart(2, '0'),
                String(now.getMinutes()).padStart(2, '0'),
                String(now.getSeconds()).padStart(2, '0'),
            ].join(':');
        }
        tick();
        setInterval(tick, 1000);
    })();

    // ============================================
    // 今日人品
    // ============================================
    (function initLuck() {
        const card = $('#luckCard');
        const valueEl = $('#luckValue');
        const msgEl = $('#luckMsg');
        if (!card) return;

        const STORAGE_KEY = 'aqua-luck';
        const fortuneMap = [
            { min: 95, emoji: '&#x1f451;', text: '天命所归！今天注定不凡，想做什么就去做吧！' },
            { min: 85, emoji: '&#x1f31f;', text: '大吉大利！运势极佳，适合开展新项目、重要决策。' },
            { min: 70, emoji: '&#x2728;', text: '好运连连！保持好心情，今天会很顺利。' },
            { min: 55, emoji: '&#x1f308;', text: '中上运势，诸事平顺，努力就会有回报。' },
            { min: 40, emoji: '&#x1f338;', text: '平淡是真，按部就班就好，适合处理日常事务。' },
            { min: 25, emoji: '&#x26c8;', text: '小有波澜，注意细节，避免冲动决策。' },
            { min: 10, emoji: '&#x1f327;', text: '运势低迷，低调行事，多休息少折腾。' },
            { min: 0,  emoji: '&#x1f4a5;', text: '黑到谷底……今天适合宅家，不宜外出冒险。' },
        ];

        function getFortune(score) {
            for (const f of fortuneMap) {
                if (score >= f.min) return f;
            }
            return fortuneMap[fortuneMap.length - 1];
        }

        // 以本地"当日"日期为 key，跨过零点即视为新的一天（按日历日，而非 24 小时滚动窗口）
        function getTodayKey() {
            const d = new Date();
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }

        // 偏向高分：约 75% 概率落在 50~100，其余 1~49，提升"50 以上"的出现概率
        function generate() {
            if (Math.random() < 0.75) {
                return 50 + Math.floor(Math.random() * 51);
            }
            return 1 + Math.floor(Math.random() * 49);
        }

        function render(score) {
            const fortune = getFortune(score);
            if (valueEl) {
                valueEl.classList.remove('bump');
                void valueEl.offsetWidth;
                valueEl.textContent = score;
                valueEl.classList.add('bump');
            }
            if (msgEl) msgEl.innerHTML = `${fortune.emoji} ${fortune.text}`;
            // 低分时给予微妙的视觉提醒；颜色引用主题变量，随主题切换自动跟随
            if (card) {
                card.style.setProperty('--luck-mood', score < 30 ? 'var(--luck-bad)' : score < 55 ? 'var(--luck-mid)' : 'var(--luck-good)');
            }
            const barFill = $('#luckBarFill');
            if (barFill) barFill.style.width = score + '%';
        }

        // 当天首次打开（或跨过日历日）才重新随机，并写入本地；
        // 同日同设备任意时间打开都读取已存值，保证数值一致
        function ensureToday() {
            let stored = null;
            try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch(e) {}
            if (stored && stored.date === getTodayKey() && typeof stored.score === 'number') {
                render(stored.score);
            } else {
                const score = generate();
                try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ score, date: getTodayKey() })); } catch(e) {}
                render(score);
            }
        }

        ensureToday();

        // 取消刷新机制：人品值当天固定，左键点击不再重算


        // 右键复制
        card.addEventListener('contextmenu', async (e) => {
            e.preventDefault();
            const current = valueEl ? valueEl.textContent : '--';
            const fortune = getFortune(parseInt(current) || 0);
            const msg = `✨ 今日人品 ${current} 分 — ${fortune.emoji} ${fortune.text}`;
            const ok = await copyText(msg);
            if (ok) showToast('人品值已复制');
        });

        // 加成弹窗（复用 info-modal 样式）
        const bonusModal = $('#bonusModal');
        const bonusModalOverlay = $('#bonusModalOverlay');
        const bonusModalClose = $('#bonusModalClose');
        const bonusBtn = $('#luckBonusBtn');

        function showBonusModal() {
            if (!bonusModal) return;
            bonusModal.classList.add('show');
        }

        function hideBonusModal() {
            if (!bonusModal) return;
            bonusModal.classList.remove('show');
        }

        if (bonusBtn) bonusBtn.addEventListener('click', showBonusModal);
        if (bonusModalClose) bonusModalClose.addEventListener('click', hideBonusModal);
        if (bonusModalOverlay) bonusModalOverlay.addEventListener('click', hideBonusModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && bonusModal && bonusModal.classList.contains('show')) hideBonusModal();
        });
    })();

    // ============================================
    // 极光主题交互动效 — 鼠标轨迹 / 点击波纹 / 卡片追踪
    // ============================================
    (function initAuroraInteractive() {
        const cursorGlow = $('#auroraCursorGlow');
        const rippleContainer = $('#auroraRipples');
        const particlesContainer = $('#auroraParticles');
        const entrySweep = $('#auroraEntrySweep');
        if (!cursorGlow || !rippleContainer) return;

        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const RIPPLE_COLORS = [
            'rgba(45, 212, 191, 0.65)',   // 青绿
            'rgba(94, 234, 212, 0.6)',    // 浅青
            'rgba(167, 139, 250, 0.6)',   // 紫罗兰
            'rgba(217, 70, 239, 0.55)',   // 品红
            'rgba(244, 114, 182, 0.55)',  // 粉
            'rgba(34, 211, 238, 0.6)'     // 青蓝
        ];
        const PARTICLE_COLORS = [
            '#5eead4', '#2dd4bf', '#a78bfa', '#d946ef',
            '#f472b6', '#22d3ee', '#6ee7b7'
        ];
        const PARTICLE_COUNT = 10;
        const docEl = document.documentElement;

        // 生成浮游粒子（仅在极光主题启用）
        function spawnParticles() {
            if (!particlesContainer) return;
            particlesContainer.innerHTML = '';
            if (reducedMotion) return;
            const frag = document.createDocumentFragment();
            for (let i = 0; i < PARTICLE_COUNT; i++) {
                const p = document.createElement('div');
                p.className = 'aurora-particle';
                p.style.setProperty('--p-x', (Math.random() * 100).toFixed(1) + '%');
                p.style.setProperty('--p-drift', ((Math.random() - 0.5) * 120).toFixed(0) + 'px');
                p.style.setProperty('--p-dur', (16 + Math.random() * 14).toFixed(1) + 's');
                p.style.setProperty('--p-delay', (Math.random() * -20).toFixed(1) + 's');
                p.style.setProperty('--p-opacity', (0.4 + Math.random() * 0.5).toFixed(2));
                p.style.setProperty('--p-color', PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]);
                const size = (2 + Math.random() * 2.5).toFixed(1);
                p.style.width = size + 'px';
                p.style.height = size + 'px';
                frag.appendChild(p);
            }
            particlesContainer.appendChild(frag);
        }

        // 触发入场扫光（重新触发动画）
        function fireEntrySweep() {
            if (!entrySweep || reducedMotion) return;
            entrySweep.classList.remove('is-firing');
            // 强制重排以重启动画
            void entrySweep.offsetWidth;
            entrySweep.classList.add('is-firing');
            setTimeout(() => entrySweep.classList.remove('is-firing'), 1700);
        }

        // 鼠标轨迹：rAF 节流，仅更新必要变量
        let rafPending = false;
        let lastMx, lastMy, lastMxPx, lastMyPx;
        document.addEventListener('mousemove', (e) => {
            if (docEl.dataset.theme !== 'aurora') return;
            const mx = (e.clientX / window.innerWidth - 0.5).toFixed(3);
            const my = (e.clientY / window.innerHeight - 0.5).toFixed(3);
            lastMx = mx;
            lastMy = my;
            lastMxPx = e.clientX;
            lastMyPx = e.clientY;
            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                docEl.style.setProperty('--mx', lastMx);
                docEl.style.setProperty('--my', lastMy);
                docEl.style.setProperty('--mx-px', lastMxPx + 'px');
                docEl.style.setProperty('--my-px', lastMyPx + 'px');
            });
        }, { passive: true });

        // 卡片光斑：仅在 hover 时追踪（事件委托）
        let cardRaf = false;
        let cardLastX, cardLastY, cardTarget;
        document.addEventListener('mouseover', (e) => {
            if (docEl.dataset.theme !== 'aurora') return;
            const card = e.target.closest && e.target.closest('.tool-card-v2');
            if (!card) {
                if (cardTarget) { cardTarget.style.removeProperty('--card-mx'); cardTarget.style.removeProperty('--card-my'); cardTarget = null; }
                return;
            }
            if (cardTarget !== card) {
                if (cardTarget) { cardTarget.style.removeProperty('--card-mx'); cardTarget.style.removeProperty('--card-my'); }
                cardTarget = card;
            }
        }, { passive: true });
        document.addEventListener('mousemove', (e) => {
            if (!cardTarget || docEl.dataset.theme !== 'aurora') return;
            const rect = cardTarget.getBoundingClientRect();
            cardLastX = ((e.clientX - rect.left) / rect.width * 100).toFixed(1);
            cardLastY = ((e.clientY - rect.top) / rect.height * 100).toFixed(1);
            if (cardRaf) return;
            cardRaf = true;
            requestAnimationFrame(() => {
                cardRaf = false;
                if (cardTarget) {
                    cardTarget.style.setProperty('--card-mx', cardLastX + '%');
                    cardTarget.style.setProperty('--card-my', cardLastY + '%');
                }
            });
        }, { passive: true });

        // 点击波纹：仅在极光主题下生效
        if (!reducedMotion) {
            document.addEventListener('click', (e) => {
                if (docEl.dataset.theme !== 'aurora') return;
                const ripple = document.createElement('div');
                ripple.className = 'aurora-ripple';
                const color = RIPPLE_COLORS[Math.floor(Math.random() * RIPPLE_COLORS.length)];
                ripple.style.setProperty('--ripple-color', color);
                ripple.style.left = e.clientX + 'px';
                ripple.style.top = e.clientY + 'px';
                rippleContainer.appendChild(ripple);
                setTimeout(() => ripple.remove(), 1300);
            });
        }

        // 主题切换：进入极光 → 启动粒子 + 触发入场扫光；离开极光 → 清理
        let lastTheme = docEl.dataset.theme || 'aqua';
        const themeObserver = new MutationObserver(() => {
            const cur = docEl.dataset.theme || 'aqua';
            if (cur === 'aurora' && lastTheme !== 'aurora') {
                spawnParticles();
                fireEntrySweep();
            } else if (cur !== 'aurora') {
                if (rippleContainer) rippleContainer.innerHTML = '';
                if (particlesContainer) particlesContainer.innerHTML = '';
            }
            lastTheme = cur;
        });
        themeObserver.observe(docEl, { attributes: true, attributeFilter: ['data-theme'] });

        // 首次已是极光（页面刷新保留）则立即生成
        if (lastTheme === 'aurora') {
            spawnParticles();
        }
    })();

    // ============================================
    // 主页卡片网格（带分类筛选）
    // ============================================
    const allTools = [
        { id: 'json', icon: 'fa-code', title: 'JSON 格式化', desc: '美化压缩转义校验', cat: 'dev' },
        { id: 'markdown', icon: 'fa-markdown', brand: true, title: 'Markdown 编辑器', desc: '实时预览渲染', cat: 'dev' },
        { id: 'regex', icon: 'fa-asterisk', title: '正则测试', desc: '实时匹配高亮', cat: 'dev' },
        { id: 'snippets', icon: 'fa-code-branch', title: '代码片段管理', desc: '本地持久化保存', cat: 'dev' },
        { id: 'cron', icon: 'fa-clock-rotate-left', title: 'Cron 表达式', desc: '定时任务构建', cat: 'dev' },
        { id: 'http-status', icon: 'fa-globe', title: 'HTTP 状态码', desc: '速查手册', cat: 'dev' },
        { id: 'dev-boards', icon: 'fa-microchip', title: '开发板百科', desc: '全品类详解参数', cat: 'dev' },
        { id: 'timestamp', icon: 'fa-stopwatch', title: '时间戳转换', desc: 'Unix 时间互转', cat: 'dev' },
        { id: 'base64', icon: 'fa-exchange-alt', title: 'Base64 编解码', desc: '文本文件互转', cat: 'dev' },
        { id: 'hash', icon: 'fa-fingerprint', title: '哈希计算', desc: 'SHA-256/384/512', cat: 'dev' },
        { id: 'uuid', icon: 'fa-fingerprint', title: 'UUID 生成器', desc: 'v1 v4 v7 批量生成', cat: 'dev' },
        { id: 'url-encode', icon: 'fa-link', title: 'URL 编解码', desc: 'encode/decode URI', cat: 'dev' },
        { id: 'jwt', icon: 'fa-key', title: 'JWT 解码器', desc: '解析 Header/Payload', cat: 'dev' },
        { id: 'word-count', icon: 'fa-align-left', title: '字数统计', desc: '字符段落行数', cat: 'text' },
        { id: 'text-diff', icon: 'fa-code-branch', title: '文本对比', desc: '逐行差异高亮', cat: 'text' },
        { id: 'lorem', icon: 'fa-paragraph', title: '占位文本', desc: '中英文生成', cat: 'text' },
        { id: 'deai', icon: 'fa-wand-magic-sparkles', title: '文本润色', desc: '去AI味', cat: 'text' },
        { id: 'color-picker', icon: 'fa-eye-dropper', title: '颜色选择器', desc: 'HEX RGB HSL', cat: 'design' },
        { id: 'palette-gen', icon: 'fa-palette', title: '调色板生成', desc: '和谐配色方案', cat: 'design' },
        { id: 'gradient', icon: 'fa-fill-drip', title: '渐变生成器', desc: 'CSS 代码导出', cat: 'design' },
        { id: 'poster', icon: 'fa-panorama', title: '海报生成器', desc: 'Canvas 出图', cat: 'design' },
        { id: 'design-ref', icon: 'fa-swatchbook', title: '设计风格参考卡', desc: '配色字体速查', cat: 'design' },
        { id: 'image-compress', icon: 'fa-image', title: '图片压缩', desc: '本地质量调节', cat: 'media' },
        { id: 'qr-code', icon: 'fa-qrcode', title: '二维码生成', desc: '可下载 PNG', cat: 'media' },
        { id: 'color-picker-image', icon: 'fa-eye', title: '图片取色器', desc: '提取像素颜色', cat: 'media' },
        { id: 'watermark', icon: 'fa-stamp', title: '图片去水印', desc: '框选本地去除', cat: 'media' },
        { id: 'unit-convert', icon: 'fa-ruler-combined', title: '单位换算', desc: '长度重量温度', cat: 'utility' },
        { id: 'password', icon: 'fa-key', title: '密码生成器', desc: '安全随机密码', cat: 'utility' },
        { id: 'pomodoro', icon: 'fa-clock', title: '番茄钟', desc: '专注计时器', cat: 'utility' },
        { id: 'file-transfer', icon: 'fa-share-alt', title: '文件快传', desc: 'P2P 加密传输', cat: 'utility' },
        { id: 'encrypted-chat', icon: 'fa-comment-dots', title: '加密聊天', desc: '端到端 P2P', cat: 'utility' },
        { id: 'online-terminal', icon: 'fa-terminal', title: '在线终端', desc: 'JS 沙箱终端', cat: 'utility' },
        { id: 'kms', icon: 'fa-key', title: 'KMS 激活', desc: 'Windows 激活向导', cat: 'utility' },
        { id: 'backup', icon: 'fa-database', title: '本地备份箱', desc: 'IndexedDB 存储', cat: 'utility' },
        { id: 'opensource', icon: 'fa-book', title: '开源广场', desc: '本地知识库', cat: 'utility' },
        { id: 'reader', icon: 'fa-book-open', title: '小说阅读器', desc: 'TXT/EPUB 阅读', cat: 'utility' },
        { id: 'ip-lookup', icon: 'fa-network-wired', title: 'IP 信息', desc: '本机IP与归属地', cat: 'utility' },
        { id: 'data-space', icon: 'fa-database', title: '可信数据空间', desc: '数据共享平台 · 点击登录进入', cat: 'utility' }
    ];

    // --- 卡片滚动驱动动画：从左→右、从上→下进入 / 反向淡出 ---
    const cardRevealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.remove('card-hidden');
            } else {
                entry.target.classList.add('card-hidden');
            }
        });
    }, { threshold: 0.08, rootMargin: '20px 0px 20px 0px' });

    function observeCards(grid) {
        // 先注销已有观察
        grid.querySelectorAll('.tool-card-v2').forEach(el => cardRevealObserver.unobserve(el));
        // 全部卡立即响应滚动，不做瀑布延迟
        grid.querySelectorAll('.tool-card-v2').forEach(el => {
            el.style.transitionDelay = '0s';
            cardRevealObserver.observe(el);
        });
    }

    function renderToolsGrid(filter = 'all') {
        const grid = $('#toolsGridV2');
        if (!grid) return;
        grid.innerHTML = '';
        const filtered = filter === 'all' ? allTools : allTools.filter(t => t.cat === filter);
        filtered.forEach((card) => {
            const el = document.createElement('div');
            el.className = 'tool-card-v2 card-hidden';
            el.dataset.cat = card.cat;
            el.innerHTML = `
                <div class="tool-card-icon-v2">
                    <i class="${card.brand ? 'fab' : 'fas'} ${card.icon}"></i>
                </div>
                <div class="tool-card-title-v2">${card.title}</div>
                <div class="tool-card-desc-v2">${card.desc}</div>
                <div class="tool-card-arrow"><i class="fas fa-arrow-right"></i></div>
            `;
            el.addEventListener('click', () => switchTool(card.id));
            grid.appendChild(el);
        });
        observeCards(grid);
    }
    renderToolsGrid();

    $$('.section-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.section-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            renderToolsGrid(tab.dataset.filter);
        });
    });

    // 主页统计数字动画
    function animateCount(el) {
        const target = parseInt(el.dataset.count);
        const duration = 1200;
        const startTime = performance.now();
        function update(now) {
            const progress = Math.min((now - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            el.textContent = Math.floor(target * eased);
            if (progress < 1) requestAnimationFrame(update);
            else el.textContent = target;
        }
        requestAnimationFrame(update);
    }
    // 计数与工具总数保持一致，避免硬编码失同步
    $$('.pill-num').forEach(el => { el.dataset.count = allTools.length; });
    $$('.pill-num').forEach(animateCount);

    // ============================================
    // 工具搜索
    // ============================================
    // 工具筛选：侧边栏搜索框与顶部搜索框共用
    function applyToolFilter(rawQ) {
        const q = (rawQ || '').toLowerCase().trim();
        navItems.forEach(item => {
            const text = item.textContent.toLowerCase();
            item.style.display = text.includes(q) ? '' : 'none';
        });
    }

    const toolSearch = $('#toolSearch');
    const topSearch = $('#topSearch');
    const topSearchClear = $('#topSearchClear');

    if (toolSearch) {
        toolSearch.addEventListener('input', (e) => {
            applyToolFilter(e.target.value);
            if (topSearch) topSearch.value = e.target.value;
        });
    }

    if (topSearch) {
        topSearch.addEventListener('input', (e) => {
            applyToolFilter(e.target.value);
            if (toolSearch) toolSearch.value = e.target.value;
            if (topSearchClear) topSearchClear.hidden = !e.target.value;
        });
        topSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const q = (topSearch.value || '').toLowerCase().trim();
                if (q) {
                    // 跳转到第一个匹配的工具，在内容区显示相关功能
                    const firstMatch = navItems.find(item => item.style.display !== 'none');
                    if (firstMatch) switchTool(firstMatch.dataset.tool);
                }
                return;
            }
            if (e.key === 'Escape' && topSearch.value) {
                topSearch.value = '';
                applyToolFilter('');
                if (toolSearch) toolSearch.value = '';
                if (topSearchClear) topSearchClear.hidden = true;
            }
        });
    }

    if (topSearchClear) {
        topSearchClear.addEventListener('click', () => {
            topSearch.value = '';
            applyToolFilter('');
            if (toolSearch) toolSearch.value = '';
            topSearchClear.hidden = true;
            topSearch.focus();
        });
    }

    // ============================================
    // 复制按钮（事件委托）
    // ============================================
    document.addEventListener('click', async (e) => {
        const copyBtn = e.target.closest('[data-target]');
        if (!copyBtn || !copyBtn.classList.contains('mini-btn')) return;
        const target = document.getElementById(copyBtn.dataset.target);
        if (!target) return;
        const text = target.value || target.textContent;
        const ok = await copyText(text);
        if (ok) showCopyFeedback(copyBtn);
    });

    // 单独处理"b64FileCopy"和"pickerCopy"
    $('#b64FileCopy').addEventListener('click', async function() {
        const ok = await copyText($('#b64FileOutput').value);
        if (ok) showCopyFeedback(this);
    });
    $('#pickerCopy').addEventListener('click', async function() {
        const ok = await copyText($('#pickerHex').textContent);
        if (ok) showCopyFeedback(this);
    });

    // ============================================
    // 工具：JSON 格式化
    // ============================================
    const jsonInput = $('#jsonInput');
    const jsonOutput = $('#jsonOutput').querySelector('code');
    const jsonStatus = $('#jsonStatus');

    function showJsonStatus(msg, type) {
        jsonStatus.textContent = msg;
        jsonStatus.className = `json-status ${type}`;
    }

    function jsonFormat() {
        try {
            const obj = JSON.parse(jsonInput.value);
            jsonOutput.textContent = JSON.stringify(obj, null, 2);
            hljs.highlightElement(jsonOutput);
            showJsonStatus('✓ 格式化成功', 'success');
        } catch (err) {
            showJsonStatus('✗ ' + err.message, 'error');
        }
    }

    $('#jsonFormat').addEventListener('click', jsonFormat);
    $('#jsonMinify').addEventListener('click', () => {
        try {
            const obj = JSON.parse(jsonInput.value);
            jsonOutput.textContent = JSON.stringify(obj);
            showJsonStatus('✓ 压缩成功', 'success');
        } catch (err) {
            showJsonStatus('✗ ' + err.message, 'error');
        }
    });
    $('#jsonEscape').addEventListener('click', () => {
        jsonOutput.textContent = JSON.stringify(jsonInput.value).slice(1, -1);
    });
    $('#jsonUnescape').addEventListener('click', () => {
        try {
            jsonOutput.textContent = JSON.parse('"' + jsonInput.value + '"');
        } catch (err) {
            showJsonStatus('✗ 反转义失败: ' + err.message, 'error');
        }
    });
    $('#jsonValidate').addEventListener('click', () => {
        try {
            JSON.parse(jsonInput.value);
            showJsonStatus('✓ 有效的 JSON', 'success');
        } catch (err) {
            showJsonStatus('✗ ' + err.message, 'error');
        }
    });
    $('#jsonSample').addEventListener('click', () => {
        jsonInput.value = '{"name":"Aqua Tools","version":"2.0","features":["JSON","Markdown","Regex"],"stats":{"tools":17,"free":true}}';
        jsonFormat();
    });
    $('#jsonClear').addEventListener('click', () => {
        jsonInput.value = '';
        jsonOutput.textContent = '';
        jsonStatus.className = 'json-status';
    });

    // ============================================
    // 工具：Markdown 编辑器
    // ============================================
    const mdInput = $('#mdInput');
    const mdPreview = $('#mdPreview');

    const defaultMd = `# 欢迎使用 Markdown 编辑器

这是一个 **实时预览** 的 Markdown 编辑器。

## 功能特性

- 实时渲染
- 支持代码块
- 支持 *斜体* 与 **加粗**

\`\`\`javascript
function hello() {
  console.log("Hello, Aqua!");
}
\`\`\`

> 引用文本会这样显示

[链接示例](https://example.com)`;

    mdInput.value = defaultMd;

    function renderMd() {
        try {
            mdPreview.innerHTML = sanitizeHTML(marked.parse(mdInput.value));
            mdPreview.querySelectorAll('pre code').forEach(b => hljs.highlightElement(b));
        } catch {
            mdPreview.textContent = '渲染失败';
        }
    }
    mdInput.addEventListener('input', renderMd);
    renderMd();

    $$('.md-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.md;
            const start = mdInput.selectionStart;
            const end = mdInput.selectionEnd;
            const sel = mdInput.value.substring(start, end) || '文本';
            let insert = '';
            switch(type) {
                case 'h1': insert = `# ${sel}`; break;
                case 'h2': insert = `## ${sel}`; break;
                case 'bold': insert = `**${sel}**`; break;
                case 'italic': insert = `*${sel}*`; break;
                case 'link': insert = `[${sel}](https://)`; break;
                case 'code': insert = '`' + sel + '`'; break;
                case 'list': insert = `- ${sel}`; break;
                case 'quote': insert = `> ${sel}`; break;
            }
            mdInput.value = mdInput.value.substring(0, start) + insert + mdInput.value.substring(end);
            renderMd();
            mdInput.focus();
        });
    });

    $('#mdClear').addEventListener('click', () => {
        mdInput.value = '';
        renderMd();
    });

    // ============================================
    // 工具：正则测试
    // ============================================
    const regexPattern = $('#regexPattern');
    const regexFlags = $('#regexFlags');
    const regexText = $('#regexText');
    const regexResult = $('#regexResult');
    const regexStats = $('#regexStats');

    function runRegex() {
        const pattern = regexPattern.value;
        const flags = regexFlags.value;
        const text = regexText.value;
        
        if (!pattern) {
            regexResult.innerHTML = '<span style="color:var(--text-muted)">请输入正则表达式</span>';
            regexStats.textContent = '请输入正则表达式';
            return;
        }
        
        try {
            const re = new RegExp(pattern, flags);
            const global = flags.includes('g');
            
            if (global) {
                const matches = text.match(re) || [];
                let result = '';
                let lastIndex = 0;
                let m;
                const reForIter = new RegExp(pattern, flags);
                while ((m = reForIter.exec(text)) !== null) {
                    result += escapeHtml(text.substring(lastIndex, m.index));
                    result += `<mark>${escapeHtml(m[0])}</mark>`;
                    lastIndex = m.index + m[0].length;
                    if (m[0] === '') reForIter.lastIndex++;
                }
                result += escapeHtml(text.substring(lastIndex));
                regexResult.innerHTML = result || '<span style="color:var(--text-muted)">无匹配</span>';
                regexStats.innerHTML = `共匹配 <strong style="color:var(--primary)">${matches.length}</strong> 处`;
            } else {
                const m = text.match(re);
                if (m) {
                    regexResult.innerHTML = `匹配: <mark>${escapeHtml(m[0])}</mark>` + 
                        (m.length > 1 ? '<br>分组: ' + m.slice(1).map(g => `<code>${escapeHtml(g || '')}</code>`).join(' ') : '');
                    regexStats.innerHTML = `匹配成功，匹配文本: <strong style="color:var(--primary)">${escapeHtml(m[0])}</strong>`;
                } else {
                    regexResult.innerHTML = '<span style="color:var(--text-muted)">无匹配</span>';
                    regexStats.textContent = '无匹配';
                }
            }
        } catch (err) {
            regexResult.innerHTML = `<span style="color:var(--error)">正则错误: ${escapeHtml(err.message)}</span>`;
            regexStats.textContent = '正则表达式错误';
        }
    }

    [regexPattern, regexFlags, regexText].forEach(el => el.addEventListener('input', runRegex));

    $$('.flag-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const flag = chip.dataset.flag;
            if (regexFlags.value.includes(flag)) {
                regexFlags.value = regexFlags.value.replace(flag, '');
                chip.classList.remove('active');
            } else {
                regexFlags.value += flag;
                chip.classList.add('active');
            }
            runRegex();
        });
    });
    $('.flag-chip[data-flag="g"]').classList.add('active');
    runRegex();

    // ============================================
    // 工具：Base64
    // ============================================
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.b64-pane').forEach(p => p.classList.remove('active'));
            $(`#b64${btn.dataset.b64Tab.charAt(0).toUpperCase() + btn.dataset.b64Tab.slice(1)}Pane`).classList.add('active');
        });
    });

    $('#base64Encode').addEventListener('click', () => {
        try {
            $('#base64Output').value = btoa(unescape(encodeURIComponent($('#base64Input').value)));
        } catch { showToast('编码失败', 'error'); }
    });
    $('#base64Decode').addEventListener('click', () => {
        try {
            $('#base64Output').value = decodeURIComponent(escape(atob($('#base64Input').value)));
        } catch { showToast('解码失败：无效的 Base64', 'error'); }
    });
    $('#base64Swap').addEventListener('click', function() {
        const input = $('#base64Input');
        const output = $('#base64Output');
        if (!input.value && !output.value) {
            showToast('无内容可互换', 'error');
            return;
        }
        // 旋转按钮图标反馈
        const icon = this.querySelector('i');
        if (icon) {
            icon.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
            icon.style.transform = 'rotate(360deg)';
            setTimeout(() => icon.style.transform = '', 500);
        }
        // 添加高亮过渡类
        input.classList.add('swap-flash');
        output.classList.add('swap-flash');
        setTimeout(() => {
            input.classList.remove('swap-flash');
            output.classList.remove('swap-flash');
        }, 500);
        // 实际交换内容
        const tmp = input.value;
        input.value = output.value;
        output.value = tmp;
        showToast('已互换');
    });

    const b64FileDrop = $('#b64FileDrop');
    const b64FileInput = $('#b64FileInput');
    
    b64FileDrop.addEventListener('click', () => b64FileInput.click());
    b64FileDrop.addEventListener('dragover', (e) => { e.preventDefault(); b64FileDrop.classList.add('dragover'); });
    b64FileDrop.addEventListener('dragleave', () => b64FileDrop.classList.remove('dragover'));
    b64FileDrop.addEventListener('drop', (e) => {
        e.preventDefault();
        b64FileDrop.classList.remove('dragover');
        if (e.dataTransfer.files[0]) fileToBase64(e.dataTransfer.files[0]);
    });
    b64FileInput.addEventListener('change', (e) => {
        if (e.target.files[0]) fileToBase64(e.target.files[0]);
    });

    function fileToBase64(file) {
        const reader = new FileReader();
        reader.onload = () => {
            $('#b64FileOutput').value = reader.result;
            showToast(`已转换: ${file.name}`);
        };
        reader.readAsDataURL(file);
    }

    $('#b64FileCopy').addEventListener('click', () => copyText($('#b64FileOutput').value));

    // ============================================
    // 工具：哈希计算
    // ============================================
    async function calcHash(algo, text) {
        const data = new TextEncoder().encode(text);
        const buf = await crypto.subtle.digest(algo, data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    $('#hashCalculate').addEventListener('click', async () => {
        const input = $('#hashInput').value;
        if (!input) { showToast('请输入文本', 'error'); return; }
        const btn = $('#hashCalculate');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>计算中...';
        btn.disabled = true;
        try {
            $('#hashSha256').textContent = await calcHash('SHA-256', input);
            $('#hashSha384').textContent = await calcHash('SHA-384', input);
            $('#hashSha512').textContent = await calcHash('SHA-512', input);
            showToast('哈希计算完成');
        } catch { showToast('计算失败', 'error'); }
        btn.innerHTML = '<i class="fas fa-fingerprint"></i>计算哈希';
        btn.disabled = false;
    });

    // ============================================
    // 工具：代码片段管理（localStorage 持久化）
    // ============================================
    const SNIPPETS_KEY = 'aqua_snippets_v1';
    let snippets = [];
    let currentSnippetId = null;

    function loadSnippets() {
        try {
            snippets = JSON.parse(localStorage.getItem(SNIPPETS_KEY)) || [];
        } catch { snippets = []; }
    }

    function saveSnippets() {
        localStorage.setItem(SNIPPETS_KEY, JSON.stringify(snippets));
    }

    function renderSnippetList(filter = '') {
        const list = $('#snippetList');
        list.innerHTML = '';
        const filtered = filter
            ? snippets.filter(s => 
                s.title.toLowerCase().includes(filter.toLowerCase()) ||
                s.code.toLowerCase().includes(filter.toLowerCase()))
            : snippets;
        
        if (filtered.length === 0) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.85rem;">暂无片段，点击"新建片段"创建</div>';
        } else {
            filtered.forEach(s => {
                const item = document.createElement('div');
                item.className = 'snippet-item' + (s.id === currentSnippetId ? ' active' : '');
                item.innerHTML = `
                    <div class="snippet-item-title">${escapeHtml(s.title || '未命名')}</div>
                    <div class="snippet-item-meta">${s.lang} · ${new Date(s.updatedAt).toLocaleDateString()}</div>
                `;
                item.addEventListener('click', () => loadSnippet(s.id));
                list.appendChild(item);
            });
        }
        $('#snippetCount').textContent = `共 ${snippets.length} 个片段`;
    }

    function loadSnippet(id) {
        const s = snippets.find(x => x.id === id);
        if (!s) return;
        currentSnippetId = id;
        $('#snippetTitle').value = s.title;
        $('#snippetLang').value = s.lang;
        $('#snippetCode').value = s.code;
        renderSnippetList($('#snippetSearchInput').value);
    }

    function newSnippet() {
        currentSnippetId = null;
        $('#snippetTitle').value = '';
        $('#snippetLang').value = 'javascript';
        $('#snippetCode').value = '';
        renderSnippetList();
        $('#snippetTitle').focus();
    }

    function saveSnippet() {
        const title = $('#snippetTitle').value.trim() || '未命名片段';
        const lang = $('#snippetLang').value;
        const code = $('#snippetCode').value;
        
        if (!code.trim()) {
            showToast('代码不能为空', 'error');
            return;
        }
        
        if (currentSnippetId) {
            const s = snippets.find(x => x.id === currentSnippetId);
            if (s) {
                s.title = title;
                s.lang = lang;
                s.code = code;
                s.updatedAt = Date.now();
            }
        } else {
            const newS = {
                id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                title, lang, code,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            snippets.unshift(newS);
            currentSnippetId = newS.id;
        }
        saveSnippets();
        renderSnippetList($('#snippetSearchInput').value);
        showToast('片段已保存');
    }

    function deleteSnippet() {
        if (!currentSnippetId) {
            showToast('请先选择一个片段', 'error');
            return;
        }
        snippets = snippets.filter(s => s.id !== currentSnippetId);
        saveSnippets();
        newSnippet();
        showToast('片段已删除');
    }

    loadSnippets();
    renderSnippetList();
    $('#snippetNew').addEventListener('click', newSnippet);
    $('#snippetSave').addEventListener('click', saveSnippet);
    $('#snippetDelete').addEventListener('click', deleteSnippet);
    $('#snippetCopy').addEventListener('click', async () => {
        const ok = await copyText($('#snippetCode').value);
        if (ok) showCopyFeedback($('#snippetCopy'));
    });
    $('#snippetSearchInput').addEventListener('input', (e) => renderSnippetList(e.target.value));

    // ============================================
    // 工具：Cron 表达式生成器
    // ============================================
    const cronParts = ['cronMin', 'cronHour', 'cronDay', 'cronMonth', 'cronWeek'];
    const cronLabels = ['分', '时', '日', '月', '周'];

    function buildCron() {
        const parts = cronParts.map(id => $('#' + id).value);
        const cron = parts.join(' ');
        $('#cronOutput').textContent = cron;
        $('#cronDesc').textContent = describeCron(parts);
        highlightCronParts(parts);
        calcNextRuns(cron);
    }

    function describeCron(p) {
        const [min, hour, day, month, week] = p;
        const parts = [];
        if (min === '*' && hour === '*' && day === '*' && month === '*' && week === '*') return '每分钟执行一次';
        
        if (min.startsWith('*/')) parts.push(`每 ${min.slice(2)} 分钟`);
        else if (min === '*') parts.push('每分钟');
        else if (min.includes(',')) parts.push(`在第 ${min} 分钟`);
        else parts.push(`在第 ${min} 分钟`);
        
        if (hour.startsWith('*/')) parts.push(`每 ${hour.slice(2)} 小时`);
        else if (hour !== '*') parts.push(hour.includes(',') ? `在 ${hour} 点` : `在 ${hour} 点`);
        
        if (week === '1-5') parts.push('工作日');
        else if (week === '6,0') parts.push('周末');
        else if (week !== '*' && week !== '0') parts.push(`周${'日一二三四五六'[parseInt(week)]}`);
        else if (day !== '*' && day !== '*/1') {
            if (day.startsWith('*/')) parts.push(`每 ${day.slice(2)} 天`);
            else parts.push(`每月 ${day} 号`);
        }
        
        if (month !== '*' && month !== '*/1') {
            if (month.startsWith('*/')) parts.push(`每 ${month.slice(2)} 个月`);
            else parts.push(`${month} 月`);
        }
        
        return parts.join('，') + ' 执行';
    }

    function highlightCronParts(parts) {
        $$('.cron-part').forEach((el, i) => {
            el.textContent = `${parts[i]} ${cronLabels[i]}`;
            el.style.background = parts[i] !== '*' ? 'rgba(14, 165, 233, 0.2)' : 'rgba(14, 165, 233, 0.06)';
            el.style.color = parts[i] !== '*' ? 'var(--primary-dark)' : 'var(--text-muted)';
            el.style.fontWeight = parts[i] !== '*' ? '700' : '500';
        });
    }

    function calcNextRuns(cron) {
        const parts = cron.split(/\s+/);
        const next = [];
        const now = new Date();
        now.setSeconds(0, 0);
        
        for (let i = 0; i < 5; i++) {
            const t = findNext(parts, i === 0 ? new Date(now) : new Date(next[i-1]));
            if (t) next.push(t);
            else break;
        }
        
        const el = $('#cronNext');
        if (next.length === 0) {
            el.innerHTML = '<div class="cron-next-item">无法计算执行时间</div>';
        } else {
            el.innerHTML = next.map((t, i) => 
                `<div class="cron-next-item">${i+1}. ${t.toLocaleString('zh-CN')}</div>`
            ).join('');
        }
    }

    function findNext(parts, start) {
        const [min, hour, day, month, week] = parts;
        const t = new Date(start);
        t.setMinutes(t.getMinutes() + 1);
        
        for (let i = 0; i < 525600; i++) { // 最多一年
            if (matchField(month, t.getMonth() + 1) &&
                matchField(day, t.getDate()) &&
                matchField(week, t.getDay()) &&
                matchField(hour, t.getHours()) &&
                matchField(min, t.getMinutes())) {
                return t;
            }
            t.setMinutes(t.getMinutes() + 1);
        }
        return null;
    }

    function matchField(pattern, value) {
        if (pattern === '*') return true;
        if (pattern.startsWith('*/')) {
            const step = parseInt(pattern.slice(2));
            return value % step === 0;
        }
        if (pattern.includes(',')) {
            return pattern.split(',').some(p => parseInt(p) === value);
        }
        if (pattern.includes('-')) {
            const [a, b] = pattern.split('-').map(Number);
            return value >= a && value <= b;
        }
        return parseInt(pattern) === value;
    }

    cronParts.forEach(id => $('#' + id).addEventListener('change', buildCron));

    $$('.cron-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const cron = btn.dataset.cron.split(' ');
            cronParts.forEach((id, i) => {
                const select = $('#' + id);
                const option = Array.from(select.options).find(o => o.value === cron[i]);
                if (option) select.value = cron[i];
            });
            buildCron();
        });
    });
    buildCron();

    // ============================================
    // 工具：HTTP 状态码速查
    // ============================================
    const httpStatusCodes = [
        { code: 100, text: 'Continue', desc: '客户端应继续请求', cat: '1xx', color: '#6b7280' },
        { code: 101, text: 'Switching Protocols', desc: '服务器切换协议', cat: '1xx', color: '#6b7280' },
        { code: 200, text: 'OK', desc: '请求成功', cat: '2xx', color: '#10b981' },
        { code: 201, text: 'Created', desc: '资源创建成功', cat: '2xx', color: '#10b981' },
        { code: 202, text: 'Accepted', desc: '请求已接受，处理中', cat: '2xx', color: '#10b981' },
        { code: 204, text: 'No Content', desc: '成功但无内容返回', cat: '2xx', color: '#10b981' },
        { code: 206, text: 'Partial Content', desc: '部分内容（Range 请求）', cat: '2xx', color: '#10b981' },
        { code: 301, text: 'Moved Permanently', desc: '永久重定向', cat: '3xx', color: '#0ea5e9' },
        { code: 302, text: 'Found', desc: '临时重定向', cat: '3xx', color: '#0ea5e9' },
        { code: 304, text: 'Not Modified', desc: '资源未修改，使用缓存', cat: '3xx', color: '#0ea5e9' },
        { code: 307, text: 'Temporary Redirect', desc: '临时重定向（保持方法）', cat: '3xx', color: '#0ea5e9' },
        { code: 308, text: 'Permanent Redirect', desc: '永久重定向（保持方法）', cat: '3xx', color: '#0ea5e9' },
        { code: 400, text: 'Bad Request', desc: '请求语法错误', cat: '4xx', color: '#f59e0b' },
        { code: 401, text: 'Unauthorized', desc: '未认证', cat: '4xx', color: '#f59e0b' },
        { code: 403, text: 'Forbidden', desc: '服务器拒绝请求', cat: '4xx', color: '#f59e0b' },
        { code: 404, text: 'Not Found', desc: '资源不存在', cat: '4xx', color: '#f59e0b' },
        { code: 405, text: 'Method Not Allowed', desc: '请求方法不允许', cat: '4xx', color: '#f59e0b' },
        { code: 408, text: 'Request Timeout', desc: '请求超时', cat: '4xx', color: '#f59e0b' },
        { code: 409, text: 'Conflict', desc: '请求冲突', cat: '4xx', color: '#f59e0b' },
        { code: 410, text: 'Gone', desc: '资源已永久消失', cat: '4xx', color: '#f59e0b' },
        { code: 418, text: "I'm a Teapot", desc: '我是茶壶（彩蛋）', cat: '4xx', color: '#f59e0b' },
        { code: 422, text: 'Unprocessable Entity', desc: '语义错误', cat: '4xx', color: '#f59e0b' },
        { code: 429, text: 'Too Many Requests', desc: '请求过多，限流', cat: '4xx', color: '#f59e0b' },
        { code: 500, text: 'Internal Server Error', desc: '服务器内部错误', cat: '5xx', color: '#ef4444' },
        { code: 501, text: 'Not Implemented', desc: '服务器不支持此功能', cat: '5xx', color: '#ef4444' },
        { code: 502, text: 'Bad Gateway', desc: '网关错误', cat: '5xx', color: '#ef4444' },
        { code: 503, text: 'Service Unavailable', desc: '服务不可用', cat: '5xx', color: '#ef4444' },
        { code: 504, text: 'Gateway Timeout', desc: '网关超时', cat: '5xx', color: '#ef4444' },
        { code: 511, text: 'Network Authentication Required', desc: '需要网络认证', cat: '5xx', color: '#ef4444' }
    ];

    const httpCategories = [
        { code: '1xx', title: '信息响应', desc: '请求已接收，继续处理', color: '#6b7280' },
        { code: '2xx', title: '成功响应', desc: '请求已被成功接收并处理', color: '#10b981' },
        { code: '3xx', title: '重定向', desc: '需要进一步操作以完成请求', color: '#0ea5e9' },
        { code: '4xx', title: '客户端错误', desc: '请求包含语法错误或无法完成', color: '#f59e0b' },
        { code: '5xx', title: '服务端错误', desc: '服务器在处理请求时发生错误', color: '#ef4444' }
    ];

    function renderHttpStatus(filter = '') {
        const container = $('#httpCategories');
        container.innerHTML = '';
        const f = filter.toLowerCase().trim();
        
        httpCategories.forEach((cat, idx) => {
            const codes = httpStatusCodes.filter(s => 
                s.cat === cat.code &&
                (!f || String(s.code).includes(f) || s.text.toLowerCase().includes(f) || s.desc.toLowerCase().includes(f))
            );
            if (codes.length === 0) return;
            
            const catEl = document.createElement('div');
            catEl.className = 'http-category';
            catEl.style.animationDelay = (idx * 0.05) + 's';
            catEl.innerHTML = `
                <div class="http-category-header">
                    <div class="http-category-dot" style="background:${cat.color}"></div>
                    <div class="http-category-title">${cat.code} ${cat.title}</div>
                    <div class="http-category-desc">· ${cat.desc}</div>
                </div>
                <div class="http-codes-grid">
                    ${codes.map(s => `
                        <div class="http-code-card" style="border-left-color:${s.color}" data-code="${s.code}">
                            <div class="http-code-num" style="color:${s.color}">${s.code}</div>
                            <div class="http-code-text">${s.text}</div>
                            <div class="http-code-desc">${s.desc}</div>
                        </div>
                    `).join('')}
                </div>
            `;
            container.appendChild(catEl);
        });
        
        // 点击卡片复制
        $$('.http-code-card').forEach(card => {
            card.addEventListener('click', async () => {
                const code = card.dataset.code;
                const s = httpStatusCodes.find(x => String(x.code) === code);
                if (s) {
                    await copyText(`${s.code} ${s.text} - ${s.desc}`);
                }
            });
        });
    }
    
    renderHttpStatus();
    $('#httpSearch').addEventListener('input', (e) => renderHttpStatus(e.target.value));

    // ============================================
    // 工具：Unix 时间戳转换
    // ============================================
    function updateTsNow() {
        $('#tsNow').textContent = Math.floor(Date.now() / 1000);
    }
    updateTsNow();
    setInterval(updateTsNow, 1000);

    function tsToDate(ts, unit) {
        const ms = unit === 'ms' ? ts : ts * 1000;
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '<div class="ts-label">无效的时间戳</div>';
        return `
            <span class="ts-label">本地时间</span>
            <span class="ts-value">${d.toLocaleString('zh-CN')}</span>
            <span class="ts-label">UTC 时间</span>
            <span class="ts-value">${d.toUTCString()}</span>
            <span class="ts-label">ISO 8601</span>
            <span class="ts-value">${d.toISOString()}</span>
            <span class="ts-label">相对时间</span>
            <span class="ts-value">${relativeTime(d)}</span>
        `;
    }

    function relativeTime(d) {
        const diff = d - Date.now();
        const abs = Math.abs(diff);
        const sec = Math.floor(abs / 1000);
        const min = Math.floor(sec / 60);
        const hour = Math.floor(min / 60);
        const day = Math.floor(hour / 24);
        
        let str;
        if (day > 0) str = `${day} 天 ${hour % 24} 小时`;
        else if (hour > 0) str = `${hour} 小时 ${min % 60} 分`;
        else if (min > 0) str = `${min} 分 ${sec % 60} 秒`;
        else str = `${sec} 秒`;
        
        return diff > 0 ? `${str}后` : `${str}前`;
    }

    function dateToTs(dateStr) {
        if (!dateStr) return '<div class="ts-label">请选择日期时间</div>';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '<div class="ts-label">无效的日期</div>';
        return `
            <span class="ts-label">秒级时间戳</span>
            <span class="ts-value">${Math.floor(d.getTime() / 1000)}</span>
            <span class="ts-label">毫秒时间戳</span>
            <span class="ts-value">${d.getTime()}</span>
        `;
    }

    function updateTsResult() {
        const ts = $('#tsInput').value.trim();
        const unit = document.querySelector('input[name="tsUnit"]:checked').value;
        $('#tsResult').innerHTML = ts ? tsToDate(parseInt(ts), unit) : '<div class="ts-label">输入时间戳以转换</div>';
    }

    function updateTsDateResult() {
        $('#tsDateResult').innerHTML = dateToTs($('#tsDateInput').value);
    }

    $('#tsInput').addEventListener('input', updateTsResult);
    $$('input[name="tsUnit"]').forEach(r => r.addEventListener('change', updateTsResult));
    $('#tsDateInput').addEventListener('input', updateTsDateResult);
    
    // 设置当前时间到日期输入
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $('#tsDateInput').value = now.toISOString().slice(0, 16);
    updateTsResult();
    updateTsDateResult();

    // 快捷按钮
    $$('.ts-quick .mini-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const type = btn.dataset.ts;
            let d;
            switch(type) {
                case 'now': d = new Date(); break;
                case 'today': d = new Date(); d.setHours(0,0,0,0); break;
                case 'tomorrow': d = new Date(); d.setDate(d.getDate()+1); d.setHours(0,0,0,0); break;
                case 'week': d = new Date(); d.setDate(d.getDate()+7); break;
            }
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            $('#tsDateInput').value = d.toISOString().slice(0, 16);
            updateTsDateResult();
        });
    });

    $('#tsCopyNow').addEventListener('click', async function() {
        const ok = await copyText($('#tsNow').textContent);
        if (ok) showCopyFeedback(this);
    });

    // ============================================
    // 工具：文件快传（WebRTC P2P）
    // ============================================
    // 注：纯前端 WebRTC 需要信令服务器交换 SDP
    // 这里使用手动复制粘贴 SDP 的离线方式（无需服务器）
    let ftFile = null;
    let ftPeerConn = null;
    let ftDataChannel = null;
    let ftReceiveBuffer = [];

    // 切换发送/接收模式
    $$('.ft-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.ft-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            $('#ftSendPanel').style.display = mode === 'send' ? 'block' : 'none';
            $('#ftReceivePanel').style.display = mode === 'receive' ? 'block' : 'none';
        });
    });

    // 发送方：选择文件
    const ftFileDrop = $('#ftFileDrop');
    const ftFileInput = $('#ftFileInput');

    ftFileDrop.addEventListener('click', () => ftFileInput.click());
    ftFileDrop.addEventListener('dragover', e => { e.preventDefault(); ftFileDrop.classList.add('dragover'); });
    ftFileDrop.addEventListener('dragleave', () => ftFileDrop.classList.remove('dragover'));
    ftFileDrop.addEventListener('drop', e => {
        e.preventDefault();
        ftFileDrop.classList.remove('dragover');
        if (e.dataTransfer.files[0]) handleFtFile(e.dataTransfer.files[0]);
    });
    ftFileInput.addEventListener('change', e => {
        if (e.target.files[0]) handleFtFile(e.target.files[0]);
    });

    function handleFtFile(file) {
        if (file.size > 2 * 1024 * 1024 * 1024) {
            showToast('文件超过 2GB 限制', 'error');
            return;
        }
        ftFile = file;
        $('#ftFileName').textContent = file.name;
        $('#ftFileSize').textContent = formatBytes(file.size);
        $('#ftFileInfo').style.display = 'block';
        ftFileDrop.style.display = 'none';
        generateOffer();
    }

    $('#ftFileRemove').addEventListener('click', () => {
        ftFile = null;
        ftFileInput.value = '';
        $('#ftFileInfo').style.display = 'none';
        ftFileDrop.style.display = 'block';
        $('#ftCodeArea').style.display = 'none';
    });

    // 生成取件码（实际上是 SDP offer 的简化编码）
    async function generateOffer() {
        try {
            const status = $('#ftSendStatus');
            status.className = 'ft-status info show';
            status.textContent = '正在生成取件码...';

            ftPeerConn = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            ftDataChannel = ftPeerConn.createDataChannel('file');
            ftDataChannel.binaryType = 'arraybuffer';
            
            ftDataChannel.onopen = () => {
                status.className = 'ft-status success show';
                status.textContent = '✓ 连接已建立，正在发送文件...';
                sendFile();
            };

            ftDataChannel.onclose = () => {
                status.className = 'ft-status success show';
                status.textContent = '✓ 文件发送完成';
            };

            const offer = await ftPeerConn.createOffer();
            await ftPeerConn.setLocalDescription(offer);

            // 等待 ICE 收集完成
            await new Promise(resolve => {
                if (ftPeerConn.iceGatheringState === 'complete') resolve();
                else {
                    ftPeerConn.onicegatheringstatechange = () => {
                        if (ftPeerConn.iceGatheringState === 'complete') resolve();
                    };
                    setTimeout(resolve, 3000); // 最多等 3 秒
                }
            });

            // 生成简短取件码（base64 编码 SDP）
            const sdp = btoa(JSON.stringify(ftPeerConn.localDescription));
            // 将长 SDP 编码成 4-4-4 格式的短码（截取关键部分作为展示，实际复制完整）
            const shortCode = sdp.slice(0, 4) + '-' + sdp.slice(4, 8) + '-' + sdp.slice(8, 12);
            
            $('#ftCodeDisplay').textContent = shortCode;
            $('#ftCodeDisplay').dataset.fullCode = sdp;
            $('#ftCodeArea').style.display = 'block';
            status.className = 'ft-status info show';
            status.innerHTML = '等待接收方连接...<br><small>取件码已生成，请将完整取件码发送给对方</small>';
        } catch (err) {
            const status = $('#ftSendStatus');
            status.className = 'ft-status error show';
            status.textContent = '生成失败: ' + err.message;
        }
    }

    $('#ftCopyCode').addEventListener('click', async () => {
        const fullCode = $('#ftCodeDisplay').dataset.fullCode;
        if (!fullCode) return;
        // 复制完整 SDP（用"取件码"包装，便于对方粘贴）
        const wrapped = `AQUA_FT:${fullCode}`;
        try {
            await navigator.clipboard.writeText(wrapped);
            showToast('完整取件码已复制（请发送给接收方）');
        } catch {
            // 退化方案：创建可点击的文本框
            const ta = document.createElement('textarea');
            ta.value = wrapped;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showToast('完整取件码已复制');
        }
    });

    // 发送文件
    function sendFile() {
        if (!ftFile || !ftDataChannel || ftDataChannel.readyState !== 'open') return;
        
        const reader = new FileReader();
        const chunkSize = 64 * 1024; // 64KB
        let offset = 0;
        
        // 先发送文件元信息
        ftDataChannel.send(JSON.stringify({
            type: 'meta',
            name: ftFile.name,
            size: ftFile.size,
            mime: ftFile.type
        }));
        
        reader.onload = e => {
            ftDataChannel.send(e.target.result);
            offset += e.target.result.byteLength;
            const progress = (offset / ftFile.size * 100).toFixed(1);
            const status = $('#ftSendStatus');
            status.className = 'ft-status info show';
            status.textContent = `发送中... ${progress}%`;
            
            if (offset < ftFile.size) {
                readSlice(offset);
            } else {
                ftDataChannel.send(JSON.stringify({ type: 'done' }));
                status.className = 'ft-status success show';
                status.textContent = '✓ 文件发送完成';
            }
        };
        
        function readSlice(o) {
            const slice = ftFile.slice(o, o + chunkSize);
            reader.readAsArrayBuffer(slice);
        }
        readSlice(0);
    }

    // 接收方：输入取件码连接
    $('#ftConnect').addEventListener('click', async () => {
        const codeInput = $('#ftCodeInput').value.trim();
        if (!codeInput) {
            showToast('请输入取件码', 'error');
            return;
        }

        const status = $('#ftReceiveStatus');
        
        try {
            // 提取完整 SDP
            let sdpBase64;
            if (codeInput.startsWith('AQUA_FT:')) {
                sdpBase64 = codeInput.slice(8);
            } else {
                // 用户可能只粘贴了短码，尝试拼接
                throw new Error('请粘贴发送方复制的完整取件码（以 AQUA_FT: 开头）');
            }

            const offer = JSON.parse(atob(sdpBase64));
            
            status.className = 'ft-status info show';
            status.textContent = '正在建立连接...';

            ftPeerConn = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            ftPeerConn.ondatachannel = event => {
                ftDataChannel = event.channel;
                ftDataChannel.binaryType = 'arraybuffer';
                
                let receivedSize = 0;
                let fileMeta = null;
                let chunks = [];
                
                ftDataChannel.onmessage = async e => {
                    if (typeof e.data === 'string') {
                        const msg = JSON.parse(e.data);
                        if (msg.type === 'meta') {
                            fileMeta = msg;
                            $('#ftReceiveFileName').textContent = msg.name;
                            $('#ftReceiveFileSize').textContent = formatBytes(msg.size);
                            $('#ftDownloadArea').style.display = 'block';
                        } else if (msg.type === 'done') {
                            const blob = new Blob(chunks, { type: fileMeta ? fileMeta.mime : '' });
                            const url = URL.createObjectURL(blob);
                            $('#ftDownloadBtn').dataset.url = url;
                            $('#ftDownloadBtn').dataset.name = fileMeta ? fileMeta.name : 'download';
                            $('#ftProgressText').textContent = '✓ 接收完成，可点击下载';
                            status.className = 'ft-status success show';
                            status.textContent = '✓ 文件接收完成';
                        }
                    } else {
                        chunks.push(e.data);
                        receivedSize += e.data.byteLength;
                        if (fileMeta) {
                            const progress = (receivedSize / fileMeta.size * 100).toFixed(1);
                            $('#ftProgressFill').style.width = progress + '%';
                            $('#ftProgressText').textContent = `接收中... ${progress}%`;
                        }
                    }
                };
                
                ftDataChannel.onopen = () => {
                    status.className = 'ft-status success show';
                    status.textContent = '✓ 已连接，等待文件...';
                };
            };

            await ftPeerConn.setRemoteDescription(offer);
            const answer = await ftPeerConn.createAnswer();
            await ftPeerConn.setLocalDescription(answer);
            
            status.className = 'ft-status info show';
            status.textContent = '连接建立中，请稍候...';
            
            // 如果 NAT 类型限制，纯 STUN 可能无法连接
            // 这里给用户提示
            setTimeout(() => {
                if (ftDataChannel && ftDataChannel.readyState !== 'open') {
                    status.className = 'ft-status info show';
                    status.innerHTML = '连接建立中，如果长时间无响应可能是 NAT 类型不兼容<br><small>建议在同一网络下测试，或使用 TURN 服务器</small>';
                }
            }, 5000);
            
        } catch (err) {
            status.className = 'ft-status error show';
            status.textContent = '连接失败: ' + err.message;
        }
    });

    $('#ftDownloadBtn').addEventListener('click', function() {
        if (!this.dataset.url) return;
        const a = document.createElement('a');
        a.href = this.dataset.url;
        a.download = this.dataset.name;
        a.click();
        showToast('文件已开始下载');
    });

    // ============================================
    // 工具：加密聊天（WebRTC P2P + AES-GCM）
    // ============================================
    let chatPeerConn = null;
    let chatDataChannel = null;
    let chatCryptoKey = null;
    let chatRole = null; // 'create' or 'join'

    $$('.chat-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.chat-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.cmode;
            $('#chatCreatePanel').style.display = mode === 'create' ? 'block' : 'none';
            $('#chatJoinPanel').style.display = mode === 'join' ? 'block' : 'none';
        });
    });

    async function generateChatKey() {
        chatCryptoKey = await crypto.subtle.generateKey(
            { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        );
        const raw = await crypto.subtle.exportKey('raw', chatCryptoKey);
        return btoa(String.fromCharCode(...new Uint8Array(raw)));
    }

    async function importChatKey(base64) {
        const raw = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        chatCryptoKey = await crypto.subtle.importKey(
            'raw', raw, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
        );
    }

    async function encryptMsg(text) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const enc = new TextEncoder().encode(text);
        const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, chatCryptoKey, enc);
        return { iv: btoa(String.fromCharCode(...iv)), data: btoa(String.fromCharCode(...new Uint8Array(cipher))) };
    }

    async function decryptMsg(obj) {
        const iv = Uint8Array.from(atob(obj.iv), c => c.charCodeAt(0));
        const data = Uint8Array.from(atob(obj.data), c => c.charCodeAt(0));
        const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, chatCryptoKey, data);
        return new TextDecoder().decode(plain);
    }

    function appendChatMsg(text, type) {
        const div = document.createElement('div');
        div.className = 'chat-msg ' + type;
        div.textContent = text;
        $('#chatMessages').appendChild(div);
        $('#chatMessages').scrollTop = $('#chatMessages').scrollHeight;
    }

    // 创建房间
    $('#chatCreateBtn').addEventListener('click', async () => {
        const btn = $('#chatCreateBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>生成中...';
        btn.disabled = true;

        try {
            const keyB64 = await generateChatKey();
            chatRole = 'create';
            
            chatPeerConn = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            chatDataChannel = chatPeerConn.createDataChannel('chat', { ordered: true });
            setupChatChannel(chatDataChannel);
            
            const offer = await chatPeerConn.createOffer();
            await chatPeerConn.setLocalDescription(offer);
            
            await new Promise(resolve => {
                if (chatPeerConn.iceGatheringState === 'complete') resolve();
                else {
                    chatPeerConn.onicegatheringstatechange = () => {
                        if (chatPeerConn.iceGatheringState === 'complete') resolve();
                    };
                    setTimeout(resolve, 3000);
                }
            });

            const sdp = btoa(JSON.stringify(chatPeerConn.localDescription));
            const inviteCode = `AQUA_CHAT:${keyB64}:${sdp}`;
            $('#chatCreateCode').value = inviteCode;
            $('#chatCreateCodeArea').style.display = 'block';
            $('#chatWaiting').style.display = 'block';

            // 等待对方的 answer（通过 paste）
            waitForAnswer();
        } catch (err) {
            showToast('创建失败: ' + err.message, 'error');
        }
        btn.innerHTML = '<i class="fas fa-magic"></i>生成房间邀请码';
        btn.disabled = false;
    });

    async function waitForAnswer() {
        // 用户需要手动粘贴对方的 answer
        const answerArea = document.createElement('div');
        answerArea.className = 'chat-code-area';
        answerArea.style.marginTop = '12px';
        answerArea.innerHTML = `
            <div class="chat-code-label">将邀请码发给对方后，对方会返回一个"应答码"，粘贴到下方</div>
            <textarea class="text-input code" id="chatAnswerInput" rows="3" placeholder="粘贴对方的应答码..."></textarea>
            <button class="tool-btn primary" id="chatAcceptAnswer"><i class="fas fa-check"></i>确认连接</button>
        `;
        $('#chatCreateCodeArea').appendChild(answerArea);
        
        document.getElementById('chatAcceptAnswer').addEventListener('click', async () => {
            const code = document.getElementById('chatAnswerInput').value.trim();
            if (!code.startsWith('AQUA_CHAT_ANS:')) {
                showToast('应答码格式错误', 'error');
                return;
            }
            try {
                const sdp = atob(code.slice(15));
                const answer = JSON.parse(sdp);
                await chatPeerConn.setRemoteDescription(answer);
                showToast('已建立连接');
                enterChatRoom('加密房间（创建者）');
            } catch (err) {
                showToast('连接失败: ' + err.message, 'error');
            }
        });
    }

    // 加入房间
    $('#chatJoinBtn').addEventListener('click', async () => {
        const code = $('#chatJoinCode').value.trim();
        if (!code.startsWith('AQUA_CHAT:')) {
            showToast('邀请码格式错误', 'error');
            return;
        }
        
        const btn = $('#chatJoinBtn');
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>连接中...';
        btn.disabled = true;

        try {
            const parts = code.slice(11).split(':');
            const keyB64 = parts[0];
            const offerSdp = parts.slice(1).join(':');
            
            await importChatKey(keyB64);
            chatRole = 'join';
            
            chatPeerConn = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });
            
            chatPeerConn.ondatachannel = e => {
                chatDataChannel = e.channel;
                setupChatChannel(chatDataChannel);
            };
            
            const offer = JSON.parse(atob(offerSdp));
            await chatPeerConn.setRemoteDescription(offer);
            const answer = await chatPeerConn.createAnswer();
            await chatPeerConn.setLocalDescription(answer);
            
            await new Promise(resolve => {
                if (chatPeerConn.iceGatheringState === 'complete') resolve();
                else {
                    chatPeerConn.onicegatheringstatechange = () => {
                        if (chatPeerConn.iceGatheringState === 'complete') resolve();
                    };
                    setTimeout(resolve, 3000);
                }
            });

            const answerCode = 'AQUA_CHAT_ANS:' + btoa(JSON.stringify(chatPeerConn.localDescription));
            showToast('已生成应答码，请复制给对方');
            
            // 显示应答码
            const answerArea = document.createElement('div');
            answerArea.className = 'chat-code-area';
            answerArea.style.marginTop = '12px';
            answerArea.innerHTML = `
                <div class="chat-code-label">将下方应答码复制发送给创建者</div>
                <textarea class="text-input code" rows="3" readonly>${answerCode}</textarea>
                <button class="tool-btn primary" id="chatCopyAnswer"><i class="fas fa-copy"></i>复制应答码</button>
                <p style="margin-top:10px;font-size:0.82rem;color:var(--text-muted);">对方粘贴后即可建立连接</p>
            `;
            $('#chatJoinPanel').appendChild(answerArea);
            
            document.getElementById('chatCopyAnswer').addEventListener('click', async () => {
                await copyText(answerCode);
                showToast('应答码已复制');
            });
            
            enterChatRoom('加密房间（加入者）');
        } catch (err) {
            showToast('连接失败: ' + err.message, 'error');
        }
        btn.innerHTML = '<i class="fas fa-link"></i>连接房间';
        btn.disabled = false;
    });

    function setupChatChannel(channel) {
        channel.onopen = () => {
            $('#chatConnStatus').textContent = '已连接';
            $('#chatConnStatus').classList.remove('connecting');
            appendChatMsg('连接已建立，可以开始聊天', 'system');
        };
        channel.onmessage = async e => {
            try {
                const obj = JSON.parse(e.data);
                const text = await decryptMsg(obj);
                appendChatMsg(text, 'peer');
            } catch {
                appendChatMsg(e.data, 'peer');
            }
        };
        channel.onclose = () => {
            appendChatMsg('对方已断开', 'system');
            $('#chatConnStatus').textContent = '已断开';
        };
    }

    function enterChatRoom(name) {
        $('#chatSetup').style.display = 'none';
        $('#chatRoom').style.display = 'flex';
        $('#chatRoomName').textContent = name;
        $('#chatConnStatus').textContent = '连接中...';
        $('#chatConnStatus').classList.add('connecting');
    }

    async function sendChatMsg() {
        const input = $('#chatInput');
        const text = input.value.trim();
        if (!text || !chatDataChannel || chatDataChannel.readyState !== 'open') return;
        
        const enc = await encryptMsg(text);
        chatDataChannel.send(JSON.stringify(enc));
        appendChatMsg(text, 'self');
        input.value = '';
    }

    $('#chatSendBtn').addEventListener('click', sendChatMsg);
    $('#chatInput').addEventListener('keydown', e => {
        if (e.key === 'Enter') sendChatMsg();
    });

    $('#chatLeaveBtn').addEventListener('click', () => {
        if (chatDataChannel) chatDataChannel.close();
        if (chatPeerConn) chatPeerConn.close();
        chatPeerConn = null;
        chatDataChannel = null;
        $('#chatRoom').style.display = 'none';
        $('#chatSetup').style.display = 'block';
        $('#chatMessages').innerHTML = '';
        $('#chatCreateCodeArea').style.display = 'none';
        $('#chatWaiting').style.display = 'none';
    });

    $('#chatCopyInvite').addEventListener('click', async () => {
        const code = $('#chatCreateCode').value;
        if (code) {
            await copyText(code);
            showToast('邀请码已复制');
        }
    });

    // ============================================
    // 工具：在线终端（JS 沙箱）
    // ============================================
    const termBody = $('#terminalBody');
    const termInput = $('#terminalInput');
    const termHistory = [];
    let termHistIdx = -1;

    function termPrint(text, cls = '') {
        const line = document.createElement('div');
        line.className = 'terminal-line' + (cls ? ' ' + cls : '');
        line.innerHTML = text;
        termBody.appendChild(line);
        termBody.scrollTop = termBody.scrollHeight;
    }

    function termExec(input) {
        termPrint(`<span class="terminal-prompt" style="color:#27c93f">aqua@browser:~$</span> <span style="color:#dcecff">${escapeHtml(input)}</span>`);
        
        const parts = input.trim().split(/\s+/);
        const cmd = parts[0].toLowerCase();
        const args = parts.slice(1);
        
        switch(cmd) {
            case 'help':
                termPrint('可用命令：', 'term-cmd');
                termPrint('  <span class="term-cmd">help</span>      - 显示帮助');
                termPrint('  <span class="term-cmd">date</span>      - 显示当前日期时间');
                termPrint('  <span class="term-cmd">calc</span> [表达式] - 计算数学表达式 (如 calc 1+2*3)');
                termPrint('  <span class="term-cmd">echo</span> [文本] - 回显文本');
                termPrint('  <span class="term-cmd">uuid</span>      - 生成 UUID');
                termPrint('  <span class="term-cmd">random</span> [min] [max] - 生成随机数');
                termPrint('  <span class="term-cmd">base64</span> [text] - Base64 编码');
                termPrint('  <span class="term-cmd">len</span> [text]  - 计算字符串长度');
                termPrint('  <span class="term-cmd">whoami</span>    - 显示当前用户');
                termPrint('  <span class="term-cmd">about</span>     - 关于本终端');
                termPrint('  <span class="term-cmd">clear</span>     - 清屏');
                break;
            case 'date':
                termPrint(new Date().toLocaleString('zh-CN'));
                break;
            case 'calc':
                if (args.length === 0) {
                    termPrint('用法: calc [表达式]   例如: calc 1+2*3', 'term-cmd');
                } else {
                    try {
                        const expr = args.join(' ').replace(/[^-()\d/*+.%\s]/g, '');
                        if (!expr) throw new Error('无效表达式');
                        const result = Function('"use strict";return (' + expr + ')')();
                        termPrint('= ' + result);
                    } catch (err) {
                        termPrint('错误: 表达式无效', 'term-cmd');
                    }
                }
                break;
            case 'echo':
                termPrint(args.join(' '));
                break;
            case 'uuid':
                termPrint(crypto.randomUUID ? crypto.randomUUID() : 
                    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                        const r = Math.random() * 16 | 0;
                        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                    }));
                break;
            case 'random':
                if (args.length >= 2) {
                    const min = parseInt(args[0]), max = parseInt(args[1]);
                    if (!isNaN(min) && !isNaN(max)) {
                        termPrint(Math.floor(Math.random() * (max - min + 1)) + min);
                        break;
                    }
                }
                termPrint(Math.random().toFixed(6));
                break;
            case 'base64':
                if (args.length === 0) {
                    termPrint('用法: base64 [文本]', 'term-cmd');
                } else {
                    try {
                        termPrint(btoa(unescape(encodeURIComponent(args.join(' ')))));
                    } catch {
                        termPrint('编码失败', 'term-cmd');
                    }
                }
                break;
            case 'len':
                termPrint(String(args.join(' ').length));
                break;
            case 'whoami':
                termPrint('aqua-browser-user');
                break;
            case 'about':
                termPrint('Aqua Browser Terminal v1.0', 'term-cmd');
                termPrint('JavaScript 沙箱终端，所有命令在浏览器内执行');
                termPrint('不会访问你的操作系统文件');
                break;
            case 'clear':
                termBody.innerHTML = '';
                break;
            case '':
                break;
            default:
                termPrint(`命令未找到: ${cmd}。输入 <span class="term-cmd">help</span> 查看可用命令。`, 'term-cmd');
        }
    }

    termInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            const val = termInput.value;
            if (val.trim()) {
                termHistory.push(val);
                termHistIdx = termHistory.length;
            }
            termExec(val);
            termInput.value = '';
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (termHistIdx > 0) {
                termHistIdx--;
                termInput.value = termHistory[termHistIdx];
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (termHistIdx < termHistory.length - 1) {
                termHistIdx++;
                termInput.value = termHistory[termHistIdx];
            } else {
                termHistIdx = termHistory.length;
                termInput.value = '';
            }
        }
    });

    $$('.terminal-commands .mini-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const cmd = btn.dataset.cmd;
            termInput.value = cmd === 'calc' ? 'calc ' : cmd === 'echo' ? 'echo ' : cmd === 'base64' ? 'base64 ' : cmd;
            termInput.focus();
            if (['date', 'uuid', 'random', 'clear', 'help', 'whoami', 'about'].includes(cmd)) {
                termExec(cmd);
                termInput.value = '';
            }
        });
    });

    // ============================================
    // 工具：KMS 激活向导
    // ============================================
    const kmsGvlks = {
        'win10': 'W269N-WFGWX-YVC9B-4J6C9-T83GX',
        'win10ent': 'NPPR9-FWDCX-D2C8J-H872K-2YT43',
        'office2019': 'NMMKJ-6RK4F-KMJVX-8D9MJ-6MWKP',
        'office365': 'NMMKJ-6RK4F-KMJVX-8D9MJ-6MWKP'
    };

    function updateKmsCommand() {
        const product = document.querySelector('input[name="kmsProduct"]:checked').value;
        const server = $('#kmsServer').value.trim() || 'kms.example.com';
        const port = $('#kmsPort').value.trim() || '1688';
        const gvlk = kmsGvlks[product];
        const addr = server + (port !== '1688' ? ':' + port : '');
        
        let cmd = '';
        if (product.startsWith('win')) {
            cmd = `:: Windows 激活命令（以管理员身份运行 CMD）\nslmgr /upk\nslmgr /ipk ${gvlk}\nslmgr /skms ${addr}\nslmgr /ato\nslmgr /xpr`;
        } else {
            cmd = `:: Office 激活命令（以管理员身份运行 CMD）\n:: 先进入 Office 安装目录，例如：\ncd "C:\\Program Files\\Microsoft Office\\Office16"\n\n:: 然后执行：\ncscript ospp.vbs /inpkey:${gvlk}\ncscript ospp.vbs /sethst:${server}\ncscript ospp.vbs /setprt:${port}\ncscript ospp.vbs /act\ncscript ospp.vbs /dstatus`;
        }
        $('#kmsCommand').textContent = cmd;
    }

    $$('input[name="kmsProduct"]').forEach(r => r.addEventListener('change', updateKmsCommand));
    $('#kmsServer').addEventListener('input', updateKmsCommand);
    $('#kmsPort').addEventListener('input', updateKmsCommand);
    updateKmsCommand();

    $('#kmsCopyCmd').addEventListener('click', async () => {
        await copyText($('#kmsCommand').textContent);
    });

    // ============================================
    // 工具：本地备份箱（IndexedDB）
    // ============================================
    const DB_NAME = 'AquaBackup';
    const STORE = 'files';
    let backupDb = null;

    function openBackupDb() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'id' });
                }
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = e => reject(e.target.error);
        });
    }

    async function initBackup() {
        try {
            backupDb = await openBackupDb();
            renderBackupList();
            updateBackupStats();
        } catch (err) {
            console.error('IndexedDB 初始化失败', err);
        }
    }

    function backupTransaction(mode) {
        return backupDb.transaction(STORE, mode).objectStore(STORE);
    }

    function addBackupFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const item = {
                    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    data: reader.result,
                    createdAt: Date.now()
                };
                const req = backupTransaction('readwrite').add(item);
                req.onsuccess = () => resolve(item);
                req.onerror = () => reject(req.error);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    function getAllBackupFiles() {
        return new Promise((resolve, reject) => {
            const req = backupTransaction('readonly').getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function deleteBackupFile(id) {
        return new Promise((resolve, reject) => {
            const req = backupTransaction('readwrite').delete(id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    function clearAllBackup() {
        return new Promise((resolve, reject) => {
            const req = backupTransaction('readwrite').clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    }

    async function renderBackupList(filter = '') {
        const list = $('#backupList');
        try {
            const files = await getAllBackupFiles();
            const filtered = filter ? files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase())) : files;
            
            if (filtered.length === 0) {
                list.innerHTML = '<div class="backup-empty"><i class="fas fa-folder-open"></i><p>' + 
                    (files.length === 0 ? '暂无文件，点击上方"上传文件"开始' : '没有匹配的文件') + '</p></div>';
                return;
            }
            
            list.innerHTML = filtered.sort((a, b) => b.createdAt - a.createdAt).map(f => `
                <div class="backup-item">
                    <div class="backup-item-header">
                        <i class="fas ${getFileIcon(f.name)} backup-item-icon"></i>
                        <div class="backup-item-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</div>
                    </div>
                    <div class="backup-item-meta">
                        <span>${formatBytes(f.size)}</span>
                        <span>${new Date(f.createdAt).toLocaleDateString('zh-CN')}</span>
                    </div>
                    <div class="backup-item-actions">
                        <button class="mini-btn" data-dl="${f.id}"><i class="fas fa-download"></i></button>
                        <button class="mini-btn" data-del="${f.id}"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
            
            $$('#backupList [data-dl]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const file = (await getAllBackupFiles()).find(f => f.id === btn.dataset.dl);
                    if (file) {
                        const a = document.createElement('a');
                        a.href = file.data;
                        a.download = file.name;
                        a.click();
                        showToast('已下载 ' + file.name);
                    }
                });
            });
            $$('#backupList [data-del]').forEach(btn => {
                btn.addEventListener('click', async () => {
                    await deleteBackupFile(btn.dataset.del);
                    renderBackupList($('#backupSearch').value);
                    updateBackupStats();
                    showToast('已删除');
                });
            });
        } catch (err) {
            list.innerHTML = '<div class="backup-empty"><p>加载失败: ' + err.message + '</p></div>';
        }
    }

    async function updateBackupStats() {
        try {
            const files = await getAllBackupFiles();
            $('#backupFileCount').textContent = files.length;
            const total = files.reduce((s, f) => s + f.size, 0);
            $('#backupTotalSize').textContent = formatBytes(total);
            
            if (navigator.storage && navigator.storage.estimate) {
                const est = await navigator.storage.estimate();
                const remain = est.quota - est.usage;
                $('#backupQuota').textContent = formatBytes(remain);
            } else {
                $('#backupQuota').textContent = '未知';
            }
        } catch {}
    }

    function getFileIcon(name) {
        const ext = name.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'fa-image';
        if (['mp4', 'avi', 'mov', 'mkv'].includes(ext)) return 'fa-film';
        if (['mp3', 'wav', 'flac'].includes(ext)) return 'fa-music';
        if (['pdf'].includes(ext)) return 'fa-file-pdf';
        if (['doc', 'docx'].includes(ext)) return 'fa-file-word';
        if (['xls', 'xlsx'].includes(ext)) return 'fa-file-excel';
        if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-file-archive';
        if (['js', 'ts', 'py', 'java', 'go', 'rs', 'c', 'cpp', 'html', 'css', 'json'].includes(ext)) return 'fa-file-code';
        if (['txt', 'md'].includes(ext)) return 'fa-file-alt';
        return 'fa-file';
    }

    $('#backupFileInput').addEventListener('change', async e => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            try {
                await addBackupFile(file);
            } catch (err) {
                showToast('上传失败: ' + file.name, 'error');
            }
        }
        e.target.value = '';
        renderBackupList($('#backupSearch').value);
        updateBackupStats();
        showToast(`已上传 ${files.length} 个文件`);
    });

    $('#backupSearch').addEventListener('input', e => renderBackupList(e.target.value));

    $('#backupClearAll').addEventListener('click', async () => {
        if (!confirm('确定要清空所有文件吗？此操作不可恢复。')) return;
        await clearAllBackup();
        renderBackupList();
        updateBackupStats();
        showToast('已清空');
    });

    $('#backupDownloadAll').addEventListener('click', async () => {
        const files = await getAllBackupFiles();
        if (files.length === 0) {
            showToast('没有文件可下载', 'error');
            return;
        }
        for (const f of files) {
            const a = document.createElement('a');
            a.href = f.data;
            a.download = f.name;
            a.click();
            await new Promise(r => setTimeout(r, 200));
        }
        showToast('已开始下载全部文件');
    });

    initBackup();

    // ============================================
    // 工具：开源广场（本地知识库）
    // ============================================
    const OS_KEY = 'aqua_opensource_v1';
    let osData = { sections: [] };
    let osActiveSection = null;
    let osSearchTerm = '';

    function genOsId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }

    function loadOsData() {
        try {
            osData = JSON.parse(localStorage.getItem(OS_KEY)) || { sections: [] };
            if (!Array.isArray(osData.sections)) osData.sections = [];
        } catch { osData = { sections: [] }; }
    }

    function saveOsData() {
        try {
            localStorage.setItem(OS_KEY, JSON.stringify(osData));
        } catch (e) {
            showToast('保存失败：本地存储不可用', 'error');
        }
    }

    // ---- 轻量表单模态（替代原生 prompt，兼容 iframe 预览） ----
    function osFormModal({ title, fields, confirmText = '确定', onConfirm }) {
        const overlay = document.createElement('div');
        overlay.className = 'os-modal-overlay';
        const card = document.createElement('div');
        card.className = 'os-modal-card';
        card.innerHTML = `
            <div class="os-modal-title">${escapeHtml(title)}</div>
            <div class="os-modal-fields">
                ${fields.map(f => `
                    <label class="os-modal-field">
                        <span class="os-modal-field-label">${escapeHtml(f.label)}${f.required ? ' <em>*</em>' : ''}</span>
                        ${f.type === 'textarea'
                            ? `<textarea data-field="${f.name}" rows="${f.rows || 6}" placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(f.value || '')}</textarea>`
                            : `<input type="text" data-field="${f.name}" value="${escapeHtml(f.value || '')}" placeholder="${escapeHtml(f.placeholder || '')}">`}
                    </label>`).join('')}
            </div>
            <div class="os-modal-actions">
                <button class="tool-btn os-modal-cancel">取消</button>
                <button class="tool-btn primary os-modal-ok">${escapeHtml(confirmText)}</button>
            </div>`;
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));

        const close = () => {
            overlay.classList.remove('show');
            setTimeout(() => overlay.remove(), 220);
        };
        card.querySelector('.os-modal-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);

        const okBtn = card.querySelector('.os-modal-ok');
        const first = card.querySelector('[data-field]');
        if (first) first.focus();
        card.querySelectorAll('[data-field]').forEach(el => {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && el.tagName !== 'TEXTAREA') okBtn.click();
            });
        });

        okBtn.addEventListener('click', () => {
            const values = {};
            let valid = true;
            fields.forEach(f => {
                const el = card.querySelector(`[data-field="${f.name}"]`);
                const v = (el.value || '').trim();
                values[f.name] = v;
                if (f.required && !v) {
                    valid = false;
                    el.classList.add('os-field-error');
                } else {
                    el.classList.remove('os-field-error');
                }
            });
            if (!valid) { showToast('请填写必填项', 'error'); return; }
            onConfirm(values);
            close();
        });
    }

    // ---- 轻量确认模态（替代原生 confirm） ----
    function osConfirm(message, onConfirm, confirmText = '确定') {
        const overlay = document.createElement('div');
        overlay.className = 'os-modal-overlay';
        const card = document.createElement('div');
        card.className = 'os-modal-card';
        card.innerHTML = `
            <div class="os-modal-confirm-text">${escapeHtml(message)}</div>
            <div class="os-modal-actions">
                <button class="tool-btn os-modal-cancel">取消</button>
                <button class="tool-btn primary danger os-modal-ok">${escapeHtml(confirmText)}</button>
            </div>`;
        overlay.appendChild(card);
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('show'));
        const close = () => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 220); };
        card.querySelector('.os-modal-cancel').addEventListener('click', close);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
        const onKey = (e) => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
        document.addEventListener('keydown', onKey);
        const okBtn = card.querySelector('.os-modal-ok');
        okBtn.focus();
        okBtn.addEventListener('click', () => { close(); onConfirm(); });
    }

    function renderOsSections() {
        const list = $('#osSectionList');
        if (!list) return;
        list.innerHTML = '';
        const term = osSearchTerm.trim().toLowerCase();
        const visible = osData.sections.filter(s =>
            !term ||
            s.name.toLowerCase().includes(term) ||
            (s.description || '').toLowerCase().includes(term)
        );
        if (osData.sections.length === 0) {
            list.innerHTML = '<div class="os-empty-mini">暂无栏目，点击「新建栏目」开始</div>';
            return;
        }
        if (visible.length === 0) {
            list.innerHTML = '<div class="os-empty-mini">没有匹配“' + escapeHtml(osSearchTerm) + '”的栏目</div>';
            return;
        }
        visible.forEach(s => {
            const item = document.createElement('div');
            item.className = 'os-section-item' + (s.id === osActiveSection ? ' active' : '');
            item.innerHTML = `
                <span class="os-section-name">${escapeHtml(s.name)}</span>
                <span class="os-section-count">${s.blocks.length}</span>
                <button class="os-section-del" title="删除栏目"><i class="fas fa-times"></i></button>
            `;
            item.addEventListener('click', () => {
                osSearchTerm = '';
                const se = $('#osSearch'); if (se) se.value = '';
                osActiveSection = s.id;
                renderOsSections();
                renderOsContent();
            });
            item.querySelector('.os-section-del').addEventListener('click', (e) => {
                e.stopPropagation();
                osConfirm(`确定删除栏目“${s.name}”及其 ${s.blocks.length} 条内容？此操作不可恢复。`, () => {
                    osData.sections = osData.sections.filter(x => x.id !== s.id);
                    if (osActiveSection === s.id) osActiveSection = null;
                    saveOsData();
                    renderOsSections();
                    renderOsContent();
                    showToast('栏目已删除');
                }, '删除');
            });
            list.appendChild(item);
        });
    }

    function renderOsContent() {
        const content = $('#osContent');
        if (!content) return;
        const term = osSearchTerm.trim().toLowerCase();

        if (term) {
            const results = [];
            osData.sections.forEach(s => {
                s.blocks.forEach(b => {
                    if (b.title.toLowerCase().includes(term) || (b.content || '').toLowerCase().includes(term)) {
                        results.push({ section: s, block: b });
                    }
                });
            });
            content.innerHTML = results.length === 0
                ? '<div class="os-empty"><i class="fas fa-search"></i><p>没有匹配“' + escapeHtml(osSearchTerm) + '”的内容</p></div>'
                : '<div class="os-search-head">搜索“' + escapeHtml(osSearchTerm) + '” · 共 ' + results.length + ' 条结果</div>' +
                  results.map(r => `
                    <div class="os-block">
                        <div class="os-block-header">
                            <div class="os-block-title">${escapeHtml(r.block.title)}</div>
                            <div class="os-block-section">${escapeHtml(r.section.name)}</div>
                        </div>
                        <div class="os-block-content">${escapeHtml(r.block.content)}</div>
                        <div class="os-block-meta">发布于 ${new Date(r.block.createdAt).toLocaleString('zh-CN')}${r.block.updatedAt ? ' · 已编辑' : ''}</div>
                    </div>`).join('');
            return;
        }

        const section = osData.sections.find(s => s.id === osActiveSection);
        if (!section) {
            content.innerHTML = '<div class="os-empty"><i class="fas fa-book-open"></i><p>选择左侧栏目查看内容，或新建栏目开始</p></div>';
            return;
        }

        const blocksHtml = section.blocks.length === 0
            ? '<div class="os-empty"><i class="fas fa-pen"></i><p>这个栏目还没有内容，点击「发布内容」开始</p></div>'
            : section.blocks.map(b => `
                <div class="os-block">
                    <div class="os-block-header">
                        <div class="os-block-title">${escapeHtml(b.title)}</div>
                        <div class="os-block-actions">
                            <button class="mini-btn small" data-edit="${b.id}"><i class="fas fa-edit"></i></button>
                            <button class="mini-btn small" data-del="${b.id}"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                    <div class="os-block-content">${escapeHtml(b.content)}</div>
                    <div class="os-block-meta">发布于 ${new Date(b.createdAt).toLocaleString('zh-CN')}${b.updatedAt ? ' · 已编辑' : ''}</div>
                </div>
            `).join('');

        content.innerHTML = `
            <div class="os-content-header">
                <div class="os-content-title">${escapeHtml(section.name)}</div>
                <button class="tool-btn primary" id="osNewBlock"><i class="fas fa-plus"></i>发布内容</button>
            </div>
            <div class="os-blocks">${blocksHtml}</div>
        `;

        $('#osNewBlock').addEventListener('click', () => openOsEditor());
        $$('#osContent [data-edit]').forEach(btn => btn.addEventListener('click', () => openOsEditor(btn.dataset.edit)));
        $$('#osContent [data-del]').forEach(btn => btn.addEventListener('click', () => {
            osConfirm('确定删除这条内容？', () => {
                section.blocks = section.blocks.filter(b => b.id !== btn.dataset.del);
                saveOsData();
                renderOsSections();
                renderOsContent();
                showToast('内容已删除');
            }, '删除');
        }));
    }

    function openOsEditor(blockId = null) {
        const section = osData.sections.find(s => s.id === osActiveSection);
        if (!section) return;
        const block = blockId ? section.blocks.find(b => b.id === blockId) : null;
        osFormModal({
            title: block ? '编辑内容' : '发布内容',
            confirmText: block ? '保存' : '发布',
            fields: [
                { name: 'title', label: '标题', value: block ? block.title : '', placeholder: '例如：Vue 3 组合式 API 笔记', required: true },
                { name: 'content', label: '内容', type: 'textarea', value: block ? block.content : '', placeholder: '支持纯文本，记录要点、链接、代码片段…', rows: 8 }
            ],
            onConfirm: (v) => {
                if (block) {
                    block.title = v.title;
                    block.content = v.content;
                    block.updatedAt = Date.now();
                } else {
                    section.blocks.push({ id: genOsId(), title: v.title, content: v.content, createdAt: Date.now() });
                }
                saveOsData();
                renderOsSections();
                renderOsContent();
                showToast(block ? '已保存' : '已发布');
            }
        });
    }

    function openNewSectionModal() {
        osFormModal({
            title: '新建栏目',
            confirmText: '创建',
            fields: [
                { name: 'name', label: '栏目名称', value: '', placeholder: '例如：前端框架', required: true },
                { name: 'description', label: '简介（可选）', value: '', placeholder: '一句话描述这个栏目' }
            ],
            onConfirm: (v) => {
                const sec = { id: genOsId(), name: v.name, description: v.description, blocks: [] };
                osData.sections.push(sec);
                osActiveSection = sec.id;
                osSearchTerm = '';
                const se = $('#osSearch'); if (se) se.value = '';
                saveOsData();
                renderOsSections();
                renderOsContent();
                showToast('栏目已创建');
            }
        });
    }

    function exportOsData() {
        if (osData.sections.length === 0) { showToast('还没有内容可导出', 'error'); return; }
        const blob = new Blob([JSON.stringify(osData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'aqua-opensource-' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('已导出 JSON');
    }

    $('#osNewSection').addEventListener('click', openNewSectionModal);
    const osSearchEl = $('#osSearch');
    if (osSearchEl) osSearchEl.addEventListener('input', (e) => {
        osSearchTerm = e.target.value;
        renderOsContent();
        renderOsSections();
    });
    const osExportBtn = $('#osExport');
    if (osExportBtn) osExportBtn.addEventListener('click', exportOsData);

    loadOsData();
    renderOsSections();
    renderOsContent();

    // ============================================
    // 工具：小说阅读器
    // 支持 TXT / EPUB / HTML / MD 自动转纯文本
    // ============================================
    const READER_KEY = 'aqua_reader_settings_v1';
    let readerState = {
        title: '',
        content: '',
        chapters: [],
        currentChapter: 0,
        fontSize: 18,
        theme: 'light', // light / dark / sepia
        lineHeight: 1.9
    };

    // 加载设置
    try {
        const saved = JSON.parse(localStorage.getItem(READER_KEY));
        if (saved) readerState = { ...readerState, ...saved, content: '', chapters: [] };
    } catch {}

    function saveReaderSettings() {
        const { title, fontSize, theme, lineHeight, currentChapter } = readerState;
        localStorage.setItem(READER_KEY, JSON.stringify({ title, fontSize, theme, lineHeight, currentChapter }));
    }

    // 文件导入
    const readerFileDrop = $('#readerFileDrop');
    const readerFileInput = $('#readerFileInput');

    readerFileDrop.addEventListener('click', () => readerFileInput.click());
    readerFileDrop.addEventListener('dragover', e => { e.preventDefault(); readerFileDrop.classList.add('dragover'); });
    readerFileDrop.addEventListener('dragleave', () => readerFileDrop.classList.remove('dragover'));
    readerFileDrop.addEventListener('drop', e => {
        e.preventDefault();
        readerFileDrop.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadReaderFile(e.dataTransfer.files[0]);
    });
    readerFileInput.addEventListener('change', e => {
        if (e.target.files[0]) loadReaderFile(e.target.files[0]);
    });

    async function loadReaderFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        let text = '';
        let chapters = [];

        try {
            if (ext === 'txt' || ext === 'text') {
                text = await file.text();
                // 尝试检测编码（如果是乱码，尝试 GBK）
                if (/[\uFFFD]/.test(text)) {
                    try {
                        const buf = await file.arrayBuffer();
                        // 简易 GBK 解码：使用 TextDecoder
                        text = new TextDecoder('gbk').decode(buf);
                    } catch {}
                }
                chapters = splitTxtChapters(text);
            } else if (ext === 'epub') {
                const result = await parseEpub(file);
                text = result.text;
                chapters = result.chapters;
            } else if (ext === 'html' || ext === 'htm') {
                text = await file.text();
                const doc = new DOMParser().parseFromString(text, 'text/html');
                text = doc.body.innerText;
                chapters = splitTxtChapters(text);
            } else if (ext === 'md') {
                text = await file.text();
                text = marked.parse(text);
                const div = document.createElement('div');
                div.innerHTML = text;
                text = div.innerText;
                chapters = splitTxtChapters(text);
            } else {
                showToast('不支持的格式：' + ext, 'error');
                return;
            }

            if (!text.trim()) {
                showToast('文件内容为空', 'error');
                return;
            }

            readerState.title = baseName;
            readerState.content = text;
            readerState.chapters = chapters.length > 0 ? chapters : [{ title: baseName, content: text }];
            readerState.currentChapter = 0;

            openReader();
            saveReaderSettings();
            showToast(`已加载：${baseName}`);
        } catch (err) {
            console.error(err);
            showToast('文件解析失败: ' + err.message, 'error');
        }
    }

    // 解析 EPUB（使用 JSZip）
    async function parseEpub(file) {
        const zip = await JSZip.loadAsync(file);
        let opfPath = '';
        let opfContent = '';

        // 查找 OPF 文件
        for (const name in zip.files) {
            if (name.endsWith('.opf')) {
                opfPath = name;
                opfContent = await zip.files[name].async('text');
                break;
            }
        }

        // 如果没找到 OPF，尝试 META-INF/container.xml
        if (!opfContent) {
            const container = await zip.file('META-INF/container.xml')?.async('text');
            if (container) {
                const match = container.match(/full-path="([^"]+\.opf)"/);
                if (match) {
                    opfPath = match[1];
                    opfContent = await zip.files[opfPath]?.async('text');
                }
            }
        }

        if (!opfContent) {
            // 退回到遍历所有 HTML
            const htmlFiles = Object.keys(zip.files).filter(n => /\.x?html?$/i.test(n));
            htmlFiles.sort();
            let fullText = '';
            const chapters = [];
            for (const name of htmlFiles) {
                const html = await zip.files[name].async('text');
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const title = doc.querySelector('title, h1, h2')?.textContent || `第 ${chapters.length + 1} 节`;
                const content = doc.body.innerText;
                if (content.trim()) {
                    chapters.push({ title: title.trim(), content: content.trim() });
                    fullText += content + '\n\n';
                }
            }
            return { text: fullText, chapters };
        }

        // 解析 OPF：获取 spine 顺序和 manifest 文件
        const opfDoc = new DOMParser().parseFromString(opfContent, 'application/xml');
        const opfDir = opfPath.includes('/') ? opfPath.replace(/\/[^/]*$/, '/') : '';
        
        const manifest = {};
        opfDoc.querySelectorAll('manifest > item').forEach(item => {
            const id = item.getAttribute('id');
            const href = item.getAttribute('href');
            const mediaType = item.getAttribute('media-type');
            manifest[id] = { href, mediaType };
        });

        const spineIds = [];
        opfDoc.querySelectorAll('spine > itemref').forEach(item => {
            spineIds.push(item.getAttribute('idref'));
        });

        // 按 spine 顺序读取 HTML 内容
        let fullText = '';
        const chapters = [];
        for (const id of spineIds) {
            const item = manifest[id];
            if (!item || !/x?html?/.test(item.mediaType)) continue;
            const path = opfDir + item.href;
            const html = await zip.files[path]?.async('text');
            if (!html) continue;
            const doc = new DOMParser().parseFromString(html, 'text/html');
            // 移除 script/style
            doc.querySelectorAll('script, style').forEach(n => n.remove());
            const title = doc.querySelector('title, h1, h2')?.textContent || `第 ${chapters.length + 1} 章`;
            const content = doc.body.innerText;
            if (content.trim()) {
                chapters.push({ title: title.trim(), content: content.trim() });
                fullText += content + '\n\n';
            }
        }

        return { text: fullText, chapters };
    }

    // TXT 自动分章
    function splitTxtChapters(text) {
        const chapterRegex = /(^|\n)\s*(第[零一二三四五六七八九十百千]+[章节回卷集部篇][^\n]*)/g;
        const matches = [];
        let m;
        while ((m = chapterRegex.exec(text)) !== null) {
            matches.push({ title: m[2].trim(), index: m.index + m[1].length });
        }
        
        if (matches.length < 2) {
            // 没有清晰章节，整体作为一章
            return [{ title: '正文', content: text }];
        }
        
        const chapters = [];
        for (let i = 0; i < matches.length; i++) {
            const start = matches[i].index;
            const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
            const content = text.substring(start, end).trim();
            chapters.push({ title: matches[i].title, content });
        }
        return chapters;
    }

    // 打开阅读器
    function openReader() {
        $('#readerImport').style.display = 'none';
        $('#readerMain').style.display = 'flex';
        $('#readerTitle').textContent = readerState.title;
        
        // 压缩顶部介绍栏
        $('#readerHeader').classList.add('collapsed');
        
        // 应用设置
        const content = $('#readerContent');
        content.style.fontSize = readerState.fontSize + 'px';
        content.style.lineHeight = readerState.lineHeight;
        content.className = 'reader-content ' + readerState.theme;
        $('#readerFontSize').textContent = readerState.fontSize;
        
        // 主题图标
        const themeIcon = $('#readerThemeToggle i');
        themeIcon.className = readerState.theme === 'dark' ? 'fas fa-sun' : 
                              readerState.theme === 'sepia' ? 'fas fa-leaf' : 'fas fa-moon';
        
        renderChapter();
        renderToc();
    }

    function renderChapter() {
        const ch = readerState.chapters[readerState.currentChapter];
        if (!ch) return;
        const content = $('#readerContent');
        
        // 转换为段落
        const paragraphs = ch.content.split(/\n+/).filter(p => p.trim());
        content.innerHTML = paragraphs.map(p => {
            const trimmed = p.trim();
            // 章节标题
            if (/^第[零一二三四五六七八九十百千]+[章节回卷集部篇]/.test(trimmed)) {
                return `<h2>${escapeHtml(trimmed)}</h2>`;
            }
            return `<p>${escapeHtml(trimmed)}</p>`;
        }).join('');
        
        content.scrollTop = 0;
        updateProgress();
        renderToc();
        updateChapterNav();
        if (readerImmersive) updateBottomBarChapter();
        saveReaderSettings();
    }

    function updateChapterNav() {
        const total = readerState.chapters.length;
        const cur = readerState.currentChapter + 1;
        $('#readerChapterInfo').textContent = `第 ${cur} / ${total} 章`;
        $('#readerPrevChapter').disabled = readerState.currentChapter === 0;
        $('#readerNextChapter').disabled = readerState.currentChapter >= total - 1;
        
        // 渲染章节序号点（紧凑显示 1 2 3 ...）
        const indicator = $('#readerChapterIndicator');
        if (!indicator) return;
        indicator.innerHTML = '';
        const max = 12; // 最多显示前 N 个，超出显示「...」
        const curIdx = readerState.currentChapter;
        const toShow = [];
        
        for (let i = 0; i < Math.min(total, max); i++) {
            // 总是显示当前章节以及前后几个
            if (total <= max || i < max - 3 || Math.abs(i - curIdx) <= 1) {
                toShow.push(i);
            } else if (toShow[toShow.length - 1] !== '...') {
                toShow.push('...');
            }
        }
        
        toShow.forEach((item, idx) => {
            if (item === '...') {
                const span = document.createElement('span');
                span.className = 'chapter-dot';
                span.style.cursor = 'default';
                span.textContent = '…';
                indicator.appendChild(span);
            } else {
                const dot = document.createElement('button');
                dot.className = 'chapter-dot' + (item === curIdx ? ' active' : '');
                dot.textContent = item + 1;
                dot.title = readerState.chapters[item].title;
                dot.addEventListener('click', () => {
                    readerState.currentChapter = item;
                    renderChapter();
                });
                indicator.appendChild(dot);
            }
        });
        
        // 自动滚动到当前激活的章节
        requestAnimationFrame(() => {
            const active = indicator.querySelector('.chapter-dot.active');
            if (active) {
                active.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        });
    }

    function renderToc() {
        const list = $('#readerTocList');
        list.innerHTML = '';
        readerState.chapters.forEach((ch, i) => {
            const item = document.createElement('div');
            item.className = 'reader-toc-item' + (i === readerState.currentChapter ? ' active' : '');
            item.textContent = ch.title;
            item.title = ch.title;
            item.addEventListener('click', () => {
                readerState.currentChapter = i;
                renderChapter();
                $('#readerTocPanel').classList.remove('open');
            });
            list.appendChild(item);
        });
    }

    function updateProgress() {
        const content = $('#readerContent');
        const max = content.scrollHeight - content.clientHeight;
        const progress = max > 0 ? (content.scrollTop / max) * 100 : 0;
        const chapterProgress = ((readerState.currentChapter + 1) / readerState.chapters.length) * 100;
        const totalProgress = ((readerState.currentChapter / readerState.chapters.length) * 100 + 
                              (progress / readerState.chapters.length)).toFixed(1);
        $('#readerProgress').textContent = totalProgress + '%';
        $('#readerProgressFill').style.width = totalProgress + '%';
    }

    // 监听滚动更新进度
    $('#readerContent').addEventListener('scroll', updateProgress);

    // 工具栏按钮
    $('#readerFontPlus').addEventListener('click', () => {
        readerState.fontSize = Math.min(28, readerState.fontSize + 1);
        $('#readerContent').style.fontSize = readerState.fontSize + 'px';
        $('#readerFontSize').textContent = readerState.fontSize;
        saveReaderSettings();
    });

    $('#readerFontMinus').addEventListener('click', () => {
        readerState.fontSize = Math.max(12, readerState.fontSize - 1);
        $('#readerContent').style.fontSize = readerState.fontSize + 'px';
        $('#readerFontSize').textContent = readerState.fontSize;
        saveReaderSettings();
    });

    $('#readerThemeToggle').addEventListener('click', () => {
        const themes = ['light', 'sepia', 'dark'];
        const idx = themes.indexOf(readerState.theme);
        readerState.theme = themes[(idx + 1) % 3];
        $('#readerContent').className = 'reader-content ' + readerState.theme;
        const icon = $('#readerThemeToggle i');
        icon.className = readerState.theme === 'dark' ? 'fas fa-sun' : 
                         readerState.theme === 'sepia' ? 'fas fa-leaf' : 'fas fa-moon';
        saveReaderSettings();
    });

    $('#readerLineHeight').addEventListener('click', () => {
        const heights = [1.6, 1.9, 2.2, 2.5];
        const idx = heights.indexOf(readerState.lineHeight);
        readerState.lineHeight = heights[(idx + 1) % heights.length];
        $('#readerContent').style.lineHeight = readerState.lineHeight;
        saveReaderSettings();
        showToast('行距: ' + readerState.lineHeight);
    });

    // 导出 TXT
    $('#readerExport').addEventListener('click', () => {
        const fullText = readerState.chapters.map(ch => 
            `${ch.title}\n\n${ch.content}`
        ).join('\n\n');
        const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = readerState.title + '.txt';
        a.click();
        URL.revokeObjectURL(url);
        showToast('已导出 TXT');
    });

    // 关闭阅读器
    $('#readerClose').addEventListener('click', () => {
        if (readerImmersive) exitReaderImmersive();
        $('#readerMain').style.display = 'none';
        $('#readerImport').style.display = 'flex';
        $('#readerHeader').classList.remove('collapsed');
    });

    // 全屏沉浸式阅读
    const readerToolPanel = $('#tool-reader');
    let readerImmersive = false;
    let readerImmersiveTimer = null;
    let readerNavZones = null;
    let readerExitBtn = null;
    let readerBottomBar = null;
    let readerChapterPopup = null;

    function createImmersiveUI() {
        if (readerNavZones) return;
        const contentWrap = $('#readerMain').querySelector('.reader-content-wrap');
        const readerMain = $('#readerMain');

        // 左侧导航区域
        const leftZone = document.createElement('div');
        leftZone.className = 'reader-nav-zone reader-nav-zone-left';
        leftZone.innerHTML = '<i class="fas fa-chevron-left"></i>';
        leftZone.addEventListener('click', (e) => {
            e.stopPropagation();
            prevChapter();
        });
        contentWrap.appendChild(leftZone);

        // 右侧导航区域
        const rightZone = document.createElement('div');
        rightZone.className = 'reader-nav-zone reader-nav-zone-right';
        rightZone.innerHTML = '<i class="fas fa-chevron-right"></i>';
        rightZone.addEventListener('click', (e) => {
            e.stopPropagation();
            nextChapter();
        });
        contentWrap.appendChild(rightZone);

        // 底部导航栏
        const bottomBar = document.createElement('div');
        bottomBar.className = 'reader-bottom-bar';
        bottomBar.innerHTML = `
            <button class="reader-nav-btn" title="上一章" data-action="prevChapter"><i class="fas fa-step-backward"></i><span>上一章</span></button>
            <button class="reader-nav-btn" title="上一页" data-action="prevPage"><i class="fas fa-chevron-up"></i><span>上一页</span></button>
            <button class="reader-chapter-btn" id="readerChapterBtn" title="选择章节"><i class="fas fa-list"></i><span>章节</span></button>
            <button class="reader-nav-btn" title="下一页" data-action="nextPage"><i class="fas fa-chevron-down"></i><span>下一页</span></button>
            <button class="reader-nav-btn" title="下一章" data-action="nextChapter"><i class="fas fa-step-forward"></i><span>下一章</span></button>
        `;
        bottomBar.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            if (action === 'prevChapter') prevChapter();
            else if (action === 'nextChapter') nextChapter();
            else if (action === 'prevPage') pageUp();
            else if (action === 'nextPage') pageDown();
        });
        readerMain.appendChild(bottomBar);

        // 章节选择弹窗
        const chapterPopup = document.createElement('div');
        chapterPopup.className = 'reader-chapter-popup';
        chapterPopup.innerHTML = `
            <div class="reader-chapter-popup-inner">
                <div class="reader-chapter-popup-header">
                    <span>选择章节</span>
                    <button class="icon-btn" id="readerChapterPopupClose"><i class="fas fa-times"></i></button>
                </div>
                <div class="reader-chapter-popup-list" id="readerChapterPopupList"></div>
            </div>
        `;
        readerToolPanel.appendChild(chapterPopup);

        // 章节按钮点击
        bottomBar.querySelector('#readerChapterBtn').addEventListener('click', () => {
            buildChapterPopupList();
            chapterPopup.classList.add('open');
        });
        chapterPopup.querySelector('#readerChapterPopupClose').addEventListener('click', () => {
            chapterPopup.classList.remove('open');
        });
        chapterPopup.addEventListener('click', (e) => {
            if (e.target === chapterPopup) chapterPopup.classList.remove('open');
        });

        // 退出全屏按钮
        const exitBtn = document.createElement('button');
        exitBtn.className = 'reader-exit-fullscreen';
        exitBtn.innerHTML = '<i class="fas fa-compress"></i>';
        exitBtn.title = '退出全屏';
        exitBtn.addEventListener('click', exitReaderImmersive);
        readerToolPanel.appendChild(exitBtn);

        readerNavZones = { leftZone, rightZone };
        readerExitBtn = exitBtn;
        readerBottomBar = bottomBar;
        readerChapterPopup = chapterPopup;
    }

    function buildChapterPopupList() {
        const list = $('#readerChapterPopupList');
        if (!list) return;
        list.innerHTML = '';
        readerState.chapters.forEach((ch, i) => {
            const item = document.createElement('div');
            item.className = 'reader-chapter-popup-item' + (i === readerState.currentChapter ? ' active' : '');
            item.textContent = (i + 1) + '. ' + (ch.title || '未命名');
            item.addEventListener('click', () => {
                readerState.currentChapter = i;
                renderChapter();
                readerChapterPopup.classList.remove('open');
                updateBottomBarChapter();
            });
            list.appendChild(item);
        });
    }

    function updateBottomBarChapter() {
        if (!readerBottomBar) return;
        const btn = readerBottomBar.querySelector('#readerChapterBtn span');
        if (btn) {
            btn.textContent = '第 ' + (readerState.currentChapter + 1) + '/' + readerState.chapters.length + ' 章';
        }
    }

    function prevChapter() {
        if (readerState.currentChapter > 0) {
            readerState.currentChapter--;
            renderChapter();
            updateBottomBarChapter();
        }
    }

    function nextChapter() {
        if (readerState.currentChapter < readerState.chapters.length - 1) {
            readerState.currentChapter++;
            renderChapter();
            updateBottomBarChapter();
        }
    }

    function pageUp() {
        const content = $('#readerContent');
        if (!content) return;
        content.scrollBy({ top: -(content.clientHeight * 0.85), behavior: 'smooth' });
    }

    function pageDown() {
        const content = $('#readerContent');
        if (!content) return;
        content.scrollBy({ top: content.clientHeight * 0.85, behavior: 'smooth' });
    }

    function showImmersiveControls() {
        const toolbar = $('#readerMain').querySelector('.reader-toolbar');
        const tocBtn = $('#readerMain').querySelector('.reader-toc-toggle');
        if (toolbar) toolbar.classList.add('visible');
        if (tocBtn) tocBtn.classList.add('visible');
        if (readerExitBtn) readerExitBtn.classList.add('visible');
        if (readerBottomBar) readerBottomBar.classList.add('visible');
    }

    function hideImmersiveControls() {
        const toolbar = $('#readerMain').querySelector('.reader-toolbar');
        const tocBtn = $('#readerMain').querySelector('.reader-toc-toggle');
        if (toolbar) toolbar.classList.remove('visible');
        if (tocBtn) tocBtn.classList.remove('visible');
        if (readerExitBtn) readerExitBtn.classList.remove('visible');
        if (readerBottomBar) readerBottomBar.classList.remove('visible');
    }

    function resetImmersiveTimer() {
        showImmersiveControls();
        if (readerImmersiveTimer) clearTimeout(readerImmersiveTimer);
        readerImmersiveTimer = setTimeout(hideImmersiveControls, 3000);
    }

    function enterReaderImmersive() {
        if (readerImmersive) return;
        readerImmersive = true;
        createImmersiveUI();
        readerToolPanel.classList.add('reader-immersive');
        readerToolPanel.setAttribute('data-theme', readerState.theme);
        document.body.style.overflow = 'hidden';
        document.body.classList.add('reader-fullscreen');

        // 隐藏非全屏工具按钮
        const exportBtn = $('#readerExport');
        const closeBtn = $('#readerClose');
        if (exportBtn) exportBtn.style.display = 'none';
        if (closeBtn) closeBtn.style.display = 'none';

        updateBottomBarChapter();

        document.addEventListener('mousemove', resetImmersiveTimer);
        document.addEventListener('touchstart', resetImmersiveTimer, { passive: true });
        showImmersiveControls();
        readerImmersiveTimer = setTimeout(hideImmersiveControls, 3000);

        $('#readerFullscreen i').className = 'fas fa-compress';
    }

    function exitReaderImmersive() {
        if (!readerImmersive) return;
        readerImmersive = false;

        if (readerImmersiveTimer) clearTimeout(readerImmersiveTimer);
        document.removeEventListener('mousemove', resetImmersiveTimer);
        document.removeEventListener('touchstart', resetImmersiveTimer);

        readerToolPanel.classList.remove('reader-immersive');
        readerToolPanel.removeAttribute('data-theme');
        document.body.style.overflow = '';
        document.body.classList.remove('reader-fullscreen');

        hideImmersiveControls();

        const toolbar = $('#readerMain').querySelector('.reader-toolbar');
        if (toolbar) {
            toolbar.classList.remove('visible');
            toolbar.style.opacity = '';
            toolbar.style.transform = '';
            toolbar.style.pointerEvents = '';
        }

        // 恢复工具按钮
        const exportBtn = $('#readerExport');
        const closeBtn = $('#readerClose');
        if (exportBtn) exportBtn.style.display = '';
        if (closeBtn) closeBtn.style.display = '';

        $('#readerFullscreen i').className = 'fas fa-expand';
    }

    $('#readerFullscreen').addEventListener('click', () => {
        if (readerImmersive) {
            exitReaderImmersive();
        } else {
            enterReaderImmersive();
        }
    });

    // 更新全屏主题
    $('#readerThemeToggle').addEventListener('click', () => {
        if (readerImmersive) {
            readerToolPanel.setAttribute('data-theme', readerState.theme);
        }
    });

    // ESC 退出全屏
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && readerImmersive) {
            e.preventDefault();
            exitReaderImmersive();
        }
    });

    // 目录
    $('#readerTocToggle').addEventListener('click', () => {
        $('#readerTocPanel').classList.add('open');
    });
    $('#readerTocClose').addEventListener('click', () => {
        $('#readerTocPanel').classList.remove('open');
    });

    // 章节切换按钮
    $('#readerPrevChapter').addEventListener('click', () => {
        if (readerState.currentChapter > 0) {
            readerState.currentChapter--;
            renderChapter();
            if (readerImmersive) updateBottomBarChapter();
            else showToast('已切换到上一章');
        }
    });
    $('#readerNextChapter').addEventListener('click', () => {
        if (readerState.currentChapter < readerState.chapters.length - 1) {
            readerState.currentChapter++;
            renderChapter();
            if (readerImmersive) updateBottomBarChapter();
            else showToast('已切换到下一章');
        }
    });

    // 翻页：左右箭头
    document.addEventListener('keydown', (e) => {
        if (!$('#readerMain') || $('#readerMain').style.display === 'none') return;
        if (!$('#tool-reader').classList.contains('active')) return;
        
        if (e.key === 'ArrowLeft' && readerState.currentChapter > 0) {
            e.preventDefault();
            readerState.currentChapter--;
            renderChapter();
            if (readerImmersive) updateBottomBarChapter();
        } else if (e.key === 'ArrowRight' && readerState.currentChapter < readerState.chapters.length - 1) {
            e.preventDefault();
            readerState.currentChapter++;
            renderChapter();
            if (readerImmersive) updateBottomBarChapter();
        } else if (e.key === 'PageUp' || e.key === 'ArrowUp') {
            e.preventDefault();
            if (readerImmersive) pageUp();
        } else if (e.key === 'PageDown' || e.key === 'ArrowDown') {
            e.preventDefault();
            if (readerImmersive) pageDown();
        } else if (e.key === 'Escape' && !readerImmersive) {
            $('#readerTocPanel').classList.remove('open');
        }
    });

    // 示例小说
    const sample1 = `第一章 神秘的海怪

1866年出现了一件离奇古怪、神秘莫测的怪事，相信公众对此一定记忆犹新。且不说当时种种流言飞语弄得港口居民异常激动，搞得内陆公众心神不宁，光是那些航海人员就更是焦虑不安。

事情是这样的，不久以前，有几艘船在海上和"一个庞然大物"相遇了。那是一个长长的物体，呈纺锤形，有时发出磷光，比鲸鱼大得多，行动起来也比鲸鱼迅速得多。

有关这个东西出现的情况，各种航海日志所记录的事实大致相同：包括这个物体或这个生物的形状、它运动的速度、它转移时惊人的力量，以及它那似乎是与生俱来的独特生命力。

如果这是一种鲸类动物，那么，它的体积大大超过了生物学家以前所分类过的鲸鱼。

这一切综合起来看，使得这事变得确实无疑了。除非心中存有成见，否则再也不会有人否认这个怪物的存在。

第二章 赞成与反对

这些事件发生的时候，我正刚从美国内布拉斯加州的贫瘠地区考察归来。我作为巴黎自然博物馆的客座教授，是应法国政府之邀参加那次考察的。

我在纽约逗留期间，该怪物正成为人们议论的焦点。我这个巴黎自然科学博物馆的教授，自然也成了人们询问的对象。

我必须表明我的态度。然而，在科学与权威面前，我不得不做出选择。最后，我做出了自己的判断，发表了文章。`;

    const sample2 = `第一章 蟒蛇吞吃大象的画

我六岁那年，在一本描写原始森林的名叫《真实的故事》的书上，看见过一幅精彩的插图，画的是一条蟒蛇在吞吃一只大野兽。

我就用彩色铅笔画出了我的第一幅图画。我的作品一号，它就是这样的：一条蟒蛇正在吞吃一只大象。

我把我的这幅杰作拿给大人看，我问他们我的画是不是叫他们害怕。

他们回答我说："一顶帽子有什么可怕的？"

我画的不是帽子，是一条巨蟒在消化一头大象。于是我就把巨蟒肚子里的情况画出来，以便让大人们能够看懂。

第二章 大人们劝我把这些画着开着肚皮的，或闭上肚皮的蟒蛇的图画放在一边

大人们劝我把这些画着开着肚皮的，或闭上肚皮的蟒蛇的图画放在一边，还是把兴趣放在地理、历史、算术、语法上。

就这样，在六岁那年，我就放弃了当画家这一美好的职业。我的作品一号和作品二号的不成功，使我灰心丧气。

第三章 我在沙漠里遇到了小王子

我就这样孤独地生活着，没有一个能够真正谈得来的人，一直到六年前在撒哈拉沙漠上发生了那次故障。

当时我尽可能想独自把它修好。这对我来说是个生与死的问题，我所带的水只够饮用一星期。

第一天夜里，我睡在了远离任何人家的地方。我比大海中伏在小木排上的遇难者还要孤独。

第二天拂晓，当一个奇怪的小声音把我唤醒的时候，你们可以想象我当时是多么惊讶。这小小的声音说道："请你给我画一只羊，好吗？"`;

    $('#readerSample1').addEventListener('click', () => {
        readerState.title = '海底两万里（节选）';
        readerState.content = sample1;
        readerState.chapters = splitTxtChapters(sample1);
        readerState.currentChapter = 0;
        openReader();
    });

    $('#readerSample2').addEventListener('click', () => {
        readerState.title = '小王子（节选）';
        readerState.content = sample2;
        readerState.chapters = splitTxtChapters(sample2);
        readerState.currentChapter = 0;
        openReader();
    });

    // ============================================
    // 工具：字数统计（带数字弹跳动效）
    // ============================================
    const wordCountStats = {
        chars: 0, charsNoSpace: 0, words: 0,
        lines: 0, paragraphs: 0, readTime: 0
    };
    
    $('#wordCountInput').addEventListener('input', (e) => {
        const t = e.target.value;
        const newStats = {
            chars: t.length,
            charsNoSpace: t.replace(/\s/g, '').length,
            words: t.trim() ? t.trim().split(/\s+/).length : 0,
            lines: t ? t.split('\n').length : 0,
            paragraphs: t.trim() ? t.trim().split(/\n\s*\n/).filter(p => p.trim()).length : 0,
            readTime: Math.ceil((t.trim() ? t.trim().split(/\s+/).length : 0) / 200)
        };
        
        const map = {
            chars: 'statChars', charsNoSpace: 'statCharsNoSpace', words: 'statWords',
            lines: 'statLines', paragraphs: 'statParagraphs', readTime: 'statReadTime'
        };
        
        Object.keys(newStats).forEach(key => {
            const el = $('#' + map[key]);
            if (el.textContent != newStats[key]) {
                el.textContent = newStats[key];
                if (wordCountStats[key] !== undefined && newStats[key] !== wordCountStats[key]) {
                    bumpNumber(el);
                }
            }
            wordCountStats[key] = newStats[key];
        });
    });

    // ============================================
    // 工具：文本对比
    // ============================================
    $('#diffCompare').addEventListener('click', () => {
        const orig = $('#diffOriginal').value.split('\n');
        const mod = $('#diffModified').value.split('\n');
        const result = $('#diffResult');
        const maxLen = Math.max(orig.length, mod.length);
        let html = '';
        let added = 0, removed = 0;
        
        for (let i = 0; i < maxLen; i++) {
            const o = orig[i] !== undefined ? orig[i] : '';
            const m = mod[i] !== undefined ? mod[i] : '';
            if (o === m) {
                if (o) html += `<div class="diff-line unchanged"><span class="line-num">${i+1}</span>${escapeHtml(o)}</div>`;
            } else {
                if (o) { html += `<div class="diff-line removed"><span class="line-num">-</span>${escapeHtml(o)}</div>`; removed++; }
                if (m) { html += `<div class="diff-line added"><span class="line-num">+</span>${escapeHtml(m)}</div>`; added++; }
            }
        }
        
        result.innerHTML = html || '<div class="diff-line unchanged">请输入文本进行对比</div>';
        $('#diffSummary').textContent = (added || removed) ? `+${added} / -${removed}` : '完全相同';
    });

    // ============================================
    // 工具：Lorem
    // ============================================
    const loremWords = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum'.split(' ');
    const zhSentences = ['天空一片湛蓝', '海浪轻拍沙滩', '清风拂过山岗', '阳光洒满大地', '远山如黛若隐若现', '溪水潺潺流淌', '云朵悠然飘过', '春日暖阳普照', '夜晚繁星闪烁', '清晨露珠晶莹', '森林郁郁葱葱', '湖面平静如镜', '蝴蝶翩翩起舞', '鸟儿欢快歌唱', '时间静静流逝'];

    function generateLorem() {
        const type = $('#loremType').value;
        const count = parseInt($('#loremCount').value) || 1;
        const lang = $('#loremLang').value;
        
        let result = '';
        if (lang === 'lorem') {
            if (type === 'words') {
                const arr = [];
                for (let i = 0; i < count; i++) arr.push(loremWords[Math.floor(Math.random() * loremWords.length)]);
                result = arr.join(' ');
            } else if (type === 'sentences') {
                const arr = [];
                for (let i = 0; i < count; i++) {
                    const len = 8 + Math.floor(Math.random() * 12);
                    const words = [];
                    for (let j = 0; j < len; j++) words.push(loremWords[Math.floor(Math.random() * loremWords.length)]);
                    let s = words.join(' ');
                    s = s.charAt(0).toUpperCase() + s.slice(1) + '.';
                    arr.push(s);
                }
                result = arr.join(' ');
            } else {
                const arr = [];
                for (let i = 0; i < count; i++) {
                    const sCount = 3 + Math.floor(Math.random() * 4);
                    const sArr = [];
                    for (let j = 0; j < sCount; j++) {
                        const wlen = 8 + Math.floor(Math.random() * 12);
                        const words = [];
                        for (let k = 0; k < wlen; k++) words.push(loremWords[Math.floor(Math.random() * loremWords.length)]);
                        let s = words.join(' ');
                        s = s.charAt(0).toUpperCase() + s.slice(1) + '.';
                        sArr.push(s);
                    }
                    arr.push(sArr.join(' '));
                }
                result = arr.join('\n\n');
            }
        } else {
            if (type === 'words') {
                const arr = [];
                for (let i = 0; i < count; i++) arr.push(zhSentences[Math.floor(Math.random() * zhSentences.length)]);
                result = arr.join('，');
            } else if (type === 'sentences') {
                const arr = [];
                for (let i = 0; i < count; i++) arr.push(zhSentences[Math.floor(Math.random() * zhSentences.length)] + '。');
                result = arr.join('');
            } else {
                const arr = [];
                for (let i = 0; i < count; i++) {
                    const sCount = 3 + Math.floor(Math.random() * 3);
                    const sArr = [];
                    for (let j = 0; j < sCount; j++) sArr.push(zhSentences[Math.floor(Math.random() * zhSentences.length)]);
                    arr.push(sArr.join('，') + '。');
                }
                result = arr.join('\n\n');
            }
        }
        $('#loremOutput').value = result;
    }
    $('#loremGenerate').addEventListener('click', generateLorem);
    generateLorem();

    // ============================================
    // 工具：颜色选择器
    // ============================================
    function hexToRgb(hex) {
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16)
        };
    }
    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch(max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
    }
    function hslToHex(h, s, l) {
        l /= 100;
        const a = s * Math.min(l, 1 - l) / 100;
        const f = n => {
            const k = (n + h / 30) % 12;
            const c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
            return Math.round(255 * c).toString(16).padStart(2, '0');
        };
        return `#${f(0)}${f(8)}${f(4)}`;
    }

    function updateColorPicker(hex) {
        const { r, g, b } = hexToRgb(hex);
        const { h, s, l } = rgbToHsl(r, g, b);
        $('#colorHex').value = hex.toUpperCase();
        $('#colorRgb').value = `rgb(${r}, ${g}, ${b})`;
        $('#colorHsl').value = `hsl(${h}, ${s}%, ${l}%)`;
        $('#colorDisplay').style.background = hex;
    }
    $('#colorPickerInput').addEventListener('input', e => updateColorPicker(e.target.value));
    updateColorPicker('#4fc3f7');

    // ============================================
    // 工具：调色板生成
    // ============================================
    function generatePalette(baseHex, type) {
        const { r, g, b } = hexToRgb(baseHex);
        const { h, s, l } = rgbToHsl(r, g, b);
        const palette = [];
        switch(type) {
            case 'analogous':
                for (let i = -2; i <= 2; i++) palette.push(hslToHex((h + i * 30 + 360) % 360, s, l));
                break;
            case 'complementary':
                palette.push(hslToHex(h, s, l));
                palette.push(hslToHex(h, s, Math.min(l + 20, 90)));
                palette.push(hslToHex(h, s, Math.max(l - 20, 10)));
                palette.push(hslToHex((h + 180) % 360, s, l));
                palette.push(hslToHex((h + 180) % 360, s, Math.min(l + 20, 90)));
                break;
            case 'triadic':
                palette.push(hslToHex(h, s, l));
                palette.push(hslToHex((h + 120) % 360, s, l));
                palette.push(hslToHex((h + 240) % 360, s, l));
                palette.push(hslToHex(h, s, Math.min(l + 15, 90)));
                palette.push(hslToHex(h, s, Math.max(l - 15, 10)));
                break;
            case 'monochrome':
                for (let i = 0; i < 5; i++) palette.push(hslToHex(h, s, Math.max(20 + i * 16, 10)));
                break;
        }
        return palette;
    }
    function renderPalette(palette) {
        const display = $('#paletteDisplay');
        display.innerHTML = '';
        palette.forEach(color => {
            const div = document.createElement('div');
            div.className = 'palette-color';
            div.style.background = color;
            const label = document.createElement('span');
            label.textContent = color.toUpperCase();
            div.appendChild(label);
            div.addEventListener('click', async () => {
                await copyText(color.toUpperCase());
            });
            display.appendChild(div);
        });
    }
    $('#paletteGenerate').addEventListener('click', () => {
        renderPalette(generatePalette($('#paletteBase').value, $('#paletteType').value));
    });
    renderPalette(generatePalette('#4fc3f7', 'analogous'));

    // ============================================
    // 工具：渐变生成器
    // ============================================
    function updateGradient() {
        const c1 = $('#gradColor1').value;
        const c2 = $('#gradColor2').value;
        const angle = $('#gradAngle').value;
        const type = $('#gradType').value;
        $('#gradAngleValue').textContent = `${angle}°`;
        const grad = type === 'linear'
            ? `linear-gradient(${angle}deg, ${c1}, ${c2})`
            : `radial-gradient(circle, ${c1}, ${c2})`;
        $('#gradientPreview').style.background = grad;
        $('#gradientCode').value = `background: ${grad};`;
    }
    ['gradColor1', 'gradColor2', 'gradAngle', 'gradType'].forEach(id => {
        $('#' + id).addEventListener('input', updateGradient);
        $('#' + id).addEventListener('change', updateGradient);
    });
    updateGradient();

    // ============================================
    // 工具：图片压缩
    // ============================================
    let originalImage = null;
    const imgDrop = $('#imgCompressDrop');
    const imgInput = $('#imgCompressInput');

    imgDrop.addEventListener('click', () => imgInput.click());
    imgDrop.addEventListener('dragover', e => { e.preventDefault(); imgDrop.classList.add('dragover'); });
    imgDrop.addEventListener('dragleave', () => imgDrop.classList.remove('dragover'));
    imgDrop.addEventListener('drop', e => {
        e.preventDefault();
        imgDrop.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadImage(e.dataTransfer.files[0]);
    });
    imgInput.addEventListener('change', e => {
        if (e.target.files[0]) loadImage(e.target.files[0]);
    });

    function loadImage(file) {
        if (!file) return;
        $('#originalSize').textContent = formatBytes(file.size);
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                originalImage = img;
                $('#originalPreview').src = e.target.result;
                $('#compressControls').style.display = 'block';
                imgDrop.style.display = 'none';
                compressImage();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function compressImage() {
        if (!originalImage) return;
        const quality = parseInt($('#qualityRange').value) / 100;
        const format = $('#compressFormat').value;
        const maxWidth = parseInt($('#maxWidth').value) || originalImage.width;
        $('#qualityValue').textContent = $('#qualityRange').value;
        
        const scale = Math.min(1, maxWidth / originalImage.width);
        const w = originalImage.width * scale;
        const h = originalImage.height * scale;
        
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        if (format === 'image/jpeg' || format === 'image/webp') ctx.fillRect(0, 0, w, h);
        ctx.drawImage(originalImage, 0, 0, w, h);
        
        canvas.toBlob(blob => {
            const url = URL.createObjectURL(blob);
            $('#compressedPreview').src = url;
            $('#compressedSize').textContent = formatBytes(blob.size);
            $('#compressDownload').dataset.blobUrl = url;
            $('#compressDownload').dataset.filename = `compressed.${format.split('/')[1]}`;
        }, format, quality);
    }

    ['qualityRange', 'compressFormat', 'maxWidth'].forEach(id => {
        $('#' + id).addEventListener('input', compressImage);
        $('#' + id).addEventListener('change', compressImage);
    });

    $('#compressDownload').addEventListener('click', function() {
        if (!this.dataset.blobUrl) return;
        const a = document.createElement('a');
        a.href = this.dataset.blobUrl;
        a.download = this.dataset.filename;
        a.click();
        showToast('图片已下载');
    });

    // ============================================
    // 工具：二维码
    // ============================================
    function drawQR(canvas, text, size, fg, bg) {
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, size, size);

        if (!text.trim()) return;

        try {
            const qr = qrcode(0, 'M');
            qr.addData(text);
            qr.make();
            const modules = qr.getModuleCount();
            const cell = Math.floor(size / modules);
            const offset = Math.floor((size - modules * cell) / 2);

            ctx.fillStyle = fg;
            for (let row = 0; row < modules; row++) {
                for (let col = 0; col < modules; col++) {
                    if (qr.isDark(row, col)) {
                        ctx.fillRect(offset + col * cell, offset + row * cell, cell, cell);
                    }
                }
            }
        } catch (e) {
            ctx.fillStyle = '#ef4444';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('内容过长，请缩短后重试', size / 2, size / 2);
        }
    }

    function generateQR() {
        const text = $('#qrInput').value || ' ';
        const size = parseInt($('#qrSize').value);
        const fg = $('#qrFg').value;
        const bg = $('#qrBg').value;
        $('#qrSizeValue').textContent = size;
        drawQR($('#qrCanvas'), text, size, fg, bg);
    }
    $('#qrSize').addEventListener('input', () => { $('#qrSizeValue').textContent = $('#qrSize').value; generateQR(); });
    $('#qrFg').addEventListener('input', generateQR);
    $('#qrBg').addEventListener('input', generateQR);
    $('#qrGenerate').addEventListener('click', generateQR);
    $('#qrDownload').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = $('#qrCanvas').toDataURL();
        link.click();
        showToast('二维码已下载');
    });
    generateQR();

    // ============================================
    // 工具：图片取色器
    // ============================================
    let pickerImage = null;
    let pickerHistory = [];
    const pickerDrop = $('#imgPickerDrop');
    const pickerInput = $('#imgPickerInput');
    const pickerCanvas = $('#pickerCanvas');
    const pickerCtx = pickerCanvas.getContext('2d', { willReadFrequently: true });

    pickerDrop.addEventListener('click', () => pickerInput.click());
    pickerDrop.addEventListener('dragover', e => { e.preventDefault(); pickerDrop.classList.add('dragover'); });
    pickerDrop.addEventListener('dragleave', () => pickerDrop.classList.remove('dragover'));
    pickerDrop.addEventListener('drop', e => {
        e.preventDefault();
        pickerDrop.classList.remove('dragover');
        if (e.dataTransfer.files[0]) loadPickerImage(e.dataTransfer.files[0]);
    });
    pickerInput.addEventListener('change', e => {
        if (e.target.files[0]) loadPickerImage(e.target.files[0]);
    });

    function loadPickerImage(file) {
        const reader = new FileReader();
        reader.onload = e => {
            const img = new Image();
            img.onload = () => {
                pickerImage = img;
                const maxW = 600;
                const scale = Math.min(1, maxW / img.width);
                pickerCanvas.width = img.width * scale;
                pickerCanvas.height = img.height * scale;
                pickerCtx.drawImage(img, 0, 0, pickerCanvas.width, pickerCanvas.height);
                $('#pickerResult').style.display = 'grid';
                pickerDrop.style.display = 'none';
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    }

    pickerCanvas.addEventListener('mousemove', (e) => {
        if (!pickerImage) return;
        const rect = pickerCanvas.getBoundingClientRect();
        const x = Math.floor((e.clientX - rect.left) * (pickerCanvas.width / rect.width));
        const y = Math.floor((e.clientY - rect.top) * (pickerCanvas.height / rect.height));
        const px = pickerCtx.getImageData(x, y, 1, 1).data;
        const hex = rgbToHex(px[0], px[1], px[2]);
        const rgb = `rgb(${px[0]}, ${px[1]}, ${px[2]})`;
        $('#pickerSwatch').style.background = hex;
        $('#pickerHex').textContent = hex;
        $('#pickerRgb').textContent = rgb;
        
        const zoom = $('#pickerZoom');
        zoom.style.display = 'block';
        zoom.style.left = (e.clientX - rect.left - 50) + 'px';
        zoom.style.top = (e.clientY - rect.top - 50) + 'px';
        const zoomCtx = document.createElement('canvas').getContext('2d');
        zoomCtx.canvas.width = 100;
        zoomCtx.canvas.height = 100;
        zoomCtx.imageSmoothingEnabled = false;
        zoomCtx.drawImage(pickerCanvas, x - 5, y - 5, 10, 10, 0, 0, 100, 100);
        zoom.style.backgroundImage = `url(${zoomCtx.canvas.toDataURL()})`;
        zoom.style.backgroundSize = 'cover';
    });

    pickerCanvas.addEventListener('mouseleave', () => {
        $('#pickerZoom').style.display = 'none';
    });

    pickerCanvas.addEventListener('click', (e) => {
        if (!pickerImage) return;
        const hex = $('#pickerHex').textContent;
        if (!pickerHistory.includes(hex)) {
            pickerHistory.unshift(hex);
            if (pickerHistory.length > 12) pickerHistory.pop();
            renderPickerHistory();
        }
        copyText(hex);
    });

    function renderPickerHistory() {
        const hist = $('#pickerHistory');
        hist.innerHTML = '';
        pickerHistory.forEach(color => {
            const div = document.createElement('div');
            div.className = 'history-color';
            div.style.background = color;
            div.title = color;
            div.addEventListener('click', () => copyText(color));
            hist.appendChild(div);
        });
    }

    $('#pickerCopy').addEventListener('click', () => copyText($('#pickerHex').textContent));

    // ============================================
    // 工具：单位换算
    // ============================================
    const units = {
        length: { units: { '米': 1, '千米': 1000, '厘米': 0.01, '毫米': 0.001, '英里': 1609.34, '码': 0.9144, '英尺': 0.3048, '英寸': 0.0254 } },
        weight: { units: { '克': 1, '千克': 1000, '毫克': 0.001, '磅': 453.592, '盎司': 28.3495, '吨': 1000000 } },
        temperature: { units: { '摄氏度 (°C)': 'c', '华氏度 (°F)': 'f', '开尔文 (K)': 'k' }, special: true },
        area: { units: { '平方米': 1, '平方千米': 1000000, '平方厘米': 0.0001, '公顷': 10000, '英亩': 4046.86, '平方英尺': 0.092903, '平方英寸': 0.00064516 } },
        data: { units: { '字节 (B)': 1, '千字节 (KB)': 1024, '兆字节 (MB)': 1048576, '吉字节 (GB)': 1073741824, '太字节 (TB)': 1099511627776, '比特 (bit)': 0.125 } }
    };

    let currentCategory = 'length';

    function populateUnits() {
        const fromU = $('#convertFromUnit');
        const toU = $('#convertToUnit');
        fromU.innerHTML = '';
        toU.innerHTML = '';
        const list = Object.keys(units[currentCategory].units);
        list.forEach(u => {
            fromU.add(new Option(u, u));
            toU.add(new Option(u, u));
        });
        if (list.length > 1) toU.selectedIndex = 1;
        convert();
    }

    function convert() {
        const value = parseFloat($('#convertFromValue').value);
        if (isNaN(value)) { $('#convertToValue').value = ''; return; }
        const from = $('#convertFromUnit').value;
        const to = $('#convertToUnit').value;
        let result;
        if (currentCategory === 'temperature') {
            let c;
            switch(from) {
                case '摄氏度 (°C)': c = value; break;
                case '华氏度 (°F)': c = (value - 32) * 5/9; break;
                case '开尔文 (K)': c = value - 273.15; break;
            }
            switch(to) {
                case '摄氏度 (°C)': result = c; break;
                case '华氏度 (°F)': result = c * 9/5 + 32; break;
                case '开尔文 (K)': result = c + 273.15; break;
            }
        } else {
            result = (value * units[currentCategory].units[from]) / units[currentCategory].units[to];
        }
        $('#convertToValue').value = parseFloat(result.toFixed(6));
    }

    $$('.unit-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            $$('.unit-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentCategory = tab.dataset.category;
            populateUnits();
        });
    });
    ['convertFromValue', 'convertFromUnit', 'convertToUnit'].forEach(id => {
        $('#' + id).addEventListener('input', convert);
        $('#' + id).addEventListener('change', convert);
    });
    $('#convertSwap').addEventListener('click', () => {
        const f = $('#convertFromUnit');
        const t = $('#convertToUnit');
        const i = f.selectedIndex;
        f.selectedIndex = t.selectedIndex;
        t.selectedIndex = i;
        $('#convertFromValue').value = $('#convertToValue').value;
        convert();
    });
    populateUnits();

    // ============================================
    // 工具：密码生成器
    // ============================================
    function generatePassword() {
        const length = parseInt($('#passwordLength').value);
        const upper = $('#pwUpper').checked;
        const lower = $('#pwLower').checked;
        const numbers = $('#pwNumbers').checked;
        const symbols = $('#pwSymbols').checked;
        $('#passwordLengthValue').textContent = length;
        
        let chars = '';
        if (upper) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        if (lower) chars += 'abcdefghijklmnopqrstuvwxyz';
        if (numbers) chars += '0123456789';
        if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
        if (!chars) { showToast('请至少选择一种字符类型', 'error'); return; }
        
        const arr = new Uint32Array(length);
        crypto.getRandomValues(arr);
        let pwd = '';
        for (let i = 0; i < length; i++) pwd += chars[arr[i] % chars.length];
        $('#passwordOutput').value = pwd;
        updateStrength(pwd);
    }

    function updateStrength(pwd) {
        let score = 0;
        if (pwd.length >= 8) score++;
        if (pwd.length >= 16) score++;
        if (pwd.length >= 24) score++;
        if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
        if (/\d/.test(pwd)) score++;
        if (/[^a-zA-Z\d]/.test(pwd)) score++;
        const pcts = [0, 16, 33, 50, 66, 83, 100];
        const labels = ['—', '很弱', '弱', '一般', '良好', '强', '很强'];
        const colors = ['#94a3b8', '#ef4444', '#ef4444', '#f59e0b', '#f59e0b', '#10b981', '#10b981'];
        $('#strengthFill').style.width = pcts[score] + '%';
        $('#strengthFill').style.background = colors[score];
        $('#strengthText').textContent = labels[score];
        $('#strengthText').style.color = colors[score];
    }

    ['passwordLength', 'pwUpper', 'pwLower', 'pwNumbers', 'pwSymbols'].forEach(id => {
        $('#' + id).addEventListener('input', generatePassword);
        $('#' + id).addEventListener('change', generatePassword);
    });
    $('#passwordRegenerate').addEventListener('click', generatePassword);
    generatePassword();

    // ============================================
    // 工具：番茄钟
    // ============================================
    let timerInterval = null;
    let timerSeconds = 25 * 60;
    let timerTotal = 25 * 60;
    let pomoCount = 0;
    let isRunning = false;
    const timerRing = $('#timerRing');
    const ringCirc = 2 * Math.PI * 90;
    timerRing.style.strokeDasharray = ringCirc;

    function updateTimerDisplay() {
        const m = Math.floor(timerSeconds / 60).toString().padStart(2, '0');
        const s = (timerSeconds % 60).toString().padStart(2, '0');
        $('#timerText').textContent = `${m}:${s}`;
        timerRing.style.strokeDashoffset = ringCirc * (1 - timerSeconds / timerTotal);
    }

    function startTimer() {
        if (isRunning) return;
        isRunning = true;
        timerInterval = setInterval(() => {
            timerSeconds--;
            updateTimerDisplay();
            if (timerSeconds <= 0) {
                clearInterval(timerInterval);
                isRunning = false;
                pomoCount++;
                $('#pomoCount').textContent = pomoCount;
                bumpNumber($('#pomoCount'));
                showToast('时间到！休息一下吧');
                playBeep();
            }
        }, 1000);
    }

    function pauseTimer() { clearInterval(timerInterval); isRunning = false; }
    function resetTimer() { pauseTimer(); timerSeconds = timerTotal; updateTimerDisplay(); }

    function playBeep() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            osc.start();
            osc.stop(ctx.currentTime + 0.5);
        } catch {}
    }

    $$('.pomo-mode').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.pomo-mode').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            pauseTimer();
            timerTotal = timerSeconds = parseInt(btn.dataset.time) * 60;
            updateTimerDisplay();
        });
    });
    $('#timerStart').addEventListener('click', startTimer);
    $('#timerPause').addEventListener('click', pauseTimer);
    $('#timerReset').addEventListener('click', resetTimer);
    updateTimerDisplay();

    // ============================================
    // 顶部栏
    // ============================================
    $('#fullscreenBtn').addEventListener('click', () => {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    });

    // ============================================
    // 苹果风格动效初始化
    // ============================================
    
    // 1. 为主要按钮添加涟漪效果
    function initRipples() {
        attachRipple('.tool-btn');
        attachRipple('.mini-btn');
        attachRipple('.icon-btn');
        attachRipple('.fab-open');
        attachRipple('.swap-btn');
        // nav-item 的涟漪会在 cloneNode 替换后单独添加
        attachRipple('.pomo-mode');
        attachRipple('.flag-chip');
    }
    initRipples();

    // 2. 滚动揭示动效（Intersection Observer）
    const revealTargets = [
        '.stat-card', '.home-card', '.feature-card',
        '.palette-color', '.hash-item', '.diff-line',
        '.checkbox-label', '.color-format', '.preview-box',
        '.tool-header', '.tool-body > div', '.compress-options > *'
    ];
    
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
    
    function setupReveals() {
        // 仅对当前激活工具面板内的元素启用，避免初始全部触发
        revealTargets.forEach(sel => {
            $$(sel).forEach(el => {
                if (!el.classList.contains('reveal')) {
                    el.classList.add('reveal');
                    revealObserver.observe(el);
                }
            });
        });
    }
    setupReveals();

    // 3. 工具切换时重新触发入场动画
    const originalSwitchTool = switchTool;
    function animatedSwitchTool(toolId) {
        const panel = $(`#tool-${toolId}`);
        if (panel) {
            // 重置入场动画
            panel.style.animation = 'none';
            void panel.offsetWidth;
            panel.style.animation = '';
            
            // 对内部元素重新观察
            requestAnimationFrame(() => {
                $$('.reveal', panel).forEach(el => {
                    el.classList.remove('visible');
                    revealObserver.observe(el);
                });
            });
        }
        originalSwitchTool(toolId);
    }
    
    // 重写 nav-item 点击使用动画版本（克隆节点以移除旧 listener）
    $$('.nav-item').forEach(item => {
        const clone = item.cloneNode(true);
        item.parentNode.replaceChild(clone, item);
        clone.addEventListener('click', (e) => {
            e.preventDefault();
            animatedSwitchTool(clone.dataset.tool);
        });
        // 重新添加涟漪
        clone.addEventListener('pointerdown', (e) => {
            createRipple(e, clone);
        });
    });
    
    // logo 点击也用动画版本
    const logoEl = $('.logo');
    const logoClone = logoEl.cloneNode(true);
    logoEl.parentNode.replaceChild(logoClone, logoEl);
    logoClone.addEventListener('click', (e) => {
        e.preventDefault();
        animatedSwitchTool('home');
    });
    logoClone.addEventListener('pointerdown', (e) => {
        createRipple(e, logoClone);
    });

    // 4. 关闭按钮的涟漪
    const modalClose = $('#infoModalClose');
    if (modalClose) {
        modalClose.addEventListener('pointerdown', (e) => createRipple(e, modalClose));
    }

    // 6. 表单输入框聚焦时的微缩放（苹果风格）
    $$('.text-input, .format-row input').forEach(input => {
        input.addEventListener('focus', () => {
            input.style.transform = 'scale(1.005)';
        });
        input.addEventListener('blur', () => {
            input.style.transform = '';
        });
    });

    // 7. 链接 hover 时的微妙浮起
    $$('.footer-column a, .md-preview a').forEach(link => {
        link.style.transition = 'transform 0.2s var(--ease-ios, cubic-bezier(0.32, 0.72, 0, 1)), color 0.2s ease';
        link.addEventListener('mouseenter', () => {
            link.style.transform = 'translateX(2px)';
        });
        link.addEventListener('mouseleave', () => {
            link.style.transform = '';
        });
    });

    // ============================================
    // 工具：文本润色（去AI味）
    // ============================================
    (function initDeai() {
        const input = $('#deaiInput');
        const output = $('#deaiOutput');
        const runBtn = $('#deaiRun');
        const clearBtn = $('#deaiClear');
        const countEl = $('#deaiCount');
        const reportEl = $('#deaiReport');
        const gradeEl = $('#deaiGrade');
        const breakdownEl = $('#deaiBreakdown');
        if (!input || !runBtn) return;

        // 最毒句式（最高优先级，出现即修）—— 来源：去AI味技能 banned-words 第一节
        const toxicPatterns = [
            // "不是A，而是B" → 保留 B
            [/不是[^，。,!?\n]{1,30}，?而是/g, ''],
            // "，带着一丝/一种……" 万能状语 → 删
            [/，?带着(一丝|一抹|些许|几分|一种)?[^，。,!?\n]{0,16}(的)?(力量|嘲讽|笑意|温柔|疲惫|不易察觉[^，。,!?\n]{0,8})?/g, ''],
            // "心中涌起一股……" / "心头一震" → 删
            [/心中(涌起|升起|涌上)(一股|一阵|一种)?[^，。,!?\n]{0,12}/g, ''],
            [/心头一(震|紧|沉|颤)/g, ''],
            // "眼中闪过一丝……" / "嘴角勾起一抹……" → 删
            [/(眼中|眼底|目光中)闪过(一丝|一抹|些许)?[^，。,!?\n]{0,12}/g, ''],
            [/嘴角(勾起|扬起|挂着)(一抹|一丝|一个)?[^，。,!?\n]{0,12}/g, ''],
            // "仿佛/犹如/宛若……一般" → 用"像"
            [/(仿佛|犹如|宛若|宛如)/g, '像'],
            // "他/她知道……"（句首认知宣告）→ 删该短句
            [/(^|[。！？\n])\s*(他|她)知道[^，。,!?\n]{0,20}[，。]/g, '$1'],
        ];

        // 高频词/套话替换表（尽量替换为更口语的表达或直接删除）
        const wordMap = [
            // 填充短语（直接删）
            [/值得一提的是[，,]?/g, ''],
            [/从某种意义上说[，,]?/g, ''],
            [/不可否认(的是)?[，,]?/g, ''],
            [/毋庸置疑[，,]?/g, ''],
            [/事实上[，,]?/g, ''],
            [/不得不说[，,]?/g, ''],
            [/坦率(地)?说[，,]?/g, ''],
            [/客观来讲[，,]?/g, ''],
            [/众所周知[，,]?/g, ''],
            [/毫无疑问[，,]?/g, ''],
            [/不难发现[，,]?/g, ''],
            // 教科书开头
            [/在当今[这个]*(社会|时代|数字化时代|信息化时代)[，,]?/g, ''],
            [/随着[^，。,.]{0,20}的(不断)?(发展|进步|普及)[，,]?/g, ''],
            // 总结套话
            [/总的来说[，,]?/g, ''],
            [/综上所述[，,]?/g, ''],
            [/总而言之[，,]?/g, ''],
            [/一言以蔽之[，,]?/g, ''],
            // khazix 高频踩雷词
            [/说白了[，,]?/g, ''],
            [/这意味着/g, '也就是说'],
            [/意味着什么[？?]/g, ''],
            [/本质上[，,]?/g, ''],
            [/换句话说[，,]?/g, ''],
            // 虚假宣告（只宣布重要性，未指明内容）
            [/意义重大/g, '很重要'],
            [/影响深远/g, '影响很大'],
            [/其重要性不言而喻[，,]?/g, ''],
            // 互联网黑话 → 口语
            [/赋能/g, '帮助'],
            [/助力/g, '帮'],
            [/打造/g, '做'],
            [/构建/g, '搭'],
            [/深耕/g, '专注'],
            [/聚焦/g, '关注'],
            [/全方位/g, '全面'],
            [/一站式/g, '一整套'],
            [/无缝/g, '顺畅'],
            [/闭环/g, '完整流程'],
            [/抓手/g, '办法'],
            [/颗粒度/g, '细致程度'],
            [/护城河/g, '优势'],
            [/生态(体系)?/g, '体系'],
            [/深入(地)?(探讨|剖析|分析)/g, '分析'],
            [/进行了(一系列)?/g, '做了'],
            [/极大地/g, '大大'],
            [/显著(地)?(提升|提高)/g, '明显提升'],
            [/(旨在|意在)/g, '想'],
            // 一级禁用词（判断/过渡类）
            [/不容置疑/g, '就是'],
            [/显而易见[，,]?/g, ''],
            [/不由自主(地)?/g, ''],
            [/情不自禁(地)?/g, ''],
            [/自然而然(地)?/g, ''],
        ];

        // 机械连接词：句首出现时删除
        const connectors = [
            /(^|[。！？；\n])\s*首先[，,]?/g,
            /(^|[。！？；\n])\s*其次[，,]?/g,
            /(^|[。！？；\n])\s*再者[，,]?/g,
            /(^|[。！？；\n])\s*然后[，,]?/g,
            /(^|[。！？；\n])\s*此外[，,]?/g,
            /(^|[。！？；\n])\s*另外[，,]?/g,
            /(^|[。！？；\n])\s*与此同时[，,]?/g,
            /(^|[。！？；\n])\s*因此[，,]?/g,
            /(^|[。！？；\n])\s*然而[，,]?/g,
            /(^|[。！？；\n])\s*不仅如此[，,]?/g,
            /(^|[。！？；\n])\s*换言之[，,]?/g,
            /(^|[。！？；\n])\s*由此可见[，,]?/g,
        ];

        // 套路化开头结尾整句删除
        const boilerplate = [
            /^[^。！？\n]{0,40}(希望本文|希望这篇文章|希望以上内容)[^。！？\n]*[。！？]/gm,
            /[^。！？\n]{0,40}(让我们一起|让我们共同|接下来让我们|让我们来看看)[^。！？\n]*[。！？]/g,
            /[^。！？\n]{0,30}(是一个值得[^。！？\n]{0,20}的话题)[。！？]/g,
            /[^。！？\n]{0,30}(这一刻[^。！？\n]{0,20}(明白|意识到))[。！？]/g,
        ];

        // 诊断分级阈值（命中数 / 千字）—— 来源：去AI味技能 Phase 2
        const DENSITY_MILD = 5;
        const DENSITY_HEAVY = 15;

        function process(text) {
            let s = text;
            const counts = { toxic: 0, words: 0, connectors: 0, structure: 0, punct: 0 };

            if ($('#deaiToxic') && $('#deaiToxic').checked) {
                toxicPatterns.forEach(([re, rep]) => {
                    s = s.replace(re, (...args) => {
                        counts.toxic++;
                        // 支持 $1/$2 等捕获组引用
                        return rep.replace(/\$(\d)/g, (_, i) => args[+i] || '');
                    });
                });
            }
            if ($('#deaiStructure').checked) {
                boilerplate.forEach(re => { s = s.replace(re, () => { counts.structure++; return ''; }); });
            }
            if ($('#deaiConnectors').checked) {
                connectors.forEach(re => {
                    s = s.replace(re, (m, p1) => { counts.connectors++; return p1 || ''; });
                });
            }
            if ($('#deaiWords').checked) {
                wordMap.forEach(([re, rep]) => {
                    s = s.replace(re, () => { counts.words++; return rep; });
                });
            }
            if ($('#deaiPunct').checked) {
                // 禁用标点：冒号→逗号、破折号→逗号、双引号→「」
                const punctHits = (s.match(/[：]|——|"|"/g) || []).length;
                s = s.replace(/：/g, '，');
                s = s.replace(/——/g, '，').replace(/—{2,}/g, '，');
                s = s.replace(/\u201c([^\u201d]{1,80})\u201d/g, '「$1」');
                s = s.replace(/"([^"]{1,80})"/g, '「$1」');
                // 多余空格与空行压缩、重复标点收敛
                s = s.replace(/[ \t]{2,}/g, ' ');
                s = s.replace(/\n{3,}/g, '\n\n');
                s = s.replace(/([，。！？；：])\1+/g, '$1');
                s = s.replace(/^[，、。；：\s]+/gm, '');
                counts.punct = punctHits;
            }
            s = s.trim();
            // 诊断分级：按禁用词密度（命中数 / 千字）
            const total = counts.toxic + counts.words + counts.connectors + counts.structure;
            const density = total / (Math.max(text.length, 1) / 1000);
            let grade = '轻度';
            if (total === 0) grade = '无明显';
            else if (density > DENSITY_HEAVY) grade = '重度';
            else if (density > DENSITY_MILD) grade = '中度';
            return { text: s, grade, counts, total, density };
        }

        const GRADE_LABEL = {
            '重度': { cls: 'grade-heavy', color: 'var(--error)' },
            '中度': { cls: 'grade-mid', color: 'var(--warning)' },
            '轻度': { cls: 'grade-light', color: 'var(--success)' },
            '无明显': { cls: 'grade-clean', color: 'var(--text-subtle)' },
        };

        function renderReport(grade, counts, total, density) {
            if (!reportEl) return;
            reportEl.hidden = false;
            const meta = GRADE_LABEL[grade] || GRADE_LABEL['轻度'];
            gradeEl.className = `deai-grade ${meta.cls}`;
            gradeEl.textContent = `AI 味等级：${grade}`;
            if (total > 0) {
                gradeEl.textContent += ` · 密度 ${density.toFixed(1)}/千字`;
            }
            // 清空并重建明细
            breakdownEl.innerHTML = '';
            const items = [
                { k: 'toxic', label: '最毒句式', n: counts.toxic },
                { k: 'words', label: '高频词替换', n: counts.words },
                { k: 'connectors', label: '连接词精简', n: counts.connectors },
                { k: 'structure', label: '套路句删除', n: counts.structure },
                { k: 'punct', label: '标点修复', n: counts.punct },
            ];
            items.forEach(it => {
                if (it.n <= 0) return;
                const chip = document.createElement('span');
                chip.className = 'deai-chip';
                chip.textContent = `${it.label} ${it.n}`;
                breakdownEl.appendChild(chip);
            });
        }

        runBtn.addEventListener('click', () => {
            const raw = input.value;
            if (!raw.trim()) { showToast('请先输入文本', 'error'); return; }
            const { text, grade, counts, total, density } = process(raw);
            output.value = text;
            countEl.textContent = total ? `· ${grade} AI味` : '· 无明显 AI 痕迹';
            renderReport(grade, counts, total, density);
            showToast('已完成去 AI 味处理');
        });

        clearBtn.addEventListener('click', () => {
            input.value = '';
            output.value = '';
            countEl.textContent = '';
            if (reportEl) reportEl.hidden = true;
        });
    })();

    // ============================================
    // 工具：图片去水印
    // ============================================
    (function initWatermark() {
        const fileInput = $('#wmFile');
        const canvas = $('#wmCanvas');
        const stage = $('#wmStage');
        const selBox = $('#wmSelection');
        if (!fileInput || !canvas) return;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const strength = $('#wmStrength');
        const strengthVal = $('#wmStrengthVal');
        let originalData = null;
        let sel = null; // {x,y,w,h} in canvas pixels
        let dragging = false, startX = 0, startY = 0;

        strength.addEventListener('input', () => strengthVal.textContent = strength.value);

        fileInput.addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            const img = new Image();
            img.onload = () => {
                const WM_MAX_CANVAS_WIDTH = 900; // 限制画布最大宽度，避免大图卡顿
                const scale = Math.min(1, WM_MAX_CANVAS_WIDTH / img.width);
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                originalData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                sel = null; selBox.hidden = true;
                showToast('图片已载入，拖拽框选水印区域');
            };
            img.src = URL.createObjectURL(f);
        });

        function canvasPos(e) {
            const rect = canvas.getBoundingClientRect();
            const sx = canvas.width / rect.width;
            const sy = canvas.height / rect.height;
            return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy, rect };
        }

        canvas.addEventListener('mousedown', (e) => {
            if (!originalData) { showToast('请先选择图片', 'error'); return; }
            dragging = true;
            const p = canvasPos(e);
            startX = p.x; startY = p.y;
            selBox.hidden = false;
            updateSelBox(e, e);
        });
        const WM_MIN_SELECTION_PX = 4; // 选区最小有效尺寸，避免误触

        window.addEventListener('mousemove', rafThrottle((e) => {
            if (!dragging) return;
            updateSelBox(null, e);
        }));
        window.addEventListener('mouseup', (e) => {
            if (!dragging) return;
            dragging = false;
            const p = canvasPos(e);
            const x = Math.min(startX, p.x), y = Math.min(startY, p.y);
            const w = Math.abs(p.x - startX), h = Math.abs(p.y - startY);
            sel = (w > WM_MIN_SELECTION_PX && h > WM_MIN_SELECTION_PX) ? { x, y, w, h } : null;
            if (!sel) selBox.hidden = true;
        });

        function updateSelBox(_, e) {
            const rect = canvas.getBoundingClientRect();
            const stageRect = stage.getBoundingClientRect();
            const curX = e.clientX, curY = e.clientY;
            const p0x = rect.left + startX * (rect.width / canvas.width);
            const p0y = rect.top + startY * (rect.height / canvas.height);
            const left = Math.min(p0x, curX) - stageRect.left;
            const top = Math.min(p0y, curY) - stageRect.top;
            selBox.style.left = left + 'px';
            selBox.style.top = top + 'px';
            selBox.style.width = Math.abs(curX - p0x) + 'px';
            selBox.style.height = Math.abs(curY - p0y) + 'px';
        }

        function applyMosaic(x, y, w, h, size) {
            const img = ctx.getImageData(x, y, w, h);
            const d = img.data;
            for (let by = 0; by < h; by += size) {
                for (let bx = 0; bx < w; bx += size) {
                    let r = 0, g = 0, b = 0, a = 0, n = 0;
                    for (let dy = 0; dy < size && by + dy < h; dy++) {
                        for (let dx = 0; dx < size && bx + dx < w; dx++) {
                            const i = ((by + dy) * w + (bx + dx)) * 4;
                            r += d[i]; g += d[i + 1]; b += d[i + 2]; a += d[i + 3]; n++;
                        }
                    }
                    r /= n; g /= n; b /= n; a /= n;
                    for (let dy = 0; dy < size && by + dy < h; dy++) {
                        for (let dx = 0; dx < size && bx + dx < w; dx++) {
                            const i = ((by + dy) * w + (bx + dx)) * 4;
                            d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a;
                        }
                    }
                }
            }
            ctx.putImageData(img, x, y);
        }

        function applyBlur(x, y, w, h, radius) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x, y, w, h);
            ctx.clip();
            ctx.filter = `blur(${radius}px)`;
            ctx.drawImage(canvas, 0, 0);
            ctx.restore();
            ctx.filter = 'none';
        }

        function applyFill(x, y, w, h) {
            // 用选区外围一圈像素的平均色填充
            const px = Math.max(0, x - 2), py = Math.max(0, y - 2);
            const sample = ctx.getImageData(px, py, 1, 1).data;
            ctx.fillStyle = `rgb(${sample[0]},${sample[1]},${sample[2]})`;
            ctx.fillRect(x, y, w, h);
        }

        $('#wmApply').addEventListener('click', () => {
            if (!sel) { showToast('请先框选水印区域', 'error'); return; }
            const mode = $('#wmMode').value;
            const s = parseInt(strength.value);
            const x = Math.round(sel.x), y = Math.round(sel.y), w = Math.round(sel.w), h = Math.round(sel.h);
            if (mode === 'mosaic') applyMosaic(x, y, w, h, s);
            else if (mode === 'blur') applyBlur(x, y, w, h, Math.round(s / 2));
            else applyFill(x, y, w, h);
            selBox.hidden = true; sel = null;
            showToast('已处理选区');
        });

        $('#wmReset').addEventListener('click', () => {
            if (!originalData) return;
            ctx.putImageData(originalData, 0, 0);
            selBox.hidden = true; sel = null;
            showToast('已还原为原图');
        });

        $('#wmDownload').addEventListener('click', () => {
            if (!originalData) { showToast('请先选择图片', 'error'); return; }
            const a = document.createElement('a');
            a.download = 'no-watermark.png';
            a.href = canvas.toDataURL('image/png');
            a.click();
        });
    })();

    // ============================================
    // 工具：海报生成器
    // ============================================
    (function initPoster() {
        const canvas = $('#posterCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const themesWrap = $('#posterThemes');
        const themes = [
            { name: '深海蓝', c: ['#0f2027', '#2c5364'], text: '#ffffff', accent: '#4fc3f7' },
            { name: '晚霞橙', c: ['#ff512f', '#f09819'], text: '#ffffff', accent: '#fff3e0' },
            { name: '薄荷绿', c: ['#11998e', '#38ef7d'], text: '#ffffff', accent: '#e8fff3' },
            { name: '梦幻紫', c: ['#8e2de2', '#4a00e0'], text: '#ffffff', accent: '#e5d4ff' },
            { name: '午夜黑', c: ['#232526', '#414345'], text: '#ffffff', accent: '#ffd54f' },
            { name: '樱花粉', c: ['#ee9ca7', '#ffdde1'], text: '#5a2a35', accent: '#ffffff' },
        ];
        let current = 0;

        themes.forEach((t, i) => {
            const chip = document.createElement('button');
            chip.className = 'poster-theme' + (i === 0 ? ' active' : '');
            chip.style.background = `linear-gradient(135deg, ${t.c[0]}, ${t.c[1]})`;
            chip.title = t.name;
            chip.addEventListener('click', () => {
                current = i;
                $$('.poster-theme').forEach(c => c.classList.remove('active'));
                chip.classList.add('active');
                render();
            });
            themesWrap.appendChild(chip);
        });

        function ratioSize(ratio) {
            const POSTER_BASE_SIZE = 1080; // 海报导出基准分辨率（短边）
            const map = {
                '3:4': [POSTER_BASE_SIZE, POSTER_BASE_SIZE * 4 / 3],
                '1:1': [POSTER_BASE_SIZE, POSTER_BASE_SIZE],
                '9:16': [POSTER_BASE_SIZE, POSTER_BASE_SIZE * 16 / 9],
                '16:9': [POSTER_BASE_SIZE, POSTER_BASE_SIZE * 9 / 16],
            };
            return map[ratio] || map['3:4'];
        }

        function wrapText(text, maxWidth, font) {
            ctx.font = font;
            const chars = [...text];
            const lines = [];
            let line = '';
            chars.forEach(ch => {
                if (ctx.measureText(line + ch).width > maxWidth && line) {
                    lines.push(line); line = ch;
                } else line += ch;
            });
            if (line) lines.push(line);
            return lines;
        }

        function render() {
            const t = themes[current];
            const [w, h] = ratioSize($('#posterRatio').value);
            canvas.width = w; canvas.height = h;
            const align = $('#posterAlign').value;

            const g = ctx.createLinearGradient(0, 0, w, h);
            g.addColorStop(0, t.c[0]);
            g.addColorStop(1, t.c[1]);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, w, h);

            // 装饰光晕
            const orb = ctx.createRadialGradient(w * 0.8, h * 0.2, 0, w * 0.8, h * 0.2, w * 0.6);
            orb.addColorStop(0, 'rgba(255,255,255,0.18)');
            orb.addColorStop(1, 'rgba(255,255,255,0)');
            ctx.fillStyle = orb;
            ctx.fillRect(0, 0, w, h);

            const pad = w * 0.1;
            const title = $('#posterTitle').value || '';
            const sub = $('#posterSub').value || '';
            const tag = $('#posterTag').value || '';

            ctx.textAlign = align === 'left' ? 'left' : 'center';
            const cx = align === 'left' ? pad : w / 2;

            const titleFont = `700 ${Math.round(w * 0.13)}px "PingFang SC", "Microsoft YaHei", sans-serif`;
            const titleLines = wrapText(title, w - pad * 2, titleFont);
            const lineH = w * 0.15;
            let totalH = titleLines.length * lineH + (sub ? w * 0.08 : 0);
            let startY;
            if (align === 'bottom') startY = h - totalH - pad * 1.2;
            else startY = (h - totalH) / 2;

            // 顶部小标签
            ctx.fillStyle = t.accent;
            ctx.font = `600 ${Math.round(w * 0.032)}px "PingFang SC", sans-serif`;
            ctx.textAlign = align === 'left' ? 'left' : 'center';
            ctx.fillText(tag, cx, align === 'bottom' ? pad * 1.2 : pad);

            ctx.fillStyle = t.text;
            ctx.font = titleFont;
            titleLines.forEach((ln, i) => {
                ctx.fillText(ln, cx, startY + lineH * (i + 0.8));
            });

            if (sub) {
                ctx.fillStyle = t.accent;
                ctx.font = `400 ${Math.round(w * 0.05)}px "PingFang SC", sans-serif`;
                ctx.fillText(sub, cx, startY + lineH * titleLines.length + w * 0.06);
            }

            // 底部细线
            ctx.strokeStyle = 'rgba(255,255,255,0.35)';
            ctx.lineWidth = Math.max(2, w * 0.004);
            ctx.beginPath();
            ctx.moveTo(pad, h - pad * 0.7);
            ctx.lineTo(w - pad, h - pad * 0.7);
            ctx.stroke();
        }

        ['#posterTitle', '#posterSub', '#posterTag'].forEach(sel => $(sel).addEventListener('input', render));
        $('#posterRatio').addEventListener('change', render);
        $('#posterAlign').addEventListener('change', render);

        $('#posterDownload').addEventListener('click', () => {
            const a = document.createElement('a');
            a.download = 'poster.png';
            a.href = canvas.toDataURL('image/png');
            a.click();
            showToast('海报已导出');
        });

        render();
    })();

    // ============================================
    // 工具：开发板百科（列表 → 详情：建模图 + 接口用处）
    // ============================================
    (function initDevBoards() {
        const filtersEl = $('#devBoardsFilters');
        const grid = $('#devBoardsGrid');
        const listView = $('#devBoardsListView');
        const detailView = $('#devBoardsDetailView');
        if (!filtersEl || !grid || !listView || !detailView) return;

        const boards = [
            {
                id: 'arduino-uno-r3', name: 'Arduino Uno R3', cat: 'Arduino',
                icon: 'fa-microchip', maker: 'Arduino',
                brief: '全球最流行的入门开发板，基于 ATmega328P 8 位 MCU，生态成熟、教程丰富。',
                difficulty: 'beginner',
                specs: { '主控': 'ATmega328P', '主频': '16 MHz', 'Flash': '32 KB', 'SRAM': '2 KB', 'GPIO': '14 数字 + 6 模拟', '电压': '5V', '尺寸': '68.6×53.4mm', '价格': '¥15–30' },
                uses: 'LED 流水灯、温湿度传感器、舵机控制、基础 IoT 实验',
                pros: ['价格极低', '社区最大教程最多', 'Shield 扩展生态', '即插即用无需焊接'],
                cons: ['性能较弱 8 位', 'RAM 很小仅 2KB', '无 WiFi / 蓝牙'],
                stars: 5,
                interfaces: [
                    { name: 'USB-B 接口', icon: 'fa-usb', desc: '连接电脑供电并上传程序，同时作为串口与 PC 通信。', example: '插电脑烧录草图、用串口监视器看传感器读数' },
                    { name: '数字引脚 D0–D13', icon: 'fa-plug', desc: '14 个数字 IO，可输出高/低电平或读取数字信号。', example: '点亮 LED、读取按键、驱动继电器模块' },
                    { name: '模拟引脚 A0–A5', icon: 'fa-sliders-h', desc: '6 路 10 位 ADC，读取 0–5V 模拟电压。', example: '接电位器调光、读取温湿度传感器' },
                    { name: '电源 5V / 3.3V / GND', icon: 'fa-bolt', desc: '对外提供 5V 与 3.3V 电源及接地。', example: '给外接传感器、OLED 屏幕供电' },
                    { name: 'SPI（ICSP）', icon: 'fa-project-diagram', desc: '6 针 SPI 总线，用于高速外设与烧录。', example: '接 SPI 触摸屏、SD 卡模块' },
                    { name: 'I²C（A4/A5）', icon: 'fa-network-wired', desc: '两线串行总线，可挂多个低速设备。', example: '接 OLED 显示屏、DS3231 实时时钟' }
                ]
            },
            {
                id: 'arduino-uno-r4', name: 'Arduino Uno R4 WiFi', cat: 'Arduino',
                icon: 'fa-microchip', maker: 'Arduino',
                brief: 'Uno 的现代升级版，搭载 Renesas RA4M1 32 位 ARM Cortex-M4，板载 WiFi 和 LED 矩阵。',
                difficulty: 'beginner',
                specs: { '主控': 'Renesas RA4M1 32位', '主频': '48 MHz', 'Flash': '256 KB', 'SRAM': '32 KB', 'GPIO': '14 数字 + 6 模拟', '电压': '5V', '尺寸': '68.6×53.4mm', '价格': '¥120–160' },
                uses: 'IoT 联网项目、CAN 总线通信、LED 矩阵显示、中级学习',
                pros: ['32 位性能跃升', '板载 WiFi + BLE', '兼容 Uno 引脚', 'LED 矩阵可玩性高'],
                cons: ['价格偏高', '社区资源不如 R3 丰富', '部分老旧库需适配'],
                stars: 4,
                interfaces: [
                    { name: 'USB-C 接口', icon: 'fa-usb', desc: '新一代 USB-C 供电与烧录，兼容原有引脚布局。', example: '连电脑上传程序、串口调试' },
                    { name: '数字引脚 D0–D13', icon: 'fa-plug', desc: '14 个数字 IO，兼容 Uno R3 生态与 Shield。', example: '接 Shield 扩展板、LED 实验' },
                    { name: '模拟引脚 A0–A5', icon: 'fa-sliders-h', desc: '14 位 ADC，精度比 R3 更高。', example: '精密传感器采集、电位器读值' },
                    { name: 'WiFi + BLE', icon: 'fa-wifi', desc: '板载 ESP32-S3 提供无线联网与蓝牙。', example: '联网上报数据、手机蓝牙控制' },
                    { name: 'CAN 总线', icon: 'fa-sitemap', desc: '支持 CAN 通信，适合车辆/工业总线。', example: '接 OBD、电机驱动器' },
                    { name: 'LED 矩阵', icon: 'fa-table', desc: '板载 12×8 红色 LED 点阵，免外接显示。', example: '显示表情、动画、状态提示' },
                    { name: '电源 5V / 3.3V', icon: 'fa-bolt', desc: '对外提供电源与接地。', example: '给模块、传感器供电' }
                ]
            },
            {
                id: 'arduino-mega', name: 'Arduino Mega 2560', cat: 'Arduino',
                icon: 'fa-microchip', maker: 'Arduino',
                brief: '54 个数字 IO + 16 个模拟输入的大引脚开发板，适合 3D 打印机、机器人等多 IO 项目。',
                difficulty: 'intermediate',
                specs: { '主控': 'ATmega2560', '主频': '16 MHz', 'Flash': '256 KB', 'SRAM': '8 KB', 'GPIO': '54 数字 + 16 模拟', '电压': '5V', '尺寸': '101.5×53.3mm', '价格': '¥50–80' },
                uses: '3D 打印机主板、多舵机机器人、大型矩阵键盘、CNC 控制',
                pros: ['IO 极多 70 个', 'Flash 大 256KB', '多串口通信', '3D 打印标配主板'],
                cons: ['体积较大', '无 WiFi / 蓝牙', '仍是 8 位性能', '功耗较高'],
                stars: 4,
                interfaces: [
                    { name: 'USB-B 接口', icon: 'fa-usb', desc: '供电与上传程序。', example: '连电脑烧录草图' },
                    { name: '数字引脚 0–53', icon: 'fa-plug', desc: '54 个数字 IO，海量扩展能力。', example: '3D 打印机步进电机、多路舵机' },
                    { name: '模拟引脚 A0–A15', icon: 'fa-sliders-h', desc: '16 路模拟输入，多传感器并行。', example: '多路传感器矩阵采集' },
                    { name: '4× UART', icon: 'fa-arrows-alt-h', desc: '四路串口可同时与多个设备通信。', example: '接 GPS、蓝牙、无线数传' },
                    { name: 'SPI / I²C', icon: 'fa-project-diagram', desc: '标准总线，连接各类外设。', example: '接屏幕、存储、传感器' },
                    { name: '电源 5V', icon: 'fa-bolt', desc: '对外供电与接地。', example: '给外围电路供电' }
                ]
            },
            {
                id: 'arduino-nano', name: 'Arduino Nano', cat: 'Arduino',
                icon: 'fa-microchip', maker: 'Arduino',
                brief: '仅有指节大小的微型 Arduino，面包板友好，适合紧凑嵌入式项目。',
                difficulty: 'beginner',
                specs: { '主控': 'ATmega328P', '主频': '16 MHz', 'Flash': '32 KB', 'SRAM': '2 KB', 'GPIO': '14 数字 + 8 模拟', '电压': '5V', '尺寸': '43.2×18.5mm', '价格': '¥12–25' },
                uses: '穿戴设备原型、微型传感器节点、面包板实验',
                pros: ['极微型 18.5mm', '面包板直插', '价格最低', 'IO 够用'],
                cons: ['无 USB-C', '无 WiFi / 蓝牙', 'RAM 仍仅 2KB', '调试需串口转接'],
                stars: 4,
                interfaces: [
                    { name: 'Mini-USB', icon: 'fa-usb', desc: '老式 Mini-USB 供电与烧录。', example: '连电脑上传程序' },
                    { name: '数字引脚 D0–D13', icon: 'fa-plug', desc: '14 个数字 IO，面包板直插。', example: '面包板接线、LED 实验' },
                    { name: '模拟引脚 A0–A7', icon: 'fa-sliders-h', desc: '8 路模拟输入。', example: '读取电位器、传感器' },
                    { name: '电源 5V / 3.3V', icon: 'fa-bolt', desc: '对外供电。', example: '给小模块供电' },
                    { name: 'I²C / SPI', icon: 'fa-project-diagram', desc: '两线/四线总线扩展。', example: '接 OLED 显示屏' }
                ]
            },
            {
                id: 'rpi-5', name: 'Raspberry Pi 5', cat: '树莓派',
                icon: 'fa-raspberry-pi', brand: true, maker: 'Raspberry Pi 基金会',
                brief: '2023 年发布的旗舰单板计算机，4 核 Cortex-A76，支持双 4K 输出，可替代桌面电脑。',
                difficulty: 'intermediate',
                specs: { 'SoC': 'BCM2712 四核 Cortex-A76', '主频': '2.4 GHz', 'RAM': '4/8 GB LPDDR4X', '存储': 'microSD + M.2 NVMe', 'GPU': 'VideoCore VII', 'GPIO': '40 针', '尺寸': '85×56mm', '价格': '¥380–650' },
                uses: '轻量桌面办公、Home Assistant 智能家居、NAS、媒体中心、Docker 容器',
                pros: ['桌面级性能', 'M.2 NVMe 直连', '实时时钟 + 电源键', 'Pi OS 稳定好用'],
                cons: ['功耗高需散热', '价格较贵', '无板载 eMMC', 'GPIO 兼容性需注意'],
                stars: 5,
                interfaces: [
                    { name: 'USB 3.0 / 2.0', icon: 'fa-usb', desc: '接键鼠、硬盘、摄像头等外设。', example: '接 SSD 做系统盘、USB 摄像头' },
                    { name: '双 HDMI 2.0', icon: 'fa-display', desc: '双 4K 显示输出。', example: '接显示器做桌面系统' },
                    { name: 'GPIO 40 针', icon: 'fa-plug', desc: '40 针通用 IO，兼容老树莓派 HAT。', example: '接 LED、传感器、扩展板' },
                    { name: 'PCIe 2.0', icon: 'fa-server', desc: 'M.2 NVMe 高速扩展接口。', example: '接固态硬盘大幅提速' },
                    { name: 'WiFi 5 / BLE', icon: 'fa-wifi', desc: '无线连接。', example: 'SSH 远程登录、联网' },
                    { name: '千兆网口', icon: 'fa-network-wired', desc: 'RJ45 有线网络。', example: '搭建 NAS、家庭服务器' },
                    { name: 'USB-C PD 电源', icon: 'fa-bolt', desc: '5V 供电（需 5A 电源）。', example: '接官方电源适配器' },
                    { name: 'microSD / M.2', icon: 'fa-sd-card', desc: '系统与存储载体。', example: '烧录树莓派系统盘' }
                ]
            },
            {
                id: 'rpi-pico', name: 'Raspberry Pi Pico 2 W', cat: '树莓派',
                icon: 'fa-microchip', maker: 'Raspberry Pi 基金会',
                brief: 'RP2350 双核微控制器 + WiFi，树莓派官方 MCU 系列，极低功耗实时控制。',
                difficulty: 'beginner',
                specs: { '主控': 'RP2350 双核 ARM + RISC-V', '主频': '150 MHz', 'Flash': '4 MB (外挂)', 'SRAM': '520 KB', 'GPIO': '26 个', '电压': '3.3V', '尺寸': '51×21mm', '价格': '¥35–50' },
                uses: '传感器采集、电机控制、低功耗 IoT、MicroPython 教学',
                pros: ['超低功耗', 'PIO 可编程 IO', 'WiFi 内置', '双架构 ARM+RISC-V'],
                cons: ['无 GPU 不做桌面', 'Flash 需外挂', '社区不如 Arduino 成熟'],
                stars: 4,
                interfaces: [
                    { name: 'USB-C', icon: 'fa-usb', desc: '供电与拖拽式 UF2 烧录。', example: '拖入 UF2 文件烧录 MicroPython' },
                    { name: 'GPIO 26 针', icon: 'fa-plug', desc: '26 个多功能 IO。', example: '接传感器、LED' },
                    { name: 'WiFi + BLE', icon: 'fa-wifi', desc: '无线联网与蓝牙。', example: '数据上报、手机控制' },
                    { name: 'PIO 接口', icon: 'fa-microchip', desc: '可编程 IO 状态机，软件模拟协议。', example: '驱动 WS2812 灯带、自定义时序' },
                    { name: 'ADC 引脚', icon: 'fa-sliders-h', desc: '3 路 12 位 ADC 模拟输入。', example: '读取模拟传感器' },
                    { name: '电源 3.3V', icon: 'fa-bolt', desc: '对外供电。', example: '给小模块供电' }
                ]
            },
            {
                id: 'esp32-dev', name: 'ESP32-DevKitC V4', cat: 'ESP',
                icon: 'fa-wifi', maker: '乐鑫 Espressif',
                brief: 'IoT 开发王者，240MHz 双核 Xtensa LX6 + 内置 WiFi/BLE，性价比最高。',
                difficulty: 'beginner',
                specs: { '主控': 'ESP32-D0WDQ6 双核', '主频': '240 MHz', 'Flash': '4–16 MB', 'SRAM': '520 KB', 'GPIO': '34 个', '电压': '3.3V', '尺寸': '55.3×28mm', '价格': '¥18–35' },
                uses: '智能家居网关、MQTT 物联网节点、WebSocket 服务器、低功耗蓝牙设备',
                pros: ['WiFi+BLE 双模内置', '双核 240MHz', '价格极低', 'Arduino IDE 兼容'],
                cons: ['ADC 精度一般', '引脚电流有限', '功耗比 Pico 高'],
                stars: 5,
                interfaces: [
                    { name: 'micro-USB', icon: 'fa-usb', desc: '供电与上传程序。', example: '连电脑烧录固件' },
                    { name: 'WiFi + BLE', icon: 'fa-wifi', desc: '内置无线双模，IoT 核心。', example: 'MQTT 物联网节点' },
                    { name: '34× GPIO', icon: 'fa-plug', desc: '丰富通用 IO。', example: '接继电器、灯、传感器' },
                    { name: '3× UART', icon: 'fa-arrows-alt-h', desc: '多串口同时通信。', example: '接 GPS、调试串口' },
                    { name: 'SPI / I²C', icon: 'fa-project-diagram', desc: '标准总线扩展。', example: '接屏幕、传感器' },
                    { name: 'ADC / 触摸', icon: 'fa-sliders-h', desc: '12 位 ADC + 电容触摸。', example: '读模拟量、做触摸按键' },
                    { name: '电源 3.3V', icon: 'fa-bolt', desc: '对外供电（注意电流限制）。', example: '给小传感器供电' }
                ]
            },
            {
                id: 'esp32-s3', name: 'ESP32-S3-DevKitC', cat: 'ESP',
                icon: 'fa-microchip', maker: '乐鑫 Espressif',
                brief: 'ESP32 升级版，搭载 USB-OTG、向量指令集和更强的 AI 加速能力。',
                difficulty: 'intermediate',
                specs: { '主控': 'ESP32-S3 双核 Xtensa LX7', '主频': '240 MHz', 'Flash': '8–16 MB', 'SRAM': '512 KB + 2MB PSRAM', 'GPIO': '45 个', '电压': '3.3V', '尺寸': '54×25mm', '价格': '¥30–60' },
                uses: 'AI 视觉识别、TFT 屏幕驱动、USB 设备模拟、语音处理',
                pros: ['USB-OTG 原生', 'AI/向量加速', 'BLE 5.0 长距', 'LCD/Camera 接口'],
                cons: ['不带完整 5GHz WiFi', '发热略高于原版'],
                stars: 4,
                interfaces: [
                    { name: 'USB-OTG', icon: 'fa-usb', desc: '原生 USB，可做设备/主机。', example: '模拟键盘鼠标、直连烧录' },
                    { name: 'WiFi / BLE 5', icon: 'fa-wifi', desc: '无线联网与蓝牙。', example: '联网上报、长距通信' },
                    { name: '45× GPIO', icon: 'fa-plug', desc: '大量通用 IO。', example: '丰富外设扩展' },
                    { name: 'LCD / Camera', icon: 'fa-display', desc: '并口屏与摄像头接口。', example: '驱动 TFT、接摄像头做视觉' },
                    { name: 'SPI / I²C / UART', icon: 'fa-project-diagram', desc: '标准总线。', example: '接传感器、屏幕' },
                    { name: 'PSRAM', icon: 'fa-memory', desc: '片外 RAM 扩展，缓存大模型。', example: 'AI 推理帧缓冲' },
                    { name: '电源 3.3V', icon: 'fa-bolt', desc: '对外供电。', example: '给模块供电' }
                ]
            },
            {
                id: 'esp8266', name: 'NodeMCU ESP8266', cat: 'ESP',
                icon: 'fa-wifi', maker: '乐鑫 Espressif',
                brief: '经典款超低成本 WiFi 模块，虽已老旧但至今仍有大量教程和项目沿用。',
                difficulty: 'beginner',
                specs: { '主控': 'ESP8266EX 单核', '主频': '80–160 MHz', 'Flash': '4 MB', 'SRAM': '80 KB', 'GPIO': '11 个', '电压': '3.3V', '尺寸': '48×25mm', '价格': '¥8–15' },
                uses: 'WiFi 开关、天气时钟、MQTT 数据上报、极简 IoT 节点',
                pros: ['价格极低 8 元起', 'Arduino IDE 兼容', '功耗极低', '教程最多'],
                cons: ['单核性能弱', '无蓝牙', 'GPIO 少且部分受限', '已停止新 SDK 开发'],
                stars: 3,
                interfaces: [
                    { name: 'micro-USB', icon: 'fa-usb', desc: '供电与烧录。', example: '连电脑上传程序' },
                    { name: 'WiFi', icon: 'fa-wifi', desc: '内置 WiFi（无蓝牙）。', example: 'WiFi 开关、天气时钟' },
                    { name: 'GPIO 11', icon: 'fa-plug', desc: '有限 IO（部分引脚受限）。', example: '接继电器、LED' },
                    { name: 'UART', icon: 'fa-arrows-alt-h', desc: '串口通信。', example: '接串口设备' },
                    { name: 'SPI / I²C', icon: 'fa-project-diagram', desc: '总线扩展。', example: '接传感器' },
                    { name: '电源 3.3V', icon: 'fa-bolt', desc: '对外供电。', example: '给小模块供电' }
                ]
            },
            {
                id: 'stm32-f103', name: 'STM32F103C8T6 蓝药丸', cat: 'STM32',
                icon: 'fa-cogs', maker: '意法半导体 ST',
                brief: '最经典的 ARM Cortex-M3 入门开发板，极小体积，工业控制首选。',
                difficulty: 'intermediate',
                specs: { '主控': 'STM32F103C8T6 Cortex-M3', '主频': '72 MHz', 'Flash': '64 KB', 'SRAM': '20 KB', 'GPIO': '37 个', '电压': '3.3V', '尺寸': '53×22mm', '价格': '¥10–20' },
                uses: '电机闭环控制、CAN 总线通信、精密 ADC 采集、工业传感器',
                pros: ['价格极低', '外设丰富专业', 'CAN 总线内置', '实时性极强'],
                cons: ['上手难度高', '调试器需另购 ST-Link', 'RAM 偏少 20KB'],
                stars: 3,
                interfaces: [
                    { name: 'micro-USB', icon: 'fa-usb', desc: '供电（烧录需 ST-Link 调试器）。', example: '接 5V 供电' },
                    { name: '3× USART', icon: 'fa-arrows-alt-h', desc: '三路串口通信。', example: '接 GPS、蓝牙、调试' },
                    { name: '2× SPI / 2× I²C', icon: 'fa-project-diagram', desc: '多路标准总线。', example: '接屏幕、传感器' },
                    { name: 'CAN 总线', icon: 'fa-sitemap', desc: '工业现场总线。', example: '接电机驱动、车辆总线' },
                    { name: 'GPIO 37', icon: 'fa-plug', desc: '丰富通用 IO。', example: '接按键、LED' },
                    { name: '12 位 ADC', icon: 'fa-sliders-h', desc: '精密模拟采集。', example: '读取模拟传感器' },
                    { name: '电源 3.3V', icon: 'fa-bolt', desc: '对外供电。', example: '给模块供电' }
                ]
            },
            {
                id: 'stm32-f407', name: 'STM32F407VET6 黑药丸', cat: 'STM32',
                icon: 'fa-cogs', maker: '意法半导体 ST',
                brief: 'Cortex-M4 带 FPU + DSP 指令，168MHz 高频性能，适合音频和实时信号处理。',
                difficulty: 'advanced',
                specs: { '主控': 'STM32F407VET6 Cortex-M4 + FPU', '主频': '168 MHz', 'Flash': '512 KB', 'SRAM': '192 KB', 'GPIO': '82 个', '电压': '3.3V', '尺寸': '69×52mm', '价格': '¥40–70' },
                uses: '数字音频处理、FSMC 驱动 TFT 屏、多路伺服控制、复杂算法',
                pros: ['DSP + FPU 强大', 'Flash 大 512KB', 'IO 数量极多', 'FSMC 高速并口'],
                cons: ['学习曲线陡峭', '体积偏大', '功耗管理复杂'],
                stars: 3,
                interfaces: [
                    { name: 'micro-USB OTG', icon: 'fa-usb', desc: '供电与 USB OTG。', example: '接 USB 设备' },
                    { name: '4× USART', icon: 'fa-arrows-alt-h', desc: '四路串口。', example: '多设备通信' },
                    { name: '3× SPI / 3× I²C', icon: 'fa-project-diagram', desc: '多路总线。', example: '接屏幕、传感器' },
                    { name: '2× CAN', icon: 'fa-sitemap', desc: '双 CAN 总线。', example: '工业/车辆通信' },
                    { name: 'SDIO', icon: 'fa-sd-card', desc: '高速 SD 卡接口。', example: '接 SD 卡存储数据' },
                    { name: 'FSMC', icon: 'fa-server', desc: '高速并口，驱动 TFT。', example: '并口驱动大屏' },
                    { name: 'GPIO 82', icon: 'fa-plug', desc: '极多 IO。', example: '复杂外设扩展' },
                    { name: '电源 3.3V', icon: 'fa-bolt', desc: '对外供电。', example: '给模块供电' }
                ]
            },
            {
                id: 'microbit-v2', name: 'BBC micro:bit V2', cat: '教育',
                icon: 'fa-circle', maker: 'BBC / 微软',
                brief: '中小学编程教育标准硬件，内置 25 颗 LED 矩阵、喇叭、麦克风和触摸传感器。',
                difficulty: 'beginner',
                specs: { '主控': 'nRF52833 Cortex-M4', '主频': '64 MHz', 'Flash': '512 KB', 'SRAM': '128 KB', 'GPIO': '25 个含 5 大引脚', '电压': '3V', '尺寸': '52×42mm', '价格': '¥120–150' },
                uses: '中小学 STEM 教学、MakeCode 图形化编程、穿戴原型、互动游戏',
                pros: ['零基础可用', '传感器内置丰富', '图形化 + Python', '全球教育资源'],
                cons: ['专业性不足', '价格贵于性能比', '成人开发者不适用'],
                stars: 4,
                interfaces: [
                    { name: 'micro-USB', icon: 'fa-usb', desc: '供电与拖拽式烧录。', example: '拖入 HEX 文件烧录' },
                    { name: '5× 大引脚', icon: 'fa-plug', desc: '鳄鱼夹友好的大焊盘 IO。', example: '接鳄鱼夹做电路实验' },
                    { name: '25× LED 矩阵', icon: 'fa-table', desc: '板载点阵显示。', example: '显示图案、文字、心跳' },
                    { name: '喇叭 + 麦克风', icon: 'fa-volume-up', desc: '声音输出与输入。', example: '播放音效、声控互动' },
                    { name: '触摸引脚', icon: 'fa-hand-pointer', desc: '电容触摸感应。', example: '做触摸按键' },
                    { name: '加速度计 + 磁力计', icon: 'fa-compass', desc: '姿态与指南针。', example: '计步、方向检测' },
                    { name: 'BLE 5', icon: 'fa-wifi', desc: '无线连接。', example: '手机互动、板间通信' },
                    { name: '电源 3V', icon: 'fa-bolt', desc: '电池盒/USB 供电。', example: '接纽扣电池盒便携使用' }
                ]
            },
            {
                id: 'orange-pi-5', name: 'Orange Pi 5', cat: '树莓派',
                icon: 'fa-microchip', maker: '香橙派',
                brief: '瑞芯微 RK3588S 八核处理器，性能对标树莓派 5，性价比突出。',
                difficulty: 'advanced',
                specs: { 'SoC': 'Rockchip RK3588S 八核', '主频': '2.4 GHz A76×4 + 1.8 GHz A55×4', 'RAM': '4/8/16 GB LPDDR4X', '存储': 'microSD + M.2 NVMe + eMMC', 'GPIO': '40 针', '尺寸': '89×62mm', '价格': '¥400–900' },
                uses: '高性能 NAS、边缘 AI 推理、Android/Linux 桌面替代、K8s 集群节点',
                pros: ['八核性能爆表', 'M.2 + eMMC 双存储', '2.5G 网口', 'WiFi 6 + BT 5'],
                cons: ['软件生态不如树莓派', '社区稍小', '高负载需主动散热'],
                stars: 4,
                interfaces: [
                    { name: 'USB 3.0 / 2.0', icon: 'fa-usb', desc: '外接设备。', example: '接硬盘、键鼠' },
                    { name: 'HDMI 2.1 ×2', icon: 'fa-display', desc: '双 8K 显示。', example: '接显示器做桌面' },
                    { name: '40 针 GPIO', icon: 'fa-plug', desc: '通用 IO 扩展。', example: '接传感器、HAT' },
                    { name: 'M.2 NVMe / eMMC', icon: 'fa-server', desc: '高速存储。', example: '接固态硬盘提速' },
                    { name: '2.5G 网口', icon: 'fa-network-wired', desc: '高速有线网络。', example: '高速 NAS' },
                    { name: 'WiFi 6 / BT', icon: 'fa-wifi', desc: '无线连接。', example: '联网、蓝牙外设' },
                    { name: '电源 USB-C / 5V', icon: 'fa-bolt', desc: '供电接口。', example: '接官方电源' }
                ]
            },
            {
                id: 'beaglebone-black', name: 'BeagleBone Black', cat: '工业',
                icon: 'fa-server', maker: 'BeagleBoard.org',
                brief: 'AM3358 Cortex-A8 工业级单板机，带 PRU 实时协处理器，适合工业控制和实时任务。',
                difficulty: 'advanced',
                specs: { '主控': 'TI AM3358 Cortex-A8', '主频': '1 GHz', 'RAM': '512 MB DDR3', '存储': '4 GB eMMC + microSD', 'GPIO': '65 个', '电压': '5V', '尺寸': '86.4×53.3mm', '价格': '¥350–500' },
                uses: '工业 PLC 替代、电机实时控制、数据采集网关、机器人控制',
                pros: ['PRU 实时核硬实时', '工业级设计', 'GPIO 极多 65 个', 'CAN 总线双通道'],
                cons: ['RAM 仅 512MB', '处理器性能偏弱', '社区较小', '不推荐做桌面'],
                stars: 3,
                interfaces: [
                    { name: 'mini-USB', icon: 'fa-usb', desc: '供电与串口终端。', example: '连电脑做串口调试' },
                    { name: '1G 网口', icon: 'fa-network-wired', desc: '千兆有线网络。', example: '工业网关联网' },
                    { name: '2× PRU 实时核', icon: 'fa-microchip', desc: '硬实时协处理器。', example: '电机实时闭环控制' },
                    { name: '65× GPIO', icon: 'fa-plug', desc: '极多通用 IO。', example: '多路采集与控制' },
                    { name: '4× UART / 2× CAN', icon: 'fa-arrows-alt-h', desc: '串口与 CAN 总线。', example: '工业设备通信' },
                    { name: 'HDMI', icon: 'fa-display', desc: '视频输出。', example: '接显示器' },
                    { name: '电源 5V', icon: 'fa-bolt', desc: '供电。', example: '接 5V 电源' }
                ]
            },
            {
                id: 'kendryte-k210', name: 'Sipeed Maix (K210)', cat: 'AI',
                icon: 'fa-brain', maker: 'Sipeed / 嘉楠科技',
                brief: '内置 KPU AI 神经网络加速器的 RISC-V 双核芯片，超低价格实现边缘 AI。',
                difficulty: 'intermediate',
                specs: { '主控': 'K210 双核 RISC-V 64位', '主频': '400 MHz (可调 800)', 'Flash': '16 MB', 'SRAM': '8 MB', 'GPIO': '48 个', '电压': '5V', '尺寸': '52×25mm', '价格': '¥50–90' },
                uses: '人脸识别、物体分类、语音唤醒、车牌识别、AI 视觉教学',
                pros: ['AI 加速极低功耗', '0.5 TOPS 算力', '价格极低', '屏幕+摄像头直连'],
                cons: ['非标准 ARM 架构', '软件生态有限', '不适合通用开发'],
                stars: 3,
                interfaces: [
                    { name: 'USB-C', icon: 'fa-usb', desc: '供电与烧录。', example: '连电脑上传模型' },
                    { name: 'KPU AI 加速', icon: 'fa-brain', desc: '神经网络推理核心。', example: '人脸识别、物体分类' },
                    { name: 'LCD 接口', icon: 'fa-display', desc: '并口屏驱动。', example: '接 TFT 显示识别结果' },
                    { name: 'Camera 接口', icon: 'fa-camera', desc: '摄像头接入。', example: '接 OV 摄像头做视觉' },
                    { name: '48× GPIO', icon: 'fa-plug', desc: '通用 IO。', example: '接外设' },
                    { name: 'WiFi（模块）', icon: 'fa-wifi', desc: '可选无线模块。', example: '联网上报识别结果' },
                    { name: '电源 5V', icon: 'fa-bolt', desc: '供电。', example: '接 5V 电源' }
                ]
            }
        ];

        const categories = ['全部', ...([...new Set(boards.map(b => b.cat))])];
        let activeFilter = '全部';

        const diffLabels = { beginner: '新手友好', intermediate: '中等', 'advanced': '进阶' };
        const diffClass = { beginner: 'beginner', intermediate: 'intermediate', advanced: 'advanced' };
        const starStr = n => '★'.repeat(n) + '☆'.repeat(5 - n);

        function renderFilters() {
            filtersEl.innerHTML = categories.map(c => {
                const active = c === activeFilter ? ' active' : '';
                return `<button class="dev-boards-filter-chip${active}" data-cat="${c}">${c}</button>`;
            }).join('');
            filtersEl.querySelectorAll('.dev-boards-filter-chip').forEach(chip => {
                chip.addEventListener('click', () => {
                    activeFilter = chip.dataset.cat;
                    renderFilters();
                    renderGrid();
                });
            });
        }

        function renderGrid() {
            const filtered = activeFilter === '全部' ? boards : boards.filter(b => b.cat === activeFilter);
            grid.innerHTML = filtered.map((b) => `
                <div class="dev-board-card" data-id="${b.id}">
                    <div class="dev-board-card-top">
                        <div class="dev-board-icon"><i class="${b.brand ? 'fab' : 'fas'} ${b.icon}"></i></div>
                        <div class="dev-board-info">
                            <div class="dev-board-name">${b.name}</div>
                            <div class="dev-board-subtitle">${b.maker}</div>
                            <span class="dev-board-badge ${diffClass[b.difficulty]}">${diffLabels[b.difficulty]}</span>
                        </div>
                        <div class="dev-board-stars">${starStr(b.stars)}</div>
                    </div>
                    <div class="dev-board-card-brief">${b.brief}</div>
                    <div class="dev-board-card-go">查看接口与建模 <i class="fas fa-arrow-right"></i></div>
                </div>
            `).join('');

            grid.querySelectorAll('.dev-board-card').forEach(card => {
                card.addEventListener('click', () => {
                    const b = boards.find(x => x.id === card.dataset.id);
                    if (b) openDetail(b);
                });
            });
        }

        function openDetail(board) {
            listView.hidden = true;
            detailView.hidden = false;
            connectorLinesDrawn = false;
            // 清除旧引导线图层（之前可能附着在 detailView 上），让 getLineLayer 重建并附着到当前板子
            const oldSvg = $('#devBoardLineLayer');
            if (oldSvg) oldSvg.remove();

            // 头部信息
            $('#devBoardDetailInfo').innerHTML = `
                <div class="dev-board-detail-head">
                    <div class="dev-board-icon-lg"><i class="${board.brand ? 'fab' : 'fas'} ${board.icon}"></i></div>
                    <div>
                        <div class="dev-board-detail-name">${board.name}</div>
                        <div class="dev-board-detail-maker">${board.maker} · ${board.cat}</div>
                        <div class="dev-board-detail-meta">
                            <span class="dev-board-badge ${diffClass[board.difficulty]}">${diffLabels[board.difficulty]}</span>
                            <span class="dev-board-stars">${starStr(board.stars)}</span>
                        </div>
                    </div>
                </div>
                <p class="dev-board-detail-brief">${board.brief}</p>
                <div class="dev-board-detail-specs">
                    ${Object.entries(board.specs).map(([k, v]) => `<div class="dev-board-spec"><span class="dev-board-spec-label">${k}</span><span class="dev-board-spec-value">${v}</span></div>`).join('')}
                </div>
                <div class="dev-board-detail-uses"><i class="fas fa-bolt"></i> 典型用途：${board.uses}</div>
                <div class="dev-board-proscons">
                    <div class="dev-board-pros"><div><i class="fas fa-check-circle"></i><strong>优点</strong></div>${board.pros.map(p => `<div>+ ${p}</div>`).join('')}</div>
                    <div class="dev-board-cons"><div><i class="fas fa-times-circle"></i><strong>缺点</strong></div>${board.cons.map(c => `<div>- ${c}</div>`).join('')}</div>
                </div>
            `;

            const nodes = computeNodes(board);
            buildBoardModel(board, nodes);
            buildInterfaces(board, nodes);

            scrollPageTop();
        }

        // 按接口顺序在四边均布编号节点
        function computeNodes(board) {
            const edges = ['top', 'right', 'bottom', 'left'];
            const per = Math.ceil(board.interfaces.length / 4) || 1;
            return board.interfaces.map((it, i) => {
                const side = edges[Math.floor(i / per) % 4];
                const k = i % per;
                const pos = (k + 1) / (per + 1) * 100;
                return { itf: it.name, side, pos, num: i + 1 };
            });
        }

        // 仿真建模图：优先用 AI 生成的实物图，叠加编号接口节点；图片失败则回退到 schematic
        function buildBoardModel(board, nodes) {
            const el = $('#devBoardModel');
            if (!el) return;
            el.innerHTML = '';
            el.classList.remove('has-photo');

            const img = document.createElement('img');
            img.className = 'dev-board-photo-img';
            img.src = `assets/boards/${board.id}.png`;
            img.alt = board.name + ' 仿真建模图';
            img.loading = 'lazy';
            img.addEventListener('load', () => drawConnectorLines());
            img.addEventListener('error', () => {
                el.classList.remove('has-photo');
                el.innerHTML = '';
                renderSchematic(el, board);
                placeMarks(el.querySelector('.dev-board-pcb'), nodes, false);
                requestAnimationFrame(() => drawConnectorLines());
            });
            el.classList.add('has-photo');
            el.appendChild(img);
            placeMarks(el, nodes, true);
            requestAnimationFrame(() => drawConnectorLines());
        }

        function renderSchematic(el, board) {
            const pcb = document.createElement('div');
            pcb.className = 'dev-board-pcb';
            pcb.innerHTML = `
                <span class="dev-board-hole" style="top:5%;left:4%"></span>
                <span class="dev-board-hole" style="top:5%;right:4%"></span>
                <span class="dev-board-hole" style="bottom:5%;left:4%"></span>
                <span class="dev-board-hole" style="bottom:5%;right:4%"></span>
                <div class="dev-board-silk">${board.name}</div>
                <div class="dev-board-chip"><i class="${board.brand ? 'fab' : 'fas'} ${board.icon}"></i><span>MCU</span></div>`;
            el.appendChild(pcb);
        }

        function placeMarks(host, nodes, onPhoto) {
            if (!host) return;
            nodes.forEach(n => {
                let x, y;
                if (n.side === 'top') { x = n.pos; y = onPhoto ? 4 : 14; }
                else if (n.side === 'right') { x = onPhoto ? 96 : 86; y = n.pos; }
                else if (n.side === 'bottom') { x = n.pos; y = onPhoto ? 96 : 86; }
                else { x = onPhoto ? 4 : 14; y = n.pos; }
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = `dev-board-node dev-board-node-${n.side}`;
                dot.dataset.itf = n.itf;
                dot.dataset.num = n.num;
                dot.dataset.side = n.side;
                dot.style.left = x + '%';
                dot.style.top = y + '%';
                dot.title = n.itf;
                dot.setAttribute('aria-label', n.itf);
                dot.innerHTML = `<span class="dev-board-node-dot">${n.num}</span>`;
                dot.addEventListener('click', () => focusInterface(n.itf, true));
                dot.addEventListener('mouseenter', () => focusInterface(n.itf, false));
                dot.addEventListener('mouseleave', clearFocus);
                host.appendChild(dot);
            });
        }

        function buildInterfaces(board, nodes) {
            const wrap = $('#devBoardInterfaces');
            if (!wrap) return;
            const numOf = name => { const n = nodes.find(x => x.itf === name); return n ? n.num : ''; };
            wrap.innerHTML = `
                <h3 class="dev-board-section-title"><i class="fas fa-plug"></i> 接口与引脚用途</h3>
                <p class="dev-board-section-sub">点亮上方实物图上的编号节点，可定位到对应说明；悬停任一处双方会联动高亮</p>
                ${board.interfaces.map((itf, i) => `
                    <div class="dev-board-iface" data-itf="${itf.name}" style="animation-delay:${(0.24 + i * 0.06).toFixed(2)}s">
                    <span class="dev-board-iface-num">${numOf(itf.name)}</span>
                    <div class="dev-board-iface-body">
                            <div class="dev-board-iface-name">${itf.name}</div>
                            <div class="dev-board-iface-desc">${itf.desc}</div>
                            <div class="dev-board-iface-example"><i class="fas fa-lightbulb"></i> 常见用法：${itf.example}</div>
                        </div>
                    </div>
                `).join('')}
            `;
            wrap.querySelectorAll('.dev-board-iface').forEach(card => {
                card.addEventListener('mouseenter', () => focusInterface(card.dataset.itf, false));
                card.addEventListener('mouseleave', clearFocus);
            });
        }

        const SVG_NS = 'http://www.w3.org/2000/svg';
        let connectorLinesDrawn = false;

        // 常亮：每个编号节点向板内指一条细绿实线，指向图片上对应的接口位置
        // 关键：SVG 图层附着在板子（.dev-board-model）上，而不是整个详情视图，
        // 这样滚动 / 缩放时坐标永远相对板子，线不会跑出板外
        function getLineLayer() {
            let svg = $('#devBoardLineLayer');
            const host = $('#devBoardModel');
            if (!svg) {
                svg = document.createElementNS(SVG_NS, 'svg');
                svg.id = 'devBoardLineLayer';
                svg.setAttribute('aria-hidden', 'true');
                if (host) host.appendChild(svg);
            } else if (host && svg.parentNode !== host) {
                host.appendChild(svg);
            }
            return svg;
        }
        function drawConnectorLines() {
            const svg = getLineLayer();
            if (!svg) return;
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const sr = svg.getBoundingClientRect();
            document.querySelectorAll('.dev-board-node').forEach(node => {
                const nr = node.getBoundingClientRect();
                const x1 = nr.left + nr.width / 2 - sr.left;
                const y1 = nr.top + nr.height / 2 - sr.top;
                // 由所在边向板内指入一小段，指向图片上的接口位置
                // 起点从编号圆点边缘起笔，避免压住数字
                const side = node.dataset.side || 'top';
                const gap = 15, len = 20;
                let x2 = x1, y2 = y1, x3 = x1, y3 = y1;
                if (side === 'top') { y2 = y1 + gap; y3 = y1 + gap + len; }
                else if (side === 'bottom') { y2 = y1 - gap; y3 = y1 - gap - len; }
                else if (side === 'left') { x2 = x1 + gap; x3 = x1 + gap + len; }
                else { x2 = x1 - gap; x3 = x1 - gap - len; }
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', x2.toFixed(1));
                line.setAttribute('y1', y2.toFixed(1));
                line.setAttribute('x2', x3.toFixed(1));
                line.setAttribute('y2', y3.toFixed(1));
                line.setAttribute('class', 'dev-board-link-line' + (node.classList.contains('is-active') ? ' is-active' : '') + (!connectorLinesDrawn ? ' is-draw' : ''));
                svg.appendChild(line);
            });
            connectorLinesDrawn = true;
        }

        function focusInterface(name, scroll) {
            document.querySelectorAll('.dev-board-node').forEach(n => n.classList.toggle('is-active', n.dataset.itf === name));
            document.querySelectorAll('.dev-board-iface').forEach(c => {
                const on = c.dataset.itf === name;
                c.classList.toggle('is-active', on);
                if (on && scroll) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            drawConnectorLines();
        }
        function clearFocus() {
            document.querySelectorAll('.dev-board-node.is-active, .dev-board-iface.is-active')
                .forEach(el => el.classList.remove('is-active'));
            drawConnectorLines();
        }
        // 布局/图片加载变化（窗口缩放）时重画常亮连线
        window.addEventListener('resize', drawConnectorLines);

        $('#devBoardsBack').addEventListener('click', () => {
            detailView.hidden = true;
            listView.hidden = false;
        });

        renderFilters();
        renderGrid();
    })();

    // ============================================
    // 工具：设计风格参考卡
    // ============================================
    (function initDesignRef() {
        const grid = $('#designRefGrid');
        if (!grid) return;
        const styles = [
            { name: '极简主义 Minimalism', colors: ['#ffffff', '#f5f5f7', '#1d1d1f', '#0071e3'], font: 'SF Pro / Helvetica Neue', keywords: '留白 · 克制 · 层次 · 网格' },
            { name: '玻璃拟态 Glassmorphism', colors: ['#7f7fd5', '#86a8e7', '#91eae4', '#ffffff'], font: 'Inter / PingFang SC', keywords: '毛玻璃 · 半透明 · 光晕 · 模糊' },
            { name: '新拟态 Neumorphism', colors: ['#e0e5ec', '#ffffff', '#a3b1c6', '#4b5563'], font: 'Nunito / Poppins', keywords: '柔和阴影 · 凸起 · 单色 · 立体' },
            { name: '赛博朋克 Cyberpunk', colors: ['#0d0221', '#ff2a6d', '#05d9e8', '#d1f7ff'], font: 'Orbitron / 思源黑体', keywords: '霓虹 · 高对比 · 故障感 · 暗底' },
            { name: '孟菲斯 Memphis', colors: ['#ff6b6b', '#ffd93d', '#4d96ff', '#6bcb77'], font: 'Poppins / 站酷快乐体', keywords: '撞色 · 几何 · 波普 · 活泼' },
            { name: '莫兰迪 Morandi', colors: ['#b4a7a1', '#c9c0bb', '#8d9b8f', '#a3a380'], font: 'Georgia / 思源宋体', keywords: '低饱和 · 高级灰 · 温柔 · 高雅' },
            { name: '暗黑质感 Dark UI', colors: ['#0f172a', '#1e293b', '#38bdf8', '#e2e8f0'], font: 'Inter / Roboto', keywords: '深色 · 高对比 · 发光 · 沉浸' },
            { name: '国潮东方 Oriental', colors: ['#9d2933', '#c3272b', '#f0d9a7', '#1a1a1a'], font: '思源宋体 / 汉仪尚巍', keywords: '朱红 · 水墨 · 传统纹样 · 大气' },
        ];

        grid.innerHTML = styles.map(s => `
            <div class="design-ref-card">
                <div class="dr-swatches">
                    ${s.colors.map(c => `<button class="dr-swatch" data-color="${c}" style="background:${c}" title="点击复制 ${c}"></button>`).join('')}
                </div>
                <div class="dr-name">${escapeHtml(s.name)}</div>
                <div class="dr-meta"><i class="fas fa-font"></i> ${escapeHtml(s.font)}</div>
                <div class="dr-keywords">${escapeHtml(s.keywords)}</div>
            </div>
        `).join('');

        grid.addEventListener('click', async (e) => {
            const sw = e.target.closest('.dr-swatch');
            if (!sw) return;
            const ok = await copyText(sw.dataset.color);
            if (ok) showToast('已复制 ' + sw.dataset.color);
        });
    })();

    // ============================================
    // 工具：UUID 生成器
    // ============================================
    (function initUUID() {
        const btn = $('#uuidGenerate'), out = $('#uuidOutput'), copyAll = $('#uuidCopyAll');
        if (!btn || !out) return;

        const uuidV4 = () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        };
        const uuidV7 = () => {
            const ts = Date.now();
            const rand = () => Math.floor(Math.random() * 65536);
            const hex = (n, len) => n.toString(16).padStart(len, '0');
            const tsStr = hex(ts, 12);
            return `${tsStr.slice(0,8)}-${tsStr.slice(8)}-7${hex(rand(),3)}-${hex(0x8000 | rand(),4)}-${hex(Math.floor(Math.random() * Math.pow(2,48)), 12)}`;
        };

        btn.addEventListener('click', () => {
            const ver = $('#uuidVersion').value;
            const count = parseInt($('#uuidCount').value);
            const upperCase = $('#uuidCase').value === 'upper';
            const gen = ver === 'v7' ? uuidV7 : uuidV4;
            const uuids = Array.from({ length: count }, () => {
                const u = gen();
                return upperCase ? u.toUpperCase() : u;
            });
            out.textContent = uuids.join('\n');
        });
        copyAll.addEventListener('click', async () => {
            if (out.textContent === '点击「生成」创建 UUID') return;
            const ok = await copyText(out.textContent);
            if (ok) showToast('已复制全部 UUID');
        });
    })();

    // ============================================
    // 工具：URL 编解码
    // ============================================
    (function initUrlEncode() {
        const inp = $('#urlInput'), out = $('#urlOutput');
        if (!inp || !out) return;
        const eType = (method, name) => {
            let result;
            try { result = method(inp.value); } catch (e) { out.innerHTML = `<span style="color:var(--color-danger)">编码失败：${escapeHtml(e.message)}</span>`; return; }
            out.innerHTML = `<code>${escapeHtml(result)}</code>`;
            showToast(name + '完成');
        };
        $('#urlEncode').addEventListener('click', () => eType(v => encodeURIComponent(v), 'URL Encode'));
        $('#urlDecode').addEventListener('click', () => eType(v => decodeURIComponent(v), 'URL Decode'));
        $('#urlClear').addEventListener('click', () => { inp.value = ''; out.innerHTML = '<code>结果将显示在这里</code>'; });
    })();

    // ============================================
    // 工具：JWT 解码器
    // ============================================
    (function initJWT() {
        const inp = $('#jwtInput'), resultDiv = $('#jwtResult'), errP = $('#jwtError');
        if (!inp) return;
        $('#jwtDecode').addEventListener('click', () => {
            resultDiv.style.display = 'none'; errP.style.display = 'none';
            const token = inp.value.trim();
            if (!token) { errP.textContent = '请粘贴 JWT Token'; errP.style.display = ''; return; }
            const parts = token.split('.');
            if (parts.length !== 3) { errP.textContent = 'Token 格式无效（需为三段 Base64）'; errP.style.display = ''; return; }
            try {
                const header = JSON.parse(atob(parts[0].replace(/-/g, '+').replace(/_/g, '/')));
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                $('#jwtHeader').textContent = JSON.stringify(header, null, 2);
                $('#jwtPayload').textContent = JSON.stringify(payload, null, 2);
                const expirySec = $('#jwtExpirySec');
                if (payload.exp) {
                    const d = new Date(payload.exp * 1000);
                    const isExpired = d < new Date();
                    $('#jwtExpiryInfo').innerHTML = `${isExpired ? '<span style="color:var(--color-danger)">已过期</span>' : '<span style="color:var(--color-success,#34c759)">有效</span>'} — ${d.toLocaleString('zh-CN')} <br/><small>iss: ${payload.iss || '无'} | sub: ${payload.sub || '无'}</small>`;
                    expirySec.style.display = '';
                } else {
                    expirySec.style.display = 'none';
                }
                resultDiv.style.display = '';
            } catch (e) { errP.textContent = '解码失败：' + e.message; errP.style.display = ''; }
        });
        $('#jwtClear').addEventListener('click', () => { inp.value = ''; resultDiv.style.display = 'none'; errP.style.display = 'none'; });
    })();

    // ============================================
    // 工具：IP 信息
    // ============================================
    (function initIPLookup() {
        const btn = $('#ipLookupBtn'), addr = $('#ipAddress'), loc = $('#ipLocation'), isp = $('#ipIsp'), status = $('#ipStatus');
        if (!btn) return;
        const setVal = (el, v) => { el.textContent = v || '—'; };
        btn.addEventListener('click', async () => {
            status.textContent = '查询中...';
            try {
                const res = await fetch('https://api.ip.sb/geoip', { signal: AbortSignal.timeout(6000) });
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const d = await res.json();
                setVal(addr, d.ip);
                setVal(loc, [d.country, d.region, d.city].filter(Boolean).join(' '));
                setVal(isp, d.isp || d.organization || '—');
                status.textContent = '查询完成';
                setTimeout(() => { status.textContent = '点击「查询」获取本机 IP 信息'; }, 3000);
            } catch (e) {
                status.innerHTML = `<span style="color:var(--color-danger)">查询失败：${escapeHtml(e.message)}</span>`;
            }
        });
    })();

    // ============================================
    // 控制台
    // ============================================
    console.log(
        '%c💧 Aqua Tools %c· 清新工具箱\n%c' + allTools.length + ' 实用工具 · 天蓝渐变 + 液态玻璃 · 苹果风格动效',
        'color: #0ea5e9; font-size: 22px; font-weight: bold;',
        'color: #475569; font-size: 14px;',
        'color: #0284c7; font-size: 12px;'
    );

})();