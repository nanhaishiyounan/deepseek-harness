# Agent Note: 输入框模式选择器 —— 输入区顶部的常驻 agent 预设选择器

Status: implemented

[English](2026-09-16-j1-composer-mode-selector.md) | 中文

## 问题

agent 预设的选择入口只存在于 hero chip，而它只在会话开始前（blank 会话 + chat 视图）渲染。工作台的常态——进行中的会话或停在业务 tab——页面上不存在任何预设控件，场景卡对进行中会话直接失败（`agent-preset-locked`）。用户反馈「模式无法选择」，原因不是 roster 为空，而是选择窗口已经关闭。

## 决策

新 list slot `conversation.input.mode`（scope `session-maybe`，仅含 marker 字段的 owner 类型 `InputModeOwnerProps`）渲染进输入卡的既有 `accessory` 孔；`ConversationRoot` 无条件投影，`ui-agent-preset` 注册选择器。选择器的姿态跟随 seat store 新增的 `session` 投影（由每次会话列表变更时的 `syncSession` 保持最新）：

- **无会话或 blank 会话** —— 选择执行 `select()`：先 stage，再应用到流程交出的会话（hero chip 自身语义）。
- **进行中会话** —— host 的 `agent-preset-locked` 保持不变（会话已记录的 tool calls 无法在新组装下执行）；选择其他预设执行 `startSessionOn`——只 stage 不 apply，然后 `workspaces.startSession()`（创造模式路径）。重选当前运行中的组装是无操作。

两个机制事实与计划有出入，按机制解决：

- 计划写「list 为空时传 `undefined`」，但 `renderSlot` 对空 list 返回空 Fragment（不是 `undefined`），会保留 wrapper 的 padding。空座位经 `InputBar.module.css` 的 `.accessory:empty { display: none }` 收起——InputBar 的 TypeScript 零改动。
- 计划草案把 slot 写成 scope `session`，但三态契约（无会话也要渲染）要求 `session-maybe`。

「stage 后开新会话」序列只有一个归属：可选服务 `ctx.agentPresetMode`（`mode-bridge.ts`，`chatFileMentions` 的可选服务惯例），在 conversation flow 挂载期间提供。场景门户的 `selectScenario` 只在错误码恰为 `agent-preset-locked` 时降级为 `startSessionOn(scenarioId)`——红色「场景切换失败」路径变成在新会话中打开场景；其他失败仍然抛出。

## 影响

hero chip 保持其窄窗口（blank + chat）；选择器是常驻座位，二者读取同一 store，两个入口不会不一致。未组合 `ui-agent-preset` 的组装看不到任何行（空 accessory 收起）。e2e lane 的预设名按钮选择器现在限定在 hero 行内，因为两个表面的 trigger 名称会重复。

已知边缘（真机验收，`demos/acceptance-j1/README.md`）：当 New Session 复用的会话列表行的 `blank` 位早于该会话的第一次提问（mirror 的 cold-probe 位已过期）时，被复用的会话拒绝切换，选择落回部署默认。同链路在 `agent-preset-selection` e2e lane 与既有生产日志（存在 `agent-preset/selected` 事件）中均为成功；根修——在复用时校验 blankness——属于 workspaces 域的复用扫描，不属于本选择器。

## 考虑过的替代方案

**host 侧热切进行中会话的预设** —— 否决。锁的存在是因为会话历史是在其预设的工具集下产生的；组装拥有已记录的 tool calls（见 `packages/preset/agent-presets/README.md`）。

**在投影点检测空 list 以传 `undefined`** —— 否决。授权的 `renderSlot` 绑定不暴露 entries 探测，且 CSS 收起以不扩大 slot 契约的方式实现同样的空态零占高。

**为选择器新建第二份 roster/store** —— 否决。选择器与 hero chip 共享 `AgentPresetSeatController` 的 store 与 roster 读取；staged 选择、已应用组装与当前的会话姿态同出一个事实源。
