# 移动端 v5「AI Workmate」· 产品问题重定义

> 日期：2026-09-22 | 作者：设计流程 Agent（产品问题重定义，不写代码） | 上游：[PLAN.md](../../../plans/2026-09-22-mobile-v5-aiworkmate/PLAN.md) §0 目标摘要与 §2 目标 IA | 基线：[v3 产品问题文档](../../../plans/2026-09-21-mobile-v3-redesign/01-product-problem.md)（单据登记闭环）+ [v4 视觉批次](../../../plans/2026-09-22-mobile-v4-redesign/01-visual-batch.md)（已落地） | 下游：[02-information-architecture.md](02-information-architecture.md) 消费本文命题与成功标准；[04-implementation-spec.md](04-implementation-spec.md) 消费成功标准的工程映射

设计总纲一句话：**v3/v4 把「一句话登记一条单据」的闭环做对了，v5 把移动端从这台闭环机升级为 AI Workmate 工作台——首页发现工作，聊天完成协作，结构化 Action 把协作结论变成可追踪的工作，工作结果回到对话完成闭环。**

## 0. 验收锚点：上游输入

1. PLAN §0：「把移动端从『聊天为中心的单据登记闭环机』升级为『AI Workmate 工作台』……核心逻辑是『不是每个页面都塞一个聊天框』——聊天是 AI 协作的界面，工作是协作的产出，两者经结构化 Action 打通成闭环。」
2. PLAN §2.1：8 页面路由 + 4 Tab（首页 AI 同事 / 对话 / 工作 / 我的），用户指定不得缩水。
3. PLAN §3.4：真实能力不回退六条硬约束（真实 LLM、v3 表单闭环与真库落库、wire 无写方法、PC 预览、两态覆盖、模拟不进 log）。

## 1. 定位升级：从单据登记闭环机到 AI Workmate 工作台

### 1.1 v3/v4 已解决什么

v3 确立了单据登记的五步闭环机（意图匹配 → 最小问答 → 三分层草稿 → 围栏化确认/驳回 → 落库回执），v4 补齐了票据四联材质的视觉语言。两代合力把「说一句话登记一条采购单」做到产品级：[fold.ts](../../../packages/client/ui-mobile/src/client/fold.ts) 的八成员 ChatItem、[protocol.ts](../../../packages/client/ui-mobile/src/client/protocol.ts) 的 v3 信封围栏、355 个测试与 14 张验收截图锁定。

### 1.2 v5 的增量命题

登记只是移动端工作的一种。企业主与业务员在手机上的完整一天还有另一半：**让 AI 帮我处理一件事，并让我看得见它的进展与结果**——整理今天的项目风险、对比三家供应商、生成一份周报、跟进一个延期事项。这一半在 v3/v4 里没有着落：

- 「登记」有闭环机（草稿卡 → 确认 → 回执），「处理」没有——AI 给完一段回答，协作就结束了；
- 单据有落库真源（hub_* 表 + 回执卡），工作没有真源——没有任务列表、没有状态、没有负责人与截止。

v5 的增量不是替换登记，而是给「处理」配上与登记同等严谨的闭环：**报告卡（report 围栏）承接 AI 的结构化结论，工作任务（workStore 四态）承接协作的产出，Action 执行器把两者接起来。** 登记闭环原样保留在新 IA 的聊天页里。

### 1.3 参考原型的形态印证

用户提供的参考原型（ai-coworker-mobile-h5.html）呈现了目标形态的三块拼图：AI 主动给出「今日工作概览」指标卡、风险条目卡（点标 + 主文案 + 副行）、卡尾可执行 actions（查看待办 / 打开工作台 / 创建处理任务）。该原型的 actions 是 toast 假动作、数据是写死的；v5 把同样的卡片形态落到真实协议（report 围栏由真 AI 产出）与真实执行（dispatch 三类动作）上。原型仅作形态参考，不作皮肤与数据来源。

## 2. 用户旅程痛点：为什么聊天为中心不够

三个痛点按「现象 → 现状证据 → 根因」给出，均有代码证据。

### 2.1 工作产出无沉淀

**现象**：问经营参谋「本月有什么风险」，AI 给出一段带来源的结论；问「对比这两家供应商」，得到一段对比叙述。第二天想回顾，只能翻聊天记录；换一个会话问，上一个会话的结论不可见。

**证据**：AI 的回答只存在于 durable log 的 assistant 消息里，以 [RichContent](../../../packages/client/ui-mobile/src/client/messages/RichContent.tsx) 气泡渲染；移动端没有任何「产物」页面——[colleagues.ts](../../../packages/client/ui-mobile/src/client/colleagues.ts) 的两个 preset 全部以对话为终点，[ProfileView](../../../packages/client/ui-mobile/src/client/profile/ProfileView.tsx) 的最近回执条也只回链到会话。

**根因**：产品把「回答」当成了「交付」。一次有价值的分析（风险清单、对比结论、周报草稿）没有从对话流中析出为可独立存在的产出物，用户视野里没有「我的文件」「AI 为我生成的东西」。

### 2.2 任务不可追踪

**现象**：AI 说「接口联调延期建议今天确认」，用户认可这个判断——然后呢？没有地方把这个建议变成一条有负责人、有截止、有状态的任务；AI 也无法替用户跟进执行。

**证据**：ChatItem union 里的 `task-card` 是**表单草稿卡**（[fold.ts:53](../../../packages/client/ui-mobile/src/client/fold.ts) 携带 FormDraft 载荷），相位机是 draft→pending→submitted/rejected 的**单据生命周期**（[cardState.ts](../../../packages/client/ui-mobile/src/client/cardState.ts)），与「工作任务」的 todo/doing/review/done 是两个概念；localStorage 现有键族（dsh-mobile-theme/auth/draft/pending/read/pins）中没有工作存储。

**根因**：v3 的状态机为单据设计，协作动作（采纳建议、指派负责人、设截止、跟进执行）在产品词汇表里不存在，AI 的结论与用户的行动之间断链。

### 2.3 AI 协作结果散落在对话流里

**现象**：风险统计、对比表格、周报要点混排在一串气泡与工具行之间；想找上周那份供应商对比，要在多个会话里凭记忆翻找。

**证据**：会话是唯一的内容容器；[projection.ts](../../../packages/client/ui-mobile/src/client/messages/projection.ts) 只投影一行摘要；跨会话的内容聚合面（文件、任务）不存在。

**根因**：信息架构以会话为唯一一级组织维度，结论型内容没有第二归宿。

## 3. 核心命题：不是每个页面都塞一个聊天框

### 3.1 反面模式

给工作页、文件页、任务页各配一个迷你聊天框，是「聊天为中心」最省事的延伸。它错在三处：对话历史割裂（每页一个孤岛会话，轮询成本翻倍）；协议围栏的渲染与动作逻辑被迫在每个页面重做；用户心智负担——每页都要先想「这件事该在这页问还是在聊天页问」。

### 3.2 三件套：聊天是界面，工作是产出，Action 是闭环

- **聊天 = AI 协作的界面**：唯一对话面是全屏 `#/chat/:id`，全部围栏协议（v3 六种 + v5 report）只在此渲染；
- **工作 = 协作的产出**：`#/work` 四态工作流、`#/tasks` 任务目录、`#/files` 产物文件，数据来自 workStore 与 durable log 派生，不设聊天框；
- **Action = 打通闭环的结构化通道**：report 围栏的 actions 是从对话走向工作的单向门——`create-task` 把对话结论变成工作项，`view` 把工作状态带回视野，`send` 把工作结果送回对话让 AI 收尾。

闭环全链：**首页发现工作 → 聊天协作 → AI 返回 report 卡 → 用户点 Action → 工作项落 workStore → 工作页四态流转 → Agent 执行（隔离会话）→ 完成事件回源会话 → AI 真实收尾**。AI 因此成为 workmate：它发起的结论能变成可追踪的工作，它执行的工作能回到对话被确认。

### 3.3 与 v3 协议的连续性

v3 已证明「dsh 围栏 + v 信封 + type 判别 + 校验失败降级」是可靠扩展点（六种载荷、三代 IA 折叠零事故）。v5 的 report 围栏是同一信封下的第七种载荷，不新造协议机制；Action 执行器把 v3「卡上按钮 → 组装动作消息 → send」的模式推广为「报告卡按钮 → 路由跳转 / 表单弹层 / 发消息」三类，与 v3 的围栏动作判别同构。信封版本沿用 `v:3` 的裁决依据见 [02 §4.1](02-information-architecture.md)。

## 4. 边界（不做清单）

1. **不做真实多人协作任务系统**：owner 是演示 seed 的团队成员名，不是账号体系；不引入分派/审批/工时。
2. **不做跨设备工作同步**：workStore 是 localStorage 本地态（与 v3/v4 已知限制条款同族扩展）；需要 AI 知道的事件一律以真实 user 消息进 durable log，跨设备由日志重放保证。
3. **不做工作流引擎**：四态状态机是本地转移 + 日志消息，不是 BPM/编排。
4. **不虚构后端能力**：agents 页只收 roster 真实下发的 preset（用户 IA 中的项目经理/技术专家/文档助手没有对应 preset，不硬凑，见 [02 §2.8](02-information-architecture.md)）。
5. **不升级流式协议**：聊天保持轮询（已知限制延续）；演示态 typing/流式模拟仅是渲染层适配，不进 durable log。
6. **产品级 auth 不在本次范围**（PLAN D6）：登录维持 demo 通道，清理假注释。

## 5. 成功标准（可验收判据）

| # | 判据 | 证据面 |
|---|---|---|
| S1 | 核心闭环全链走通：风险问题 → report 卡 → 创建处理任务 → 四态流转 → 完成回聊，AI 收尾回复存在；演示态全链可走，真实态代码路径由 run mode 分支切换且不替代真实链路 | UI + durable log |
| S2 | 结构化产出可辨：/work /tasks /files 三页数据全部可从 workStore + durable log 派生；演示 seed 数据带「示例」标识且可一键清除，不冒充后端数据 | UI + localStorage |
| S3 | 协议不可见延续：聊天流无 ```dsh 围栏、无 hub_* 表名、无 nb_create 字样、无裸 JSON、welcome 零冒名，新增 report 协议词（kind/tone/payload 等）零直出 | e2e 负断言 |
| S4 | 真实能力零回退：真实 LLM 聊天、v3 表单闭环与 nb_create 真库落库、wire 无写方法边界、PC 预览 iframe，四者在新 IA 下逐条验收（PLAN §3.4 硬约束） | e2e + DB 实查 |
| S5 | 导航心智成立：4 Tab + 全屏层 + 二级页在真实浏览器全可达，转场正常，v1/v2 旧深链零死链（第三代折叠落点表见 [02 §1.3](02-information-architecture.md)） | 浏览器走查截图 |
| S6 | 首页 30 秒价值：打开即见今日工作统计、AI 同事、最近对话与快捷任务，无需先进入聊天才能获得价值 | UI 截图 |
| S7 | 「模型可见⟺日志可重建」红线：任务创建/执行启动/完成/打回四类事件各对应一条真实 user 动作消息进 durable log，消息文本模板见 [04 §3](04-implementation-spec.md)；纯 UI 态（收藏/已读/置顶/演示开关）留在本地并记录边界 | durable log + 代码审查 |

S1-S7 与 B1/B2 批次验收的映射：S1/S3/S5/S6 进 B1 自测截图与 e2e；S2/S4/S7 进 B2 独立验收（真实 API + DB 实查 + findings 报告）。
