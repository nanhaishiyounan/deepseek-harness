# Agent Note: Tab-aware view context and the view-actions capability seam (J3)

Status: implemented

[English](2026-09-16-view-context-capability-seam.md) | 中文

## Problem

用户验收诉求（J 轮诉求 3）：切换工作台 tab 后对话上下文以当前 tab 为主；通过输入框能对知识图谱做智能调整与问答问数；「优先 AI」。业界先例（research/2026-09-16-tab-aware-context-architecture.md，约 90 个一手来源）：三层结构（隐式轻量状态块 + 显式引用 + 按需全量拉取）与「白名单语义工具 + SSE 下行 + 请求-响应回传」是头部产品收敛共识；通用 DOM/computer-use 操控被一致否定用于自家界面。

## Decision

### 三层架构

1. **注入层** `packages/context/view-context`：`ctx.viewState` per-session 内存缓存（视图态=用户屏幕，永不落 log；`session/disposed` 随清）+ `agent/pre-step` waterfall（time-context 同构，prepend + `next()`）注入 durable【当前工作台视图】snapshot 消息（`form:'snapshot'` 折叠行渲染）。文本级 diff 跳过：快照未变则沿用上一条注入，不追加重复块。模型可见⟺logged 由注入消息本身的 durable 性满足——缓存不入 log 是设计而非遗漏。
2. **上行**：新 RPC `session.viewStateReport`（apiproxy session 域；<4KB 限幅；无 view-context 插件时 fail loud `view-state-unavailable`）。浏览器侧 `packages/client/ui-view-context` 提供 `ctx.viewContext`（provider 注册 + 500ms 防抖上报 + action 目录随报）。
3. **拉取**：`view_state_get` 工具读缓存全量（含 stale 位），不新增反向流。

### 能力缝 view-actions（question 通道的同构复刻）

- Service Definition `packages/interaction/view-actions`：单 provider 槽 + 调用方存活边界（CALLER_NOT_LIVE/DELEGATED_CALLER 与 ask() 同义）。
- host provider 在 apiproxy：`view-action/requested`/`view-action/resolved` mux 帧、`/api/respond` client-response 路由（会话关联校验）、mux-open 基线重放、30s 超时（`viewActionTimeoutMs` 可配）与 abort/dispose/session-removal 四路取消。目录门：浏览器上报的 action 目录缓存于 viewState，未注册 action 在进 wire 前 fail loud（UNKNOWN_ACTION，报 known 清单）；`switch_view` 为宿主内置例外。
- 模型面 `packages/interaction/tool-view-actions`：`switch_view`/`view_apply`/`view_state_get` 三工具；视图操控免审批（可逆 UI 态），破坏性数据写仍走 nb_* 确认契约。
- 浏览器执行端：ui-view-context 的 serve 循环消费 runtime 新增的 `PendingWait<'viewAction'>`（v: 前缀；不进侧边栏 amber-dot 状态，视图动作是自动浏览器工作而非用户阻塞）。跨视图 action 先自动 switch 再执行；执行器幂等（纯 store 写入）。toolview 行认领三工具键。

### 首批 action

kg 全套（set_type_filter/focus_entity/clear_selection/run_phrase_query——后者即「视图内问数」：中文短语→kg-nl 模板编译→画布渲染子图）；market（select_asset/filter_category，hoisted store 字段）；business（select_collection/set_table_filter）。挂载：30 场景 + 2 角色 preset + kb-agent host patch；快照 20→23 再生。

## Notes

## 真机暴露的两个坑（关键经验）

1. **模块应用顺序**：业务包在 ui-view-context 之前 apply 时 `ctx.get('viewContext')` 为 undefined、注册静默跳过——actions 目录为空、一切 view_apply 报 unknown action。修复：注册改 `ctx.inject(['viewContext'], …)` 延迟激活（服务到位即注册），不依赖 bundle 顺序。`dsh.client.inject` 里的依赖声明只影响打包图，不保证运行时 apply 顺序。
2. **模型参数嵌套数组不稳定**：模型/适配器链路对 tool 参数里的数组序列化不一致（`["Supplier"]` 反复被拒、裸字符串直达）。模型可见工具边界的执行器应对列表参数做容错解析（string[] 或分隔字符串），错误消息注明两种形态。

3.（流程）浏览器侧改动必须 `pnpm exec tsdown` 重建对应 client bundle 并重启网关再 reload 页面——source 变更不会热到达已服务的 lib。

## 模型可见⟺logged 的满足方式

视图态不落 log（重放是对话投影非 UI 复位）；模型可见的注入块本身是 durable user/message（重放可完整重建）；view_apply 的调用与结果复用既有 tool/call+tool/result 事件，不新增 SessionEventMap 事件（避免版本 bump 与 ignorable 语义负担）。

## 边界与分期（K/L 轮候选）

显式 @ 引用 chip、`apply_view_patch`（RFC 6902 子集）、多 tab 并行引用、kb/scenarios/connectors 操控 action、语义层策展（列级 AI Context）留后。视图态缓存过期策略（maxAgeMs 已有 config，默认不过期）与 compaction 折叠策略待实测量化。

## Alternatives considered

- **system-prompt registry 注入而非 pre-step snapshot**：system 文本变更触发 request/header change 重语义；业界先例（VS Code/Claude Code）将每请求重算的独立状态块走 user 侧 context 而非 system 常驻。pre-step + createUserMessage 是既有 time-context 骨架，成本最低。
- **视图态落 session log**：视图态是用户屏幕不是对话历史；落 log 是重放噪音。模型可见⟺logged 由注入消息自身的 durable 性满足。
- **view_apply 走通用 DOM/computer-use**：Anthropic/Microsoft/Google 一致把通用操控定位为外部自动化兜底；自家界面走白名单语义工具（Grafana/Power BI/ThoughtSpot 一致）。
- **新增 SessionEventMap 事件记录视图操作**：复用 tool/call+tool/result 即可从 log 完整重建，新事件只带来版本 bump 与 ignorable 语义负担。
- **每视图独立工具（set_kg_type_filter 等）**：工具目录随 tab 功能膨胀；Grafana ui-mcp-server v2 的合并方向是单工具 + action 枚举。

## Consequences

- 浏览器业务包向 viewContext 注册必须用 `ctx.inject` 延迟激活——bundle apply 顺序不保证服务先于消费者（真机坑 1，详见上文）。
- 模型可见工具边界的列表参数执行器必须容错 string[] 与分隔字符串两种形态（真机坑 2）。
- apiproxy 对 `viewActions` 曾是硬 inject（迫使所有网关测试组合挂 ViewActionService）；已改为 `ctx.inject` 子 fiber 可选缝，浏览器-less 组合不再需要挂载（见 2026-09-17-apiproxy-view-actions-optional-seam）。
- `PendingKind` 新增 `viewAction` 后，`PendingWait` 消费者若做穷举 switch 需要同步（当前仅 question/approval 两类被 composer 认领，viewAction 由 ui-view-context 自动服务）。
- 快照/场景预期工具计数从 20 变 23：后续加视图工具须同步 scenarios.spec/kb-presets.spec 的 expected 列表并再生快照。
