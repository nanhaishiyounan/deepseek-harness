# 01 产品问题识别 — 食品产业知识库+Agent Web 工作台重构（第一阶段）

> Product Agent 产出。输入：现状截图走查（[screenshots/kb/](../../screenshots/kb/) step-01~14）、客户端源码走查（[packages/client/ui-kb](../../packages/client/ui-kb/src/client/KbPanel.tsx)、ui-slots slot 体系）、[examples/kb-agent](../../examples/kb-agent/README.zh.md) 组合与角色预设/场景集。官网 ftd.lzqz.cn 抓取两次失败，信息架构按任务书给定定位推理，不阻塞本阶段。
>
> 硬约束（全程有效）：不引入新 CSS 框架；走 `packages/client/ui-*` 插件 + ui-slots 扩展点；不破坏既有功能（会话 / KB 面板 / [examples/kb-agent/tests](../../examples/kb-agent/tests/) e2e 与快照全绿）。

## 一、订阅用户画像与核心场景

产品定位回顾：食品行业企业的质量/生产/采购/管理层订阅使用；价值链 = 走访采集企业数据（md/txt/pdf/docx/网页）→ 入知识库 → AI 带编号引用回答（合规/工艺/成本/供应链）→ 用量计量（订阅计费基础）。以下三个旅程故事覆盖价值链的三段：问（合规）、采（入库）、管（订阅决策）。

### 旅程 1：王工，调味品企业质量部长 — "新品能不能这么配？"（合规问答）

王工负责新品合规审核。新品酱油配方拟用山梨酸钾，他需要在准备迎检材料前确认 GB 2760 的限量规定与审核要点。他是资深质量人但**不是开发者**：不知道什么是文件路径、切片、向量化。

- 期望动线：打开工作台 → 一眼看出"这是食品企业知识库问答"→ 选（或默认已是）"AI 食安合规官"角色 → 输入"酱油中山梨酸钾的最大使用量是多少" → 得到带 `[1]` 编号引用 GB 2760 摘录的回答 → 点开引用核对原文 → 复制结论进审核清单。
- 成功标准：**5 分钟内**得到可溯源的合规结论；引用能点开看到原文出处；全程不出现任何让他困惑的技术词。
- 现状阻断：首屏是"探索未至之境"通用聊天壳（step-01）；他不知道知识库在哪里、不知道有"AI 食安合规官"这个角色；即使提问成功，回答中的 `[1]` 引用是纯文本，无法点开核对。

### 旅程 2：李经理，采购与供应链经理 — "把走访纪要喂给系统"（采集入库）

李经理刚走访完供应商宏发食品，带回一份 docx 纪要和两个网页链接。她要把这些材料交给系统，之后团队随时能问"宏发的资质与风险点"。

- 期望动线：点"知识库" → 选文件（或拖拽）上传 docx、粘贴网页 URL → 看到入库进度与成功反馈 → 在文档列表里看到"宏发走访纪要"已就绪 → 顺手问一句"宏发的主要风险点"，回答引用了这份纪要。
- 成功标准：**不输入任何路径**完成入库；入库后能在文档列表确认材料就绪；首次问答即引用到新材料。
- 现状阻断：入库表单要求手输服务器相对路径"文件路径（.md / .txt / .pdf / .docx）"（step-06）——她不知道路径是什么、也没有文件选择器；入库成功只有一行小字"已入库：N 个切片"；没有任何文档列表让她确认材料进了哪里。"切片"对她更是天书。

### 旅程 3：张总，分管副总 / 订阅决策者 — "这个月值不值？"（用量与价值感知)

张总月底评估订阅续费。他不常用系统，需要快速看团队本月的检索次数、入库文档数、覆盖了哪些业务场景，判断投入产出。

- 期望动线：打开工作台 → 侧栏或首页固定位置看到本月用量（检索 N 次 / 文档 M 篇）与订阅状态 → 浏览场景清单了解还能用在哪 → 决定续费或扩容。
- 成功标准：**5 秒内**读到两个业务化用量数字；看到订阅/套餐状态位；看到产品能力全景（场景/角色清单）。
- 现状阻断：用量统计埋在侧栏底部弹出的 KB 面板第一段，指标叫"切片 / 已向量化切片 / 向量化文本"（step-02/03）；全产品没有任何订阅、套餐、租户信息；11 个业务场景在界面上完全不存在。

## 二、现状走查问题清单

严重度定义：P0 = 阻断核心价值（订阅用户无法完成价值链关键环节）；P1 = 明显伤害体验与信任；P2 = 体验瑕疵。证据列给出截图或代码位置。

| 编号 | 现象 | 用户影响 | 严重度 | 证据 |
|---|---|---|---|---|
| U1 | 首屏是通用 agent 聊天壳：品牌文案"探索未至之境"+"预览版"徽章、侧栏顶"DSH Local Build 0150035"开发者构建标识、空输入框+两个下拉，无任何食品行业语言、无价值传达 | 王工/张总第一眼不知道产品能干什么、是否与自己相关；构建号与"预览版"直接削弱付费可信度；新用户 10 秒内流失 | **P0** | [step-01](../../screenshots/kb/step-01-workbench-home.png)；[`ui-sidebar`](../../packages/client/ui-sidebar/src/client/index.ts:48) 的 `sidebar.brand.name`/`conversation.hero.brand.mark` 默认渲染 |
| U2 | 知识库入口藏在侧栏最底部，与"设置"同形的纯文字小按钮，无图标、无文档数、无状态 | 产品核心资产（已入库文档与检索能力）存在感为零；用户把 KB 当成与设置同级的边缘功能；价值链的"库"环节不可感知 | **P0** | [step-01](../../screenshots/kb/step-01-workbench-home.png)；[`KbEntry.tsx`](../../packages/client/ui-kb/src/client/KbEntry.tsx:28) 挂 `sidebar.footer.action`，CSS 注释自述"matches the settings entry's shape" |
| U3 | 入库要求手输服务器相对路径（"文件路径（.md / .txt / .pdf / .docx）"），无文件选择器、无拖拽、无上传；URL 与路径二选一的规则靠猜 | 李经理（非开发者）无法独立完成入库——价值链第一环"采集"被阻断；手输路径必然出错，出错只得到一条红字错误 | **P0** | [step-06](../../screenshots/kb/step-06-ingest-result.png)；[`KbPanel.tsx`](../../packages/client/ui-kb/src/client/KbPanel.tsx:189)（`ingest.pathLabel` 两个裸文本框） |
| U4 | 检索结果是 RAG debug 视风：`[1] workspace/data/regulations/gb2760-excerpt.md — ... (regulation)` 完整内部路径+英文 doc_kind 枚举，无关键词高亮、无分组、无相关度呈现，片段 8em 内滚动 | 王工无法快速判断哪条结果可信赖、对应哪份文件；"workspace/data/..."前缀与 regulation 枚举是开发者视角泄漏；检索可用但不可读 | **P0** | [step-04](../../screenshots/kb/step-04-search-results.png)；[`KbPanel.tsx:176`](../../packages/client/ui-kb/src/client/KbPanel.tsx:176)（citation 行拼接 source_path） |
| U5 | 检索与会话割裂：KB 面板检索结果无"带入对话/基于此追问"入口；会话内 agent 调用 `kb_search` 走通用工具折叠卡（`tool.call.toolview` 有 web_search/read/bash/todo 等 keyed 注册，唯独没有 kb_*），回答中 `[n]` 引用是纯文本不可点 | 用户被迫在"面板检索"与"对话问答"两套心智间手工搬运；会话里看不到检索了哪些来源，引用无法核对——"带编号引用回答"这一核心卖点在 UI 上没有兑现 | **P0** | [step-04](../../screenshots/kb/step-04-search-results.png)；[`toolviews/web-row.tsx`](../../packages/client/ui-tool/src/client/tool/toolviews/web-row.tsx:70)（web_search 有引用卡片先例，kb 未注册）；[`WebBlock.tsx`](../../packages/client/ui-primitives/src/client/WebBlock.tsx:41) 已有可复用的引用列表卡片 |
| U6 | 两个角色预设（AI 食安合规官/企业数据助手）与 11 个场景（市场洞察/品控/食安巡检/定价/供应商风险/出口退税/设备维护/数据入表…）在 UI 上几乎不可发现：hero 区一个"标准模式"下拉承载预设切换，无说明无价值主张；场景集完全没有入口 | 产品最贴近食品企业的差异化资产（角色+场景）无法影响用户决策；张总看不到能力全景；王工不知道该换"食安合规官"角色 | P1 | [step-01](../../screenshots/kb/step-01-workbench-home.png)（"标准模式"下拉）；[`cordis.patch.yml:134`](../../examples/kb-agent/cordis.patch.yml:134)（default=enterprise-data-assistant）；[`scenarios/README.zh.md`](../../examples/kb-agent/scenarios/README.zh.md)（11 场景清单） |
| U7 | 用量统计术语开发者化："切片/已向量化切片/向量化文本/混合检索"，且埋在 KB 弹层第一段；全产品无订阅/套餐/租户状态位 | 张总读不懂用量、看不到订阅状态——计量计费这一商业闭环在 UI 上不存在；"切片"等词对三类用户全是噪音 | P1 | [step-02](../../screenshots/kb/step-02-kb-panel-initial.png)、[step-03](../../screenshots/kb/step-03-kb-panel-stats.png)；[`locales.ts`](../../packages/client/ui-kb/src/client/locales.ts:42)（stats.* 词条） |
| U8 | 无文档管理：入库后没有文档列表、状态（处理中/就绪/失败）、删除、重新入库；唯一验证方式是去会话里提问试探 | 李经理入库后进入"盲区"，无法确认材料就绪；错误文档无法移除会持续污染回答；随订阅时间增长问题恶化 | P1 | [step-06](../../screenshots/kb/step-06-ingest-result.png)；[`KbPanel.tsx`](../../packages/client/ui-kb/src/client/KbPanel.tsx:104)（ingest 仅返回 chunks 数，客户端无 list API 消费） |
| U9 | KB 面板形态：360px fixed 弹层（max-height 60vh、13px 小字）叠在侧栏底部，三段（用量/检索/入库）纵向堆砌；`panel.close` 文案已定义但界面无关闭按钮（仅点外部关闭）；开合状态存模块级变量，刷新即丢 | 核心工作面板像调试浮层而非工作台；检索结果在 60vh 里与表单抢空间；用户找不到关闭方式、刷新后状态丢失感到"不听话" | P1 | [step-02](../../screenshots/kb/step-02-kb-panel-initial.png)；[`KbPanel.module.css`](../../packages/client/ui-kb/src/client/KbPanel.module.css:6)（fixed/360px/60vh）；[`KbPanel.tsx:124`](../../packages/client/ui-kb/src/client/KbPanel.tsx:124)（header 无 close）；[`KbEntry.tsx:76`](../../packages/client/ui-kb/src/client/KbEntry.tsx:76)（模块级 panelOpen） |
| U10 | 空态/加载/错误态粗糙：stats 未加载显示孤零零"—"（像坏了）；检索/入库无 loading 指示（仅按钮置灰）；所有错误共用一条红条+"重试"，stats 区还常驻一个"重试"按钮；无 key 降级时对话以 `MISSING_CREDENTIAL` 失败 | 用户分不清"没数据/在加载/出错了"；错误文案是内部错误码；"重试"按钮语义混乱（重试什么？） | P1 | [step-02](../../screenshots/kb/step-02-kb-panel-initial.png)（"—"）；[`KbPanel.tsx:140`](../../packages/client/ui-kb/src/client/KbPanel.tsx:140)（`—` 占位）、[`KbPanel.tsx:138`](../../packages/client/ui-kb/src/client/KbPanel.tsx:138)（常驻重试）；[README.zh.md](../../examples/kb-agent/README.zh.md)（MISSING_CREDENTIAL 降级） |
| U11 | 移动端 375px 基本不可用：三栏布局无断点直接压缩，横向溢出滚动，侧栏文字截断成单字，KB 面板内容被裁切 | 走访采集（旅程 2）恰恰常发生在手机端；移动端用户完全无法使用产品 | P1 | [step-11](../../screenshots/kb/step-11-viewport-375.png) |
| U12 | 会话内引用不可交互：回答中 `[n]` 引用是纯文本，无悬停卡片、无点击跳转来源文档，与 KB 面板检索结果无联动 | 合规结论无法当场核对原文（旅程 1 的成功标准落空）；"引用即信任"停留在文案 | P1 | [`examples/kb-agent/README.zh.md`](../../examples/kb-agent/README.zh.md)（预期回答形态为文本 `[n]`）；U5 同源 |
| U13 | 双语术语直译不达意：en 词典 "Chunks/Embedded chunks/Ingest" 照搬实现概念；zh 术语同样未业务化 | 中英双语用户都读到工程语言而非产品语言 | P2 | [`locales.ts`](../../packages/client/ui-kb/src/client/locales.ts:66) |
| U14 | 首屏输入框形态与心智不符：大圆角虚线（dashed）输入框+"选择一个工作区开始"占位，像待填表格而非问答入口 | 弱化主操作区；占位文案没有传递"问我食品合规/工艺/成本问题"的心智 | P2 | [step-01](../../screenshots/kb/step-01-workbench-home.png) |
| U15 | 内部状态泄漏给终端用户：检索模式提示"仅全文（无向量服务）"、doc_kind 英文枚举、`truncated` 触顶语义 | 用户被迫理解系统内部降级与实现细节；对"答案质量是否打折"产生无据担忧 | P2 | [step-04](../../screenshots/kb/step-04-search-results.png)；[`locales.ts`](../../packages/client/ui-kb/src/client/locales.ts:55)（modeText）；[README 已知限制](../../examples/kb-agent/README.zh.md) |

**计数：P0 × 5，P1 × 7，P2 × 3，共 15 条。**

## 三、产品原则

1. **检索为中心。** 布局与动线围绕"问 → 检索 → 带引用回答 → 追问"组织，检索不是侧栏附属功能。——产品的核心卖点就是"AI 带编号引用回答"，界面结构必须与价值结构同构。
2. **订阅用户先看价值，后看功能。** 首屏回答"能为你的食品企业做什么"（角色/场景/用量），不用品牌抒情文案。——B 端续费决策靠价值感知，"探索未至之境"对质量部长毫无信息量。
3. **说人话。** 界面语言面向质量/生产/采购/管理层：文档、片段、来源、检索次数；切片、向量化、doc_kind、租户、MISSING_CREDENTIAL 一律不露出。——目标用户不是开发者，每个技术词都是一次流失。
4. **采集到回答一条动线。** 入库（上传/URL）→ 文档可见可管 → 提问引用，三步之间有可视连接，不允许功能孤岛。——价值链断任何一环，订阅价值就不成立。
5. **引用即信任。** 每个结论可溯源：引用编号可读、来源可点、原文可核对。——合规/工艺/成本决策需要证据链，这是与通用聊天产品的本质差异。
6. **复用既有 slot 体系与设计语言。** 新 UI 一律走 `packages/client/ui-*` 插件注册 ui-slots 扩展点，视觉骑 `--dsw-alias-*` 语义 token，不引入新 CSS 框架。——架构硬约束，也是最小改动面与长期可维护的路径。
7. **状态永远可见。** 加载、空态、错误、降级都有人话反馈与下一步动作，不让用户猜。——订阅产品的信任来自"系统永远告诉我现在怎么了"。
8. **桌面优先，移动不崩。** 375px 至少保证"提问得引用回答 + 检索"可用（单列 + 抽屉化）。——走访采集天然发生在移动端，可以简陋但不能不可用。

## 四、重构需求列表

优先级 P0 必须在本期完成；P1 应完成（可按序交付）；P2 可延后。验收标准均为一句话，供 Design Agent 与实现直接消费。

| 编号 | 需求 | 优先级 | 验收标准 | 对应问题 |
|---|---|---|---|---|
| R1 | 首屏工作台化：hero 区替换为产品名+一句话价值（面向食品企业）+ 快速开始入口；隐藏构建号/预览版等开发者标识 | P0 | 新用户首屏 10 秒内能说出"这是食品企业知识库问答产品"并找到开始提问的入口 | U1 |
| R2 | KB 一级化：知识库升级为侧栏一级入口（图标+文档数），KB 主界面从 360px fixed 弹层改为常驻主区视图，检索/文档/用量分区重组 | P0 | 不打开任何弹层即可看到文档总数与最近入库文档，检索在主区完成 | U2、U9 |
| R3 | 入库向导：文件选择/拖拽上传（md/txt/pdf/docx）+ URL 粘贴，明确进度与成功/失败反馈，成功后文档出现在文档列表 | P0 | 非开发者不输入任何路径即可完成一份 PDF 入库并看到它出现在文档列表 | U3、U8 |
| R4 | 检索结果产品化：来源显示为文档名+标题路径（隐藏 workspace 前缀）、关键词高亮、卡片化布局、每条结果提供"带入对话追问" | P0 | 检索"山梨酸 酱油"后结果卡片显示文档名与高亮片段，一键将问题送入会话输入框 | U4、U5 |
| R5 | 会话内引用卡片：为 kb_search/kb_ingest/kb_stats 注册 `tool.call.toolview`（复用 WebBlock 引用卡片模式），回答中 `[n]` 引用可交互查看来源 | P1 | 会话中一次 kb_search 调用渲染为带编号来源卡片而非通用 JSON 折叠，回答内引用可点开来源 | U5、U12 |
| R6 | 角色与场景可发现：预设切换入口展示名称+一句话说明（hero 或侧栏），11 个场景以可浏览的模板入口呈现 | P1 | 用户不看文档即可切换到"AI 食安合规官"并读到它的用途说明，能浏览场景清单 | U6 |
| R7 | 用量人话化+订阅位：用量指标改为业务语言（检索次数/入库文档数等）并置于固定可见位置，预留订阅/套餐状态位 | P1 | 管理层 5 秒内读到检索次数与文档总数且界面无"切片/向量化"字样，存在订阅状态展示位 | U7 |
| R8 | 状态与错误态：加载指示、空态引导（示例问题/上传引导）、错误人话文案+按操作区分的重试 | P1 | 无 key 降级时用户看到"未配置模型服务，请联系管理员"类提示而非 MISSING_CREDENTIAL | U10、U15 |
| R9 | 移动端可用：≤768px 单列布局，侧栏与 KB 抽屉化，聊天问答与检索可完成 | P1 | 375px 视口无横向滚动，可完成一次带引用的问答 | U11 |
| R10 | 双语术语校准：zh/en 词典同步业务化（文档/片段/来源；Documents/Sources） | P2 | 切换 locale 后 KB 相关界面无实现概念词 | U13 |
| R11 | 首屏输入框心智：输入框样式与占位改为食品业务示例问题（如"酱油中山梨酸钾的最大使用量？"） | P2 | 首屏占位文案为具体食品行业示例问题 | U14 |

实现硬约束（对 Design Agent 与 Code Agent 均有效）：

- 不引入新 CSS 框架；样式骑 `--dsw-alias-*` 语义 token（先例：[`KbPanel.module.css`](../../packages/client/ui-kb/src/client/KbPanel.module.css:1)）。
- 走 `packages/client/ui-*` 插件模式。可用扩展点（本期走查确认）：`sidebar.brand.mark`/`sidebar.brand.name`/`sidebar.workspaces`/`sidebar.settings`/`sidebar.footer.action`（[ui-sidebar](../../packages/client/ui-sidebar/src/client/contract/slots.ts:23)）；`conversation.hero.brand.mark`/`conversation.hero.workspace`/`conversation.hero.agentPreset`、`conversation.composer(.bar/.dock)`、`conversation.input.*`、`conversation.session.header.*`（[ui-conversation](../../packages/client/ui-conversation/src/client/contract/slots.ts:71)）；`tool.call.toolview`（keyed，[ui-tool](../../packages/client/ui-tool/src/client/contract/slots.ts:24)）；`shell.overlay`、`settings.*`（[ui-layout](../../packages/client/ui-layout/src/client/index.ts:49)、[ui-settings](../../packages/client/ui-settings/src/client/contract/slots.ts:23)）。
- 不破坏既有功能：会话聊天、KB 面板既有能力（stats/search/ingest/ingestUrl）保持可用；[`ui-kb tests`](../../packages/client/ui-kb/tests/) 与 [`examples/kb-agent/tests`](../../examples/kb-agent/tests/)（含快照与 e2e）全绿。

## 五、给 Design Agent 的输入摘要

最重要的三件事：其一，把"检索为中心"落成布局——首屏从通用聊天壳改为食品企业知识库工作台（价值主张 + 角色/场景入口 + 问答主轴），KB 从侧栏底部 360px 弹层升级为一级常驻视图，打通"入库向导 → 文档列表 → 检索结果 → 带入对话追问"的完整闭环（对应 R1-R4，全部 P0）。其二，全面去开发者化——路径前缀、切片/向量化、doc_kind、检索模式降级、MISSING_CREDENTIAL 等内部概念不得出现在用户界面，用量指标改写为业务语言并给订阅留位（R3/R7/R8）。其三，严守实现硬约束——只在 `packages/client/ui-*` 插件内通过 ui-slots 扩展点（hero、sidebar、tool.call.toolview、shell.overlay 等）与 `--dsw-alias-*` token 工作，不引入新 CSS 框架，保住 ui-kb 单测与 kb-agent e2e/快照全绿；移动端至少做到单列可用的问答与检索（R9）。
