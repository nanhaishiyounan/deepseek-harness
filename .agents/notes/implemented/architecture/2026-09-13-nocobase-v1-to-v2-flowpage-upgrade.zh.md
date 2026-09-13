# Agent Note: NocoBase v1 uiSchema 页升级为 v2 flowPage（工厂复刻 + AI 挂载）

Status: implemented

[English](2026-09-13-nocobase-v1-to-v2-flowpage-upgrade.md) | 中文

## 问题

plugin-ai 的体验（悬浮球、表单内 AI 员工填充）只渲染在 v2 flowModel 页上。v1 uiSchema 页没有挂载点：ChatButton 对 v1 页返回 null，且 AIEmployeeButtonModel 不存在任何 v1 SchemaComponent。「项目管理」组以六个 v1 页交付，其用户因此看不到任何 AI 界面——第二次"没有 AI 关联"的用户反馈即来自 v1「项目」页上手工配置的新建弹窗。

## 决策

通过复刻 N17d 种子工厂升级表格页（`examples/kb-agent/scripts/nocobase-e1-pj-v2.mts`）；不扩展 vendored plugin-ai。

- **同名替换**：按 title 找到 v1 `desktopRoutes` 行，把 `{title, parentId, icon, sort, schemaUid}` 按 title 合并写入 rollback 文件（读-改-写 upsert，多批分跑互不覆盖）并在 destroy **之前**落盘，然后在同一菜单位创建 `flowPage` 行，随后保存 flowModels 树（RootPageModel → BlockGridModel → TableBlockModel → 列 → AddNewActionModel 嵌套 ChildPageModel→ChildPageTabModel→BlockGridModel→CreateFormModel→FormGridModel → RefreshActionModel）。
- **kept 需过树完整性校验**：同名 flowPage 存在还不足够——重拉 flowModels 断言该 collection 的 TableBlockModel、CreateFormModel 与 `submit-<formUid>` 仍在；任一缺失即判定截断，把全部 E1 页一次性拆回 v1 行（按 rollback 记录重建）再全量重建（逐页自愈会互相销毁对方的树，必须整批）。RouteModel 行刻意不校验：flowModels:save 对 `{use:'RouteModel'}` 载荷返回 200 但从不落库，而每个已渲染页都证明树没有它照样工作。heal 之后仍不完整的页直接抛错，不留静默空白页。
- **N17 集合之外的字段 kind**：工厂此前只生成 input/select/number。m2o 编辑态 = `RecordSelectFieldModel`（flow-engine 对全部关联接口的默认，`service-helpers.ts`），m2o 展示态 = `DisplayTextFieldModel`（field-type-resolver 的非 form 容器分支），date = `DateOnlyFieldModel`/`DisplayDateTimeFieldModel`，boolean = `CheckboxFieldModel`/`DisplayCheckboxFieldModel`（core-field-default-bindings 矩阵）。无需额外 props：`fieldSettings.init.fieldPath` 携带关联语义，其余由服务端解析。
- **m2o 展示依赖目标 collection 的 `titleField` 元数据**：`users` 自带 `titleField=nickname`（owner/assignee 单元格正常渲染），而种子创建的 hub_pj_* collections 缺该元数据，所属项目列渲染空白，直到脚本为每个 collection 补上 `titleField`（collections API 的顶层列，不是 options 键）。今后任何指向自建 collection 的 m2o 列都需要这项检查。
- **自挂提交按钮**：`FormSubmitActionModel` 通常由 n17 对顶层 CreateFormModel 的扫描补挂，但 all 链中 n17 先于 E1 脚本运行——新建的 E1 弹窗会缺提交按钮。升级脚本自行挂载（`submit-<formUid>`，与 N17 同款接线）。
- **AI 按钮零新代码**：n18 的幂等扫描自动把 `AIEmployeeButtonModel` 挂到每个顶层 CreateFormModel；内嵌表单 uid 由服务端生成，按钮 uid 是 `n18ai-<serverUid>`——rollback 按"form uid 不存在"判定孤儿，与 n18 自愈逻辑一致。
- **回滚**：`--rollback` 先销毁 `n17e1*` flowModels（嵌套表单与挂在其上的 n18ai- 按钮随之级联消失），再对存活列表做孤儿按钮清扫——孤儿判定必须基于**销毁后重拉**的列表（销毁前快照里 E1 按钮都指向活着的表单，恒不匹配、恒不清理），最后按记录重建 v1 行并指向原 schemaUid。`desktopRoutes:destroy` 不级联 uiSchemas（实测：行数不变），v1 树以不渲染的孤儿形态存活，回滚连用户手配弹窗一并恢复。
- **标题字段必填**：三页新建弹窗的名称字段（name/title）在 FormItemModel props 上带 `required: true`（flow-engine `required` step 的同款落点），formily 在浏览器侧拦截空提交（零请求发出）；已升级页由幂等 sweep 补挂——flowModels:save 是合并写，字段绑定与其余 props 不丢。
- **列表全量护栏**：flowModels/desktopRoutes 的 list 调用校验 `meta.total ≤ 返回行数`，超出即抛错（截断列表会让 kept 校验与孤儿清扫静默漏行）。
- **已知边界**：看板/日历/甘特保持 v1——2.2.6 flowModel 目录没有对应视图的区块模型，强行升级会丢视图能力。v1 视图页无悬浮球（plugin-ai 客户端硬编码）。

## 备选方案

**在 v1 页上经 UI 编辑器手工配置 AI 组件。** 否决：plugin-ai 未注册任何 v1 SchemaComponent/Initializer，v1 树上无物可拖；自行添加等于修改 vendored 插件。

**用 RecordPickerFieldModel 替代 RecordSelectFieldModel。** 本界面否决：resolver 对 form 容器内 text 型关联的默认是 RecordSelect（下拉），正是"从列表选负责人"所要的；picker 形态是弹窗选择器。

**推迟 date/boolean kind。** 保留：两个编辑模型都在核心绑定矩阵中且一次保存即渲染成功；砍掉它们会交付比被替换的 v1 弹窗更窄的表单。

## 结果

- 三个表格页（项目/任务列表/里程碑）带悬浮球、十/八/五字段新建弹窗（m2o 下拉列出九位 AI 员工用户、日期选择器、枚举下拉）、提交按钮与显示关联记录名的表格列（`demos/acceptance-e1/`：8 张截图 + 探查笔记 + pg_dump + rollback 记录）。
- all 链断言十一个 v2 flowPage 与十一个 `n18ai-` 按钮；`nocobase-hub-modules.mts` 对 flowPage 持有的 title 跳过 block 重放，其重跑对已升级页保持 no-op。
- 未来的页面升级（如看板区块模型落地后的 v2 化）复用该工厂：扩展 kind 映射、保持同名幂等、确保目标 titleField，再让 n18 挂按钮。
