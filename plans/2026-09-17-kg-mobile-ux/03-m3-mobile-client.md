# 批次 3（M3）：移动端（AI 员工对话 + AI 填表助手）+ PC iframe 预览

> 依据：[总纲](PLAN.md)、[移动端原型拆解（实测 9 路由 + 15 项可移植要素）](../../research/2026-09-17-mobile-prototype-analysis.md)、[现状诊断（互通断点 + NocoBase AI 能力清单）](../../research/2026-09-17-mobile-prototype-analysis.md)。
> 参考原型实测结论：四 Tab（消息/工作台/数据/我的）+ 消息即首页 + AI 填表任务卡（预填+双动作审批）+ 调用链面板三件套 + 7 通道录入中心。

## 1. 目标

食品企业业务员在手机上完成"问数 + 填表 + 追溯"，与 PC 端同一数据链（同一 SQLite ×3 + NocoBase PG），PC 端可 iframe 预览移动端。

## 2. 架构决策（已拍板，依据见总纲 D1/D4）

| 决策 | 内容 |
|---|---|
| 移动端宿主 | **DSH 侧 `/mobile` 独立入口**：webserver 新增静态注入路由（复用 [nocobase-proxy.ts](../../packages/host/webserver/src/nocobase-proxy.ts) 同源代理模式与 [injections.ts](../../packages/host/webserver/src/injections.ts) 注入机制），客户端 bundle 复用平台模块表（[seed.ts](../../packages/client/web/src/seed.ts)：react/react-dom/cordis/ui-slots/ui-primitives）。**不押注** NocoBase plugin-ui-layout（开发中）与已废弃的 plugin-mobile |
| 对话引擎 | 统一走 **DSH agent**（apiproxy [sessions 域](../../packages/host/apiproxy/src/api/sessions.ts) + events 流），AI 员工人格 = 既有 agent-presets（enterprise-data-assistant/food-compliance-officer + [scenarios/](../../examples/kb-agent/scenarios) 30 场景）——移动端选人格即选预设；NocoBase plugin-ai AI 员工保留业务平台侧不动（D4 双栈收敛：移动端入口唯一化） |
| 数据互通 | 天然互通：`/mobile` 与 PC 同一 dsh web 进程（DSH_HOME=examples/kb-agent/.dsh），同一 kb.sqlite/kg-graph.sqlite/lakehouse + 经 nocobase RPC 访问 PG 95 collection。**不新建任何库** |
| 鉴权 | 本批最小会话绑定：复用 sessions RPC 会话 id 做轻量身份（单租户 disk-level 立场不变，多租户单列后续批次）；登录页按原型范式（手机号+验证码，倒计时），验证通道本批 mock（与原型一致），真通道留后续 |

## 3. 实施内容与落点

### 3.1 移动端壳与四 Tab（P0）

- **新包** `packages/client/ui-mobile`（客户端插件 bundle，manifest 走 [client/modules 模式](../../packages/client/modules/src/client/manifest.ts)）：
  - `shell/MobileShell.tsx`——底部四 Tab 导航（消息/工作台/数据/我的）+ 路由（hash 路由，path 直达，最深 3 级，对齐原型 IA 图）。
  - `messages/`——会话列表（AI 员工会话置顶+AI 徽章+职能副标题；复用 sessions RPC 列表）+ 对话页（流式消息、调用链三件套：可折叠「本轮调用链」/「正在调用…」状态行/结构化结果卡）。
  - `workbench/`——待办审批队列（Agent 产出待办，紧急/今日徽章）+ 快捷操作。
  - `data/`——经营概览卡（lakehouse 聚合，复用 M1 3.3 数字卡组件）+ 业务对象浏览（95 collection 分组，复用 M1 3.4 分组导航逻辑）+ **KG 精简追溯视图**（节点-边卡片流形态，非画布；借 M2-P1 kg_query L1 能力）。
  - `profile/`——AI 员工通讯录（职能+在线状态）+ 设置。
- **webserver**：`/mobile` 路由（[index.ts](../../packages/host/webserver/src/index.ts)）注入移动 bundle；viewport meta、藏青 `#192b4d` 主题令牌（[ui-theme](../../packages/client/ui-theme/src) 增移动 token 集）。
- **输入体验**：快捷指令芯片（随人格/场景切换）+ 语音（本批占位）+ 拍照 OCR（走 data 上传通道路由 kb/lakehouse）。

### 3.2 AI 填表助手（任务卡范式，P0）

- **新组件** `packages/client/ui-mobile/src/forms/TaskCard.tsx`（原型实测范式移植）：
  - AI 预填草稿卡（≤6 核心字段，字段级可改）→ 人只做「驳回/推送」双动作 → 推送走 agent `nb_create`/`nb_update`（PC 同款确认流契约：预览→go-ahead→回执）。
  - 执行时间线（每步时刻+哪个工具/什么数据，复用 session 事件流投影）+ 支撑数据区（KB 引用来源列表的移动端形态）。
- **入口**：工作台"智能表单"（7 通道录入中心本批做 3 通道：拍照 OCR/语音占位/结构化表单）+ 对话内触发（"帮我登记一条供应商开发记录"→AI 反问补槽→任务卡）。

### 3.3 PC 端 iframe 移动端预览（P1）

- **落点**：`packages/client/ui-view-context` 视图环新增"移动端预览"视图（conversation.view slot 注册）：手机壳框（390×844 缩放容器）内 iframe 嵌 `/mobile`——同源无 framing 问题；webserver 已验证的 framing guards 剥离经验（nocobase-proxy）作为跨源备用。
- **验收**：PC 会话内切换视图→iframe 内可完整操作移动端（对话+任务卡）；view-context 快照机制对 iframe 视图降级为标题级（不注入页面内部状态）。

### 3.4 跨端动作（P1，可选）

- 结构化结果卡内嵌「推送到 PC」按钮：原型实测范式——本批实现为"标记+PC 侧最近会话提示"（复用 view-actions 通知通道），不做真推送通道。

## 4. 涉及文件/包汇总

| 层 | 包/文件 | 变更 |
|---|---|---|
| 移动端 | packages/client/ui-mobile（新包：shell/messages/workbench/data/profile/forms） | 四 Tab 全量 |
| 服务 | packages/host/webserver/src/{index,injections}.ts | /mobile 路由+bundle 注入 |
| 视图环 | packages/client/ui-view-context + 注册 | "移动端预览"iframe 视图 |
| 组合 | examples/kb-agent/cordis.patch.yml | webserver 移动入口开关（config 字段，无硬编码） |
| 主题 | packages/client/ui-theme | 移动 token 集（藏青/语义绿） |
| 测试 | apps/web/tests/mobile-*.e2e.ts（新） | 390×844 viewport 快照 |

## 5. 验收标准（真实可验证）

1. **移动端真实实跑**：390×844 viewport 打开 `http://127.0.0.1:3080/mobile`（重启 web 进程后验证，规避模块图冻结）→ 登录→四 Tab 全走通；chrome-devtools 截图（每 Tab + 任务卡 + 对话调用链）≥10 张 + record-browser-gif 移动端旅程 GIF。
2. **AI 对话问数真实 API**：移动端提问"宏发食品本月出口情况"→ 流式回答+结果卡+来源徽标（会话日志留档）。
3. **AI 填表闭环**：对话触发"登记供应商开发记录"→ AI 反问补槽 → 任务卡预填 → 修正 1 字段 → 推送 → NocoBase SRM collection 出现该行（PG 实查或 PC 业务页可见）→ 回执卡显示 before→after。
4. **数据互通实证**：移动端问数引用的 KG 边，在 PC KG 视图同一实体可查（同一 kg-graph.sqlite）；反向：PC 改 nb 行后移动端列表刷新可见。
5. **PC iframe 预览**：视图环切换成功+iframe 内完成一次任务卡操作；e2e 快照。
6. **keyless 快照**：mobile-shell/messages/task-card/iframe-preview ≥4 个（真实 assembled example）；既有快照零回归；Agent Note + bilingual 文档（docs/subsystems/web.zh.md 移动端段落）同 PR。

## 6. 依赖与风险

- **依赖**：M1（3.2 数字卡、3.4 分组导航组件复用）；M2-P1（kg_query L1 供 KG 精简追溯；M2-P1 未达则 data Tab 的 KG 区降级为 kg_subgraph 种子子图）；apiproxy sessions/events RPC 面已具备。
- **风险**：①sessions RPC 面向移动端流式的适配（SSE/轮询）——先实测现有 events 域，必要时加移动专用轻量端点；②iframe 在视图环内的 CSS Modules 隔离冲突——手机壳用 shadow DOM 或 iframe 原生隔离规避；③移动 bundle 体积（sigma 等重库不进移动包）——移动端 KG 用卡片流不引画布；④mock 验证码上线边界——PR 与文档显式声明"演示级鉴权"。
