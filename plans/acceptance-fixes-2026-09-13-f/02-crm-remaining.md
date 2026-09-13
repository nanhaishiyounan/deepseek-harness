# 批次 F2：CRM 剩余 5 页 v2 升级——工厂直配 + 仪表盘双入口裁决

> 隶属 [PLAN.md](PLAN.md)。前置：F1（复用其工厂骨架与探查结论；若 F1 未做，e1 工厂六 kind 也足以支撑本批全部页面——两者仅 rollback 记录文件与 uid 前缀不同）。改动面：新种子脚本 1 个 + all 链挂载。全部为纯表格单 collection 页，是 F 轮风险最低的铺量批。

## 范围与 spec 真源

| 页面 | collection | 行数 | 字段真源 | 备注 |
|---|---|---|---|---|
| 产品与服务（`g50posy0qxc`） | crm_products | 10 | psql `fields` 表 + v1 树（[`research/f-round-inventory/v1-pages/产品与服务.json`](../../../research/f-round-inventory/v1-pages/产品与服务.json)，含分类筛选） | v1 有分类筛选——v2 保底表格列含分类字段；FilterFormBlock 增强不阻塞（可选） |
| 回款（`ihfgg15bm8x`） | crm_payments | 10 | 同上（回款页存档） | |
| 发票（`nx1znh4rs6i`） | crm_invoices | 10 | 同上（发票页存档） | |
| 客户仪表盘（`w6nyh5dtycq`） | crm_customers | 20 | 同上（仪表盘页存档） | v1 实为单表格——升级为 v2 表格页，**双入口保留**（与「客户」v2 页并存） |
| 销售仪表盘（`x00jse3wllw`） | crm_payments | 10 | 同上 | 与「回款」同 collection——同款双入口裁决 |

**双入口裁决（已定，决策 4）**：不删菜单、不改名（尊重既有信息架构与用户习惯）；两页升级为 v2 表格页后在 QUICKSTART「九组业务菜单」节说明差异（客户仪表盘=客户域第二视角；销售仪表盘=回款数据的销售视角），F4 批再择机叠加 Chart 让「仪表盘」名副其实。若实施中发现 v1 两页有独特列集（如聚合列），spec 照抄不裁剪。

## 改动面

### 1. 新种子脚本 `examples/kb-agent/scripts/nocobase-f2-crm-v2.mts`

骨架复制 e1/f1（幂等 kept + 脊柱校验 + rollback 双保险 + list 护栏全套）：

1. **`CRM_PAGES: ReadonlyArray<V2PageSpec>`**——5 页 spec；`columns`/`formFields` 以 psql `fields` 表（collectionName in 五表）为真源，与 v1 树 `x-collection-field` 集交叉勾对（E1 字段合同同款：v1 可见字段 ⊆ spec）；kind 沿用六 kind 映射（m2o/date/boolean 已验证）；select 选项常量从 v1 树 options 或种子脚本（[`nocobase-crm-modules.mts`](../../../examples/kb-agent/scripts/nocobase-crm-modules.mts)）抄录。
2. **uid 前缀 `n17f2*` 族**；rollback 记录并入 `demos/acceptance-f/rollback-records.json`（按 title 合并，与 F1 共文件不分批覆盖——E5 读-改-写模式天然支持）。
3. **脊柱校验**：同 e1（TableBlockModel(collection) + 顶层 CreateFormModel + submit-<formUid>）。

### 2. all 链挂载 + verify 扩展

all 链 `f1-view-v2` 之后插入 `f2-crm-v2`（仍在 `n18-form-ai` 前）；verify：v2 flowPage 期望 13→18、`n18ai-` 期望同步 +5。

### 3. QUICKSTART 更新

「九组业务菜单」节的 v2 页清单从 11 扩到 16（+看板/日历/5 CRM 页）；两仪表盘差异说明落位。

## 实施步骤

1. psql 拉 5 表字段清单 → 与 v1 树交叉 → 定稿 CRM_PAGES；
2. 写脚本 + all 链 + verify；
3. 现有库跑 f2 → 跑 n18 → psql 断言（5 页 flowPage 行、`n18ai-` +5、孤儿 0）；
4. 浏览器逐页验收；截图 `demos/acceptance-f2/`；
5. 幂等二跑全 kept。

## 验收断言（真实浏览器）

1. 5 页全部 v2 渲染：表格列集 ⊇ v1 可见列；行数与 v1 一致（10/10/10/20/10）；
2. 每页悬浮球 + Add new 弹窗 AI 按钮（dex）；m2o 字段（如产品的分类、回款/发票的关联客户/订单）为关联选择器且下拉出真实关联数据；
3. 每页提交一条测试记录 → 表格行出现 → **删除该测试记录**（不留脏数据——库为真实在用数据）；
4. 双入口：CRM 客户组内「客户」与「客户仪表盘」两 v2 页并存且都可独立操作；销售流程组「回款」与「销售仪表盘」同款；
5. 回归：CRM 组既有 3 v2 页（销售线索/客户/联系人）+ 订单/报价单不回退；
6. 幂等二跑全 kept + 孤儿 0；截图 ≥6 张（5 页 v2 + 至少 1 页 Add new AI 按钮）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| v1 树有聚合/计算列（v2 无对应 display 模型） | 低 | spec 照抄物理字段；聚合列不迁移并在 QUICKSTART 记差异（以 v1 树实查为准，本计划未发现） |
| select 选项与种子常量漂移（颜色/label 不一致） | 低 | 以 v1 树 options 为准抄录；二跑断言 options 一致 |
| 双入口被用户感知为「重复」升级（E3 刚解释过 CRM/Hub 重复） | 低 | QUICKSTART 差异说明 + F4 图表化后两页定位自然分化（表格视角 vs 图表视角） |

**回滚**：`--rollback` 毁 `n17f2*` 树与 5 页 flowPage 行、按记录重建 v1 行（tabs 孤儿清理同 F1）；业务数据零触碰。
