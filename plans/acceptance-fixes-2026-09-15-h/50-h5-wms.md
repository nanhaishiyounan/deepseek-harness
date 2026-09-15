# 批次 H5：WMS 完整闭环 + 库位图自定义区块探针

> 隶属 [PLAN.md](PLAN.md)。主题三首期第二腿。前置：H4（地基物料字段/工厂扩容/verify 框架）。调研依据 [03](03-research-enterprise-systems.md)/[R7 报告](../../research/2026-09-14-wms-domain-model-nocobase.md)。规模：新脚本 `nocobase-h5-wms.mts`；9 新表 + ~9 v2 页 + 1 菜单组 + 1 JSBlockModel 自定义区块（A 路径探针）。

## 第 0 步（必做）

1. **JSBlockModel PoC（本批最大不确定性，先探后建）**：最小 JS 区块（读一张表渲染色块网格）走 `flowSurfaces:addBlock` 入页——验证 runjs 安全扫描约束（unknown globals 拒绝清单，[`runjs-authoring`](../../platform/nocobase/packages/plugins/@nocobase/plugin-flow-engine/src/server/flow-surfaces/runjs-authoring/index.ts)）；**PoC 结论三岔**：
   - ✅ 可行 → 库位图走 JSBlockModel（改动面 3）；
   - ⚠️ 受限可行（如禁 fetch 需走 data binding）→ 降级形态（服务端数据绑定+前端渲染）；
   - ❌ 不可行 → 回退 B 路（GridCardBlockModel 库位卡片+状态过滤组合），JS 探针结论写入 Agent Note 供 I/J 轮 PLM/MES 区块决策引用。
2. hub_inv_warehouses/products 现有数据盘点（仓库数/SKU 数/字段），`hub_inv_stock_moves` 语义与 wms_movements 流水的边界裁决：**新流水表独立**（append-only 语义不同），hub_inv 不动。
3. 复读 F1（Kanban emit）/F4（chart 通道）骨架。

## 改动面 1：WMS 数据模型（9 表，R7 报告 §实体表）

| 表 | 关键字段 | 要点 |
|---|---|---|
| `wms_zones` | 仓库 m2o（hub_inv_warehouses）/库区编码/名称/**温层**（常温/冷藏/冷冻，与物料 temp_zone 校验源） | 多级结构 1/2 级 |
| `wms_bins` | 库区 m2o/库位编码（区-排-位规则）/状态（空闲/占用/禁用/盘点冻结）/容量/当前 SKU 摘要 | 库位图数据源 |
| `wms_lots` | 物料 m2o（hub_inv_products）/批号/**效期四日期**（生产日/过期日/应下架日/预警日）/供应商 m2o（srm_suppliers，追溯锚）/状态（合格/隔离/冻结） | 批次主数据独立表 |
| `wms_stock` | **UNIQUE(SKU×库位×批次×库存状态)**/四数量（现有/已分配/锁定/可用）/乐观锁 version | 库存余额 |
| `wms_movements` | 单据类型+单据号 m2o/物料/批次/库位 from-to/数量±/**append-only 流水**（无更新无删除） | 每笔变动留痕 |
| `wms_receipts`（+行子表） | 类型（采购收货/生产入库/销售退货）/来源单号/供应商 m2o/状态（草稿→待执行→执行中→部分完成→完成/过账→关闭）/收货明细（物料/批次/数量/目标库区） | 入库 |
| `wms_shipments`（+行子表） | 类型（销售出库/生产领料/其他）/状态主链同上/**推荐批次列**（FEFO 降级：按应下架日升序提示） | 出库 |
| `wms_transfers` | 库位 from-to/原因/状态 | 移库 |
| `wms_counts`（含快照+差异） | 盘点类型（全盘/循环/抽盘）/范围（库区/库位）/状态（计划→冻结+账面快照→初盘→复盘差异→调整审批→完成）/差异行 | 冻结快照 JSON |

状态机全部选择字段+workflow（过账动作触发 stock 更新+movements 落流水——**MVP 过账实现**：workflow「更新库存+写流水」两节点；乐观锁冲突 fail loud）。

## 改动面 2：WMS 页面（~9 v2 页）

1. 菜单组「仓储管理」；
2. **库位平面图**（第 0 步 PoC 裁决的实现）：仓库→库区→库位状态色块网格（空闲/占用/禁用/冻结四色+悬停 SKU/批次摘要）——本批核心自定义视图；
3. 入库单列表/详情（收货→上架两步：收货行→推荐库区（温层匹配）→确认入库过账）；
4. 出库单列表/详情（FEFO 推荐批次列+拣货确认→过账）；
5. 库存查询（Table：SKU×库位×批次，效期列染色预警 30%/20% 双档，Filter 组合）；
6. 批次主数据列表（效期四日期+供应商追溯锚）；
7. 盘点（创建盘点→冻结→初盘录入→差异表→调整审批→完成，状态驱动页面）；
8. 移库看板/列表；
9. 库存流水（Table append-only 只读+单据反查）。
10. 种子：2 仓库×（3 库区×12 库位）=72 库位（四状态分布）、12 批次（效期覆盖正常/30 天/20% 档）、8 SKU 库存行、10 单据（各类型各状态）、30 流水行——幂等 marker。

## 改动面 3：库位图自定义区块（PoC 裁决后实施）

- **首选 A 路 JSBlockModel**：`flowSurfaces:addBlock` 通道入 SRM 之外的 WMS 页；JS 读 wms_bins（data binding 或 scoped query）渲染 CSS grid 色块；点击库位弹出 Details 联动（selected id → wms_bins:findOne）；
- runjs 约束适配：仅用白名单 globals；ECharts 级图形化不需要（CSS grid 足够 MVP）；
- **回退 B 路**：GridCardBlockModel（库位卡片墙+状态 Filter 按钮+温层分组）——功能等价降视觉。

## 验收断言（证据落 `demos/acceptance-h5/`）

1. **端到端闭环实测 9 步**（R7 MVP 剧本逐条）：采购收货（AI 头像球填充实测）→ 质检放行 → 上架（推荐库区温层匹配：冷冻 SKU 推荐冷冻区）→ 库存查询（批次效期染色）→ FEFO 拣货（推荐批次=最早应下架日）→ 出库过账（库存四数量变化+流水落库）→ 循环盘点 → 差异调整（审批流）→ 流水可查（每步截图+数量断言）；
2. **库位图**：72 库位色块网格渲染+点击联动详情+状态过滤（PoC 裁决形态 whichever）；
3. **数量一致性**：过账后 stock 现有数 = movements 累计和（psql 聚合对照证据）；乐观锁：并发冲突场景 fail loud（单测或实测）；
4. 批次追溯锚：wms_lots 供应商列指向 srm_suppliers（H4 数据联动：供应商批次→供应商主数据页可达）；
5. verify 全绿：missingV2H5 清单 + wms_* probes + n18ai- 下限（含 WMS 表单）+ H4/既有零回归；
6. 幂等：h5 脚本重放 ×2 全 kept；
7. KG 联动回归：`setup-nocobase.mts` kg_nodes 非空断言保持（kg-mappings 白名单未动——wms 表暂不入图谱，列后期轮扩展映射）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| JSBlockModel PoC 失败（runjs 扫描挡路） | 中 | 第 0 步三岔预案；B 路回退功能等价；探针结论进 Agent Note 供 I/J 轮 |
| 过账并发一致性（workflow 两节点非原子） | 中 | 乐观锁 version 校验（更新前比对，冲突 fail loud 重试提示）；单据串行过账交互约束（按钮禁用） |
| FEFO 推荐批次实现深度（纯展示 vs 自动带出） | 低 | MVP=推荐列+一键带出入参（复制到拣货行）；严格分配列后期 |
| 盘点冻结快照与并发收发的竞态 | 中 | 冻结库位禁收发（库位状态联动）；MVP 验收剧本内不构造交叉并发 |
| 9 表单批规模（历史最大） | 中 | 表/页/种子三段分提交（仍属 h5 批）；kept-spine 逐页断言 |

回滚：h5 单脚本（可三段 revert）；`--rollback` + marker 清除即回 H4 终态。
