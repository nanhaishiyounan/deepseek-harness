# 移动端 v5「AI Workmate」· 实现规格

> 日期：2026-09-22 | 作者：设计流程 Agent（只做设计，不写代码） | 上游：[02-information-architecture.md](02-information-architecture.md) 交互协议（本文是其工程落地面）；[01-design-and-impl.md §2](../../../plans/2026-09-22-mobile-v5-aiworkmate/01-design-and-impl.md) 实现范围 | 基线：ui-mobile 现状（[router.ts](../../../packages/client/ui-mobile/src/client/router.ts) / [MobileShell.tsx](../../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx) / [protocol.ts](../../../packages/client/ui-mobile/src/client/protocol.ts) / [fold.ts](../../../packages/client/ui-mobile/src/client/fold.ts) / [sessionsService.ts](../../../packages/client/ui-mobile/src/client/sessionsService.ts) / [colleagues.ts](../../../packages/client/ui-mobile/src/client/colleagues.ts)，tests/ 现有 18 个 spec 文件） | 视觉规格（token/组件皮肤）归 03-visual-design.md，本文不重复

## 1. 文件级改动清单

### 1.1 新建（packages/client/ui-mobile/src/client/）

| 文件 | 职责 |
|---|---|
| `workStore.ts` | 工作项 CRUD、四态状态机守卫、订阅通知、派生选择器、localStorage `dsh-mobile-work` 读写、工作会话隔离集合（§2） |
| `demoSeed.ts` | 首启 seed（团队任务/文件/收藏，全带 demo 标记）+ 团队成员常量 + 清除演示数据 |
| `actions.ts` | `dispatchReportAction` 统一执行器（02 §5 协议落地）+ 构建动作消息文本（M1/M3 模板） |
| `work/workTimeline.ts` | 两态执行时间线数据源（TimelineDataSource 抽象，§4） |
| `runMode.ts` | live/demo 判定（显式开关 + llm.models 探测，§4.3） |
| `home/HomeView.tsx` + `home/home.module.css` | 首页（02 §2.1） |
| `work/WorkView.tsx` | 工作四态列表（02 §2.4） |
| `work/WorkDetailView.tsx` + `work/work.module.css` | 工作详情（上下文卡/时间线/结果/操作区，02 §2.5） |
| `work/TaskFormModal.tsx` | 任务表单弹层（02 §6） |
| `tasks/TasksView.tsx` + `tasks/tasks.module.css` | 我的/团队任务（02 §2.6） |
| `files/FilesView.tsx` + `files/files.module.css` | 文件三分区（02 §2.7） |
| `agents/AgentsView.tsx` + `agents/agents.module.css` | AI 同事目录（02 §2.8） |
| `messages/ReportCard.tsx` | report 卡渲染（metrics 网格/rows/table/actions，02 §4.4） |
| `shell/transitions.css` | 全局 keyframes（fadeIn/slideInRight）+ prefers-reduced-motion 降级（02 §7.1） |

### 1.2 修改（packages/client/ui-mobile/）

| 文件 | 改动 |
|---|---|
| [router.ts](../../../packages/client/ui-mobile/src/client/router.ts) | `MobileRoute.name` 扩九值；`work` param 分支（与 chat 同构）；默认路由 `home`；`LEGACY_HEADS` 第三代落点（02 §1.3 表：workbench→work、contacts→agents，余四项维持） |
| [shell/MobileShell.tsx](../../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx) | TabBar 四项（lucide：Home/Users→同事、MessageSquare→对话、ClipboardList→工作、User→我的）；chrome 改 TAB_ROUTES 白名单；九路由视图分发；`<main key={routeKey} data-transition>` 转场挂载；login 后落 `#/` |
| [protocol.ts](../../../packages/client/ui-mobile/src/client/protocol.ts) | `ReportPayload` 及子类型；`parseReport` 校验（02 §4.3 规则表）；`DshPayload` union 扩 `ReportPayload` |
| [fold.ts](../../../packages/client/ui-mobile/src/client/fold.ts) | `ChatReport` item；foldAssistantText switch 增 report 分支；deriveAnswered 把 report 计入 retire 集 |
| [sessionsService.ts](../../../packages/client/ui-mobile/src/client/sessionsService.ts) | `subtitleOf` 消除裸 preset id 直出（roster name / colleagues duty 兜底）；rpc 方法白名单（[rpc.ts](../../../packages/client/ui-mobile/src/client/rpc.ts)）按需增 `llm.models` |
| [colleagues.ts](../../../packages/client/ui-mobile/src/client/colleagues.ts) | COLLEAGUES 表扩至四 preset 条目（§6） |
| [messages/ChatView.tsx](../../../packages/client/ui-mobile/src/client/messages/ChatView.tsx) | report item 渲染分支；dispatch 接线（TaskFormModal 状态提升）；NavBar back 改 history.back 兜底（02 §7.2）；demo typing 分支 |
| [messages/MessagesView.tsx](../../../packages/client/ui-mobile/src/client/messages/MessagesView.tsx) | 行过滤增工作会话排除；其余 v4 资产零改动 |
| [messages/projection.ts](../../../packages/client/ui-mobile/src/client/messages/projection.ts) | `lastProjectionOf` 增 report 分支（「报告：{title}」） |
| [profile/ProfileView.tsx](../../../packages/client/ui-mobile/src/client/profile/ProfileView.tsx) | 增工作空间区 / AI 偏好（run mode 开关）/ 通知开关 / 清除演示数据（02 §2.9） |
| [login/LoginView.tsx](../../../packages/client/ui-mobile/src/client/login/LoginView.tsx) | 删除 JWT 假注释，如实描述 demo 通道（PLAN D6） |
| README.md / README.zh.md | IA 段重写：十路由 + 四 Tab + 工作闭环 + 两态说明 + 已知限制扩展（工作数据本地态、隔离跨设备失效） |
| tests/（§7 测试计划逐文件） | 新建 7 个 spec、改造 6 个既有 spec |

### 1.3 仓库其他位置

| 文件 | 改动 |
|---|---|
| [apps/web/src/mobile.ts](../../../apps/web/src/mobile.ts) | "four-tab" v1 遗留注释改为 v5 实况（四 Tab 语义已变） |
| [examples/kb-agent/QUICKSTART.zh.md](../../../examples/kb-agent/QUICKSTART.zh.md) | 「四 Tab：消息、工作台、数据、我的」漂移段清理为 v5 实况 |
| examples/kb-agent/agent-presets/mobile-form-assistant/{agent.cordis.yml, preset.yml} | persona 增 report 围栏教学段（§5.1）；welcome 能力行与 starters 微调 |
| examples/kb-agent/agent-presets/business-advisor/{agent.cordis.yml, preset.yml} | persona 增 report 围栏教学段（§5.2）；preset.yml 补 welcome（现状缺） |
| packages/client/ui-mobile-preview/README（如叙述涉及路由） | 路由描述同步 |
| .agents/notes/implemented/architecture/（新 Note） | v5 IA 重构决策记录（三代折叠落点变更、report 围栏、workStore 双源边界） |

删除项：无（v3 已删 ContactsView；v5 全部为新建 + 修改）。

## 2. workStore schema（`workStore.ts`）

### 2.1 完整类型

```typescript
/** 工作四态。 */
export type WorkStatus = 'todo' | 'doing' | 'review' | 'done'

/** 执行结果（doing→review 时写入）。 */
export interface WorkResult {
  readonly summary: string        // 结果一句话（assistant 尾消息截断）
  readonly finishedAt: number     // epoch ms
}

/** 一条工作任务。 */
export interface WorkItem {
  readonly id: string             // 'w_' + Date.now().toString(36) + 随机后缀，本地生成
  readonly title: string          // 非空
  readonly owner: string          // 团队成员名或 identity.name
  readonly due: string | undefined     // 'YYYY-MM-DD' 或未定
  readonly suggestion: string | undefined  // AI 建议只读文本（report row hint）
  readonly status: WorkStatus
  /** 源会话（report 卡所在）；手动新建时无。 */
  readonly sourceSessionId: string | undefined
  /** 源消息锚（report 所在 assistant 消息 seq 字符串化）。 */
  readonly sourceAnchor: string | undefined
  /** 执行会话（隔离标记）；真实态执行启动后写入。 */
  readonly execSessionId: string | undefined
  /** 执行结果；review 起存在。 */
  readonly result: WorkResult | undefined
  /** 工作产物（FilesView 投影源）；执行完成时由 result 携带或 report 回填。 */
  readonly artifact: ReportPayload | undefined
  /** 产物收藏（纯 UI 本地态）。 */
  readonly pinned: boolean
  /** 首启演示 seed 标记。 */
  readonly demo: boolean
  readonly createdAt: number
  readonly updatedAt: number
}

/** localStorage 'dsh-mobile-work' 的完整形状（version 字段供未来迁移判别）。 */
export interface WorkStoreShape {
  readonly version: 1
  readonly items: readonly WorkItem[]
  /** 工作会话隔离集合（含已删项残留的会话 id，过滤用）。 */
  readonly execSessionIds: readonly string[]
  /** 首启 seed 已写入。 */
  readonly seeded: boolean
}
```

### 2.2 CRUD 与状态机转移（函数签名）

```typescript
/** 合法转移表（状态机守卫的唯一依据）。 */
const TRANSITIONS: Readonly<Record<WorkStatus, readonly WorkStatus[]>> = {
  todo: ['doing'],
  doing: ['review'],
  review: ['doing', 'done'],
  done: [],
}

function createWorkItem(input: {
  title: string
  owner: string
  due?: string
  suggestion?: string
  sourceSessionId?: string
  sourceAnchor?: string
  status?: WorkStatus            // 缺省 'todo'；'doing' 用于「立即执行」
  demo?: boolean
}): WorkItem
function updateWorkItem(id: string, patch: Partial<Omit<WorkItem, 'id' | 'createdAt'>>): WorkItem
/** 状态转移；非法转移抛 Error（TRANSITIONS 守卫），updatedAt 刷新。 */
function transitionWorkItem(id: string, to: WorkStatus): WorkItem
function deleteWorkItem(id: string): void
/** 登记执行会话（隔离集合 + 工作项 execSessionId 同步写）。 */
function registerExecSession(workId: string, sessionId: string): void
/** 工作会话过滤谓词（MessagesView/HomeView 复用）。 */
function isWorkSession(sessionId: string): boolean
```

持久化：每次写操作后整体序列化写 `dsh-mobile-work`（条目量级 <10²，整体写无性能问题）；读失败（损坏 JSON / version 不识）重置为空 store 并标记 seeded（fail loud 于 console，不崩页面）。

### 2.3 订阅通知

```typescript
/** workStore 写操作后广播；返回退订函数。模块级 listener Set（jsdom 可测）。 */
function subscribeWork(listener: () => void): () => void
/** 当前快照（幂等读）。 */
function workSnapshot(): WorkStoreShape
```

HomeView/WorkView/WorkDetailView/TasksView/FilesView/ProfileView 经 `useSyncExternalStore(subscribeWork, workSnapshot)` 联动刷新（React 18 原生方案，免自研 hook）。

### 2.4 派生选择器（纯函数）

| 选择器 | 签名 | 说明 |
|---|---|---|
| `todayStats` | `(items, now) => { todo, doing, review, doneToday }` | 首页/我的统计；doneToday = done 且 finishedAt 在今日 |
| `byStatus` | `(items, status) => WorkItem[]` | updatedAt 倒序 |
| `workOf` | `(items, id) => WorkItem | undefined` | 详情页取项 |
| `myTasks` / `teamTasks` | `(items, myOwner) => WorkItem[]` | owner 等于/不等于当前 identity.name |
| `fileProjections` | `(items) => FileCardRow[]` | artifact 存在的项投影（AI 生成区；pinned 单列收藏区） |

## 3. 「模型可见⟺日志可重建」红线落地点

哪些动作必须发真实 user 动作消息（`promptSession`，`source.kind='user'` 天然成立）；模板常量集中于 `actions.ts`：

| # | 时机 | 目标会话 | 模板（{title}/{owner}/{due}/{suggestion}/{summary}/{reason} 插值） |
|---|---|---|---|
| M1 | TaskFormModal 提交（源会话存在） | 源会话 | `已创建处理任务：{title}，负责人 {owner}，截止 {due|未定}。请知悉。` |
| M2 | todo→doing（真实态执行启动） | 执行会话（首条即指令） | `执行工作任务：{title}。背景：{suggestion|无}。完成后给出结果摘要。` |
| M3 | doing→review（前端检测完成） | **源会话** | `工作已完成：{title}。结果摘要：{summary}。请确认。` |
| M4 | review→doing（打回） | 执行会话 | `该工作需要返工：{reason|请复核并修正}。` |

不发消息的显式裁决：review→done（确认）不发——M3 已告知 AI，确认是用户管理动作；纯 UI 态（收藏/置顶/已读/演示开关/run mode）不发。seed 会话（e2e keyless 回放）中 M1/M3 由 seed jsonl 预置，断言模板文本存在。

## 4. 两态策略实现规格

### 4.1 TimelineDataSource 抽象（`work/workTimeline.ts`）

```typescript
/** 时间线一步（执行过程的一行）。 */
export interface TimelineStep {
  readonly label: string                  // '读取项目风险记录'
  readonly state: 'running' | 'done' | 'error'
  readonly detail?: string                // 结果摘要一行
}

/** 订阅式数据源：WorkDetailView 经 useSyncExternalStore 消费。 */
export interface TimelineDataSource {
  readonly steps: readonly TimelineStep[]
  readonly finished: boolean              // true = running 全部落定（可翻 review）
  readonly resultSummary: string | undefined   // finished 时的结果一句话
  subscribe(listener: () => void): () => void
}

/** 真实态：轮询执行会话（readHistory + foldHistory），tool 行投影为 steps
 *  （label 取 fold 的 TOOL_LABELS 中文），assistant 尾消息为 resultSummary；
 *  running→idle 且存在 assistant 尾消息 = finished。 */
export function liveTimeline(sessionId: string): TimelineDataSource

/** 演示态：setTimeout 序列推进固定步骤脚本（读取→汇总→起草→完成），纯内存态。 */
export function demoTimeline(title: string): TimelineDataSource
```

WorkDetailView 按 run mode 与 `execSessionId` 有无选择实现：live 且有 execSessionId → liveTimeline；demo → demoTimeline。组件只消费接口（02 §10.2「同一组件、数据源切换」）。演示态完成时的 doing→review 转移由 demoTimeline finished 驱动，M3 仍发源会话（若存在）。

### 4.2 ChatView 演示态 typing

demo 模式且 `promptSession` 发出后 2.5s 内无新事件（轮询 items 长度不变）→ 渲染「正在思考…」行；新事件到达即撤。纯渲染态，无 log 写入，无 setTimeout 残留（组件卸载清理）。

### 4.3 run mode 判定（`runMode.ts`）

1. `localStorage['dsh-mobile-runmode']` 显式值（'live' | 'demo'）优先——ProfileView AI 偏好开关读写；
2. 未设时自动探测一次 `rpc('llm.models', {})`：成功且目录非空 → live；失败或空 → demo；模块级缓存结果；
3. fail-safe：探测异常一律 demo（宁可演示不冒充真实）；探测假阳性（无 key 仍返回目录）时用户可显式切 live 排除——**实现期校准点**：若 llm.models 语义不符预期，去掉第 2 步仅保留显式开关，本条裁决记录于 Agent Note。

## 5. preset persona 改写文本草案

### 5.1 mobile-form-assistant（agent.cordis.yml persona 增段，紧跟现有工作流第 6 步后）

```yaml
      报告围栏（风险/统计/汇总/对比/周报类问题的结构化输出）：
      - 何时输出：用户问的是「有什么风险/概览/汇总/对比/清单」类问题（非单据登记），且答案含至少一组数字指标或两条以上并列条目时，输出一个 report 围栏；登记流程（草稿/回执）永远不用 report。
      - 围栏格式（一个 ```dsh 围栏，值一律字符串）：
         {"v":3,"type":"report","id":"r_<序号>","title":"<卡头标题，如 项目风险>","subtitle":"<可选副题，注明数据口径或来源>","metrics":[{"label":"待处理","value":"5","kind":"count","tone":"warning"}],"rows":[{"label":"<条目主文案>","hint":"<一行补充>","level":"high|medium|low"}],"table":{"columns":[{"label":"<列名>"}],"rows":[["<单元格>"]]},"actions":[{"kind":"create-task","label":"创建处理任务","title":"<取自本报告某条目>","suggestion":"<该条目的处理建议>"}]}
      - 条数上限（超限整卡无法渲染，输出前自查）：metrics 1-6 条、rows 最多 8 条、table 列最多 5 列 10 行、actions 最多 4 枚；table 与 rows 按内容择一，不要同时铺。
      - actions 语义约束：kind 只能取 view / create-task / send / link。view 的 route 必须是产品内路由（#/work、#/tasks、#/files、#/chats、#/ 之一）；create-task 的 title 与 suggestion 必须来自本报告已有的条目，不得虚构新事实；send 的 text 是一句完整的用户指令（如后续追问、催办话术）；link 仅用于确有外部文档地址时，没有就不放。
      - 正文纪律（延续）：围栏之外只说人话——开头一句总括即可，禁止在叙述里复读 metrics/rows 的全部数字，禁止出现 JSON、hub_ 表名、snake_case 字段名；围栏内容不重复出现在叙述里。围栏是消息收尾，前置叙述不超过两句，一次完整闭合。
```

preset.yml 同步：capabilities 增一行「风险、汇总、对比类问题我会给结构化报告卡，可一键变成任务跟进」；starters 增 `{ label: 整理项目风险, send: 帮我整理一下现在的项目风险 }`。

### 5.2 business-advisor（agent.cordis.yml persona 增段）

```yaml
      报告围栏（经营概览/风险提示/对比类回答的结构化输出）：
      - 何时输出：经营概览、风险提示、供应商/采购对比等含数字指标或多条结论的问答，输出 report 围栏；单点事实问答（一个数字、一条记录）不用。
      - 围栏格式与条数上限：与填表助手契约一致（metrics 1-6、rows ≤8、table 列 ≤5 行 ≤10、actions ≤4；值一律字符串；v:3、type:report）。
      - 数据来源纪律：subtitle 或 rows 的 hint 必须注明数据来源（湖仓表/知识库/图谱），延续「结论注明来源」的只读纪律；指标值来自真实工具查询结果，禁止编造。
      - actions 语义约束：优先 create-task（跟进事项，title 取自风险条目）与 send（按供应商拆开看、和上月比呢等追问指令）；view 仅限 #/work、#/tasks、#/files、#/chats、#/。
      - 正文纪律：围栏外一句总括；数据口径说明放 subtitle，不占正文；围栏一次完整闭合。
```

preset.yml 补 welcome 块（现状缺失，[business-advisor/preset.yml](../../../examples/kb-agent/agent-presets/business-advisor/preset.yml) 无 welcome，走本地表兜底）：greeting「我是经营参谋」、capabilities 两行 +「风险与对比结论给结构化报告卡」、starters 维持问经营/问采购。

### 5.3 教学段与已有纪律的关系

新增段不改动 v3 六步工作流与围栏输出纪律（ask/form 类契约原样）；report 与登记是互斥分支（登记流程永不 report、report 流程永不 form_draft），教学文本双向写明，避免模型混用。

## 6. agents 页角色映射实现细节

[COLLEAGUES 表](../../../packages/client/ui-mobile/src/client/colleagues.ts) 从 2 条目扩至 4（现状 enterprise-data-assistant / food-compliance-officer 走 FALLBACK「AI」，且 [subtitleOf](../../../packages/client/ui-mobile/src/client/sessionsService.ts) 裸 preset id 直出）：

| preset id | acronym | color | duty（一句话） | welcome 能力行 |
|---|---|---|---|---|
| mobile-form-assistant | 表单 | #0b5d56（维持） | 单据登记与任务执行 | 现有注册表投影 + report 行（§5.1） |
| business-advisor | 参谋 | #5c716d（维持） | 经营洞察问答（只读） | 现有 + report 行（§5.2） |
| enterprise-data-assistant | 数据 | #3d5a80 | 企业数据问答与统计建议 | 「问企业档案、走访纪要、市场与供应链数据」「统计建议给结构化报告卡」「变更记录经确认后落库」 |
| food-compliance-officer | 合规 | #7a5c3e | 食安法规问答与审核要点 | 「GB 2760/GB 14881 等法规问答」「编号引用原文」「输出审核要点清单」 |

- roster name（preset.yml 的 name）是角色卡主标题的唯一来源（零虚构）；duty/acronym/welcome 是视觉富化，FALLBACK 兜底语义不变；
- `subtitleOf` 改为：`summary.agentPreset === undefined ? '本地会话' : (roster name 缓存 ?? colleagueOf(preset).duty)`——消除「AI 同事 · enterprise-data-assistant」式裸 id 直出；
- AgentsView 角色卡数据 = `listAiEmployees()`（roster）join COLLEAGUES 视觉表；「发消息」走 `createSession(preset)` → `#/chat/:id`（[ProfileView SHORTCUTS](../../../packages/client/ui-mobile/src/client/profile/ProfileView.tsx) 同款真实链路）。

## 7. 测试计划

### 7.1 单测（packages/client/ui-mobile/tests/）

| spec 文件 | 新建/改造 | 覆盖 |
|---|---|---|
| router.client.spec.ts | 改造 | 九路由解析（含 work param、query 保留）、默认 home、第三代折叠落点表逐 head 断言（workbench→work、contacts→agents） |
| protocol.client.spec.ts | 改造 | parseReport 合法样本 / 缺 id-title / metrics 越限 / rows 越限 / actions 判别字段缺失 → 各自降级 undefined；DshPayload union 收纳 |
| fold.client.spec.ts | 改造 | report 围栏分发 → ChatReport；叙述 + report + 既有围栏混排顺序；损坏 report → degraded；report retire 未答 ask；projection「报告：{title}」分支 |
| work-store.client.spec.ts | 新建 | CRUD、TRANSITIONS 守卫（非法转移抛错、done 终态）、持久化往返、execSessionIds 双写与 isWorkSession、subscribe 广播、损坏 JSON 重置 |
| action-dispatch.client.spec.ts | 新建 | 四类 dispatch 正常路径 + 错误路径（route 白名单外 / send 失败 / link 非法）；M1/M3 模板插值 |
| work-timeline.client.spec.ts | 新建 | liveTimeline 折影（tool→steps、idle+尾消息→finished）；demoTimeline 步骤推进与 finished |
| run-mode.client.spec.ts | 新建 | 显式开关优先、llm.models 探测两分支、探测异常 fail-safe demo |
| demo-seed.client.spec.ts | 新建 | 首启 seed 幂等（seeded 标记）、demo 全标、清除演示数据只删 demo 项 |
| report-card.client.spec.tsx | 新建 | metrics/rows/table/actions 渲染映射、按钮回调 dispatch、tone/level 语义类名 |
| task-form.client.spec.tsx | 新建 | 表单校验、提交副作用链（mock workStore/promptSession：create→M1→Toast→navigate 顺序、M1 失败不回滚） |
| views.client.spec.tsx | 改造 | HomeView（统计/chips/同事横滑/最近对话过滤）、WorkView 四态、WorkDetailView 操作区按状态切换、TasksView 我的/团队、FilesView 三分区、AgentsView 角色卡（stub roster） |
| services.client.spec.ts | 改造 | subtitleOf 视觉名映射（stub roster） |
| projection.client.spec.ts | 改造 | report 分支（随 fold 改造并入，若无独立用例并入 fold-branches） |

coverage 基线：ui-mobile src 全树 per-file 100% 无豁免维持；v8-ignore 净增 ≤10/批（转场 key remount 分支、runMode 探测异常分支是预算内候选）。

### 7.2 e2e（apps/web/tests/）

| 文件 | 改动 |
|---|---|
| mobile-shell.e2e.ts | 四 Tab 断言（AI同事/对话/工作/我的）；十路由可达走查；默认路由 home |
| mobile-assistant.e2e.ts | golden 重录（aria 快照含 report 卡业务语言文本）；新增 report-seed.jsonl（风险问答会话：user 问 + assistant 带 report 围栏 + M1 创建消息 + M3 完成消息）回放用例；负断言全量保留并扩展 |
| mobile-preview-iframe.e2e.ts | golden 重录（新路由下 iframe 快照） |

### 7.3 负断言扩展清单（协议不可见，逐条进 e2e）

1. body 无 ```` ```dsh ```` 围栏（既有，保留）；
2. 无 `hub_*` 表名（既有，保留）；
3. 无 `nb_create` 字样（既有，保留）；
4. 无裸 JSON（`{"v":3` 等，既有，保留）；
5. welcome 零冒名：新建会话 user/message 数为 0（既有，保留）;
6. **新增**：report 协议词不可见——body 无 `"kind"`、`"tone"`、`"payload"`、`"metrics"`、`"rows"` 字符串（业务语言卡面不出现协议字段名）；
7. **新增**：动作消息人类可读——M1/M3 出现「已创建处理任务：」「工作已完成：」前缀，且不伴随围栏文本。

### 7.4 命令（B1 批次门禁，遵循 dsh-pre-push-checks 最小集）

```sh
pnpm vitest run packages/client/ui-mobile
pnpm run typecheck && pnpm run lint
pnpm run test:web -- mobile
```

## 8. 实现顺序建议（B1 内部批次）

1. router + MobileShell + transitions.css（九路由骨架先立，旧视图先挂 chats/me，逐页替换）；
2. workStore + demoSeed + runMode（数据层与单测先行的 R1 缓解）；
3. protocol/fold/projection（report 协议面 + 单测）；
4. ReportCard + actions + TaskFormModal + ChatView 接线；
5. WorkView/WorkDetailView（含 workTimeline 两态）/TasksView/FilesView/AgentsView/HomeView/ProfileView 扩展；
6. persona 教学段 + preset.yml + 文档主体（README 双语/QUICKSTART/两处注释/Agent Note）；
7. e2e golden 重录 + 负断言扩展 + 截图落盘（交 05-self-test-evidence.md 与 B2）。
