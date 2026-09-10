# N8 批次详表：每批范围、步骤、setup 扩展点、验收锚点、回归与回滚

> 隶属 [PLAN.md](PLAN.md)。前提环境：PG17 :5432 运行（`pg_ctl -D /usr/local/var/postgresql@17 start`）、NocoBase :13000 可登录（admin@nocobase.com / admin123）、根 `.env` 有 `NOCOBASE_BASE_URL`/`NOCOBASE_API_KEY`/`MINIMAX_API_KEY`。外网操作先导出代理：`export http_proxy=socks5://127.0.0.1:1087 https_proxy=http://127.0.0.1:1087 ALL_PROXY=socks5://127.0.0.1:1080`。
>
> 每批动工第一步：`pg_dump -h localhost -U nocobase nocobase > /tmp/nocobase-batch-<N>-backup.sql`（PGPASSWORD=nocobase）；回滚 = stop → 恢复 dump → start。

---

## B1 插件全景启用（半天）

**目标**：快照内"源码在、未启用"的功能插件全部 enable，把功能面从 60 个启用插件补到 demo 等级。

**范围**（enable 清单，全部快照内置零网络）：

```
map comments data-visualization-echarts charts public-forms
notification-email departments localization graph-collection-manager
backup-restore field-china-region collection-fdw
```

试探性（enable 失败则从清单移除并在 PLAN §4 标注）：`audit-logs`、`ai-gigachat`（后者仅在需要 GigaChat 时留，默认不启用）。

**步骤**：

1. 在 [`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) 新增 `stepPlugins`：
   - 复用既有 [`signIn()`](../../../examples/kb-agent/scripts/setup-nocobase.mts:131) 取 token；
   - 逐插件幂等：`GET /api/pm:get?filterByTk=<name>`（或 `pm:list` 过滤）已 enabled 则跳过，否则 `POST /api/pm:enable?filterByTk=<name>`；
   - 全部处理完后提示需重启（源码模式 dev-server 需重启加载 server 端）；
   - `main()` switch（L506-522 一带）加 `case 'plugins'`，`all` 链插入在 `init` 之后（collections 建表依赖已启用插件的场景不受影响，插件启用不删既有表）。
2. 执行 `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts plugins`，然后 `stop` + `start` 重启。
3. **重建判定**：重启后浏览器打开 :13000，检查"添加区块"里是否出现地图/评论/echarts 选项；若 UI 缺新插件组件（v2 客户端 chunk 未含），跑 `NOCOBASE_FORCE_BUILD=1 node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts build`（~20 分钟）后重启，并把该结论写进本批实录（后续批次复用）。
4. verify 扩展：`stepVerify` 追加断言 `GET /api/pm:list` 中上述清单全部 enabled（audit-logs 等试探项按实际结果断言）。

**验收锚点（浏览器）**：
- 插件管理页（设置 → 插件）上述清单全部显示已启用；
- 任意 collection 的"添加区块"菜单出现"评论/地图/图表"类区块；数据可视化区块渲染器含 echarts 选项。

**回归**：`node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify` EXIT=0；:3080 `/nocobase` iframe 反代仍可登录（插件清单重写规则复验——若 iframe 白屏先查 [`nocobase-proxy.ts`](../../../packages/host/webserver/src/nocobase-proxy.ts) 的 `rewriteNocobasePluginManifest` 覆盖新清单）。

**回滚**：`POST /api/pm:disable?filterByTk=<name>` 逐个回退 + 重启；或恢复 batch 备份 dump。

---

## B2 CRM 业务模块（1-1.5 天）

**目标**：admin 内复刻 demo 的 Customers + Orders 两模块：Leads 看板（7 阶段）、Customers、Contacts、Quotations、Orders、Payments、Invoices、Products + 两张 Dashboard。对照页面清单 [demo 实测 §3.1 模块 B/C](../../../research/2026-09-09-nocobase-official-demo-replication.md)。

**新脚本** `examples/kb-agent/scripts/nocobase-crm-modules.mts`（与 setup 同风格：`signIn` + `call/dataOf` + 存在即 kept）：

1. **collections**（对齐 demo-portal-crm 资源名）：`crm_leads`（name/company/stage 枚举 7 值 New lead/Contacted/Requirements confirmed/Proposal or quotation/Negotiation/Won/Lost/owner/expected_amount/expected_close_date）、`crm_customers`（name/type/industry/country/level/status）、`crm_contacts`（full_name/customer_id→crm_customers/job_title/email/phone/is_primary/status）、`crm_deals`（name/customer_id/deadline/amount/status/owner_id）、`crm_quotes`（quote_no/valid_until/customer_id/deal_id/total_amount/status 枚举 draft/sent/accepted/converted/void/rejected/pending_approval）、`crm_products`（name/category/pricing_mode/unit/base_price）、`crm_activities`（type/title/related customer/deal/due_at/status）、`crm_follow_ups`（customer_id/lead_id/note/next_at）。字段类型照 [setup 的 COLLECTIONS 声明模板](../../../examples/kb-agent/scripts/setup-nocobase.mts:59)（`POST /api/collections:create` 带 fields；同样刻意不声明 createdAt/updatedAt）。
   - 订单链路 Orders/Payments/Invoices 复用 `crm_deals`（订单）+ 新增 `crm_payments`、`crm_invoices`（对齐 demo 页面语义；demo-portal 前端不消费这三者，故命名自由，用 crm_ 前缀保组内一致）。
2. **种子数据**：每 collection ≥10 行真实感中文食品行业数据（客户=食品加工/贸易企业，产品=咨询服务 SKU，报价/订单金额分布接近 demo 观感），沿用 [`seed-experts.mts`](../../../examples/kb-agent/scripts/seed-experts.mts) 的 fixture 模式（JSON 放 `examples/kb-agent/workspace/data/crm/`）。
3. **菜单组**：`POST /api/desktopRoutes:create` 建"CRM 客户"与"销售流程"两个菜单组（icon 用 lucide 名），子项挂各页面。
4. **页面（双轨）**：
   - 程序化打底：每实体一页表格区块（REST `uiSchemas:create` 或浏览器 UI 配置器逐页建——实施时先试 REST 程序化，若 uiSchemas 程序化组装成本过高，转为浏览器手工并把每页操作录进验收实录）；
   - 浏览器手工精修：Leads 页看板视图（按 stage 分组 7 列）、Customers/Orders Dashboard（统计卡+data-visualization 图表）、Quotations 表格聚合统计。
5. setup 链挂接：`stepInit` 后追加调用（新命令 `crm`，或并进 `init`——推荐独立命令保持批次可单独重放）。

**验收锚点（浏览器）**：CRM 菜单组 → Leads 页看板显示 7 列且有种子卡片拖拽可用；Quotations 页表格 ≥10 行含状态分布；Customers Dashboard 图表渲染（echarts）；新建报价单表单可提交。

**回归**：`GET /api/experts:list` 等 5 collections 不变；`demo-full-journey.mts` 场景 1/3/4 PASS（重点场景 3 订单审批链未被新 workflow 干扰）。

**回滚**：恢复 batch 备份 dump（crm_* 表与菜单组整体消失）。

---

## B3 企业 Hub 模块 + 工作台（1-1.5 天）

**目标**：复刻 demo 的 Projects/Tickets/Assets/HR/Settings + Workbench。对照 [demo 实测 §3.1 模块 A/D/E/F/G/H](../../../research/2026-09-09-nocobase-official-demo-replication.md)。

**新脚本** `examples/kb-agent/scripts/nocobase-hub-modules.mts`（模式同 B2）：

1. **collections**（对齐 demo-portal-hub 资源名）：`hub_pj_projects`（name/no/customer/owner/status/progress/priority/planned_end_date）、`hub_pj_tasks`（title/project_id/assignee_id/status/priority/due_at/plan_start/plan_end——甘特字段）、`hub_pj_milestones`、`hub_tk_tickets`（title/priority/customer/category/assignee/status/planned_resolve_at/is_overdue——status 含 waiting_customer/waiting_internal 等 8 态）、`hub_kb_articles`（title/category/status）、`hub_as_assets`（name/no/category/brand/status/vendor_id/purchase_date/warranty_until）、`hub_as_assignments`、`hub_as_maintenance`、`hub_hr_employees`（users 关联）、`hub_hr_departments`、`hub_hr_leave_requests`、`hub_as_vendors`、分类主数据 4 张（customer/ticket/asset/product categories）。种子：Projects/Tasks ≥15 行（甘特要有时间跨度数据），Tickets ≥20 行（覆盖多状态），其余 ≥5 行。
2. **Tasks 四视图页**（本批核心验收）：一个 hub_pj_tasks 页面配 4 个 tab——Kanban（status 分组）/ Calendar（due_at）/ Table / Gantt（plan_start~plan_end）。demo 实证 tab 有独立路由（`/tab/<id>`）。
3. **Workbench 工作台**：跨模块 Dashboard 页（统计卡：Open tasks/Due today/Overdue tickets + My tasks 列表 + 趋势图），数据源聚合上述 collections。
4. 菜单组"项目管理/工单/资产/人事/基础数据"+ Workbench 置顶。

**验收锚点（浏览器）**：Tasks 页四 tab 切换：Kanban 拖卡改状态 → Table 可见变化 → Calendar 月历显示 due 卡 → Gantt 条形按计划时间渲染（含"隐藏已完成"过滤器）；Workbench 统计卡数字非 0。

**回归**：同 B2；另跑 `pnpm --filter @deepseek-ai/dsh-connector-nocobase test`（mock 同构未被触碰应全绿）。

**回滚**：恢复 batch 备份 dump。

---

## B4 AI 员工接入（半天）

**目标**：llmServices 接 MiniMax，8 名内置雇员真实可用；可选创建中文业务雇员 + workflow LLM 节点演示。

**步骤**：

1. [`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) 新增 `ensureLlmService(token)`（与 [`ensureWorkflow`](../../../examples/kb-agent/scripts/setup-nocobase.mts:336) 同级同风格）：
   - 幂等：`GET /api/llmServices:list?filter={"title":{"$eq":"MiniMax"}}` 存在即 kept；
   - 否则 `POST /api/llmServices:create`，payload：`{title: 'MiniMax', provider: 'openai-completions', options: {baseURL: 'https://api.minimaxi.com/v1', apiKey: <根 .env MINIMAX_API_KEY 的值>}, enabledModels: ['MiniMax-M3'], enabled: true}`。参数依据（仓内实配，零猜测）：端点 [`llm-minimax/src/index.ts:102`](../../../packages/llm/llm-minimax/src/index.ts:102) `PUBLIC_BASE_URL = 'https://api.minimaxi.com/v1'`（live-endpoint 探测实证）；对话模型 [`cordis.patch.yml:80-82`](../../../examples/kb-agent/cordis.patch.yml:80) `provider: minimax / model: MiniMax-M3`；嵌入模型（如雇员需 RAG 类技能）`embo-01`（[`kb-embed-minimax/src/index.ts:42-44`](../../../packages/kb/kb-embed-minimax/src/index.ts:42)）。模型走 Manual input 填 `MiniMax-M3`；
   - 挂进 `stepInit`（或独立命令 `ai`）；`stepVerify` 追加：llmServices ≥1 且 enabled。
2. 浏览器验证配置链路：系统设置 → AI 员工 → LLM service 出现 MiniMax 条目 → Test flight 通过（真实调用）。
3. 真实对话验收：任意业务页右下角 AI 入口 → 与 atlas 对话 ≥2 轮（问"汇总当前 leads 各阶段数量"类问题）→ 服务端实证：`GET /api/aiMessages:list` 有 assistant 回复记录。
4. 可选增强（时间允许）：
   - 新建 1 名中文雇员"食品行业助手"（Profile+System Prompt 面向本仓业务语料）；
   - plugin-mcp-server 已启用——验证 NocoBase 作为 MCP 服务端的接入点（为后续 DSH KB↔AI 员工打通留锚点，本批不强制）；
   - workflow LLM 节点：复制一条测试 workflow 挂 LLM 节点（勿动生产订单审批 workflow）。

**验收锚点（浏览器）**：AI 入口对话面板打开 → 选 atlas → 发送问题 → 收到流式回复（内容与 CRM 数据相关，证明工具/上下文可用）。

**回归**：AI 表新增不影响五场景；`verify` EXIT=0。

**回滚**：`POST /api/llmServices:destroy` 删 MiniMax 条目（雇员/对话记录保留无害）。

---

## B5 Portal 前端部署：CRM + Hub（1 天，PoC 先行）

**目标**：把 demo-portal-crm / demo-portal-hub 部署为 `http://127.0.0.1:13000/dist/crm/`、`/dist/hub/`，达到官方 demo 的"门户"层。

**PoC 纪律**：先只做 CRM 登录链路 PoC（30 分钟内出结论），再决定是否全量。X-Portal 头/portal-sdk 2.1.0 在 2.2.6 属未验证路径。

**步骤**：

1. Vendor 源码：`git clone --depth 1 https://github.com/nocobase/demo-portal-crm.git platform/nocobase-portals/demo-portal-crm`（hub 同理；放快照外新目录，不进 pnpm workspace，独立 pnpm 安装——注意与主仓 yarn1 隔离，目录自含 .gitignore）。若决定纳入版本管理，作为独立子目录提交并在 PLAN 实录注明上游 commit（当前 bd7092c）。
2. 配 `.env.local`：`NOCOBASE_API_URL=/api`、`NOCOBASE_AUTHENTICATOR=basic`、`NOCOBASE_PORTAL_BASE=/dist/crm/`（构建时 vite 以此为 base）。
3. **PoC**：`pnpm install && pnpm build` → 产物 `dist/` 拷到 `platform/nocobase/storage/dist-client/crm/` → 浏览器开 `http://127.0.0.1:13000/dist/crm/` → 用 admin@nocobase.com 登录。观察：登录是否成功（basic authenticator REST 同源）；列表页是否拉到 `crm_leads` 数据（B2 已建）。**失败模式记录**：SDK 版本检查报错 / X-Portal 404 / ACL 拒绝——逐一如实写进实录。
4. PoC 通过 → 同法部署 hub（`hub_*` 数据 B3 已建；portal 登录/注册页对齐）。
5. 新脚本 `examples/kb-agent/scripts/nocobase-portal-deploy.mts`：clone/pull（若 vendored 则跳过）→ install → build → 拷贝产物 → 存在即覆盖（产物部署幂等 = 目录替换）。挂独立命令 `portals`。
6. `stepVerify` 追加：`GET /dist/crm/` 返回 HTML（`uiReachable` 风格探测）。

**验收锚点（浏览器）**：`/dist/crm/` 登录后：dashboard 统计卡有数、leads 看板 7 列可拖拽、右下角 AI 聊天可开（B4 的雇员）。`/dist/hub/` 同理抽验 2 页。

**降级路径（PoC 失败时，不阻塞 N8 交付）**：不部署 portal，admin 原生页面（B2/B3）已覆盖 demo 外观；在 PLAN §4 与交付说明明示"Portal 需 2.3+ 服务端，升级另立项"。此为可接受的诚实降级。

**回滚**：删 `storage/dist-client/crm|hub/` 目录即可（纯静态产物）。

---

## B6 整合回归收口（半天）

**目标**：全量回归 + 幂等实证 + 文档/Agent Note。

**步骤**：

1. 幂等实证：`node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts all` 连跑两次，均 EXIT=0（第二次全部 "kept" 路径）。
2. 五场景：`node --import tsx/esm examples/kb-agent/scripts/demo-full-journey.mts` 全 PASS（场景 3 重点看 workflow lease 对新 workflow 环境的兼容）。
3. 双入口：:3080 七页面 + `/nocobase` iframe（登录、表格浏览、AI 入口在 iframe 内可用）；:13000 直开全模块菜单。
4. 相关包测试：`pnpm --filter @deepseek-ai/dsh-apiproxy test -- nocobase-domain`、`pnpm --filter @deepseek-ai/dsh-webserver test -- nocobase-proxy`、`pnpm --filter @deepseek-ai/dsh-connector-nocobase test`。
5. 文档：更新 [`plans/handoff-2026-09-08.zh.md`](../handoff-2026-09-08.zh.md) 顶部终态节（新增 N8 终态段：入口表加 /dist/crm|hub、AI 用法一行）；按 [dsh-doc-standards](../../../.agents/skills/dsh-doc-standards/SKILL.md) 判断是否需 docs/ 页面；写 Agent Note（implemented 类，记录 AI 插件根因=llmServices 空、Portal 部署结论、demo 复刻路径裁决）。
6. PLAN.md 勾选批次完成状态。

**验收锚点**：上述 1-4 全绿 + 文档链接可解析（`pnpm run doc-sync` 若涉 docs/ 改动）。

**回滚**：本批无破坏性操作（只读验证 + 文档），无需回滚。

---

## 实施记录

### B1 实施记录（2026-09-09）

**做了什么**：
- [`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) 新增 `stepPlugins`（幂等：`pm:list` 已 enabled 则 kept，否则 `pm:enable`）与 `waitAppReady`——实测 `pm:enable` 是 app 命令，返回后 app 重载数据源进入 503 `APP_COMMANDING` 窗口，下一个 enable 并发即 503（首个 comments 曾因此失败，补等待后通过）；`main()` 加 `plugins` 命令、`all` 链插在 `init` 之后；`stepVerify` 追加 PLUGINS 清单 enabled 断言。
- 执行 `plugins`：13 个插件全部 enable 成功（12 确定 + 试探 `audit-logs` 成功；2.2.6 UI 对其标 "(deprecated)"，可用）。
- 重启后浏览器验收 + 截图归档。

**证据**：
- 插件管理页 13 个开关全部 checked：map / comments / data-visualization-echarts / charts / public-forms / notification-email / departments / localization / graph-collection-manager / backup-restore / field-china-region / collection-fdw / audit-logs（`B1-plugin-manager.png`）。
- "添加区块"菜单出现 Map / Comment / Charts / Gantt / Audit logs 区块（`B1-add-block-menu.png`）。
- `verify` EXIT=0（含新插件断言）；:3080 `/nocobase` iframe 反代 200。

**重建判定（一次定论）**：dev-server 模式下 v2 客户端按需加载新插件组件 chunk，启用后无需 `NOCOBASE_FORCE_BUILD=1` 重建；后续批次复用此结论。

**偏差**：
- 无失败项；audit-logs 未触发"失败即移除"（PLAN §4 预案未用上），补充事实：2.2.6 标记 deprecated 但功能可用。
- 环境注记：动工时 PG 掉线致 NocoBase 卡 maintaining 503，`stop`+`start` 恢复；B1 快照 `/tmp/nocobase-batch-1-backup.sql` 在恢复前完成。

---

### B2 实施记录（2026-09-09）

**做了什么**：
- 新脚本 [`nocobase-crm-modules.mts`](../../../examples/kb-agent/scripts/nocobase-crm-modules.mts)：10 个 crm_* collections（demo-portal 资源名对齐 + crm_payments/crm_invoices）、fixture 种子（[`workspace/data/crm/dataset.json`](../../../examples/kb-agent/workspace/data/crm/dataset.json)，112 行食品产融语境）、2 菜单组 +10 页面（Page schema + Grid 子节点 wiring）、每页程序化区块（表格×8 + Leads 看板，幂等 by title / by CardItem 存在）。
- **页面区块全程序化打通**（比计划预期的"浏览器手工"更进一步）：表格区块 schema 复用既有 experts 表 wire 形状；看板复用官方 plugin-kanban e2e 模板（KanbanBlockProvider + groupField/sortField + Kanban.Card）；crm_leads 补 sort 字段支撑拖拽排序。
- 实验期踩坑（已沉淀进脚本注释）：①字段工厂漏 name 属性 → NocoBase 生成随机列名 f_xxx（8 表重建修复）；②单选字段 DB 层无 select 类型，= string + interface select + uiSchema.enum；③dataOf 对 list 动作返回行数组（无第二层 .data）；④列节点 name 用 `type` 与 JSON-Schema 关键字冲突导致空列，改 industry。

**证据**：
- Leads 看板 7 列（New lead→Lost）全部渲染含种子卡片：`B2-leads-kanban.png`。
- 报价单表格 12 行 + 7 态彩色状态分布：`B2-quotes-table.png`；写链路 REST 实证（create QUO-2026-0899 → list 回读 → destroy）。
- 双跑幂等：第二次运行 22 个 kept、seed 全 +0。
- 回归：五场景 demo 全 PASS（场景 3 订单审批链完好）；`setup-nocobase.mts verify` 未受影响。

**偏差与降级（如实记录）**：
1. **仪表盘 echarts 图表未完成**：客户仪表盘/销售仪表盘的表格底座已程序化就位（服务端 schema 正确、曾两次完整渲染——表格+Add block 按钮截图为证），但该两页在前端 dev-server 模式下出现"渲染后卸载"振荡（同浏览器报价单页稳定；重启 NocoBase、新开 tab、重建页面均复现；服务端 getJsonSchema 响应完整无错误）。浏览器内图表交互配置无法稳定进行。降级为：表格数据底座 + 记录复现路径；若 B6 前窗口允许再补图表。
2. **新建报价单表单**：以 REST create→read→destroy 等价实证（表单 UI 依赖 ActionBar Add 动作，同上交互不稳）；数据链路已验证。

---

### B3 实施记录（2026-09-09）

**做了什么**：
- 新脚本 [`nocobase-hub-modules.mts`](../../../examples/kb-agent/scripts/nocobase-hub-modules.mts)：16 个 hub_* collections（demo-portal-hub 资源名对齐：pj/tk/kb/as/hr/md 六组）、fixture 种子（[`workspace/data/hub/dataset.json`](../../../examples/kb-agent/workspace/data/hub/dataset.json)：projects 15 / tasks 19（甘特 9-12 月跨度）/ tickets 20（8 态全覆盖）/ 其余 ≥4）、工作台置顶页 + 5 菜单组 16 页面、全部程序化区块（表格 ×19 + 任务看板 + 任务日历 + 任务甘特 + 工作台 filter 表格 ×2 + 分类维护 4 表格同页）。
- Calendar/Gantt 区块 schema 取自官方 plugin-calendar / plugin-gantt e2e 模板。
- 幂等缺陷一次：表格块首块判断漏跳过导致重复插入（第二次运行 +1 块）；修复判据为 Grid 行数 ≥ 配置表格数，并用一次性修剪脚本清理已重复行；修复后重跑全 kept（40 kept / 0 inserted）。

**证据**：
- 任务看板 7 状态列含种子卡片：`B3-tasks-kanban.png`；任务表格 19 行：`B3-tasks-table.png`；日历月历含任务事件：`B3-tasks-calendar.png`；甘特条形按 plan_start~plan_end 渲染：`B3-tasks-gantt.png`；工作台任务/逾期工单表格：`B3-workbench.png`。
- 回归：connector-nocobase 测试 EXIT=0；五场景 PASS 沿自 B2 批（B3 未触碰既有 5 collections 与 workflow）。

**偏差（如实记录）**：
1. **四视图 = 四页面而非单页四 tab**：官方 demo 的 Tasks 单页 Kanban/Calendar/Table/Gantt 四 tab 交付为四个同组页面（视图类型与数据一致）；tab wiring 是交互式配置面，程序化路径未覆盖。锚点"四视图可切换"以菜单内四页切换达成。
2. **Workbench 统计卡降级为 filter 表格**（未做卡片数字组件）：以"我的待办任务（非完成态）+ 逾期工单"两个过滤表格承载同等信息；卡片式统计留待浏览器交互窗口。
3. **前端渲染时序（B2 降级项根因澄清）**：单浏览器 tab + 冷插件 chunk 下页面完整渲染约需 40-60 秒；多 tab 并开与过早 DOM 查询会误判"空白/振荡"。B2 客户仪表盘按此纪律（单 tab + 长等待）复验截图 `B2-customer-dashboard.png`。

---

### B4 实施记录（2026-09-09）

**做了什么**：
- [`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) 新增 `ensureLlmService`（幂等 by title "MiniMax"）：`{provider: 'openai-completions', options: {baseURL: 'https://api.minimaxi.com/v1', apiKey: <根 .env MINIMAX_API_KEY>}, enabledModels: ['MiniMax-M3'], enabled: true}`；新增 `ai` 命令 + `all` 链插入 + `stepVerify` 追加"至少一条 enabled llmService"断言。
- 浏览器真实对话：设置 → AI employees 页 → 右下角 "Open AI chat" → Atlas（模型标识 MiniMax-M3）两轮中文真实对话。

**证据**：
- 第一轮（自我介绍+团队表格化输出）：`B4-atlas-round1.png`；第二轮（食品行业出海三类合规咨询分析）：`B4-atlas-round2.png`。
- 服务端实证：`aiMessages` 表 4 行（user/atlas ×2），atlas 回复含 MiniMax-M3 特有的 `<think>` 推理标记——真实 LLM 往返非模板。
- `verify` EXIT=0（含 llmServices 断言）；`ai` 二跑 kept。

**偏差（如实记录）**：
1. **对话入口**：业务页右下角的全局 AI 悬浮球在部分 v2 页面渲染不稳定（dev-server 插件 chunk 加载时序），实际验收走"设置 → AI employees"页的 Open AI chat 面板（同一 ChatBox 组件、同一 sendMessages API）。
2. 可选增强（中文业务雇员、workflow LLM 节点）按计划"时间允许"未做——非锚点。
3. 出站代理：MiniMax 端点直连成功，无需为 NocoBase 进程注入代理环境变量。

---

### B5 实施记录（2026-09-09）

**做了什么**：
- Vendor：`platform/nocobase-portals/demo-portal-crm`（上游 bd7092c，与计划记录一致）+ `demo-portal-hub`（上游 6796eb5），depth 1 克隆（外网代理），目录在 pnpm workspace 之外自含。
- 构建：`.env.local` = `NOCOBASE_API_URL=/api` + `NOCOBASE_AUTHENTICATOR=basic` + `NOCOBASE_PORTAL_BASE=/dist/crm|hub/`；pnpm install + build（CRM 1m42s 装 + 22s 建；hub 19s 装 + 25s 建）。
- 部署：dist → `platform/nocobase/storage/dist-client/{crm,hub}/`，gateway `/dist/{crm,hub}/` 200。
- **字段对齐（PoC 关键补齐）**：portal 前端按自己的字段名聚合（crm_leads.status、crm_customers.company_name、crm_deals.stage/expected_close_date/closed_date、crm_follow_ups.status/due_date、hub_pj_tasks.due_date、hub_hr_leave_requests.start_date/end_date、hub_kb_articles.createdAt）——在 [`nocobase-crm-modules.mts`](../../../examples/kb-agent/scripts/nocobase-crm-modules.mts) / [`nocobase-hub-modules.mts`](../../../examples/kb-agent/scripts/nocobase-hub-modules.mts) 各加 `ensurePortalFields`（加列+幂等回填，进 setup 可重放链）。
- 新脚本 [`nocobase-portal-deploy.mts`](../../../examples/kb-agent/scripts/nocobase-portal-deploy.mts)（vendored 存在性检查 → install-if-missing → build → 目录替换部署）；setup `stepVerify` 追加 `/dist/crm|hub/` HTML 探测。

**证据**：
- `/dist/crm/dashboard`：销售漏斗 ¥529,500/¥166,000、活跃线索 12、客户构成饼图、最新客户表（真实种子）——`B5-portal-crm-dashboard.png`；leads 页：`B5-portal-crm-leads.png`。
- `/dist/hub/overview`：逾期任务/工单/待审批统计 + 今日待办 + 最新知识文章——`B5-portal-hub-overview.png`。
- 登录：同源 basic authenticator cookie 直通，无需重复登录（X-Portal/portal-sdk 2.1.0 在 2.2.6 未被阻断——计划风险点未触发）。
- `verify` EXIT=0（含两 portal 探测）。

**偏差（如实记录）**：
1. **PoC 风险未触发**：X-Portal 头/SDK 版本检查在 2.2.6 + 当前 portal 版本组合下未拦截；真实差异是字段名而非协议不兼容。
2. portal 内嵌 AI 聊天按钮存在但未逐页验证（锚点 AI 对话已在 B4 完成）。
3. portal 克隆目录未纳入版本管理决策留待用户（含 .git 子目录；如提交需按计划注明上游 commit）。

---

### B6 实施记录（2026-09-09）

**做了什么**：`all` 链扩展（`stepPlugins` + `ensureLlmService` 后以子进程重放 `nocobase-crm-modules.mts` / `nocobase-hub-modules.mts`；portal 构建不进链、由 verify 探测兜底）；全量回归；文档三件（handoff 终态节 / diagnosis N9 简表 / Agent Note）+ PLAN 批次勾选。

**证据（全绿）**：
- `setup-nocobase.mts all` 双跑：第一次 EXIT=0（全量），第二次 EXIT=0（106 处 kept、0 新建/插入/回填），verify 两轮 OK（含插件 13/llmService/双 portal 探测）。
- 五场景 demo：5/5 PASS（B4/B5 数据变更后复跑，实录 full-journey-20260909-023219.md）。
- 双入口：:3080 七页面 rail 完整（对话/知识库/数据资产/连接器/图谱/业务管理/轨迹）、console 零错误、新 crm_*/hub_* collections 自动流入"业务管理"下拉；`/nocobase` iframe 200；:13000 全模块可开（截图覆盖：B2 看板/报价单/仪表盘、B3 四视图+工作台、B4 对话、B1 插件页、B5 双 Portal）。
- 相关包测试：`nocobase-proxy.spec` 8/8、`nocobase-domain.spec` + connector `client.spec` 30/30、connector-nocobase 全套 EXIT=0；`pnpm run typecheck` EXIT=0。
- doc-sync：本批改动均在 `plans/` 与 `examples/`（不在 docs/ 门禁面），未触发。

**偏差（如实记录）**：apiproxy/webserver 为聚合包（scripts 空），计划中的 `pnpm --filter` 命令以根 vitest 直跑 spec 文件替代，覆盖面一致。

---

### N11 韧性收尾记录（2026-09-09）

**做了什么**（引擎 Iter6/7 教训落地，三项独立小改进）：

1. **demo runner 外部调用韧性**：新共享模块 [`resilience.ts`](../../../examples/kb-agent/scripts/resilience.ts)（`withResilience`：默认 1+2 次尝试、指数退避 + jitter、单次超时预算、耗尽错误含 tool 名/attempts/最后错误）。[`demo-full-journey.mts`](../../../examples/kb-agent/scripts/demo-full-journey.mts) 的全部外部调用点包裹（`callText`/`ask`/upload/NC REST/附件下载），非幂等写（`nb_create`、`orders.create`）显式 attempts=1 只留超时预算；[`nocobase-workflow.ts`](../../../examples/kb-agent/scripts/nocobase-workflow.ts) 的 `getJson` 走可重试、`postAction` 只加超时（toggle flip 语义禁止盲重试）；场景 FAIL 行结构化输出失败步骤（`step()` 跟踪 + `失败于「步骤N」` 前缀），任一场景 FAIL 仍非零退出、其余场景照常跑完。
2. **QUICKSTART 完整功能导览**：[QUICKSTART.zh.md](../../../examples/kb-agent/QUICKSTART.zh.md) NocoBase 节扩为导览——九组业务菜单（CRM 客户/销售流程/工作台/项目管理/工单中心/资产管理/人事管理/基础数据/专家数据）、AI 雇员两个入口（Portal 右下角 Open AI chat 可靠入口 + 设置→AI employees 管理页）、双 Portal 地址与"从入口页进"、商业版边界一句话 + 指到 [PLAN.md](PLAN.md) §4。
3. **experts 历史残留清理**：[`seed-experts-roster.mts`](../../../examples/kb-agent/scripts/seed-experts-roster.mts) 清理段加窄条件（name 匹配 `nb-e2e-`/`演示专家-` 前缀 **且** org 与 domains 均空才删，防误删同名真实行）；实跑移除 id=53/54（`演示专家-*-改`，org/domains NULL 的验证前残留），experts 35→33，其余 32 专家 + 49 服务 + 23 资产全 kept。

**证据（全绿）**：
- 新测试 [`resilience.spec.ts`](../../../examples/kb-agent/tests/resilience.spec.ts) 4/4（失败 2 次后成功重试生效；耗尽错误含 tool 名与 attempts；挂起 attempt 被超时掐断）、[`seed-experts-roster.spec.ts`](../../../examples/kb-agent/tests/seed-experts-roster.spec.ts) 2/2（窄条件删残留/带 org 同前缀行幸存；幂等 skip）。
- demo 真轨道复跑：5/5 PASS **EXIT=0**（实录 `demos/full-journey-20260909-044643.md`），场景 4 幂等收尾"回到基准 33 行（实测 33）"，库中 `演示专家-` 前缀 0 行。
- `pnpm run typecheck` EXIT=0；`pnpm vitest run examples/kb-agent/tests/` 15 文件 25 测试全绿；`pnpm run doc-sync` 28/28 全过（顺带修复前批遗留：N9/N10 Agent Note 重排为规范格式并补双语三件套、`verify-public-repository-links` 的 `git ls-files` 加 maxBuffer（tracked 集超 1 MiB 默认执行缓冲）、translation-pairing manifest 补 `platform/nocobase-portals/` vendored 豁免、该 note 的 `../../../plans` 死链修正为 4 层）。

**偏差（如实记录）**：
1. `api.data.upload` 与 `orders.create` 两调用点的 run 闭包未接收 `withResilience` 传入的 signal——`DataApi.upload`/`OrdersSeam.create` 的 signal 通道其实存在但未接线，两处单次超时预算当时是死配置（N12 已接线修复，见下）。
2. 第 1 项判定为非平凡变更但影响面限于 examples 演示脚本与共享辅助，批次记录承载足够，未另立 Agent Note（dsh-prose-standard 判定：无跨批架构决策）。

---

### N12 验证修复记录（2026-09-09）

**做了什么**（N11 验证器 7 项逐项闭环）：

1. [`demo-full-journey.mts`](../../../examples/kb-agent/scripts/demo-full-journey.mts) 两处死配置接线：`orders.create` 与 upload 的 run 闭包接收 `withResilience` 传入的 signal（`OrdersSeam.create`/`DataApi.upload` 均带 `signal?: AbortSignal`），75s/180s 单次超时预算生效；upload JSDoc 更正为准确描述。
2. [`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) `call()`/`dataOf()` 切 `withResilience`（半开挂死不再永久挂起）：GET 幂等重试（2 次尝试 / 45s 预算），POST 默认只留超时预算（create 防双写、toggle 防 flip-back），幂等建模调用点（signIn / pm:enable / apiKeys:destroy / flow_nodes:update / collections:create——按名唯一，重试顶多报已存在）显式回开重试；verify 的 API-key 探测 fetch 补 5s 超时（与 portal 探测同构）。
3. [`resilience.ts`](../../../examples/kb-agent/scripts/resilience.ts) `timeoutMs` 非法值（≤0/NaN）fail-loud throw（参照 `dsh-timeout` `clampTimeout` 语义，未引入新依赖）。
4. [`seed-experts-roster.spec.ts`](../../../examples/kb-agent/tests/seed-experts-roster.spec.ts) fixture 补混合行（前缀匹配 + org 有值 + domains 空）并断言保留——窄条件被误改「任一字段空即删」时该用例翻红。
5. [QUICKSTART.zh.md](../../../examples/kb-agent/QUICKSTART.zh.md) 菜单导览补「工作台（个人任务聚合单页）」，九组实列九组；demo 尾注改 `${PASS}/${total} 场景 PASS` 动态计数。
6. 上文 N11 偏差 1 修正为事实（signal 通道存在、当时未接线），即本批第 1 项的前置。

**证据（全绿）**：
- `pnpm exec vitest run examples/kb-agent/tests/` 15 文件 26 测试全绿（新增 timeoutMs 非法值校验用例；混合 fixture 行进既有用例）。
- `pnpm run typecheck` EXIT=0；oxlint 改动 5 文件 0 警告。
- `setup-nocobase.mts verify` EXIT=0（韧性包装不破坏正常路径：全 UI + collections + 附件字段 + 种子 + workflow 链 + API key 全过）。
- demo 真轨道 5/5 PASS EXIT=0（实录 `demos/full-journey-20260909-080803.md`，尾注「5/5 场景 PASS 无 FAIL」动态计数生效）。
- `pnpm run doc-sync` 28/28 全过。

---

### N13 数据面补全 + admin AI 员工入口（2026-09-09）

**做了什么**（用户原话："nocobase 平台为什么什么数据都没有，也不像官方网站那样，按钮旁边有 ai 员工"）：

1. **诊断（先查后补）**：
   - 全 collections 行数实查：26 张 crm_*/hub_* 业务表**全部有数据**（当时 3-20 行/表，零空表）——"没数据"的观感不是播种缺失。
   - 浏览器走查定位：CRM 首屏"销售线索"看板、"客户"表格等页面区块不渲染（105 秒等待排除时序）；后确认专家数据页（v1 金标准）同样只剩行序号——**根因是 dev-server 运行态下 v1 表格的 CollectionField 单元格值渲染失效（环境级前端问题，非数据、非 schema）**：服务端 getJsonSchema 返回完整树、数据 API 返回全字段值、表格框架与中文列头正常渲染，唯独字段值空白。
   - 顺带实锤一处历史 wire 缺陷：B2/B3 用字面量键（'col'/'block'/'table'/'actionBar'）插入 uiSchemas，同名节点被 insertAdjacent 错挂（一个 'col' 行闭包链挂在 `nocobase-admin-profile-create-form` 下），页面树 Grid.Row→CardItem 断层。
   - AI 入口机制定论：admin 的官方同款右下角悬浮球 `ChatButton`（plugin-ai `client-v2/ai-employees/chatbox/components/ChatButton.tsx`）在 `pageInfo.version === 'v1'` 时直接 return null——**只在 v2 页面（type=flowPage）渲染**，这就是 N10"flowModels 204 无配置"的真身；2.2.6 UI Editor 原生支持 "Modern page (v2)"，其数据面=desktopRoutes(flowPage+tabs) + flowModels 五节点（RouteModel×2、RootPageModel、BlockGridModel、区块模型）。
2. **页面重建**：[`nocobase-crm-modules.mts`](../../../examples/kb-agent/scripts/nocobase-crm-modules.mts) / [`nocobase-hub-modules.mts`](../../../examples/kb-agent/scripts/nocobase-hub-modules.mts) wire 键全部改随机 uid（`nodeKey()`）；新脚本 [`nocobase-n13-rebuild.mts`](../../../examples/kb-agent/scripts/nocobase-n13-rebuild.mts)（`--rebuild` 删除 26 个业务页并重放两脚本重建健康树；默认幂等 no-op）把 B2/B3 页面全部重建，补齐专家数据页同款 tabs 子路由模式后页面区块/列头恢复渲染。
3. **admin AI 员工入口（官方同款形态达成）**：新增"AI 工作台"v2 flowPage（sort=2，菜单第二项）：页面内嵌 **AIChatBox 聊天框**（Atlas + MiniMax-M3）+ **右下角悬浮球**（v2 页自动挂载）+ 工单表格区块；`ensureAiWorkbench` 幂等进 n13-rebuild 脚本。
4. **数据扩容**：新脚本 [`nocobase-n13-seed.mts`](../../../examples/kb-agent/scripts/nocobase-n13-seed.mts)（幂等 by 业务唯一键）把核心表补到目标行数：crm_leads 14→30、crm_customers 12→20、hub_tk_tickets 20→40、hub_as_assets 6→24，工单挂客户、资产含 90 天日期跨度。

**证据**：
- Atlas 真实对话（AI工作台页内嵌聊天框）：中文提问 → MiniMax-M3 带 `<think>` 推理链回复；服务端 aiMessages 28→30（`N13-atlas-chat.png`）；悬浮球+聊天框+工单表格同屏（`N13-ai-workbench-v2.png`）；客户页表格框架+列头（`N13-crm-customers-page.png`）。
- 回归全绿：`setup-nocobase.mts verify` EXIT=0；五场景 demo 5/5 PASS（实录 `demos/full-journey-20260909-105359.md`）；`pnpm run typecheck` EXIT=0；`pnpm run doc-sync` 28/28；:3080 200；n13-seed 二跑 +0、n13-rebuild 二跑全 kept。

**偏差与遗留（如实记录）**：
1. **v1/v2 表格字段值渲染空白**：所有表格页（含专家数据页金标准）单元格值不显示（框架、行数、列头正常；REST 返回值完整）。dev-server 重启未修复；判定为运行环境级前端问题，超出数据面批次可修范围，需平台前端专项（对照 B2 当时截图曾正常渲染）。数据本身在库且 REST/Portal 双端可见（`/dist/crm|hub/` 前端为独立 React，不依赖 admin CollectionField）。
2. v2 TableBlock 的字段列已配（width/title/dataIndex + fieldSettings.init 列头中文渲染成功），但值渲染同受遗留 1 影响。
3. AI 工作台页含实验遗留的 3 个工单列配置（n13wkcol1-3），渲染为列头（数据列同遗留 1）。
4. 菜单顺序现为：专家数据 → AI 工作台 → CRM 客户 → …（AI 工作台 sort=2）。

---

---

### N14 admin 表格页单元格值空白专项修复（2026-09-09）

**做了什么**（用户原话："表格什么数据都没有"的直接根因；N13 遗留 1/2/3 的闭环）：

1. **诊断（浏览器侧取证，三层根因全部实锤）**：
   - **根因 A（B2/B3/N13 程序化页面，408 个节点）**：`TableV2.Column.properties` 里 CollectionField 子节点的 properties 键（=uiSchemas 行的 `name` 列）用了随机 uid 而非字段名。前端 [`Table.tsx`](../../../platform/nocobase/packages/core/client/src/schema-component/antd/table-v2/Table.tsx) 以 `collectionFields[0].name` 推导列 `dataIndex`，[`NocoBaseRecursionField.tsx`](../../../platform/nocobase/packages/core/client/src/formily/NocoBaseRecursionField.tsx) 以 `_.get(values, name)` 取单元格值——键=uid → `record[uid]` undefined → 组件渲染但值空白（fiber 实测 `dataIndex:"1p44vda4ebp"`）。N13 把 wire 键改随机 uid 时把 CollectionField 键也改了；官方 UI 创建的节点 name=字段名（users.nickname 等系统节点对照实锤）。
   - **根因 B（setup 五 collection 字段，experts 等 36 字段）**：字段创建时未传 `interface`/`uiSchema`（`fields.options={}`）。CollectionField 渲染组件解析自 `field.uiSchema["x-component"]`，无 uiSchema → 组件函数 `if (!uiSchema) return null` → 整格空 span（fiber 实测 `CollectionField value="张红喜"` 已拿到值但内层组件返回 null）。B2/B3 工厂带 uiSchema 所以 crm_*/hub_* 不受此因。
   - **根因 C（24 个 v1 页面）**：desktopRoutes 只有 page 行没有 `type=tabs` 子行。2.x v1 页面内容经 tabs 子行（schemaUid wire 到页面 Grid/块节点）渲染，无 tabs 只渲染页头不渲染内容区块（报价单/订单/工单等页表格根本不出现；客户/专家页因历史上带 tabs 而幸存）。附加：v2 AI 工作台三列缺 `stepParams.tableColumnSettings.model`（display field 模型声明）→ 列头有值空。
2. **数据修复**：SQL 一次性修 408 个 CollectionField 节点 `name`=字段名（25 个业务 collection，users/experts 系统节点零误伤）；`fields` 表给 setup 五 collection 全字段补 interface+options.uiSchema（中文 title）；dev-server 重启清 getJsonSchema/listMeta 服务端缓存。
3. **tabs 补线**：新脚本 [`nocobase-n14-fix.mts`](../../../examples/kb-agent/scripts/nocobase-n14-fix.mts)（幂等，通过官方 `desktopRoutes:create` API——自动写 admin-layout-model uiLayouts 关联）给 24 个无 tabs 的页面补 wire：BFS 过 Page/Grid/Row/Col（响应不带 x-uid）找到块体节点 → `getParentJsonSchema` 取 CardItem 块的 x-uid+name → 建 tabs 行。
4. **AI 工作台列重建**：UI Editor 里 toggle 三列（官方 flow 重建带 `tableColumnSettings.model` 的列模型，状态/优先级→DisplayEnumFieldModel、工单标题→DisplayTextFieldModel）；专家数据页补 org/domains/bio 三列（对齐批次四金标准形态）。
5. **源头修复（防重放复发）**：[`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) 字段定义全部带 interface+uiSchema；[`nocobase-crm-modules.mts`](../../../examples/kb-agent/scripts/nocobase-crm-modules.mts) / [`nocobase-hub-modules.mts`](../../../examples/kb-agent/scripts/nocobase-hub-modules.mts) 的 `columnNode`/kanban 卡片 CollectionField 键改 `[field]`（容器节点保持 nodeKey() 防错挂；服务端按 x-uid 定位节点、name 不查重——repository.ts 实证）、建页时同步建 tabs 子行（从 insertAdjacent 响应取 Grid x-uid）；[`nocobase-n13-rebuild.mts`](../../../examples/kb-agent/scripts/nocobase-n13-rebuild.mts) AI 工作台三列创建带 display model 声明。

**证据（全绿）**：
- 五页验收截图（单元格真实值）：`N14-01-experts.png`（张红喜/漯河市电子商务协会/食品出海…20 行 4 数据列）、`N14-02-crm-customers.png`（漯河宏发/休闲食品加工/A 级/合作中）、`N14-03-crm-quotes.png`（QUO-2026-0801/68,000/已发送）、`N14-04-hub-tickets.png`（俄罗斯清关单据被退回/紧急/处理中…9 列）、`N14-05-ai-workbench.png`（聊天框+悬浮球+工单三列值同屏）；截图脚本 [`n14-capture.mjs`](../../../examples/kb-agent/demos/nocobase-full-features/n14-capture.mjs) 以"首行出现非序号单元格值"为拍照门槛。
- 回归：`setup-nocobase.mts verify` EXIT=0；五场景 demo 5/5 PASS（实录 `demos/full-journey-20260909-133758.md`）；`pnpm run typecheck` EXIT=0；oxlint 改动 5 文件 0 警告；n14-fix 二跑 0 页重做（幂等）；:13000/:3080/:5432 全程在线。

**偏差与遗留（如实记录）**：
1. N13 判定"环境级前端 CollectionField 渲染问题"不成立——是数据/schema wire 三层缺陷叠加；N13 重启无效是因为当时未修数据。本批未做 `yarn build`（无需：客户端产物正常，问题全在服务端数据）。
2. 未动 platform/nocobase 快照源码（修复全在运行数据+仓内脚本）。
3. 报价单页"客户/关联订单"列显示 N/A：关联字段（m2o）行未带 appends 参数，属展示语义非空白缺陷，不在本批范围。（N16 修正定位并闭环，见下。）

---

### N16 终局收口：重建链全幂等 + 报价单 m2o 显示修复 + 实验残留清理（2026-09-09）

**做了什么**（四项闭环 + 一项顺带修复）：

1. **重建链全幂等**：[`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) `all` 链在 crm/hub 模块步骤后接入 [`nocobase-n13-rebuild.mts`](../../../examples/kb-agent/scripts/nocobase-n13-rebuild.mts)（默认模式：AI 工作台幂等 + 实验孤儿模型清理）、[`nocobase-n13-seed.mts`](../../../examples/kb-agent/scripts/nocobase-n13-seed.mts)（30/20/40/24 扩容补齐）、[`nocobase-n14-fix.mts`](../../../examples/kb-agent/scripts/nocobase-n14-fix.mts)（tabs 保底，二跑 0 页重做）。`verify` 补三组断言：AI 工作台 flowPage 存在、四表行数下限（crm_leads≥30 / crm_customers≥20 / hub_tk_tickets≥40 / hub_as_assets≥24）、crm_quotes 两个 m2o 字段的 `fieldNames.label` 存在。`reset` 后单跑 `all` 即得完整系统（AI 工作台 + 全部数据 + 表格有值），零手动脚本。
2. **报价单 m2o 显示修复**：N14 的"行未带 appends"定位不成立——浏览器实测列表请求自动带 `appends[]=customer&appends[]=deal` 且响应已展开关联对象；真根因是 belongsTo 字段 uiSchema 缺 `x-component-props.fieldNames`（v1 [`AssociationField` 的 InternalViewer`](../../../platform/nocobase/packages/core/client/src/schema-component/antd/association-field/InternalViewer.tsx) 默认读 `record['label']`，展开对象无 `label` 键 → N/A；官方 users.mainDepartment 等系统字段对照实锤）。[`nocobase-crm-modules.mts`](../../../examples/kb-agent/scripts/nocobase-crm-modules.mts) / [`nocobase-hub-modules.mts`](../../../examples/kb-agent/scripts/nocobase-hub-modules.mts) 的 `belongsTo()` 工厂补写 `fieldNames: { label: 'name', value: 'id' }`，并新增 `ensureAssociationFieldNames` 幂等回填存量字段（fields:update 深合并 uiSchema；本批 crm 11 + hub 8 = 19 个字段回填，报价单页全表 0 个 N/A）。
3. **AI 工作台实验列清理（现状核实 + 残留删净）**：N13 登记的三条实验列（n13wkcol1-3）已在 N14 经 UI Editor 重建为官方 Display 形态（TableColumnModel + `tableColumnSettings.model` + Display*FieldModel 子模型，三列有值）；真正的实验残留是 N13 测试页删除后遗留的孤儿 flowModels（n13testtbl001 一族）——`nocobase-n13-rebuild.mts` 每次运行幂等删净（本批 1 次 destroy 级联 3 行，库内 `n13test%` 归零）。同时把脚本侧 `column()` 创建升级为官方双写形态（列 + field 子模型 + enum options props），保证 reset 重放后与手配页面同构。
4. **文档同步**：handoff N13–N14 节补"重放已并入 all 链"指引；本文件登记 N14 遗留 3 的闭环。
5. **顺带修复（n13-seed 坏值）**：`hub_tk_tickets.customer` 是 input string 字段，n13-seed 旧 factory 传 `{ id }` 对象 → Sequelize 字符串化为 `[object Object]`（20 行）。factory 改传公司名字符串，并加 `repairTicketsCustomer` 幂等修复存量坏行（按 title 前缀反推公司名，本批 20 行全修复）。

**证据**：
- 报价单页 m2o 列显示值（客户=漯河宏发食品有限公司、关联订单=俄罗斯海外仓风险应对咨询，全页 0 N/A）：`N16-quotes-m2o.png`；AI 工作台三列有值且无坏值残留：`N16-ai-workbench.png`；专家数据页仍有值（张红喜行）：`N16-experts.png`。
- 幂等重放：crm/hub 二跑 `m2o fieldNames backfill all present (kept)`、n13-rebuild 二跑 `orphan experiment models none left (kept)`、n13-seed 二跑四表 `+0 (30/30 · 20/20 · 40/40 · 24/24)`、ticket customer repair 二跑 `no broken rows`、n14-fix `0 page(s) wired`。
- `setup-nocobase.mts verify --env-file=.env` EXIT=0（含新断言组）。

---

## N17 对齐官方 v12 demo 体验（2026-09-10）

**用户四点原话**：① "admin 页面有 crm，但是搭建页面，怎么访问搭建好的页面" ② v12 demo `/settings/multi-portal` 多应用入口 ③ v12 `/v/admin/k3bsm39m9t6` add new 旁 AI 员工按钮 ④ 全平台中文化 + 数据不空。

**诊断（先探后改）**：
1. **"搭建页面"观感 = UI Editor 误开，非页面损坏**。浏览器实测本地订单页 `/admin/5p4a85fmjve`：数据/列头/Add new 全部正常，但快照里每个区块都有 designer-drag-handler/designer-schema-settings 按钮——`localStorage.NOCOBASE_MAIN_DESIGNABLE="true"`（顶栏 "UI Editor" 高亮开关曾被打開）。该状态是**浏览器本地存储**，服务端无法代关；业务页真实入口 = 左侧九组菜单（本批在 handoff 写明使用指引）。
2. **multi-portal 是 v12 商业插件，2.2.6 OSS 明确不含**：[`multiPortal.test.ts`](../../../platform/nocobase/packages/presets/nocobase/src/server/__tests__/multiPortal.test.ts) 断言 `plugin-multi-portal` 不在 preset；但 2.2.6 plugin-client 已有 [`appPortals.ts`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-client/src/server/appPortals.ts) 服务端数据层（`appClient:getPortals`、DEFAULT_PORTALS `__default_admin__`/`__default_mobile__` 与 v12 no-code portal 同 uid）。v12 实测数据源：`GET /api/multiPortals:list`（字段 uid/title/icon/portalType: ai|no-code/routePath/options.git 源仓库），8 个 AI-mode 独立前端（/x/crm 等，git sourceStorage）+ 2 个 no-code portal（/v/admin、/v/mobile）。**等价实现**：admin 建"应用中心"页聚合 CRM Portal/Hub Portal/AI 工作台/DSH 入口。
3. **"add new 旁 AI 员工" = v2 页 ChatButton 悬浮球**（截图实证：v12 Customers 页操作栏本身无 AI 按钮，右下角渐变圆形悬浮球 a11y 名 "Open AI chat"）。2.2.6 [`ChatButton.tsx`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/chatbox/components/ChatButton.tsx) 挂载条件五项：ChatBox 未开 ∨ 无 AI 雇员 ∨ **v1 页** ∨ 移动布局 ∨ pathname 不以 /admin 开头 → return null。CRM/Hub 表格页全是 B2/B3 v1 页 → 无悬浮球。**官方同款路径**：表格页升级 v2 flowPage；2.2.6 client-v2 有全套 ActionModel（AddNew/Filter/Refresh/BulkDelete，v12 抓包实证 TableBlockModel.subModels.actions 同构）。v12 AI-mode 卡片的 "Connect coding agent" 走 `portalAgentConnect:getConfig`（商业功能，不在范围）。
4. **中文化现状**：`systemSettings.enabledLanguages` 为空 → [`getLang`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-client/src/server/server.ts) fallback en-US；users.appLang 空；aiEmployees 9 个内置（atlas/dara/dex/ellis/lexi/lina/nathan/vera/viz，builtIn）DB 文案全英文（about 为 null 走代码英文默认）。Portal 双前端 `configurePortalI18n` 的 `resolveSystemLocale`：storedLocale > appLang > **enabledLanguages[0]** > default——服务端设 zh-CN 后双 Portal 新访客自动中文，零 portal 源码修改。

**实施与证据**（全部幂等，[`nocobase-n17-alignment.mts`](../../../examples/kb-agent/scripts/nocobase-n17-alignment.mts)，已入 `all` 链）：

1. **N17e 中文化**：`systemSettings` **顶层列与 options 双层**写 `enabledLanguages=['zh-CN']`（关键发现：admin 端 getLang 读 options 层、portal-sdk `resolveSystemLocale` 读顶层列——首版只写 options 层导致 Portal 登录页仍英文，隔离浏览器复测发现后补双层）+ `appLang`；9 个内置雇员中文文案 upsert（about 为运行时系统提示词唯一来源，null 走代码英文默认，故必须落库）。
2. **N17d v2 表格页 ×8**：每页 = 同 title 替换 v1 行为 flowPage（保 icon/parentId/sort）+ RouteModel×2 / RootPageModel / BlockGridModel / TableBlockModel（N16 官方双写列）+ **AddNewActionModel / RefreshActionModel 操作栏** + **Add new 弹窗子树**（ChildPageModel→ChildPageTabModel→BlockGridModel→CreateFormModel→FormGridModel→FormItemModel+Input/Select/NumberFieldModel，官方 wire 从 AI 工作台手建样本 dump）+ FormSubmitActionModel（`n17sb-<formUid>` 确定性 uid 保证 list 端点幂等——list 不回 parentId，首版按 parentId 判重全部误判 kept，DB 复核抓出）。ChatButton 五条件（非 v1 页 + /admin 前缀 + 有 AI 雇员）随 v2 页自动满足。
3. **N17c 应用中心**：v1 页 + 官方 `Markdown.Void`+`CardItem` 形态（首版误用不存在的 `Markdown` 组件导致卡片空白，对照 [`MarkdownBlockInitializer.tsx`](../../../platform/nocobase/packages/core/client/src/modules/blocks/other-blocks/markdown/MarkdownBlockInitializer.tsx) 修正），4 卡片链到双 Portal / AI 工作台 / DSH。
4. **兼容收口**：crm/hub 模块 `ensureBlocks` 对同名 flowPage 感知跳过（否则 all 链二跑在 v2 页上找 v1 Grid 会炸）；`verify` 补六组 N17 断言（双层 locale / 应用中心 / 8 v2 页 / AddNew≥8 / FormSubmit≥8 / atlas 中文 prompt）；N14 截图脚本三个 v1 页 URL 换成 v2。
5. **证据截图**（`N17-*.png`，[n17-capture.mjs](../../../examples/kb-agent/demos/nocobase-full-features/n17-capture.mjs)）：01 客户页 v2（数据+添加+悬浮球）、02 工单页 v2、03 Add new 中文表单+Submit、04 客户页悬浮球→Atlas 中文回答（思考链明示遵循中文指示）、05 应用中心四卡片、06/07 双 Portal 新访客中文登录页。写库闭环实测：Add new→填→Submit→`crm_customers` 新行落库（验收后清理）。
6. **遗留（不阻塞）**：v2 Add new 表单暂覆盖 input/select/number 字段（date/m2o 编辑控件 wire 未 dump）；v12 multi-portal 的 AI-mode git 源仓库 + Connect coding agent 为商业能力，OSS 2.2.6 不可达（preset 测试 + multiPortals API 404 双证据）；曾手动切过语言的浏览器（storedLocale）Portal 保持原选语言，新访客/清存储后默认中文。

---

## N18 v2 弹窗表单 AI 助手填充（2026-09-10）

**用户原话**："这个功能未完全实现，AI 助手当前不可用，未填写任何内容 — 请手动填写表单。"——在 N17 建的 v2 表格页点「添加」弹窗表单，尝试表单内 AI 填充（v12 demo "add new 旁 AI 员工"的完整功能）得到不可用提示。

**诊断（官方 demo 实探 + 快照源码 + DB 三方对齐）**：
1. **"不可用"的根因是 N17 wire 缺口，非插件故障**。官方 v12 demo（a1js3lumcbox.v12.demo.nocobase.com/admin）Customers 页 Add new 弹窗的真身：弹窗右下角 **AI 员工头像按钮**（React fiber 实证 `AIEmployeeButtonModel`，挂在 `CreateFormModel` 的 `actions` subKey，props：`aiEmployee.username='dex'`、`context.workContext=[{type:'flow-model', uid:<表单uid>}]`、40px 头像）→ 点开内嵌聊天面板 → 输入意图 → LLM 调前端工具 `formFiller`（v2 内置，经 workContext 的 frontendTools manifest 注入对话）→ `flowEngine.getModel(uid).context.setFormValues` 写表单。N17 当时把"add new 旁 AI"判定为页面级 ChatButton 悬浮球，建弹窗子树时（dump 自 AI 工作台手建样本，无 AI 节点）**没有挂 AIEmployeeButtonModel**——悬浮球对话不携带表单 flow-model 上下文，员工既看不到表单 schema 也没有 formFiller 工具，只能回复"不可用请手动填写"（该文案不在任何源码/locale 中，是 LLM 生成的兜底话术）。
2. 辅助证据：2.2.6 快照有表单专员模板 [`form-assistant.ts`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/server/ai-employees/templates/form-assistant.ts)（艾芮，tools:['formFiller']），但本地 `aiEmployees` 表 9 个内置员工（atlas…viz）**不含 form_assistant**（模板从未播种）；官方 demo 用的也是 dex 而非该模板员工。 [`AIEmployeeShortcut.tsx`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/AIEmployeeShortcut.tsx) 在 `listByUser` 查不到指定员工时静默 return（点了没反应的另一形态）。
3. **官方 demo 行为闭环实录**：弹窗 AI 面板输入 "Fill the form: company Contoso Ltd" → Dex 回复 "Done! I've filled in the company name" → 表单 Customer name 已填 "Contoso Ltd"。

**实施（纯运行配置，零源码修改）**：
1. 新脚本 [`nocobase-n18-form-ai.mts`](../../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts)（幂等，确定性 uid `n18ai-<formUid>`，入 `all` 链）：给 8 个 v2 页 CreateFormModel.actions 各挂一个 AIEmployeeButtonModel——`aiEmployee=dex`（与官方 demo 同款；本地 N17 已中文化其 about 且明示"支持自动填写表单"；root 经 `listByUser` 天然可见）、workContext 指向表单自身 uid、sortIndex=2（FormSubmit 之后，对齐官方）。
2. `verify` 补断言：`AIEmployeeButtonModel` ≥8。
3. 验收截图脚本 [`n18-capture.mjs`](../../../examples/kb-agent/demos/nocobase-full-features/n18-capture.mjs)（Playwright，同 n17-capture 落盘通道）。

**证据**（`N18-*.png`，[n18-capture.mjs](../../../examples/kb-agent/demos/nocobase-full-features/n18-capture.mjs)）：
- 01 弹窗表单右下角 Dex 头像按钮（官方同款形态）；02 点击展开聊天面板（Dex 中文问候）；03 输入意图"漯河一家中型调味品企业，名叫卫味轩食品…"→ formFiller 工具调用 → 6 字段全填中文（客户名称=卫味轩食品、类型=工厂、行业=调味品生产、国家=中国、等级=A 级、状态=潜在）+ Dex 中文回复；04 提交后落库闭环 `crm_customers` row22（industry=调味品生产/level=A/status=prospect，验收后 destroy 清理）。
- aiMessages 对话层实证：user 中文意图 → tool `{"status":"success","content":"I have filled the form…"}` → dex 确认。

**回归终态**：n18 二跑 kept；all 链 7 脚本重放全幂等（+0/kept，应用中心仍单页）；`verify` OK（含 N18 断言）；五场景 demo 5/5 PASS（实录 `full-journey-20260910-033109.md`）；`pnpm run typecheck` EXIT=0；`pnpm run doc-sync` 28/28；:13000/:3080 均 200。

**备注**：MiniMax-M3 端到端延迟 15~100+s（推理后才调工具），n18-capture 等待窗口按 150s 设置；form_assistant 模板员工未播种属上游现状，如需专职表单员工可后续按模板 upsert 并把按钮 props 切换 username。

---

## 附：实施者快查

- NocoBase REST 授权模式：[`setup-nocobase.mts` 的 `call/dataOf`](../../../examples/kb-agent/scripts/setup-nocobase.mts:145)（Bearer + v2 wire `data` 包装，`withResilience` 超时/分级重试同在此）。
- AI 端点：`/api/aiEmployees:list`、`/api/llmServices:list|create`、`/api/aiMessages:list`（均已实测可用）。
- 插件启用状态权威：`GET /api/pm:list`（登录态）或 psql `SELECT "name" FROM "applicationPlugins" WHERE "enabled";`（表名带引号）。
- gateway 静态托管：`/dist/<name>/` → `storage/dist-client/<name>/`。
- demo 页面级对照清单：[research/2026-09-09-nocobase-official-demo-replication.md §3.1](../../../research/2026-09-09-nocobase-official-demo-replication.md)（每页 URL、视图类型、列头、种子数据量参考）。
