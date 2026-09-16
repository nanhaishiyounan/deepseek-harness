# J 轮事实底座（2026-09-16，调研笔记）

> 面向 J1-J4 批次实施者：本文是被裁决引用的**现状事实清单**，每条附 `文件:行号` 证据。调研经 4 路并行子任务（3 路 project-research + 1 路 deep-research 业界模式，主任务亲证交叉）完成。业界模式完整报告落盘 [research/2026-09-16-tab-aware-context-architecture.md](../../research/2026-09-16-tab-aware-context-architecture.md)（含 5 份子报告与约 90 个一手来源）。基线 HEAD=`4d3665780b`（I 轮收官 docs，八轮验收完成、未推送链）。

---

## 1. 主题一事实：preset 选择体系完备，但入口窗口极窄 + 会话中锁定

### 1.1 四个 surface 与渲染条件

| Surface | 组件 | 挂载点 | 可选择性 |
|---|---|---|---|
| 设置通用行 | [`AgentPresetRow.tsx:38`](../../packages/client/ui-agent-preset/src/client/AgentPresetRow.tsx:38) | `settings.general.item`（order -25，[`index.ts:207-213`](../../packages/client/ui-agent-preset/src/client/index.ts:207)） | 改**部署默认**（只影响之后新建会话） |
| 新会话 hero chip | [`AgentPresetSeat.tsx:71`](../../packages/client/ui-agent-preset/src/client/AgentPresetSeat.tsx:71) | `conversation.hero.agentPreset`（[`index.ts:165-169`](../../packages/client/ui-agent-preset/src/client/index.ts:165)） | stage 到下一个会话 |
| 会话头部标签 | [`AgentPresetLabel.tsx:42`](../../packages/client/ui-agent-preset/src/client/AgentPresetLabel.tsx:42) | `conversation.session.header.actions`（[`index.ts:170-177`](../../packages/client/ui-agent-preset/src/client/index.ts:170)） | **只读**（e2e 断言非 button，[`agent-preset-selection.e2e.ts:289`](../../apps/web/tests/agent-preset-selection.e2e.ts:289)） |
| 设置管理页 | `AgentPresetSection.tsx` + [`section-store.ts:1`](../../packages/client/ui-agent-preset/src/client/section-store.ts:1) | `settings.section` | 复制/删除/设默认/创造模式 |

### 1.2 「无法选择」根因（三层一致，证据强）

1. **hero chip 渲染窗口极窄**：`hero = 无会话 || (blank && open && activeView === DEFAULT_VIEW_ID)`（[`ConversationRoot.tsx:87-89`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:87)）；`heroWorkspaceRow`（含 chip 渲染点 :131）由 :172 `{hero && …}` 门控。工作台用户常态（已开始会话/停在业务 tab）下整行不渲染。
2. **会话中途切换 host 层拒绝**：`agentPresets.select` 对非 blank 会话返回错误码 `agent-preset-locked`（[`api-proxy.ts:4383-4430`](../../packages/host/apiproxy/src/api-proxy.ts:4383)，锁因 = 已记录 tool calls 无法被新组装执行，[`packages/preset/agent-presets/README.md:51`](../../packages/preset/agent-presets/README.md:51)）；seat 对非 blank 丢弃 stage（[`seat-store.ts:157-159`](../../packages/client/ui-agent-preset/src/client/seat-store.ts:157)）。
3. **场景 tab 入口对非 blank 会话直接失败**（`setFailed(true)`「场景切换失败」，[`ScenarioView.tsx:102-117`](../../packages/client/ui-kb/src/client/scenarios/ScenarioView.tsx:102)）。

已排除假设：roster 空（[`examples/kb-agent/cordis.patch.yml:317-324`](../../examples/kb-agent/cordis.patch.yml:317) 配置 default+30 场景双 root）；插件未组装（[`packages/bundle/web-app/cordis.patch.yml:323-324`](../../packages/bundle/web-app/cordis.patch.yml:323)）；只读模式锁死（seat 的 select 不在 loopback-pinned 列表）。

### 1.3 composer 顶部可用挂载点

- [`InputBar.tsx:701-709`](../../packages/client/ui-conversation/src/client/skeleton/InputBar.tsx:701)：卡片内自上而下 `overlay` → **`accessory`（「Optional content rendered above the textarea」，契约 [`slots.ts:569`](../../packages/client/ui-conversation/src/client/contract/slots.ts:569)）** → attachments → textarea → 工具行。**`accessory` 孔当前空置**（唯一 renderSite [`ConversationRoot.tsx:145-166`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:145) 不传；仅测试驱动过）。
- 工具行（:770-833）：左侧 `+`/PermissionSelect/`conversation.input.plan`(:788)/`conversation.input.left`；右侧 `conversation.input.right`、**`conversation.input.model`（:794，模型选择器——「输入框内选择器」既有先例，含 `locked` 契约 [`slots.ts:279`](../../packages/client/ui-conversation/src/client/contract/slots.ts:279)）**、ContextMeter、发送。
- 整行 slot：`conversation.input.dock`（卡片上方，[`slots.ts:213`](../../packages/client/ui-conversation/src/client/contract/slots.ts:213)）、`conversation.composer.dock`（卡片下方，:222）——**会话全程渲染（不只 hero）**。
- **前车之鉴（H1）**：场景门户原挂 `input.dock`，因 dock 在所有视图渲染泄漏到其他 tab 而迁独立 view（[`ui-kb/index.ts:185-188`](../../packages/client/ui-kb/src/client/index.ts:185) 注释）——J1 挂载点选择必须考虑视图无关性。

### 1.4 seat/stage 数据流（复用面）

```
chip 选择 → AgentPresetSeatController.stage(id)          seat-store.ts:133-136
 → apply()：blank 会话 → RPC agentPresets.select           :151-163
 → host: blank 检查 → presets.recompose → log 事件 agent-preset/selected   api-proxy.ts:4399-4411
 → 各 tab: remote.$on('agent-preset/selected') → sessions.noteAgentPreset   ui-agent-preset/index.ts:146-148
```

创造模式先例（开新会话 + stage）：[`ui-agent-preset/index.ts:159-164`](../../packages/client/ui-agent-preset/src/client/index.ts:159) `creatorDraft = stage('cordis', true) + workspaces.startSession()`。roster 来源：RPC `agentPreset.list`（[`settings-store.ts:104-113`](../../packages/client/ui-agent-preset/src/client/settings-store.ts:104)），broken 预设被过滤（:154-163）。

---

## 2. 主题二事实：默认会话 18 工具四域半，30 场景只挂 6 个 kb 工具

### 2.1 五域工具清单（定义位置）

| 域 | 工具 | 定义 | 能力 |
|---|---|---|---|
| kb | `kb_search`/`kb_ingest`/`kb_ingest_url`/`kb_stats` | [`packages/kb/tool-kb/src/`](../../packages/kb/tool-kb/src/index.ts:55) | 检索/入库/统计 |
| kg | `kg_schema`/`kg_subgraph` | [`kg.ts:269`](../../packages/kb/tool-kb/src/kg.ts:269) | 本体浏览/seeds 子图；v1 `kb_graph_query/add` 默认禁用（[`index.ts:148`](../../packages/kb/tool-kb/src/index.ts:148)） |
| lakehouse | `lakehouse_tables`/`lakehouse_query` | [`packages/lakehouse/tool-lakehouse/src/`](../../packages/lakehouse/tool-lakehouse/src/index.ts:38) | 表列举/DuckDB SQL |
| market/orders | `order_create`/`order_status` | [`order.ts:278,353`](../../packages/connector/tool-connector/src/order.ts:278) | 下单/查单（专家服务交易） |
| connector | `connector_discover`/`connector_fetch`/`connector_transfer` | [`packages/connector/tool-connector/src/`](../../packages/connector/tool-connector/src/index.ts:79) | 发现/预览/五步转移 |
| nocobase | `nb_collections`/`nb_list`/`nb_get`/`nb_create`/`nb_update` | [`packages/connector/tool-nocobase/src/`](../../packages/connector/tool-nocobase/src/index.ts:25) | 通用 REST 读+写（含确认契约），覆盖 SRM/WMS/CRM/Hub 全 collection |

### 2.2 挂载缺口矩阵

| 域 | 默认会话可达 | 默认会话提示 | 30 场景挂载 |
|---|---|---|---|
| kb | 🟢 | 🟢 persona 明示 | 🟢 全挂 |
| lakehouse | 🟢 | 🟢 persona 明示 | 🔴 零挂载 |
| kg | 🟢 | 🟡 persona 未提（仅 `tool:kg` order112 兜底） | 🔴 零挂载 |
| market/orders | 🟡 交易可达；**目录浏览/统计无 AI 工具**（UI RPC only） | 🟢 | 🔴 零挂载 |
| connector | 🟡 数据面 3 工具；**连接管理无 AI 工具**（by design，涉凭据） | 🟢 | 🔴 零挂载 |
| nocobase | 🟢 读 3+写 2（通用，无 workflow/审批语义工具） | 🟢 | 🔴 零挂载 |

### 2.3 挂载机制要点

- 32 preset = 2 角色（[`examples/kb-agent/agent-presets/enterprise-data-assistant/agent.cordis.yml`](../../examples/kb-agent/agent-presets/enterprise-data-assistant/agent.cordis.yml:19)）+ 30 场景（[`examples/kb-agent/scenarios/supplier-development/agent.cordis.yml`](../../examples/kb-agent/scenarios/supplier-development/agent.cordis.yml:5)），挂载经 [`mount.ts`](../../packages/preset/agent-presets/src/mount.ts)（preset 子树插入 per-session scope）。
- **host 组合 [`cordis.patch.yml:120-258`](../../examples/kb-agent/cordis.patch.yml:120) insert 的工具行不进 preset 会话**（快照实证：food-compliance-officer 与 30 场景全部只有 6 个 kb 工具；快照 [`examples/kb-agent/tests/snapshots/scenarios/expected.md`](../../examples/kb-agent/tests/snapshots/scenarios/expected.md)）。
- 系统提示分层：preset persona 行注册同名 `deployment:persona` section **遮蔽** host persona（[`system-prompt/src/index.ts:122-128`](../../packages/core/system-prompt/src/index.ts:122)）——即 [`cordis.patch.yml:84-118`](../../examples/kb-agent/cordis.patch.yml:84) 的五域路由 host persona 在 preset 会话**不达模型**。默认会话模型可见指引 = preset persona（缺 kg）+ 各工具 `tool:*` section 兜底。
- **kg NL 9 模板现状**：[`kg-nl.ts:52-98`](../../packages/host/apiproxy/src/kg-nl.ts:52) 恰 9 模板，编译为 `{seeds, relation_types, hops}`——但只服务 apiproxy `kg.query`（**UI 图谱页搜索框 RPC**），不是 AI 工具；客户端离线 fallback 三正则在 [`presentation.ts:52-64`](../../packages/client/ui-kg/src/client/presentation.ts:52)。
- apiproxy：17 域 UI→BFF 面（[`rpc-map.ts:31-110`](../../packages/host/apiproxy/src/api/rpc-map.ts:31)），域门控布尔（[`api-proxy.ts:784-829`](../../packages/host/apiproxy/src/api-proxy.ts:784)）kb-agent patch 全开；`/api` 无鉴权层（trustedHosts 仅 DNS-rebinding 栅栏）；nocobase 域只读设计（写走 agent nb_* 工具，[`nocobase.ts:2-10`](../../packages/host/apiproxy/src/api/nocobase.ts:2)）。

---

## 3. 主题三事实：tab→composer 六先例，composer→tab 感知完全空白

### 3.1 view ring 与视图状态

- view 注册：`conversation.view` list slot（[`slots.ts:107`](../../packages/client/ui-conversation/src/client/contract/slots.ts:107)），8 view：chat0/kb10/scenarios10.5/market11/connectors12/kg13/business14/trajectory15（各包 `index.ts` 注册，见 [`apply.ts:158-171`](../../packages/client/ui-conversation/src/client/apply.ts:158) 投影 tab 列表）。当前 tab 持久化于 chatStore `view`（`persist: 'dsh.conversation.chat'`，[`stores.ts:26`](../../packages/client/ui-conversation/src/client/stores.ts:26)）。
- 各 tab 视图状态 store（apply 级 `createSnapshotStore`，**不持久化**）：kg 有 `selected/typeFilter`（[`kgStore.ts:20-33`](../../packages/client/ui-kg/src/client/kgStore.ts:20)）；business 有 `collections.selected`（[`bizStore.ts:20-27`](../../packages/client/ui-business/src/client/bizStore.ts:20)）；kb/market/connectors 基本无视图态（组件局部）。注意 `KgClientState.typeFilter: ReadonlySet<string>` 不可直接 JSON。
- **view ring 一次只挂载一个视图**（`{ only: active.id }`，[`ConversationSession.tsx:219-225`](../../packages/client/ui-conversation/src/client/skeleton/ConversationSession.tsx:219)）——未激活 tab 组件卸载、局部态丢失，但 apply 级 store 存活。

### 3.2 通信现状

- **tab → composer（成熟，六处先例全是「预填 draft + 跳回 chat」）**：scenarios `askInChat`（[`ScenarioView.tsx:92-100`](../../packages/client/ui-kb/src/client/scenarios/ScenarioView.tsx:92)）、kb 搜索带入（[`KbSearch.tsx:137-139`](../../packages/client/ui-kb/src/client/workbench/KbSearch.tsx:137)）、kg 问此实体（[`KgView.tsx:137-139`](../../packages/client/ui-kg/src/client/KgView.tsx:137)）、market `askAbout`（[`MarketView.tsx:77-79`](../../packages/client/ui-assets/src/client/MarketView.tsx:77)）、connectors 连接向导（[`ConnectorsView.tsx:58-60`](../../packages/client/ui-connectors/src/client/ConnectorsView.tsx:58)）、business ask/edit/new（[`BizView.tsx:86-90`](../../packages/client/ui-business/src/client/BizView.tsx:86)）。公共词汇 `InputActions`：setDraft/addImages/removeImage/pruneImages/submit（[`input/contract.ts:73-84`](../../packages/client/ui-conversation/src/client/input/contract.ts:73)）。
- **composer → tab 感知：完全空白**。composer 读取面（notices/lexicon/menuLauncher/composerBlock，[`apply.ts:301-375`](../../packages/client/ui-conversation/src/client/apply.ts:301)）无任何 active view/视图状态输入；唯一 active view 镜像 `activeViewMirror`（[`apply.ts:133-137`](../../packages/client/ui-conversation/src/client/apply.ts:133)）只用于 hero 让位布局。
- KG 短语查询（H3）：`KgView` phrase box → `queryPhrase` → **直连 `api.kg.query` RPC**（[`ui-kg/index.ts:195-205`](../../packages/client/ui-kg/src/client/index.ts:195)），不经对话/agent。
- business 写面哲学：**所有写经对话的 nb_* 确认流**（[`ui-business/index.ts:5-8`](../../packages/client/ui-business/src/client/index.ts:5)、[`BizView.tsx:2-9`](../../packages/client/ui-business/src/client/BizView.tsx:2)）——「AI 承载业务操作」的既有先例。

### 3.3 模型→UI 既有能力缝（J3 视图操控的同构模板）

- **ask_user_question 全链**（最强先例）：模型面工具 [`tool-ask-user/src/index.ts:19-101`](../../packages/interaction/tool-ask-user/src/index.ts:19) → `ctx.userQuestions.ask()` capability seam → 浏览器 `QuestionComposer` 接管 composer chain（question priority 1 > approval 0，[`apply.ts:377-385`](../../packages/client/ui-conversation/src/client/apply.ts:377)）→ 答案作为 tool result 回 agent loop。配套 wire 帧 `approval/requested|question/requested`（[`session.ts:472-511`](../../packages/client/runtime/src/client/sessions/session.ts:472)）。
- 工具结果呈现：`conversation.chat.node` + `tool.call.toolview`（开放键域，未认领落 generic，[`ui-tool/contract/slots.ts:8-25`](../../packages/client/ui-tool/src/client/contract/slots.ts:8)）；ui-kb 已认领 7 键（[`ui-kb/index.ts:277-285`](../../packages/client/ui-kb/src/client/index.ts:277)）。
- 跨视图 handoff 唯一先例：`inspect/onInspectDone`（chat↔trajectory，[`slots.ts:362-367`](../../packages/client/ui-conversation/src/client/contract/slots.ts:362)）；**kgBridge.parkSeeds/takeSeeds 预留未接线**（[`kgBridge.ts:17-21,40-47`](../../packages/client/ui-kg/src/client/kgBridge.ts:17)，生产零调用者——J3 可回收或删除）。
- commands 体系：`CommandSourceMap` 仅 `user` 变体（[`commands/types.ts:59-70`](../../packages/interaction/commands/src/types.ts:59)），无 agent 发起方、无 view action 注册面。

### 3.4 模型可见⟺logged 的实施机制（J3 注入层落点）

- **A. request-context 插件（推荐参照）**：挂 `agent/pre-step` waterfall，向本步追加 durable user 消息——完整实例 time-context（[`time-context/src/index.ts:170-208`](../../packages/context/time-context/src/index.ts:170)）、agent-instructions（[`agent-instructions/src/index.ts:322`](../../packages/context/agent-instructions/src/index.ts:322)）。`MessageSourceMap` 与 `ContextFormed`（含 `snapshot` form）定义于 [`llm/src/message.ts:79-105`](../../packages/llm/llm/src/message.ts:79)——UI 已有 `ContextInjectionRow` 折叠渲染。
- **B. system-prompt registry**：`PromptSection/PromptContext` + `system-prompt/assemble` waterfall（[`system-prompt/src/index.ts:31,53-85`](../../packages/core/system-prompt/src/index.ts:31)）；system 文本变更触发 request/header `change` 快照。
- **C. 事件通道**：SessionEventMap declaration-merge 扩展（log-only），host→浏览器走 wire `session/event` 帧 → `conversationEvents/conversationViews` 投影（ui-trajectory 全套范例 [`trajectory-tool-definition.ts:219-273`](../../packages/client/ui-trajectory/src/client/trajectory-tool-definition.ts:219)）。
- 请求信封 `request/header` 含渲染后 system prompt + 工具 schemas，整体落 log（「every conversation request is a pure function of the log」）；web 层红线「A new *model-visible* input still requires a session event」（[`packages/client/AGENTS.md:55`](../../packages/client/AGENTS.md:55)）。

### 3.5 packages/client 结构约束

- 业务七 tab 包（ui-kb/ui-assets/ui-connectors/ui-kg/ui-business）全部 `inject = ['slots','locale','connection']`，各带 store + view bridge；跨包值导入禁止、store 必须 `createXXXStore()` 工厂、单一 `ctx.slots.register` API（[`packages/client/AGENTS.md:11-36`](../../packages/client/AGENTS.md:11)）。
- 服务客户端 wire root：`ctx.connection.api`（[`connection/index.ts:53-103`](../../packages/client/connection/src/client/index.ts:53)）——新增 RPC 域在此扩展。

---

## 4. 业界模式裁决摘要（deep-research，详见 [research/2026-09-16-tab-aware-context-architecture.md](../../research/2026-09-16-tab-aware-context-architecture.md)）

1. **上下文注入三层结构**：①隐式轻量状态块（几百 tok、每请求重算、切 tab 即换）②显式 @ 引用 chip ③`get_view_state` 按需拉取。VS Code「每请求重组装 implicit context」是「切 tab 跟随」最直接先例；Claude Code env info（~280 tok 置 system prompt 尾）同构。
2. **视图操控 = 白名单枚举工具 + 类型化参数**：Grafana/ThoughtSpot/Power BI/Tableau 无一例外；Anthropic 官方选型次序（专用 API > fetch > browser use > computer use）权威否定通用 DOM 操控用于自家界面；工具过多时合并方向 = 单工具 + action 枚举。
3. **回路 = SSE 下行 + HTTP 消息级重提交回传**（非反向流）；会话日志记**事件序列**（意图+args+结果）非快照；冲突 = 分级审批 + 版本链 restore，不引入乐观锁/CRDT。
4. **问数 = 语义层先行 + 受控 DSL 优先生成 + 裸 SQL 兜底**；KG 三档梯度（向量→参数化模板→text2cypher）；结果渲染「原生视图 + LLM 摘要」双件套。
5. **开放问题三条**（J3 需自行设计）：多 tab 并行引用格式；patch 工具 vs 枚举工具边界（建议先全枚举）；视图事件保留策略（结合 DSH session log）。
6. **张力警示**：白名单与「优先 AI」有张力——业界对策是视图状态**文档化**（AI 编辑文档而非逐操作），J 轮先枚举、观察后再引入 patch（K/L 轮）。

---

## 5. 第八轮（I 轮）基线与轮次命名说明

- I 轮交付（git log 近 40 条）：order_create 预算收口（c31987ebe9/fff583eec9）、I/J/K 调研归档（e11724ca28）、kb schema-version 断言（4f8f29c24e）、收官 docs（4d3665780b，handoff 0.j）；H 轮交付场景 tab 独立/KG 版本化+映射文件化+质量落库+NL 模板/SRM+WMS 闭环（详见 [`plans/handoff-2026-09-15.zh.md`](../handoff-2026-09-15.zh.md)）。
- **近两轮零提交触及 ui-agent-preset / ui-conversation composer**——J1/J3 面是干净增量。
- **轮次命名冲突说明**：H 轮路线图原命名 I=PLM、J=MES、K=ERP+CRM、L=全链（[`plans/acceptance-fixes-2026-09-15-h/PLAN.md:36`](../acceptance-fixes-2026-09-15-h/PLAN.md)）。本 J 轮为第九轮**验收修复**占用 J 字母后，五系统路线图顺延：MES→K、ERP+CRM→L、全链→M；PLM（原 I 轮主题）在 I 轮已完成调研归档、交付边界待用户确认后另立批次。
