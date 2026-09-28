# W4-B2 表单标准全域 heal —— 三工厂 + assignRules 首用 + 105 表单清扫

[English](2026-09-28-w4b2-form-standards-heal.md) | 中文

- 日期：2026-09-28
- 状态：已实现
- 范围：`examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（W4-B2 段）、`examples/kb-agent/scripts/w4-heal-b2.mts`、`examples/kb-agent/scripts/setup-nocobase.mts` verify

## 决策

平台级表单标准（两栏分节布局 / 业务键必填 / 默认值四件套 / 格式占位 / 枚举中文 / Edit-Delete 补齐）通过 flow-page-lib 三个新工厂 + 一个清扫脚本落在 105 个在线表单网格上，不重造任何页面：

- `assignFormDefaults` 把表单级默认规则写到 **FormGridModel 行**的 `stepParams.formModelSettings.assignRules` —— 即 `FormBlockModel.GRID_DELEGATED_STEP_KEYS` 回读的 grid 委托存储。`mode: 'default'` 只填空值，Edit 表单永远不会覆盖已有行值。「今天」的规则 `value` 必须是 `{{ctx.date.preset.today}}` —— 引擎的 ctx-date 契约（flow-engine `dateVariable.ts`）要求 `preset` 段；裸写 `{{ctx.date.today}}` 到处都不合法，静默解析为 undefined（规则被跳过），这正是 pilot 抓到的问题。
- `formTwoColumnLayout` 产出 GridLayoutV2 行：每节先渲染一条全宽分隔行（sizes `[24]`），再把字段两两配对成 `[12,12]` 行（落单的尾项保持 `[12]`）。表格从 `props.layout.rows` 渲染，FormItemModel 行本身不动 —— 字段重排（F-8'）只动布局。配置模板与不足 4 字段的表单保持单栏（豁免 21 个网格：12 个配置集合 + 9 个小表单）。
- `formItemExtras` 产出 `props.required` **外加** `props.rules[{required,message}]` —— 只打标记挡不住提交，rules 条目才是 antd 校验器读的（actions/required.tsx 语义）。必填标记永远不会卡 9 步链：链上脚本直走 REST `:create/:update`，从不打开 UI 表单。
- 分节标题必须**同时**持久化在 `props.label` 与 `stepParams.markdownItemSetting.title.label`：运行时会把 title 步骤的 `'{{t("Text")}}'` 默认值物化到裸 props.label 之上，只写 props 会让每节都渲染成「文本」。
- 页面构建期就没带 `FormSubmitActionModel` 的 Create 表单（83 个中的 30 个，含 w3pur 采购订单弹窗）补上（`w4b2fs` 前缀）：没有提交按钮的表单根本没有 F-10' 的负例通道。
- D5 的 Edit/Delete 白名单按**引擎注册表**驱动而非前缀驱动：`hub_*`/`crm_*`（减去只读档案 `hub_po_suppliers`）加上 `wfl_flow_configs` 未管辖的五个 srm 辅助集合（证照 / 审核检查表 / 绩效评分卡 / 审核记录 / CAPA）。引擎管辖的单据域保持 W3-B2 的受控 Edit，且永不新增 Delete。

## 坑（heal 已固化）

- 平铺的 `flowModels:list` 对表单子树**不带父边**：FormItemModel 行的 parentId 全为空，字段子模型平铺层面无法关联。表单遍历一律经 `flowSurfaces:get` 的嵌套 `layout.rows[].cells[].items[]` 引用解析；每个节点写入都是读-合-存（`mergeNodeProps`），不丢任何兄弟 prop 键。
- `flowModels:save` 会把嵌入的 `subModels` 子节点**同时持久化为平铺行** —— B2 Edit 动作保存的 36 个编辑弹窗网格成了可计数的平铺 FormGridModel 行（grids 105→141），审计探针随后把它们当普通表单 heal（下一轮收敛到同一分节布局；清扫从第二轮起幂等）。
- antd DatePicker 把选中值渲染进只读 input 的 `value` 属性，绝不进 `textContent`；而页面的 B1 FilterForm 也是 `<form>` —— 弹窗表单审计必须限定在可见 drawer/modal 层内，否则量到的是筛选表单。
- member pilot 段：qc_inspector 对 srm_suppliers 没有建权限，「添加」按钮隐藏是 W3-B5 的 ACL 正确围栏而非缺陷；member 的深度验证走 member 可建页面（hub_pj_tasks）。
- B1 遗留（h5 WMS 两页只渲染操作列头）是**客户端长会话模块缓存**，不是数据问题：所有服务端通道（flowModels 行、flowSurfaces:get、浏览器实际请求的 findOne URL）返回的列全部完好，整树重写无效，全新浏览器上下文渲染出全部列。硬刷新 / 重新登录即恢复；flowModels 层无需修复。

## 验收

`w4-heal-b2.mts --assert` 在线复算五项指标并 fail-closed；`setup-nocobase.mts verify` 在 w4b1 断言之后拉起它。Before → after：合格表单单列 105→0（豁免 21：12 配置 + 9 小表单）、必填字段 128→318（目标 260；srm_suppliers 8、mfg_orders 6、crm_customers 5、hub_hr_employees 5）、placeholder 0→307（目标 200）、assignRules 网格 0→64（目标 60）、带 Edit 的页面 18→49（目标 44；B2 新增 31 页 + 引擎页保持 W3 受控 Edit）、引擎域 UI 开口 0。B1 全指标零漂移（排序/筛选/金额/日期/titleField/状态全为 0 缺陷），ledger 平衡，`.trees.mjs` anomalies=0 且 AddNew 子树 100% 在线，b9-chain s9 留痕 + movements 勾稽绿，`verify` 全绿。证据：`research/2026-09-28-w4-completeness/w4-b2-*`（pilot txt+8 png、journey txt+7 png、回滚演练、probe-after json、heal 日志）。
