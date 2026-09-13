# 用户验收反馈修复计划（第五轮 F）：admin 全量 v1 页面升级 v2 + AI 覆盖推进（2026-09-13）

> 面向下一位实施者（Loop 批次/code 模式）：本文回答"为什么与做什么裁决"，每批"怎么做"在 [01](01-pj-view-pages.md)~[05](05-closeout-regression.md)。所有根因结论附 `文件:行号` 或实机证据；调研经 3 路完成（主任务亲证 + A 路实机盘点 + B 路代码实证），事实底座见 [00-research-notes.md](00-research-notes.md)，原始证据存档 [`research/f-round-inventory/`](../../../research/f-round-inventory/manifest.md)。基线 HEAD=`683d32a32d`（E 轮 E1-E6 终审 PASS，提交链未推送）。

**目标一句话**：把 admin 后台全部可升级的 v1 页面（15/16）升级为 v2 flowPage——表格类复用 E1 工厂直配、看板/日历推翻 E 轮"无区块模型"误判后走新视图工厂、甘特保留 v1（唯一真边界）、"仪表盘"两页择机图表化——让悬浮球 + n18 表单 AI 按钮覆盖所有业务页，并同步修订 E 轮留下的三处过时边界声明。

**北极星（用户原话）**：

1. 「还有很多页面没有升级v2，nocobase的所有系统、所有页面能升级的都要升级下，尤其ai功能」

---

## 1. 调研结论摘要

### 1.1 全量盘点：v1 页面恰为 16 个，分四类（主任务亲证 + A 路交叉）

desktopRoutes 63 行（`group`7 / `page`16 / `flowPage`12 / `tabs`28，API 与 psql 双向一致）。12 个 flowPage = 11 业务页 + AI 工作台系统页（N13）。16 个 v1 页按升级路径分类：

| 类 | 页面（collection / 区块） | 升级路径 | 批 |
|---|---|---|---|
| **A 纯表格**（7 页） | 产品与服务（crm_products）、回款（crm_payments）、发票（crm_invoices）、知识文章（hub_kb_articles）、维保记录（hub_as_maintenance）、部门（hub_hr_departments）、请假审批（hub_hr_leave_requests） | E1 工厂直配（六 kind 已齐）；n18 自动挂 AI 按钮 | F2/F3 |
| **B 复合页**（3 页） | 工作台（hub_pj_tasks + hub_tk_tickets 双表格）、分类维护（hub_md_×4 多 tab 四表格）、供应商（hub_as_vendors 表格 + 用户手配 Add-new drawer，38KB 最大 v1 页） | 工厂扩展：多 TableBlock 页 / 手配弹窗字段合同（E1 项目页同款） | F3 |
| **C 名不符实仪表盘**（2 页） | 客户仪表盘（crm_customers 表格，与 v2「客户」重复入口）、销售仪表盘（crm_payments 表格，与「回款」同 collection） | 先裁决去留 → v2 表格化保底；Chart 区块化为可选增强 | F2/F4 |
| **D 视图页**（3 页） | 任务看板（Kanban）、任务日历（Calendar）、任务甘特（Gantt）——均 hub_pj_tasks | 看板/日历 = 新视图工厂（fixture 可循）；甘特 = 保留 v1（边界） | F1 |
| 豁免（1 页） | 应用中心（Markdown×5 静态导航，无数据区块） | 不适用升级（无区块可映射；悬浮球价值近零） | — |

用户线索的实机修正：CRM 域无「跟进/目标」页；Hub 域无「采购/资产分配」独立页；「工作台」是顶级 v1 双表格页。全库不存在任何 Chart/Filter 区块——「仪表盘」若做真图表属**新建**而非升级。

### 1.2 E 轮「无视图区块模型」结论复核：看板/日历被推翻，甘特部分成立

E 轮结论原文三处（[e1 头注释 :19-20](../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts)、[probe-notes.md](../../examples/kb-agent/demos/acceptance-e1/probe-notes.md) :49、[QUICKSTART.zh.md :133](../../examples/kb-agent/QUICKSTART.zh.md)）断言「2.2.6 flowModel 体系无看板/日历/甘特区块模型」。逐项复核（主任务亲读源码）：

| 视图 | 客户端注册 | server 白名单 | 官方矩阵 | 官方 fixture | 裁决 |
|---|---|---|---|---|---|
| 看板 | [`plugin-kanban/src/client-v2/plugin.tsx:23`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-kanban/src/client-v2/plugin.tsx:23) | [`node-use-sets.ts:16`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/node-use-sets.ts:16) | [`support-matrix.ts:83`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/support-matrix.ts:83) 全 true | `kanban-block-live.*` 五件套 | **可升级——E 轮误判** |
| 日历 | plugin-calendar client-v2 同款注册 | `node-use-sets.ts:14` | `support-matrix.ts:71` 全 true | `calendar-block-live.*` | **可升级——E 轮误判** |
| 甘特 | [`plugin-gantt/src/client-v2/plugin.tsx:20`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-gantt/src/client-v2/plugin.tsx:20) 有注册 | **不在**四组 use-sets | **不在** 17 个 formal key | **无 gantt fixture** | 仅客户端 wire 可用（[extends TableBlockModel](../../../platform/nocobase/packages/plugins/@nocobase/plugin-gantt/src/client-v2/models/GanttBlockModel.tsx:78)）；server authoring 体系零支持、无合同测试保护——**保留 v1，边界声明** |

实机插件面（亲证 `pm:list`）：89 个插件全部启用（含 plugin-kanban/calendar/gantt/data-visualization(+echarts)/charts/flow-engine/ai）——视图类升级**无插件启用成本**。误判根源推测：E 轮判定基于 n17d 工厂既有能力与 UI「添加区块」面板认知，未查插件侧 client-v2 注册面。

### 1.3 AI 覆盖面：页面 v2 化即自动全覆盖，另有三个可选增量面

- **既有机制零新代码**：v2 flowPage 由 v2 PageModel 渲染 → ChatButton 悬浮球自动出现（[`ChatButton.tsx:29`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/chatbox/components/ChatButton.tsx:29) 仅拦 `version==='v1'` 页）；新建顶层 CreateFormModel → n18 幂等扫描自动挂 `n18ai-` AI 填充按钮（[n18 头注释](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts)：顶层表单 + 孤儿自愈）。**F 轮只需把页面建出来**。
- **可选增量面**（B 路报告全量盘点，F 轮按价值择一示范，不全铺）：
  1. 表格行级/操作栏 AI 动作（`AIEmployeeActionModel`，scene=all，官方注册于 RecordActionGroupModel 等四处动作位）；
  2. AI 生成图表（chatbox 的 chart-config workContext + ChartGeneratorCard 工具卡）——F4 图表批的天然配套；
  3. 页内 AI 聊天区块（`AIChatBoxBlockModel`，AI 工作台同款）——已有一例，不重复铺。

### 1.4 风险输入：用户数据在用 + E5 加固机制必须继承

23 个业务表共约 269 行真实数据（pg-counts 亲证）；升级只动 desktopRoutes 行与 flowModels 树、不碰业务表。E5 已把 rollback 生命线加固为：按 title 读-改-写合并落盘、destroy 前逐页 flush、kept 需过树完整性脊柱校验（截断页整批拆回 v1 再重建）、孤儿清扫基于销毁后重拉列表、list 全量护栏（[handoff 0.e](../handoff-2026-09-10.zh.md)）。**F 轮工厂必须原样继承全部五项**，且多块页的脊柱校验需按页型扩展（看板页=KanbanBlockModel、日历页=CalendarBlockModel、双块页=两 collection 各一 TableBlock）。

---

## 2. 技术决策（已定，实施不再讨论）

1. **升级范围 = 15/16 个 v1 页**（上表 A/B/C/D 类全列），应用中心豁免（静态导航，无数据区块可映射）。用户诉求「所有能升级的都升级」按实机全集执行，不按猜测清单。
2. **看板/日历升级 = 通用工厂扩展新区块类型**，不是每页手写：`ensureV2ViewPage(spec)` 在 E1 工厂骨架上加 `viewKind: 'kanban' | 'calendar'`——Kanban 走 props `{groupField, groupOptions}`（直接复用 e1 的 TASK_STATUS 选项常量），Calendar 走 props `{fieldNames:{title,start,end}, defaultView:'month'}`；payload 形态以官方 canonical fixture 为模板（[00-research-notes §5](00-research-notes.md)）。不引入 authoring addBlock 通道——继续走已被 11 页实证的 `flowModels:save` 直发（server 侧无 use 白名单校验，渲染按客户端注册面解析）。
3. **甘特保留 v1，写死边界**：server authoring 体系（node-use-sets/support-matrix/catalog/合同测试）零支持 + 无官方 fixture + 无 `.define()` 元数据（UI 不可配）。程序化 wire 理论可渲染（extends TableBlockModel），但无合同保护、不可从 UI 维护——不值得交付。QUICKSTART 边界声明从「无区块模型」改写为「甘特插件未进入 2.2.6 flow-engine 官方支持矩阵」。
4. **两个"仪表盘"页的处理**：F2 批先裁决去留（客户仪表盘与 v2「客户」同 collection 重复入口、销售仪表盘与「回款」同 collection）——**默认升级为 v2 表格页保留双入口**（不做菜单删除，尊重既有信息架构）；F4 批在同一页追加 Chart 区块做「真仪表盘」试点（1-2 个图，chart fixture + chart-config 枚举探查先行，不可程序化则降级声明 + QUICKSTART 指引 UI 手工配置路径）。
5. **n18/AI 面不扩代码**：新表单由 n18 原路径自动挂按钮；悬浮球随 v2 页自动出现。行级 AI 动作（AIEmployeeActionModel）仅在 F4 以 1 个页面试点（可选任务，探查 props 形态后决定），失败不阻塞。
6. **幂等与 rollback 继承 E5 全套**（1.4 节五项），多块/视图页的 `v2TreeComplete` 脊柱按页型扩展；rollback 记录文件沿用按 title 合并模式，路径迁至 `demos/acceptance-f/rollback-records.json`（与 e1 记录隔离，避免跨轮误伤）。
7. **验收基调延续**：现有库增量幂等双跑（**不 reset**）+ 真实浏览器逐页验证（v2 渲染 + 悬浮球 + 表单 AI 按钮）+ 门禁全绿 + QUICKSTART/handoff/Agent Note 同步（含修订 E 轮三处过时声明与 [E1 Agent Note](../../.agents/notes/implemented/architecture/2026-09-13-nocobase-v1-to-v2-flowpage-upgrade.zh.md) 的边界节）。
8. **工作台/分类维护多块页保底策略**：v2 单 flowPage 内多 TableBlock（BlockGrid 并列）；分类维护若 v2 tabs 形态（RootPageModel tabs 容器）在实施探查中确认成本过高，降级为单页四块布局（同一菜单入口，能力等价）。

---

## 3. 批次总览（5 批，顺序执行）

| 批次 | 一句话 | 文档 | 页面 | 依赖 | 预估 |
|---|---|---|---|---|---|
| F1 项目管理视图升级 | 看板/日历 v2 化（新视图工厂）+ 甘特边界声明 + 修订 E 轮三处过时结论 | [01](01-pj-view-pages.md) | 任务看板、任务日历（甘特保留） | 无 | 大头（新工厂+探查） |
| F2 CRM 剩余页 | 5 表格页工厂直配 + 仪表盘双入口裁决 | [02](02-crm-remaining.md) | 产品与服务、回款、发票、客户仪表盘、销售仪表盘 | F1（工厂复用） | 中 |
| F3 Hub/人事/基础数据 + 复合页 | 7 页含三个复合页（双块/四块/手配弹窗承接） | [03](03-hub-composite.md) | 知识文章、维保记录、部门、请假审批、供应商、工作台、分类维护 | F1/F2 | 中大 |
| F4 仪表盘图表增强（裁决批） | Chart 区块试点 + AI 生成图表示范 + 可选行级 AI 动作试点 | [04](04-dashboard-charts.md) | 客户仪表盘、销售仪表盘（增强） | F2 | 中（含降级出口） |
| F5 收口回归 | 增量幂等双跑 + 全量门禁 + 证据归档 + Agent Note + 文档同步 | [05](05-closeout-regression.md) | — | F1-F4 | 中 |

顺序理由：F1 先行——看板/日历是 E 轮边界声明的主对象，新视图工厂是本轮最大技术增量，先在小范围（2 页同 collection）验证；F2/F3 是工厂复刻铺量（CRM → Hub/人事/基础数据，与用户建议的域顺序一致）；F4 依赖 F2 的仪表盘页就位；F5 收口。每批独立提交、可独立 revert（E 轮惯例）。

升级完成后预期终态：v2 flowPage 11+2+5+7=25 个业务页（+AI 工作台=26），v1 仅剩甘特 + 应用中心 2 页。

---

## 4. 验收标准（本轮完成定义）

1. **F1**：任务看板/任务日历以 v2 渲染（看板分组列 + 卡片可拖、日历月视图 + 事件可点开），两页悬浮球出现（v1 时无）；看板 Add new（quickCreate 或 AddNew 动作）与日历事件弹窗可用；甘特页维持 v1 可用（回归）；幂等双跑 kept；QUICKSTART/probe-notes/e1 头注释三处过时结论修订落盘。
2. **F2**：5 页 v2 表格 + 悬浮球 + Add new 弹窗 AI 按钮（dex）；产品/回款/发票字段清单与 v1 等价或更全（fields 表为真源）；两仪表盘双入口保留且可区分（QUICKSTART 说明差异）。
3. **F3**：7 页全部 v2；工作台两表并列、分类维护四表可达、供应商弹窗字段 ⊇ 手配 drawer 字段集（E1 字段合同同款验收）；各页悬浮球 + 表单 AI 按钮就位。
4. **F4**：若试点成功——两仪表盘页各 ≥1 个 Chart 区块渲染真实数据（截图）+ chatbox 生成图表演示 1 次；若降级——QUICKSTART 记录 UI 手工配置路径与不可程序化的实证（chart fixture 骨架态证据），页面保持 F2 终态不受损。
5. **F5**：增量幂等双跑全 kept（F 轮全部种子脚本 ×2 跑 EXIT=0）；`typecheck/lint/doc-sync` EXIT=0、分区 test 绿；证据归档 `demos/acceptance-f{1..5}/`；Agent Note（视图工厂机制）落盘 + E1 Note 边界节修订；handoff 追加 0.f 节；QUICKSTART 双语边界节更新。
6. **全局回归**：E 轮 11 页 v2 + Portal 面（D2 成果）+ N22 AI 服务链（configurationStatus 探活前置）全部不回退；PG tail 无新增 `column ... does not exist`。

---

## 5. 硬约束（实施全程有效）

- **不 reset 用户库**：全部种子操作幂等 ensure；升级页只动 desktopRoutes 路由行与 flowModels 树，不碰业务数据表。
- **不修改 `platform/nocobase` 快照源码**（vendored 核心）；不修改 e1/n17/n18 既有脚本的行为（F 轮工厂是**新脚本**，可复制 e1 骨架——脚本间小段复制是本仓库种子脚本惯例）。
- **甘特不做 v2 化**（决策 3）；**应用中心不升级**（无数据区块）。
- F1 第 0 步探查（fixture payload → flowModels:save 直发形态的映射）结论落地后方可写 spec——**禁止跳过探查直接套 TableBlock payload 冒充看板**（丢视图能力 = 第二次"边界误判"事故）。
- n18 的孤儿自愈逻辑保持原样；F 轮新表单走 n18 原有匹配路径。
- 每批验收前探活：N22 `:13100/healthz` ready（AI 按钮渲染前提）+ admin default 角色 root（E5 环境态事故复现检查）。
- 提交链维持未推送基线（`683d32a32d` 之上叠 F 轮提交）；每批独立提交、可独立 revert。

---

## 6. 风险总览

| 风险 | 等级 | 预案 | 所属批 |
|---|---|---|---|
| 看板/日历 flowModels:save 直发形态与 fixture（authoring payload）不一致——fixture 是 addBlock 通道的 `{target, tree}` 形态，直发需手工展开为逐节点 save | **中** | F1 第 0 步单页试点（任务看板）迭代至浏览器渲染通过再铺；对照 e1 工厂逐节点 save 模式（RouteModel→RootPage→BlockGrid→KanbanBlockModel→actions） | F1 |
| Kanban 卡片字段配置形态未知（v1 契约修复沉淀在 [kanban-card-rendering-contracts Note](../../.agents/notes/implemented/architecture/2026-09-13-kanban-card-rendering-contracts.zh.md)：卡片段固定 properties 键 `card` + Grid 包装 + 主键声明）——v2 的 KanbanCardItemModel 子模型形态需探查 | 中 | 第 0 步 dump 官方 fixture 的 cardViewAction/readback 全树对照；KanbanCardItemModel 源码（client-v2/models/）为主源 | F1 |
| Calendar fieldNames 映射：hub_pj_tasks 的 title/start/end 字段（title/plan_start/plan_end 或 due_at）选择 | 低 | v1 日历页 schema（A 路存档）已含现成映射，直接沿用 | F1 |
| 多块页（工作台/分类维护）v2 树形态无先例 | 中 | F3 第 0 步探查 RootPageModel tabs 容器 vs BlockGrid 并列两种形态成本；保底单页多块（决策 8） | F3 |
| 供应商手配 drawer 字段集遗漏（38KB 手配树） | 低 | 字段合同：fields 表全集 ∩ 手配树 x-collection-field 集，逐项勾对后跑库（E1 同款） | F3 |
| Chart 程序化配置不可行（fixture 为骨架态，真实 query/chart 配置复杂） | 中 | F4 明确降级出口（决策 4）：页面保 F2 终态，QUICKSTART 记 UI 配置路径 | F4 |
| 批量升级叠加 n18 扫描的孤儿误判（旧页销毁与新表单同批发生） | 低 | rollback 清扫沿用"销毁后重拉"判定（E5）；每批结束断言孤儿 0 | 全 |
| E5 式环境态事故（角色/缓存/inode）干扰验收 | 低 | 每批验收前探活清单（N22/角色/网关冒烟） | 全 |

---

## 附：调研证据存档索引

- 实机全量：[`research/f-round-inventory/`](../../../research/f-round-inventory/manifest.md)（desktopRoutes 63 行 / flowModels 473 行 / 16 个 v1 页 uiSchemas 树 / 23 表行数 / 可复现抓取脚本）
- 区块模型注册面：[00-research-notes §3](00-research-notes.md)（support-matrix/node-use-sets/fixtures/四视图裁决表）
- 官方 fixture：[`flow-surfaces-fixtures/`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/__tests__/flow-surfaces-fixtures/manifest.ts)（kanban/calendar/chart/details/grid-card/list 全 captured；无 gantt）
- E 轮机制沉淀：[E1 Agent Note](../../.agents/notes/implemented/architecture/2026-09-13-nocobase-v1-to-v2-flowpage-upgrade.zh.md)、[handoff 0.d/0.e](../handoff-2026-09-10.zh.md)、[probe-notes.md](../../examples/kb-agent/demos/acceptance-e1/probe-notes.md)
- A 路/B 路子任务完整报告已汇入并交叉比对（2026-09-13）：**三源结论一致**（主任务亲证 + A 路实机盘点 + B 路代码实证）——A 路确认 16 v1 页清单/12 flowPage/269 行数据/两"仪表盘"名不符实/供应商手配 drawer/分类维护四 tab/工作台双 collection/猜测页面不存在；B 路确认注册面四层证据（kanban/calendar/chart 支持、gantt 仅客户端注册）与 AI 面全景（AIEmployeeActionModel 四挂点/chart-config workContext/AIChatBoxBlockModel）；B 路判定矩阵建议与本计划批次顺序相容。B 路补充事实已吸收：FormBlockModel 顶层不可建（v1 通用表单升级须映射 CreateForm/EditForm）、fixtures 另有 server 合同测试内嵌 payload（`flow-surfaces.kanban.contract.test.ts:1138` 等可作 F1 探查备源）。
