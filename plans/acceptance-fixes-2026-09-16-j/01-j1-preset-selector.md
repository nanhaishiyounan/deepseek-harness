# J1：输入框顶部 agent/模式选择器（2026-09-16，批次详档）

> 诉求 1 原话：「当前dsh选择会话的模式无法选择，应该在**对话输入框顶部增加agent或模式的选项**」。现状事实见 [00-research-notes.md §1](00-research-notes.md)；本文只裁决「做什么与怎么做」，实施者按步骤执行。

## 0. 裁决摘要

| 决策点 | 裁决 | 理由 |
|---|---|---|
| 入口位置 | **InputBar 的 `accessory` 孔渲染一个新 slot `conversation.input.mode`（list）**，选择器组件由 ui-agent-preset 注册 | 用户原话「输入框顶部」；`accessory` 是「above the textarea」的契约孔且当前空置（[`slots.ts:569`](../../packages/client/ui-conversation/src/client/contract/slots.ts:569)）；直接改 props 无法跨包，slot 是唯一跨包挂载词汇；对照 `conversation.input.model`（:794 模型选择器）同类先例 |
| 渲染窗口 | **会话全程常驻**（无会话/blank/进行中三种状态都渲染） | 根因就是 hero chip 窗口太窄（[`ConversationRoot.tsx:87-89`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:87)）；`conversation.input.mode` 与 `conversation.input.left/right/dock` 同为会话全程渲染的座位 |
| 会话中途切换语义 | **不改 host 锁定**（`agent-preset-locked` 语义保持，[`api-proxy.ts:4383-4430`](../../packages/host/apiproxy/src/api-proxy.ts:4383)）：blank 会话内直接切换（既有 seat 语义）；**非 blank 会话选择新 preset = 一键「在应用中开新会话」**（复用创造模式先例 stage + startSession） | host 拒绝热切有架构理由（已记录 tool calls 无法被新组装执行，[`packages/preset/agent-presets/README.md:51`](../../packages/preset/agent-presets/README.md:51)）；用户痛点是「没有入口」而非「必须热切」；开新会话动作与场景卡/创造模式行为一致，语义诚实 |
| hero chip 去留 | **保留**（blank+chat 窗口继续显示，不重复渲染模式下二者同一数据） | hero chip 是「两枚 chip 读作一行」的既有设计；新选择器在 accessory 行，两者不同行不冲突；若视觉冲突，实施第 3 步真机验证后裁决（预案：hero 窗口隐藏 accessory 选择器，`hero` prop 已可判定） |
| 场景卡失败降级 | `selectScenario` 失败时引导文案改为「将在新会话中打开」（复用本批 startSession 路径） | 根因 #3（[`ScenarioView.tsx:102-117`](../../packages/client/ui-kb/src/client/scenarios/ScenarioView.tsx:102) 直接 setFailed） |

## 1. 范围

**做**：新 slot + 常驻模式选择器（roster 菜单、当前 preset 显示、blank 切换、非 blank 开新会话）+ 场景卡降级 + e2e。
**不做**：host `agentPresets.select` 热切扩展、persona/工具面变化（J2）、preset 管理功能（设置页已有）、创造模式改动。

## 2. 实施步骤

### 步骤 1：ui-conversation 声明 slot（唯一壳层改动）

- [`packages/client/ui-conversation/src/client/contract/slots.ts`](../../packages/client/ui-conversation/src/client/contract/slots.ts)：在 `conversation.input.plan`（:788 使用的）附近声明：

```ts
'conversation.input.mode': {
  kind: 'list'
  scope: 'session'
  owner: InputZoneOwnerProps   // 与 conversation.input.left/right 同 owner（{session, input}）
  // JSDoc：常驻输入卡顶部 accessory 行的模式/agent 选择座位；
  // 注册者渲染胶囊选择器；空时不占高度（renderSlotChain 空数组返回 null）。
}
```

- [`packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:145-166`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:145)（inputBar props 组装处）：把 `conversation.input.mode`（list slot）的投影内容作为 `accessory` 传入（组装方式对齐 `conversation.input.left` → `leftItems` 的既有投影；list 为空时传 `undefined`，InputBar 不渲染额外行）——`accessory` prop 已存在于 `ComposerBarOwnerProps`（[`slots.ts:569`](../../packages/client/ui-conversation/src/client/contract/slots.ts:569)），[`InputBar.tsx:709`](../../packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:709) 已渲染该孔，InputBar 零改动。
- 跑 `pnpm run gen-cordis-catalog` 相关门禁（slot catalog 若需要再生——参照 H 轮 catalog 对齐惯例 5a89e4039c）。

### 步骤 2：ui-agent-preset 注册选择器组件

新文件 `packages/client/ui-agent-preset/src/client/ModeSelector.tsx` + 样式 module：

- 复用 [`PresetMenu.tsx:45-84`](../../packages/client/ui-agent-preset/src/client/PresetMenu.tsx:45) 的 Menu 结构（名称+描述两行，菜单项渲染沿用 [`AgentPresetSeat.tsx:128-169`](../../packages/client/ui-agent-preset/src/client/AgentPresetSeat.tsx:128) 的 item 样式类）。
- 复用 [`settings-store.ts`](../../packages/client/ui-agent-preset/src/client/settings-store.ts:104) 的 roster 读取（`readRoster`/`presetOptions`，broken 过滤）。**不新建 store**——扩展 [`seat-store.ts`](../../packages/client/ui-agent-preset/src/client/seat-store.ts:1) `AgentPresetSeatController` 增加 `currentSessionBlank` 暴露（摘要已含 `blank`，:42-49，只需投影到 UI props）。
- 三态行为：
  1. **无会话**：显示部署默认 preset 名；选择 = `stage(id)`（既有语义，连接建立后 apply）。
  2. **blank 会话**：选择 = `controller.select(id)`（stage+apply，host swap + `agent-preset/selected` 事件）。
  3. **非 blank 会话**：菜单可开、当前项打勾；选择其他项 → 菜单项旁文案「在新会话中应用」+ 确认执行 `stage(id) + workspaces.startSession()`（复用 [`index.ts:159-164`](../../packages/client/ui-agent-preset/src/client/index.ts:159) 创造模式同构路径；如需确认弹窗，用既有 confirm 组件，不要引新依赖）。
- 注册：[`index.ts`](../../packages/client/ui-agent-preset/src/client/index.ts:165) seat 注册旁新增 `ctx.slots.register({ name: 'conversation.input.mode', id: 'agent-preset', order: -5 }, ModeSelector)`（`ctx.effect()` 包裹，注册即效果，AGENTS.md 规范）。
- 国际化：词典键走 `locale`（沿用 `AgentPresetSeat` 的 `t()` 模式）；新增键「在新会话中应用」「当前模式」等进 locale 词典（中英双语）。

### 步骤 3：场景卡失败降级（ui-kb）

- [`ScenarioView.tsx:102-117`](../../packages/client/ui-kb/src/client/scenarios/ScenarioView.tsx:102)：`startScenario` catch 分支（agent-preset-locked 失败）改为：stage 该场景 preset + `workspaces.startSession()`（同 J1 步骤 2-3 路径——**抽取公共 helper 到 ui-agent-preset 的 controller 并以服务暴露**，避免 ui-kb 重复实现：`ctx` 服务 `agentPresetMode`（provide/request 模式，参照 [`kgBridge.ts:27-49`](../../packages/client/ui-kg/src/client/kgBridge.ts:27) 的 bridge 形态），ui-kb inject 后调用）。
- 失败文案更新 + [`kb-workbench.e2e.ts`](../../apps/web/tests/kb-workbench.e2e.ts:447) 对应断言改写。

### 步骤 4：测试与快照

- **单测**（`packages/client/ui-agent-preset/tests/`）：ModeSelector 三态渲染（roster 空→null；非 blank 菜单可开、选择触发 startSession mock；blank 走 select）。
- **e2e 扩展** [`agent-preset-selection.e2e.ts`](../../apps/web/tests/agent-preset-selection.e2e.ts:1)：
  - 非 blank 会话（恢复已有会话后）断言输入框顶部选择器**可见**（对照现状 hero chip 不可见——这是用户诉求的直接验收）；
  - 在非 blank 会话选择 Minimal mode → 断言新会话创建且 `livePreset`（`/api/session.list` 轮询，:224-232 既有模式）变为 minimal；
  - blank 会话经顶部选择器切换（现 hero chip 路径回归保留）。
- 若 Overlay 变化影响 [`apps/web/tests/`](../../apps/web/tests/) 中输入区相关快照（approval-composer/question-composer/reference-composer 等 e2e 的 aria 树新增一行 capsule），逐个更新断言——**Accessory 行空 roster 时必须返回 null 不占高**，把波及面压到最小。

## 3. 验收标准（J1 完成 definition）

1. :3080 真机：任意会话状态（新会话/进行中/停在各业务 tab）下，输入框顶部均可见当前模式胶囊；点击展开完整 roster（角色预设+30 场景，名称+描述）。
2. blank 会话切换：选择后 slash 命令目录随之变化（沿用 :234-270 断言模式）；进行中会话选择后自动开新会话并生效（真机走通）。
3. 场景 tab 对进行中会话点「开始会话」不再红失败，而是开新会话进入场景。
4. `agent-preset-selection.e2e.ts`/`agent-preset-authoring.e2e.ts`/`kb-workbench.e2e.ts` 全绿；受波及 composer e2e 更新后全绿；`pnpm run typecheck`、`pnpm run lint` EXIT=0。
5. host 零行为改动：`agent-preset-locked` 错误码与既有 e2e 不变（无 host 测试需改）。

## 4. 风险与回退

| 风险 | 预案 |
|---|---|
| accessory 行挤占输入卡视觉（附件行上方多一行） | roster 空返回 null；样式贴齐 InputBar 既有行高（28px 胶囊，参照 [`AgentPresetSeat.module.css:4-22`](../../packages/client/ui-agent-preset/src/client/AgentPresetSeat.module.css:4)）；真机截图进 demos/acceptance-j1/ |
| 与 hero chip 双入口语义混淆 | 两者同一 store 同一数据；若用户反馈重复，下轮收 hero chip（本批不动） |
| 非选 preset 的 startSession 在 workspace 未连接时 | stage 语义本就为「下一个会话」，连接建立后 apply（[`seat-store.ts:151-163`](../../packages/client/ui-agent-preset/src/client/seat-store.ts:151)），无需额外处理 |
| 回退 | 单批提交可独立 revert：ui-conversation 一行 props + 一个 slot 声明、ui-agent-preset 新组件、ui-kb 一处 catch——无数据/协议迁移 |
