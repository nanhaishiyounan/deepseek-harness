# Agent Note: Five-systems factory pattern — SRM + WMS closed loops

Status: implemented

[English](2026-09-15-five-systems-factory-srm-wms.md) | 中文

## 问题

五大企业系统（CRM ERP / MES / WMS / PLM / SRM）此前只是路线图诉求：「不是有个菜单就可以了」——每个域都要在 NocoBase admin（v2 flowPage 形态、可 UI 配置）上跑出真实闭环，而非菜单壳。H 轮交付地基加上游依赖最少的头两个闭环：SRM（零自定义区块）与 WMS（一个自定义区块——库位图）。

## 决策

每个域一个工厂脚本，走已验证的 E1/F1/F4 通道，uid 前缀 `h4srm*`/`h5wms*`，一切按业务键幂等：

- **地基** —— `hub_inv_products` 增加五个可空食品列（保质期/温层/储存条件/GB2760 分类/致敏原）并以空值守卫回填；存量行的键是真实 `SKU-FZ-0001` 风格编码，不是显示名猜测。
- **SRM（6 表 8 页）** —— 供应商三套分级（监管风险/审核评级/IQC 严格度）拆为独立字段；准入工作流是双人工链（资质审核→分支→现场审核评级→分支→update 合格/已拒绝），低于 60 分的评分卡触发自动整改 `create` 节点。种子先于工作流落库，首跑不产生审批任务；脚本对重复创建的工作流与图表自愈。
- **WMS（9 表 9 页）** —— 批次带食品四日期模型（生产/过期/应下架/预警）与供应商追溯锚；库存是 UNIQUE SKU×库位×批次×状态 余额外加 `version` 列；流水 append-only。单据过账是脚本侧引擎（非工作流），因为 workflow 的 update 节点做不了四数量的读-改-写算术：`--post-shipment/--post-receipt` 经版本校验的过滤 update 施加增量（版本过期时命中零行、fail loud——已实测），追加流水行并单次翻单据状态。`--fefo` 按应下架日升序分配。期初对齐为每个 (物料, 批次) 补一条 ADJUST 流水，使库存==Σ流水 自种子出生即成立并持续保持。
- **库位图（A 路区块）** —— 探针裁决：完全可行。runjs 白名单会拒绝 JSBlock 内的 `ctx.api.resource(...).list` 并给出精确修复提示；受认可词汇是 `ctx.makeResource('MultiRecordResource')` + `setResourceName/setFilter/setPageSize/refresh/getData`，`ctx.render` 保持顶层。72 库位四状态网格带悬停摘要从真实数据渲染。

verify 门禁随批扩容：missingV2H4/H5 标题清单、供应链/仓储管理组探针、srm_/wms_ 行数下限、食品列探针、JSBlockModel 存在性、n18ai- 下限 25→33→42；all 链在 n18 之前重放两个脚本。

## 备选方案

**工作流驱动过账。** 「更新库存+写流水」两节点工作流算不出 `on_hand + delta`（update 节点无读-改-写）；为此铺 calculation 节点链会把流水完整性交给变量模板。脚本引擎把算术收在一个可测试的位置；盘点工作流（差异→manual→done）覆盖工作流擅长的审批面。

**库位图回退 GridCard。** 作为 B 路保留；探针证实 A 路完全可行，回退未启用。I/J 轮区块（PLM BOM 树）的记录候选仍是 TreeBlockModel。

**入库/出库子表单据。** 头-行子集合会为无演示价值地多出两张表；行级平表+表头字段重复承载同一语义。

**用户点名的对账/寻源比价表。** R9 报告的 MVP 裁剪明确延后对账匹配与多轮寻源；H4 六表遵循该裁剪（换成证照/检查表/审核记录），这正是预警分组、雷达图与 CAPA 验收实际依赖的面。

## Consequences

五系统中两个在 admin 上拥有真实闭环（SRM 准入→审核→整改、WMS 收货→上架→FEFO→过账→盘点），带 verify 强制的行数下限；JSBlock 探针裁决为 I/J 轮自定义区块解锁 A 路。过账正确性收敛在单一引擎内并以实测乐观锁护栏，stock==Σmovements 是被断言的不变量而非假设。其余系统在其轮次落地前不出现菜单。
