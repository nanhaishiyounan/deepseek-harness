# 批次 1（M1）：DSH PC 问数界面信息架构与交互重设计

> 依据：[总纲](PLAN.md)、[现状 UX 诊断（痛点 1-16）](../../research/2026-09-17-mobile-prototype-analysis.md)、[conversational-BI 交互模式调研](../../research/2026-09-16-conversational-bi-nl2query-patterns.md)、[AI 工具调用前端视图循环调研](../../research/2026-09-16-ai-toolcall-frontend-view-loop.md)。
> 定位：**不是换皮**——重新设计信息架构（用户先看到什么）与交互（怎么追问/联动/直达），视觉仅随新结构微调。

## 1. 目标

食品企业四类角色（业务员/采购/品控/老板）在 PC 工作台完成"问数 → 溯源 → 追问 → 行动"闭环，不再需要理解"八个视图环 tab + 工具行折叠"的内部结构。

**对应用户痛点**（诊断编号）：①答案来源不可一眼见（P1）②零图表（P2）③工具过程可发现性弱（P3）④业务页问数跳页丢上下文（P4）⑤95 对象平铺下拉（P5）⑥小编辑走三步确认（P6）⑦SRM 无专属视图（P7）⑧订单无看板（P8）⓭无经营概览首页（P13）⓮SQL 无核对无导出（P14）⓯场景卡无高频入口（P15）。

## 2. 设计阶段（前置，design-workflow 多 agent 流程）

按用户要求走 design-workflow：**问题识别（本诊断 18 条痛点 + 四角色旅程图）→ 信息架构重设计（导航/视图环重排、首页定义、任务流优先级）→ 高保真设计与实现**。产出物：四角色 × 核心任务的用户旅程图、新信息架构树、五组件设计规格（来源卡/数字卡/概览页/业务分组/页内对话），评审通过后进入实现。

## 3. 实施内容与落点（五项，按优先级）

### 3.1 答案来源卡 SourceTrail（痛点①③，P0）

- **新组件**：`packages/client/ui-conversation/src/client/chat/SourceTrail.tsx`——每条 assistant 最终消息尾部聚合渲染"本答案来自"：kb 引用（文档名+标题路径，复用 [parseCitations](../../packages/client/ui-kb/src/client/toolviews/kb-tool-model.ts)）、lakehouse 表名（persona 已约定 naming the source table，改为结构化约定）、nb collection 名、kg 边 asserted_by 徽标（[kgTypes.ts](../../packages/client/ui-kg/src/client/kgTypes.ts) 已有五源枚举）。
- **数据流**：本轮 tool-call 结果 → 会话投影已有工具值（session log 可重建，符合"模型可见⟺logged"不变量）→ 按源类型归并去重 → chips + 展开 citation 列表；点击 chip 跳原文（kb 工作台检索定位）/原表（lakehouse）/原图谱（kg 视图种子定位）。
- **验收**：三源混合问题（如"宏发食品的出口数据 + 相关合规条款 + 供应商关系"）答案卡显示 ≥3 个源徽标，点击可达；e2e 快照断言 chips 结构。

### 3.2 零依赖图表与数字卡（痛点②⓮，P0）

- **新组件**：`packages/client/ui-tool/src/client/tool/LakehouseToolRow.tsx`——lakehouse_query 专属工具行：表格视图 + "已执行 SQL"折叠项 + 一键导出 CSV（Blob 下载）+ 数值列自动数字卡（总数/均值/极值）。
- **轻量图表**：`packages/client/ui-conversation/src/client/charts/` 下 SVG 数字卡/横条图/迷你折线（零依赖，AssistantMarkdown 表格旁按列类型提示切换视图）。
- **门禁决策**：echarts 级全量图表库**不在本批**；若设计阶段证明需要，单列评估（bundle 体积、[vite.config.ts](../../apps/web/vite.config.ts) vendor chunk 规则、React-free 约束）后再引入。
- **验收**：真实 API 问"近 6 个月出口额趋势"→ 结果区渲染迷你折线+数字卡+SQL 折叠+CSV 导出成功；快照覆盖降级（无数据时纯表格）。

### 3.3 经营概览首页（痛点⓭⓯，P1）

- **改造**：`packages/client/ui-kb/src/client/hero/`（[KbHeroHeadline.tsx](../../packages/client/ui-kb/src/client/hero/KbHeroHeadline.tsx) + [scenarios.ts](../../packages/client/ui-kb/src/client/hero/scenarios.ts)）——空会话 portal 从"大标题+30 场景卡"升级为三层：**今日概览 KPI 带**（lakehouse 聚合直出：本月出口额/订单数/在途/风险项，经 apiproxy data/lakehouse 域或预聚合表）、**钉选场景**（用户可钉高频场景卡，持久化于会话状态）、**最近交付物**（[ui-deliverables](../../packages/client/ui-deliverables/src) 的 PDF 入口）。
- **验收**：冷启动空会话 3 秒内渲染 KPI 带（真实 lakehouse 数据）；钉选场景持久化跨会话；截图证据。

### 3.4 业务管理页四改造（痛点④⑤⑥⑦⑧，P1）

- **落点**：[BizView.tsx](../../packages/client/ui-business/src/client/BizView.tsx)。
- ①**95 collection 分组导航**：按域分组（CRM/SRM/WMS/帮助台/费用/食品业务/系统），拼音首字母搜索，常用置顶（使用频率记入本地偏好）。
- ②**页内问数不跳页**：问数条从 setDraft+跳 chat（[askInChat](../../packages/client/ui-business/src/client/BizView.tsx)）改为 details 列内嵌对话面板（复用 view-context J3 机制：页面快照注入 + [tool-view-actions](../../examples/kb-agent/cordis.patch.yml) switch_view 保留深链能力）。
- ③**低风险字段内联编辑**：白名单字段（数量/日期/备注）卡片内直写（apiproxy nocobase 域需扩 update 方法，或走 agent nb_update 快速通道）；高风险字段保留对话确认流——"No forms"宣言收敛为"高危走对话、低危内联"。
- ④**供应商 360 与订单 tab**：SRM collection 专属模板（证照到期预警、审核时间线）；订单 tab（状态列+交付物直达，复用 [OrdersSection](../../packages/client/ui-assets/src/client/OrdersSection.tsx) 模式）。
- **验收**：采购角色旅程（找供应商→看证照→改联系备注→问数）全程不出业务页；95 对象 3 次点击内可达任一；真实写操作留 nb_update 回执。

### 3.5 KG 视图交互增强（与 M2-P0 协同，P1）

- **落点**：[KgView.tsx](../../packages/client/ui-kg/src/client/KgView.tsx) + [kg-nl.ts](../../packages/kb/kb-graph/src/kg-nl.ts)。
- ①**数据时效徽标**：图页顶部显示"数据截至 <kg-build 最后运行时间>"（kg.stats 已有口径扩展）+ 一键重建入口（触发 kg-build 增量，M2-P1 前先提示走脚本）——痛点⑩。
- ②**追溯模板扩容**：kg-nl.ts TEMPLATES 增加追溯族（"X 批次流向哪些客户/X 原料来自哪些供应商"），离线回落模板从 3 → 8+，示例短语 KG_QUERY_EXAMPLES 同步——痛点⑪。
- ③**双节点路径高亮**：KgGraphCanvas 增加两实体最短路着色（graphology 最短路径，M2-P0 graphology 引入后顺势完成）——痛点⑨。
- **验收**："酱油的原料来自哪些供应商"短语命中新模板并返回子图；时效徽标真实反映 kg-build 运行时间；张红喜场景短语回归全绿。

## 4. 涉及文件/包汇总

| 包 | 文件 | 变更类型 |
|---|---|---|
| packages/client/ui-conversation | chat/SourceTrail.tsx（新）、charts/（新）、AssistantMarkdown.tsx | 新组件+联动 |
| packages/client/ui-tool | tool/LakehouseToolRow.tsx（新） | 新工具行 |
| packages/client/ui-kb | hero/ 目录改造、toolviews/kb-tool-model.ts 复用 | 首页重构 |
| packages/client/ui-business | BizView.tsx + 新 SRM 模板/订单 tab 组件 | 页面四改造 |
| packages/client/ui-kg | KgView.tsx、KgGraphCanvas.tsx | 时效徽标/模板/路径 |
| packages/kb/kb-graph | kg-nl.ts（模板扩容） | 纯函数扩展 |
| packages/host/apiproxy | nocobase.schema.ts/nocobase.ts（可选 update 扩展） | 读写边界明确标注 |
| apps/web/tests | 新增 e2e：source-trail / lakehouse-row / overview-hero / biz-inline-edit / kg-trace-phrase | 快照测试 |

## 5. 验收标准（真实可验证）

1. **真实 API 实跑**（DEEPSEEK_API_KEY）：四角色旅程各 1 条会话留档（业务员两源问数含来源卡；采购供应商 360+内联编辑；品控批次追溯新模板短语；老板概览 KPI+趋势图+CSV 导出）。
2. **浏览器证据**：chrome-devtools 截图（重构前后对比）+ record-browser-gif 录制"问数→溯源→追问"交互 GIF 附 PR。
3. **快照测试**：新增 ≥5 个 keyless e2e 快照（真实 runnable example 走 assembled 路径），既有 kg-graph-page/market-pages/navigation-panes 快照回归通过。
4. **文档与 Agent Note**：docs/subsystems/web.zh.md 相应段落 + Agent Note（implemented/process）同 PR；涉及 kg-nl 模板的更新对应单测。

## 6. 依赖与风险

- **依赖**：无外部批次依赖（3.5 的路径高亮借 M2-P0 的 graphology 引入，若 M2-P0 未达则该项降级后置）。
- **风险**：①来源卡依赖 persona 结构化约定（lakehouse 表名）——通过 tool 值结构化（lakehouse_query 返回值加 sourceTable 字段）消除提示词依赖；②业务页内联编辑触及"读写边界"立场——仅白名单字段+apiproxy 明确 update 方法，PR 描述显式声明；③设计阶段若推翻本方案结构，以 design-workflow 产出为准回填本文件。
