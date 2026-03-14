# I-Claw 项目完整功能及实现方案说明

## 一、项目概述

**I-Claw**（OpenClaw Mobile App）是一款面向 **OpenClaw** 开源自主 AI 代理的移动端控制平面应用。用户可通过单一移动界面完成：与 AI 对话、管理代理人格与记忆、浏览/安装技能、设备配对、系统监控、消费控制，以及连接 20+ 消息渠道。

- **技术栈**：Expo SDK 54 + React Native 0.81（iOS / Android / Web）、Express.js 后端、PostgreSQL + Drizzle ORM、WebSocket 实时通信。
- **仓库结构**：Monorepo，包含 `client`（Expo 客户端）、`server`（Express API + WebSocket）、`shared`（Drizzle  schema 与类型）。

---

## 二、整体架构

### 2.1 前端架构

| 维度 | 实现 |
|------|------|
| **框架** | Expo SDK 54，React Native 0.81，目标平台 iOS / Android / Web |
| **导航** | React Navigation：底部 Tab（Chat / Gateway / Rewards / Profile）+ 各 Tab 内 Stack；Settings 为 Modal |
| **状态** | TanStack React Query（服务端状态与缓存）、WebSocket Context（实时状态）、本地组件状态、AsyncStorage 持久化 |
| **UI/主题** | 深色主题、`client/constants/theme.ts` 设计系统、Reanimated 动画、平台适配（iOS 毛玻璃 / Android 实色） |
| **字体** | Inter（@expo-google-fonts/inter） |

**导航层级概要**：

- **RootStack**：MainTabs（主入口）、Chat、Settings（Modal）、CommandCenter、Canvas、Camera、LiveThoughts、TokenCosts、SystemMetrics、MissionControl、MemoryFeed、ChannelDashboard、SkillsBrowser、NodePairing、SoulEditor、SpendingLimits、Council。
- **MainTabs**：HomeTab（Chat 相关）、GatewayTab、RewardsTab、ProfileTab。
- **HomeStack**：Home → Chat / Settings / CommandCenter / Canvas / Camera 等。
- **RewardsStack**：Rewards 相关页面。
- **ProfileStack**：Profile 相关页面。
- **GatewayTab**：单屏 GatewayScreen，内链到 ClawBridge 各子功能（SoulEditor、MemoryFeed、NodePairing、ChannelDashboard、CommandCenter、SystemMetrics、TokenCosts、SpendingLimits、MissionControl、SkillsBrowser、Council 等）。

### 2.2 后端架构

| 维度 | 实现 |
|------|------|
| **运行时** | Node.js，TypeScript（开发用 tsx，生产用 esbuild 打包） |
| **HTTP** | Express 5，JSON body，CORS 白名单（Replit 域名 + localhost） |
| **WebSocket** | 挂载于同一 HTTP 服务器，路径 `/ws`，用于推送 agent 状态、实时想法、指标、成本、频道消息、节点状态等 |
| **认证** | Bearer Token，Session 存库，`requireAuthWithProfile` 做鉴权与 Profile 绑定 |
| **安全** | 单用户模式（仅允许 1 个账号注册）、Gateway URL SSRF 校验（禁止内网/ localhost）、Telegram Webhook 仅通过 URL 中的 token 校验 |

### 2.3 数据流与外部依赖

- **数据库**：PostgreSQL，连接串 `DATABASE_URL`，Drizzle 做 schema 与查询。
- **OpenClaw 网关**：用户可在设置中配置 Gateway URL；聊天、快捷指令、紧急停止、Telegram 回复等会请求该网关（`/api/chat`、`/api/health`、`/api/memory`、`/api/emergency-stop` 等），带 SSRF 校验与超时。
- **Telegram**：Bot Token 校验、Webhook 注册/删除、接收消息后转交 Gateway 对话并回传回复。

---

## 三、功能模块与实现

### 3.1 认证与用户

- **注册**：`POST /api/auth/register`，用户名 3–30 字符、密码至少 8 位，bcrypt 哈希；若已有用户则拒绝（单主实例）。
- **登录**：`POST /api/auth/login`，校验后创建 Session，返回 token。
- **登出**：`POST /api/auth/logout`，删除服务端 Session。
- **当前用户**：`GET /api/auth/me`，用于 token 校验与生物识别登录后的会话恢复。
- **生物识别**：客户端使用 `expo-local-authentication` + `expo-secure-store` 保存/读取用于快速登录的 token；服务端不区分登录方式，仍用同一 Session。

实现要点：`server/routes.ts` 中 auth 路由；`client/contexts/AuthContext.tsx` 管理 token、用户、生物识别开关与恢复登录。

### 3.2 个人资料与奖励体系

- **Profile**：`POST /api/profile` 创建或绑定 Profile，`GET /api/profile/:id`、`GET /api/profile/wallet/:address` 查询；`PUT /api/profile/:id/wallet` 更新钱包地址。
- **每日奖励**：`POST /api/rewards/claim` 领取每日 token，连续签到有倍数；`GET /api/rewards/status/:profileId` 返回可否领取、连续天数、下次奖励等。
- **邀请**：`GET /api/referrals/:profileId` 邀请列表与统计；`GET /api/referral/validate/:code` 校验邀请码；注册/绑定时可带 `referredBy` 完成邀请关系。
- **流水**：`GET /api/transactions/:profileId` 分页查 token 流水。
- **用量与 Pro**：`GET /api/usage/:profileId` 返回当日消息数、是否 Pro、剩余条数等；Pro 由 token 余额阈值或 isPro 标记决定，Pro 用户无每日消息条数限制。

实现要点：`user_profiles`、`daily_rewards`、`user_streaks`、`referrals`、`token_transactions`、`message_usage` 等表；`storage` 中对应方法；客户端 ProfileContext + Rewards 相关界面。

### 3.3 聊天与消息

- **消息列表**：`GET /api/messages?conversationId=` 按会话拉取消息（默认 `default`）。
- **发送消息**：`POST /api/messages`，body：`content`、可选 `profileId`、`model`、`conversationId`。若配置了 Gateway URL，则转发到 OpenClaw `/api/chat`，并可根据返回记录 token 消耗；否则返回本地兜底回复。非 Pro 用户受每日消息上限限制。
- **清空会话**：`DELETE /api/messages?conversationId=`。

实现要点：`server/routes.ts` 中消息路由与 `safeFetchGateway`；`client/screens/ChatScreen.tsx` 使用 React Query 拉消息、Mutation 发消息；`MessageBubble`、`MessageInput`、`TypingIndicator`、`EmptyChat`；支持多模型选择（Claude/GPT-4o/Gemini/DeepSeek/Ollama）、TTS 朗读、语音输入、相机发图分析（需客户端把图片内容或 URL 带入消息）。

### 3.4 设置与网关

- **全局设置**：`GET/PUT /api/settings`，包含 `openclawUrl`、`saveMessagesLocally`；更新 URL 时做 SSRF 校验。
- **网关状态**：`GET /api/gateway/status` 请求 Gateway `/api/health`，返回是否连通、延迟、服务器信息。
- **设备上报**：`POST /api/gateway/node-report`，用于 Gateway 页展示本机为节点（设备名、平台、电量、网络等），服务端仅做应答与生成 nodeId。
- **网关 TLS**：`GET /api/gateway-tls/:profileId`、`PUT /api/gateway-tls`，存 `gateway_tls_config` 表（开关、证书路径、校验对端等），实际 TLS 由 Gateway 或客户端连接网关时使用。

实现要点：`settings` 表；`validateGatewayUrl`、`safeFetchGateway` 在 `server/routes.ts`；Settings 界面与 Gateway 页调用上述 API。

### 3.5 SOUL.md（代理人格）

- **模板**：`GET /api/soul-configs/templates` 返回预设人格模板（Professional / Casual / DevOps / Minimalist / Creative）。
- **列表**：`GET /api/soul-configs/:profileId`。
- **增删改**：`POST /api/soul-configs`、`PUT /api/soul-configs/:id`、`DELETE /api/soul-configs/:id`。
- **激活**：`POST /api/soul-configs/:id/activate` 将当前配置设为当前使用的 SOUL。
- **导入**：`POST /api/soul-configs/import`，支持 `content` 或 `url`（会做 URL 校验并 fetch 内容）。

实现要点：`soul_configs` 表；`client/screens/SoulEditorScreen.tsx` 编辑与导入导出；新用户注册后 `seedNewProfile` 会写入默认 SOUL 配置。

### 3.6 技能（Skills）

- **浏览**：`GET /api/skills/browse` 返回固定技能目录（如 Email、Calendar、Web Scraper、Slack、Discord 等），带 source、category、securityStatus。
- **已安装**：`GET /api/skills/:profileId`。
- **安装**：`POST /api/skills/install`，body：skillName、description、source、category、可选 config。
- **开关**：`PUT /api/skills/:id/toggle` 启用/禁用。
- **卸载**：`DELETE /api/skills/:id`。
- **安全**：`GET /api/skills/:id/security` 返回该技能的安全状态与简要“扫描结果”（基于现有 securityStatus 的启发式）。

实现要点：`installed_skills` 表；`SkillsBrowserScreen`；seed 时可为新 Profile 安装若干默认技能。

### 3.7 消费限制（Spending Limits）

- **查询**：`GET /api/spending-limits/:profileId`，若无则自动创建默认。
- **更新**：`PUT /api/spending-limits`，可更新 dailyLimit、monthlyLimit、alertThreshold、alertEnabled。
- **告警**：`GET /api/spending-alerts/:profileId` 根据当前日/月消耗与阈值返回告警列表。

实现要点：`spending_limits` 表；Token 消耗写入 `token_costs`，与 limits 的 currentDailySpend/currentMonthlySpend 可由定时任务或写入时更新（具体逻辑在 storage 中若有则在此体现）；客户端 SpendingLimitsScreen。

### 3.8 设备节点（Node Pairing）

- **列表**：`GET /api/nodes/:profileId`。
- **发起配对**：`POST /api/nodes/pair`，body：nodeName、platform、可选 capabilities；返回 node、pairingData 及 base64 的 qrCode（供扫码或手动输入）。
- **批准**：`PUT /api/nodes/:id/approve`，将状态改为 paired，记录 pairedAt、lastSeenAt。
- **解除**：`DELETE /api/nodes/:id`。
- **调用能力**：`POST /api/nodes/:id/invoke`，body：capability、可选 params；服务端仅记录 lastSeenAt 并返回模拟结果，实际能力由 Gateway/节点实现。

实现要点：`paired_nodes` 表；`NodePairingScreen` 展示二维码与审批列表。

### 3.9 频道连接（Channels）

- **列表**：`GET /api/channels/:profileId`。
- **连接**：`POST /api/channels/connect`，body：channelType、channelName（通用）；Telegram 专用见下。
- **Telegram**：`POST /api/channels/telegram/setup`，body：botToken；校验 Bot API、注册 Webhook（`/api/telegram/webhook/:token`），并写入/更新 channel 的 config（botToken、chatIds 等）。Webhook 为公开接口，按 URL 中的 token 匹配 channel，收消息后转发 Gateway 对话并回写 Telegram。
- **开关**：`PUT /api/channels/:id/toggle`。
- **断开**：`DELETE /api/channels/:id`；若为 Telegram 会尝试删除 Webhook。
- **统计**：`GET /api/channels/:profileId/stats`。

实现要点：`channel_connections` 表；`server/telegram.ts`（validateBotToken、setupWebhook、deleteWebhook、sendTelegramMessage、parseTelegramConfig）；`ChannelDashboardScreen`。

### 3.10 Agent 想法、Token 成本、系统指标

- **Agent 想法**：`GET /api/agent-thoughts/:profileId`（可选 sessionId、limit）、`POST /api/agent-thoughts`（type、content、metadata、sessionId）；用于 Live Thoughts 流与调试。
- **Token 成本**：`GET /api/token-costs/:profileId`、`GET /api/token-costs/:profileId/summary`、`POST /api/token-costs`；聊天成功时由服务端写入一条 cost 记录。
- **系统指标**：`GET /api/system-metrics` 取最新一条、`GET /api/system-metrics/history` 历史、`POST /api/system-metrics` 上报（cpuPercent、memoryPercent、diskPercent 等）；由 Gateway 或节点上报，移动端展示。

实现要点：`agent_thoughts`、`token_costs`、`system_metrics` 表；LiveThoughtsScreen、TokenCostsScreen、SystemMetricsScreen；WebSocket 可推送 thought、cost、metric 更新。

### 3.11 记忆（Memory）

- **列表**：`GET /api/memories/:profileId`，可选 type、limit。
- **新增**：`POST /api/memories`，body：title、content、memoryType、tags、importance。
- **删除**：`DELETE /api/memories/:id`。
- **与 Gateway 同步**：`POST /api/memories/:profileId/sync`，请求 Gateway `/api/memory` 拉取内容并写入一条 memory_md 记录。
- **按文件类型**：`GET/PUT /api/memories/:profileId/file/:type`（如 memory_md、user_md、daily_log）；PUT 为按 type 覆盖或新增一条。
- **每日日志**：`GET /api/memories/:profileId/daily-logs`。
- **重要性**：`PUT /api/memories/:memoryId/importance`，1–5。

实现要点：`agent_memories` 表；`MemoryFeedScreen` 展示与编辑 MEMORY.md / USER.md / Daily Logs。

### 3.12 紧急停止（Emergency Stop）

- **列表**：`GET /api/emergency-stops/:profileId`。
- **触发**：`POST /api/emergency-stop`，body：reason；若配置了 Gateway 则请求其 `/api/emergency-stop`，并停用本端所有 active 的 schedule，再写一条 emergency_stops 与 action_log。
- **解决**：`PUT /api/emergency-stop/:id/resolve`。

实现要点：`emergency_stops`、`action_logs` 表；MissionControl 或专用 UI 调用。

### 3.13 快捷指令（Quick Actions）

- **列表**：`GET /api/quick-actions/:profileId`（若无则 seed 默认）。
- **创建**：`POST /api/quick-actions`，body：profileId、title、description、icon、iconColor、command。
- **删除**：`DELETE /api/quick-actions/:id`，body：profileId。
- **执行**：`POST /api/quick-actions/:id/run`，body：profileId；服务端用 command 拼成一条消息请求 Gateway `/api/chat`，并写 action_log。

实现要点：`quick_actions`、`action_logs` 表；CommandCenter 或 Home 可展示并执行。

### 3.14 定时任务（Schedules）

- **列表**：`GET /api/schedules/:profileId`。
- **创建**：`POST /api/schedules`，body：profileId、title、description、command、intervalMinutes、cronExpression、timezone、sessionType 等。
- **更新**：`PUT /api/schedules/:id`，可更新 isActive、title、description、command、intervalMinutes。
- **删除**：`DELETE /api/schedules/:id`，body：profileId。
- **心跳**：`POST /api/schedules/heartbeat`，body：intervalMinutes、checklist、isActive；创建一条“Heartbeat Check”类 schedule。
- **执行历史**：`GET /api/action-logs/:profileId`。

实现要点：`schedules` 表；CommandCenterScreen 可视化 cron、时区、会话类型、心跳配置与历史。

### 3.15 模型选择

- **列表**：`GET /api/models` 返回固定模型列表（Claude Sonnet 4、GPT-4o、Gemini 2.5 Pro、DeepSeek V3、Ollama Local）。
- **设置**：`PUT /api/settings/model`，body：modelId；当前实现仅校验 modelId 并返回成功，实际选用模型在发消息时由客户端传 `model`，服务端转发给 Gateway。

实现要点：ChatScreen 模型选择器与发送时带 model 参数。

### 3.16 Council（议会评审）

- **状态**：`GET /api/council/status`，返回 isRunning、config、lastReview、totalReviews。
- **历史**：`GET /api/council/history`。
- **日志**：`GET /api/council/log`。
- **执行**：`POST /api/council/run`，若未在跑则执行一轮评审（可带 gatewayUrl 做 AI 增强）。
- **配置**：`PUT /api/council/config`，body：enabled、intervalHours、useGateway。

实现要点：`server/council.ts` 中 4 个“议员”对 6 大领域做启发式（及可选 Gateway AI）评审，结果写入 `data/council-history.json`；CouncilScreen 需 7 次点击 ClawBridge 进入，且可配合密码（expo-secure-store）。

### 3.17 WebSocket

- **路径**：`/ws`，与 Express 共用 HTTP Server。
- **连接**：客户端连接后发送 `subscribe`（可选 channels），服务端回复 `subscribed`；每 30s 服务端发 `heartbeat`。
- **服务端广播**：`httpServer.broadcast(type, data)` 向所有已连接客户端推送 `{ type, data, timestamp }`；类型可包括 agent-thought、status-change、metric-update、cost-update、channel-message、node-status 等（具体以服务端调用为准）。
- **客户端**：`client/lib/websocket.ts` 管理连接与订阅；`WebSocketContext` 提供 connectionState、agentStatus、subscribe，供 Chat、Live Thoughts、Gateway 等使用。

### 3.18 新用户种子数据（seedNewProfile）

注册或首次关联 Profile 后调用 `seedNewProfile(profileId)`，会创建：

- 默认 SOUL 配置（I-Claw Personal Assistant）。
- 默认 spending limits。
- 一条 Hourly Heartbeat schedule（默认未启用）。
- 4 条快捷指令（Morning Brief、Summarize Context、System Check、Clear & Reset）。
- 一条 MEMORY.md 模板记忆。
- 3 个入门技能（Web Search、Summarizer、Code Assistant）。

---

## 四、数据模型（shared/schema.ts）摘要

| 表名 | 用途 |
|------|------|
| users | 用户账号 |
| sessions | 登录 Session，Bearer token |
| messages | 聊天消息，按 conversationId |
| settings | 全局设置（openclawUrl、saveMessagesLocally） |
| user_profiles | 钱包、邀请码、token 余额、Pro、推荐关系 |
| referrals, daily_rewards, user_streaks, token_transactions | 邀请与奖励体系 |
| message_usage | 按日统计消息条数 |
| quick_actions, schedules, action_logs | 快捷指令与定时任务 |
| agent_thoughts, token_costs, system_metrics | 想法、成本、系统指标 |
| agent_memories | 记忆条目（MEMORY.md/USER.md/Daily Log 等） |
| emergency_stops | 紧急停止记录 |
| soul_configs | SOUL.md 人格配置 |
| installed_skills | 已安装技能及安全状态 |
| spending_limits | 日/月限额与告警 |
| paired_nodes | 已配对设备节点 |
| channel_connections | 频道连接（含 Telegram config） |
| gateway_tls_config | 网关 TLS 配置 |

所有表均通过 Drizzle 在 `shared/schema.ts` 定义，迁移使用 `drizzle-kit push`。

---

## 五、客户端关键文件索引

| 功能 | 路径 |
|------|------|
| 入口与全局 Provider | `client/App.tsx` |
| 根导航 | `client/navigation/RootStackNavigator.tsx` |
| 底部 Tab | `client/navigation/MainTabNavigator.tsx` |
| 认证 | `client/contexts/AuthContext.tsx` |
| 个人资料与用量 | `client/contexts/ProfileContext.tsx` |
| WebSocket | `client/contexts/WebSocketContext.tsx`、`client/lib/websocket.ts` |
| 主题与设计系统 | `client/constants/theme.ts` |
| API 与 Token | `client/lib/query-client.ts` |
| 聊天 | `client/screens/ChatScreen.tsx`、`MessageBubble`、`MessageInput`、`TypingIndicator` |
| 设置 | `client/screens/SettingsScreen.tsx` |
| Gateway 总览 | `client/screens/GatewayScreen.tsx` |
| SOUL 编辑 | `client/screens/SoulEditorScreen.tsx` |
| 记忆流 | `client/screens/MemoryFeedScreen.tsx` |
| 技能浏览 | `client/screens/SkillsBrowserScreen.tsx` |
| 节点配对 | `client/screens/NodePairingScreen.tsx` |
| 频道 | `client/screens/ChannelDashboardScreen.tsx` |
| 命令中心 | `client/screens/CommandCenterScreen.tsx` |
| Canvas/WebView | `client/screens/CanvasScreen.tsx` |
| 相机 | `client/screens/CameraScreen.tsx` |
| 实时想法 / 成本 / 指标 / 任务控制 / 消费限制 / Council | 对应 Screen 与 API |

---

## 六、服务端关键文件索引

| 功能 | 路径 |
|------|------|
| HTTP + WebSocket 入口 | `server/index.ts` |
| 路由与 WebSocket 挂载 | `server/routes.ts` |
| 存储抽象与实现 | `server/storage.ts` |
| 数据库连接 | `server/db.ts` |
| Telegram Bot / Webhook | `server/telegram.ts` |
| Council 逻辑 | `server/council.ts` |
| 共享 Schema | `shared/schema.ts` |

---

## 七、运行与构建

- **开发**：`npm run server:dev`（后端）、`npm run expo:dev`（客户端）；需配置 `DATABASE_URL`。
- **生产**：`npm run server:build` 后 `npm run server:prod`；静态 Expo 构建见 `scripts/build.js` 与 `expo:static:build`。
- **数据库**：`npm run db:push` 同步 schema。

以上即为本项目在当前代码下的完整功能与实现方案说明，可直接作为开发与维护的参考文档。
