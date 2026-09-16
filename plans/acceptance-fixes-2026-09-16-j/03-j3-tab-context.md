# J3：tab 感知智能上下文 + AI 视图操控 + 问数（2026-09-16，核心批次详档）

> 诉求 3 原话（节选）：「dsh切换tab时，下方的对话框对应的上下文应该**以当前tab为主**……比如我切换到知识图谱，通过输入框是能够对知识图谱进行**智能调整**的，还要**问答问数**等，**所有的都要能智能化**……**优先ai**」。现状空白面与业界先例见 [00-research-notes.md §3-4](00-research-notes.md)；业界完整裁决见 [research/2026-09-16-tab-aware-context-architecture.md](../../research/2026-09-16-tab-aware-context-architecture.md)。

## 0. 架构裁决（已定，实施不再讨论）

### 0.1 三层架构总图

```
┌─ 浏览器 ─────────────────────────────────────────────────────────────┐
│ 七业务tab包(ui-kg/ui-assets/ui-business/ui-kb/ui-connectors/…)        │
│   ①注册 contextProvider（视图状态投影函数）                            │
│   ②注册 viewAction 执行器（白名单原子操作）                            │
│ 新包 ui-view-context：ctx.viewContext 服务（注册面+上报+执行器路由）     │
└───────┬────────────────────────────────────▲────────────────────────┘
        │ tab切换/视图态变化 → RPC session.viewState.report   │ ⑤wire帧 view-action/requested
        ▼（connection api 面）                                │ （host→浏览器，复用 question/requested 同构通道）
┌─ host ───────────────────────────────────────────────────────────────┐
│ apiproxy：session 域扩展 viewState.report → per-session 内存缓存(最新快照)│
│ 新包 packages/context/view-context（参照 time-context）：               │
│   ③挂 agent/pre-step waterfall → 读缓存 → createUserMessage(snapshot)   │
│      「当前工作台视图：tab=知识图谱；选中实体=XX；类型过滤=[供应商]；…」    │
│      + 视图工具用法提示（模型可见⟺logged：snapshot 消息本身落 session log）│
│ 新能力缝 packages/interaction/view-actions（三角色，同构 user-questions）：│
│   Service Definition(ctx.viewActions.apply) + host provider(挂起等浏览器) │
│ 新包 packages/interaction/tool-view-actions（模型面 Consumer）：          │
│   ④工具 view_state_get / view_apply(view+action+args) / switch_view      │
└───────────────────────────────────────────────────────────────────────┘
```

编号对应业务流：①②注册 → tab 切换上报 → ③下一请求注入 → 模型调 ④工具 → 能力缝 → ⑤前端白名单执行 → 结果作为 tool result 回 agent loop（既有回路）→ 视图已变 → 上报刷新缓存。

### 0.2 关键决策表

| 决策点 | 裁决 | 理由（先例/证据） |
|---|---|---|
| 注入机制 | **request-context 插件（`agent/pre-step` + `createUserMessage` form `snapshot`）**，不用 system-prompt registry | time-context/agent-instructions 同构先例（[`time-context/src/index.ts:170-208`](../../packages/context/time-context/src/index.ts:170)）；`ContextFormed.snapshot` 已有 UI 折叠行渲染；system 文本变更触发 request/header change 重语义（00 §3.4-B）；业界=「每请求重算的独立状态块」非 system 常驻（research §3.1 VS Code/Claude Code） |
| 注入内容 | **轻量状态块，几百 tok 固定格式**：当前 tab id/中文名 + 该 tab contextProvider 投影的关键态（kg：选中实体/类型过滤/搜索词/图规模；market：当前资产/分类筛选；business：当前 collection/行过滤；kb：搜索词；connectors：当前 provider；scenarios：当前分类）+ 一句视图工具可用性提示 | 业界三层之①（隐式轻量）；③层全量 JSON 由 `view_state_get` 工具按需拉取；②显式 @ chip 留 K 轮（research 开放问题 1：多 tab 并行无先例，本 Round 只注入当前 tab） |
| 视图状态上报通道 | **apiproxy session 域新 RPC `session.viewState.report`**（UI→host，只存 per-session 内存缓存最新值，不落 log） | 视图态等价于「用户屏幕」，落 log 是噪音；规范只要求**模型可见的**注入消息落 log（snapshot 消息本身 durable，天然合规，00 §3.4-A）；上报量小（<2KB）+ 无鉴权面下低危（只读数据上行） |
| 视图操控工具形态 | **单工具 `view_apply` + per-tab action 枚举**（类型化参数）；辅以 `view_state_get`（读）与 `switch_view`（切 tab） | Grafana ui-mcp-server v2 合并方向（单工具+11 action 枚举，research §3.2）；工具目录不随 tab 功能膨胀；白名单=注册面声明的 action 集合，未注册 fail loud |
| 模型→前端回路 | **能力缝同构复刻 ask_user_question**：模型工具 → `ctx.viewActions.apply()` Service Definition → host provider 经 wire 帧 `view-action/requested` 推浏览器 → ui-view-context 查白名单执行 → 结果回 tool result（挂起-响应同 question 通道） | 最强既有先例（00 §3.3：tool-ask-user→ctx.userQuestions.ask→QuestionComposer→答案回 loop）；SSE 下行+请求-响应回传是业界事实标准（research §3.3）；**不新增反向流** |
| 视图变更会话记录 | **复用既有 `tool/call`+`tool/result`**（模型可见⟺logged 天然满足）；UI 呈现走 `tool.call.toolview` 键槽认领（view_apply 渲染为「已调整视图」行）；不新增 SessionEventMap 事件 | 最小机制；视图操作是可从 log 完整重建的模型可见行为；避免新事件+ignorable 语义负担（视图态本身不入 log，重放不恢复 UI 属预期——重放是对话投影非 UI 复位） |
| 幂等与安全 | action 执行器必须幂等（重复 apply 同参数无二次副作用）；视图操作**默认免审批**（可逆 UI 态）；破坏性数据写仍走 nb_* 确认契约，两体系不混淆 | LangGraph 官方要求（interrupt 前副作用幂等，research §3.3）；Power BI 分级审批先例：破坏性才审批 |
| 「优先 AI」落点 | 前端只提供**原子 action 执行器**（set_type_filter 等）+ 通用注入；**编排逻辑（怎么组合 action 达成用户意图）全部交给模型**，不写死前端流程脚本 | research 张力警示的对冲：白名单是安全边界不是能力边界；批量/组合需求由模型多步调用实现 |
| kgBridge.parkSeeds 预留 | 回收接线或删除（视图操控上线后该预留无存在意义） | 生产零调用者（00 §3.3）；死代码清理 |
| 问数形态 | 对话内问数 = J2 工具族（lakehouse_query/nb_list/kg_query/assets_browse）+ 注入层告知当前 tab 上下文；**视图内问数 = kg 的 `run_phrase_query` action**（AI 构造中文短语→模板编译→图谱直接渲染结果） | 「原生视图+LLM 摘要」双件套先例（Power BI Copilot，research §3.4）；湖仓/资产/业务 tab 的视图渲染问数（改表格内容）本质是 set_filter 类 action，本 Round 给 market/business 的筛选 action；结果表格渲染为视图的能力已有（各 tab 本身） |

### 0.3 分期边界（本 Round 交付 vs 留后）

**J3 交付**：
1. 七 tab 上下文注入全量（chat 视图为普通对话无特殊态，trajectory 不注入——它是调试视图）；
2. 视图操控 action 白名单首批：**kg 全套**（`set_type_filter`/`focus_entity`/`clear_selection`/`run_phrase_query`）、**market**（`select_asset`/`filter_category`）、**business**（`select_collection`/`set_table_filter`）+ 通用 `switch_view`；
3. `view_state_get` 全 tab；
4. 问数三路（对话内工具族 / kg 短语 action / persona+注入层指引）。

**留后（K/L 轮，PLAN 风险与期待管理引用）**：显式 @ 引用 chip（Linear 式钉对象）、`apply_view_patch` 文档型 patch 工具（RFC 6902 子集）、多 tab 并行引用（主 tab+背景 tab 描述）、kb/scenarios/connectors 视图操控 action、generative UI composer 进度呈现、语义层策展（列级 AI Context YAML）、视图状态 compaction 折叠策略。

## 1. 范围

**做**：新包×4（ui-view-context、packages/context/view-context、packages/interaction/view-actions、packages/interaction/tool-view-actions）+ apiproxy session 域扩展 + 七业务 tab 包各注册 contextProvider（+三包注册 action）+ toolview 认领 + kgBridge 清理 + e2e/快照/系统提示。
**不做**：SessionEventMap 新事件、host agent-loop 改动、既有工具行为变化（J2 已覆盖工具面）、composer UI 变化（J1 已覆盖）。

## 2. 实施步骤（三段提交）

### 段 1：上下文注入层（先做——独立可用，立即满足「以当前 tab 为主」的对话体验）

**1a. apiproxy session 域扩展**
- [`packages/host/apiproxy/src/api/`](../../packages/host/apiproxy/src/api/) session 契约新增 `viewState.report`（zod：`{ view: string, snapshot: JsonValue（受限 <4KB）}`）；[`api-proxy.ts`](../../packages/host/apiproxy/src/api-proxy.ts) 实现：per-session `Map`（会话清理时随清，参照 session 域既有 per-session 态管理）；域门控：session 域恒开（不新增开关）。
- [`packages/client/connection/src/client/index.ts:53-103`](../../packages/client/connection/src/client/index.ts:53) `ctx.connection.api` 暴露 `session.viewStateReport`。

**1b. 客户端 ui-view-context 包**
- 新包 `packages/client/ui-view-context`：提供 `ctx.viewContext` 服务（客户端 Service Definition）：
  - `provide({ view, snapshot: () => ViewSnapshot })`——业务包注册投影函数（返回 plain JSON；`ReadonlySet` 等先转数组）；
  - 内部：监听 view 切换（chatStore.view mirror / `activeViewMirror`，[`apply.ts:133-137`](../../packages/client/ui-conversation/src/client/apply.ts:133)）+ provider 内部变化通知（`notify()` 方法供 store 调用）→ 防抖 500ms → `api.session.viewStateReport`。
- 七业务包注册 provider（各自 `index.ts` apply 内，`ctx.effect()`）：
  - ui-kg：`{ selected?: 实体名, typeFilter: string[], search?: 词, nodes/edges 计数 }`（读 [`kgStore.ts:20-33`](../../packages/client/ui-kg/src/client/kgStore.ts:20)，Set→数组）；
  - ui-assets：`{ 当前资产详情 id?/分类筛选/目录计数 }`（组件局部态上提到 marketStore 或经 provider 闭包桥接——若局部态拿不到，最小改造：详情面板打开时调 `viewContext.notify()` 携带局部快照，即 provider 允许 push 式更新）；
  - ui-business：`{ collection: selected, 行过滤? }`（[`bizStore.ts:20-27`](../../packages/client/ui-business/src/client/bizStore.ts:20)）；
  - ui-kb（kb+scenarios 两 view）：`{ 搜索词/选中记录?/场景分类 }`；
  - ui-connectors：`{ 当前 provider/连接数 }`；
  - chat 视图：注入层降级为「当前在对话视图」一行（不注册 provider，插件默认态）。

**1c. host 注入插件 packages/context/view-context**
- 参照 [`time-context/src/index.ts:170-208`](../../packages/context/time-context/src/index.ts:170) 骨架：`agent/pre-step` waterfall（`prepend: true`，调 `next()`）→ 读 per-session 视图缓存 → 无缓存/视图=chat 时注入最简块，否则注入状态块：

```
【当前工作台视图】tab=知识图谱(kg)；选中实体=海天味业；类型过滤=[Supplier, Product]；
搜索=酱油；图规模=节点 214/边 388。用户对话默认针对此视图；
可用 view_apply 调整视图、view_state_get 获取完整状态。
```

- 消息用 `createUserMessage({ content:[{type:'text',text}], source:{ kind:'plugin', plugin:'view-context', form:'snapshot', sections:[{name:'workbench-view', text}] } })`——durable 落 log，UI 折叠行渲染（ContextInjectionRow）。
- 快照仅变化时换文本（缓存 diff：view id+snapshot hash 相同则沿用上次注入文本，避免每轮重复全量块——对齐 research「仅变化时重算」优化）。
- 组合挂载：`examples/kb-agent/cordis.patch.yml` 增 `packages/context/view-context` 插入行（+ web-app bundle 同步，参照既有 context 插件挂载位）；`packages/bundle/web-app/cordis.patch.yml` 加 ui-view-context 浏览器行。
- **系统提示**：插件注册一个 `PromptContext`（order 尾部）说明视图工具族语义（「用户切换工作台 tab 时注入该视图状态；优先用 view_apply 操作视图而非让用户手动」）——静态段，与每请求快照互补（research：约定进 prompt、状态进 snapshot）。

**1d. 测试**：单测（上报防抖/缓存清理/注入格式/diff 跳过）+ kb-agent 快照：真实会话切 kg tab 后发问，transcript 出现 snapshot 注入块（`pnpm dsh --profile headless` 或 e2e）。

### 段 2：视图操控能力缝（核心新机制）

**2a. Service Definition `packages/interaction/view-actions`**
- 服务接口 `ctx.viewActions.apply({ view, action, args }): Promise<ViewActionResult>`（结果=执行后状态摘要 + restated）；配套类型 `ViewActionDescriptor`（view/action/args schema）。
- host provider：把请求转 wire 帧 `view-action/requested`（带 requestId）推浏览器，挂起等待 `view-action/respond` 回传（超时 30s fail loud「前端不可达」——浏览器 tab 关闭/视图未挂载时模型收到可读失败）；**逐帧复刻 user-questions 的 wire 关联实现**（实施第一步先读 [`packages/client/runtime/src/client/sessions/session.ts:472-511`](../../packages/client/runtime/src/client/sessions/session.ts:472) 与 user-questions 浏览器侧回传代码，列出通道清单再动手——本段不预设回传细节，以既有 question 应答通道为唯一模板）。

**2b. 模型面工具 `packages/interaction/tool-view-actions`**
- `view_apply`：`{ view: enum[7], action: string, args: object }`——action 校验经 host 侧已注册的 action 目录（浏览器上报 action 注册清单随 viewState 缓存或独立 `view-actions.catalog` RPC，第 0 步裁决）；未注册 action 即时失败（模型可读指引）。
- `view_state_get`：`{ view?: enum }`——返回完整视图状态 JSON（per-tab provider 全量投影）。
- `switch_view`：`{ view: enum }`——host 直接改会话视图状态？**裁决：switch_view 也走前端**（切 tab 是浏览器 chatStore.view 持久化，host 不持有）——经 view-action 通道统一。
- 三工具 `tool:*` section + render intent `generic`（toolview 由段 2d 认领升级）。
- 挂载：examples/kb-agent `cordis.patch.yml` 工具行 + **30 场景与角色 preset 同步挂载**（J2 建立的全量对齐惯例；scenarios 快照 20→23）。

**2c. 前端执行端（ui-view-context 扩展）**
- `ctx.viewContext.registerActions({ view, actions: { name → (args, ctx) => summary } })`；订阅 wire `view-action/requested` 帧 → 查白名单 → **视图未挂载时自动 switch_view 先行**（切到目标 tab 再执行——模型无需两步）→ 执行器调 store action → 回传 `{ ok, summary }`。
- 首批 action（0.2 节清单）：
  - ui-kg：`set_type_filter`(类型数组，写 `kgStore.typeFilter`)/`focus_entity`(实体名→selected+居中，复用既有选中逻辑)/`clear_selection`/`run_phrase_query`(中文短语→`api.kg.query`（J2 下沉后共用编译器）→图谱渲染结果子图——**这是 kg 视图内问数**);
  - ui-assets：`select_asset`(id→打开详情)/`filter_category`(分类);
  - ui-business：`select_collection`(collection 名→bizStore.selected)/`set_table_filter`(过滤词)。
- 幂等：所有执行器纯状态写入（重复执行结果一致）；`run_phrase_query` 重复执行=重渲染。
- 回收 [`kgBridge.ts`](../../packages/client/ui-kg/src/client/kgBridge.ts:17) parkSeeds（删除或注释引用迁移，测试同步）。

**2d. toolview 认领**：ui-view-context 注册 `tool.call.toolview` 键 `view_apply`/`view_state_get`/`switch_view`（渲染「已将图谱过滤为 [Supplier]」摘要行，读工具 args/result 纯函数投影，[`ui-tool/contract/slots.ts:8-25`](../../packages/client/ui-tool/src/client/contract/slots.ts:8)）。

**2e. 测试**：单测（白名单 fail loud/超时/未挂载自动切换/wire 关联）+ e2e（见验收）。

### 段 3：问数收口与系统提示对齐

- 默认+场景 persona 补一段「tab 上下文」指引（切 tab 问数时优先用注入的视图上下文；调整视图用 view_apply；不要让用户手动操作）；`tool:*` 段与 1c 的 PromptContext 术语一致（同一套 view/action 词汇表）。
- 快照再生（scenarios/kb-presets 工具数变化）+ verify 计数断言更新。

## 3. 验收标准（J3 完成 definition）

1. **上下文注入真机**：切到图谱 tab 选中实体 A → 输入「这个对象还和谁有供应关系」→ transcript 出现【当前工作台视图】快照块且回答针对 A（对照：不注入时模型会反问哪个对象）；七 tab 逐一验证注入块内容正确（chat 除外）。
2. **视图操控真机（AI 实调）**：图谱 tab 输入「只显示供应商类型」→ 模型调 `view_apply(kg, set_type_filter, [Supplier])` → 图谱过滤实际变化（截图前后对照）；「聚焦海天味业」→ 居中选中；「查一下供应酱油原料的供应商并展示」→ `run_phrase_query` 图谱渲染结果。
3. **switch_view**：在 kb tab 输入「带我去看知识图谱」→ 自动切到 kg tab。
4. **问数**：market tab「这个资产目录里合规类有几项」→ `assets_browse`/`nb_list` 作答；business tab「SRM 供应商证照即将过期的有哪些」→ `nb_list` 过滤作答（注入块含当前 collection）。
5. **幂等**：同一 `view_apply` 重复调用两次，视图终态一致（e2e 断言）。
6. **fail loud**：未注册 action 名、浏览器离线（模拟 wire 断开）工具返回可读错误不崩 loop（单测+e2e）。
7. 快照链（scenarios 23 工具/kb-presets）二跑零漂移；typecheck/lint EXIT=0；`pnpm run test` 相关面包全绿。
8. **模型可见⟺logged 抽查**：重放会话（test:snapshot 或 replay），snapshot 注入块与 tool call/result 从 log 完整重建。

## 4. 风险与回退

| 风险 | 等级 | 预案 |
|---|---|---|
| wire 请求-响应回路实现复杂度（view-action 关联/超时/乱序） | 高 | 段 2a 第 0 步强制先列 user-questions 通道清单再复刻；30s 超时 fail loud；e2e 断连场景 |
| 每请求注入 token 成本 | 中 | 几百 tok 固定格式 + hash diff 跳过；ContextMeter 可观测；J4 实测量化 |
| 浏览器多 tab/离线时工具挂起 | 中 | 超时+可读失败；模型可改答文本指引（提示词说明前端不可达时降级） |
| action 白名单与「优先 AI」张力（用户期望无限操控） | 中 | PLAN 期待管理明示边界与 K 轮 patch 工具路线；首批 action 覆盖高频意图（过滤/聚焦/查询/切换） |
| viewState 上报面被滥用（无鉴权层） | 低 | 只读数据上行、<4KB 限幅、session 域内清理；不接受任何下行执行语义（执行只经 view-action 通道） |
| 场景会话工具 20→23 再膨胀 | 低 | verify 断言固化；persona 精简段对冲 |
| 回退 | — | 三段独立提交（注入层/能力缝/收口）可分段 revert；注入层单独已交付用户价值 |
