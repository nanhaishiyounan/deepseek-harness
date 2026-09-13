# Agent Note: record 弹窗内容视图与两个 F 轮「缺陷」背后的 DOM 探针陷阱

Status: implemented

[English](2026-09-13-record-drawer-content-and-dom-probe.md) | 中文

## 问题

F 轮统一验证标记了两个运行时缺陷：看板/日历卡片 drawer 打开空白、表单 AI 按钮「未渲染」（含 shadow root 递归在内整个表单 DOM 中 `n18ai=0`）。F6 对照 vendored NocoBase 2.2.6 客户端逐项诊断：第一个是真缺陷、已修；第二个是探针假阴性，按钮实际完全可用。

## 决策

- **record 弹窗走 load、新建弹窗走 create。** 核心客户端 `FlowPage` 在视图 input 带 `filterByTk`（卡片/事件点击）时走仅加载分支（loadModel），否则走 loadOrCreateModel（Add new）。因此 record drawer 必须在 action 下持久化 page 子树（`findOne?parentId=<actionUid>&subKey=page` 可查），而 Add-new 弹窗由客户端合成默认页。在 `KanbanCardViewActionModel`/`CalendarEventViewActionModel` 下持久化 `ChildPageModel → ChildPageTabModel → BlockGridModel → DetailsBlockModel`（details fixture 双形态、layout rows 引用 DetailsItemModel uid）即完整接通 drawer；openView 的 `uid` 指向 action 自身与省略等价。
- **同集合页面需要树归属，不只是 uid 前缀。** 批次前缀（n17f2 vs E1/N17 行）排除的是同集合上**其他批次**的块，但回款与销售仪表盘同为 n17f2 且同 crm_payments——只有把块的父 grid 走到 tabs 路由行、再到 flowPage schemaUid 才能区分两者。深层弹窗节点在 list 快照中不带 parentId（树关系在闭包表），所以表单检查走本页 AddNewActionModel 的 `findOne?subKey=page`。
- **UI 探针必须匹配组件的真实渲染形态。** AIEmployeeButtonModel 渲染为提交按钮旁的裸 40px ant-avatar（无 uid、无标识 class、无 a11y role）；flowModels uid 永远不进运行时 DOM。「在 DOM 里搜 n18ai」的探针必然假阴性——按钮、点击开聊、workContext 绑定实际全部可用（已验证：对话框打开且「表单（添加）: 任务」上下文就位）。验收在服务端断言 flowModels 行，渲染层按头像形态或截图核验。

## 考虑过的替代方案

- 按 F 轮任务的出口条款把看板 drawer 降级为「卡片点击无 drawer」并不必要：探查证明 2.2.6 的形态可以程序化 wire——drawer 只缺持久化的内容子树。
- 在 n18 挂载逻辑里修「AI 按钮不渲染」无从下手：服务端树、客户端渲染、点击交互、表单上下文四环全部核验通过；要修的是探针/验收口径（setup-nocobase verify 注释 + QUICKSTART 渲染形态说明），不是挂载。
- 图表卡片标题静态注入尝试后放弃：`props.title` 与 `stepParams.cardSettings.title` 均不渲染（BlockItemCard.title 只读运行时 decoratorProps，仅 UI Editor cardSettings 面板会话态注入）；登记为 vendored 管线边界。

## 影响

- drawer 内容与其它持久化节点走同一条 flowModels:save 通道，heal/rollback 清扫（n17f1 前缀）顺带覆盖；ensureCardDrawers 按 action 幂等（已有 page 子节点则保留）。
- 完整性判定沉淀为 `nocobase-flow-page-lib.mts` 的纯函数，keyless spec（`tests/nocobase-f2-heal.spec.ts`）用行数据夹具驱动，无需服务器。
