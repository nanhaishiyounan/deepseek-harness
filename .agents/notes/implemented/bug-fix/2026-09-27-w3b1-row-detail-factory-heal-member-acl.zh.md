# Agent Note：W3-B1 行详情工厂、95 块 heal 与 member view ACL 字段清单陷阱

Status: implemented

[English](2026-09-27-w3b1-row-detail-factory-heal-member-acl.md) | 中文

## 问题

用户反馈「表格里的主体，点击详情没有任何显示？？？？？」——这是要实际交付使用的系统，不是演示。P0 取证报告（research/2026-09-27-w3-usability/01-p0-row-detail-diagnosis.md）实锤三层根因：① 13 个 v2 工厂脚本同构复制 E1 表格模板，action 栏只有 AddNew+Refresh——95 个表格块中 94 块零行操作，波及 80 页中的 78 页；② 唯一手工补建的操作列（项目页）携带指针化的 ViewActionModel（`subModels: {}`、openView 缺 `mode`/`pageModelClass`/`filterByTk`），drawer 打开即空壳，h4srm 整改跟踪与 w8qm 处置看板两个卡片 drawer 无持久化 page 子树（204）；③ member 的 `view:own` 策略让真实操作者连修好的行操作都不可见。

## 决策

**行详情走共享工厂扩展，不迁移 authoring 通道（D1）。** `nocobase-flow-page-lib.mts` 新增 `drawerPageTreeFor`（f1 生产实证 drawer 模板参数化：ChildPageModel → ChildPageTabModel → BlockGridModel → DetailsBlockModel → DetailsGridModel → DetailsItemModel×N → 逐字段 display 模型）、`rowDetailOpenView`（六键全量 openView，含 `filterByTk: '{{ctx.record.id}}'`）、`saveRowViewAction`、`ensureTableRowDetail`（尾部 TableActionsColumnModel + view action + 持久化 drawer 子树）。flowSurfaces authoring 通道建表时确实会自动补操作列，但迁移 13 个脚本等于重写每个页面的通道——双通道漂移风险大于收益。14 个工厂脚本（e1/f2/f3/h4/h5/n13/n17/w1/w3/w5/w6/w7/w8/w9）在每个新表格上调用工厂（h4/w8 看板分支同时持久化卡片 drawer 子树），页面重建不可能再交付无操作列表格。

**load-only 契约是三层，作为一个整体断言（D2）。** 可用的行 drawer 需要 action 节点、全量 openView、持久化 page 子树三层齐备；缺任一层即复现空壳 drawer（客户端不会为 record 级 drawer 合成默认页）。`w3-heal-row-details.mts` 按此契约 heal：对每个 TableBlockModel，把表格自身的列镜像为 drawer 字段（同 fieldPath、同 display 模型、同枚举 options）；对已有但断链的操作（项目页）destroy 后重写；看板/日历卡片 drawer 按持久化层逐层下钻（卡片 item → grid layout rows → 逐 item field）补子树；幂等（健康操作列保留，二跑计划零变更）。所有新建节点带 `w3b1` uid 前缀——`--rollback w3b1` 先子后父销毁试点 38 行、探针回到 P0 基线后才全量执行。

**member view ACL 必须用显式全字段清单——`fields:null` 是服务端/客户端语义分裂（本批现场发现）。** 用 `rolesResources:create` 给 member 授 `view/list/get` 时 actions 落库为 `fields: []`——空白名单把业务列全部裁掉（drawer 只剩行 id）。把 `fields` 置 `null` 后服务端返回全行——API 层看似修复——但客户端渲染器读 `roles:check` 快照，把 `fields: null` 当「无字段权限」，静默跳过 DetailsBlock：数据在流动、HTTP 零报错，drawer 仍然空白。只有显式逐集合字段清单（从 `fields:list` 取）双侧通行。ACL 重载挂在 `rolesResourcesActions:update` 的 `afterUpdateWithAssociations` 钩子上，裸 SQL 修复对运行中进程永远不生效。member 的 strategy 按计划预授权的 fallback 升级为 `view:own → view`（操作者必须能看到业务行；未授予任何写动作——审批写路径仍走引擎 root-token 动词）。

## 后果

全部表格块有行详情（95/95 操作列、95 个 view action、drawer 子树缺失 0、AddNew 弹窗 100% 在线），三处断链消失（项目页 view drawer 渲染 10 字段；两个看板卡片 drawer 均渲染），member 用户打开与 admin 相同的 drawer（quality_lead：PO-2026-0001 与 QI-2026-0001 渲染内容与 admin 一致，翻转 P0 §1.4 的零可见基线）。`setup-nocobase.mts verify` 断言该契约（操作列覆盖、全部 view/卡片 action 的 drawer 子树探针、member 授权 ≥70 行、member action 行必须带显式字段清单），未来工厂或 heal 回归会响亮失败。`heal` 重跑会为新增字段的集合修复清单，兼作 ACL 刷新路径。

## 备选方案

- **把 13 个脚本迁移到 flowSurfaces authoring 通道**（自动补操作列）——重写每个页面的 authoring 路径并留下两个漂移通道；共享工厂保留所有脚本已共用的同一模板。
- **78 页逐页手工补**——13 个同构工厂必然漂移；heal 按契约扫描而非按页面清单。
- **member 保持 `view:own` 只授 action**——计划自身的警告：admin 修好、member 依旧盲；预授权的 strategy 升级加显式字段清单才是完整修复。
- **裸 SQL 修字段白名单**——内存 ACL 不可见；API touch 是唯一热重载路径。

## 验证

dry-run 计划（95 wire + 2 卡片 drawer，`w3-b1-heal-dryrun.txt`）→ 采购订单试点 heal → 实开 drawer（PO-2026-0001，8 字段节点，`w3-b1-pilot-po-drawer.png`）→ 回滚演练（38 行销毁、探针回基线，`w3-b1-rollback-drill.txt`）→ 全量 heal + 探针（`w3-b1-heal-run.txt`：TableActionsColumnModel 95、viewAction page 缺失 0、addNew 缺失 0）→ 幂等二跑（0 变更）→ 五域 drawer 旅程（采购/生产/质量/仓储/销售 + 项目修复，`w3-b1-{pur,mfg,qm,wms,so,pj}-*-drawer.png`）→ 看板卡片 drawer（`w3-b1-kanban-{srm,qm}-*.png`）→ member 视角翻转（quality_lead 开 pur_orders 与 qm_inspections，`w3-b1-member-*.png`）→ psql 行级对拍（`w3-b1-psql.txt`）→ 13 字段 MO 页 drawer 单独耗时 786ms（`w3-b1-perf-mo-drawer.txt`）→ `setup-nocobase.mts verify` 含新断言 OK → 9 步链 s1/s2/s9 PASS + `--assert-ledger` 平衡；16 个改动脚本 esbuild 语法检查全绿。
