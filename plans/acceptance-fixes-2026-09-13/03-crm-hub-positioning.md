# 批次 E3：CRM 与 Hub 的关系说明——定位叙事 + 应用中心卡片文案对齐（不删除、不打通）

> 隶属 [PLAN.md](PLAN.md)。前置：建议在 E2 后（QUICKSTART 同文件串行编辑）。改动面：QUICKSTART 双语 + [`nocobase-n17-alignment.mts`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts) 卡片段幂等 update。**零 portal 源码改动、零数据面改动**。

## 盘点结论（裁决依据，全部实证）

1. **两 Portal = 官方双 demo 模板镜像**（[replication 调研:154-169](../../research/2026-09-09-nocobase-official-demo-replication.md:154)）：CRM = demo-portal-crm 单销售链路门户；Hub = demo-portal-hub 九模块合一企业门户（sales/finance/helpdesk/hr/assets/inventory/knowledge/procurement/projects 前端硬编码）。**Hub 自带完整 sales 域是模板固有设计而非本仓库选型**——设计动机是 Hub 首页「全公司脉搏」聚合六域（[`home/data.ts:122`](../../platform/nocobase-portals/demo-portal-hub/src/pages/home/data.ts:122)，运营视角看全局），与 CRM 的销售作业视角不同构。
2. **数据层完全隔离**：49 表、零跨域外键、同名记录 0 条；重复对数据互不相通（hub_sales_* × crm_* 五对、hub_fin_invoices × crm_invoices、hub 域内双轨 hub_tk_tickets × hub_hd_tickets / hub_as_vendors × hub_po_suppliers）。
3. **历史考古**：hub 的 sales/purchase/helpdesk 域从未有主动业务选型——09-09 vendor 官方模板时 B3 只建了 admin demo 侧 6 域，09-12/13 C3/D1 两波是"满足模板前端 wire 请求"的被动补种。重复面根因 = 官方两条 demo 产品线各自完整实现销售域，本仓库把两个都 vendor 了。
4. **重复感知的界面根源**：应用中心 Hub 卡片文案（[`nocobase-n17-alignment.mts:604`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:604)，沿用 B3 初建语义「项目、工单、资产与人事一站式协作」）漏掉五域——用户按文案进 Hub 却看到第二套销售管道。QUICKSTART 只讲入口不讲分工（[QUICKSTART.zh.md:133-137](../../examples/kb-agent/QUICKSTART.zh.md:133)）。
5. 菜单级同名入口 3 对（销售管道/客户/活动记录完全同名，线索/联系人同义异名）。

## 处置裁决（已定：不删除，三层落地）

**不删除/不收敛任何域、表、菜单**，理由：

- 删除 hub 营收域 = 大改 vendored portal 前端（[`sales/module.tsx:19-25`](../../platform/nocobase-portals/demo-portal-hub/src/pages/sales/module.tsx:19) 路由 + sidebarGroups + 首页聚合三处连锁），违背范围控制与「模板预期用法」边界；
- 数据层虽全是可重放种子（E3 调研实证），但「删了干净」不解决用户问题——用户要的是**解释**（「crm和hub什么关系」），不是更少的入口；
- 数据打通（hub_sales_leads ↔ crm_leads 同步）是新产品工程，明确超范围。

## 改动面

### 1. QUICKSTART「双 Portal 定位与分工」节（双语）

落 [`QUICKSTART.zh.md`](../../examples/kb-agent/QUICKSTART.zh.md)（英文版同步，实施时确认双语文件形态；i18n 校验兜底）。内容合同（≤3 段，一屏内）：

- **CRM Portal = 销售作业面**：一条链路做到底（线索 → 客户 → 联系人 → 报价 → 订单 → 回款 → 目标），销售人员的日常工作台；
- **Hub Portal = 综合运营协作面**：九域合一（销售/项目/人事/库存/采购/财务/客服/资产/知识库），面向运营管理者看全局——其中「营收」组是运营视角的销售数据聚合视图，销售作业（录入/推进/转化）在 CRM 完成；
- **重复入口说明**：两 Portal 各自独立数据（互不同步）；Hub 营收组与 CRM 菜单同名是官方模板双 demo 设计；admin 后台「CRM 客户/销售流程」菜单读写 crm_* 表，「项目管理」等读写 hub_* 表。

### 2. 应用中心卡片文案对齐（种子侧幂等 update）

[`nocobase-n17-alignment.mts`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts) 应用中心卡片段（:604-605 附近）：

- Hub 卡片描述改为与实际九域能力一致（对齐 Portal hero 文案「把销售、项目、人事、库存、采购、财务、客服、资产和知识库放进同一个后台」），并带一句定位（运营协作门户）；
- CRM 卡片带定位（销售作业门户）；
- **幂等修正**：现有 ensure 逻辑是"存在即 kept"——补「文案漂移则 update」分支（卡片存在但 description ≠ 期望值时走 `applications:update`），保证本批在现有库生效且二跑幂等；新库全链直接落新文案。

### 3. 已知边界并入（与 E1/E2 的 QUICKSTART 改动同文件协调）

E1 的看板/甘特 v1 边界、E2 的配置引导小节与本节同属 QUICKSTART——本批实施时统一合并编辑，避免三批三次大改同一文件。

## 实施步骤

1. 卡片段改文案 + 幂等 update 分支 → 现有库跑一遍 → psql/API 断言两卡片 description 为新文案 → 二跑 kept/update 0；
2. QUICKSTART 双语落节（含 E1/E2 边界合并）；
3. `pnpm run doc-sync` 绿；
4. 截图落 `examples/kb-agent/demos/acceptance-e3/`。

## 验收断言

1. 应用中心打开：Hub 卡片描述含九域/定位表述、CRM 卡片含定位表述（截图 ≥2 张）；
2. `applications:list`（或对应 API）断言两卡片 description 逐字等于期望文案；
3. 种子段二跑：文案一致分支输出 kept（或 update 0）；
4. QUICKSTART 双语节落盘，`doc-sync` EXIT=0，无 i18n 漂移告警；
5. 零 portal 源码 diff、零业务表数据变更（psql 行数快照前后一致）。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| 卡片 update 分支与既有 kept 逻辑打架（重复 update/漏 update） | 低 | 断言 2-3 显式覆盖三种库态：无卡片（新建）/旧文案（update）/新文案（kept） |
| QUICKSTART 双语两份漂移 | 低 | 同 PR 内成对提交，doc-sync + i18n 校验 |
| 文案改动词不达意（用户仍困惑） | 低 | 内容合同钉死上文三点；验收以「按卡片文案能否预测 Portal 内看到什么」为准绳 |

**回滚**：revert 单提交；卡片文案可再跑旧常量恢复（update 分支可逆）；QUICKSTART 纯文档 revert 即可。
