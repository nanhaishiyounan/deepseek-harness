# R3｜deepseek-harness 仓库现状盘点（W24 轮前置研究）

> 研究日期：2026-10-09 ｜ 性质：只读盘点 ｜ 服务对象：W24「carbon 替换 NocoBase + 五源架构全量重构」轮
> 证据格式：`文件路径:行号`。规模数据来自仓库内登记文件（MANIFEST/QUICKSTART/调研报告），未执行写操作。
> 术语：五源 = 湖仓（lakehouse）/ 知识库（KB）/ 业务系统（NocoBase→carbon）/ 本体（ontology registry）/ 图谱（KG）。

## 0. 执行摘要

- 本仓库是 vendored Cordis 上的插件化 agent harness：53 个包组、全部 `@deepseek-ai/dsh-*` 命名、ESM、pnpm workspace（`packages/README.md:9`、根 `AGENTS.md`）。Web UI 的桌面壳在 `packages/client/`（约 50 个 ui-* 插件包），`apps/web` 仅是 Vite 入口薄壳（`apps/web/src/main.ts` 同目录仅 3 个源文件）。
- 会话体内的 tab 环由 `conversation.view` slot 构成，9 个座位（chat/kb/scenarios/market/connectors/kg/business/trajectory/mobile-preview），每个 tab = 一个 client 插件包的一次 `ctx.slots.register`，插件化程度已经很高——W24 改「豆包式左侧边栏菜单」有现成挂载点（`sidebar.footer.action` 已是侧栏入口 slot 的雏形，座位 5–9）。
- kb / lakehouse / kg 三条数据缝全部「seam + SQLite/本地存储 + 工具行」三件套齐备，且 KG 已落地 2026-09-17 调研报告推荐的方案 A 大部分内容（registry v5 + FoodOn 锚点 + KGCL + episode 回滚 + 共指审核 + SHACL gate）。这三块是 W24 最高价值的可回收资产。
- `platform/nocobase` 约 14,031 文件（上游 2.2.6 快照），业务数据在本地 PG 库 `nocobase`（49 张 `hub_*`/`crm_*` 业务表 + 5 个专家域 collections + `wfl_*` 五表），已有现成导出通道：`w6b1-lakehouse-transfer.mts` 把 13 张业务表经 REST 分页落 `nb_*` Parquet——泛化它即可完成「老业务数据导出 → carbon 初始化灌数」。
- 新增一个包的成本：通用包 4 步 + 5 项验证（`docs/cookbook/adding-a-package.md`）；client 插件包另需 3 个注册面（aggregate tsconfig / web-app patch 行 / web-app package.json 依赖，`packages/client/AGENTS.md:132-141`）。pnpm-workspace 已 glob `packages/*/*`，新包无需改 workspace 配置。

## 1. packages/ 全量清单与四列分类

权威来源：`packages/README.md:11-60`（组表）、各组 README、`docs/architecture.md:39-52`。53 个组（`packages/` 顶层目录实测）。分类列含义：**保留**=重构后原样可用；**改造**=保留但需改接线；**退役候选**=随 NocoBase/W24 方案淘汰；**五源关系**=湖仓侧/KB 侧/图谱侧/业务侧/UI 侧/无关（基础面）。

| 组 | 包（组内目录） | 一句话职责 | 处置 | 五源关系 |
|---|---|---|---|---|
| core/ | agent、agent-default-model、agent-loop、agent-tool-presentation、scope、session、system-prompt、tools | 产品 API 脊柱：Agent 接口与循环、默认模型、工具呈现、作用域、事件日志、prompt 装配、工具注册表（`docs/architecture.md:45-50`） | 保留 | 无关（地基） |
| api/ | gateway、remotes | Typert RPC 网关与 Client 远程装配（`docs/api-gateway.zh.md:82-93`） | 保留 | 无关（地基） |
| typert/ | type graph 生成/加载/注册 | 类型图与 Remote 严格契约 | 保留 | 无关 |
| llm/ | llm（seam）、llm-minimax 等 | LLM 适配缝 + 提供方（kb-agent 用 llm-minimax 走 MiniMax-M3） | 保留 | 无关（LLM 数据源供给侧） |
| e2b/ | E2B POC | 沙箱提供方 | 保留 | 无关 |
| subprocess/ shell/ terminal/ code-runtime/ sandbox/ fs/ lsp/ | 各执行能力 | 子进程/bash/PTY/代码执行/进程 confinement/文件系统/LSP（`packages/README.md:22-28`） | 保留 | 无关 |
| skill/ compaction/ context/ subagent/ jobs/ | skill、压缩、模型可见上下文、委派、后台任务 | 各能力缝 + 工具行 | 保留 | 无关 |
| experimental/ | 私有原型 | 不发布 | 保留 | 无关 |
| workflow/ spill/ attachment/ todo/ plan/ preset/ guard/ | 工作流、结果溢出、附件身份、todo 工具、计划模式、预设组合、循环卫生 | 各能力（`packages/README.md:35-42`） | 保留 | 无关 |
| bundle/ | base、headless、web-app | 可安装 profile patch 层；web-app 是浏览器面组合（`packages/bundle/web-app/cordis.patch.yml`，502 行） | 改造 | UI 侧（W24 新组合的模板） |
| extensions/ hooks/ session-query/ settings/ credentials/ identity/ storage/ workspace/ | 自修改、hook 桥、会话检索、设置、凭据、身份、非会话存储、工作区实体 | 各支撑面 | 保留 | 无关 |
| session/ | session-persistence、-jsonl、-sqlite、-projection、-projection-cache、-stats、-telemetry、-telemetry-otel、-title、-title-all-prompts-llm、-checkpoint-policy（11 包） | 会话持久化/投影/标题/遥测（`packages/README.md:46`） | 保留 | 无关（「会话」保留面） |
| sdk/ acp/ interaction/ boot/ examples/ test-support/ util/ mcp/ runtime-diagnostics/ | SDK、ACP、审批交互、boot、示例、测试支撑、零依赖工具、MCP、运行时诊断 | 支撑面 | 保留 | 无关 |
| goal/ schedule/ feedback/ | 目标、定时跟进、人类反馈 | 同-session 能力 | 保留 | 无关 |
| host/ | apiproxy、webserver、frontend-static、directory-picker/-native/-browse/-auto、plugin-inventory | Web 宿主半边：API 网关 + HTTP 路由载体 + SPA 伺服（`packages/host/README.md:7-17`） | 改造 | UI 侧（carbon sidecar 接入点在 webserver/apiproxy） |
| client/ | web、modules、connection、runtime、hmr、locale、ui-renderer、ui-slots、ui-theme、ui-primitives、ui-attachment、ui-layout、ui-sidebar、ui-brand-official、ui-workspace、ui-conversation、ui-tool、ui-cordis、ui-workflow-run、ui-goal、ui-trajectory、ui-commands、ui-input-trigger、ui-skill、ui-reference、ui-subagent、ui-jobs、ui-model-selection、ui-permission-presets、ui-plan、ui-settings-plugins、ui-settings-plugin-inventory、ui-user-questions、ui-agent-preset、ui-settings、ui-settings-general、ui-settings-models、ui-kb、ui-assets、ui-connectors、ui-kg、ui-business、ui-mobile、ui-mobile-preview、ui-view-context、ui-message-feedback、ui-deliverables（约 47 包） | 浏览器半边：壳/连线/对象层/slot 体系 + 全部 ui-* 特性插件（`packages/client/README.md:7-45`） | 改造 | UI 侧（tab 插件化已就绪，W24 改侧边栏导航 + 替换业务 tab） |
| kb/ | kb、kb-sqlite、kb-embed-minimax、kb-embed-dashscope、kb-embed-shared、kb-graph、kb-graph-sqlite、kg-build、tool-kb（9 包） | KB 文档缝 + SQLite 存储 + 双嵌入提供方 + KG 缝/存储/构建管线 + kb/kg 工具行 | 保留 | KB 侧 + 图谱侧（§4 详述） |
| lakehouse/ | lakehouse、lakehouse-duckdb、lakehouse-sqlite-catalog、tool-lakehouse（4 包） | 湖仓缝 + DuckDB 引擎 + SQLite 目录 + 工具行 | 保留 | 湖仓侧（§4） |
| connector/ | connector、connector-file、connector-nocobase、tool-connector、tool-nocobase（5 包） | 连接器缝（数据发现/预览/落湖）+ NocoBase REST 提供方 + nb_* 工具 | 改造 | 业务侧（connector-nocobase/tool-nocobase 换 carbon 实现即可，缝不动） |
| expert/ | expert-orders、expert-pdf | 专家下单交付管线 + PDF 排版 | 保留（重接 carbon） | 业务侧（订单域） |

注：`packages/README.md:11-60` 的组表未登记 kb/、lakehouse/、connector/、expert/、mcp/、runtime-diagnostics/ 六组（后加组）；`packages/connector/README.md`、`packages/expert/README.md` 不存在（实测 ENOENT）。

## 2. Web UI tab 与导航现状（重点）

### 2.1 布局骨架：三栏 + 折叠 rail

`packages/client/ui-layout/src/client/columns.ts:17-39` 冻结的几何契约：sidebar 264–420px（默认 280）、**折叠 rail 56px**（`SIDEBAR_COLLAPSED`，24px 图标列 + 16px 边距）、视口 <1024px 自动折叠（`SIDEBAR_AUTO_COLLAPSE`）；details 300–520px（默认 360）；center 下限 640。让步链：center 优先保底 → 压缩 details → 自动关 details；**sidebar 永不让步**（`columns.ts:62-77`）。跨插件面板动作面 `ctx.layout`（toggleSidebar/openDetails/closeDetails）在 `packages/client/ui-layout/src/client/service.ts:23-30`。

结论：当前已存在「左侧 rail」，但它是**折叠状态的会话侧栏**（rail 上有「Search sessions」按钮，见 `apps/web/tests/rail-search-expand.e2e.ts:44-56`），不是豆包式主导航菜单。W24 的侧边栏菜单要么改造 `ui-sidebar` 的折叠态，要么新增主导航 slot。

### 2.2 tab 注册挂载机制：conversation.view slot

唯一组合通道是 slot 体系（`packages/client/AGENTS.md:11-12`：「a plugin composes UI only through `ctx.slots.register`」）。会话体内的 tab 环 = `conversation.view` slot 的座位（order 排序），完整座位表（全部实测注册点）：

| order | id | 注册位置 | 页面内容 |
|---|---|---|---|
| 0 | chat | `packages/client/ui-conversation/src/client/apply.ts:402-405` | 对话视图（ChatView，持有 Node 渲染槽） |
| 0.5 | view-context | `packages/client/ui-view-context/src/client/index.ts:131-132` | tab 感知上下文（视图状态上报/注入） |
| 10 | kb | `packages/client/ui-kb/src/client/index.ts:239-242` | 知识库工作台（检索/引用/入库向导） |
| 10.5 | scenarios | `packages/client/ui-kb/src/client/index.ts:194-197` | 场景门户 + 经营概览首页（KPI 带） |
| 11 | market | `packages/client/ui-assets/src/client/index.ts:127-130` | 数据资产市场（门户/目录/详情/下单卡） |
| 12 | connectors | `packages/client/ui-connectors/src/client/index.ts:120-123` | 连接器页（数据源目录/交付跟踪） |
| 13 | kg | `packages/client/ui-kg/src/client/index.ts:318-321` | 图谱页（sigma 画布 + KG 工作台） |
| 14 | business | `packages/client/ui-business/src/client/index.ts:130-133` | 业务管理页（对象切换器/实体卡流/NocoBase 外链） |
| 15 | trajectory | `packages/client/ui-trajectory/src/client/index.ts:43-49` | 轨迹视图（闭合 tab 环，注释引 plans/nocobase-native-integration/02-design.md §1.1） |
| 16 | mobile-preview | `packages/client/ui-mobile-preview/src/client/index.ts:47-50` | 移动端预览（390×844 手机壳内嵌 /mobile） |

外部插件用 `ctx.slots.inject('conversation.view', ...)` 等待声明后贡献（`packages/client/AGENTS.md:139`）；tab 标题走 locale thunk（切换语言即时变，`ui-trajectory/src/client/index.ts:32-35`）。视图切换 `actions.setView(view)`，kg 深链支持 seeds 经 view-context pending 通道（`ui-conversation/src/client/apply.ts:434-446`）。

### 2.3 侧边栏现状（W24 侧边栏菜单的挂载点）

已存在的 sidebar slot：`sidebar.brand.mark`/`sidebar.brand.name`（品牌，`ui-brand-official/src/client/index.ts:18-21`）、`sidebar.workspaces`（工作区/会话树，`ui-workspace/src/client/index.ts:114-116`，中文「会话」见 `ui-workspace/src/client/locales.ts:12-14`）、`sidebar.settings`（设置入口，`ui-settings-general/src/client/index.ts:141-143`）、`sidebar.footer.action`（**底部功能入口带，已是五源页面的侧栏入口**）：kb=5（`ui-kb/src/client/index.ts:173-176`）、market=6（`ui-assets:115-118`）、connectors=7（`ui-connectors:108-111`）、kg=8（`ui-kg:306-309`）、business=9（`ui-business:118-121`）。设置内页 = `settings.section`：general=0（`ui-settings-general:171-173`）、language=0（`locale/src/client/index.ts:428-430`）、models=10（`ui-settings-models:123-125`）、appearance=10（`ui-theme:410-412`）、Loader 清单 tab=10（`ui-settings-plugin-inventory:41-43`）、plugins=15（`ui-settings-plugins:126-128`）、agent-presets=20（`ui-agent-preset:254-256`）、kb=20（`ui-kb:328-331`）。

### 2.4 e2e 测试覆盖的页面（apps/web/tests/）

`navigation-panes.e2e.ts`（会话搜索面板 + 轨迹 tab，快照 `tests/snapshots/navigation-panes/{search-results,trajectory}.expected.md`）、`rail-search-expand.e2e.ts`（rail 点击展开搜索的真实浏览器事件序）、`biz-navigator.snapshot.ts`（业务页对象导航）、`kg-graph-page.e2e.ts` + `kg-workbench-p2.e2e.ts`（图谱页/ KG 工作台第二阶段）、`market-pages.e2e.ts`、`overview-home.snapshot.ts`（scenarios 首页 KPI 带 + ★ 置顶，`overview-home.snapshot.ts:22-43` 证实「Scenarios」是 tab 环成员）、`source-trail.snapshot.ts`（跨源引用轨迹 chip）、`trajectory-virtualization.e2e.ts`、`settings-chrome.e2e.ts`、`sidebar-subagent-activity.e2e.ts`、`mobile-*.e2e.ts` 系列。

### 2.5 mobile 入口与桌面端关系

`apps/web/src/mobile.ts:1-13`：薄入口，全部实现住在 `@deepseek-ai/dsh-client-ui-mobile`；**不读 boot manifest，自包含 Vite bundle，同一网关 fetch /api**。四 Tab = home/agents/work/me（`ui-mobile/src/client/shell/MobileShell.tsx:41`），十路由闭集 `home|chats|chat|work|me|tasks|files|agents|login|todos|docs|alerts`（`ui-mobile/src/client/router.ts:19-21`）。`/mobile` 由 web-runtime `mobileEnabled` 伺服（`examples/kb-agent/cordis.patch.yml:468-479`）；PC 侧 mobile-preview tab 内嵌同源 /mobile iframe（`packages/bundle/web-app/cordis.patch.yml:235-239`）。移动端登录走 `nocobase.signIn`（→ W24 需换 carbon 身份面）。

### 2.6 「会话」「轨迹」两个保留对象

会话 = `ui-workspace`（侧栏会话树）+ `ui-conversation`（chat tab：`ConversationRoot.tsx:36-89` 消费 activeView、composer、审批面板 `apply.ts:397`）；轨迹 = `ui-trajectory`（`TrajectoryView.tsx:122-143` 读 `snapshot.views.get('trajectory')`；8 类节点定义 trajectory-{message,request-header,assistant-step,tool-call,compaction,session-end,turn-end,input-message} + `TrajectoryTable.tsx:217` 详情三 tab）。两者都只通过 `conversation.view` slot 挂载——改侧边栏导航不需要动它们的内部实现（详见 §6）。

## 3. examples/kb-agent 现状

### 3.1 cordis.patch.yml 逐条（501 行全读，`examples/kb-agent/cordis.patch.yml`）

**disable（19 行 + 注释说明）**：llm-pi-ai（与 llm-minimax 的 minimax 声明冲突，:22-23）、tool-bash/tool-pwsh/tool-jobs/tool-fs/tool-fs-search/tool-str-replace-editor/skill-filesystem/tool-skill/tool-goal/tool-ralph/tool-subagent-control/tool-subagent-list-agents/tool-subagent/tool-subagent-fork/workflow-worker-thread/tool-workflow/tool-todo/tool-web（:25-77，检索-only 组合，会话基础设施保留）。

**改 config**：
- `agent-default-model` → provider minimax / MiniMax-M3（:79-82）
- `system-prompt` persona：五源路由总纲——业务行 nb_collections→nb_list/nb_get、文档 kb_search 带 [n] 引用、数值 lakehouse_tables→lakehouse_query、数据集 connector_discover/fetch/transfer、图谱 kg_schema→kg_subgraph；不可抗力问题强制三步链（kg_subgraph → nb_list expert_services → nb_list experts）；下单走 connector_discover→order_create；改数据走 nb_get→预览 diff→确认→nb_create/nb_update（:84-132）
- `api-gateway`：kbTenant=demo-food-co、kbWriteEnabled、dataUploadEnabled、visionDescribeEnabled（MiniMax VLM）、ordersEnabled、nocobaseEnabled、nocobaseWriteEnabled、alertEngineUrl(127.0.0.1:13110)、nocobaseWflWriteScopes={}（wfl 表拒直写）、nocobaseCollectionScopes（八角色集合白名单 :415-439）、assetsEnabled、lakehouseOverviewPath(kpis.json)、assetsSeedPath(market/seed.json)、connectorsEnabled、kgEnabled、kgTenant（:372-455）
- `webserver`：host/port 3080 + **nocobaseProxyOrigin = NOCOBASE_BASE_URL ?? 127.0.0.1:13000**（:462-466）
- `web-runtime`：mobileEnabled: true（:473-479）
- `agent-presets`：default=enterprise-data-assistant，roots = examples/kb-agent/agent-presets + scenarios/（30 场景零复制可达，:493-500）

**insert（25 行）**：llm-minimax；kb（minRelevanceScore 0.015 校准值 :146）；web-fetch-http；kb-sqlite（workspace/kb.sqlite :154）；kb-embed-minimax；tool-kb（tenant + kgEdit:true :159-166）；kb-graph（缝）；kb-graph-sqlite（workspace/kg-graph.sqlite :178）；kg-build（mappingsFile=kg-mappings.yml、corpus root/manifestFile/maxDocuments 60/maxChunks 4、extract= instruct-kgc 协议 + shaclGate、crossSourceAlign v2 :187-221）；lakehouse（dataRoot=workspace/lakehouse）；lakehouse-sqlite-catalog（workspace/lakehouse-catalog.sqlite）；lakehouse-duckdb；tool-lakehouse；connector；connector-file（workspace/data/connector-files）；connector-nocobase；tool-connector（orderCreateTimeoutMs 180000）；tool-nocobase；tool-present-card（**17 表 formCollections 中文标签 + 5 高频表必填字段地板** :293-337）；view-context；tool-view-actions；expert-orders（tenant、deliverablesDir、draftMaxTokens 16384、draftTimeoutMs 120000 :355-365）。

### 3.2 当前 web --patch 跑起来的服务形态（QUICKSTART 佐证）

单进程 dsh web @ **:3080**（API gateway /api + SPA dist + /plugins/*/client.js + /mobile + /nocobase 反代），伴随两个外部进程：**NocoBase dev-server @ :13000**（同端口 UI + /api/*）与 **approval-engine @ :13110**（/designer React Flow 画布、/terminals/cards.html 车间终端、/insp/* 检验、/crm/*、/fin/*、预警扫描、夜间链），可选 **ai-proxy @ :13100**（PDF 附件解析 + think 过滤，`QUICKSTART.zh.md:141`、`:154`）。LLM 数据面：对话 MiniMax-M3 + 嵌入 embo-01（同一 MINIMAX_API_KEY）；数据面：SQLite ×3（kb / kg-graph / lakehouse-catalog）+ Parquet 湖 + NocoBase PG。

## 4. kb / lakehouse / kg 现有资产（W24 可回收性核心）

### 4.1 KB 侧（可回收度：高，基本原样）

- **seam**：`packages/kb/kb`（chunker 结构感知 Markdown 切分 / RRF 融合 / 混合检索，`docs/subsystems/kb.zh.md:5-9`）。
- **存储**：`packages/kb/kb-sqlite` —— 单 `node:sqlite` 库，FTS5 trigram 全文 + BLOB 向量 JS 扫描（`docs/subsystems/kb.zh.md:117`），schema 在 `kb-sqlite/resources/sql/schema.sql`（application id 锚定 + SCHEMA_VERSION 单调，无兼容承诺）。
- **嵌入**：kb-embed-minimax（embo-01，1536 维）+ kb-embed-dashscope（text-embedding-v4，1024 维）+ kb-embed-shared；缺 key 降级 text-only 模式可观测。
- **工具行**：`packages/kb/tool-kb/src/`——ingest.ts（md/txt/pdf/docx 经 unpdf/mammoth）、ingest-url.ts（SSRF 门）、search.ts（[n] 引用）、stats.ts、kg.ts/kg-query.ts/kg-edit.ts/kg 的 graph.ts（`tool-kb/src/` 目录实测）。
- 数据量级：46 篇语料 / 14 目录（kb-corpus.yml 单一真源，`QUICKSTART.zh.md:386`）；120 题评测混合 Top5 98.3%（`:442`）。

### 4.2 湖仓侧（可回收度：高，carbon 落数正好接上）

- **架构**（`docs/subsystems/lakehouse.zh.md:5-9`）：`ctx.lakehouse` = catalog/engine 双 provider 注册表 + load/query 编排；`(tenantId, tableName)` 身份，load 写 Parquet + 登记 catalog；query 只暴露本租户表、maxRows 截断；每租户用量计数。
- **实现**：catalog = `packages/lakehouse/lakehouse-sqlite-catalog`（SCHEMA_VERSION=1、application id "DSHL"、传输轨迹 + 用量表，`resources/sql/schema.sql`）；引擎 = `packages/lakehouse/lakehouse-duckdb`（官方 `@duckdb/node-api` prebuilt，进程内 DuckDB 查 Parquet/CSV，原生模块缺失降级 LAKEHOUSE_ENGINE_UNAVAILABLE，`docs/subsystems/lakehouse.zh.md:97-98`）；工具行 `tool-lakehouse`（lakehouse_tables / lakehouse_query）。
- **业务→湖仓同步现状（W24 要求 4 的雏形）**：`examples/kb-agent/scripts/w6b1-lakehouse-transfer.mts:24-32` 定义 13 张源表（pur/so/wms/qm/mfg/hub_inv/crm_payments），经 REST 分页（pageSize 200，`:54-60`）全量替换落 `nb_<collection>` Parquet 快照，夜间链/POST /run-nightly 调度，幂等（`:1-9` 头注释）。**这是「业务系统数据自动同步进湖仓」的现行机制，carbon 侧换 REST 端点即可复用整条链**。
- 数据量级线索：3 张种子表（原辅料价格/进出口/冷链运价）+ 13 张 nb_* 快照 + kpis.json 经营概览 SQL 定义（`QUICKSTART.zh.md:445`）。

### 4.3 图谱/本体侧（可回收度：高；「都没完善」判定过重——工作台/回滚/审核已在，缺的是规模质量）

- **seam**：`packages/kb/kb-graph`（`ctx.kbGraph`）——本体 **registry v5**（约束四元组 + naturalKey + FoodOn 锚点 foodonUri/foodonId/synonyms，来源五类 builtin-ontology/builtin-food/foodon-imported/nocobase-derived/agent-defined，draft/deprecated 状态门，`kb-graph/README.md:7-9`）；纯算法层 kgcl.ts（实例+模式级操作词表）、shacl.ts（registry→shapes 编译 + 解释性反馈）、kg-nl.ts（L0 短语→游走计划）、ppr.ts（L1.5 Personalized PageRank）、louvain.ts（确定性社区检测）（`kb-graph/README.md:11-17`）；时间账本 episode/expireEdges/snapshotAt(t)/共指 reject 墓碑/FoodOn xref 通道（`:19-27`）。
- **存储**：`packages/kb/kb-graph-sqlite`（v2 store，37 个 SQL 资源文件实测于 `resources/sql/`：episode/ontology-revision/tombstone/xref/snapshot-edges/two-hop-pairs 等）。
- **构建管线**：`packages/kb/kg-build/src/`（extract 闭集抽取、align 对齐、crossSource 跨源、foodon-import、incremental scope 快照指纹增量、quality、mappings、corpus-manifest）。映射真源 `examples/kb-agent/kg-mappings.yml:10-41`：当前仅 5 collections（experts/expert_services/datasets/customs_export/orders）+ R10/R11/R12 规则——**业务表进图谱的映射面很窄，这是「不完善」的真实短板**（W4 十七表、13 湖仓表、49 PG 表都未进图）。
- **可视化**：ui-kg 用 sigma.js + graphology + force-atlas2，动态加载不进主包、无 WebGL 降级为关系清单（`QUICKSTART.zh.md:375`）；KG 工作台（本体树 KGCL 编辑/变更流 episode/回滚/共指审核队列，`:376`）。
- **图规模与质量**（2026-09-17 审计，`research/2026-09-17-ontology-kg-ai-deep-research.md:94`）：1159 节点 / 855 边（853 live）/ 163 共指边；**islands=343（孤岛是最大痛点）**、conflicts=5、coverage=49.7%。
- **调研报告核心结论与落地对照**（同文件 `:55-98`）：结论 1——7 个候选框架整包引入全部不可行（Python/JVM 栈冲突），架构借鉴可行；结论 2——推荐方案 A「纯 TS 自研增强」；结论 3——FoodOn 裁剪子树 + 单继承化（CC-BY-4.0 无障碍）；结论 4——四能力答案（registry v5/KGCL、Instruct-KGC JSON 协议 + SHACL 环、双视图编辑、episode 化改图 + bi-temporal）；结论 6——Kuzu 已归档勿用。**落地度**：instruct-kgc + shaclGate 已在 kg-build config（cordis.patch.yml:208-216）、episode/回滚/共指审核已在 KG 工作台、FoodOn 锚点已进 registry v5（kb-graph/README.md:7-9）、跨源灰区 LLM 裁决 v2 已开（:217-221）——**约七成落地，未落地的是映射广度、图质量（343 孤岛）与 PPR/社区检索的产品化**。

## 5. platform/nocobase 退役面

### 5.1 规模与性质

- 上游 NocoBase **2.2.6 源码快照**（非 submodule，rsync 并入），**约 14,031 文件**（`platform/nocobase/MANIFEST.md:6-29`）；许可 = Apache-2.0 + NocoBase 补充条款（§5.2 品牌位、§5.4 SaaS 禁令）；**NocoBase 代码永不进入 dsh-* 发布包**（`:62-63`，publication-payload 拒绝规则）。
- `platform/nocobase-portals/demo-portal-hub`：**自有 fork 应用模板**（CRM/Hub Portal 的 vite 源码，品牌已源码级替换为 DSH，`QUICKSTART.zh.md:145`），不是上游快照。

### 5.2 业务数据在哪

- PG：`DB_DIALECT=postgres / DB_HOST=localhost:5432 / DB_DATABASE=nocobase / DB_USER=nocobase`（`platform/nocobase/.env.example:49-55`）。库名 `nocobase`；reset 即 drop 重建（`QUICKSTART.zh.md:159`）。
- 表清单线索：**49 张 hub_*/crm_* 业务表**（`QUICKSTART.zh.md:140`）+ 专家域 5 collections（experts/expert_services/datasets/customs_export/orders，`:127`）+ 审批引擎 wfl_* 五表 + wfl_mobile_work/alert_rules/kpi_snapshots 等（`:183`、`:252`）+ users（13 行演示）。管理后台 :13000，账号 admin@nocobase.com/admin123（`:129`）；移动端八角色账号（`:326-335`）。
- 播种链：`setup-nocobase.mts`（install→build→start→init→collections→workflow→key）+ `setup-dsh-data.mts`（connector-files/专家名册 32 人/市场 63 资产/订单 24 条/湖仓三表/KG 构建/KB 46 篇）+ 五个 seed-*.mts（`QUICKSTART.zh.md:386-394`）。

### 5.3 仓库内引用点全景

| 类别 | 位置 |
|---|---|
| 包依赖 | `packages/connector/connector-nocobase`（REST client）、`packages/connector/tool-nocobase`（nb_* 工具）、`packages/expert/expert-orders`（dep :36）、`packages/kb/kg-build`（dep :33）、`packages/host/apiproxy`（dep :55）、`packages/host/webserver`（/nocobase 代理） |
| 网关域 | `packages/host/apiproxy/src/api/nocobase.ts` + rpc-map 8 方法：listMeta/list/get/update/alertAct/signIn/mobileWorkSave/mobileWorkDelete（`rpc-map.ts:102-109`） |
| 反向代理 | `packages/host/webserver/src/nocobase-proxy.ts`（/nocobase 前缀、HTML/manifest 重写、/nocobase/ws upgrade、crm/hub portal SPA fallback `:99-102`）+ 注册于 `webserver/src/index.ts:111-142` |
| UI | ui-business（business tab + 外链入口）、ui-mobile（signIn/docs 单据浏览/alerts） |
| patch | `examples/kb-agent/cordis.patch.yml`（NOCOBASE_BASE_URL/API_KEY 链 :246-280、:466） |
| 脚本 | examples/kb-agent/scripts 约 110 个中 nocobase-*.mts 28 个 + w*/w4-r1/w5*/w6*/w7* 系约 60 个（多数直连 PG/REST），实测目录清单 |
| 测试 | examples/kb-agent/tests（nocobase-track.e2e/nocobase-business.e2e/market-track.e2e/nocobase-tools.spec）+ apps/web/tests（biz-navigator/business 相关） |
| 文档 | QUICKSTART/DEPLOY/WEBSITE + research/2026-09-06-nocobase-integration + 各 W 轮 research |
| 门禁 | **lefthook lint 与 whitespace 均排除 platform/**（`lefthook.yml:24`、`:43`）；doc-sync 不触及 platform；发布拒绝规则在 scripts/publication-payload.ts |

### 5.4 拆除顺序建议（先冻结数据，后拆引用，最后删树）

1. **先停服务**（dsh web 网关进程持有已删库 inode 的教训，`QUICKSTART.zh.md:159`——顺序：停 dsh web → 停 nocobase）。
2. **冻结并导出数据**（趁 PG 与 REST 还活着）：泛化 `w6b1-lakehouse-transfer.mts` 为全表导出（清单从 13 张扩到 49+5+wfl 全集），落 Parquet/JSON；专家域真源已在 `workspace/data/experts/*.json`（dataset.json / roster-batch5.json）与 `workspace/data/market/assets-batch5.json`；`pg_dump -d nocobase` 兜底归档。
3. **替换运行时引用**（等价面替换，缝不动）：connector-nocobase→connector-carbon（同 seam）、tool-nocobase→tool-carbon（nb_* 语义映射）、apiproxy nocobase 域→carbon 域（8 方法）、webserver nocobaseProxyOrigin→carbon 代理、ui-business/ui-mobile 数据源换域。
4. **kg-build 映射迁移**：kg-mappings.yml sources[].system 闭集目前仅 "nocobase"（`kg-mappings.yml:5`）——扩 "carbon" 或改中性 system 名。
5. **删 examples/kb-agent 的 nocobase 脚本与 patch 段**、retire e2e（nocobase-track/business/market-track 或改造）。
6. **最后删 platform/ 整树 + platform/nocobase-portals**，更新 MANIFEST/AGENTS 布局图/组表/QUICKSTART 文档。

### 5.5 老业务数据导出路径（面向 carbon 初始化灌数）

- **首选**：复用 `ctx.lakehouse.load` seam——`w6b1-lakehouse-transfer.mts` 已证明 REST 分页→TabularData→Parquet 幂等全量替换链路；carbon 上线时同链路反向灌入（Parquet→carbon bulk API）。
- **身份/账号迁移**：八角色账号密码在 `QUICKSTART.zh.md:326-335`（w5b8-closure.mts 幂等重种，可改写为 carbon 播种）。
- **审批流资产**：wfl_* 五表 + alert_rules 转移表可直接 DDL/DML 导出（引擎在 approval-engine.mts :13110，独立于 NocoBase UI）。

## 6. 会话/轨迹保留面（与 tab 容器的耦合度）

- 实现：会话=core/session（事件日志，`docs/architecture.md:45`）+ packages/session 11 包（持久化/投影/标题）+ client 侧 ui-workspace（侧栏树）与 ui-conversation（chat tab）；轨迹=ui-trajectory 一包全含。
- 耦合点仅有三处，全部是 slot 边界：① 注册 `conversation.view`（ui-conversation 是 slot 声明者，其余 inject）；② `ctx.layout` 面板动作（service.ts:23-30，仅 toggle/open/close）；③ view-context 的 setView/requestView 深链（apply.ts:430-446）。
- 结论：**改左侧边栏菜单不动这两包内部**——「会话」「轨迹」保留 tab 级 = 保留 conversation.view 环内两座位即可；侧边栏菜单是新导航层（sidebar.footer.action 已示范插件贡献入口的模式），二者的衔接点只是「菜单项点击 → actions.setView('chat'/'trajectory') 或切会话」。

## 7. 新增一个包的完整成本清单（W24 新包群定量）

> 本任务只读无 git 工具；以官方 checklist + 近期样本（ui-business，J/W 轮新增，`packages/client/ui-business/package.json`）交叉验证。两套流程：

### 7.1 通用（host/能力）包 —— `docs/cookbook/adding-a-package.md:7-118`

1. 目录 `packages/<group>/<pkg>/`：package.json（不变量 enforced by check-workspace-constraints：private/version=根/type:module/main/types/exports/cordis 双声明 peer+dev/files 白名单，`:25`）、tsconfig.json（extends base + references 每 dsh 依赖，`:12-15`）、src/index.ts、src/invariant.ts、README.md（API/事件/扩展点 + **Model Experience 三段式** + **Known Limitations**，`:73-107`）。
2. 根配置：tsconfig.host/client.json references 一行（普通包只属一个 aggregate，`:34`）；knip.json 仅特殊入口；**workspace/oxlint/publint/tsdown/constraints 均自动发现，零编辑**（`:39`）。
3. 拓扑命名规则表（Controller/Store/Registry/Runtime/…，`:51-69`）；能力缝三件套拆分判据（`:43`）。
4. 验证：pnpm install → doc-sync → constraints+typecheck+lint → build+hygiene（`:109-116`）。

### 7.2 client 插件包 —— `packages/client/AGENTS.md:132-141`

1. 骨架：package.json（exports `./`/`./invariant`/`./client`/`./src/*`/`./package.json` + **dsh.client manifest（platform:'web'、inject 信息边）** + files 含 lib/client.js；样本 `ui-business/package.json:16-44`）、tsconfig（extends tsconfig.base.client.json + 每 workspace 依赖一个 references）、tsdown.config.ts（clientBundle 预设）、src/index.ts（空 node 半）、src/invariant.ts、src/client/。
2. **三注册面缺一不可**（`:137`）：① `tsconfig.client.json` aggregate references；② `packages/bundle/web-app/cordis.patch.yml` 加 dsh.client 行；③ `packages/bundle/web-app/package.json` 依赖行（profile 启动经 healed node_modules 解析裸名）。
3. dsh.client 语义（`:138`）：inject 仅信息性；external 请求序列化模块供给。slot 注册用 `ctx.slots.inject`（`:139`）。
4. 改后必 `pnpm --filter <pkg> bundle` 再探测 live server（`:140`）；**新增/删除 dsh.client 包必须重启 dsh web**（模块表启动时扫描，`QUICKSTART.zh.md:345`）。
5. 测试面：per-file 100% coverage gate + jsdom pragma + `pnpm run test:gui`（内环）+ 组装输出变化加 `DSH_SNAPSHOT=replay pnpm run test:web`（`packages/client/AGENTS.md:122-128`）。

### 7.3 全仓约定（每包都受约束，根 AGENTS.md）

ctx.effect/ctx.on 注册即效果；能力缝三件套完整；模型可见⟺落日志（SessionEventMap）；无硬编码可调参数（Config 字段化）；非平凡变更同 PR 附 Agent Note；双语文档预算；一物理行一段落。

### 7.4 「W24 加 10~15 个新包」流程模板

| 批次 | 内容 | 动作 |
|---|---|---|
| B1 | carbon 接入群：connector-carbon、tool-carbon、（可选）carbon-sidecar-provider | 走 7.1；先立 seam 消费者契约再接实现 |
| B2 | UI 侧边栏群：ui-nav（主导航 slot 声明者）、ui-carbon-*（业务页替换 ui-business 数据面） | 走 7.2 三注册面；bundle 后重启 web |
| B3 | 数据同步群：sync-carbon→lakehouse（w6b1 泛化为包）、kg 映射扩展（kg-mappings v2） | 7.1；Config 化表清单 |
| B4 | 图谱完善群：kg-quality（孤岛收敛）、kg-retrieval（PPR/louvain 产品化） | 7.1；落 Agent Note |
| 每包固定开销 | README 双段式 + invariant + tests + coverage 100% + doc-sync 再生成 | doc-sync 是全仓门禁（module-graph/cordis-catalog 自动再生成，勿手编） |

## 8. 网关与服务拼装现状（carbon sidecar 接入面）

- **分层**（`docs/api-gateway.zh.md:158-164`）：`api/`（Typert Remote：严格生成契约，POST /api/\<ns\>/\<method\>，`:121`）→ 未认领 endpoint 回退 **host/apiproxy**（`packages/host/apiproxy/src/api/rpc-map.ts:32-135`：session/workspace/goals/kb(5)/kg(14)/nocobase(8)/data(3)/orders(4)/assets(3)/lakehouse.overview/connectors(3)/settings/credentials/llm/subagents/skills/agentPreset/host）→ **client/connection** 拥有 RPC carrier/信任边界/SSE（`/api` HTTP bridge）→ **host/webserver** 路由载体。
- **webserver 路由注册 API**（`packages/host/webserver/src/index.ts:161-213`）：`register({kind:'exact'|'prefix', path, handler})`（重复 (kind,path) 抛错）+ `registerUpgrade`（ws）+ `registerFallback`（SPA dist 独占座位）+ `tapIndex`（HTML 变换）；**匹配规则最长前缀优先**（`:115-117` 注释）。
- **/nocobase 代理实现**（carbon 的现成模板，`packages/host/webserver/src/nocobase-proxy.ts`）：前缀剥离（`/nocobase/api/x`→`/api/x`，`:197-199`）、响应 HTML 重写（`__webpack_public_path__`/`__nocobase_api_base_url__`/`__nocobase_ws_path__`/portal base 注入，测试断言 `tests/nocobase-proxy.spec.ts:112-134`）、插件 manifest URL 重写（`:145-162`）、ws upgrade（`:148`）、portal SPA fallback（crm/hub 前缀 `:99-102`，HEAD/POST 404、301 补斜杠，spec `:218-262`）、剥离 x-frame-options/CSP framing 守卫（spec 头注释）。配置门：`nocobaseProxyOrigin` 未设则整组路由不注册（`index.ts:111-142`）。
- **carbon sidecar 接法**：a) 反代路由——`register({kind:'prefix', path:'/carbon', handler})` 复刻 proxy 模式（若 carbon 是 SPA 需 HTML 重写，纯 API 则更简）；b) 网关域——apiproxy 新增 carbon.ts + rpc-map 行（对标 nocobase 域 8 方法），凭据走 credentials 包 env 链（NOCOBASE_* 同款）；c) 长连接——registerUpgrade 预留。web-app bundle 已示范「bundle 行声明 + patch config 替换整对象」的拼装模式（`packages/bundle/web-app/cordis.patch.yml:108-119`）。

## 附录 A：可回收资产清单（W24 直接复用）

| 资产 | 位置 | 回收方式 |
|---|---|---|
| KB 全缝（检索/嵌入/存储/工具） | packages/kb 9 包 | 原样；carbon 时代继续做文档源 |
| 湖仓全缝 + 业务同步链 | packages/lakehouse 4 包 + w6b1-lakehouse-transfer.mts | 原样；同步源换 carbon |
| KG seam（registry v5/KGCL/SHACL/PPR/louvain/episode） | packages/kb/kb-graph + kb-graph-sqlite | 原样；W24 加映射广度与质量收敛 |
| KG 构建管线 + 映射框架 | packages/kb/kg-build + kg-mappings.yml | 框架原样；sources[].system 扩 carbon |
| 连接器缝 | packages/connector/connector + tool-connector | 原样；新 provider 挂 seam |
| 工具行协议（present-card 17 表、expert-orders 交付） | tool-present-card / expert-orders | 配置面随 carbon 表结构改写 |
| tab 插件化机制 | conversation.view + sidebar.footer.action slot 体系 | 侧边栏菜单照此模式注册 |
| 三栏布局 + rail 几何 | ui-layout columns.ts | 布局层保留，导航语义重构 |
| /nocobase 反代全套 | webserver/nocobase-proxy.ts | 复刻为 /carbon 代理 |
| 五源 persona 路由总纲 | cordis.patch.yml:84-132 | 术语替换后沿用 |
| 场景门户/预设根机制 | examples/kb-agent/scenarios + agent-presets config | 原样 |
| 移动端四 Tab 壳 + 路由 | packages/client/ui-mobile | 保留；signIn 换 carbon 身份 |
| 会话/轨迹 | ui-workspace/ui-conversation/ui-trajectory + session 11 包 | 原样保留 |
| 评测资产 | eval/questions.json（120 题）+ 脚本 | 原样复跑 |
| 数据真源（不依赖 NocoBase） | workspace/data/{experts,market,overview,export-risk,connector-files} | 直接进 carbon 播种 |

## 附录 B：nocobase 退役拆除清单（含引用点全景）

拆除物：platform/nocobase（14,031 文件）、platform/nocobase-portals、connector-nocobase + tool-nocobase 两包、apiproxy nocobase 域（nocobase.ts + rpc-map 8 行 + schema + handler/client 引用 `fetch/handler.ts:75`、`fetch/client.ts:74`）、webserver nocobase-proxy + NOCOBASE_PORTAL_PREFIXES + 测试 nocobase-proxy.spec.ts、ui-business 数据面（nocobase.listMeta/list）、ui-mobile signIn/docs/alerts 数据腿、expert-orders 与 kg-build 的 connector-nocobase 依赖、cordis.patch.yml nocobase 段（NOCOBASE_* env、proxyOrigin、collectionScopes、wflWriteScopes、alertEngineUrl 保留与否随引擎去留）、scripts 28+60 个、e2e 三个 + tools spec、QUICKSTART/DEPLOY/WEBSITE 大部、QUICKSTART 截图目录 demos/（保留作历史证据或删）。前置：先导出数据（附录 §5.4/5.5），再按「停服务→导数据→换运行时引用→删脚本→删树→清文档」顺序。

## 附录 C：新包成本模板（速查卡）

通用包 8 步：目录四件套 → tsconfig references → aggregate references 一行 → README 双段式 → tests+coverage → Agent Note → doc-sync → build+hygiene。client 包 +4 步：dsh.client manifest → web-app patch 行 → web-app package.json 依赖 → bundle+重启 web。固定全局成本：pnpm-workspace 零改动；oxlint/publint/tsdown/knip 自动发现；doc-sync 再生成四个目录文档；双语 pairing 门禁（lefthook.yml:7-11）。风险位：coverage per-file 100%（`packages/client/AGENTS.md:117`）、快照刷新需 DSH_SNAPSHOT=refresh 明示、模块表冻结（新增包不重启不生效）。

（完）
