# Agent Note：W3-B2 drawer 内嵌子表块、行操作防呆与审批跳转

Status: implemented

[English](2026-09-27-w3b2-subtable-drilldown-guarded-row-actions-approval-jump.md) | 中文

## 问题

B1 修好了「点详情有显示」，但 drawer 只是字段明细的只读清单：采购员点开采购订单看不到订单行（一个没有订单行的 PO 详情对采购员无用），BOM 看不到组件与工序，质检单看不到检验读数（P0「已按质检单过滤入口缺」未清偿），供应商档案看不到证书/审核/评分聚合。行上没有任何受控操作入口，审批中心的待办行与业务单据互相断链（待办人看不到对应单据，业务单据持有者看不到审批进度）。同时行操作不能裸给：引擎管辖对象的状态字段（doc_status/status/result 等）只允许走 wfl/引擎动词推进，UI 直改即绕过审批锚点（不变式 1）。

## 决策

**子表块 = drawer 的 BlockGrid items 里并列第二个 association 绑定的 TableBlockModel（D3），且必须整树重写落位。** 无「关联子表」专模型——官方 wire（kanban associated-records 契约实证）是子表块 `resourceSettings.init` 携带 `associationName: '<parent>.<hasMany>'` + `sourceId: '{{ctx.view.inputArgs.filterByTk}}'`（drawer 打开时的记录 id 经 view inputArgs 传播）。前提是父集合注册 hasMany 字段（`ensureParentHasMany`，fk 从子集合 belongsTo 的 `foreignKey` 动态读取，不猜列名）。**本批现场实锤的形状约束**：嵌套 `flowModels:save` 只把顶层节点落为平铺行，深层子节点（tabs/grid/columns）只存在于 findOne 的嵌套 payload——所以子表块不能作为独立行挂到 drawer 的 grid 上（grid 根本不是平铺行），唯一落位方式是 destroy 旧 ChildPageModel 后带 `children` 参数整树重写（`drawerPageTreeFor` 的 children 通道 + `subtableBlockNode`）。子表块自带操作列与行 drawer（两层钻取），嵌套节点 uid 走 w3b2 前缀便于追溯，但回滚嵌套块靠重跑 heal（前缀 destroy 够不到嵌套 JSON）。四个行级单据页（入库单/出库单/盘点管理/领料单）经 fields:list + psql 实证**没有行子集合**（receipts/counts/issues 每单号恰好 1 行）——不硬造子表，不动物理模型。

**行操作防呆 = 状态黑名单 + 场景化 Delete + 零引擎对象删除。** guarded Edit（`saveRowEditAction`：openView 五键 + EditFormModel 持久化 popup，`filterByTk: '{{ctx.view.inputArgs.filterByTk}}'` 定位记录）的字段清单从 `fields:list` 动态生成后过三重黑名单：per-collection 显式清单（pur_orders 排 doc_status/invoice_status/receiving_status/approved_by/approved_at 等 14 集合）∪ 通用状态名兜底（doc_status/status/result/*_status——未探测过的集合也安全）∪ 系统/关联字段排除。`approved_by`/`approved_at` 这类引擎回写锚点（wfl extras 的 approved_by_field 读的列）同样禁手工编辑。Delete 只配在自由态集合（任务/里程碑/知识文章/联系人/维保记录），带官方 `deleteSettings.confirm` 确认弹窗；引擎管辖单据（PO/SO/MO/质检/收发/盘点/供应商）零 Delete 入口——生命周期只能走引擎动词。

**审批跳转 = JSRecordActionModel + `clickSettings.runJs`，双向。** 待办行「前往单据」（doc_type → 页面路由映射表，APPROVAL_JUMP_ROUTES 覆盖 wfl 10 个 doc_type；hub_po_purchase_orders 故意无映射，点击 fail-loud 报「未配置跳转映射」）与业务行「审批进度」（跳审批中心，URL 带 from/doc_type/doc_id 锚点参数）。**本批最大的坑**：JS 行 action 的代码在 `stepParams.clickSettings.runJs`——`jsSettings.runJs` 是 JSBlock 块契约，写成 jsSettings 的行 action 渲染正常但点击零反应（无请求、无报错的死按钮；官方 `flowSurfaces:addRecordAction type:'js'` 生成的 wire 才是权威形状）。导航用 `window.location.href`（runjs 白名单允许 window/location），路径前缀从 `location.pathname.split('/admin/')[0]` 动态解析——:3080 网关有 /nocobase 前缀而 :13000 直开没有，写死路径必挂一头。顺手修 w1 既有 bug：待办表块的 `resourceSettings.init.filter`（status=open）从不被 runtime 重放——「我的待办」标题下混着已完成行；w9 先例的 `tableSettings.dataScope` 才是 runtime 重放的通道。

**检验读数 seed 走历史行直插，不碰状态。** qm_inspection_readings 建表以来零数据（质检旅程无可看行）。seed 只写 closed 单（QI-W2B1-B10 failed——含一条 pass=false 读数与 failed 判定自洽）与 pending 单（QI-2026-0010——已录入待判定），不触碰 status/result（不变式 1 只禁状态字段直改；读数行是既成事实的历史数据）。

**flowModels 目录涨破 6000 行——fail-closed 截断保护触发是正确行为，上调 pageSize 而非绕过。** 17 个 Edit 表单（每字段一行）+ 12 子表块 + 跳转把目录推过 6000，`listFlowModels` 的截断拒绝（heal probe）与 setup-nocobase 的 w9 快照断言（对账页四块「消失」实为截断）先后触发；两处 pageSize 上调到 12000，截断保护逻辑保留。

## 后果

8 个主集合的 drawer 成为工作台：字段明细 + 12 个子表块（订单行/申请行/邀请供应商/报价/SO 行/计划行/BOM 组件/BOM 工序/检验读数/证书/审核记录/评分卡）+ 行操作，全部与 psql 对拍一致（PO 首单订单行 1=1、BOM-0002 组件 4/工序 3、供应商#1 证书 2/审核 6/评分卡 4、QI-2026-0010 读数 2=2）。两层钻取可用（子表行再开行详情 drawer，levels=2 实测）。防呆负例全过：PO 编辑表单零状态字段（formLabels 实录：需求日期/金额/币种/比价依据/承诺到货日/订单号）、引擎集合零 Delete、自由态 Delete 有确认弹窗且取证走取消（20→20 行零破坏）。member（quality_lead）打开同内容 drawer（读数 2 行）且行操作收窄为「查看/审批进度」——编辑按钮被 ACL 滤除（member 无 update 动作授权），写路径仍全走引擎。`setup-nocobase.mts verify` 断言四组：12 association 存在、guarded Edit 树零黑名单泄漏（findOne 嵌套树递归收 FormItem fieldPath 对照）、引擎集合零 Delete、双向跳转 action 在位；探针（tableRows=99、anomalies=0、AddNew 77/77、卡片 drawer 全 present）与 9 步链 s1/s2/s8/s9、--assert-ledger（32 组平衡）零回归。

## 备选方案

- **官方 `flowSurfaces:addRecordAction` 通道建跳转**——生成的 wire 权威（本批正是靠它对照出 clickSettings 坑），但按钮标题落 `{{t("JS action")}}` 默认标签不受控；裸写 wire + 对照官方形状是可控折中。
- **子表行也配 Edit/Delete**——行级状态同样引擎管辖（检验读数的 pass 是判定输出、报价的 is_won 是授标结果）；子表只读 +钻取是正确边界。
- **给四个行级单据页造子集合**——无集合可嵌是物理事实（receipts/counts/issues 每单 1 行，psql 实证）；造集合等于改业务正确性底座，违反 PLAN「不动底座」。
- **跳转带 URL filter 参数让目标表格自动过滤到单行**——v2 表格的 URL state 支持度未证实；URL 锚点参数（from/doc_type/doc_id）已可断言落点，行级过滤留待表格 URL-state 验证后再加。

## 验证

证据归档 `research/2026-09-27-w3-usability/w3-b2-*`：旅程序列截图（pur-po 三步含两层钻取、mfg-bom2 双子表 4/3、qm-insp2 读数 2、srm-supplier 三子表 2/6/4 + 评分卡行钻取）、Edit 黑名单表单实录（w3-b2-pilot-po-4-edit-form.png + formLabels 打印）、Delete 确认弹窗 + 取消零破坏（w3-b2-delete-confirm.png）、审批跳转双向 URL 实录（w3-b2-jump-biz-to-approval / w3-b2-jump-todo-to-doc.png + BIZ-JUMP/TODO-JUMP URL 输出）、member 视角（w3-b2-member-qm-insp-drawer.png）、psql 对拍（w3-b2-psql.txt）、heal 全量日志（w3-b2-heal-run.txt：12 relation/11 drawer rewritten/17 guarded Edit/6 Delete）、verify 全绿（w3-b2-verify.txt）、wire 探针（w3-b2-probe-trees.txt）。复跑入口：`node --import tsx/esm examples/kb-agent/scripts/w3-heal-row-details.mts`（幂等；`--rollback w3b2` 销毁平铺 B2 节点后重跑可重建子表树）。
