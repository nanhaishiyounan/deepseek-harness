# 批次 F1：admin「项目管理」视图页 v2 升级——看板/日历新视图工厂 + 甘特边界终裁

> 隶属 [PLAN.md](PLAN.md)。前置：无（E 轮 E1-E6 成果已入库存量）。改动面：新增种子脚本 1 个 + all 链挂载 + 三处 E 轮过时结论修订；**不改任何 vendored 源码、不改 e1/n17/n18 既有脚本**。本批推翻 E 轮「无视图区块模型」结论并首次交付 v2 视图区块——工厂探查先行是本批生命线。

## 根因回顾（一段话版）

E 轮把任务看板/日历/甘特三页保留 v1 的依据是「2.2.6 flowModel 体系无对应区块模型」（[e1 头注释 :19-20](../../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts)）。F 轮调研证伪：看板与日历的区块模型在 2.2.6 完整落地——客户端注册（[plugin-kanban/src/client-v2/plugin.tsx:23](../../../platform/nocobase/packages/plugins/@nocobase/plugin-kanban/src/client-v2/plugin.tsx:23)、plugin-calendar client-v2 同款）、server 白名单（[node-use-sets.ts:14,16](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/node-use-sets.ts:12)）、官方支持矩阵（[support-matrix.ts:71,83](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/support-matrix.ts:46) 全 true）、官方 fixture（`flow-surfaces-fixtures/` kanban/calendar 五件套）四层证据俱全；甘特则部分成立——客户端有注册（[plugin-gantt/src/client-v2/plugin.tsx:20](../../../platform/nocobase/packages/plugins/@nocobase/plugin-gantt/src/client-v2/plugin.tsx:20)）但 server authoring 体系零支持、无 fixture、无 define 元数据。误判根源：E 轮判定止步于 n17d 工厂能力与核心内置模型目录，未查插件侧 client-v2 注册面。v1 三页因此无悬浮球（[ChatButton.tsx:29](../../../platform/nocobase/packages/plugins/@nocobase/plugin-ai/src/client-v2/ai-employees/chatbox/components/ChatButton.tsx:29) 对 `version==='v1'` 返回 null）。

## 范围裁决（已定）

| 页面 | 处置 | 依据 |
|---|---|---|
| 任务看板（`r9152u4r41q`，hub_pj_tasks） | **升级 v2**（KanbanBlockModel） | 四层证据俱全（PLAN §1.2）；E5 已修复 v1 卡片渲染（19/19 卡），升级后能力须不回退 |
| 任务日历（`f0z48rz5pye`，hub_pj_tasks） | **升级 v2**（CalendarBlockModel） | 同上 |
| 任务甘特（`zs3oqvlgqq0`，hub_pj_tasks） | **保留 v1 + 边界终裁** | server 零支持 + 无 fixture + 无 UI 可配性；程序化 wire 无合同保护不值得交付 |

## 改动面

### 0. 第 0 步探查（写 spec 前必须完成，结论决定直发 payload 形态）

| # | 探查项 | 方法 | 产出 |
|---|---|---|---|
| 0-1 | 官方 fixture（authoring `addBlock` 的 `{target, tree}` payload）→ `flowModels:save` 逐节点直发形态的映射 | 对照读 [`kanban-block-live.raw.json`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/__tests__/flow-surfaces-fixtures/kanban-block-live.raw.json)（落库形态）与 `.raw-persisted.json`（持久化后）与 `.readback.json`（读回）；e1 工厂逐节点 save 模式为骨架参照 | Kanban/Calendar 区块树的直发节点清单（uid/parentId/use/props/stepParams 逐字段） |
| 0-2 | 看板卡片字段配置：KanbanCardItemModel 子模型形态（v2 的「卡片显示哪些字段」挂在哪） | [`plugin-kanban/src/client-v2/models/KanbanCardItemModel.tsx`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-kanban/src/client-v2/models/KanbanCardItemModel.tsx:1) + [`KanbanBlockModel.tsx`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-kanban/src/client-v2/models/KanbanBlockModel.tsx:500)（卡片段与 toColumns 逻辑）+ fixture readback 全树；对照 v1 契约沉淀（[kanban-card-rendering-contracts Note](../../../.agents/notes/implemented/architecture/2026-09-13-kanban-card-rendering-contracts.zh.md)：v1 卡片段须在固定 properties 键 `card` 下 + 主键声明）。**v1 页参考值（主任务亲证存档）**：`groupField:'status'`、`sortField:'sort'`、卡片 `openMode:'drawer'`、card 段字段=CollectionField×N（title 等核心字段） | 卡片字段子模型 spec（v2 等价物：预期 fieldSettings.init.fieldPath 逐字段项或 cardView 内嵌） |
| 0-3 | 日历 fieldNames 映射：hub_pj_tasks 的 title/start/end 候选字段 | v1 日历页 schema（[`research/f-round-inventory/v1-pages/任务日历.json`](../../../research/f-round-inventory/v1-pages/任务日历.json)）——**主任务已亲证现成映射**：`{id:'id', start:'due_at', title:'title', end:[]}`（due_at 为起始、无结束字段） | fieldNames 终值（v2 建议 `{title:'title', start:'due_at', end:'plan_end'}` 以补齐结束语义，实施时以渲染验证为准）+ defaultView/quickCreate 配置 |
| 0-4 | 看板/日历的 Add new 通道：fixture 中 AddNewActionModel/quickCreate 的弹窗表单形态（KanbanQuickCreateActionModel vs AddNewActionModel→ChildPageModel→CreateFormModel） | fixture actions 段 + [`hidden-popup-kanban.ts`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/hidden-popup-kanban.ts)/`hidden-popup-calendar.ts` | 弹窗通道选型：**目标=顶层 CreateFormModel**（n18 只挂顶层表单；e1 弹窗模式复用） |
| 0-5 | 脊柱校验扩展：`v2TreeComplete` 对看板页/日历页的判定项 | e1 的 [`v2TreeComplete`](../../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts) 同位逻辑 + 0-1 结论 | 看板脊柱 = KanbanBlockModel(collection 匹配) + [顶层 CreateFormModel] + submit；日历同构 |
| 0-6 | N22 探活 + admin default 角色检查（E5 环境态事故预防） | `:13100/healthz` + rolesUsers 查询 | ready + root 方进入跑库 |

**探查出口条件**：0-1 拿到完整直发形态 → 写 spec；KanbanBlockModel 直发后浏览器不渲染（loader 未按 use 解析等意外）→ 单页迭代 ≤2 轮仍失败则本批暂停上报（不降级为表格页冒充看板——丢视图能力等于重蹈 E 轮边界误判）。

### 1. 新种子脚本 `examples/kb-agent/scripts/nocobase-f1-view-v2.mts`

骨架复制 [`nocobase-e1-pj-v2.mts`](../../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts)（call/dataOf/signInWithRetry/rollback 双保险/幂等 kept 全套继承），新增：

1. **`VIEW_PAGES: ReadonlyArray<V2ViewPageSpec>`**——2 页 spec：`{title, collection, viewKind:'kanban'|'calendar', viewProps, columns?, formFields}`。formFields 复用 e1 任务列表字段集（title/project/assignee/status/priority/due_at/plan_start/plan_end）。
2. **`ensureV2ViewPage`**：与 e1 `ensureV2TablePage` 同骨架（同名 flowPage kept→脊柱校验→截断整批 heal→destroy v1 前落盘 rollback 记录），树构建段替换为：RouteModel×2 → RootPageModel → BlockGridModel → **KanbanBlockModel/CalendarBlockModel（props 按 0-1）** → actions（Filter/AddNew/Refresh，日历加 CalendarNav/CalendarViewSelect）→ AddNew 弹窗链（AddNewActionModel→ChildPageModel→ChildPageTabModel→BlockGridModel→CreateFormModel→FormGridModel→FormItem 字段）。
3. **rollback 记录迁至 `demos/acceptance-f/rollback-records.json`**（与 e1 记录隔离；按 title 读-改-写合并、destroy 前逐页 flush——E5 三缺陷修复模式原样继承）。`--rollback` 分支同 e1：毁 `n17f1*` 树 → 销毁后重拉扫 `n18ai-` 孤儿 → 按记录重建 v1 行（uiSchemas 不级联删除，E1 probe-0-4 实证；tabs 孤儿清理按 E3 探查结论补做）。
4. **uid 前缀 `n17f1*` 族**（route/tab/page/grid/block/action/item 与 e1 命名同构）。
5. 甘特页零触碰。

### 2. all 链挂载

[`setup-nocobase.mts`](../../../examples/kb-agent/scripts/setup-nocobase.mts) 的 all 链在 `e1-pj-v2` 之后、`n18-form-ai` 之前插入 `f1-view-v2`（保持「建页在前挂钮在后」不变量）；verify 断言扩展：v2 flowPage 期望 11→13、`n18ai-` 按钮期望 ≥11（新看板/日历弹窗表单各 +1，具体值以实施为准同步校准）。

### 3. E 轮三处过时结论修订（随本批落，因本批即证伪）

| 位置 | 改法 |
|---|---|
| [`nocobase-e1-pj-v2.mts:19-20`](../../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts) 头注释 | 「kanban/calendar/gantt stay v1: no block model」→「kanban/calendar upgraded by F1 (nocobase-f1-view-v2.mts); gantt stays v1 — plugin-gantt's client model is registered but absent from flow-engine's server authoring surface」 |
| [`probe-notes.md:49`](../../../examples/kb-agent/demos/acceptance-e1/probe-notes.md) | 追加 F1 复核行：四层证据推翻（引用 support-matrix/node-use-sets/fixture 路径），保留历史原文（探查笔记是时间线记录，不篡改） |
| [`QUICKSTART.zh.md:133`](../../../examples/kb-agent/QUICKSTART.zh.md) | 「看板/日历/甘特三页保持 v1」→ 看板/日历 v2 + 甘特 v1（措辞按 F1 终态）+ 英文版同步 |

## 实施步骤

1. 第 0 步探查（0-1 ~ 0-6），产出直发节点清单与卡片字段 spec → 定稿 VIEW_PAGES；
2. 写脚本 + all 链挂载 + verify 断言扩展；
3. **现有库**先跑「任务看板」单页（`--only 任务看板`）→ 浏览器验渲染（分组列/卡片字段/拖拽）→ 迭代至通过 → 铺日历页 → 跑 n18；
4. psql/flowModels:list 断言：2 页 flowPage 行、KanbanBlockModel/CalendarBlockModel 各 1、`n18ai-` 新增 2、孤儿 0；
5. 真实浏览器验收（下节），截图落 `examples/kb-agent/demos/acceptance-f1/`；
6. 幂等二跑：f1 两页全 kept、n18 already in place、孤儿 0；甘特 v1 回归正常。

## 验收断言（真实浏览器，admin 登录）

1. 「任务看板」v2 渲染：按 status 分组列（7 组，TASK_STATUS 色彩）、每卡显示核心字段（与 v1 19 卡等价或更全）、卡片可拖拽换列（dragEnabled 或 UI 配置等价）；
2. 看板页悬浮球出现（v1 时无）；Add new 弹窗（或 quickCreate）可建任务且含 AI 按钮（dex）、m2o 下拉含 9 位 AI 员工；
3. 「任务日历」v2 渲染：月视图默认、事件含 title、起止映射正确（0-3 的 fieldNames）、事件可点开详情/编辑；
4. 日历页悬浮球出现；日历新建事件表单可用（quickCreate 或 Add new 弹窗）；
5. **回归**：「任务甘特」维持 v1 可用（有数据、可交互）；「项目/任务列表/里程碑」三页 E1 成果不回退；CRM 8 页 v2 正常；Portal 面正常；
6. 幂等二跑全 kept + 孤儿 0；all 链顺序重跑无重复挂载；
7. `--rollback` 演练一次（可选，若执行则 rollback 后重跑正向脚本恢复终态）：甘特页零触碰、E1 三页零触碰；
8. 截图 ≥6 张（看板 v2 分组+卡片/看板悬浮球/看板 Add new AI 按钮/日历 v2 月视图/日历悬浮球/甘特 v1 回归）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| fixture→直发映射不全（raw/raw-persisted 差异字段漏抄）导致渲染空块 | 中 | 0-1 三份 fixture 对照逐字段抄录；单页试点迭代 ≤2 轮；仍败则暂停上报（出口条件） |
| KanbanCardItemModel 子模型形态与 e1 列/表单模型不同构（无 fieldSettings.init 先例） | 中 | 0-2 以源码+readback 为准；卡片字段最少集合（title/status/priority/due_at）保底，字段不全不阻塞验收 1 的「等价或更全」 |
| 看板 Add new 走 quickCreate 通道导致无顶层 CreateFormModel、n18 不挂按钮 | 低 | 0-4 选型明确走 AddNewActionModel→ChildPageModel→CreateFormModel（e1 复用）；quickCreate 关闭（props.quickCreateEnabled=false 同 fixture） |
| destroy 看板/日历 v1 行后 tabs 孤儿遮蔽（E3 发现的 tabs 复用陷阱） | 中 | destroy 前查同 parentId tabs 行并记录；rollback 分支清理 tabs 孤儿（E3 清理 7 孤儿先例） |
| n18 对同页多表单（看板+任务列表同 collection 不同页）重复挂按钮 | 低 | n18 按 formUid 幂等（一表单一按钮），跨页不互扰；验收 6 断言孤儿 0 |
| E5 式环境态（角色/进程缓存）干扰 | 低 | 0-6 探活前置；验收失败先查环境态再查代码（E5 教训） |

**回滚**：`--rollback` 分支销毁 `n17f1*` 树与两页 flowPage 行、按记录重建 v1 路由行（含 tabs 孤儿清理）——甘特页与业务数据全程零触碰。整体 revert 种子提交后重跑 rollback 即回到 E6 终态。
