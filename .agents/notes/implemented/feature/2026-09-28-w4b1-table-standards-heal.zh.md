# W4-B1 表格标准全域 heal —— 工厂五函数与 78 页清扫

[English](2026-09-28-w4b1-table-standards-heal.md) | 中文

- 日期：2026-09-28
- 状态：已实施
- 范围：`examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（W4-B1 段）、`examples/kb-agent/scripts/w4-heal-b1.mts`、`research/2026-09-28-w4-completeness/.audit-analyze.mjs`、`setup-nocobase.mts` verify

## 决策

平台级表格标准（默认排序 / 页面级筛选 / 金额与日期格式 / 关联列 titleField / 状态色标）通过 flow-page-lib 五工厂 + 一个清扫脚本落地，不重造页面：

- `applyTableDefaultSort` 把排序写入**三处**：`props.globalSort`（表格交互回读的键）、`resourceSettings.init.params.sort`（服务端语义标记）、排序列的 `sorter`/`defaultSortOrder`（可见列头箭头）。v2 客户端从不把持久化排序应用到首次列表请求——live 实测三处都不会到达首个 `:list` 查询，官方 Default sorting 配置面板同况。三重写是兼容性上限；首页排序保持平台默认直到用户交互。
- `ensureFilterForm` 走 `flowSurfaces:addBlock 'filterForm'`，字段列表**随 addBlock 载荷**（对象形式携带 `defaultTargetUid`）。事后逐字段 `addField` 会同时复制字段项与 `filterManager` 连接——pilot 页实测。关联筛选字段需要 `defaults.collections.<target>.fieldGroups` **全覆盖**目标集合的非关联字段；部分清单被拒。
- `rebindColumnTitleField`/`enumizeColumn`（经 `rebuildColumnField`）先销毁旧 field 子节点、再保存替代节点、再经 `updateSettings` 重写列元数据。销毁步骤使换绑幂等——缺了它每次重跑都会在列下再堆一个 field 子模型。列 props（width/fixed/sorter）从不触碰，换绑不可能丢它们。
- `applyColumnDisplayProps` 与排序写入走 `flowModels:save` 并先读回合写，因为 `updateSettings` 的 props 域拒绝渲染键（`globalSort`、`format`、`separator`）。

## heal 固化的坑

- REST 直连的 `updateSettings` 载荷不包 `{values}`（`{target, props}` 直接传）；`flowSurfaces:get` 只接受 `GET ?uid=`。
- 标识符列（`id`、`*_id`、FK 整数）排除在数字格式化外——千分位 id 列语义错误；审计探针与 `--assert` 同步排除。
- 枚举 options：平台色板覆盖的值强制中文 label（维保英文残留由此中文化）；未知值保留原 label。
- `rollback --domain X` 必须把**每种** journal 条目都按所选页过滤。第一版只过滤了 `tableSort`；回滚单域把全域的 field props 与列换绑一并回退。缺失键用 `null` 清除会让枚举渲染崩溃（解构默认不吸收 null）——数组值键清成 `[]`。
- `fields:list` 的扁平行带 `collectionName`（最初的怀疑是错的）；本部署的 `/api/collectionFields:list` 是 404。

## 验收

`w4-heal-b1.mts --assert` 在 78 页/101 表的审计口径上 live 复算五类缺陷计数并 fail closed；`setup-nocobase.mts verify` spawn 该断言。存档探针（`.audit-fetch.mjs` + `.audit-analyze.mjs`）同语义：筛选 = FilterActionModel **或** 存活 `filterManager` 连接，排序优先读 `globalSort`，金额/日期/关联/状态计数同上。Before → after：无排序页 78→0，无筛选页 37→0（FilterFormBlockModel 0→38），金额未格式化 151→0（排除 6 个标识符列后计 145），日期未格式化 →0，关联列未绑 titleField 101→0，状态裸文本列 14→0，枚举列缺色 2→0。

## 已知缺口

h5 建的 WMS 页（库存查询/盘点管理）只渲染操作列头；列模型完好，同样的 heal 形态在 n17/w3 页渲染正常。把一个换绑列还原并未让表头回来，该缺口早于 heal 或与其正交——留给 B2 随表单侧一遍检查。
