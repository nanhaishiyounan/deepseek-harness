# F 轮调研底座（主任务亲证记录）

> 2026-09-13，基线 HEAD `683d32a32d`（E 轮 E1-E6 提交链，未推送）。本文件是 Loop Planner 主任务亲自验证的事实清单，与 A 路（实机盘点）、B 路（代码实证）子任务报告互为交叉印证；证据存档见 [`research/f-round-inventory/`](../../../research/f-round-inventory/manifest.md)。

## 1. 实机路由全量（亲证，63 行）

来源：[`research/f-round-inventory/desktopRoutes.json`](../../../research/f-round-inventory/desktopRoutes.json)（API `desktopRoutes:list`，与 psql 计数一致）。

分布：`group` 7 / `page`（v1）16 / `flowPage`（v2）12 / `tabs` 28。

### v2 flowPage（12 = 11 业务页 + AI 工作台系统页）

| title | schemaUid 前缀 | 组 |
|---|---|---|
| AI 工作台 | `n13ai*` | 顶级 |
| 销售线索 / 客户 / 联系人 | `n17*` | CRM 客户 |
| 订单 / 报价单 | `n17*` | 销售流程 |
| 项目 / 任务列表 / 里程碑 | `n17e1*` | 项目管理（E1） |
| 工单 | `n17*` | 工单中心 |
| 资产台账 | `n17*` | 资产管理 |
| 员工 | `n17*` | 人事管理 |

### v1 page（16，F 轮候选池；区块类型经 uiSchemas 存档亲证）

| title | pageUid | 区块 | collection | 行数 |
|---|---|---|---|---|
| 产品与服务 | `g50posy0qxc` | 表格 | crm_products | 10 |
| 客户仪表盘 | `w6nyh5dtycq` | 表格（名不符实，无图表） | crm_customers | 20 |
| 回款 | `ihfgg15bm8x` | 表格 | crm_payments | 10 |
| 发票 | `nx1znh4rs6i` | 表格 | crm_invoices | 10 |
| 销售仪表盘 | `x00jse3wllw` | 表格（名不符实；与回款同 collection） | crm_payments | 10 |
| 工作台 | `b4k6wf2zu6k` | 表格×2（双 collection） | hub_pj_tasks + hub_tk_tickets | 19+40 |
| 任务看板 | `r9152u4r41q` | 看板 | hub_pj_tasks | 19 |
| 任务日历 | `f0z48rz5pye` | 日历 | hub_pj_tasks | 19 |
| 任务甘特 | `zs3oqvlgqq0` | 甘特 | hub_pj_tasks | 19 |
| 知识文章 | `qn9j7laut2c` | 表格 | hub_kb_articles | 6 |
| 供应商 | `8bjc6gykw7e` | 表格 + 用户手配 Add-new drawer（38KB，最大 v1 页） | hub_as_vendors | 5 |
| 维保记录 | `fiyoi38ke5c` | 表格 | hub_as_maintenance | 4 |
| 部门 | `kdud3tb3iq6` | 表格 | hub_hr_departments | 5 |
| 请假审批 | `i7lcu24opl5` | 表格 | hub_hr_leave_requests | 5 |
| 分类维护 | `xpcbg0tntto` | 表格×4（四 collection 多 tab） | hub_md_×4 | 3-4/表 |
| 应用中心 | `qj3wstl3cfl` | Markdown×5（静态导航，无数据区块） | — | — |

用户原始线索的实机修正：CRM 域无「跟进/目标」页（实际缺口=产品与服务/回款/发票/两仪表盘）；Hub 域无「采购/资产分配」独立页（实际缺口=知识文章/供应商/维保记录）；「工作台」是顶级 v1 双表格页。

## 2. flowModels 基线（亲证，473 行）

来源：[`research/f-round-inventory/flowModels.json`](../../../research/f-round-inventory/flowModels.json)。use 直方图要点：`TableColumnModel` 66 / `FormItemModel` 62 / `AIEmployeeButtonModel` 12（`n18ai-`×11 对应 11 个业务 CreateForm + 1 个非 n18ai 前缀 uid `26c6ab488b1` 待子任务定性）/ `TableBlockModel` 12 / `RootPageModel` 12 / `CreateFormModel` 11 / `AIChatBoxBlockModel`+`AIChatBoxCoreModel` 各 1（AI 工作台）/ `RecordSelectFieldModel` 4 / `DateOnlyFieldModel` 7（E1 m2o/date kind 已在用）。

## 3. 区块模型注册面复核（亲证源码——E 轮「无视图区块模型」结论裁决）

| 视图 | 客户端注册 | server 白名单 | support-matrix | 官方 fixture | 裁决 |
|---|---|---|---|---|---|
| 看板 | [`plugin-kanban/src/client-v2/plugin.tsx:23`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-kanban/src/client-v2/plugin.tsx:23) registerModelLoaders×5 | [`node-use-sets.ts:16`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/node-use-sets.ts:16) | [`support-matrix.ts:83`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/support-matrix.ts:83) 全 true | [`kanban-block-live.*`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/__tests__/flow-surfaces-fixtures/kanban-block-live.canonical.json) | **E 轮结论不成立，可升级** |
| 日历 | [`plugin-calendar/src/client-v2/plugin.tsx`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-calendar/src/client-v2/plugin.tsx) | `node-use-sets.ts:14` | `support-matrix.ts:71` 全 true | [`calendar-block-live.*`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/__tests__/flow-surfaces-fixtures/calendar-block-live.canonical.json) | **可升级** |
| 图表 | [`plugin-data-visualization/src/client-v2/plugin.tsx`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-data-visualization/src/client-v2/plugin.tsx) | `node-use-sets.ts:34`（STATIC） | `support-matrix.ts:214` 全 true | [`chart-block-live.*`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/__tests__/flow-surfaces-fixtures/chart-block-live.canonical.json) | **可升级** |
| 甘特 | [`plugin-gantt/src/client-v2/plugin.tsx:20`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-gantt/src/client-v2/plugin.tsx:20) 有注册 | **不在** node-use-sets | **不在** 17 个 formal key | **无 gantt fixture** | 仅客户端可用、无官方支持面；extends TableBlockModel（[`GanttBlockModel.tsx:78`](../../../platform/nocobase/packages/plugins/@nocobase/plugin-gantt/src/client-v2/models/GanttBlockModel.tsx:78)） |
| 详情 | DetailsBlockModel 核心内置 | `node-use-sets.ts:20` | `support-matrix.ts:130` 全 true | details-block-live | 可升级（弹窗/顶层均可） |
| 表单 | CreateForm/EditForm 核心内置 | `node-use-sets.ts:17-18` | 全 true（FormBlockModel 受限：`support-matrix.ts:120-129` topLevelAddable=false） | create/edit-form fixture | 弹窗已验证；路由级=顶层 CreateForm |

E 轮误判原文位置（F 轮需修订）：[`nocobase-e1-pj-v2.mts:19-20`](../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts) 头注释、[`probe-notes.md:49`](../../examples/kb-agent/demos/acceptance-e1/probe-notes.md)、[`QUICKSTART.zh.md:133`](../../examples/kb-agent/QUICKSTART.zh.md)。

## 4. 实机插件面（亲证）

`pm:list?filter={enabled:true}` → **89 个启用、0 个禁用**。关键项全 ON：plugin-kanban / plugin-calendar / plugin-gantt / plugin-data-visualization(+echarts) / plugin-charts / plugin-block-list / plugin-block-grid-card / plugin-block-workbench / plugin-flow-engine / plugin-ai / plugin-public-forms。视图类升级无插件启用成本。

## 5. fixture payload 形态（亲读 canonical）

- 看板：`use:KanbanBlockModel` + props `{groupField, groupOptions[{value,label,color}], styleVariant, quickCreateEnabled, dragEnabled}` + stepParams.resourceSettings.init + actions（Filter/AddNew/Refresh）+ cardViewAction（KanbanCardViewActionModel）。
- 日历：props `{fieldNames{title,start,end}, defaultView, enableQuickCreateEvent, weekStart}` + calendarSettings.eventPopupSettings + actions（Filter/CalendarNav/CalendarViewSelect/Refresh）。
- 图表：stepParams.chartSettings.configure（query.mode=builder + chart.option.mode=basic）——骨架态，真实图表需 UI 或 chart-config 完成配置（程序化全量图表配置复杂度高）。
- 详情：DetailsBlockModel + detailsSettings{layout,dataScope} + DetailsGridModel + DetailsItemModel(fieldSettings.init.fieldPath) + 内嵌 Display*FieldModel——与 E1 表格列「壳+display 子模型」双层形态同构。

## 6. E1 工厂现状（亲读）

[`nocobase-e1-pj-v2.mts`](../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts)（628 行）：六 kind（input/select/number/m2o/date/boolean）双模型映射；幂等=同名 flowPage + `v2TreeComplete` 脊柱校验（TableBlockModel + 顶层 CreateFormModel + submit-<formUid>）；rollback 双保险=destroy 前逐页落盘 `demos/acceptance-e1/rollback-records.json`（按 title 读-改-写合并）+ `--rollback` 分支（毁 n17e1* 树→按幸存清单扫 n18ai- 孤儿→重建 v1 路由行）；uid 前缀族 `n17e1*`。行号级细节以 B 路报告为准。

## 7. 基线与提交链（亲证 git log）

`683d32a32d`(E6) ← `36e9ab7ed7`(E5) ← `9ccc9b8f66`(E4) ← `50f1348e61`(E3) ← `d490435cf0`(E2) ← `cb009a42dc`(E1) ← `14fc2f01d6`(D 轮终审基线)。E 轮实际长出 E5 修复批 + E6 收尾——F 轮计划需预留同类弹性。
