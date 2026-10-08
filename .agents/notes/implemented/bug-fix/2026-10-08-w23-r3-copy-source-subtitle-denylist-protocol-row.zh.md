# Agent Note: W23-R3 — 验证清偿（复制原文 + subtitle 黑名单 + protocol 行契约 + 聚簇稳定 key）

Status: implemented

[English](2026-10-08-w23-r3-copy-source-subtitle-denylist-protocol-row.md) | 中文

## Problem

W23-B2 验证（85/100，FAIL）遗留 3 条 Important 与 4 条 Minor：

- **F1（P0 级用户价值）**：被拒 `present_card` 卡的「复制原文」复制到的是硬编码说明行，不是载荷本身。`foldPresentCard` 的两个折叠臂（被拒、载荷解析失败）都丢弃了在手的 `rawArguments`；只有 ```dsh fence 路径保留了原文。
- **F2**：正文层有 `sanitizeBizText`，subtitle 层没有——persona 软约束随机失误把 `wfl_approval_todos` 泄漏进了活体报告卡 subtitle（z2 turn2/turn3 ×2、正文 ×1）：泄漏词不在业务词映射表里，而开放集渲染层兜底已在 B2 评估中否决。
- **F3**：带 protocol 标记的工具行若落地 `error`（模型把 `ask_field` 围栏名当工具调用发出并被弹回），仍会加入工具聚簇、被读作「一次跑失败的查询」——中性状态行契约此前只活在 `FlowItem` 的渲染分支里。
- Minor：聚簇/分组的 React key 从首行 seq/title 派生（中途插入新事件会重派生出不同 key，用户展开态被收起）；工具聚簇 CSS 注释宣称的视觉交错渲染从未实现；b2-08 证据截图与 b2-01 字节级相同（sha256 一致），且批次声称的证据数 17 少于实际 `b2-*` 文件数 19。

## Decision

- **F1**：`fold.ts` 内一个共享 `buildCopyableText(raw, fallback)` 现在喂给全部三个折叠臂——fence 段、被拒 present_card、参数畸形 present_card。线的原始文本（「复制原文」交到剪贴板的确切字符串）作为 item 的 `text`；人话兜底行只覆盖真正无源的情形（非字符串或空白线值）。人话摘要保留在 `<summary>` 上，折叠条保持成因中立，载荷仍一次点击可达。
- **F2**：新共享模块 `client/sanitize.ts` 导出 `sanitizeBody` / `sanitizeSubtitle`。两者先走存量 `sanitizeBizText` 映射，再剥一份**封闭**协议 token 黑名单（`wfl_*`、`ask_*`、`suggestions`）；subtitle 层追加剥除封闭的工具/协议名家族（`nb_*`、`kg_*`、`kb_search`、`lakehouse_*`、`connector_*`、`form_draft`、`form_confirm`、`reject_flow`、`submit_receipt`、`present_card`）。这刻意不是 B2 否决过的开放集兜底：封闭家族不可能构成合法人话词（OTIF、GB 2760、P50 原样通过）。`FlowItem` 的 report 分支在 `ReportCard` 消费前清洗 `payload.subtitle`；被剥空的 subtitle 按省略渲染（`ReportCard` 把 `''` 按 W21-R4 的空串等同省略口径处理）。三份带卡 preset 的卡面/正文纪律行同时补上 `wfl_approval_todos` 点名示例（双保险——泄漏是软约束失误，不是规则缺失）。
- **F3**：`fold.ts` 导出 `isProtocolToolRow`（类型谓词 `ChatToolRow & { protocol: true }`）；`FlowItem` 的中性行分支与 `ToolClusterRow` 的 `isSettledTool` 同源消费，protocol 行——失败与否——永不进聚簇、永远渲染为中性状态行。
- **稳定 key（Minor）**：聚簇 key 从成员集（`seq::name` 对、排序后连接）派生而非首行 seq，重排后的重折叠重派出同一 key，React 保住展开态组件；`AlertsView` 分组 key 以 `::` 分隔派生 `band::ruleType::entityId`（组内唯一共享实体：非空编码，否则唯一共享标题）。CSS 注释改为描述实际渲染顺序（全部行在前、叙述在后，无交错）。
- **证据（Minor）**：b2-08 重拍独立帧（`r3/r3-b2-08-retake-buyer-hero-line.png`），`b2-verify-report.md` 附更正注记，同时记录同帧与 17 对 19 的计数差。

## Consequences

- ui-mobile 888/888（新增：fold F1 三处断言改写 + 2 用例、tool-cluster protocol 守卫 + key 稳定 3、sanitize 10 含 DOM 级 subtitle 断言；更新：原先钉死兜底行的两处 degraded 文本断言），tool-present-card + session-title 200/200，toolcard e2e 6/6，`pnpm run typecheck` 绿，staged lint 随 lefthook。
- 活体探针（`demos/acceptance-w23/r3-*`）：被拒卡「复制原文」剪贴板等于原始载荷；subtitle 泄漏场景 ×3 零协议 token；聚簇跨重排重折叠保持展开。
- AlertsView 的 key 改动是防御性规范化——分组规则本就保证与 head 无关的共享实体，且活体 title/编码不含 `::`——其覆盖是现有 alerts 套件，不是新行为用例。
- 兜底文案臂从此只能经非字符串/空白线形态触达（单测覆盖），「折叠条显示兜底」的含义自此收窄。

## Alternatives considered

- **在 `ReportCard` 内清洗**——卡片是纯载荷渲染器；泄漏是渲染位消费决策，留在 `FlowItem` 使 `ReportCard` 可继续承接已净载荷（测试、预览）。
- **把 `wfl_approval_todos` 加进 `BIZ_TERMS` 当映射**——映射正是 B2 否决的开放集陷阱；黑名单剥除整个家族（`wfl_*`）而不假装翻译它。
- **在工具行之间交错叙述**——楔入叙述没有逐行锚点（一段叙述只是位置上处于两次调用之间）；CSS-only 注释修正记录实际顺序，而非发明一个。
- **带 `callId` 的 key**——`ChatToolRow` 不携带 callId（fold 用内部 map 完成结果配对）；`seq::name` 是该层成员的稳定标识。
