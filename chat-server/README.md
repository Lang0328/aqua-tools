# chat-server — Aqua Chat 服务器版

基于 Node.js + Express + SQLite（Node 内置 `node:sqlite`，**零额外依赖**）的完整聊天服务器。
前端复用根目录的聊天页面（自动同步副本），通过 REST API 读写真实数据库，并通过 **SSE 实时推送** 实现多客户端消息秒收。

## 快速开始

```bash
cd chat-server
npm install      # 安装依赖（仅 express）
npm run sync     # 同步前端文件到 public/
npm start        # 启动服务器，默认端口 3000（用 PORT 可覆盖）
```

浏览器访问 http://localhost:3000/chat.html — 在任意浏览器/设备登录同一账号，实时聊天。

### 本地端口即刻运行

`npm start` 后：

- 静态页：http://localhost:3000/chat.html
- SSE 实时流：`GET /api/events`（服务器→客户端主动推送）
- REST 数据 API：`GET/POST/DELETE /api/db/:store[/:id]`
- 实时输入状态：`POST /api/typing`

服务器进程守护在端口 3000，多设备/浏览器间消息、输入状态、在线状态均实时同步。

## 演示账号

| 用户名 | 密码 | 角色 | 备注 |
|--------|------|------|------|
| admin  | admin123 | 管理员 | — |
| alice  | 123456 | 用户 | — |
| bob    | 123456 | 用户 | — |
| carol  | 123456 | 用户 | — |
| moss   | mossbot | bot | Aqua Chat 官方助手机器人（DM `/start /help /info …`） |

支持密码登录、**设备指纹一键登录**（首次进入弹安全须知 + 设置密码，设置后每次登录需校验密码）、密钥句子登录，以及注册新账号。

## 机器人系统

机器人在**服务端**运行（`bots.js`），用户在私聊中发命令，机器人以自身身份实时回复（SSE 推送）。登录后官方机器人会自动加入联系人列表（带 🤖/官方 标识）。

| 机器人 | 用户名 | 功能 |
|--------|--------|------|
| MOSS | `moss` | 官方助手：`/start /help /info /time /date /ping /random /echo /about /whoami` |
| 垃圾审查机器人 | `spam_bot` | `/check <用户名\|ID>` 账号信息 + 举报记录 + 垃圾评分；`/report <用户名> <原因>` 举报；`/me` 自查 |
| 机器人之父 | `bot_father` | 创建/管理机器人：`/newbot /mybots /templates /token /setcommands /setkeyword /setdesc /delete /cancel` |

**创建自定义机器人**：私聊 `bot_father` 发送 `/newbot`，按提示依次输入名字、用户名（必须以 `bot` 结尾）、类型即可获得令牌。类型支持：

- `template` 模板：`echo` 复读机 / `dice` 骰子 / `keyword` 关键词回复
- `custom` 自定义关键词回复（创建时直接配置 `关键词 => 回复`，之后可用 `/setkeyword` 随时补充）

其他用户搜索新机器人用户名即可开始对话。举报数据存服务端 `reports` store，spam_bot 会统计举报数与垃圾评分。

### 设备一键登录安全说明
- 首次设备登录：自动创建账号并进入，弹出安全须知 → 引导设置 4 位以上密码。
- 未设置密码：每次一键登录仍放行，重复提醒。
- 已设置密码：后续登录**必须**输入密码，否则 401。
- 密码保存在用户记录 `devicePasswordHash`（`hashPass`）；丢失设备指纹 = 丢失账号。

## 实时架构

前段 `js/chat.js` 检测 `window.AQUA_CHAT_API`（由 `api-init.js` 注入为 `/api`）即切换服务器模式。

- **SSE 推送**：浏览器端用 `fetch`+ReadableStream 连接 `GET /api/events`，收到 `message` / `message-update` / `message-delete` / `typing` / `user-online` / `broadcast` / `contact-added` / `channel-subscribe` 事件，实时刷新；3 秒自动重连。
- **消息写即推**：`POST /api/db/messages` 写入后，服务器根据 `chatId` 参与者列表 `getChatParticipants` 实时广播；删除亦推 `message-delete`。
- **联系人双向**：添加联系人时服务器自动写入反向关系并推 `contact-added`，对方列表立即出现。
- **输入状态**：输入框事件 → `POST /api/typing` → 广播 `typing` 事件 → 对方对话框显示"正在输入…"。
- **在线状态**：登录/登出时广播 `user-online` 给全部在线用户。
- **管理员广播**：后台"系统通知"→"发布广播" → `POST /api/admin/broadcast` → 全员 `broadcast` 弹窗。
- **系统频道**：所有用户（含设备一键登录）自动订阅 `c_ann` 系统公告 与 `c_official` 官方频道；官方频道 `adminPostOnly`，仅管理员可发帖（服务端 403 校验 + 前端隐藏发帖按钮）；订阅变更推 `channel-subscribe`。
- **已读回执**：打开聊天时立即标记已读，触发 `message-update`，发送方气泡 `✓`→`✓✓`。
- **设备登录安全**：首次设备登录弹安全须知 + 设置密码；密码设置后每次登录需校验。

聊天键约定：单聊 `dm_<uidA>|<uidB>`（`|` 分隔，避免 uid 含 `_` 冲突）；群/频道为记录 id；文件传输助手 `fh_<uid>`。

## API 一览

- `POST /api/auth` — 登录/注册，`type`：`password` / `device` / `key` / `register`
  - **设备一键登录** (`type: device`)：`identifier` 为设备指纹。首次登录自动建号并返回 `{ token, user, needSetPassword: true }`，前端弹出安全须知 + 设置密码。密码设置后（`needSetPassword:false`），后续相同设备登录**必须**提供 `secret` 校验，否则 401 `needPassword` → 前端弹回输入密码。
- `POST /api/auth/device/set-password` — 首次设备登录后设置密码 `{ secret }`（requireAuth；写入用户记录 `devicePasswordHash`/`devicePwdSet`）
- `POST /api/logout` — 登出（撤销 token）
- `GET /api/events` — SSE 实时流（鉴权）
- `POST /api/typing` — 输入状态广播 `{ chatId, typing }`（鉴权）
- `POST /api/admin/broadcast` — 管理员发布全员广播 `{ title, text }`（管理员）
- `POST /api/report` — 举报用户 `{ targetUserId, reason }`（写入服务端 reports，通知管理员）
- `GET /api/bots` — 机器人列表（发现可用机器人）
- `GET /api/db/:store` — 列表（`?idx=&val=` 按字段查询）
- `GET /api/db/:store/count` — 数量
- `GET /api/db/:store/:id` — 单条
- `POST /api/db/:store` — 写入 `{ data }`（messages 自动推送；contacts 写入时服务器自动建立双向关系并推 `contact-added`）
- `DELETE /api/db/:store/:id` — 删除
- `POST /api/notify` — 单用户实时通知 `{ userId, type, extra }`（鉴权；用于加群审批）
- `GET /api/events` — SSE 实时事件：`message / message-update / message-delete / typing / user-online / broadcast / notification / group-update / contact-added / channel-subscribe`

除 `/api/auth` 外均需请求头 `X-Auth-Token`。

> 密码在客户端以 `hashPass()` 哈希后传输；服务器比较 `credentialHash` 字段。

## 常用命令

- `npm run sync` — 前端改动后重新同步到 public/（聊天页已自动注入 `api-init.js`）
- `npm test` — 冒烟测试（登录 / 发消息 / 查消息 / 删除 / 登出 / 401 等 12 项）
- `npm run test:bots` — 机器人功能测试（MOSS / spam_bot / bot_father 创建删除 / 模板与关键词机器人）
- `node test-browser.js` — 端到端浏览器实时测试（双账号收消息 + 管理员广播）

## 数据说明

所有数据存于 `data/aquachat.db`（kv 单表 + tokens 表），首次启动自动预置演示账号。
删除 `data/` 目录即可重置。

## 在线状态 / 无损更新

- 服务器为单进程内存 SSE 连接，不支持多进程多实例共享；如需扩容可替换为 Redis/数据库广播层。
- 升级前端或服务端后端仅需 `npm run sync` 重新同步前端；重启 `npm start` 即可在本地端口持续运行，无需客户端安装。
