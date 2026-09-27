# W 轮企业资产盘点报告

> 盘点日期：2026-09-25 | 方法：全目录扫描 + 集合/页面/workflow 逐项核对（文件:行号） | 委派：project-research 子任务，主任务汇入归档

**路径澄清**：`packages/enterprise/*` 不存在（`packages` 下无该目录）。企业资产实际分三处：① 编程式构建脚本 [`examples/kb-agent/scripts/`](../../examples/kb-agent/scripts)；② NocoBase 2.2.6 快照 [`platform/nocobase`](../../platform/nocobase/MANIFEST.md)；③ CRM/Hub Portal [`platform/nocobase-portals/`](../../platform/nocobase-portals)。W 轮批注中所有 "packages/enterprise" 引用应改指 examples/kb-agent/scripts。

---

## 1. 资产清单（脚本职责 + 集合 + 页面 + 状态机）

### 工厂基建（五件套，全可复用）

| 脚本 | 职责 | 关键位置 |
|---|---|---|
| [`nocobase-flow-page-lib.mts`](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts:1) | 共享管道：`call`/`dataOf` HTTP 封装（[:42](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts:42)）、`signInWithRetry` 指数退避（[:74](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts:74)）、fail-closed 分页 `listFlowModels`(pageSize 2000)[:92](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts:92)/`listRoutes`(400)[:104](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts:104)、磁盘回滚 `RollbackRecord`[:28](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts:28)、`withN17Prefix` uid 幂等 | 205 行 |
| [`nocobase-e1-pj-v2.mts`](../../examples/kb-agent/scripts/nocobase-e1-pj-v2.mts:394) | E1 建页 spine 模板（TableBlockModel→表单弹窗全链） | :394-465 |
| [`nocobase-f1-view-v2.mts`](../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts:1) | 看板/日历工厂：`KanbanBlockModel`（props 官方 fixture 直存：groupField/sortField/dragEnabled）[:16-18](../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts:16)、`CalendarBlockModel`（fieldNames start/end）[:22](../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts:22)；gantt 无服务端 authoring 面保持 v1 [:8-10](../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts:8) | 687 行 |
| [`nocobase-f4-charts.mts`](../../examples/kb-agent/scripts/nocobase-f4-charts.mts:1) | 图表通道：必须走 `flowSurfaces:addBlock` 授权 API——raw `flowModels:save` 会被服务端 canonicalization 改写、客户端不可读（探针实锤）[:6-13](../../examples/kb-agent/scripts/nocobase-f4-charts.mts:6) | 129 行 |
| [`nocobase-n18-form-ai.mts`](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts:1) | AI 挂载器：扫全库顶层 `CreateFormModel` 自动挂 `AIEmployeeButtonModel`（uid `n18ai-<formUid>`，员工 dex）——**新表单零改动自动覆盖** | 123 行 |

编排入口 [`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts:1224)：all 链 = crm-modules → hub-modules → n13-rebuild → n13-seed → n14-fix → n17-alignment → e1 → f1 → f2 → f3 → **h4-srm → h5-wms** → n18 → n25-brand → f4-charts → setup-dsh-data；verify 门禁断言 43 个 v2 页标题 + n18ai-≥42 + JSBlockModel/Kanban/Calendar 块存在（[:734-799](../../examples/kb-agent/scripts/setup-nocobase.mts:734)）。

### SRM（✅ 完整闭环）— [`nocobase-h4-srm.mts`](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:1)

- **6 集合**（[:106-158](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:106)）：
  - `srm_suppliers`：`lifecycle_status` **8 态状态机** potential/reviewing/qualified/preferred/restricted/frozen/rejected/eliminated（[:70-74](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:70)）+ 三套独立分级 regulatory_risk/audit_grade/iqc_level + is_blacklisted/blacklist_reason/admitted_at/source（[:108-116](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:108)）
  - `srm_certificates`（cert_type 6 类 + warn_status 5 档 ok/w90/w60/w30/expired）[:119](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:119)
  - `srm_audit_checklists`（GMP20+HACCP7+ISO220006 条款）[:126](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:126)
  - `srm_audit_records`（三评分+total+grade）[:132](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:132)
  - `srm_score_cards`（五维+加权总分+rating+rating_change）[:140](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:140)
  - `srm_capas`（status initiated/replied/verifying/closed + source 4 类 + kanban sort 列）[:148-157](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:148)
- **8 页**（供应链组）：供应商档案/供应商准入（第二视图=审批挂载点 [:219](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:219)）/证照效期预警/审核检查表/审核评分录入/绩效评分卡/供应商绩效雷达（radar 走 `visual.mode='custom'` raw ECharts [:1100](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:1100)）/整改跟踪（kanban）
- **状态机/业务逻辑**：workflow「SRM供应商准入审批」双人工链 manual资质审核→condition→branch1 manual现场审核评级→condition→update qualified/rejected（[:707-751](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:707)）；「SRM低评分自动整改」score create→condition total<60→create CAPA（[:753-781](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:753)）

### WMS（✅ 引擎级闭环）— [`nocobase-h5-wms.mts`](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1)

- **9 集合**（[:90-180](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:90)）：`wms_zones`/`wms_bins`(4态库位)/`wms_lots`(效期四日期+供应商追溯锚 [:106](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:106))/`wms_stock`(四数量+version [:116-125](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:116))/`wms_movements`(append-only，7 种 MOVE_TYPE)/`wms_receipts`(7态)/`wms_shipments`(FEFO 推荐批次列 [:153](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:153))/`wms_transfers`(4态)/`wms_counts`(6态 planned/frozen/counting/difference/adjusting/done [:82-85](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:82))
- **9 页**（仓储管理组）+ 库位平面图 JSBlockModel（A 路：runjs 白名单只认 `ctx.makeResource` [:14-16](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:14)）
- **盘点审批 workflow**：update 触发（mode2, status=difference）→manual→condition→update done/驳回退回（[:536-572](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:536)）
- **过账引擎**：见 §4

### Hub→CRM 移植 + CRM v2

- [`nocobase-crm-modules.mts`](../../examples/kb-agent/scripts/nocobase-crm-modules.mts:89)：crm_* **11 表**（leads/customers/contacts/deals/quotes/products/activities/follow_ups/payments/invoices/targets）+ Portal 对齐字段（deals.stage 5 态 [:583](../../examples/kb-agent/scripts/nocobase-crm-modules.mts:583)、quotes 多版本 root_quote_id/version/is_current [:596-598](../../examples/kb-agent/scripts/nocobase-crm-modules.mts:596)）
- [`nocobase-hub-modules.mts`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:74)：hub_* **37 表九域**（pj/tk/kb/as/hr/md/inv/sales/hd/fin/po）；G 轮把 Hub 全功能域吸收进 CRM Portal（[`plans/acceptance-fixes-2026-09-14-g/PLAN.md`](../../plans/acceptance-fixes-2026-09-14-g/PLAN.md:1)），Hub 降级为模板参考
- [`nocobase-f2-crm-v2.mts`](../../examples/kb-agent/scripts/nocobase-f2-crm-v2.mts:1)（CRM 5 页铺量）/[`nocobase-f3-hub-v2.mts`](../../examples/kb-agent/scripts/nocobase-f3-hub-v2.mts:1)（Hub 7 页含双块/四块复合页 + TitleField 修复 [:523](../../examples/kb-agent/scripts/nocobase-f3-hub-v2.mts:523)）

---

## 2. 供应商现状（⚠️ 三份数据孤岛）

| 集合 | 字段面 | 位置 |
|---|---|---|
| `srm_suppliers` | 8 态生命周期+准入日期+黑名单+三套分级（有状态机、有审批链） | [`nocobase-h4-srm.mts:108`](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:108) |
| `hub_po_suppliers` | 仅 name/email/contact_name/rating/status(active\|inactive)——**无准入/证照/审核字段** | [`nocobase-hub-modules.mts:346`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:346) |
| `hub_as_vendors` | 资产服务商（认证/物流/法务/综合） | [`nocobase-hub-modules.mts:122`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:122) |

- **mobile 对话登记供应商 → `hub_po_suppliers`**：[`formRegistry.ts:72-91`](../../packages/client/ui-mobile/src/client/formRegistry.ts:72)（bizName「供应商登记」），确认后经 nb_create 落库——**与 SRM srm_suppliers 不是同一份**。采购单 supplier_id 也解析到 hub_po_suppliers（[`formRegistry.ts:66`](../../packages/client/ui-mobile/src/client/formRegistry.ts:66)）
- H 轮决策 8 已记录此分裂：「供应商 srm_suppliers 新建独立（hub_po 保留，集成列后期）」[`plans/acceptance-fixes-2026-09-15-h/PLAN.md:50`](../../plans/acceptance-fixes-2026-09-15-h/PLAN.md:50)
- WMS 侧批次/收货的 supplier_id → **srm_suppliers**（[`nocobase-h5-wms.mts:111,139`](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:111)）
- PC 业务管理页有 SRM 域归组与供应商 360 视图触发（[`bizNav.ts:34-37`](../../packages/client/ui-business/src/client/bizNav.ts:34)、`isSupplierCollection` [:162](../../packages/client/ui-business/src/client/bizNav.ts:162)）+ `srm_capas` 状态控件映射（[`fieldControls.ts:39`](../../packages/client/ui-mobile/src/client/fieldControls.ts:39)）

## 3. 审批现状

**NocoBase 侧（3 条 collection 触发 workflow，全开源节点）**：

1. 「专家服务订单审批交付」：manual→condition→request 回调 DSH `orders.fulfill`（branch1）/update status=failed error=审批驳回（branch0）——[`setup-nocobase.mts:412-460`](../../examples/kb-agent/scripts/setup-nocobase.mts:412)，verify 断言节点链 [:689-699](../../examples/kb-agent/scripts/setup-nocobase.mts:689)
2. SRM 准入双人工链 + CAPA 自动触发（§1）
3. WMS 盘点差异审批（§1）

**数据层状态机（唯一真正代码级状态机）**：expert-orders 四态 pending/generating/delivered/failed + 转移表（[`types.ts:13-18`](../../packages/expert/expert-orders/src/types.ts:13)、[`state-machine.spec.ts`](../../packages/expert/expert-orders/tests/state-machine.spec.ts:1)、`fulfill` 转移守卫 [`index.ts:348-356`](../../packages/expert/expert-orders/src/index.ts:348)）。测试工具库 [`nocobase-workflow.ts`](../../examples/kb-agent/scripts/nocobase-workflow.ts:84)：WorkflowLease（暂停生产流+私有克隆+恢复）、以审批人身份 resolve manual 任务、清理搁浅任务。

**mobile 人审确认卡（R 轮模式，可复制到 W 轮审批 UI）**：

- v3 三层字段草稿卡 + 确认写入/驳回（[`forms/v3/DraftCard.tsx:138-148`](../../packages/client/ui-mobile/src/client/forms/v3/DraftCard.tsx:138)）
- v2 人审卡「待人工审核」+ Dialog 确认（[`forms/task-cards.tsx:96-186`](../../packages/client/ui-mobile/src/client/forms/task-cards.tsx:96)）
- 协议 fence `form_confirm`/`reject_flow`（[`protocol.ts:88-99,611-633`](../../packages/client/ui-mobile/src/client/protocol.ts:88)）+ 会话日志回放状态机 draft→pending→submitted/rejected（[`cardState.ts:15-16`](../../packages/client/ui-mobile/src/client/cardState.ts:15)）+ 回执卡读回真实行
- **缺口**：mobile 确认=nb_create 直写，不产生 NocoBase manual 审批任务——双端审批闭环 W 轮需新建桥

**审计日志**：❌ 无。商业 audit-logs 插件 docs-marked Enterprise 无 npm 2.x build（[`setup-nocobase.mts:84-85`](../../examples/kb-agent/scripts/setup-nocobase.mts:84)）；业务侧无审计表（仅 KG 侧有 `kg_ontology_revisions`/`kg_build_runs`）。W 轮审批审计需自建轻量表或依赖 workflow execution 记录。

## 4. 库存过账引擎

| 项 | 事实 | 位置 |
|---|---|---|
| 乐观锁 | `applyStockDelta(token, {productId,binId,lotId}, delta)`：update filter 携带 `{id, version}`，过期版本命中零行→throw fail-loud 拒双重扣减 | [`nocobase-h5-wms.mts:1125-1142`](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1125) |
| 出库过账 | `postShipment`：单次翻转守卫（posted/closed 幂等跳过）→ 库存减 → SHIP 流水 → status=posted | [:1144-1162](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1144) |
| 入库过账 | `postReceipt`：自动建批次（按 hub_inv_products.shelf_life_days 推四日期）→ 温层匹配空闲库位推荐（putaway 规则）→ 库存 upsert → PUTAWAY 流水 → posted | [:1164-1229](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1164) |
| FEFO | `fefo(token, sku, qty)`：qualified + expiry>today，按应下架日 ASC（同日 qty DESC）分配，**只建议不写入** | [:1088-1116](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1088) |
| 期初对齐 | 每 (product,lot) 一条 ADJUST 流水，`stock==Σmovements` 从种子出生即成立 | [:445-447](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:445) |

**唯一入口判定：否，存在旁路**。

- ① 引擎只经 CLI（[--fefo/--post-shipment/--post-receipt/--rollback](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1286-1300)）；任何 `wms_stock:update` REST/表单手改不经过引擎（无服务端拦截）。
- ② **--post-transfer 无 CLI 入口**：头注释宣称四命令（[:21](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:21)）但 main 只接三个——移库单 `wms_transfers` 无过账命令，status 仅能手改。
- ③ 盘点差异审批 workflow 的 update 节点只改 `wms_counts.status`，不回写库存调整。
- 决策记录：过账不进 workflow（update 节点做不了四数量读-改-写算术）——[`2026-09-15-five-systems-factory-srm-wms.md:25-27`](../../.agents/notes/implemented/process/2026-09-15-five-systems-factory-srm-wms.md:25)。

## 5. AI 体验四件套与 KG/KB（W 轮全部可复用）

| 件 | 现状 | 位置 |
|---|---|---|
| plugin-ai ChatButton | 快照自带；只在 v2 页渲染（v1 不出悬浮球） | [`nocobase-n17-alignment.mts:222-224`](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:222)；9 位 AI 员工进 users（verify [:1062](../../examples/kb-agent/scripts/setup-nocobase.mts:1062)） |
| 表单级 AI 填充 | n18 全库自动挂 AIEmployeeButtonModel（dex），下限 42 表单；新表单零改动覆盖 | [`nocobase-n18-form-ai.mts:1-36`](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts:1) |
| 附件代理 + SSE think 过滤 | N22 回环代理：PDF file-part 重写为 text 剧封 + 跨 chunk 部分标签缓冲状态机剥 `<think>`（fail-open，N22_FILTER_THINK=0 回滚）；生命周期归 setup `ai-proxy start/stop` | [`nocobase-n22-llm-proxy.mts:1-53`](../../examples/kb-agent/scripts/nocobase-n22-llm-proxy.mts:1)、[`setup-nocobase.mts:36-44`](../../examples/kb-agent/scripts/setup-nocobase.mts:36) |
| Portal AI 员工 | N24 演示：中文意图→formFiller 回写 4 字段→人工补选 m2o 客户→提交 | [`N24-portal-ai-employee.md`](../../examples/kb-agent/demos/nocobase-full-features/N24-portal-ai-employee.md:48) |

**KG/KB**：packages/kb 八包（kb-graph 本体 31 类型+23 关系、kb-graph-sqlite `SCHEMA_VERSION=5`（[`schema.ts:73`](../../packages/kb/kb-graph-sqlite/src/schema.ts:73)）含 `kg_build_runs`/`kg_ontology_revisions` 审计表（[`store.ts:29-40`](../../packages/kb/kb-graph-sqlite/src/store.ts:29)）、kb-build 四腿+质量指标落库（[`quality.ts`](../../packages/kb/kg-build/src/quality.ts:3)）、映射文件化 [`kg-mappings.yml`](../../examples/kb-agent/kg-mappings.yml)）；图谱页 sigma 画布+KG 工作台（本体树 KGCL/变更流回滚/共指审核）+会话内 kg_edit 语义改图（[`QUICKSTART.zh.md:263-269`](../../examples/kb-agent/QUICKSTART.zh.md:263)）。

## 6. plans/ 目录扫描（19 目录 + 6 单文件）

| 目录 | PLAN.md 主题一句话 |
|---|---|
| `food-kb-agent-plan.md` | 食品 KB+Agent 平台 P0-P2 总计划（2026-08-28 起点） |
| `connector-lakehouse-nocobase/` | 连接器+湖仓+NocoBase 融合+专家下单（N0-N7） |
| `nocobase-native-integration/` | 架构 v2：NocoBase 源码级融入+本体 KG+DSH Web 产品化（V1-V6） |
| `nocobase-full-features/` | N8：NocoBase 官方 Demo 级完整功能复刻（2.2.6 快照） |
| `acceptance-fixes-2026-09-10/` | B 轮：市场故障+本体图谱内置+UI/UX 重设计 |
| `acceptance-fixes-2026-09-11/` | C 轮：图谱画布交互+业务后台新窗口+品牌白标 |
| `acceptance-fixes-2026-09-12/` | D 轮：hub schema 全量对齐+项目管理 AI 员工+深链 fallback |
| `acceptance-fixes-2026-09-13/` | E 轮：admin 项目管理 AI 关联（v2 升级）+Portal 修复 |
| `acceptance-fixes-2026-09-13-f/` | F 轮：admin 全量 v1→v2 升级+看板/日历/图表工厂（F1-F5） |
| `acceptance-fixes-2026-09-14-g/` | G 轮：CRM Portal 吸收 Hub 全功能域+logo 统一+全域 AI 化（G1-G8） |
| **`acceptance-fixes-2026-09-15-h/`** | **H 轮：场景 Tab 独立化+本体 KG 真可用+五大企业系统首期（SRM+WMS）（H1-H7）** |
| `acceptance-fixes-2026-09-16-j/` | J 轮：模式选择器+五域工具面+tab 感知智能上下文（I 轮收官后，无独立 I 目录） |
| `2026-09-17-kg-mobile-ux/` | M 轮总纲：M1 PC UI/UX 重设计+M2 本体 KG AI 重建+M3 移动端 |
| `2026-09-20-mobile-v2-ai-colleagues/` | 移动端 v2：微信式 AI 同事+填表提交人审闭环 |
| `2026-09-21-mobile-v3-redesign/` | 移动端 v3：产品问题/信息架构/视觉三件套（无 PLAN.md） |
| `2026-09-22-mobile-v4-redesign/` | 移动端 v4：E2 视觉批次 |
| `2026-09-22-mobile-v5-aiworkmate/` | 移动端 v5：AI Workmate 产品级重构（B1-B3） |
| `2026-09-23-mobile-v6-uidesign/` | 移动端 v6：设计稿落地（B1-B3） |
| `kb-workbench-redesign/`、`orders-deliverables-view/` | KB 工作台重设计；订单交付物页面 |

单文件：`food-kb-agent-tool-failures-and-zhanghongxi-fix-plan.md`、`diagnosis-2026-09-08.zh.md`、`handoff-2026-09-08/10/15.zh.md`、`nocobase-ai-experience-2026-09-10.zh.md`（AI 四件套原计划）、`kb-frozen-spec.md`。

**H 轮 L4 调研底稿**（9 路子任务，索引在 [`00-research-notes.md:5-17`](../../plans/acceptance-fixes-2026-09-15-h/00-research-notes.md:5)）：

- 目录内：`00-research-notes.md`（事实底座）、`01-research-scenario-tab.md`（场景 tab）、`02-research-ontology-kg.md`（KG）、`03-research-enterprise-systems.md`（五系统架构裁决）、`04-roadmap-five-systems.md`（I/J/K/L 路线图）+ 10/20/30/40/50/60/70 批次详档
- research/：`2026-09-15-ontology-kg-engineering/report.md`（R4 real-deep-research L4，72 源）、`2026-09-15-crm-erp-domain-model.md`（R5）、`2026-09-14-mes-core-domain-model-nocobase.md`（R6）、`2026-09-14-wms-domain-model-nocobase.md`（R7）、`2026-09-14-food-plm-domain-model.md`（R8）、`2026-09-14-srm-food-nocobase.md`（R9）

## 7. 孤岛判定（对照 W 轮目标）

| W 轮目标 | 判定 | 缺什么 |
|---|---|---|
| 审批流数据层状态机+双端 UI | ✅ 模式全齐（expert-orders 状态机+3 条 workflow+mobile 人审卡协议）；⚠️缺通用审批引擎/通用 mobile↔workflow 桥 | mobile 确认不产生 NocoBase manual 任务；无审计表 |
| 采购 PR→询价→PO→收货→IQC→入库→结算 | ❌ 主链缺；⚠️ hub_po_purchase_orders 孤岛（status 字段 draft/sent/received/cancelled，无流转）；收货= wms_receipts 可承接但无 PR/RFQ/报价/结算集合 | 全部新建（可骑 SRM 供应商+WMS 收货过账） |
| 库存实务（移库/预留/FEFO/盘点/安全库存） | ⚠️ 半齐：盘点✅、FEFO✅（仅建议）、移库表有单无过账命令、预留仅 qty_allocated 字段无单据、安全库存无字段 | --post-transfer 入口、预留事务、安全库存列+预警 |
| 生产闭环（BOM/工单/排产/齐套/领退/完工/OQC/入库） | ❌ 全缺（J 轮 MES 未启动，R6 调研底稿已有：~80% 标准区块覆盖，Gantt+SQL collection） | 全部新建 |
| 销售→MRP 联动 | ❌ 全缺（R5 明确 MVP 排除 MRP；crm_deals.stage 无流转逻辑、报价版本字段有但无生成逻辑） | 全部新建 |
| 质量管理 IQC/IPQC/OQC/CAPA/供应商绩效 | ⚠️ CAPA✅、绩效评分卡✅、IQC 仅严格度字段；无质检单据域（hub_qc_inspections 是 mobile 侧孤立集合） | 三检单据+不合格处置+与收货/工单挂钩 |
| 供应商全生命周期 | ✅ srm_suppliers 8 态+准入审批链；⚠️ mobile/采购单写 hub_po_suppliers 不同源 | 三份数据归一或桥接 |
| 真实数据看板 | ✅ 工厂可复用：F4 addBlock 图表通道+radar custom ECharts+Kanban/Calendar；hub overview 首页（G6） | 挂新域真实数据 |

## 8. NocoBase 编程式构建模式与坑（W 轮复用清单）

**复用哪个模板**：新域脚本照 **h4/h5 骨架**（COLLECTIONS→seedRows→ensureWorkflows→ensureMenuGroup→ensureV2Page→ensureFormSubmits→rollback，字段工厂 input/select/belongsTo 内联于 [h4:48-64](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:48)），表格页骑 E1 spine、看板/日历骑 F1 fixture 形状、图表一律 F4 `flowSurfaces:addBlock`，验证断言挂 [`setup-nocobase.mts:734-799`](../../examples/kb-agent/scripts/setup-nocobase.mts:734) 模式并上调 n18ai- 下限。

**十一坑（全部有实锤行号）**：① 字段必须显式 name——无名 field 铸随机 `f_*` 列（[h4:45-46](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:45)）；② m2o 必带 `fieldNames{label,value}`，否则表格列全 N/A（N16 wire fact，[h4:59-64](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:59)）；③ workflow create 后必须 toggle off/on 一次才挂 db hook（[h4:712-715](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:712)）；④ 种子先于 workflow 创建，否则首批种子进审批队列（[h4:16-17](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:16)）；⑤ condition 分支 branchIndex 1=TRUE 支（[h4:725-728](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:725)）；⑥ 主链 manual→condition 需显式 downstreamId 回写（[setup-nocobase.mts:457-460](../../examples/kb-agent/scripts/setup-nocobase.mts:457)）；⑦ 图表 raw save 客户端不可读，必须授权 API（[f4:6-13](../../examples/kb-agent/scripts/nocobase-f4-charts.mts:6)）；⑧ JSBlockModel runjs 白名单只认 `ctx.makeResource`（[h5:14-16](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:14)）；⑨ v1 页 destroy 须连 tabs 子行（E3 orphan-tab trap，[f1:33-35](../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts:33)）；⑩ ChatButton 只在 v2 页渲染（[n17:222-224](../../examples/kb-agent/scripts/nocobase-n17-alignment.mts:222)）；⑪ workflow update 节点做不了读-改-写算术——过账类逻辑必须脚本侧引擎（[Agent Note:25-27](../../.agents/notes/implemented/process/2026-09-15-five-systems-factory-srm-wms.md:25)）。

---

## 资产 → W 轮处置总表

| 资产 | 位置 | 现状 | W 轮处置建议（批次归属） |
|---|---|---|---|
| flow-page-lib 工厂库 | [`nocobase-flow-page-lib.mts`](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts:1) | ✅ | 全部新脚本复用（基建批） |
| SRM 6 表 8 页+准入/CAPA workflow | [`nocobase-h4-srm.mts`](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:1) | ✅ 闭环 | 采购链批次直接挂 srm_suppliers；补询价/报价/比价集合（B3） |
| WMS 9 表 9 页+盘点 workflow+库位图 | [`nocobase-h5-wms.mts`](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1) | ✅ 引擎级 | B4：补 --post-transfer、预留单据、安全库存列+预警 |
| 过账引擎（乐观锁/FEFO） | [h5:1088-1229](../../examples/kb-agent/scripts/nocobase-h5-wms.mts:1088) | ✅ 但有 REST 旁路+transfer 缺口 | B4 扩展引擎为唯一入口（守卫）；生产入库/领料接 postReceipt/postShipment 的 type 扩展 |
| CRM 11 表+5 页 v2+Portal | [`nocobase-crm-modules.mts`](../../examples/kb-agent/scripts/nocobase-crm-modules.mts:89) | ⚠️ 无流转 | B7：deals.stage 挂 SO 审批；报价版本逻辑落地；MRP 联动新建 |
| Hub 37 表+7 页 v2 | [`nocobase-hub-modules.mts`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:74) | ⚠️ 录入无流转 | B0 补读视图；hub_po_* 并入采购链（B3）；其余保持 |
| hub_po_suppliers（mobile 写入） | [formRegistry.ts:72](../../packages/client/ui-mobile/src/client/formRegistry.ts:72) + [hub-modules:346](../../examples/kb-agent/scripts/nocobase-hub-modules.mts:346) | ⚠️ 孤岛 | B2 归一：mobile 登记改写 srm_suppliers（source=internal，走准入审批） |
| expert-orders 状态机+订单审批 workflow | [`packages/expert/expert-orders`](../../packages/expert/expert-orders/src/types.ts:13) | ✅ | B1 的代码级状态机范本；通用化抽取 |
| NocoBase workflow 链模式（manual→condition→update/create/request） | [h4:690](../../examples/kb-agent/scripts/nocobase-h4-srm.mts:690) 等 | ✅ | B1 复制此模式做 PO/生产订单审批（禁 PRO 插件约束下唯一路径） |
| mobile v3 人审卡+协议 fence+回放状态机 | [`ui-mobile/src/client/forms/`](../../packages/client/ui-mobile/src/client/forms/v3/DraftCard.tsx:138) | ✅ | B1 双端 UI 直接复用；补「审批中→已批/驳回」新卡型+与引擎联动 |
| 看板/日历/图表工厂 | [`nocobase-f1-view-v2.mts`](../../examples/kb-agent/scripts/nocobase-f1-view-v2.mts:1)/[`f4`](../../examples/kb-agent/scripts/nocobase-f4-charts.mts:1) | ✅ | B9 直接复用（radar custom 通道做供应商绩效/五维质量） |
| AI 四件套（plugin-ai/n18/n22/Portal AI） | §5 各位置 | ✅ | 零改动复用；n18 自动覆盖全部新表单 |
| KG/KB（八包+版本化+质量落库+kg_edit） | [`packages/kb/`](../../packages/kb)、[`kg-mappings.yml`](../../examples/kb-agent/kg-mappings.yml) | ✅ | W 轮可选联动（新集合入 mappings 白名单） |
| BOM/生产订单/排产/齐套/OQC/IPQC/IQC/PR/RFQ/结算/MRP | — | ❌ 缺失 | W 轮新建（调研底稿 R5/R6/R7/R9 已备齐 + [2026-09-25-manufacturing-erp-full-loop.md](../2026-09-25-manufacturing-erp-full-loop.md)） |
| 审计日志 | — | ❌（商业插件不可用） | B1 自建轻量审计表（照 kg_build_runs 模式） |

**一句话结论**：H 轮已交付的 SRM+WMS 是真闭环（状态机+workflow+引擎+门禁），W 轮的地基是复用工厂五件套+审批三模式（数据层状态机/collection workflow/mobile 人审卡）；最大的三个结构性缺口是「三份供应商数据不同源」「过账引擎存在 REST 旁路+移库无过账入口」「mobile 确认不产生 NocoBase 审批任务」，生产/采购/质量主链全部待新建。
