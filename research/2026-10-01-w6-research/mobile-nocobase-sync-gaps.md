# W6 调研底稿：移动端 ↔ NocoBase 业务系统数据同步断点诊断

- 调研日期：2026-10-01
- 触发：用户第十轮反馈「mobile 和 nocobase 业务系统的数据同步问题……无法投入到真实生产中」
- 前提：W5 已完成三入口 effect 收敛（CLI `--act` / HTTP `/act` / mobile 会话 `nb_approve` 均走 `effectiveEffects()` 单一出口），该腿已修；本报告定位其余断点
- 方法：只读代码走查（packages/client/ui-mobile、packages/host/apiproxy、packages/connector/tool-nocobase、packages/connector/connector-nocobase、packages/kb/kg-build、examples/kb-agent），全部结论附 file:line 证据
- 端定位：PC 统一入口 :3080（`pnpm run dev:web`）同时服务 `/mobile`（apps/web/src/mobile.ts:9 挂 `@deepseek-ai/dsh-client-ui-mobile`）；NocoBase 业务平台 :13000；审批引擎 :13110（examples/kb-agent/scripts/approval-engine.mts `--serve`）。NocoBase 侧另有的车间触屏 H5（examples/kb-agent/scripts/nocobase-h5-wms.mts）不在本报告范围。

## ① mobile 数据链路现状图（组件 → API → 表流向）

### 写路径（智能填表提交 → 人审闭环）

```text
ui-mobile ChatView（form_draft 草稿卡 + DraftCard 编辑 + systemFields 客户端预生成单号）
  → form_confirm 围栏动作消息（packages/client/ui-mobile/src/client/protocol.ts:90-97）
  → session.prompt（rpc.ts:49，queue 模式；sessionsService.ts:134-141）
  → agent-loop → mobile-form-assistant preset（examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml:46）
  → nb_create（packages/connector/tool-nocobase/src/write.ts:288-297）
  → NocoBase REST client.create —— 直写业务表（无草稿/中转表；"草稿态"由业务表 doc_status=draft 列承载）
  → submit_receipt 回执围栏（agent.cordis.yml:47-49，rowId 用 nb_create 真实返回）
  → 消息流回 mobile（轮询 session.history 可见，见读路径）
```

关键事实：

- **直写业务表**。`nb_create` 的 execute 只有防撞号（`enforceCodeUniqueness`，write.ts:293）→ 下游生效门（`enforceCreateGates`，write.ts:294）→ `client.create`（write.ts:295），没有中转表，也没有落库后自动 `submit`。
- 主行+明细联动：采购单落 `pur_orders` 后再落 `pur_order_lines`（agent.cordis.yml:46）。
- wire 层刻意只读：apiproxy 的 nocobase 域注释明确「writes to business records go through the agent's nb_create/nb_update tools … never through the wire surface」（packages/host/apiproxy/src/api/nocobase.ts:1-11），mobile 端 rpc.ts 的方法面也只有 `nocobase.listMeta`/`nocobase.list`（rpc.ts:27-28）。
- 审批动作链：`approval_confirm` 围栏 → `nb_approve`（write.ts:661-755 `nbApproveEngine` 本地孪生；高级流走 write.ts:486-521 `delegateToEngine` 委托引擎）→ 规则单一来源 approval-rules.ts（write.ts:34-53 引入）。
- 生效钩子（W5 已修）：`effectiveEffects()` 单出口（approval-engine.mts:2860-2870，`so_orders`→`reserveForSo`、`mps_plans`→`recalcPlan`）；引擎 `/act` 内联执行（approval-engine.mts:3527-3543）；本地孪生生效后回打引擎 `POST /effective-effects`（write.ts:458-475 `runEffectsViaEngine`，幂等可重放）。

### 读路径

```text
ui-mobile
 ├─ 会话流（一切卡片/回执/审批卡的唯一数据源）
 │   ChatView usePoll(session.history)：空闲 5000ms、turn 运行中 1200ms
 │   （packages/client/ui-mobile/src/client/messages/ChatView.tsx:124,139,147-149）
 ├─ 草稿辅助读（实时 NocoBase REST 透传，无缓存）
 │   ├─ nocobase.listMeta：字段元数据（ChatView.tsx:925-927）
 │   ├─ nocobase.list：单号预生成（systemFields.ts:114-119）、关系选择（RelationSelect.tsx:54）、
 │   │   关系标签回读（relation-label.ts:47）、回执标题回读（task-cards.tsx:265）
 │   └─ apiproxy nocobase 域：服务账号实时转发（api-proxy.ts:3707-3807；client 只缓存实例不缓存数据，api-proxy.ts:1340-1345）
 ├─ 工作台账 / 任务 / 文件：workStore 纯 localStorage，零后端（workStore.ts:1-12）
 ├─ 台账指标（我的页）：从会话日志 fold submit_receipt 计数（ProfileView.tsx:74-80）
 └─ AI 员工对话查询（agent 工具面）
     ├─ nb_list / nb_get：NocoBase 实时 REST（packages/connector/tool-nocobase/src/read.ts:1-120）
     ├─ lakehouse_query：DuckDB over Parquet —— transfer 快照（cordis.patch.yml:223-237）
     └─ kg_query / kb_search：SQLite 图谱与 KB —— 手动构建快照（cordis.patch.yml:185 "Manual runs only"）
```

## ② 断点清单（G1–G8）

### G1 mobile 提交只落 draft，审批流不自动发起（登记↔送审两步断裂）

- 现象：用户在 mobile 确认写入后，单据停在 `doc_status=draft`；审批流需用户再口头说「提交审批」（触发 agent 调 `nb_approve(submit)`）或到 PC/NocoBase 端操作。
- 根因：
  - `nb_create` 落库即返回，无后续 submit（write.ts:288-297）；
  - 表单注册表把「送审」定义为独立后续动作（formRegistry.ts:69、97、354、472 的 doc_status 规则均写「默认 draft；送审/提交审批走审批技能 submit」）；
  - preset 把 submit 定为用户显式意图（agent.cordis.yml:69「用户对已登记的单据说『提交审批/送去审批』时调 nb_approve(action=submit)」）。
- 生产影响：一线人员以为「确认写入=已进流程」，单据大量滞留 draft；审批人收不到 wfl_approval_todos 待办；MRP 需求、成品预留等下游全部不动。
- 修复方向：form_confirm 落库成功后由 preset 追问「是否立即送审」（ask_choice 围栏），或按集合配置「登记即送审」把 create→submit 合成同一意图链；送审结果并入 submit_receipt 回执。

### G2 审批状态变化不回流 mobile（无待办 API + 会话快照卡冻结）

- 现象：PC/审批引擎端审批通过（或驳回）后，mobile 端没有任何待办列表页、状态查询接口或推送；已渲染的 approval_pending 卡永远停留「待审批」。
- 根因：
  - mobile RPC 方法面没有任何 wfl_*/审批读方法（rpc.ts:14-29）；
  - 审批卡渲染自会话消息流中的 fence payload 快照，不回读 NocoBase 当前行状态（ApprovalCard.tsx:73-77，payload.type==='approval_pending' 固定按 pending 呈现）；
  - pending→result 的翻转只发生在**同一会话内** agent 对 approval_confirm 的回复（agent.cordis.yml:66-68），他端审批不产生本会话消息；
  - 引擎虽有 `GET /todos`（approval-engine.mts:3562 服务清单），mobile 无消费通道；查待办的唯一方式是用户在对话里问，agent 按需 `nb_list wfl_approval_todos`（agent.cordis.yml:63）。
- 生产影响：审批人之间互不知晓进度；他人已批的单子在 mobile 仍显示待批，再点「同意」被状态机拒绝后用户困惑；申请人无法在 mobile 追踪自己的单据走到哪一步。
- 修复方向：apiproxy 增加 wfl 待办/单据状态读方法（复用 nocobase 域的实时转发通道查 wfl_approval_todos/主表）；mobile pending 卡挂轮询回读 doc_status 或由服务端事件推送翻转卡片。

### G3 工作台账是纯 localStorage 本地态，与 NocoBase 零关联（伪双源）

- 现象：工作/任务/文件三个页面及「我的」台账指标全部存浏览器本地；不查 NocoBase 任何表。
- 根因：workStore 自述「the local source of truth for work items」+ localStorage `dsh-mobile-work`（workStore.ts:1-12,75）；指标口径=会话日志中 submit_receipt 围栏计数 + 本地 review 标记（ProfileView.tsx:2-11,74-80）；首刷还有演示种子（demoSeed.ts:1-8）。
- 生产影响：换设备/清缓存即丢全部工作台账；NocoBase 端删除或作废单据后 mobile 台账计数不回退（口径漂移）；多人协作的工作互不可见。
- 修复方向：工作台账迁移为服务端投影（会话服务或 NocoBase 表）+ 本地缓存降级；「本月登记」口径改为查 NocoBase 按日期/提交人聚合。

### G4 身份假通道：任意验证码登录 + 单一服务账号 + 审批人恒记 admin

- 现象：mobile 登录任意 6 位数字即可通过，身份固定「业务员」；所有 NocoBase 读写共用部署级服务账号；mobile 上发起的审批在 NocoBase 审计里 approver 记为 admin。
- 根因：
  - 演示登录：`verifyCode` 接受任意 6 位码、name 固定「业务员」（auth.ts:61-66）；模块注释自认「Demo-grade local auth」（auth.ts:1-9）；
  - 网关无凭据：mobile RPC「needs no credentials」（rpc.ts:5-6，same-origin）；
  - 服务账号绑定：apiproxy 用单一 `NOCOBASE_API_KEY` 解析 client（api-proxy.ts:375-384 `resolveNocobaseClient`；工具侧同样拒绝 model 传入 tenant，write.ts:130-131,149-150,180-181）；
  - 审批人默认 admin：`nb_approve` 的 approver 缺省 'admin'（write.ts:104,192），而 approval_confirm 围栏本身没有 approver 字段（protocol.ts:182-189），preset 要求「参数照围栏原样」（agent.cordis.yml:66）——移动端操作者身份无法进入审计；
  - preset 中「requester=当前用户 / operator=当前用户」的"当前用户"即固定名「业务员」（agent.cordis.yml:27,34；auth.ts:65），落库字段失去区分度。
- 生产影响：八角色（buyer/planner/shop_lead/keeper/sales_rep/finance/qc_inspector/admin）权限矩阵对 mobile 完全失效；谁审的、谁录的追溯链断裂；wfl approver_map 按角色派待办的机制与 mobile 实际操作人脱钩（任何人可批任何单，仅受自审自批约束 write.ts:712-718）。
- 修复方向：登录对接 NocoBase users（token/JWT），session.prompt 携带身份并由服务端注入 approver/requester/operator；审批动作前校验 wfl_approval_todos.user 与当前身份一致。

### G5 双份数据源无自动对账：湖仓/图谱快照 vs NocoBase 实时

- 现象：AI 员工回答统计/汇总类问题时按纪律优先查 lakehouse（DuckDB over Parquet 的 transfer 快照），而业务单据现状在 NocoBase 实时表——两份数据无同步任务、无对账机制。
- 根因：
  - 检索纪律「numbers, statistics, aggregates, and record lists through lakehouse_tables first, then lakehouse_query SQL」（cordis.patch.yml:94-96；各场景 preset 同款措辞，如 scenarios/enterprise-data/agent.cordis.yml:10）；
  - connector 只有 discover/fetch 能力（connector-nocobase/src/provider.ts:153-156），transfer 由 PC 端连接器页手动触发（cordis.patch.yml:342-344），connector 包内无任何定时逻辑（interval/cron/timer 搜索 0 命中）；
  - KG 构建是手动脚本运行（cordis.patch.yml:185「Manual runs only (scripts/kg-build.mts)」；kg-build 的 intervalMs 默认 0=手动，types.ts:146-148）；
  - KPI 带每次 live 查 DuckDB（lakehouse.ts:1-9），查的是快照；
  - 引擎夜间任务默认关闭且不含湖仓 transfer（approval-engine.mts:3037-3040，W1_NIGHTLY_ENABLED 默认 off）。
- 生产影响：刚在 mobile 登记并审批生效的单据不会出现在 AI 的统计回答里；「库存还够吗」「本月采购额」这类决策数字可能停留在上次 transfer 时点，且回答不标注数据时点——生产决策被旧数据误导。
- 修复方向：transfer 定时化（挂到夜间任务框架或 connector 调度）；统计类回答强制标注数据截止时点；高敏数字（库存/在途）改走 NocoBase 实时聚合，湖仓只承担 T+1 分析声明。

### G6 离线/弱网无保护：无 outbox、无自动重试、客户端预号竞态

- 现象：发送失败只弹错误提示；没有离线缓存、提交队列或自动重试；单号在客户端预生成存在撞号与读旧页风险。
- 根因：
  - `send` 失败仅 setError（ChatView.tsx:189-209），消息重发全靠用户手动；输入框内容在失败路径保留已是唯一保护；
  - 预号读回只取目标集合按 id 升序的第一页 200 行（systemFields.ts:114-119 `page_size:200, sort:['id']`）——集合超过 200 行时最新最大号不在页内，max 偏小，预生成已占用号；读失败时退化为时钟后缀（systemFields.ts:121-125）；
  - 服务端撞号防护是非原子 list→create TOCTOU（write.ts:22-26 模块注释自述），靠引擎串行写路径 + fail-loud 拒绝缓解，权威兜底是 setup-nocobase 的数据库唯一索引（write.ts:786-800）。
- 生产影响：弱网下用户以为已提交实际未达；两名移动端用户同时开同型草稿必然预生成同号，后提交者被撞号拒绝需整体重填；数据量增长后预号成功率进一步劣化。
- 修复方向：发送 outbox + 指数退避自动重试；单号生成移到服务端（nb_create 服务端分配或提供 next-number RPC），客户端预号仅作展示；预号读回改为按号降序取第一页。

### G7 mobile 没有业务单据浏览/检索页：一切靠对话

- 现象：十路由里没有任何单据列表/详情页；查库存、查单据状态只能打字问 AI（nb_list 对话链路）。
- 根因：路由面只有 home/chats/chat/work/me/tasks/files/agents/login（router.ts:2-9）；wire 已具备的 `nocobase.list`/`listMeta` 在 mobile 仅用于草稿辅助读（rpc.ts:27-28 的调用点只有 ChatView.tsx:926、systemFields.ts:114、RelationSelect.tsx:54、relation-label.ts:47、task-cards.tsx:265）；首页数据只有 roster+最近会话+本地工作统计（HomeView.tsx:84-86）；甚至 apiproxy 已有的 `nocobase.get`/`nocobase.update` mobile 也未接入。
- 生产影响：现场（仓库/车间/外勤）高频的「看一眼单据/库存」场景必须走完整对话回合（模型调用成本+延迟+弱网不可用）；PC 与 mobile 的信息获取能力严重不对称。
- 修复方向：复用 nocobase wire 域新增移动端单据列表/详情页（按角色配置常用集合），挂 home 或 work 入口；下拉刷新 + 空态重试。

### G8 审批引擎是 mobile 高级审批的单点：停机即瘫、生效钩子失败需人工重放

- 现象：部门路由/会签/依次/抄送/通用条件等高级流全部委托引擎（write.ts:441-448 `flowNeedsEngine`→486-521）；本地模板流生效后的下游钩子也要回打引擎 `/effective-effects`，引擎不可达即报错。
- 根因：write.ts:458-475 `runEffectsViaEngine` 引擎不可达时抛错并提示「请启动 approval-engine --serve 后对该单据重跑 POST /effective-effects」；CLI 侧同样只打印幂等重放路径（approval-engine.mts:4598-4607）；单出口设计（approval-engine.mts:2849-2858）使引擎成为必经节点。
- 生产影响：:13110 进程挂掉时 mobile 全部高级审批报错；模板流审批通过但 effect（预留/MPS 重算）失败的窗口需要人工 curl 补偿，无人值守生产不可接受。
- 修复方向：引擎健康检查与自动拉起（或 supervisor 常驻）；`/effective-effects` 失败落持久补偿队列自动重放（钩子已幂等，重放安全）。

## ③ mobile 现有页面与数据依赖清单

十路由（router.ts:2-9；v1/v2 旧路由折叠表 router.ts:30-37）：

| 路由 | 组件 | 数据依赖 | 后端/本地 |
|---|---|---|---|
| `#/`（home） | home/HomeView.tsx | AI 同事目录 agentPreset.list（:85）、最近会话 session.list（:86）、工作统计 workStore（:84） | RPC×2 + localStorage |
| `#/chats` | messages/MessagesView.tsx | session.list 轮询 + session.search；下拉刷新（:131-133） | RPC |
| `#/chat/:id` | messages/ChatView.tsx | session.history 轮询（5s/1.2s，:124,147-149）；草稿期 nocobase.listMeta/list 实时辅助读 | RPC（会话+业务读） |
| `#/work` | work/WorkView.tsx | workStore | 纯 localStorage |
| `#/work/:id` | work/WorkDetailView.tsx | workStore + liveTimeline 轮询 exec 会话（workTimeline.ts:60，默认 2s；demo 模式走本地脚本 :164-196） | localStorage + RPC |
| `#/me` | profile/ProfileView.tsx | 身份 localStorage auth；本月登记=会话 fold submit_receipt 计数（:74-80）；台账统计 workStore | localStorage + RPC |
| `#/tasks` | tasks/TasksView.tsx | workStore 派生 | 纯 localStorage |
| `#/files` | files/FilesView.tsx | workStore artifact 派生（报告工件） | 纯 localStorage |
| `#/agents` | agents/AgentsView.tsx | agentPreset.list（AI 同事通讯录） | RPC |
| `#/login` | login/LoginView.tsx | auth.ts 本地验证码通道 | 纯本地 |

智能填表可落集合（formRegistry.ts 注册表，18 项）：pur_orders（:48）、pur_requests（:79）、wms_receipts（:105）、srm_suppliers（:131）、qm_inspections（:158）、hub_wms_inbound（:187）、hub_wms_outbound（:210）、hub_fin_payments（:234）、wms_transfers（:257）、wms_reservations（:285）、mfg_boms（:310）、mfg_orders（:336）、mfg_material_issues（:367）、mfg_job_reports（:395）、mfg_completions（:426）、so_orders（:452）、mps_plan_items（:484）；审批技能另覆盖 pur_payments（agent.cordis.yml:65）。

附带结论（对应八问核查）：

1. 提交直写业务表，无草稿/中转表，draft 语义由业务表列承载（见①写路径）。
2. 审批不自动发起（G1）。
3. 审批状态不回流：无待办 API、会话快照卡冻结、待办发现靠按需对话（G2）。
4. NocoBase 端修改后，mobile 草稿辅助读是实时透传（api-proxy.ts:3741-3767 无缓存），但除对话外无任何列表/详情页可见面（G7）。
5. 双份数据源=湖仓/图谱快照 vs NocoBase 实时，无对账（G5）；工作台账是第三份伪数据源（G3）。
6. 无离线缓存/提交队列/自动重试（G6）。
7. 身份=演示登录+单一服务账号+approver 默认 admin，八角色零映射、token 零传递（G4）。
8. AI 对话 NocoBase 腿（nb_list/nb_get）是实时直查、新鲜度无损；统计腿优先湖仓快照故有陈旧风险（G5）。
