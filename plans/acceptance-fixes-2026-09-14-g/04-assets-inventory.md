# 批次 G4：assets + inventory 两域整模块移植

> 隶属 [PLAN.md](PLAN.md)。前置：G2（壳层机制已固化；与 G3 无依赖可并行准备，但顺序执行保提交链干净）。按 G2 模板铺量。

## 移植清单

| 域 | 文件/行数 | collections | 路由 | 菜单挂组 |
|---|---|---|---|---|
| assets | 26 / 7,383 | hub_as_assets/assignments/maintenance | /asset-registry /assignments /asset-maintenance /asset-ledger | group_operations |
| inventory | 26 / 7,262 | hub_inv_products/warehouses/stock_moves | /inventory /products /warehouses /stock-moves /reorder /stock-by-warehouse /inventory-turnover | group_operations |

```sh
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/assets platform/nocobase-portals/demo-portal-crm/src/pages/assets
cp -R platform/nocobase-portals/demo-portal-hub/src/pages/inventory platform/nocobase-portals/demo-portal-crm/src/pages/inventory
```

## 域特定改动点

1. **路由聚合**：CRM [`src/routes.tsx`](../../platform/nocobase-portals/demo-portal-crm/src/routes.tsx) 追加 `...assetsModule.routes, ...inventoryModule.routes`；
2. **挂组**：`resourceGroupParent` 追加（Hub [:93-100](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:93)）：`hub_as_assets/hub_as_assignments/hub_as_maintenance`、`hub_inv_products/hub_inv_warehouses/hub_inv_stock_moves`、`inventory-dashboard`、`inv-reorder` 全挂 group_operations；**`priorityOverride`**（Hub [:134-140](../../platform/nocobase-portals/demo-portal-hub/src/app/extensions.tsx:134)）本批启用：`hub_po_*` 留 G5，`hub_as_assets:30/assignments:31/maintenance:32` 抄入（operations 组内三域交错的顺序修正——inventory 10 段、assets 30 段）；
3. **locale**：并入两域 locale.ts 对；
4. **状态机**：assets 领用/退还（assignments/transitions.ts 随域拷贝）；inventory stock_moves 出入库动作实测覆盖。

## 验收断言（证据落 `examples/kb-agent/demos/acceptance-g4/`）

1. assets 四页实测：/asset-registry（含 KPI）、/assignments（领用一条资产 → 状态机流转 → 退还）、/asset-maintenance（维保记录新建）、/asset-ledger（折旧账面渲染）；
2. inventory 七页实测：/inventory dashboard（674 行图表页）、/products、/warehouses、/stock-moves（新建一笔入库 → 列表可见）、/reorder（补货建议渲染）、/stock-by-warehouse（库存矩阵）、/inventory-turnover；
3. operations 组内顺序正确（inventory 域连续、assets 域连续，无交错）——侧栏截图；
4. 悬浮球覆盖 + 深链直开抽查（/asset-ledger、/inventory-turnover）；
5. CRM/G2/G3 域零回归抽查（dashboard/deals + /tickets + /tasks 各一页）；
6. `portal tsc` EXIT=0 + deploy 双跑树哈希一致 + verify 全绿。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 库存矩阵/补货页对 hub_inv_* 演示数据的依赖（空表时图表骨架态） | 低 | F 轮种子链已回填演示数据（QUICKSTART:143「库存/销售/财务/帮助台四域表演示数据 2026-09-12 起」）；空态也有 empty-state 组件兜底（table-kit 随 G1 就位） |
| operations 组三域 priority 交错 | 低 | priorityOverride 已从 Hub 抄录；截图断言组内顺序 |

回滚：两域独立提交，revert + redeploy 即回。
