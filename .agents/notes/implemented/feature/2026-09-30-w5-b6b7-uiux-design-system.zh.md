# Agent Note: W5-B6+B7 UIUX 设计系统落地 + 单据详情页模式

Status: implemented

[English](2026-09-30-w5-b6b7-uiux-design-system.md) | 中文

- Date: 2026-09-30
- Status: implemented
- Scope: `examples/kb-agent/scripts/w5b6-theme.mts`、`examples/kb-agent/scripts/w5b6-heal.mts`、`examples/kb-agent/scripts/w5b7-detail.mts`（新增）、`examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（W5-B7 工厂）、`examples/kb-agent/scripts/w5b4-autoflow.mts`（一行 assert 修复）

## Problem

用户判定「uiux太难看」。W5 调研（research/2026-09-29-mfg-erp-mes-uiux/report.md）把根因诊断为设计系统缺失：无状态语义色板、无列表页版式纪律、无单据详情结构。NocoBase 主题编辑器具备 antd5 token 面，但从未配置；W4-B1 的色板早于调研（执行完成与审批绿同色）；详情抽屉是单列字段堆叠加 W3-B2 子表。

## Decision

**设计系统落在数据里，由三个幂等 heal 脚本（带 journal 回滚）应用——平台代码零改动。**

- **主题（B6-1）**：一行 `themeConfig`（uid `mfg-standard`，default）承载调研 §4.1 token 映射（品牌 `#1677FF`、圆角 6、fontSize 14、深藏青 `colorBgSider`）与 `token.globalStyle` CSS（九态色板 `--w5-status-*` 变量、表格 `tabular-nums`、抽屉内 Tag 按 Fiori 对象页规则放大一档）。四个内置主题保持用户可选；原默认（Compact）同次写入降级。`InitializeTheme` 对无自选主题的用户应用 `find(item => item.default)`，一行落库即全控制台换装。
- **色板 v2（B6-2）**：`STATUS_PALETTE`（w5b6-heal.mts）是唯一定义点。antd preset 色名渲染调研的精确前景/背景对（`green` → #389E0D/#F6FFED 等），保住 WCAG AA 与文字+颜色双编码。相对 W4-B1 的 v2 修正：`completed`/`done` green→**cyan**（执行完成 ≠ 审批绿）、`in_progress` orange→**blue**，并补财务（`partial`/`paid`/`overdue`）、转单（`converted`/`dismissed`）、质量（`hold`）值。recolor 批次把全部 `DisplayEnumFieldModel` options 对齐 v2（132 列，mismatch 0）。
- **列表三段式（B6-3）**：`TableColumnModel.props.align` 经 `getColumnProps()` 直透 antd 列——金额/数字/日期列 `align: 'right'`（144 + 61），enum 列 `align: 'left'`。每个 FilterForm 挂 `FilterFormCollapseActionModel`（`collapseSettings.defaultCollapsed: true`——36/36），即平台原生的筛选收起。
- **单据详情（B7）**：共享库的 `documentDetailPageTree` 把七个核心集合（11 个抽屉）的 w3b1 行详情替换为三 ChildPage tab——单据明细（按集合优先序重排的两列关键事实；字段先经活体字段注册表过滤，W3-B1 的陈旧占位字段随之剔除）、审批记录（时间线）、关联单据（面板）。W3-B2 子表钻取块从旧抽屉原样抽出再入座（`childrenOfDrawerTree`）——setup-verify 断言其存在，首个未带子表的 heal 轮次在该腿失败。
- **时间线数据通道（B7-2）**：两条平台路径经活体探测后否决——`resourceSettings.init.params.filter` 到不了首屏 `:list` 请求（与 W4 的 sort 缺口同源），`stepParams.dataScope` 可持久化但 handler 挂载期不回放。可用通道是 W3-B2 验证过的那条：按 doc_type 建 PG 视图（`wfl_records_<docType> AS SELECT * FROM wfl_approval_records WHERE doc_type=…`，GRANT 应用库用户，注册为 NocoBase view collection + 14 字段）+ 父集合 `hasMany approvalRecords (foreignKey=doc_id)` + 块的 `associationName`/`sourceId('{{ctx.view.inputArgs.filterByTk}}')`。视图内的 doc_type 钉死使裸 doc_id 外键无歧义。列含 from_anchor/to_anchor（会签扇出、回退轨迹）与动作 Tag options。
- **关联面板（B7-3）**：按集合的下游 o2m 业务组走 `ensureParentHasMany`（pur_orders→receipts、pur_requests→rfqs、pur_rfqs→quotes+orders、so_orders→payments），每块是带行钻取的 association 表格。上游 belongsTo 留在明细字段（RFQ 号、PR 链）——ERPNext 式上游列表需独立通道，记 B8。

## Alternatives rejected

- antd Tag 自定义 hex——preset 色名已渲染调研精确色对且为浅底；hex 模式翻转为实底白字。
- 直挂 `wfl_approval_records` 的 hasMany——doc_id 跨 doc_type 多态；不同类型共享同一数字 id 会串单。
- dataScope step 参数——可持久化但不回放（活体探测；设置对话框仅在保存时执行 handler）。
- 整表视图 + 表单筛选——时间线必须在抽屉内按记录圈定，不依赖用户交互。

## Consequences

- heal 后全绿：`w5b6-theme --assert`（主题行 + token + globalStyle）、`w5b6-heal --assert`（色板/对齐/收起计数）、`w5b7-detail --assert`（三 tab + 时间线 association + 各集合关联面板，psql 样本对拍）、`w4-heal-b1 --assert`（五缺陷计数保持归零）、`approval-engine --selftest`、`w5b2 --migrate`、`w5b3/4/5 --assert`、`setup-nocobase.mts verify` 全链。
- 回滚演练：w5b6-heal `--rollback --pilot` 红→re-heal 绿；w5b7 `--rollback` 快照重放在时间线通道迭代中演练两次。
- 证据：`demos/acceptance-w5/b6-01..06`（六域列表页）与 `b7-01..03`（PO 抽屉头部/时间线/关联）；PO-2026-0003 时间线行与 psql 完全一致（3 条，含超额加签）；关联面板显示链上两张收货单。
- w5b4-autoflow.mts 的 BP-07 assert 消息里有存量 `prBefore is not defined` ReferenceError（4b3d549838 引入）——本批改为 PR id；该腿现在跑到「全部断言通过」。
- B7 首轮 apply 丢了 W3-B2 子表（verify 五集合子表腿失败）——children 迁移已并入 `documentDetailPageTree`；重 apply 恢复（subtables=1×5、2×1）。
- 长寿命 dev 会话浏览器的统计卡显示「请配置图表」占位；全新 headless 会话渲染真实数据——已知 dev tree-cache 状态（交接遗留 #3 族），非本批回归。
- `crm_payments` 结构上带时间线 tab 但无 wfl doc_type；付款流出现前其时间线是诚实的空表（B8 候选）。
