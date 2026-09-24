# 移动端 v5「AI Workmate 产品级重构」总计划

> 日期：2026-09-22 | 性质：Loop 任务规划（配方 G 三批次：设计+实现 / 独立验收 / 清尾复验）| 执行模式：B1 交 design-workflow（frontend-design + high-end-visual-design skill 决策视觉），B2/B3 走 verifier/verify-executor | 上游基线：[v3 重设计计划](../2026-09-21-mobile-v3-redesign/02-information-architecture.md)、[v4 视觉批次](../2026-09-22-mobile-v4-redesign/01-visual-batch.md)（已全部落地）、[v4 审计报告](../../research/2026-09-22-mobile-v4-audit/report.md)（重设计前基线，verify-*.png 14 张为落地后证据）

## 0. 目标摘要

把移动端从 v3/v4 的「聊天为中心的单据登记闭环机」升级为「AI Workmate 工作台」：**首页发现工作 → 进入 AI 同事聊天 → AI 返回结构化 UI → 用户点击 Action → 形成工作任务 → 进入工作 → Agent 执行 → 结果回到聊天**。核心逻辑是「不是每个页面都塞一个聊天框」——聊天是 AI 协作的界面，工作是协作的产出，两者经结构化 Action 打通成闭环。

落地为 8 页面路由 + 4 Tab 底部导航，全量真实浏览器可走查；审美要求「高级」，与食品行业 B 端语境协调。硬约束：现有真实能力（LLM 聊天、nb_create 真库落库、PC iframe 预览）零回退。

## 1. 现状盘点结论（调研实证）

### 1.1 代码位置与结构（已核实）

- 移动端本体：[`packages/client/ui-mobile`](packages/client/ui-mobile/package.json:1)，`src/client/` 27 个源文件：根层 [router.ts](packages/client/ui-mobile/src/client/router.ts:40)、[shell/MobileShell.tsx](packages/client/ui-mobile/src/client/shell/MobileShell.tsx:31)、[sessionsService.ts](packages/client/ui-mobile/src/client/sessionsService.ts:36)、[fold.ts](packages/client/ui-mobile/src/client/fold.ts:114)、[cardState.ts](packages/client/ui-mobile/src/client/cardState.ts:16)、[tokens.css](packages/client/ui-mobile/src/client/tokens.css:14) 等；子目录 `messages/`（ChatView/MessagesView/projection 等 12 文件）、`forms/v3/`（DraftCard/PhaseStamp/ReceiptCard）、`profile/`、`login/`、`kg/`、`shell/`。
- PC 预览：[`packages/client/ui-mobile-preview`](packages/client/ui-mobile-preview/src/client/MobilePreviewView.tsx:22)——390×844 手机壳 + 同源 iframe `/mobile`。
- 注入入口：[`apps/web/src/mobile.ts`](apps/web/src/mobile.ts:8) 薄引导（`AppMobileEntry(el).run()`）；`/mobile` 由 [`packages/bundle/web-app`](packages/bundle/web-app/src/index.ts:257) 静态服务 `mobile.html`。
- 依赖：antd-mobile ^5.43.0、lucide-react、markdown-it、dompurify——**无路由库**，自研 hash router。

### 1.2 路由与 shell 机制（v5 迁移的支点）

- 自研 hash router（79 行）：`parseRoute`/`useRoute`/`navigate`，当前 4 路由 `login | chats | chat(带 param) | me`；[`LEGACY_HEADS`](packages/client/ui-mobile/src/client/router.ts:26) 已把 v1/v2 六个旧 head 折叠到 chats/me——**三代 IA 折叠过两轮，8 路由是第三次，兼容模式直接照抄**。
- TabBar 在 [`MobileShell.tsx`](packages/client/ui-mobile/src/client/shell/MobileShell.tsx:47)：antd-mobile TabBar + SafeArea，当前两项（消息/我的）；全屏层判定 `const chrome = name !== 'chat'`（[:37](packages/client/ui-mobile/src/client/shell/MobileShell.tsx:37)）——v4 的 T1 已实现聊天页隐藏 tabbar。
- 深链兼容：`/mobile` 由 hash 路由承载（`/mobile#/chat/<id>`），服务器只静态返回 mobile.html——**8 路由扩展零服务器改动**；用户提及的「NocoBase SPA fallback」是 `:3080 /nocobase/dist/{crm,hub}/` 另一条链路，与 /mobile 无关。

### 1.3 状态与数据管线

- 服务端唯一真源 = durable session log：`session.history` RPC → [`foldHistory`](packages/client/ui-mobile/src/client/fold.ts:1) 纯投影 → UI；卡片相位/已答 ask/回执全部重放派生（[`deriveCardStates`](packages/client/ui-mobile/src/client/cardState.ts:49)）。**数据层与路由完全解耦，v5 只动 router + shell + 视图分发。**
- [`ChatItem`](packages/client/ui-mobile/src/client/fold.ts:114) union 已有 8 成员（text/tool/task-card/ask/field-ask/action/receipt/degraded）——v5 新增结构化报告卡走同一扩展模式。
- localStorage 现有 key 全集：`dsh-mobile-theme`/`dsh-mobile-auth`/`dsh-mobile-draft-*`/`dsh-mobile-pending`/`dsh-mobile-read`/`dsh-mobile-pins`——v5 新增工作存储沿用 `dsh-mobile-` 前缀族。
- 已知边界：聊天是**轮询非流**（running 1.2s / idle 5s，README 已列为已知限制）；unread/置顶全是本地态。

### 1.4 真实链路（不回退清单的事实基础）

- LLM：composer → [`promptSession`](packages/client/ui-mobile/src/client/sessionsService.ts:128)（`session.prompt` mode:'queue'）→ 网关 agent loop → `llm-minimax` 插件（MiniMax-M3；`127.0.0.1:13100` 是 NocoBase 侧附件/think 过滤代理，`MINIMAX_BASE_URL` 指向它时经过）→ 事件落 durable log → 轮询重折叠。
- 落库：`nb_create` 走 agent 工具（[`packages/connector/tool-nocobase/src/write.ts`](packages/connector/tool-nocobase/src/write.ts:152)），**wire 面（rpc.ts）只有读方法，写永远走 agent 工具**——v5 保持此硬边界。
- 登录：**当前是 demo mock**——[`verifyCode`](packages/client/ui-mobile/src/client/auth.ts:61) 接受任意 6 位数字码；[`LoginView.tsx`](packages/client/ui-mobile/src/client/login/LoginView.tsx:4) 注释仍声称 "rides the same NocoBase JWT channel"，**注释与实现矛盾**，v5 必须清理（auth 本体不在本次范围，见 §3.6）。
- agent-presets：4 个（mobile-form-assistant / business-advisor / enterprise-data-assistant / food-compliance-officer），两个移动端 preset 的 `welcome` 块均已实现，经 `agentPreset.list` 下发。

### 1.5 v4 视觉资产（已落地，355 测试全绿）

票据四联材质（v3.module.css）、44px [`PhaseStamp`](packages/client/ui-mobile/src/client/forms/v3/PhaseStamp.tsx:33)、antd-mobile 16 组件面（NavBar/SwipeAction/CapsuleTabs/SearchBar/Badge/Tag/Collapse/Toast/ImageViewer 等）、会话列表投影 [`projection.ts`](packages/client/ui-mobile/src/client/messages/projection.ts:49)、我的页最近回执行——全部有 e2e golden 与 14 张 verify 截图锁定。**墨青冷链票据 token 双轨**（浅/暗）完整，业务 CSS 硬编码 hex 仅 3 处。

### 1.6 测试与门禁

- 单测：`packages/client/ui-mobile/tests/` 19 个 client spec（jsdom lane）。
- e2e（keyless，`pnpm run test:web -- <name>`）：`mobile-shell`（引导+两 tab）、`mobile-assistant`（4 用例：aria golden + 协议不可见负断言 [:159](apps/web/tests/mobile-assistant.e2e.ts:159)——body 无 ```dsh、无 hub_* 表名 + fenced confirm + welcome 零冒名）、`mobile-preview-iframe`。
- 截图脚本：`research/2026-09-22-mobile-v4-audit/shoot.mjs`（chrome-devtools CDP 自控，非产品代码）——v5 复用此惯例。
- **coverage：ui-mobile src 全树在 per-file 100% 门禁内、无豁免**（[coverage-exempt.ts](scripts/coverage-exempt.ts:29) 不含它）；v8-ignore 净增预算 ≤10/批。
- 文档漂移三处待清：[`apps/web/src/mobile.ts:3`](apps/web/src/mobile.ts:3) "four-tab"（v1 遗留）、[`QUICKSTART.zh.md`](examples/kb-agent/QUICKSTART.zh.md:240)「四 Tab：消息、工作台、数据、我的」（已漂移两版）、LoginView JWT 假注释。

## 2. 目标信息架构（用户指定，不得缩水）

### 2.1 路由总表（v5 最终形态）

用户指定 8 页面路由 + 4 Tab。工程落地为 10 个 hash path：8 个指定路由 + `/chats`（💬对话 Tab 的落点 = 现 MessagesView 平移改造）+ `/login`（身份 gate，不计数）。

| 路由 | Tab 落点 | 页面 | 核心内容（用户 IA） | 数据来源 |
|---|---|---|---|---|
| `#/` | Tab1 🏠AI同事 | HomeView（新建） | 今日工作、AI 同事列表、最近对话、快捷任务 | workStore + roster + sessions 投影 |
| `#/chats` | Tab2 💬对话 | MessagesView（平移） | 会话列表（v4 资产全继承） | durable log 投影 |
| `#/chat/:id` | 全屏层 | ChatView（现有 + 结构化报告卡） | 消息、卡片、表格、图表、文件、可执行 Action | durable log + 轮询 |
| `#/work` | Tab3 📋工作 | WorkView（新建） | 待处理、进行中、待确认、已完成（四态） | workStore + 回执派生 |
| `#/work/:id` | 全屏层 | WorkDetailView（新建） | 工作上下文、Agent 执行过程、结果、操作 | workStore + 工作会话投影 |
| `#/tasks` | 二级页（NavBar 返回） | TasksView（新建） | 我的任务、团队任务 | workStore 派生 |
| `#/files` | 二级页 | FilesView（新建） | AI 生成、最近文件、收藏 | workStore 产物派生 |
| `#/agents` | 二级页 | AgentsView（新建） | AI 同事目录（角色卡） | roster/presets |
| `#/me` | Tab4 👤我的 | ProfileView（扩展） | 工作空间、AI 偏好、通知、设置 | 现有 + 新设置项 |
| `#/login` | gate | LoginView（现有） | 登录 | 现有 demo 通道 |

chrome（TabBar）白名单：`home | chats | work | me` 四个一级页显示底部导航；其余全屏层 + NavBar 返回。默认路由（空 hash）从 `chats` 改为 `home`。

LEGACY_HEADS 第三代折叠：v1/v2 六 head 维持折到 `chats`（或改折 `home`，设计阶段定）；v3 的 `chats/chat/me/login` 在 v5 中仍是有效路由原样保留。

### 2.2 核心闭环（验收剧本）

```
首页(#/) 今日工作/快捷任务 → 点「问 AI 同事」或最近对话
  → 聊天(#/chat/:id) 问「帮我整理一下今天项目风险」
  → AI 真实回复 + ```dsh report 围栏 → ReportCard（风险统计 metrics + 风险条目 + actions）
  → 点 [创建处理任务] → TaskFormModal（标题/负责人下拉/截止时间/AI 建议）
  → 创建 → workStore 落 localStorage + Toast + navigate(#/work/:id)
  → 工作详情：Agent 执行过程（真实链路=隐藏工作会话的工具调用/消息投影；无 key=模拟时间线）
  → 完成 → 状态翻 review（待确认）→ 用户确认 → done（已完成）
  → 「回到聊天」→ navigate 回源会话，AI 已收到工作完成事件（durable log 内真实 user 动作消息）并收尾
```

工作四态：`todo`（待处理）→ `doing`（进行中）→ `review`（待确认）→ `done`（已完成）。

## 3. 关键技术决策

### 3.1 D1 路由：继续自研 hash router，不引入路由库

- 理由：现 router 仅 79 行且已验证三代折叠；`/mobile` 深链天然由 hash 承载（PC iframe、NocoBase 宿主环境、静态服务全部零改动）；引入 react-router 等反而增加发布包依赖与 bundle 体积，违反「prefer maintained dependencies 仅当真正删除自有代码」的仓库政策——9 路由用现有 parseRoute 模式扩展成本远低于引库。
- 实现要点：`MobileRoute.name` 扩为 9 值联合；`work` 与 `chat` 同构（带 param 子路由）；默认路由改 `home`；LEGACY_HEADS 增补当前 `chats` 不折（仍有效）。
- 页面转场：hash 路由下用 CSS 视图切换动效（slide-in 二级页 / fade Tab 切换），尊重 prefers-reduced-motion——具体规格由设计阶段定。

### 3.2 D2 数据策略：workStore（localStorage）+ durable log 派生双源，边界显式

- 新建 `workStore.ts`（localStorage `dsh-mobile-work`）：工作项 CRUD + 四态状态机 + 关联字段（源会话 id、源消息锚点、负责人、截止时间、AI 建议、执行会话 id、结果摘要）。**不虚构后端**——用户明确「localStorage 优先即可」。
- 「模型可见 ⟺ 日志可重建」红线：工作创建/完成等**需要 AI 知道的事件必须以真实 user 消息进 durable log**（如「已创建处理任务：接口联调延期处理，负责人张三，截止周五」），AI 收尾回复走真实链路——不允许只改本地 store 假装 AI 知道。
- 首页今日统计 = workStore 过滤 + durable log 回执派生；/tasks 我的 vs 团队 = workStore owner 字段派生；/files = 工作产物（报告文本落 workStore）派生。演示数据（团队任务、文件收藏）首启 seed 且可辨，不冒充后端数据。
- 已知边界入 README：本地态跨设备不同步（沿用 v3/v4 已知限制条款并扩展）。

### 3.3 D3 协议扩展：v5 `report` 围栏（复用 v3 信封模式）

- v3 围栏协议（`v:3` 信封 + type 判别 + fold 分发 + 未知 type 降级为代码块）是已验证的扩展点。v5 新增 `type: 'report'`（信封版本升 `v:5` 或沿用 `v:3` 由设计阶段定，向后兼容性依赖现有降级路径已保证）。
- payload 骨架（设计阶段细化）：`title / subtitle? / metrics[]（label+value+kind+tone）/ rows[]（label+hint+level）/ table?（columns+rows）/ actions[]（label+kind: 'view'|'create-task'|'send'|'link' + payload）`——参考 HTML 的 metrics 三列网格、风险条目、actions 按钮排形态即其渲染规格原型。
- persona 提示词扩展：mobile-form-assistant / business-advisor 教会「风险/统计/周报/对比类问题输出 report 围栏」；actions 中 `send` 类回聊天发消息、`create-task` 类开 Modal、`view` 类路由跳转。
- Action 执行器：前端统一 dispatch（路由跳转 / Modal / 发消息三类），与 v3 的围栏动作判别同构。
- e2e 负断言扩展：report 围栏协议不可见（无 ```dsh、无 snake_case 字段直出）沿用现有断言模式。

### 3.4 D4 真实能力不回退（硬约束清单，B1/B2 逐条验收）

1. 真实 LLM 聊天链路（promptSession → llm-minimax → MiniMax-M3 → 轮询渲染）在新 `#/chat/:id` 全屏层下行为不变。
2. v3 表单流程全保留：ask_choice / ask_field / form_draft / form_confirm / reject_flow / submit_receipt + `nb_create` 真库落库（hub_* 六表）——从新 IA 的聊天页继续可用，回执卡、相位戳、四联材质原样。
3. wire 无写方法边界保持：前端动作（创建工作任务等）只写 localStorage，涉及真库仍走 agent nb_create。
4. PC 预览（ui-mobile-preview iframe /mobile）适配新路由零回归，golden 重录。
5. 两态覆盖：有 key（真实链路：report 围栏由真 AI 产出、工作执行用真实隐藏会话）与无 key（演示态：流式回复模拟 + 模拟执行时间线）。**模拟不得替代真实链路**——同一代码路径，数据源切换。
6. 演示态的流式模拟与 typing 指示只在无 key 分支启用，实现为 ChatView 渲染层的 demo 适配，不进 durable log。

### 3.5 D5 视觉方向：三选项，B1 设计阶段用 frontend-design + high-end-visual-design skill 裁决

| 选项 | 内容 | 换轨成本 | 关键约束 |
|---|---|---|---|
| A | 参考_html 暖棕纸感（accent #6b4f3a、bg #f6f6f4、SF Pro/PingFang、430px 壳、结构化卡） | 高：token 双轨整轨替换 + v4 资产重适配 | **v3 自评记录 8.2 第 4 条曾明确否决「米白纸感+terracotta」AI 默认脸①**——选 A 必须给出超越该否决的新论据（例如：暖棕≠terracotta 的纯度/饱和度论证、IA 从单据机扩展为 Workmate 工作台的产品叙事变化、结构化卡片语境 vs 杂志脸语境差异），并在设计文档显式记录与 v3 否决记录的关系，避免翻烧饼 |
| B | 延续 v4 墨青冷链票据台账并演进（工作台化扩展：新组件沿用四联材质 + PhaseStamp 语言） | 最低：token 轨/PhaseStamp/16 组件面全继承 | 需证明能承载 8 路由的「工作台」叙事而不显单调 |
| C | 全新方向（frontend-design skill 重新扎根：主题、行业、签名元素） | 高：同 A | 必须过三大 AI 默认脸回避清单 + 与食品 B 端语境协调论证 |

裁决标准：①高级审美（非模板脸）②与食品行业 B 端业务语境协调 ③结构化卡片/工作四态/新 8 页的体系性承载 ④参考 HTML 仅是形态参考（卡片结构/信息密度），不是皮肤照抄。裁决产物 = 03-visual-design.md（token 表、组件规格、对比度校验，v3 文档同等深度）。

### 3.6 D6 范围裁决：产品级 auth 不在本次范围

登录维持现有 demo 单缝（verifyCode），但必须：清理 LoginView 假注释（JWT 说法改为如实描述 demo 通道）；README 已知限制如实记录。理由：真 auth 需要后端通道（NocoBase JWT 或网关身份），属独立后端工作，混入 UI 重构批次会破坏「不虚构后端」边界。

## 4. 批次拆分（配方 G，三批次）

| 批次 | 文档 | 内容 | 完成定义 |
|---|---|---|---|
| B1 设计+实现+自测 | [01-design-and-impl.md](01-design-and-impl.md) | design-workflow 五阶段产物（产品问题/IA/视觉/实现规格/自测证据）+ 全量实现（9 路由 + 8 视图 + report 围栏 + 工作闭环 + 视觉落地 + 文档主体）+ 自测全绿 + 自控截图 | 门禁绿（test/typecheck/lint/e2e golden）+ 截图落盘 + 两态可用 |
| B2 独立验收 | [02-acceptance.md](02-acceptance.md) | 真实浏览器全路由截图走查（浅/深双轨）+ 真实 API 闭环剧本验证 + PC iframe 验证 + coverage 全量 + findings 报告 | findings 报告产出，PASS/FAIL 分级明确 |
| B3 清尾+复验 | [03-cleanup.md](03-cleanup.md) | findings 一次性清尾（配方 F：全部修复不辩解）+ 逐项复验 + doc-sync 收口 + 最终报告 | findings 清零 + 复验证据 + doc-sync 绿 |

批次门禁命令（遵循 dsh-pre-push-checks 最小集原则，不跑全仓套件）：

```sh
pnpm vitest run packages/client/ui-mobile     # B1 聚焦单测
pnpm run typecheck && pnpm run lint           # B1/B3
pnpm run test:web -- mobile                   # B1 e2e（golden 重录后）
pnpm run test:coverage                        # B2 全量（CI 同口径）
pnpm run doc-sync                             # B3 文档收口
```

## 5. 测试与证据计划

- 证据目录：`research/2026-09-22-mobile-v5-aiworkmate/`（沿用 v4 惯例：`verify-*.png` 命名 + shoot.mjs 式自控 CDP 截图脚本 + findings 报告）。
- 单测新增/改造：router v5（9 路由解析 + 第三代折叠 + 默认路由）、workStore（CRUD/状态机/持久化往返）、fold report 围栏（分发/降级）、ReportCard / TaskFormModal / WorkView / WorkDetailView / HomeView 组件 spec、Action 执行器 dispatch。
- e2e：`mobile-shell`（4 Tab 断言）、`mobile-assistant`（golden 重录 + report 围栏用例 + 协议不可见负断言保留）、`mobile-preview-iframe`（golden 重录）；seed jsonl 扩展 report 围栏样本（keyless 回放）。
- 文档同步清单：ui-mobile README 双语（IA 段重写）、ui-mobile-preview README、[QUICKSTART.zh.md](examples/kb-agent/QUICKSTART.zh.md:240) v1 四 Tab 漂移清理、[`apps/web/src/mobile.ts`](apps/web/src/mobile.ts:3) 注释、LoginView 假注释、docs/config-catalog 与 web-server 文档（如叙述涉及）、Agent Note（v5 必写一篇）。

## 6. 风险与注意点

| # | 风险 | 缓解 |
|---|---|---|
| R1 | coverage per-file 100% 无豁免 × 8 路由量级改动 | B1 按模块推进单测（router→workStore→fold→视图），v4 先例 355 测试一次收口可行；v8-ignore 预算 ≤10/批 |
| R2 | golden 重录掩盖回归 | 负断言（协议不可见、welcome 零冒名、无 nb_create 字样）逐条保留并扩展到 report 围栏；重录 diff 必须人工过目 |
| R3 | 视觉翻烧饼（A vs v3 否决记录冲突） | 设计阶段强制显式记录与 [v3 自评 8.2](../2026-09-21-mobile-v3-redesign/03-visual-design.md) 的关系；裁决标准四条写入设计合同 |
| R4 | 双源一致性（workStore 本地态 vs durable log） | 「模型可见⟺日志可重建」红线：AI 必须知道的事件一律走真实 user 消息进 log；纯 UI 态（收藏/已读/置顶）留在本地并记录边界 |
| R5 | 两态（真实/演示）分支覆盖不足 | Action 执行器与执行时间线组件单数据源双态注入；e2e 覆盖演示态，B2 用真实 API 补真实态证据 |
| R6 | 工作执行「隐藏会话」与现有 roster/会话列表的污染 | 工作会话需标记隔离（不进最近对话列表或折叠分区），设计阶段定标记方案 |
| R7 | 文档量 7+ 项漂移清理遗漏 | 清单入 B1/B3 验收项，doc-sync 门禁兜底 |
| R8 | 轮询非流与「AI 流式回复模拟」的误解 | 流式模拟仅限演示态渲染层；真实链路保持轮询（已知限制延续），不借机擅自升级流式协议（超范围） |

## 7. 交付物清单

- `plans/2026-09-22-mobile-v5-aiworkmate/`：本 PLAN + [01-design-and-impl.md](01-design-and-impl.md) + [02-acceptance.md](02-acceptance.md) + [03-cleanup.md](03-cleanup.md)。
- `research/2026-09-22-mobile-v5-aiworkmate/`：设计五阶段产物（B1 产出）+ verify-* 截图 + findings/复验报告（B2/B3 产出）。
- 代码：packages/client/ui-mobile 主体 + examples/kb-agent presets persona 扩展 + apps/web 注释清理 + 文档同步。
