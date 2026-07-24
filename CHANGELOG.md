# Aqua Tools 网页变更记录

## 项目概述

**项目名称**：Aqua Tools · Apple 风格工具箱（参考 apple.com.cn 设计语言重构）

**项目结构**：
- `index.html` — 页面结构
- `styles.css` — 样式表（Apple 风格设计系统）
- `script.js` — 交互逻辑
- `CHANGELOG.md` — 本变更记录文件

**主要功能**：
工具箱集合，包含 38 个工具，按分类组织：
- **dev（开发）**：JSON 格式化、Markdown 编辑器、正则测试、代码片段管理、Cron 表达式、HTTP 状态码、时间戳转换、Base64 编解码、哈希计算
- **text（文本）**：字数统计、文本对比、占位文本、文本润色（去AI味）
- **design（设计）**：颜色选择器、调色板生成、渐变生成器、海报生成器、设计风格参考卡
- **media（媒体）**：图片压缩、二维码生成、图片取色器、图片去水印
- **utility（实用）**：单位换算、密码生成器、番茄钟、文件快传、加密聊天、在线终端、KMS 激活、本地备份箱、开源广场、小说阅读器、可信数据空间

---

## 变更历史

### 2026-07-21（第十二批）

#### 18. 修复开源广场不可用 + 补全整套功能
- **文件**：`script.js`、`index.html`、`styles.css`
- **问题**：点击「新建栏目」无任何反应，整套内容管理功能不可用
- **根因**：原实现依赖 `window.prompt()` / `window.confirm()`，在 Cloud Studio 预览的 iframe 中会被浏览器拦截，导致点击无可见反馈
- **改动**：
  - 删除所有原生 `prompt` / `confirm`，改为开源广场内部自建的轻量模态框（`osFormModal` 表单输入、`osConfirm` 二次确认），兼容 iframe 预览环境
  - 新建栏目：模态输入「栏目名称（必填）」+「简介（可选）」，空名校验高亮，创建后自动进入该栏目
  - 发布 / 编辑内容：模态输入标题（必填）+ 正文，编辑复用同一模态，保存后实时刷新列表
  - 删除栏目 / 内容：`osConfirm` 红色危险按钮二次确认，不可恢复提示
  - 新增顶部搜索框：跨栏目、跨内容实时搜索（标题 + 正文），搜索态展示「共 N 条结果」，点击栏目即退出搜索
  - 新增「导出」按钮：将所有数据导出为 JSON 文件（key `aqua_opensource_v1`，结构兼容旧版）
  - 数据持久化、渲染逻辑与旧版 localStorage 结构保持一致，原有栏目 / 内容不丢失
- **配套样式**：`styles.css` 新增 `.os-header-actions` / `.os-search-wrap` / `.os-modal-*` 等；原 `.os-editor` 内嵌编辑器不再使用但保留无害

### 2026-07-21（第十一批）

#### 17. 白色(aqua)模式背景加氛围色
- **文件**：`styles.css`
- **改动概要**：提升浅色模式背景光晕强度并新增双色径向渐变铺底，让白底也像暗色模式那样有氛围色，同时保持克制不刺眼
- `:root`（`--orb-1/--orb-2`）alpha 由 `0.08/0.06` 提升至 `0.18/0.14`（蓝 / 青）
- 新增 `--app-bg` 变量：左上蓝、右下青双色径向渐变叠加浅灰底
- body 背景由 `var(--bg-soft)` 改为 `var(--app-bg, var(--bg-soft))`
- 午夜主题重置 `--app-bg` 为纯色、极光保持自身背景，故仅白模式生效

#### 16. 登录页新增「返回主界面」幽灵按钮
- **文件**：`login.html`、`css/style.css`
- **改动概要**：在登录按钮下方加「返回主界面」幽灵按钮，跳转工具箱主页 `index.html`，与登录页毛玻璃风格统一
- 透明底 + 白色半透明描边 + 白字 + 圆角 10px，与白底实心主按钮形成主次对比
- 左侧内联 SVG 左箭头（页面未引 Font Awesome，保持自包含）
- 悬浮上移 2px、描边变亮、白色辉光、箭头左滑 3px；含 `aria-label`

#### 15. 新增「可信数据空间」工具 — 整套数据空间网页接入工具箱
- **文件**：`index.html`、`script.js`、`js/login.js`、`dataspace.html`（原 `index copy.html`）、`login.html`、`upload.html`、`data.html`、`permission.html`、`request.html`、`log.html`
- **改动概要**：将用户提供的「可信数据空间数据共享平台」整套网页作为一个工具接入工具箱，点击跳转其登录页
- `allTools` 注册 `data-space`（`cat: 'utility'`）；侧栏新增「数据空间」分组；`switchTool` 对 `data-space` 直接 `location.href='login.html'`
- 修复原网页导航 bug：`index copy.html` 改名为 `dataspace.html` 作为后台主页；`login.js` 登录跳转与 6 个页面「首页」统一指向 `dataspace.html`（`auth.js` 的 `checkLogin/logout→login.html` 本就正确）
- 工具总数：32 → 38

### 2026-07-20（第十批）

#### 14. 主页美化 — 新增多主题系统（浅空/午夜/极光）+ 顶栏切换器
- **文件**：`index.html`、`styles.css`、`script.js`、`CHANGELOG.md`
- **改动概要**：新增三套主题，顶栏增加主题切换器，CSS 变量驱动，本地持久化，刷新无闪烁

**三套主题**：
1. **浅空 Aqua**（默认）：现有 Apple 浅色 + 蓝调
2. **午夜 Midnight**（深色）：纯黑底 + 克制蓝调，光晕更醒目，毛玻璃变深色
3. **极光 Aurora**（深色活力）：深青黑底 + 青绿主调（`#2dd4bf`），青/紫光晕，氛围更鲜活

**顶栏主题切换器**：
- 信息按钮左侧新增主题按钮（半圆图标），点击弹出毛玻璃主题面板
- 每个主题含半色渐变圆 swatch + 名称 + 选中勾，激活态高亮
- 点击切换并 toast 提示，点击外部/Esc 关闭

**技术实现**：
- `[data-theme]` 属性驱动，`:root` 为浅空，`[data-theme="midnight"]`/`[data-theme="aurora"]` 覆盖核心变量（bg/text/glass/border/shadow/orb/primary）
- `--accent-active-soft` 改用 `color-mix(in srgb, var(--accent-active) 14%, transparent)`，随激活强调色自动适配
- 补全别名变量 `--surface/--surface-2/--text-primary/--text-secondary/--text-tertiary`，指向主题变量，修复新工具在深色下使用浅色回退的问题
- body 背景光晕与 home-hero 硬编码色改为 `--orb-1/--orb-2` 变量，随主题变化
- `.home-btn` 背景改用 `color-mix`，随主题强调色适配
- `color-scheme: light/dark` 让滚动条与原生控件随主题
- `<head>` 内联脚本尽早应用保存的主题，避免刷新闪烁；`localStorage` 持久化
- 主题切换时核心表面有 0.4s 平滑过渡



### 2026-07-20（第九批·修复）

#### 13. 修复设计风格卡整张消失 — 海报生成器 ratioSize 改名遗留 ReferenceError
- **文件**：`script.js`
- **问题**：第七批规范优化时将海报 `ratioSize` 的 `const base = 1080` 改名为 `POSTER_BASE_SIZE`，但 `map` 内仍引用旧名 `base`，导致 `ratioSize()` 抛 `ReferenceError: base is not defined`
- **影响链**：poster IIFE 末尾的 `render()` 在加载时调用 `ratioSize()` 抛错 → 中断后续 IIFE → 设计风格卡 `initDesignRef` 未执行 → 整张卡片消失
- **为何此前未暴露**：浏览器缓存了旧版 script.js，本次去AI味改动刷新脚本后才显现
- **修复**：将 `map` 中 4 处 `base` 全部改为 `POSTER_BASE_SIZE`



### 2026-07-20（第九批）

#### 12. 文本润色（去AI味）工具增强 — 对齐去AI味技能规则库
- **文件**：`index.html`、`styles.css`、`script.js`、`CHANGELOG.md`
- **改动概要**：依据一键去AI味技能的禁用词表与诊断体系，全面增强去AI味工具的规则覆盖、标点处理与诊断反馈

**新增「最毒句式」修复**（技能 banned-words 第一节，最高优先级）：
- "不是A，而是B" → 保留 B
- "，带着一丝/一种……" 万能状语 → 删
- "心中涌起一股……" / "心头一震" → 删
- "眼中闪过一丝……" / "嘴角勾起一抹……" → 删
- "仿佛/犹如/宛若……" → "像"
- "他/她知道……" 句首认知宣告 → 删该短句

**禁用词库扩充**（技能 banned-words 第二、四、八节）：
- 填充短语：值得一提的是、从某种意义上说、不可否认、毋庸置疑、事实上、不得不说、坦率地说、客观来讲、众所周知、毫无疑问、不难发现
- khazix 高频踩雷词：说白了、这意味着、意味着什么、本质上、换句话说
- 虚假宣告：意义重大、影响深远、其重要性不言而喻
- 一级禁用词：不容置疑、显而易见、不由自主、情不自禁、自然而然
- 连接词补充：换言之、由此可见

**禁用标点完善**（技能 banned-words 第九节）：
- 冒号"："→ 逗号"，"
- 破折号"——"→ 逗号
- 双引号"""" → 「」
- 重复标点收敛、行首标点清理

**诊断分级与报告**（技能 Phase 2）：
- 按禁用词密度（命中数/千字）给出 AI 味等级：轻度(≤5) / 中度(6-15) / 重度(>15)
- 新增诊断报告区：等级徽章 + 密度数值 + 命中明细芯片（最毒句式/高频词/连接词/套路句/标点 各自计数）
- 报告区使用 createElement + textContent 构建，符合 XSS 规范



### 2026-07-20（第八批）

#### 11. 设计风格卡 — 色卡行改为「凹陷调色台」底色，解决白/浅色色卡不可读
- **文件**：`styles.css`
- **改动概要**：将 `.dr-swatches` 设计为带深色中性渐变 + 内嵌阴影的凹陷调色台，每个色块加内描边与微缝隙，让白色、极浅灰色等任意色值都有清晰可读性，同时提升精致度与设计工具质感
- `:root` 新增 `--palette-stage` 渐变 token
- 色块新增悬浮抬升与阴影增强微交互



### 2026-07-20（第七批）

#### 10. 按前端开发规范优化代码质量 — 安全 / z-index / 性能 / 可访问性
- **文件**：`script.js`、`styles.css`、`index.html`、`CHANGELOG.md`
- **改动概要**：依据企业级前端开发规范，针对安全（XSS）、CSS（z-index 统一管理）、JS（魔法数字、防抖节流）、HTML（图片懒加载）进行整改，不改变现有功能与视觉

**安全（XSS 防护）**：
- `showToast` 重构：图标用静态 innerHTML、消息文本改用 `textContent`，杜绝所有调用方注入风险（如文件名、错误信息、色值）
- 新增 `sanitizeHTML(html)` 工具函数：基于 `<template>` 解析，移除 `script/style/iframe/object/embed/link/meta` 标签与 `on*` 事件属性、`javascript:` 协议
- Markdown 预览 `marked.parse()` 输出经 `sanitizeHTML` 净化后再渲染，防止恶意 Markdown 注入
- 调色板色值展示由 `innerHTML` 改为 `createElement + textContent`

**CSS — z-index 统一管理**：
- `:root` 新增 z-index 层级变量：`--z-bg / --z-content / --z-sticky / --z-dropdown / --z-overlay / --z-modal / --z-reader-immersive / --z-reader-ui / --z-reader-top` 及阅读器内部细分 `--z-reader-toggle/nav/toolbar/bottom/header/exit`
- 全文 19+ 处散落的魔法数字 z-index 全部替换为语义变量，层级关系一目了然

**JS — 魔法数字与性能**：
- 提取常量：`TOAST_DURATION_MS`、`WM_MIN_SELECTION_PX`、`WM_MAX_CANVAS_WIDTH`、`POSTER_BASE_SIZE`
- 新增 `rafThrottle(fn)` rAF 节流工具函数，应用于图片去水印的 `mousemove` 选区拖拽，收敛为每帧一次
- 全文已使用 `const/let`（无 `var`）、箭头函数、`async/await`，符合 JS 规范

**HTML — 可访问性**：
- 图片压缩预览图 `<img>` 补充 `loading="lazy"` 懒加载属性
- 现有结构已使用 `header/main/section/aside` 语义化标签、短横线类名



### 2026-07-20（第六批）

#### 9. 顶部栏新增「返回主页」按钮 + 全局分类强调色联动 + 减少割裂感优化
- **文件**：`index.html`、`styles.css`、`script.js`、`CHANGELOG.md`
- **改动概要**：顶栏增加一键返回主页按钮；引入 `--accent-active` 动态强调色，随当前工具分类切换，串联顶栏标题点、工具标题竖条、图标按钮悬浮态；柔化面板切换与顶栏边界，统一按钮语言

**返回主页按钮**：
- 顶栏菜单按钮右侧新增 `.home-btn` 胶囊按钮（房屋图标 + 「主页」文字）
- 悬浮扫光动效 + 图标轻微旋转放大；点击调用 `switchTool('home')`
- 位于主页时按钮变为实心渐变激活态（`.is-active`），离开主页恢复描边态
- 窄屏（≤640px）自动隐藏文字仅保留图标

**分类强调色联动（减少割裂感）**：
- 新增 `:root` 变量 `--accent-active` / `--accent-active-soft`，默认蓝色
- `switchTool` 中根据 `allTools` 的 `cat` 动态设置 `--accent-active` 为对应分类色
- 联动元素：顶栏标题圆点（`.title-dot`，带脉冲呼吸）、工具标题竖条（`.tool-header h2::before`）、菜单按钮/图标按钮悬浮态
- 主页时标题点显示蓝→青渐变，强调「总览」语义

**柔化与统一**：
- 顶栏硬边框 `border-bottom` 改为两端渐隐的渐变线（`.topbar::after`），与内容柔和衔接
- 面板进入动画 `panelEnter` 去掉 `blur(4px)` 与 `scale`，改为纯 `translateY(10px)+opacity`，更轻盈不突兀
- 信息按钮 `.info-btn` 去掉原先突兀的青蓝实心渐变，统一为玻璃描边 + 激活强调色悬浮态
- 图标按钮统一增加 `translateY(-1px)` 微抬悬浮反馈
- 工具切换时容器滚动改为 `scrollTo({behavior:'smooth'})` 平滑回顶

### 2026-07-20（第五批）

#### 8. 将技能转化为网页工具 — 新增 4 个纯前端工具（28 → 32）
- **文件**：`index.html`、`styles.css`、`script.js`、`CHANGELOG.md`
- **改动概要**：把 4 个技能能力做成纯前端工具，新增导航项、面板、注册数据与交互逻辑，计数由 28 更新为 32

**新增工具**：
1. **文本润色（去AI味）** `text` 分类
   - 基于规则去除 AI 写作痕迹：替换高频词/套话、精简机械连接词、删除套路化开头结尾、规范标点空格
   - 双栏原文/结果，显示替换处数，可复制，纯本地处理
2. **图片去水印** `media` 分类
   - 上传图片 → 鼠标拖拽框选水印区域 → 马赛克/模糊/邻近填充三种方式本地去除
   - Canvas 实现，支持强度调节、还原、下载 PNG，图片全程不上传
3. **海报生成器** `design` 分类
   - 输入主标题/副标题/标签，6 套配色 + 4 种比例（3:4 / 1:1 / 9:16 / 16:9）+ 3 种版式
   - Canvas 实时渲染渐变海报与光晕装饰，导出 2 倍分辨率 PNG
4. **设计风格参考卡** `design` 分类
   - 收录 8 种视觉风格（极简/玻璃拟态/新拟态/赛博朋克/孟菲斯/莫兰迪/暗黑/国潮）
   - 展示配色色板、推荐字体、关键词，点击色块复制 HEX

**技术要点**：
- 全部纯前端实现，无后端/无外部 API 依赖
- 复用现有 `mini-btn[data-target]` 复制委托、`showToast`/`copyText`/`escapeHtml` 工具函数
- 新增样式段「23. 新增工具样式」，含响应式适配

### 2026-07-19（第四批）

#### 7. 活力感增强 — 渐变色彩 + 动态背景 + 弹性交互
- **文件**：`styles.css`
- **改动概要**：从 Apple 极简风格转向更有活力感的设计，注入渐变色彩、动态光晕和弹性动画

**动态背景**：
- body 添加两个动态渐变光晕（蓝+紫），`orbDrift1/2` 动画 20-25s 循环漂移
- 使用 `filter: blur(60px)` 营造柔和氛围

**Logo 增强**：
- 图标从黑色方块改为蓝青渐变 + 阴影
- 文字改为蓝青渐变色
- hover 时弹性放大旋转（`cubic-bezier(0.34, 1.56, 0.64, 1)`）

**Hero 区域增强**：
- 背景从三色改为四色径向渐变网格（蓝/紫/绿/橙），透明度提高
- 添加圆角 `radius-xl`
- 标题第二行改为三色渐变文字（蓝→青→紫），字重 700
- 标签改为渐变药丸 + 脉冲圆点指示器（`pulse` 动画）
- 网格纹理透明度提高

**工具卡片增强**：
- 图标从浅彩底改为**渐变背景** + 白色图标 + 彩色阴影
- 图标 hover 弹性放大旋转（`scale(1.12) rotate(-6deg)`）
- 卡片 hover 增加分类色光晕阴影（`color-mix 15%`）
- 卡片 hover 上浮增加到 4px
- 入场动画增加 `scale(0.96)` 弹性效果

**分类标签增强**：
- 下划线改为**渐变色**（每个分类双色渐变）
- 动画曲线改为弹性 `cubic-bezier(0.34, 1.56, 0.64, 1)`
- 字重加粗到 600

**侧边栏增强**：
- 激活项左边线改为渐变 + 发光阴影

**按钮增强**：
- 主按钮改为蓝色渐变 + 阴影
- hover 弹性上浮 2px + 加深发光

**其他细节**：
- 工具标题竖线改为渐变 + 微发光
- 统计数字改为蓝青渐变文字，字重 700
- 统计圆点改为渐变 + 脉冲动画 + 发光

**设计理念转变**：
- 从「Apple 极简」转向「活力精致」
- 渐变色彩贯穿全局但不泛滥
- 弹性动画曲线 `cubic-bezier(0.34, 1.56, 0.64, 1)` 增加生命力
- 动态背景营造氛围感

---

### 2026-07-19（第三批）

#### 6. 设计增强 — 分类色彩系统 + 微交互层次
- **文件**：`index.html`、`styles.css`、`script.js`
- **改动概要**：在 Apple 极简基底上注入设计个性，创建「Refined Aqua」美学方向

**分类色彩系统**（`script.js` + `styles.css`）：
- 新增 5 个分类强调色 CSS 变量：dev(#0071e3)、text(#34c759)、design(#af52de)、media(#ff9500)、utility(#5ac8fa)
- 工具卡片 JS 添加 `data-cat` 属性，CSS 通过属性选择器赋值 `--card-accent`
- 图标背景使用 `color-mix()` 混合分类色 10% + 浅灰底
- 图标文字色使用分类色

**Hero 区域增强**：
- 添加三点径向渐变网格背景（蓝/紫/绿微光）
- 添加 48px 网格纹理叠层，用 mask 做径向渐隐
- 标题下方添加三色渐变装饰线（蓝→紫→橙），带生长动画

**工具卡片增强**：
- hover 时顶部 2px 分类色细线展开（`scaleX` 动画）
- hover 时轻微上浮 3px + 彩色边框光晕
- 图标 hover 时 `scale(1.08)` 微放大
- 箭头 hover 时从左侧滑入，使用分类色

**分类标签增强**：
- 激活态下划线使用对应分类色彩
- 添加 `tabUnderline` scaleX 展开动画

**侧边栏增强**：
- 激活导航项添加 3px 蓝色左边线指示器
- 图标添加颜色过渡动画

**工具面板增强**：
- 工具标题左侧添加 4px 蓝色竖线装饰
- 统计数字前添加 6px 蓝色圆点

**设计理念**：
- 保留 Apple 克制基底，加入精致色彩个性
- 每个分类有视觉身份，但不喧宾夺主
- 微交互层次丰富但克制（3px 上浮、0.08 透明度阴影）

---

### 2026-07-19（第二批）

#### 5. Apple 风格全面重构
- **文件**：`index.html`、`styles.css`
- **改动概要**：参照 apple.com.cn 官网设计语言，对整个网页进行系统性视觉重构

**设计系统重构（`:root` 变量）**：
- 配色：从天蓝渐变改为 Apple 克制色板（文字 `#1d1d1f`、背景 `#f5f5f7`、链接蓝 `#0071e3`）
- 字体：改为 `-apple-system, SF Pro Display, PingFang SC` 系统字体栈
- 阴影：从蓝色调重阴影改为极轻黑色阴影 `rgba(0,0,0,0.04~0.08)`
- 圆角：药丸按钮改为 `980px`（Apple 标准）
- 玻璃效果：`saturate(180%) blur(20px)` + `rgba(255,255,255,0.72)` 半透明

**背景与装饰**：
- 删除浮动的彩色光球装饰（`.bg-decoration` → `display: none`）
- body 背景从渐变改为纯净 `#f5f5f7`
- 字间距设为 `-0.01em`（Apple 风格紧凑排版）

**顶栏（Topbar）**：
- 从圆角浮动卡片改为全宽固定 48px 高度导航栏
- `position: sticky; top: 0` + 毛玻璃背景
- 去除外边距和圆角
- 标题字号改为 `1.0625rem`，字重 600

**顶栏按钮**：
- info 按钮去除渐变背景、发光、闪光扫过特效
- 所有按钮 hover 改为微妙灰底 `rgba(0,0,0,0.05)`
- 去除 `translateY` 浮动和 `scale` 缩放

**Hero 主页区域**：
- 去除渐变背景框、光球（`.hero-orb`）、浮动图标装饰（`.floating-icons`）
- padding 从 `60px 20px 50px` 改为 `96px 20px 64px`（大量留白）
- 标题字重从 800 改为 600，字间距 `-0.03em`
- 第二行标题改为灰色辅助文字（去除渐变文字）
- 统计数字去除玻璃背景框，改为纯文字展示
- 去除 hover 浮动效果

**工具卡片网格**：
- 卡片从玻璃半透明改为白底 `#fff` + 细边框 `#d2d2d7`
- 图标从渐变背景改为浅灰底 `#f5f5f7`
- hover 从浮动+发光改为轻微阴影 `shadow-md`
- 去除卡片顶部渐变条、径向光晕、图标旋转

**分类标签**：
- 从药丸容器+渐变激活改为底部下划线式标签
- 激活态：文字加粗 `500` + 底部 2px 黑线

**侧边栏**：
- header 高度从 72px 改为 48px（与顶栏对齐）
- logo 图标从渐变方块改为黑色方块 28×28px
- logo 文字去除渐变，改为纯黑
- 导航项去除圆角，改为全宽条目
- hover 改为灰底 `rgba(0,0,0,0.04)`
- 激活态改为浅灰底 `rgba(0,0,0,0.06)` + 蓝色图标

**工具面板与按钮**：
- `.tool-body` 去除毛玻璃，改为白底+细边框
- `.tool-btn` 改为药丸形（`radius-full: 980px`）
- primary 按钮从渐变改为实色 `#0071e3`
- hover 仅变色，无浮动无发光

**搜索框**：
- 背景改为 `#f5f5f7` 浅灰
- 圆角改为 `8px`
- focus 轮廓改为蓝色 `rgba(0,113,227,0.1)`

**设计原则总结**（参考 Apple）：
1. 极简留白 — 大量垂直间距营造呼吸感
2. 无多余装饰 — 去除渐变、发光、浮动动画
3. 克制动效 — hover 仅微妙背景变化
4. 一致性 — 统一的灰色调色板和字体
5. 内容优先 — 让工具本身成为主角

---

### 2026-07-19

#### 1. 小说阅读器全屏隐藏目录按钮
- **文件**：`styles.css`
- **位置**：`reader-immersive` 样式块（约第 5249 行）
- **改动**：在沉浸式全屏模式下彻底隐藏左上角的目录切换按钮（`.reader-toc-toggle`）
- **原因**：全屏阅读时目录按钮干扰沉浸体验
- **实现**：使用 `display: none !important` 替代原来的 `opacity: 0`，确保按钮不占据空间也不可点击

#### 2. 工具统计数字修正
- **文件**：`index.html`
- **位置**：第 236 行，hero 统计区域
- **改动**：将工具计数从 `data-count="21"` 改为 `data-count="28"`
- **原因**：实际 `allTools` 数组中有 28 个工具，统计数字应与实际数量一致
- **说明**：动画代码（`script.js` 的 `animateCount` 函数）保持原样未改动

#### 3. 侧边栏收起/展开逻辑重构（Apple 风格）
- **文件**：`index.html`、`styles.css`、`script.js`
- **改动概要**：参照 Apple 官网设计语言，将侧边栏切换改为极简一体化方案

**详细变更**：

**`index.html`**：
- 删除了浮动展开按钮 `#fabOpen`（原位于第 26-29 行）
- 删除了侧边栏头部的 `#sidebarToggle` 按钮
- 删除了跨边缘浮动按钮 `#sidebarToggle`（曾尝试放置在 `</aside>` 之后）
- 最终方案：仅保留顶栏 `#menuToggle` 作为唯一切换入口

**`styles.css`**：
- 删除了 `.fab-open` 及 `@keyframes fabPulse` 样式（原浮动按钮 + 脉冲动画）
- 删除了旧的 `.sidebar-toggle` 样式（原 sidebar-header 内的按钮样式）
- 删除了跨边缘按钮的全部样式（液态玻璃 + 渐变环设计）
- 重新设计 `.menu-toggle`（顶栏菜单按钮）为 Apple 风格：
  - 尺寸：40×40px
  - 圆角：`var(--radius-md)`（12px）
  - hover：微妙背景变色 `rgba(14,165,233,0.08)`，不放大不发光
  - active：背景加深 `rgba(14,165,233,0.14)`
  - focus-visible：蓝色轮廓（无障碍支持）
  - 去除了图标缩放动画，保持 Apple 式一致性

**`script.js`**：
- 删除了 `fabOpen` 变量及引用
- 删除了 `sidebarToggle` 变量及引用
- 删除了 `expandSidebar()`、`collapseSidebar()`、`updateFab()` 函数
- 统一为单一 `toggleSidebar()` 函数
- 仅保留 `menuToggle.addEventListener('click', toggleSidebar)` 一个事件绑定
- 删除了 `sidebarToggle` 的涟漪效果绑定代码

**设计原则**（参考 apple.com.cn）：
- 一体化：没有浮动的独立元素
- 克制：hover 只做微妙背景变化
- 一致性：图标不做花哨变形
- 简洁：一个操作一个入口

#### 4. 项目部署到 Cloud Studio
- **部署方式**：静态文件服务器（serve）
- **端口**：5173
- **部署记录**：每次代码更改后均重新部署

---

## 变更记录规则

1. 每次代码更改后，在「变更历史」中添加新条目
2. 记录内容包含：日期、改动标题、涉及文件、改动位置、改动内容、原因
3. 最新的变更添加在最上方（倒序排列）
4. 保持简洁但信息完整
