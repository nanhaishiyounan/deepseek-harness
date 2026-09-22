# 移动端 v3 重设计 · 产品问题识别

> 日期：2026-09-21 | 作者：Product Agent（产品经理，只做产品分析，不写代码、不做视觉设计） | 范围：`/mobile` 路由的 ui-mobile v2（[packages/client/ui-mobile](packages/client/ui-mobile/README.zh.md)）与其背后的 agent 预设契约 | 下游：multi-agent design workflow 的后续设计/实现阶段直接引用本文的 ④ 行为规格与 ⑤ 验收标准。

## 0. 验收锚点：用户原话（逐字，不得改写）

1. "uiux 太丑了，使用 skill frontend-design 重新设计"
2. "产品逻辑也要重新规划，新建会话就自动输入一个消息，显然不合理，表单的明细，也不必每个字段都需要输入，如果这样，那还不如手动填表呢，一些字段都不是用户填写的，回答的输出的渲染要美观些，不能原生的就展示出来，你也可以主动询问，智能填表助手，并不是只有采购单，根据用户输入的信息，自动匹配表单，如果不确定，可以主动询问，并给用户可交互式的选择项目，总之还有很大逻辑要改"
3. "使用 multi-agent design workflow 模式进行重新设计实现"

第 1、3 条指向 UI/UX 与实现流程，由后续阶段承接；本文 owns 第 2 条拆出的六点产品逻辑问题（a-f）。UI 层唯一与产品逻辑交织的裁决（渲染内容分级）在 ②c 与 ④c 给出，供 frontend-design 阶段消费。

## ① 产品定位与边界（含质疑结论）

### 1.1 移动端在整体产品中的定位

本产品是食品行业 KB+agent 订阅产品：NocoBase 业务系统（hub_* 表族：采购、供应商、质检、入库出库、回款等）+ 知识库/图谱/湖仓 + AI 员工预设，PC 工作台已承载问数、KB、KG、连接器等重分析面。移动端不是 PC 工作台的缩水版，而是**订阅价值的高频轻入口**：企业主、采购、品控在手机上完成两件事——用一句话登记一条业务单据（说人话 → AI 填表 → 人审 → 落库），以及随口问一个经营问题。v2 的 README 把这一定位写对了（"移动端 v2 客户端壳：微信式的 NocoBase 业务系统 AI 员工入口"，[README.zh.md:5](packages/client/ui-mobile/README.zh.md)），但实现把"填表闭环"做成了"逐字段问答 + 协议裸奔"，与定位背道而驰。

### 1.2 质疑一：v2 哪些功能应该砍/简化

| v2 功能 | 证据 | 裁决 | 理由 |
|---|---|---|---|
| 独立通讯录页（ContactsView） | [ContactsView.tsx:44-84](packages/client/ui-mobile/src/client/contacts/ContactsView.tsx)；roster 仅 agentPreset.list 的几个预设 | 砍页面，并入消息页右上角 `+` 的底部弹层 | AI 同事就个位数，独占一个路由页信息密度过低；`+` 弹层列 AI 同事即够 |
| AI 同事按预设绑定单一表单域 | [colleagues.ts:26-59](packages/client/ui-mobile/src/client/colleagues.ts) 四预设各绑死表单 | 砍"一个同事=一张表"的组织方式 | 用户原话"并不是只有采购单"——按表单分同事逼用户先选对入口才能办事，与"自动匹配表单"诉求直接冲突 |
| 四类任务卡（Draft/Review/Rejected/Receipt） | [task-cards.tsx](packages/client/ui-mobile/src/client/forms/task-cards.tsx) 四导出组件 | 保留四相位，简化卡面 | draft→pending→submitted/rejected 状态机本身正确（[cardState.ts:34-71](packages/client/ui-mobile/src/client/cardState.ts) 从日志重放是资产）；要改的是卡内容呈现（字段分层、去表名、回执去 JSON） |
| KG 证据卡常驻聊天流尾部 | [KgEvidence.tsx:42-57](packages/client/ui-mobile/src/client/kg/KgEvidence.tsx)；[ChatView.tsx:223](packages/client/ui-mobile/src/client/messages/ChatView.tsx) | 默认收起为一行"查看依据" | 填表/问数的移动场景里节点-边走查是噪音；溯源价值保留为按需展开 |
| 固定快捷 chips（3 条） | [ChatView.tsx:33,227-239](packages/client/ui-mobile/src/client/messages/ChatView.tsx) | 改为按会话阶段动态生成 | 固定指令"帮我登记一条采购单/补一条供应商开发记录"继续强化单一表单心智（详见 ②e） |
| 轮询无流式（运行 1.2s/空闲 5s） | [ChatView.tsx:49-51](packages/client/ui-mobile/src/client/messages/ChatView.tsx)；[README.zh.md:26](packages/client/ui-mobile/README.zh.md) 已知限制 | v3 提升优先级 | 逐字出答与"回答渲染美观"共同构成体验底线；产品验收按"首字节可见时延"而非实现方式约束 |
| 待审核=本地 localStorage 派生 | [README.zh.md:27](packages/client/ui-mobile/README.zh.md)；[draftStore.ts](packages/client/ui-mobile/src/client/draftStore.ts) | 降级接受，标注 | 重载丢本地标记是已知缺陷；v3 若重做卡片协议（④f-1）顺带把 pending 态搬上 wire |

### 1.3 质疑二：AI 员工与"群聊/单聊"隐喻是否成立

单聊成立，群聊不成立。v2 只有 1:1 单聊（AI 同事会话），没有群聊；参考原型里的群聊（客户群 + @Agent 转人工，见 [research/2026-09-17-mobile-prototype-analysis.md](research/2026-09-17-mobile-prototype-analysis.md) §4.3）属渠道 C2M 叙事，该研究报告 §11.3 已判"与 v2 目标无关"。订阅产品的移动场景是"一个人对 AI 同事把一件事办完"（登记、问数），多人协作审批留在 NocoBase PC/工作流侧。v3 维持 1:1 单聊隐喻，AI 侧消息必须带身份区隔（头像/名称/AI 徽标），不引入群聊、@提及、转人工。

### 1.4 边界

移动端 v3 不做：表单 schema 管理、审批流编排、数据看板、多模态录入中心（OCR/语音）、群聊。这些分别属于 NocoBase 配置面、PC 工作台与后续版本。v3 的唯一增量主线：把"一句话 → 正确的表 → 最小问答 → 富渲染确认 → 落库回执"这条闭环做对。

## ② 现状诊断：六点问题（现象 → 代码证据 → 根因）

### a. 新建会话自动以用户身份发消息

**现象**：在通讯录点"发消息"开聊，聊天流里立即出现一条**用户侧**开场消息（如"你好，我要登记一条采购单，请带我补全字段。"），用户没有输入过任何字。

**代码证据**：
- [ContactsView.tsx:23-42](packages/client/ui-mobile/src/client/contacts/ContactsView.tsx) `start()`：`createSession(presetId)` 后紧跟 `promptSession(sessionId, shortcut)`——以用户身份把预设开场白发进 durable log，然后才 `navigate`。
- [colleagues.ts:21-22](packages/client/ui-mobile/src/client/colleagues.ts) 字段注释自认其罪："Opening message the contacts page sends when starting a chat"；[colleagues.ts:26-59](packages/client/ui-mobile/src/client/colleagues.ts) 四个预设的 `shortcut` 全部写死且以用户第一人称口吻（"你好，我要登记一条采购单…"）。
- e2e golden 同构：[seed.jsonl:3](apps/web/tests/snapshots/mobile-assistant/seed.jsonl) 会话第一条 `user/message` 即"帮我登记一条采购单……缺字段你来问我"，无用户动作。

**根因**：产品把"回合必须由用户消息触发"的引擎约束（turn trigger）当成了交互契约——会话一创建就必须有用户消息才开工，于是用伪造的用户消息填充第一回合。缺一个"AI 侧欢迎语（assistant 先说话、等待用户）"的会话启动模型，导致用户身份被冒用、会话标题也被这条假消息污染。

### b. 表单逐字段要求用户输入（最小输入缺失）

**现象**：登记一条采购单，AI 列出缺失字段清单让用户补，用户被迫用 `key=value` 文本一次性回答全部字段——包括 status、total、order_date 这类机器可推导或系统可生成的字段。golden 实录的两轮对话里，用户第二条消息是"补槽回答：供应商 name=宏发食品, contact_name=张三；po_number=PO-M3-001；order_date=2026-09-18；status=pending；total=1600"。

**代码证据**：
- 预设契约把推导字段列进追问清单：[purchase-assistant/agent.cordis.yml:18](examples/kb-agent/agent-presets/purchase-assistant/agent.cordis.yml) "缺字段（如 po_number/status/order_date/total/supplier）就明确列出缺哪些并一次问完"；[mobile-form-assistant/agent.cordis.yml:16](examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml) 同款。
- "字段齐备后才出草稿"的门闸在同一契约 [agent.cordis.yml:16-17](examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml)：先问全、再出卡——问答全在自由文本里。
- 前端卡片全量平铺：[task-cards.tsx:43-46](packages/client/ui-mobile/src/client/forms/task-cards.tsx) `Object.keys(draft.fields).map(...)` 草稿带几个字段就渲染几个可编辑控件；[fieldControls.ts:61-83](packages/client/ui-mobile/src/client/fieldControls.ts) 每字段一律映射为控件（唯一例外是 users 归属只读，L77），没有"必答/推导/系统生成"的分层概念。
- golden 全程实录：[seed.jsonl:3,12](apps/web/tests/snapshots/mobile-assistant/seed.jsonl) 两轮补槽；[chat.expected.md:7-18](apps/web/tests/snapshots/mobile-assistant/chat.expected.md) 草稿卡 po_number/status/total/order_date 全是空 placeholder 的可编辑框。

**根因**：填表契约以"schema 完整性"为中心而非"用户决策最小化"为中心——把落库前的字段齐备责任推给用户问答，推导（日期=今天、状态=draft、金额=数量×单价）、系统生成（编号规则）、上下文解析（供应商 id 按名称查表）全部缺席，于是"还不如手动填表"。

### c. AI 回答输出裸文本渲染

**现象**：AI 回复以纯文本气泡直出：围栏 JSON 草稿原文、key=value 补槽话术、`hub_po_purchase_orders` 内部表名、落库行的原始 JSON 全部原样展示给用户。

**代码证据**：
- 气泡是纯文本投影：[ChatView.tsx:300-309](packages/client/ui-mobile/src/client/messages/ChatView.tsx) `<div className={css.assistantBubble}>{item.text}</div>`——无 Markdown 解析层。
- 协议与人话共用一个通道：[fold.ts:145-154](packages/client/ui-mobile/src/client/fold.ts) assistant/message 的 text 整体 join 为气泡文本，同一 text 再旁路解析出任务卡（L151 `parseFormDrafts(text)`）——JSON 块既变成卡又留在气泡里。
- golden 铁证：[chat.expected.md:3](apps/web/tests/snapshots/mobile-assistant/chat.expected.md) 气泡文本含完整 ` ```json {"collection": "hub_po_purchase_orders", …} ``` ` 原文。
- 回执卡裸 JSON：[task-cards.tsx:244-251](packages/client/ui-mobile/src/client/forms/task-cards.tsx) `<pre>{JSON.stringify(row, null, 2)}</pre>` 直出落库行；卡片文案暴露内部表名"目标业务表 hub_po_purchase_orders"（[task-cards.tsx:56](packages/client/ui-mobile/src/client/forms/task-cards.tsx)，确认卡 L118 同）。
- 无流式渲染：[README.zh.md:26](packages/client/ui-mobile/README.zh.md) 已知限制（聊天新鲜度靠轮询，不流式）。

**根因**：渲染层被设计成 durable log 的纯文本投影，没有"内容分级"——协议负载（草稿 JSON、回执）与面向人的叙述（Markdown、指标、高亮）未分离，移动端排版考究无从谈起。这是产品逻辑问题：**哪些内容允许到达用户视野**应当是显式契约，而非默认全部直出。

### d. 主动询问没有可交互选择项

**现象**：AI 追问 = 一段自然语言文本列出缺什么；用户回应 = 手打一段 `key=value`。没有按钮组、chips、单选卡片。

**代码证据**：
- 契约层：[mobile-form-assistant/agent.cordis.yml:16](examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml) "缺字段就明确列出缺哪些并追问，一次问完"——追问形态被钉死为自由文本。
- 实测层：[seed.jsonl:12](apps/web/tests/snapshots/mobile-assistant/seed.jsonl) 用户被迫打字补槽（见 ②b）。
- UI 层唯一的"点击即发"交互是三条固定 chips：[ChatView.tsx:33,227-239](packages/client/ui-mobile/src/client/messages/ChatView.tsx)，且点击直接 `send(text)` 以用户消息形态发出；结构化控件（Picker/enum）只存在于任务卡内（[FieldWidget.tsx:87-104](packages/client/ui-mobile/src/client/forms/FieldWidget.tsx)），对话流里没有可点选的应答消息类型。
- 供应商三选一这类天然选择题没有任何承载：relation Picker 只在草稿卡里（[FieldWidget.tsx:105-106](packages/client/ui-mobile/src/client/forms/FieldWidget.tsx)），对话中的模糊指代（"宏发那家"）必须靠用户打字消歧。

**根因**：对话协议里用户输入只有自由文本一种通道；没有 quick-reply/选项消息的产品概念，"主动询问"被实现成"文本提问+文本作答"，把消歧成本全部转嫁给用户键盘。

### e. 多表单智能匹配缺失（单表单绑定）

**现象**：叫"智能表单助手/通用业务单据登记"的 AI 同事，开场白与快捷指令全是采购单；换一种单据（供应商登记、质检记录、入库出库、回款）要么被开场白拉回采购单，要么靠 AI 在 72 个集合里静默猜表。

**代码证据**：
- 预设开场白钉死单一表单：[colleagues.ts:51-58](packages/client/ui-mobile/src/client/colleagues.ts) `mobile-form-assistant`（duty"通用业务单据"）的 `shortcut` 是"帮我登记一条采购单"；purchase/quality 两预设各绑死自己的表族（L27-42）。
- 契约把匹配设为 AI 静默动作：[mobile-form-assistant/agent.cordis.yml:15](examples/kb-agent/agent-presets/mobile-form-assistant/agent.cordis.yml) 第 1 步"用户描述单据后，先用 nb_collections 找到目标 collection"——没有"多个候选时向用户确认"的步骤；golden 中该工具一次返回"共 72 个集合（节选）"（[seed.jsonl:8](apps/web/tests/snapshots/mobile-assistant/seed.jsonl)）。
- 快捷 chips 强化单一心智：[ChatView.tsx:33](packages/client/ui-mobile/src/client/messages/ChatView.tsx) 三条里两条是采购单/供应商登记。
- 前端枚举词表只认识 3 张表：[fieldControls.ts:32-42](packages/client/ui-mobile/src/client/fieldControls.ts) `KNOWN_ENUMS` 硬编码 hub_po_purchase_orders/hub_po_suppliers/srm_capas——表单族扩展时枚举字段静默退化为纯文本输入。

**根因**：产品按"每个 AI 同事=一张（族）表单"组织能力，意图→表单类型的匹配这一关键决策既不在 UI（无可选表单的选择交互）也不在契约（无候选确认步骤），被隐式下放给模型在数十个集合里一次性猜对——猜错即错表落库风险，与用户"自动匹配表单，不确定主动询问"的要求正好相反。

### f. Product Agent 自行识别的逻辑优化点（1-6，均有证据）

1. **确认/驳回协议以自然语言正则驱动且对用户可见**：确认按钮把协议文本当用户消息发出（[ChatView.tsx:143-150](packages/client/ui-mobile/src/client/messages/ChatView.tsx)，"确认推送：请按以下最终字段值调用 nb_create…"），驳回同理（L161）；状态机靠文本前缀+正则解析还原（[cardState.ts:44-67](packages/client/ui-mobile/src/client/cardState.ts)、[form-draft.ts:104-145](packages/client/ui-mobile/src/client/form-draft.ts)）。协议文本污染聊天流、模型措辞漂移即断链。→ ④f-1 结构化交互消息。
2. **"待审核"跨设备不同步**：pending 标记与未读水位是 localStorage 本地派生（[draftStore.ts](packages/client/ui-mobile/src/client/draftStore.ts)、[README.zh.md:27](packages/client/ui-mobile/README.zh.md)），换设备/重装即丢。→ 随 ④f-1 把卡片动作态搬上 wire 或由日志相位唯一推导。
3. **KG 证据卡默认常驻**：每次走查在流尾部追加节点-边卡片（[ChatView.tsx:223](packages/client/ui-mobile/src/client/messages/ChatView.tsx)、[KgEvidence.tsx:42-57](packages/client/ui-mobile/src/client/kg/KgEvidence.tsx)），移动填表场景信噪比倒挂。→ ①表 4 已裁决收起。
4. **内部表名/字段名直出用户界面**：卡片与文案暴露 `hub_po_purchase_orders`、`po_number`（[task-cards.tsx:56,118](packages/client/ui-mobile/src/client/forms/task-cards.tsx)、[fieldControls.ts:50-52](packages/client/ui-mobile/src/client/fieldControls.ts) 的 label 回退裸字段名）。→ ④c 要求一律业务语言（meta title 优先，缺失时中文映射兜底）。
5. **会话标题被假开场白污染**：标题 fallback 取自首批消息（[sessionsService.ts:132-137](packages/client/ui-mobile/src/client/sessionsService.ts)），新建即发"帮我登记一条采购单"使所有采购同事会话同名同摘要，列表不可辨识（[MessagesView.tsx:96-131](packages/client/ui-mobile/src/client/messages/MessagesView.tsx)）。→ 随 ④a 欢迎语模型一并修正标题来源。
6. **驳回后无字段级暂存反馈**：驳回保留草稿编辑于 localStorage（[ChatView.tsx:153-162](packages/client/ui-mobile/src/client/messages/ChatView.tsx)），但"重新编辑"回到全量草稿卡，用户上次改到一半的字段与 AI 预填无法区分哪些是自己的修改。→ ④d 的选择回填与草稿卡 diff 高亮（沿用 ReviewCard 的 AI-vs-final diff，[task-cards.tsx:104-135](packages/client/ui-mobile/src/client/forms/task-cards.tsx)）覆盖此场景。

## ③ 产品原则（从用户原话提炼，v3 全程可执行）

1. **最小输入**：用户只回答机器不能推导的字段——"谁/多少/哪家"；日期、状态、金额合计、编号、关联 id 由 AI 推导或系统生成，且在卡上标注依据来源（推导值可改，但不问）。
2. **不确定即问，问即给选项**：表单类型、供应商指代、枚举取值等一切分叉点，AI 主动发起询问，且询问必须是气泡内嵌的可点选交互（按钮组/chips/单选卡），点选即作答；绝不把消歧推给用户键盘。
3. **回答默认富渲染**：面向人的内容一律富文本渲染（Markdown 加粗/列表/表格、数字指标卡、关键信息高亮）；协议负载（草稿 JSON、回执行号）永不出现在用户视野——用户看到的是卡，不是代码。
4. **表单由意图匹配，不由入口绑定**：一个会话入口承接全部业务单据；AI 根据用户输入匹配目标表（hub_* 表族），匹配置信不足时用原则 2 的交互确认。
5. **AI 先说话，用户零冒名**：会话由 AI 侧欢迎语开启（带身份与能力说明），输入框空置等待用户；durable log 中不得出现用户未亲手输入的 user 消息。

## ④ v3 行为规格（a-e + f 优化点）

规格按"用户看到什么 / AI 做什么 / 数据流怎么走"三段给出；实现细节（消息类型编码、wire 方法）由后续设计阶段定，此处约束行为契约。

### a. 会话启动：AI 欢迎语，零自动用户消息

- **用户看到**：点"发消息"进入聊天页，首条是 AI 侧欢迎气泡（身份 + 能力清单 + 一个示例说法），输入框空置聚焦，无任何用户侧气泡。
- **AI 做什么**：欢迎语为静态文案（可含 2-3 个可点选的起点 chips，点选才作为用户消息发出），不消耗一次模型回合；不预置业务意图。
- **数据流**：`createSession(preset)` 后客户端渲染本地欢迎语（或一条 assistant 系统消息），`promptSession` 只在用户真实输入/点选后发生；[ContactsView.tsx:33](packages/client/ui-mobile/src/client/contacts/ContactsView.tsx) 的 `promptSession(shortcut)` 删除。会话标题在首个真实用户回合后生成，欢迎语不参与标题。

### b. 表单最小输入：字段三分层

- **用户看到**：草稿卡字段分三区——「请确认」（AI 已推导/生成，标注依据：如 状态 draft·默认 / 日期 2026-09-21·今天 / 供应商 宏发食品·按名称匹配 / 合计 1600·单价×数量）；「需要你定」（必答字段，≤3 个为常态，超限时分批问）；「系统生成」折叠区（编号、关联 id 等，默认收起）。用户改推导值随时可改，但 AI 不发起询问。
- **AI 做什么**：意图确认后先做推导：日期取今天、状态取默认值、金额可算则算、关联字段按名称查目标表解析 id（沿用 [purchase-assistant/agent.cordis.yml:21](examples/kb-agent/agent-presets/purchase-assistant/agent.cordis.yml) 的查表规则）、编号按表规则生成；只有"谁/多少/哪家"类业务决策字段才进入追问，且以 ④d 的交互选择发出；契约改为"推导尽齐即出草稿卡，必答空缺在卡上以『需要你定』区呈现"，废除"字段齐备后才出草稿"门闸。
- **数据流**：草稿 JSON 增加字段元数据（来源：derived/user/system + 依据文案）；DraftCard 按 `Object.keys` 全量平铺的现状（[task-cards.tsx:43-46](packages/client/ui-mobile/src/client/forms/task-cards.tsx)）改为按三分层分区渲染；e2e golden 断言草稿卡必答区 ≤3 字段、status/order_date 不出现在追问里。

### c. 回答富渲染与内容分级

- **用户看到**：AI 文本气泡为 Markdown 渲染（加粗/列表/表格），数字结论（金额、数量、行号）以指标卡呈现，关键词高亮；围栏 JSON、表名、key=value 协议文本在气泡中不可见；回执卡显示业务语言字段行 + 行号徽标，不再是 JSON `<pre>`（替换 [task-cards.tsx:244-251](packages/client/ui-mobile/src/client/forms/task-cards.tsx)）；卡片文案用"采购单"而非 `hub_po_purchase_orders`（修 [task-cards.tsx:56,118](packages/client/ui-mobile/src/client/forms/task-cards.tsx)）。
- **AI 做什么**：契约规定正文与协议分离——人话叙述给气泡，草稿/回执走结构化负载；模型只需遵守"正文不含 JSON"。
- **数据流**：fold 阶段把 assistant 文本拆为"叙述段 + 结构化段"（[fold.ts:145-154](packages/client/ui-mobile/src/client/fold.ts) 的解析点前移为协议分离），ChatView 气泡接 Markdown 渲染器（实现选型归 frontend-design/实现阶段）；golden 改为断言气泡 aria 文本中无 `{"collection"`、无 ``` 围栏、无 `hub_` 前缀。

### d. 主动询问 + 可交互选择项

- **用户看到**：AI 的追问气泡下方内嵌选项组——类型之问（"这是采购单还是出库单？"→ 两张单选卡）、指代之问（"供应商是这三家中的哪家？"→ 三枚 chips，带地区/合作次数等一行摘要）、枚举之问（状态/紧急度 → 按钮组）；点选即作答并回填，全程零打字；点选后选项组置灰显示所选。
- **AI 做什么**：分叉点不再生成纯文本问题，而是生成"问题文本 + 候选清单"的结构化询问（候选来源：表单类型目录、nb_list 模糊匹配的供应商行、枚举词表）；用户点选或自行打字均可作答。
- **数据流**：新增一种交互式询问消息（AI 侧消息携带候选载荷；用户点选产生一条语义等价于自然语言的用户消息进 durable log，保持"模型可见⟺日志可重建"）；选项候选数据流沿用 relation 查表（[FieldWidget.tsx:185-224](packages/client/ui-mobile/src/client/forms/FieldWidget.tsx) 的按需拉取模式）；golden 增加点选场景断言（点选后日志出现对应 user 消息、草稿卡相应字段回填）。

### e. 多表单智能匹配

- **用户看到**：统一入口（一个"业务登记 AI 同事"或默认助手），说"帮供应商三味食品登个档"/"今天到货 200 箱要入库"/"宏发的货质检有问题"——AI 匹配到供应商登记/入库单/质检记录并回显"将登记：供应商档案（三味食品）"的表单确认条；匹配不确定时以 ④d 的单选卡问"这是采购单还是出库单？"。
- **AI 做什么**：契约增加表单匹配步骤——维护表单目录（collection + 中文名 + 触发语义词 + 必答字段清单），意图 → 候选表集合，单候选高置信直接进入 ④b 推导，多候选/低置信走 ④d 确认；绝不静默猜表落库。
- **数据流**：表单目录由 nb_collections 元数据 + 人工标注的中文名/触发词构成（落地形态由设计阶段定：预设配置或 wire 下发）；废除按预设绑定表单的组织（[colleagues.ts:26-59](packages/client/ui-mobile/src/client/colleagues.ts) 的 forms/shortcut 单表绑定退场，purchase/quality 预设或收编为同一助手的领域提示词）；[KNOWN_ENUMS](packages/client/ui-mobile/src/client/fieldControls.ts) 的枚举词表缺口由 wire 侧 select 选项投影补齐（README 已知限制 L28 对应解除）。

### f. 附加优化点规格（对应 ②f 1-6）

1. **卡片动作结构化**：确认/驳回从"协议文本用户消息"改为卡上结构化动作——用户看到的是"确认写入"按钮，发出的是带 JSON 载荷的动作消息（日志中语义等价消息仍可重放，[cardState.ts](packages/client/ui-mobile/src/client/cardState.ts) 的前缀/正则解析替换为载荷判别）；聊天流不再出现"确认推送：请按以下最终字段值调用 nb_create…"文本（删 [ChatView.tsx:149](packages/client/ui-mobile/src/client/messages/ChatView.tsx) 的文本拼装）。
2. **待审核上 wire**：pending 相位由会话日志唯一推导（配合 f-1 的动作消息），localStorage 仅保留未读水位；跨设备"待审核"筛选一致（[MessagesView.tsx:31](packages/client/ui-mobile/src/client/messages/MessagesView.tsx) 的本地集合换为日志派生）。
3. **KG 证据默认收起**：聊天流尾部"知识图谱证据"区折叠为单行入口（①表 4 裁决）。
4. **业务语言全覆盖**：卡片、追问、回执中的表名/字段名一律 meta title 中文优先，无 title 时映射表兜底，禁止裸 `hub_*`/snake_case 直出。
5. **标题不被欢迎语污染**：标题生成只消费真实用户回合（配合 ④a）。
6. **重编辑带 diff**：驳回后"重新编辑"回草稿卡时，用户历史修改与 AI 预填以 diff 高亮区分（复用 [task-cards.tsx:104-135](packages/client/ui-mobile/src/client/forms/task-cards.tsx) 的 diff 行模式）。

## ⑤ 验收标准清单（v3，验证阶段直接引用）

以下每条均为可验证断言；标注【日志】【UI】【DB】三类证据面。用户要求的截图场景与双表单落库分别由 A、D 组覆盖。

**A. 会话启动（对应 ④a）**
- A1【日志】新建会话（通讯录/入口进入）后、用户首次输入前：durable log 中 `user/message` 数为 0；存在 AI 欢迎语（assistant 侧或本地渲染），不含业务意图。
- A2【UI】截图：新会话首屏——AI 欢迎气泡居左带身份，输入框空置可聚焦，无右侧用户气泡。
- A3【UI】通讯录"发消息"不再产生任何以用户身份发送的消息（对 [ContactsView.tsx:33](packages/client/ui-mobile/src/client/contacts/ContactsView.tsx) 行为的回归断言）。

**B. 最小输入（对应 ④b）**
- B1【UI】一条自然语言（"向宏发食品采购 500kg 面粉，单价 3.2"）触发的草稿卡：「需要你定」区 ≤3 个字段；status、order_date、po_number、total 不在追问或必答区。
- B2【UI】推导字段带依据标注（如"日期 · 今天""状态 · 默认 draft""合计 · 500×3.2"），可手动改。
- B3【日志】e2e golden：断言草稿卡分区结构、追问消息中不含 `status=`/`total=` 类 key=value 文本（对照 [seed.jsonl:12](apps/web/tests/snapshots/mobile-assistant/seed.jsonl) 的反面样本）。

**C. 富渲染与内容分级（对应 ④c）**
- C1【UI】截图：AI 回答含加粗/列表/表格的 Markdown 渲染；数字结论呈指标卡。
- C2【UI】截图：聊天流中无 ``` 围栏 JSON、无 `hub_` 表名、无 `po_number` 式字段名（对照 [chat.expected.md:3](apps/web/tests/snapshots/mobile-assistant/chat.expected.md) 的反面样本）。
- C3【UI】回执卡：字段行 + "行 id"徽标 + 三步流程条，无 JSON `<pre>`（替换 [task-cards.tsx:250](packages/client/ui-mobile/src/client/forms/task-cards.tsx)）。
- C4【日志】golden aria 快照：assistant 气泡文本不含 `{"collection"`。

**D. 交互式询问与多表单匹配（对应 ④d/④e，含双表单落库）**
- D1【UI】模糊输入触发类型之问："这笔要登记什么？"气泡下出现 ≥2 张单选卡；点选后零打字进入草稿。
- D2【UI】供应商指代之问：候选 chips ≤5 枚带一行摘要；点选后草稿卡该字段回填且选项组置灰。
- D3【日志】点选作答在 durable log 产生一条 user 消息（语义等价于所选文案），模型可见面完整。
- D4【DB】双表单落库实查：场景一（采购单语句）确认后 `hub_po_purchase_orders` 新增行，关键字段与确认卡一致、回执行 id 与实查 id 相等；场景二（供应商登记语句）同构验证 `hub_po_suppliers`（或演示部署的对应表族）；两场景各自走完 草稿→确认→回执 相位。
- D5【日志】多候选时必须存在一次类型确认交互记录，且落库 collection 与用户点选一致——静默猜表落库视为失败。

**E. 附加逻辑（对应 ④f）**
- E1【日志/UI】确认/驳回动作不再以"确认推送：…""驳回：…"协议文本出现在聊天流（对照 [ChatView.tsx:149,161](packages/client/ui-mobile/src/client/messages/ChatView.tsx) 旧行为）；卡片相位在刷新与 PC 预览中重放一致。
- E2【UI】KG 证据区默认收起为单行入口，展开可用。
- E3【UI】会话列表标题区分度：两个不同业务的会话标题不同（不再全是"帮我登记一条采购单"）。
- E4【UI】驳回→重新编辑：用户修改过的字段带 diff 高亮。

**F. 回归底线**
- F1【日志】v2 既有资产不回退：卡片四相位重放（[cardState.ts](packages/client/ui-mobile/src/client/cardState.ts)）、未提交编辑 localStorage 暂存、day 分隔与工具行渲染保持。
- F2【UI】`/mobile` 两 Tab 壳、PC 预览 iframe（[mobile-preview-iframe.e2e.ts](apps/web/tests/mobile-preview-iframe.e2e.ts)）继续可用。
