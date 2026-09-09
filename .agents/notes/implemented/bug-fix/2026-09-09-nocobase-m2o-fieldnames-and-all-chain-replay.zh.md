# Agent Note：NocoBase m2o 列 N/A——根因是 fieldNames 而非 appends；一键链全量重放

Status: implemented

[English](2026-09-09-nocobase-m2o-fieldnames-and-all-chain-replay.md) | 中文

## 问题

N13/N14 批次留下三个尾巴，阻碍"reset 后单跑 `all`"的承诺：AI 工作台页面与 30/20/40/24 扩容数据只能靠手动重放脚本；CRM 报价单页所有 m2o 列显示 N/A；实验期的 flowModels 活过了已删除的测试页。N14 曾把 N/A 定性为"列表行未带 appends"——该定位是错的，而错误的根因正是值得记录的部分。

## 决策

### m2o 单元格读的是 `fieldNames.label`，不是展开对象的键

浏览器抓包证明 v1 表格请求本来就带 `appends[]=customer&appends[]=deal`（v1 `BlockProvider` 按区块 schema 自动计算关联 appends），响应行也带完整展开的关联对象。N/A 出在渲染层：`AssociationField` 的 `useFieldNames` 默认 `{ label: 'label' }`，展开对象没有 `label` 键，于是 `InternalViewer` 渲染 `toValue(undefined, 'N/A')`。系统字段给出了正确写法——`users.mainDepartment` 带 `x-component-props: { multiple: false, fieldNames: { label: 'title', value: 'id' } }`。

对每个 REST 创建的 belongsTo 字段的结论：uiSchema 必须写明目标的显示列。两个模块脚本的 `belongsTo()` 工厂现在写 `fieldNames: { label: 'name', value: 'id' }`，`ensureAssociationFieldNames` 通过 `fields:update` 回填存量字段（该动作深合并 uiSchema）——步骤幂等，同时兼任修复通道。`stepVerify` 断言 `crm_quotes` 两个 m2o 字段带 `fieldNames.label`，使从零重放的库无法静默回退。

### `all` 拥有整条重放链；verify 锚定它

`all` 链现在重放 `nocobase-n13-rebuild.mts`（默认模式：工作台 ensure + 孤儿清理）、`nocobase-n13-seed.mts`（补到行数下限）、`nocobase-n14-fix.mts`（tabs 保底；模块脚本建页时已同步建 tabs 子行，此步为 no-op 安全网）。verify 新增被清库会静默丢失的锚点：AI 工作台 flowPage 路由存在、四张扩容表达到下限（30/20/40/24）、上述 m2o fieldNames 检查。reset 后单跑一次 `all` 即得完整系统，零手动脚本。

### 实验残留按属主删除；列创建对齐官方双写形态

N13 登记的实验列（`n13wkcol1-3`）已在 N14 经 UI 编辑器重建；真正幸存的残留是已删测试页的孤儿 flowModels。`nocobase-n13-rebuild.mts` 现在每次运行删净这一族（`flowModels:destroy` 级联子树，一次调用清掉表 + 列；不存在的 uid 跳过）。新建工作台列按编辑器自身的形态保存——`TableColumnModel` 加 subKey `field` 的 `Display*FieldModel` 子模型，两边 props 都带 enum `options`——重放页面与手配页面同构，不再依赖渲染器对缺失子模型的兜底。

### string 列喂对象会被字符串化

`hub_tk_tickets.customer` 是普通 input string 字段；旧的扩容工厂 post 了 `customer: { id }`，Sequelize 把 20 行写成了 `[object Object]`。工厂现在传公司名，`repairTicketsCustomer` 按 title 前缀重写带标记的行（公司词汇表不含连字符，`title.split('-')[0]` 即精确值）。

## 考虑过的替代方案

**给列表请求补显式 appends。** 请求本来就带；往表格区块 schema 的 `params.appends` 里加只会重复客户端已计算的内容，可见效果为零。

**删除重建 m2o 字段。** `fields:update` 深合并 uiSchema 且不动列与已播种的外键；重建要拆装关联，无收益。

**tabs 保底不进链。** 模块脚本建页时已接 tabs；保底只花一次幂等遍历，并覆盖未来任何按旧路径建页的代码。

## 后果

报价单页显示客户与订单名（全表零 N/A），重放链端到端一条命令，fieldNames 要求从口头经验变成工厂里的代码——与此前笔记记录的 select-interface、列名规则同类。批次证据与截图：[01-batches.md N16](../../../../plans/nocobase-full-features/01-batches.md) · 交接 [handoff-2026-09-08.zh.md](../../../../plans/handoff-2026-09-08.zh.md)。
