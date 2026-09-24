# B1 · 设计五阶段 + 全量实现 + 自测

> 上游：[PLAN.md](PLAN.md) | 执行：design-workflow 模式（含 frontend-design + high-end-visual-design skill 做视觉裁决）| 产出物目录：`research/2026-09-22-mobile-v5-aiworkmate/`（设计产物与自测证据）

## 0. 批次目标

一次交付 v5 全部：设计五阶段产物（产品问题 / 信息架构 / 视觉设计 / 实现规格 / 自测证据）+ 9 路由 8 视图全量实现 + report 围栏协议 + 工作任务闭环 + 文档主体更新 + 自测全绿。本批不做独立验收（B2 负责），但必须自带可走查的截图证据。

## 1. 阶段一：设计五阶段产物（写入 research/2026-09-22-mobile-v5-aiworkmate/）

按 v3 先例（plans/2026-09-21-mobile-v3-redesign/01-04 文档）的深度要求，产出五份设计文档：

1. **01-product-problem.md**——产品问题识别：从「单据登记闭环机」到「AI Workmate 工作台」的叙事升级论证；用户旅程痛点（为什么聊天为中心不够：工作产出无沉淀、任务不可追踪、AI 协作结果散落在对话流里）；成功标准。
2. **02-information-architecture.md**——落地 [PLAN.md §2.1 路由总表](PLAN.md) 的完整交互协议：每页信息结构、组件清单、导航流图（mermaid）、工作四态状态机、report 围栏 payload schema（TypeScript 形态，v3 §2.3 同等严谨度）、Action 执行器 dispatch 协议、TaskFormModal 表单规格、页面转场规格。
3. **03-visual-design.md**——视觉裁决落地（见本批 §3 视觉决策合同）：token 表（浅/暗双轨）、组件规格（HomeView/WorkView/WorkDetailView/ReportCard/TaskFormModal/AgentsView/TasksView/FilesView）、对比度校验、动效清单、antd-mobile 边界表。
4. **04-implementation-spec.md**——实现规格：文件级改动清单（新建/修改/删除）、workStore schema、preset persona 改写文本、测试计划。
5. **05-self-test-evidence.md**——自测证据：门禁输出、截图索引（verify-*.png）、已知限制清单。

设计阶段必须显式回答的裁决问题（不得回避）：

- **视觉三选项裁决**（A 暖棕纸感 / B 墨青票据演进 / C 全新）——必须记录与 [v3 自评 8.2 第 4 条否决记录](../../plans/2026-09-21-mobile-v3-redesign/03-visual-design.md)的关系（选 A/C 给出超越否决的新论据；选 B 论证工作台叙事的承载）。
- **agents 页角色映射**——现有 4 preset（智能填表助手/经营参谋/企业数据助手/合规官）与用户 IA 四角色（项目经理/技术专家/数据分析师/文档助手）的对齐方案：改 preset 显示名（配置层，允许）还是按现有能力重新命名角色集合；不硬凑、不虚构后端能力。
- **工作会话隔离方案**——工作执行用的隐藏会话如何标记，避免污染最近对话列表（R6）。
- **演示数据边界**——/tasks 团队任务、/files 初始收藏等首启 seed 的可辨识性。

## 2. 实现范围（代码工作面）

### 2.1 路由与 shell（packages/client/ui-mobile/src/client/）

- [`router.ts`](../../../packages/client/ui-mobile/src/client/router.ts:40)：`MobileRoute.name` 扩为 `'home' | 'chats' | 'chat' | 'work' | 'me' | 'tasks' | 'files' | 'agents' | 'login'` 九值；`work` 与 `chat` 同构支持 param 子路由；默认路由 `home`；LEGACY_HEADS 第三代折叠（v1/v2 六 head 的落点复核）。
- [`shell/MobileShell.tsx`](../../../packages/client/ui-mobile/src/client/shell/MobileShell.tsx:31)：TabBar 扩 4 项（🏠AI同事 `#/` / 💬对话 `#/chats` / 📋工作 `#/work` / 👤我的 `#/me`，lucide 图标）；chrome 白名单模式（仅 `home|chats|work|me` 渲染 TabBar，其余全屏层）；视图分发扩 9 路由。
- 页面转场：二级页 slide-in / Tab 页 fade（CSS，prefers-reduced-motion 降级）——规格由 02-IA 文档定。

### 2.2 新建视图（src/client/ 下新目录）

| 视图 | 文件 | 核心块 |
|---|---|---|
| HomeView | `home/HomeView.tsx` | 今日工作统计卡（workStore+回执派生，点击进 /work）、AI 同事横滑/列表（roster）、最近对话 3 条（sessions 投影 + 查看全部→#/chats）、快捷任务 chips（发起聊天/直达动作） |
| WorkView | `work/WorkView.tsx` | CapsuleTabs 四态（待处理/进行中/待确认/已完成）+ 任务卡列表（负责人/截止/来源会话入口）+ Empty 态 |
| WorkDetailView | `work/WorkDetailView.tsx` | 工作上下文卡（源消息锚点回链）、Agent 执行过程时间线（真实=工作会话 fold 投影；演示=模拟步骤）、结果卡、操作区（确认完成/回到聊天） |
| TasksView | `tasks/TasksView.tsx` | 我的/团队两组（workStore owner 派生），任务行点击进 /work/:id |
| FilesView | `files/FilesView.tsx` | AI 生成（工作产物报告）/ 最近文件 / 收藏（本地态）三分区 |
| AgentsView | `agents/AgentsView.tsx` | AI 同事角色卡（头像/职责/能力 chips/发起对话），数据 roster |

### 2.3 协议与聊天增强

- `protocol.ts`：新增 `ReportPayload` 类型（schema 见设计文档 02）；围栏信封版本决策落地。
- [`fold.ts`](../../../packages/client/ui-mobile/src/client/fold.ts:114)：`ChatItem` union 增 `report` 成员；report 围栏提取与分发；未知/损坏 payload 降级路径维持。
- `messages/ReportCard.tsx`（新）：metrics 网格 + rows 风险条目 + table + actions 按钮排（参考 HTML 的卡片结构形态，皮肤按视觉裁决）；Action 点击 → 统一执行器 dispatch（navigate / TaskFormModal / send 消息）。
- `work/TaskFormModal.tsx`（新）：antd-mobile Modal + 表单（标题 Input / 负责人 Picker / 截止 DatePicker / AI 建议只读区）；提交 → workStore.create + Toast + navigate。
- ChatView：结构化卡片与现有 v3 卡（ask/draft/receipt）同流混排；演示态 typing 指示与流式模拟（无 key 分支）。

### 2.4 workStore（新文件 src/client/workStore.ts）

- localStorage `dsh-mobile-work`：`WorkItem { id, title, owner, due, suggestion, status: 'todo'|'doing'|'review'|'done', sourceSessionId?, sourceAnchor?, execSessionId?, result?, createdAt, updatedAt }`；CRUD + 四态转移（todo→doing→review→done，review 可打回 doing）+ 订阅通知（首页/工作页联动刷新）。
- 派生选择器：今日统计、按状态过滤、我的/团队、文件产物投影。

### 2.5 工作执行链路（两态）

- 真实态：创建工作时同步 `createSession`（隔离标记）并 prompt 执行指令 → WorkDetailView 轮询该会话 fold 投影为执行时间线 → 完成时在**源会话**发送 user 动作消息（工作完成事件进 durable log，AI 真实收尾）+ workStore 翻 review。
- 演示态（无 key）：同组件注入模拟时间线数据源（setTimeout 推进步骤），UI 不区分实现细节。
- 遵守 [PLAN.md §3.4](PLAN.md) 硬约束：wire 无写方法；nb_create 场景仍走 agent。

### 2.6 preset persona 与注册表

- `examples/kb-agent/agent-presets/`（mobile-form-assistant / business-advisor）：persona 增 report 围栏输出规范（何时输出、schema、actions 语义约束——正文纪律延续：围栏外只说人话）；agents 页角色显示名映射（设计阶段裁决的方案）。

### 2.7 ProfileView 扩展

- 现有身份卡/最近回执行/暗色开关保留；增工作空间区（今日/累计统计）、AI 偏好（演示态可调项）、通知开关（本地态）、设置组——具体信息结构由设计文档定，不得虚构后端。

### 2.8 文档与注释

- ui-mobile README 双语 IA 段重写（8 路由 + 4 Tab + 两态说明 + 已知限制扩展：本地态跨设备）。
- [QUICKSTART.zh.md](../../../examples/kb-agent/QUICKSTART.zh.md:240) v1 四 Tab 漂移清理为 v5 实况。
- [`apps/web/src/mobile.ts`](../../../apps/web/src/mobile.ts:3) "four-tab" 注释、LoginView JWT 假注释改为如实描述 demo 通道。
- Agent Note 一篇（v5 IA 重构决策记录）。

## 3. 视觉决策合同（交 frontend-design + high-end-visual-design skill）

输入：参考 HTML（/Users/mac/Downloads/ai-coworker-mobile-h5(1).html——暖棕纸感单页聊天 demo，仅形态参考）+ v4 落地资产（墨青票据 token 双轨 / PhaseStamp / 四联材质 / 16 antd-mobile 组件面）+ [v3 自评否决记录](../../plans/2026-09-21-mobile-v3-redesign/03-visual-design.md)。

裁决流程：两遍设计-自评循环（第一遍默认答案清单 → 逐项自评修订 → 第二遍对照三大 AI 默认脸 + brief 校验），产出 03-visual-design.md 必含：方向陈述 + signature 元素、token 双轨表（v3 §2.2/2.3 同格式）、组件规格（含全部新视图）、WCAG 对比度核算表、动效清单（克制原则）、antd-mobile 边界表。

验收线：①非模板脸（过三大默认脸回避）②食品 B 端语境协调 ③8 页体系性承载（工作四态/结构化卡片/Agents 目录有统一语言）④暗色双轨完整 ⑤与 v3 否决记录的关系显式记录。

## 4. 自测（B1 完成定义）

```sh
pnpm vitest run packages/client/ui-mobile     # 单测全绿（router/workStore/fold/新视图 spec 齐备）
pnpm run typecheck && pnpm run lint
pnpm run test:web -- mobile                   # e2e：golden 重录 + 负断言保留
```

- 新增单测清单：router v5 解析/折叠/默认路由、workStore CRUD+状态机+持久化往返、fold report 分发与降级、ReportCard/TaskFormModal/HomeView/WorkView/WorkDetailView/TasksView/FilesView/AgentsView 组件 spec、Action 执行器、演示态分支。
- e2e 更新：mobile-shell 四 Tab 断言；mobile-assistant golden 重录（含 report 围栏 seed 样本）；mobile-preview-iframe golden 重录。**负断言逐条保留**（无 ```dsh、无 hub_* 、无 nb_create 字样、welcome 零冒名），并增 report 协议不可见。
- 截图：shoot.mjs 式自控 CDP 截图，verify-*.png 落 `research/2026-09-22-mobile-v5-aiworkmate/`（至少：首页/对话列表/聊天 report 卡/任务 Modal/工作四态/工作详情/任务/文件/同事/我的/登录，浅深双轨关键页 + PC 预览 1 张）。
- 自测报告 05-self-test-evidence.md：命令输出摘要 + 截图索引 + 已知限制清单 + 未尽事项（交 B2）。

## 5. 批次验收标准（B1 Done）

1. 9 路由 + 4 Tab 在真实浏览器（chrome-devtools）全部可达且转场正常，截图落盘。
2. 核心闭环剧本在演示态全链走通（风险问题→report 卡→创建任务→工作四态→完成回聊），真实态代码路径存在且由 key 分支切换。
3. §2.8 硬约束六条逐条自查记录（真实 LLM/v3 表单流程落库/wire 无写/PC 预览/两态/模拟不进 log）。
4. 自测命令三条全绿；coverage 不低于现状（per-file 100% 维持或 v8-ignore 预算内）。
5. 设计五阶段文档齐备，视觉裁决与 v3 否决记录关系已记录。
6. 文档主体更新完成（README 双语/QUICKSTART/两处注释/Agent Note）。
