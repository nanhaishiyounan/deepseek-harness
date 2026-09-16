# 用户验收反馈修复计划（第九轮 J）：模式选择器 + 五域工具面 + tab 感知智能上下文（2026-09-16 起）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [01](01-j1-preset-selector.md)~[04](04-j4-closeout.md)。所有根因结论附 `文件:行号` 或实机证据；调研经 4 路并行子任务（3 路 project-research + 1 路 deep-research 业界模式，约 90 个一手来源）+ 主任务亲证交叉完成，事实底座见 [00-research-notes.md](00-research-notes.md)，业界模式报告见 [research/2026-09-16-tab-aware-context-architecture.md](../../research/2026-09-16-tab-aware-context-architecture.md)。基线 HEAD=`4d3665780b`（I 轮收官，八轮验收完成，提交链未推送）。

**目标一句话**：① 会话输入框顶部出现**常驻 agent/模式选择器**（三种会话状态都可见可用）；② AI 可调用数据面**全覆盖五域**（30 场景 preset 从 6 工具扩到全量 22、kg 9 模板投影为 AI 工具、资产目录补 `assets_browse`）；③ **tab 感知智能上下文架构**落地——切 tab 后对话上下文自动以当前 tab 为主（快照注入），AI 经白名单视图工具直接操控当前 tab（过滤/聚焦/短语查询问数/切 tab），编排逻辑优先 AI 不写死前端。

**北极星（用户原话）**：

1. 「当前dsh选择会话的模式无法选择，应该在**对话输入框顶部增加agent或模式的选项**」
2. 「dsh能够调用的数据包含**知识库、数据湖仓、数据资产、连接器、业务系统的所有数据**！！！！」
3. 「dsh切换tab时，下方的对话框对应的上下文应该**以当前tab为主**……通过输入框是能够对知识图谱进行**智能调整**的，还要**问答问数**等……**所有的都要能智能化**……**足够压榨ai的能力，能够让ai做的实现的，优先ai**」

**期待管理**：③ 的完整形态（显式 @ 引用、文档型 patch 工具、多 tab 并行引用、语义层策展）业界也无一次性先例，J 轮交付「三层架构的地基+高频意图全覆盖」（注入×7 tab + 操控 action 首批 + 问数三路），扩展件按 K/L 轮分期（03 §0.3 边界清单）。会话**中途热切** preset 不在本轮（host `agent-preset-locked` 有架构理由：已记录 tool calls 无法被新组装执行，[`packages/preset/agent-presets/README.md:51`](../../packages/preset/agent-presets/README.md:51)）；替代语义=非 blank 会话选择 preset 一键开新会话。连接器**管理面**（增删连接/凭据）不开放 AI 工具（安全设计，数据面三工具已全）；NocoBase workflow/审批语义工具留五系统后期。

---

## 1. 调研结论摘要

### 1.1 主题一：preset 体系完备，但被设计成「开始前的选择」——入口窗口极窄

- 四 surface 齐备（设置行/hero chip/会话头标签/管理页），但贴近输入框的 hero chip **只在「blank 会话 + chat 视图」渲染**（[`ConversationRoot.tsx:87-89,172`](../../packages/client/ui-conversation/src/client/skeleton/ConversationRoot.tsx:87)）；会话头标签只读；host 对非 blank 会话一律 `agent-preset-locked`。用户工作台常态（进行中会话/停业务 tab）下**页面上不存在任何选择控件**——「无法选择」根因三层一致（UI 窗口/host 锁/场景卡失败），非 roster 空或未组装（00 §1.2 已排除）。
- 输入框顶部落点现成：`accessory` 孔空置（textarea 上方契约位，[`slots.ts:569`](../../packages/client/ui-conversation/src/client/contract/slots.ts:569)）+ `conversation.input.model` 模型选择器同类先例（:794）。

### 1.2 主题二：默认会话 18 工具四域半；最大缺口在挂载层——30 场景只挂 6 个 kb 工具

- 缺口矩阵（00 §2.2）：30/32 preset 四域零挂载（B 轮场景隔离形态遗留）；kg 9 模板只服务 UI 搜索框 RPC 未投影 AI；资产目录/统计无 AI 工具；默认 persona 缺 kg 路由（靠 `tool:kg` 兜底）。连接器数据面与 NocoBase 通用读写面已全。
- 机制事实：preset persona **遮蔽** host persona（[`system-prompt/src/index.ts:122-128`](../../packages/core/system-prompt/src/index.ts:122)）——补挂载必须动 preset 侧，改 host 组合无效。

### 1.3 主题三：tab→composer 六先例成熟；composer→tab 感知**完全空白**；业界模式高度收敛

- 现状：tab→composer「预填 draft+跳回 chat」六处先例；composer 读取面无任何视图输入（00 §3.2）；模型→UI 最强先例=ask_user_question 能力缝（模型工具→capability→浏览器接管→答案回 tool result，可整体同构复刻）；request-context 注入管线现成（time-context 同构，`ContextFormed.snapshot` 含 UI 折叠渲染）；`kgBridge.parkSeeds` 预留未接线可回收。
- 业界裁决（research §3.5）：**三层上下文注入**（轻量状态块每请求重算 + 显式 @ 留后 + get_view_state 按需）；**白名单枚举工具+类型化参数**（Grafana/Power BI/ThoughtSpot 一致；Anthropic 官方选型次序否定通用 DOM 操控用于自家界面；工具膨胀的合并方向=单工具+action 枚举）；**SSE 下行+请求-响应回传**（不新增反向流）；**日志记事件序列非快照**；问数=受控模板/语义层优先+裸查询兜底+「原生视图+LLM 摘要」双件套。张力警示：白名单与「优先 AI」有张力，对策=编排交模型、前端只留原子执行器，patch 工具留后。

---

## 2. 技术决策（已定，实施不再讨论）

1. **J1 选择器挂 `accessory` 孔渲染新 slot `conversation.input.mode`**（ui-conversation 一处声明+一处传参，InputBar 零改动）；三态常驻（无会话=stage / blank=直接切 / 非 blank=一键开新会话，复用创造模式 stage+startSession 先例 [`ui-agent-preset/index.ts:159-164`](../../packages/client/ui-agent-preset/src/client/index.ts:159)）；**host 锁定语义零改动**；场景卡失败降级复用同路径。
2. **J2 场景 preset 全量挂载**（30×工具行对齐默认会话，persona 保聚焦段对冲）；**kg-nl 编译器下沉 [`packages/kb`](../../packages/kb) 单一事实源**（apiproxy `kg.query` 与新工具 `kg_query` 共用，RPC 零漂移由单测锁）；新增只读 `assets_browse`（list/detail/stats 三动作）；默认 persona 补 kg；连接器管理/workflow 工具**明确不做**。
3. **J3 三层架构**（03 §0.1 总图）：
   - **注入层**：新包 `packages/context/view-context`（time-context 同构）挂 `agent/pre-step`，读 apiproxy 新 RPC `session.viewState.report` 的 per-session 内存缓存（视图态不落 log，**注入的 snapshot 消息本身 durable——模型可见⟺logged 天然满足**）；浏览器侧新包 `ui-view-context` 提供 `ctx.viewContext` 注册面（provider 投影+防抖上报），七业务包各注册；几百 tok 固定格式+文本 diff 跳过。
   - **操控层**：新能力缝 `packages/interaction/view-actions`（Service Definition/host provider/wire 帧 `view-action/requested`，**同构复刻 user-questions 全链**，30s 超时 fail loud）+ 模型面 `packages/interaction/tool-view-actions`（`view_apply` 单工具+per-tab action 枚举 / `view_state_get` / `switch_view` 走前端）；前端执行器白名单注册在 ui-view-context，未注册 fail loud，幂等纯状态写入，未挂载自动 switch；首批 action=kg 全套（含 `run_phrase_query` 视图内问数）+market 两枚+business 两枚；不新增 SessionEventMap 事件（复用 tool/call+tool/result，toolview 认领渲染）；回收 kgBridge 预留。
   - **问数层**：对话内=J2 工具族+注入上下文；视图内=kg 短语 action；persona/PromptContext 统一词汇表。
4. **「优先 AI」原则的工程化**：前端只实现原子 action 与状态投影，**编排（组合 action 达成意图）全部交模型**；白名单是安全边界不是能力边界，扩展走 K/L 轮（@ chip、`apply_view_patch` RFC6902 子集、多 tab 引用）。
5. **验收基调延续 H/I 轮**：真机实测（:3080/:13000/:5432 探活）、AI 实调验证（三主题 transcript 证据）、幂等（快照二跑零漂移+setup 链）、门禁全绿（typecheck/lint/doc-sync/duplication/hygiene/verify 计数）、证据归档 demos/acceptance-j{1..4}/。
6. **每批独立提交可独立 revert**（J3 内部三段提交），叠在 `4d3665780b` 上不推送。
7. **范围外**：CRM/Hub Portal 前端、platform/nocobase 快照源码、host agent-loop 改动、SessionEventMap 新事件、`agent-presets` host 锁语义、五系统 MES（原 J=MES 顺延 K，00 §5）。

---

## 3. 批次总览（4 批顺序执行；J1 与 J2 相互独立可交错）

| 批次 | 一句话 | 文档 | 规模 | 依赖 | 预估 |
|---|---|---|---|---|---|
| J1 输入框顶部模式选择器 | `conversation.input.mode` slot + 三态选择器 + 场景卡降级 | [01](01-j1-preset-selector.md) | 2 包改+1 新组件+e2e×3 | 无 | 1 天 |
| J2 五域工具面全覆盖 | 30 场景全量挂载 + kg-nl 下沉 + `kg_query`/`assets_browse` + persona 补全 | [02](02-j2-tool-surface.md) | 30 yml+2 新工具+快照链 | 无（与 J1 可并行） | 1 天 |
| J3 tab 感知智能上下文 | 注入层×7 tab + view-actions 能力缝 + 首批操控 action + 问数三路 | [03](03-j3-tab-context.md) | 4 新包+7 包注册+apiproxy 扩展 | J2（工具挂载对齐） | 2-2.5 天 |
| J4 收口回归 | 幂等+门禁全绿+真机全回归+Agent Note×3+文档+handoff | [04](04-j4-closeout.md) | ~8 文件 | J1-J3 | 0.5 天 |

顺序理由：J1 最小批先解「无法选择」即时痛点且零 host 风险；J2 是 J3 的工具面地基（场景会话要挂 view 工具须先建立全量挂载惯例）；J3 核心批按「注入层→能力缝→问数收口」三段内部递进（注入层独立交付即有用户价值）；J4 收口。合计约 4.5-5 个工作日。

---

## 4. 验收标准（本轮完成定义）

1. **J1**：任意会话状态输入框顶部可见模式胶囊（真机三态截图）；非 blank 选择→新会话生效（`livePreset` 轮询断言）；场景卡对进行中会话开新会话；agent-preset-selection/authoring/kb-workbench e2e 全绿；host 零行为改动。
2. **J2**：五域 AI 实调六问走通（kb 回归/湖仓/kg 模板/资产目录/业务 nb_list/连接器 discover）+ 场景会话跨域问答；scenarios 快照 30×20（J3 后 30×23）二跑零漂移；apiproxy `kg.query` 零漂移回归。
3. **J3**：七 tab 注入块内容正确（对照实验：注入后模型不再反问对象）；图谱 tab「只显示供应商」→`view_apply`→过滤实际变化（前后截图）；`run_phrase_query` 图谱渲染；`switch_view` 生效；market/business 问数走通；幂等/超时 fail loud 单测+e2e；重放可从 log 重建注入块与工具调用。
4. **J4**：全部门禁 EXIT=0；快照链/setup 链二跑零漂移；七 tab+26 旧页+五系统全活零回归；Agent Note ×3 过格式门禁；doc-sync 全绿；证据归档 demos/acceptance-j{1..4}/；handoff 0.k 落盘；提交链四批独立可 revert。

---

## 5. 硬约束（实施全程有效）

- **不动 host `agent-preset-locked` 语义**（J1 纯 UI 层解决）；不动 [`platform/nocobase`](../../platform/nocobase/MANIFEST.md) 快照源码；不动 CRM/Hub Portal 前端（G 轮资产仅回归）。
- **AGENTS.md 规范全程**：注册走 `ctx.effect()`；waterfall 必调 `next()`；capability seam 三角色齐备才完整；跨包值导入禁止、store 工厂（[`packages/client/AGENTS.md:11-36`](../../packages/client/AGENTS.md:11)）；新模型可见输入必须有 session 事件/snapshot 落 log；包 README 与 JSDoc 同 PR。
- **apiproxy 分层**：apiproxy 保持 UI→BFF 面；AI 工具不进 apiproxy（`viewState.report` 是状态上行 RPC，不是工具执行面；执行语义只经 view-actions 能力缝）。
- **每批验收前探活**：:13000 NocoBase、:3080 网关、:5432 PG、admin 登录可用。
- **提交链维持未推送基线**（`4d3665780b` 之上叠 J 轮提交）；非平凡变更随 PR 附双语 Agent Note；快照与测试同 PR 更新。

---

## 6. 风险总览

| 风险 | 等级 | 预案 | 所属批 |
|---|---|---|---|
| **期待错位**：用户要「压榨 AI 的无限操控」，J 轮白名单首批只有高频意图 | 高（沟通） | 本文件期待管理段+03 §0.3 边界清单+attempt_completion 显式分期（@ chip/patch 工具/多 tab 在 K/L）；「优先 AI」已工程化为「编排交模型」 | 全 |
| wire 请求-响应回路（view-action 关联/超时/乱序）实现复杂 | 高 | 03 段 2a 第 0 步强制先列 user-questions 通道清单再复刻；30s fail loud；e2e 断连场景 | J3 |
| 场景会话工具 6→22 系统提示膨胀、模型分心 | 中 | persona 聚焦段对冲；J4 实调质量观察，必要时 K 轮工具分组提示精简 | J2/J3 |
| kg-nl 下沉破坏 apiproxy `kg.query` | 中 | 单测锁 9 模板+错误码零漂移；真机短语回归 | J2 |
| 每请求注入 token 成本 | 中 | 几百 tok 固定格式+文本 diff 跳过；ContextMeter 可观测；J4 量化 | J3 |
| 选择器与 hero chip 双入口、accessory 行视觉挤占 | 低 | 同一 store 同数据；空 roster 返回 null 不占高；真机截图裁决，必要时 hero 窗口隐藏新行 | J1 |
| composer e2e aria 树波及（新 accessory 行） | 低 | 空态不占高把波及压最小；受影响断言逐个更新 | J1 |
| duplication 门禁对能力缝复刻段误报 | 低 | 共享类型从 Service Definition 导出、最小重写；窄例外+Note 说明 | J3/J4 |
| viewState 上报面滥用（无鉴权层） | 低 | 只读上行、<4KB 限幅、随会话清理；执行只经能力缝通道 | J3 |
| AI 实调时模型不用 view_apply（提示词不奏效） | 中 | persona/PromptContext 迭代预留；失败 transcript 归档进 K 轮 | J3/J4 |
