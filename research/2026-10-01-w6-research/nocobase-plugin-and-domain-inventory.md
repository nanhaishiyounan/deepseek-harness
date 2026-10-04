# NocoBase 插件生态与业务域现状盘点（W6 调研底稿）

- 调研时点：2026-10-01（只读调查；未修改任何代码）
- 对象：platform/nocobase（NocoBase 2.2.6 源码快照，隔离 yarn1 子树）+ examples/kb-agent/scripts/ 全量建设脚本 + research/2026-09-28-w4-completeness/ 现成审计
- 数据基线：W4 全平台审计（2026-09-28，live 实地）desktopRoutes **206 行**、collections **113**、fields **1007**、flowModels **7222**；w4-b5 菜单重整后 198 行 / 12 菜单组 + 顶级散页；W5 轮增量不改路由数（行详情三段式重构 + 主题 + 审批设计器 iframe 入口）；2026-10-01 07:35 对 :13000 只读探针复核（唯一 POST 为 signIn，其余 GET）：desktopRoutes 198 行 = 12 group + 90 flowPage + 93 tabs + 3 page、业务集合 118、pm:list 124 = 89 enabled + 35 disabled
- 用途：回答用户第十轮反馈——「功能菜单虽然不少，但都是表格+表单，毫无设计」+「nocobase 是插件化的，现在没有对应功能和 ui」

---

## ① 插件全量分类表

目录 `platform/nocobase/packages/plugins/@nocobase/` 共 **110 个 plugin-\* 目录**；另有 `packages/plugins/@nocobase-example/` **21 个上游示例插件**（workspace 内本地插件先例，见 ③）。**不存在 pro-plugins 或任何商业插件目录**——`platform/nocobase/MANIFEST.md:64` 明文：「pro 商业插件不在开源仓，本快照不包含、永不复制」。

| 类别 | 数量 | 插件清单 |
|---|---:|---|
| UI 块类 | 10 | block-comment / block-grid-card / block-iframe / block-list / block-markdown / block-multi-step-form / block-template / block-tree / block-workbench / multi-keyword-filter |
| 字段类 | 9 | field-attachment-url / field-china-region / field-code / field-formula / field-m2m-array / field-markdown-vditor / field-sequence / field-sort / snapshot-field |
| 动作类 | 7 | action-bulk-edit / action-bulk-update / action-custom-request / action-duplicate / action-export / action-import / action-print |
| 数据源/集合类 | 9 | data-source-main / data-source-manager / collection-sql / collection-tree / collection-fdw / graph-collection-manager / multi-app-manager / multi-app-share-collection / mock-collections |
| 可视化/视图类 | 7 | data-visualization / data-visualization-echarts / charts / kanban / gantt / calendar / map |
| 工作流类 | 21 | workflow + 20 个子插件：action-trigger / aggregate / cc / custom-action-trigger / date-calculation / delay / dynamic-calculation / javascript / json-query / json-variable-mapping / loop / mailer / manual / notification / parallel / request / request-interceptor / response-message / sql / variable / test |
| 集成/通知/认证类 | 12 | notification-email / notification-in-app-message / notification-manager / notifications / mcp-server / api-doc / api-keys / auth / auth-sms / idp-oauth / verification / embed |
| AI 类 | 2 | ai / ai-gigachat |
| 引擎/平台类 | 1 | flow-engine（v2 flow 页面体系的服务端引擎） |
| 系统/治理类 | 32 | acl / audit-logs / async-task-manager / backup-restore / backups / client / custom-variables / departments / disable-pm-add / environment-variables / error-handler / file-manager / file-previewer-office / form-drafts / license / locale-tester / localization / logger / mobile / mobile-client / public-forms / system-settings / text-copy / theme-editor / ui-layout / ui-schema-storage / ui-templates / user-data-sync / users / hello / （其余见上方各类，此处不重复） |
| 上游示例（@nocobase-example/） | 21 | plugin-acl-allow / plugin-acl-middleware / plugin-action-group / plugin-block-custom-resource / plugin-block-filter-collection / plugin-block-timeline / plugin-collection-block / plugin-custom-details-block / plugin-custom-form-block / plugin-custom-table-block（+action-group/field/resource 三变体）/ plugin-data-block / plugin-field-simple / plugin-nested-action / plugin-nested-block / plugin-settings-page / plugin-simple-action / plugin-simple-block / plugin-simple-popup-action |

preset 侧对照（`platform/nocobase/packages/presets/nocobase/package.json`）：`dependencies` 收录 **100 个** plugin-\*（6-107 行）、`builtIn` **76 个**（119-196 行，装好自动启用）、`deprecated` 5 个（112-118 行：audit-logs / charts / comments / mobile-client / snapshot-field）。

## ② 已启用清单与差集（含补装评估）

### 已启用证据链

| 来源 | 数量 | 说明 |
|---|---:|---|
| preset `builtIn` | 76 | `yarn nocobase install` 后自动启用（package.json:119-196） |
| setup 脚本 `PLUGINS` | 12 | `examples/kb-agent/scripts/setup-nocobase.mts:90-94`：map / comments / data-visualization-echarts / charts / public-forms / notification-email / departments / localization / graph-collection-manager / backup-restore / field-china-region / collection-fdw。逐个 `POST /api/pm:enable?filterByTk=<name>`（:650），幂等 |
| setup `TRIAL_PLUGINS` | 1（✅ 实测成功） | audit-logs：enable-if-able。注释（:86-88）曾担忧「docs-marked Enterprise with no npm 2.x build」，但 2026-10-01 探针实测其在 enabled 列表——pm:list 反映 workspace 运行时扫描（源码目录在即有行），并非仅 npm 可装性 |

**当前实例启用实测 89 个**（76 builtIn + 12 强启 + audit-logs TRIAL 实测成功，2026-10-01 :13000 pm:list）。旁证：kanban/calendar/gantt(v1)/iframe/echarts/主题/部门/地图页面在 W4-W5 审计全部在线渲染，对应插件确已启用。

### 差集 = 实测 35 个 disabled = 21 个 @nocobase-example 演示插件 + **14 个 preset 内未启用**（ai-gigachat / auth-sms / block-multi-step-form / custom-variables / embed / field-attachment-url / field-code / field-m2m-array / form-drafts / hello / locale-tester / multi-app-manager / multi-keyword-filter / workflow-dynamic-calculation）

用户点名项逐一核验：

| 用户关注项 | 结论 | 证据 |
|---|---|---|
| workflow 高级节点 | **已启用**（全部 20 子插件均 builtIn） | preset package.json:88-107 |
| import-export | **已启用**（action-import/action-export 均 builtIn） | package.json:126-127 |
| 可视化图表 | **已启用**（data-visualization + echarts；旧 charts 也被 setup 强制启用） | setup-nocobase.mts:91 |
| 地图 | **已启用**（map 在 PLUGINS 第一个） | setup-nocobase.mts:91 |
| 通知 | **已启用**（email / in-app-message / manager 三件套） | package.json:74-76 |
| audit-logs | **实测已启用**（TRIAL 成功，见 ②）——操作审计在 W6 可直接用 | 2026-10-01 pm:list 探针 |

真正可补的差集（preset deps 内、一条 `pm:enable` 即生效，重启 dev-server 即可用）：

| 插件 | W6 价值 | 评估 |
|---|---|---|
| form-drafts | 长表单暂存草稿（食品配方/BOM 大表单友好） | **可补装直接用** |
| multi-keyword-filter | 表格多关键词筛选（补 47% 页面无筛选） | **可补装直接用** |
| block-multi-step-form | 多步表单（准入申请/审核检查表分步） | **可补装直接用** |
| field-m2m-array / field-code / field-attachment-url | 字段扩展 | 可补装直接用，按需 |
| custom-variables | 工作流/表单变量增强 | 可补装直接用 |
| embed | 站点外嵌（客户门户场景） | 可补装，需评估安全边界 |
| auth-sms | 短信登录 | 需评估（依赖外部短信服务商；idp-oauth 已在 builtIn 启用，不属差集） |
| ai-gigachat / locale-tester / multi-app-manager | GigaChat/多应用 | 与本部署无关，不开 |
| hello / mock-collections / disable-pm-add / workflow-test | 示例/测试/开发防呆 | 不开 |
| mobile-client / snapshot-field | preset 已声明 deprecated 且不在 pm:list 行内 | 不开（charts 与 audit-logs 虽标 deprecated 但均实测启用、页面在用） |

### yarn1 子树装新插件的可行性（问题 ③）

- **构建/启动方式**（setup-nocobase.mts:300-365）：`yarn install`（首跑 ~15 min）→ `yarn nocobase install`（建表+root）→ `yarn build`（首跑 ~20 min，产出 `packages/core/app/dist/client`）→ `yarn dev-server` 后台起 :13000。PG = 本地 postgres，库/角色 nocobase/nocobase（:247-292）。
- **从 npm 装新 @nocobase/plugin-\***：上游 2.x 已把全部开源插件收进 monorepo 且随 preset 下发——npm 上独立发布、快照里又没有的 2.x 社区插件池**基本为空**；「社区市场的甘特/地图」其实都已在快照内（plugin-gantt/plugin-map 均在且已启用）。若真要从 npm 装：加进 preset deps → `yarn install` → `pm:enable` → 重启；带前端 dist 可直接用，无 dist 需全量 `yarn build`（~20 min）。版本必须严格匹配 2.2.6。
- **本地放插件先例**：`packages/plugins/@nocobase-example/` 21 个示例即 workspace 本地插件（上游自带）。自建插件照此放 `packages/plugins/` + preset deps 引用 + 重跑 install/build 即可——但这是**修改快照源码**，须在 `platform/nocobase/MANIFEST.md:48` local-modifications 表登记（Apache-2.0 §4(b)）。
- **纪律现状**：W~W5 全部建设走 REST API（collections:create / flowModels:save / themeConfig 行写入），**零源码修改**——MANIFEST local-modifications 表至今为空。W6 建议维持此纪律：插件扩张优先用「已装未启」池（上表 12 个），自建插件作为最后手段。
- **商业插件红线**：pro 插件永不复制（MANIFEST:64）；对外提供基于 NocoBase 的 SaaS/PaaS 被禁止（LICENSE §5.4），界面品牌除左上角主 LOGO 外不可移除（§5.2）。

## ③ 路由域归类 + 页面形态统计（问题 ④）

基线复用 `research/2026-09-28-w4-completeness/01-page-inventory.md`（206 行 = 16 group + 92 flowPage + 95 tabs + 3 v1 page）与 `w4-b5-menu-tree.txt`（菜单 IA 重整后 12 组 + 顶级 AI 工作台，198 行）。W4-B4/B5 已治理双分组（采购/采购管理、销售流程/销售管理归并）、退役「采购联系人（历史）」死页与工作台重复页。

| 域（菜单组） | 页数 | 形态构成 | 已有的非表格形态 | 纯表格页占比 | 重设计优先级 |
|---|---:|---|---|---:|---|
| 生产与计划 | 16 | 表×11 + 看板×1 + 甘特×1(v1) + iframe 终端×1 + 排程明细 | 排产甘特（v1 Gantt/mfg_order_operations）、生产订单看板、车间终端 iframe | 12/16 | **P1**（页数最多；排产看板/MO执行/MRP快照/计划工作台无筛选只读） |
| 仓储管理 | 14 | 表×13 + JS 库位平面图×1 + 收货终端 iframe | 库位平面图（JSBlockModel 自绘）、月度收发存 | 12/14 | P2（有库位图亮点；缺效期预警/统计卡） |
| 销售管理 | 9 | 表×6 + 看板×1 + 日历×2（交期/计划） | 销售看板、双日历 | 5/9 | P3（形态较全；n17 老页订单/回款/发票拖后腿） |
| 采购管理 | 8 | 表×9（含主子双表块）+ 看板×1 | 采购看板 | 7/8 | **P0**（比价表无筛选无新建；发票匹配/付款申请纯表格；单据行详情已在 W5-B7 重建） |
| 供应链 SRM | 8 | 表×7 + 图×2 + 看板×1（整改跟踪） | 绩效雷达图、整改看板 | 6/8 | P3（W 轮质量最高：8/8 有筛选 + JSRecord） |
| 质量管理 | 7 | 表×4 + 看板×2 + 质检工作台 iframe | 处置看板、质检看板 | 4/7 | P3 |
| 项目与协同 | 10 | 表 + 任务看板 + 任务甘特(v1) + 任务日历 + 审批中心/审批流配置 | 看板/甘特/日历三视图 + 审批中心 | 6/10 | P3（n17 系） |
| 经营分析 | 5 | 图×10 + 表×8（统计卡域） | 四大看板图表 | — | **P1**（看板表格均无筛选、18 图表块全部无标题、应收应付对账 5 处裸状态列） |
| 组织与系统 | 5 | JS×2（组织架构/权限矩阵）+ 表×3 | JS 自绘 | 2/5 | P2（「上级部门ID/ID」裸数字列） |
| CRM 客户 | 5 | 表×5 | 无 | 5/5 | **P0**（n17 老页：无筛选/无编辑/单列表单全中） |
| 资产管理 | 3 | 表×3 | 无 | 3/3 | P2（维保枚举中英混排无颜色） |
| 基础数据 | 2 | 表×4 平铺 + 应用中心(v1 聚合页) | 无 | 1/2 | P2（4 表平铺无 tab 分组） |
| 顶级散页 | ~2 | AI 工作台（AIChat+表）+ 工作台 | AIChat | — | P3（与工单页重复） |

全域形态总量（W4 审计 §2.3-2.5）：92 个 flowPage 中表格页 78（101 个表格块）、CreateForm 83 + EditForm 22 = **105 个弹窗表单全部单列**（rows×sizes=[24]，0 多栏分组）、看板 6、日历 3、甘特 2（v1）、图表块 18（全部无标题）、统计卡 131 张（W4-B3 heal 成果，W6 已紧凑化）、iframe 终端 3（url 硬编码 127.0.0.1:13110）、JS 自绘块 3。

**「表格+表单堆砌」最严重 Top 域**：① CRM 客户（5/5 纯表格，n17 存量）② 采购管理（7/8，比价表近死页）③ 生产与计划（12/16，绝对数最大）④ 资产管理（3/3）⑤ 经营分析（表格侧零筛选零格式化）。结构性根源是 **n17/n13 存量 27 页**（无筛选 100%、无编辑、单列表单）与 **105/105 表单单列**——这正是用户批评的直接对象，W6 重设计应以此为 P0 母题（工厂化改造：`formTwoColumnLayout` / `ensureFilterForm` / `applyTableDefaultSort` / `enumizeColumn` 已在 flow-page-lib 就绪，缺的是批量套用）。

## ④ PG 表全集按域归类（问题 ⑤⑥）

集合总数 113（W4 审计口径）= 下列业务表 ~110 + NocoBase 系统表。括号内为建表脚本。

| 域 | 表 | 关系要点 |
|---|---|---|
| SRM 供应链（h4/w2） | srm_suppliers / srm_certificates / srm_audit_checklists / srm_audit_records / srm_score_cards / srm_capas | 全部 belongsTo supplier；w8 加列 reject_streak / inspection_code；suppliers 50 字段仅 2 必填 |
| WMS 仓储（h5+B4+W2-B3） | **wms_zones / wms_bins（三级仓-区-位，含 SH-Q 检疫区/SH-TR 在途/SH-ADJ 差异虚拟区）/ wms_lots / wms_stock（UNIQUE SKU×bin×lot×status + 乐观锁 version）/ wms_movements（append-only 流水 + biz_date）/ wms_receipts / wms_shipments / wms_transfers（一步/两步在途）/ wms_counts（ABC 分类盘）/ wms_monthly_balances（月度收发存量值双轨）/ wms_reservations（两段式硬预留）/ wms_reorder_suggestions（ROP）** + hub_inv_warehouses / hub_inv_products / hub_inv_stock_moves（hub 建） | stock→bin/lot/product 三外键；movements→from_bin/to_bin 双库位；receipts→supplier+target_zone/bin；**库位表✅ 批次表✅ 序列号表❌**（批次粒度到 lot，无 sn 级） |
| MFG 生产（w5/w6/W2-B6） | mfg_boms / mfg_bom_lines / **mfg_bom_operations（BOM 挂工序 = 工艺路线载体，无独立 routing 版本表）** / **mfg_work_centers（并行产能）** / mfg_holidays / mfg_orders / mfg_order_operations（工序排程，v1 甘特数据源）/ mfg_material_issues（领料，lot FEFO 外键）/ mfg_material_returns / mfg_job_reports（报工 + CCP 参数 json）/ mfg_completions（完工入库，oqc_status + 成品批次） | orders→product；orders 加列 kit_policy / overissue_ratio / qty_transferred / actual_cost 等；issues/returns→mo+lot |
| QM 质量（w8/W2-B1） | qm_inspections（三检 IQC/IPQC/OQC/CCP + AQL 全套字段 + rigor 快照 + resubmission）/ qm_inspection_readings（行级读数+自动判定）/ **qm_aql_plans（GB/T 2828.1—2012 全 15 批量段 × 三严格度 135 行真表）** / qm_nc_dispositions（四路处置 + 六态审批） | inspections→product/supplier + ref 挂点（receipt/job_report/completion）；让步必走审批引擎 |
| PUR 采购（w3） | pur_requests / pur_request_lines / pur_rfqs / pur_rfq_suppliers / pur_quotes / pur_orders / pur_order_lines / pur_invoices / pur_payments | 主子链 PR→RFQ→quote→PO→IV→PAY 六级单据链 |
| SO/MRP/MPS 计划（w7） | so_orders / so_order_lines / mrp_suggestions / mrp_snapshots / mrp_confirm_intents / mps_plans / mps_plan_items | so→crm_customers；mrp 六项净额；mps max 合并零漂移 |
| CRM（n13） | crm_leads / crm_customers / crm_contacts / crm_deals / crm_quotes / crm_products / crm_activities / crm_follow_ups / crm_payments / crm_invoices / crm_targets | n17 系老表，关联多为文本列 |
| HUB 协同（n17） | hub_pj_×4 / hub_tk_tickets / hub_kb_×3 / hub_as_×4 / hub_hr_×3 / hub_md_×4 / hub_sales_×5 / hub_hd_×4 / hub_fin_×4 / hub_po_×3 | 34 表，演示域，与八域主链部分重复（供应商三重并存已在 W4 治理） |
| WFL 审批（w1/w3） | **wfl_flow_configs / wfl_flow_states / wfl_flow_transitions / wfl_approval_records / wfl_approval_todos（五表核心）+ wfl_gate_configs（卡口）** + wfl_records_\<docType\> 投影 + wfl_selftest_docs | 唯一转移源=审批引擎；timelineCollectionFor 投影表供时间线块 |
| KPI（w9） | kpi_snapshots | 四看板 + 移动驾驶舱共用 |
| 专家域（setup） | experts / expert_services / datasets / customs_export / orders | 交付附件 belongsToMany attachments |

### 食品行业特性字段现状（问题 ⑥）

| 能力 | 现状 | 证据 |
|---|---|---|
| 批次四日期模型 | ✅ **wms_lots**: lot_no 批号 + production_date 生产日期 + expiry_date 过期日 + removal_date 应下架日 + alert_date 预警日 + supplier 归属 + LOT_STATUS（合格/隔离/冻结）+ concession_flag（w8 加） | nocobase-h5-wms.mts:173-180 |
| 批次外键铺开 | ✅ 覆盖 11 表：wms_stock/movements/receipts(lot_no 文本)/shipments(FEFO 推荐批次)/transfers/counts/reservations、mfg_material_issues(FEFO)/material_returns/completions(成品批次 lot_no)、qm_inspections(lot_no+lot_qty) | 各建表脚本字段区 |
| FEFO 实现 | ✅ 双层：`fefo()` 纯推荐器（排序 **removal_date ASC → qty DESC**，过滤 qualified+good+expiry>today，只打印不落库，h5:1484-1512）；`reserve()` 两段式硬预留内嵌 FEFO 定批（取应下架日最早的单行足额批次，不自动拆分，h5:1963-1990）。引擎 CLI：`--fefo <sku> <qty>` | nocobase-h5-wms.mts |
| 正反向追溯 | ⚠️ **有引擎断言、无平台页面**：kpi-run.mts `--trace po=<code> mo=<code>` 做批次双向追溯断言——PO↑（PR/RFQ/quotes）、PO↓（receipts/IQC/stock）、成品批次→组件批次（ISSUE_WIP 流水为批次真源）→供应商（lot.supplier_id）三级链闭合 | kpi-run.mts:883-990 |
| **缺口** | ⚠️ 效期预警仅有库存看板内 T+1 临期清单表（wms_lots 四日期列，w9:209-220）与 KPI 临期预警批次数（kpi-run expiry_alerts），缺主动通知、预警色阶与小时级扫描（开源快照未带 schedule 类插件）；❌ 追溯查询 UI（只有 CLI 断言，业务人员不可用）；❌ 召回管理（无召回批次圈定/通知表）；❌ 序列号级追溯；❌ 温层展示只在 zones.temp_zone，bins/stock 页未透出；❌ wms_receipts.lot_no 是文本列而非外键（易脏数据）；❌ 成品效期不自动继承（mfg_completions 无效期字段，完工入库后需人工维护 wms_lots） | — |

## ⑤ flow-page-lib 与 v2 页面体系能力边界（问题 ⑦）

`examples/kb-agent/scripts/nocobase-flow-page-lib.mts`（1564 行，52 个导出）= v2 页面的程序化工厂层。能力清单：

- **传输/治理**：call/dataOf/signInWithRetry（指数退避）、listFlowModels（fail-closed 分页拒绝截断）/listRoutes、磁盘回滚记录（loadRollbackRecords/writeRollbackRecord）
- **uid 工厂**：withN17Prefix / w3b1 / w3b2 / w4b1 / w4b2 / w4b3 / w5b7 —— 每轮批次独立回滚锚点
- **行详情**：drawerPageTreeFor / rowDetailOpenView / ensureTableRowDetail / documentDetailPageTree（W5-B7 三段式：单据明细两栏 header facts + 审批时间线 + 关联单据块，已覆盖 7 个核心单据）/ approvalTimelineBlock / subtableBlockNode
- **行动作四件套**：saveRowViewAction / saveRowEditAction / saveRowDeleteAction / saveRowJumpAction（+ APPROVAL_JUMP_ROUTES 审批中心跳转表）
- **表格治理**：applyTableDefaultSort / applyColumnDisplayProps / rebuildColumnField / rebindColumnTitleField（修关联列裸 ID）/ enumizeColumn / statusColumnOptions / numberColumnProps（¥ 千分位）/ dateColumnProps / ensureFilterForm
- **表单治理**：formItemExtras（必填/placeholder/默认值）/ formTwoColumnLayout（多栏分组）/ assignFormDefaults / mergeNodeProps
- **统计卡**：statCardRaw / metricChart / STATCARD_CHART_HEIGHT / ensureMarkdownHint / seatGridTopBlocks

### v2 块模型可用集（各脚本实证在线）

TableBlockModel、KanbanBlockModel、CalendarBlockModel、ChartBlockModel（radar/line/doughnut 经 stepParams.chartSettings）、JSBlockModel（A-route 授权通道——库位平面图/组织架构/权限矩阵三个自绘块实证）、CreateFormModel/EditFormModel、FilterFormModel、统计卡、Markdown 提示块、IframeBlock（mode:url）、子表块、审批时间线块。

### 边界（做不到 / 需绕行）

| 限制 | 说明 | 现行绕行 |
|---|---|---|
| **v2 无 GanttBlockModel** | 甘特只能走 v1 uiSchemas 官方通道（GanttBlockProvider） | 排产甘特/任务甘特保持 v1 page（W4 §6 裁决：保留升级，中期看 v2 补块） |
| **v2 无 MapBlockModel** | map 插件已启用但 flow 引擎无地图块模型 | JS 块自绘或不用地图 |
| **看板拖写被引擎域禁用** | Kanban dragEnabled:false——拖拽走 collection:move 会绕过 wfl 锚点/FCS 排产权/质检单次判定 | 状态迁移一律走引擎动词（审批中心/终端/链脚本）；自由态看板（srm_capas/qm_nc_dispositions）保留拖拽 |
| **日历无 init.filter** | flow-engine 目录不认 resourceSettings 的 filter key | 未完成子集用 psql 断言替代 UI 过滤 |
| **甘特禁拖拽排产** | enableDragToReschedule:false，FCS 独占重排 | 排产权在 mfg-schedule 引擎 |
| **iframe 终端 url 硬编码** | 3 个终端页绑 127.0.0.1:13110 | 部署外发即断链，W6 需配置化 |

### W6 可基于 flow-page-lib 自建的领域工作台

任意域的「列表+筛选+默认排序+统计卡+图表+只读看板+日历+行详情三段式+审批跳转+iframe 终端」组合均可程序化批量铺设（W4/W5 工厂已验证 206 页规模）；**做不到的只有**：v2 内嵌甘特、地图块、拖拽改引擎域状态、日历数据过滤、以及需要新插件能力的块（多步表单块需启用 block-multi-step-form 后才有 v2 块模型可用性，待验证）。

---

## 摘要（三要点）

1. **插件差集要点**：快照 110 插件 + preset 收录 100，实测已启用 89（builtIn 76 + setup 强启 12 + audit-logs TRIAL 成功）；用户点名的 workflow 高级节点/import-export/图表/地图/通知**全部已启用**——「没有对应功能和 ui」的批评不成立于插件层，症结在**页面层未消费插件能力**（map/echarts/workbench/日历块在 92 页里只出现 18 图块+6 看板+3 日历）。真正差集仅 14 个 preset 内未启插件（form-drafts / multi-keyword-filter / block-multi-step-form / workflow-dynamic-calculation 最值得补）+ 21 个 example 演示插件。pro 商业插件不存在且被 MANIFEST 禁止引入；npm 装新插件空间近零（上游已全量收录），本地自建插件有 @nocobase-example 先例但需登记 MANIFEST 源码修改。
2. **表格表单堆砌最严重 Top 域**：① CRM 客户（5/5 纯表格 n17 老页）② 采购管理（7/8，比价表近死页）③ 生产与计划（12/16，绝对数最大）④ 资产管理（3/3）⑤ 经营分析（表格侧零筛选）。结构性根源：n17/n13 存量 27 页全无筛选全单列表单 + 105/105 弹窗表单单列。治理工厂（多栏表单/筛选器/默认排序/枚举列/格式化）已在 flow-page-lib 就绪，W6 可直接批量套用。
3. **食品特性字段缺口**：批次四日期模型（生产/过期/应下架/预警）与 FEFO（removal_date 优先序）+ 三级追溯断言已扎实落库；缺口全在**交付面**——无效期预警页面、无追溯查询 UI（仅 CLI）、无召回管理、无序列号追溯、receipts 批次为文本列、成品效期不自动继承。W6 应把「效期预警看板 + 批次追溯页面」列为食品行业差异化的第一批交付件。
