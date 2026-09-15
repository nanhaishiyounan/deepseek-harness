# 批次 H4：五系统地基 + SRM 完整闭环

> 隶属 [PLAN.md](PLAN.md)。主题三首期第一腿。前置：无（与 H1-H3 独立，可并行排程）。调研依据 [03](03-research-enterprise-systems.md)（架构裁决）/[R9 报告](../../research/2026-09-14-srm-food-nocobase.md)（实体细节）。规模：新脚本 `nocobase-h4-srm.mts`（建表+页面+种子）+ verify 扩断言；6 新表 + ~8 v2 页 + 1 菜单组。

## 第 0 步（必做）

1. 探活：:13000 admin 登录（admin@nocobase.com/admin123）、:3080 网关、`flowModels:list` 规模读数（为分页扩容决策取基线）。
2. 复读 [`nocobase-flow-page-lib.mts`](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts) 与 [`nocobase-f2-crm-v2.mts`](../../examples/kb-agent/scripts/nocobase-f2-crm-v2.mts) 骨架（本批模板）；确认 `withN17Prefix('h4srm', ...)` 前缀风格与 `batchScopedRows` 圈批。
3. 与 [`nocobase-crm-modules.mts`](../../examples/kb-agent/scripts/nocobase-crm-modules.mts)/[`nocobase-hub-modules.mts`](../../examples/kb-agent/scripts/nocobase-hub-modules.mts) 的 `input()/select()/belongsTo()` 字段工厂签名核对（本批复用）。

## 改动面 1：地基（物料主数据食品字段 + 工厂扩容）

1. **hub_inv_products 幂等加列**（新脚本 `nocobase-h4-foundation.mts` 或并入 h4 主脚本 ensureColumns 段）：`shelf_life_days`（保质期天数）/`temp_zone`（温层 select：常温/冷藏/冷冻）/`storage_conditions`（储存条件文本）/**`gb2760_category`（GB2760 食品分类号，为 I 轮 PLM 预埋）**/**`allergens`（致敏原多选）**——全部 nullable 加列零破坏；种子演示数据补 3-5 个食品 SKU（酱油/饮料/休闲食品，效期与温层真实口径）。
2. **flow-page-lib 分页扩容预留**：[`listFlowModels`](../../examples/kb-agent/scripts/nocobase-flow-page-lib.mts) fail-closed 分页已存在——本批把 pageSize 提至当前上限并留 TODO（五系统全上后 >2000 时改分页迭代；当前 26 页规模实测够用）。
3. **verify 扩断言框架**：[`setup-nocobase.mts`](../../examples/kb-agent/scripts/setup-nocobase.mts) 增 `missingV2H4` 标题清单 + srm_* list probes + n18ai- 计数下限上调（25 → 25+新表单数，实测后定）。

## 改动面 2：SRM 数据模型（6 表，R9 九实体 MVP 裁剪）

| 表 | 关键字段（R9 报告 §实体表全文引用） | 要点 |
|---|---|---|
| `srm_suppliers` | 名称/统一社会信用代码/类别（原料/包材/服务）/联系信息/生命周期状态（潜在→准入评审→合格→优选→受限→冻结/淘汰）/**三套分级独立字段**（监管风险/审核评级/IQC 严格度）/黑名单标志+原因 | 状态机走选择字段+workflow |
| `srm_certificates` | 证照类型（营业执照/生产许可 SC/经营许可/ISO22000/HACCP）/证号/发证日/**到期日**/预警状态（正常/30/60/90 天预警/过期）/附件 | 效期预警计算列或定时 workflow |
| `srm_audit_checklists` | 检查表模板（GMP/HACCP/ISO22000 体系）/检查项分组/评分权重 | 种子内置 GMP 检查表 ~20 项 |
| `srm_audit_records` | 供应商 m2o/检查表 m2o/审核日期/审核员/各维度评分（质量/体系/合规）/总评 A/B/C/D/不符合项摘要 | 现场审核留痕 |
| `srm_score_cards` | 供应商 m2o/考核期（季度）/五维评分（质量/交期/价格/服务/合规）/加权总分/评级结果/评级变化 | 雷达图数据源 |
| `srm_capas` | 供应商 m2o/来源（审核/质检/投诉）/问题描述/8D 报告附件/整改措施/责任人/**状态（发起→供应商回复→验证→关闭）**/截止日/超期标志 | 整改跟踪看板数据源 |

关系：全部 m2o 指向 srm_suppliers（batchScoped 圈批防污染）。

## 改动面 3：SRM 页面（~8 v2 页，F2/F3 骨架）

1. 菜单组「供应商管理」（desktopRoutes `parentId` 挂组，icon 白名单内选）；
2. 供应商列表（Table：状态/分级/证照效期列）+ 供应商详情（Details + tabs：证照子表格/审核记录/评分卡历史/CAPA）；
3. 供应商准入（CreateForm + workflow 审批四节点：资质审核→现场审核录入→评级→准入激活）；
4. 证照效期预警页（Table + Filter：按预警状态过滤；30/60/90 分组）；
5. 审核评分录入（CreateForm 挂 srm_audit_records，n18 自动 AI 挂载）；
6. 绩效评分卡页（Table + **Chart 雷达图**——v1 echarts 插件，F4 `flowSurfaces:addBlock` 通道）；
7. 整改跟踪看板（Kanban：按状态列分组，F1 骨架）；
8. 种子数据：8-10 家供应商（名称对齐 kb-agent 现有演示域——专家/订单数据风格）、20+ 证照（含 2 个临期 30 天/1 个过期演示预警）、3 份检查表模板、12 份审核记录、16 张评分卡（4 个季度×4 家）、5 个 CAPA（各状态覆盖）——**种子幂等**：marker+fingerprint（crm/hub modules 脚本惯例）。

## 改动面 4：n18 AI 挂载（零改动自动覆盖）

新页面走标准 AddNew→顶层 CreateFormModel spine → 重跑 [`nocobase-n18-form-ai.mts`](../../examples/kb-agent/scripts/nocobase-n18-form-ai.mts) 自动挂 `AIEmployeeButtonModel`（uid `n18ai-<formUid>`）——供应商准入/审核录入/CAPA 三表单获得 AI 头像球；verify n18ai- 计数下限上调。

## 验收断言（证据落 `demos/acceptance-h4/`）

1. **端到端闭环实测**（浏览器 :13000 admin）：种子供应商「潜在」→ 准入表单（AI 头像球出现+一次中文描述流式填充实测）→ 提交进 workflow 审批 → 资质审核通过 → 审核记录评分 A → 生命周期状态变「合格」→ 评分卡页雷达图渲染 → 制造一条 CAPA→看板「发起」列出现——每步截图+单据状态断言；
2. 证照预警：预警页出现 30 天临期分组（种子设计值）；过期证照供应商在准入表单被 workflow 拦截（或明显警示——拦截实现为 workflow 条件分支）；
3. verify 全绿：missingV2H4 标题清单 + srm_* 六表 list probes 200 + n18ai- 新下限 + 既有 26 页/CRM/Hub 零回归（probes 全保持）；
4. 幂等：`setup-nocobase.mts` 重放 ×2 全 kept（种子 marker 命中零新增；flowModels kept-spine 完整）；
5. 物料加列：hub_inv_products 列表页出现食品字段（既有列零回归）；list probe `hub_inv_products` 含新字段；
6. pnpm 仓库门禁不涉（纯 examples 脚本+DB）——`pnpm run test` 相关面（kb-agent spec）+ doc-sync（QUICKSTART 增 SRM 段）EXIT=0。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| workflow 审批配置复杂度超预期（条件分支/超期） | 中 | 降级：状态字段手动流转+审批仅一节点；闭环演示语义保持 |
| Chart 雷达图走 F4 通道的服务端规范化（query JSON 手写易错） | 中 | F4 脚本头注释模板照抄；不可行降级为五维条形图（Chart 内置类型） |
| 种子供应商名与 KG 现有 experts/orders 演示域冲突感 | 低 | 命名对齐现有演示风格（R9 报告建议清单）；不建 KG 边（kg-mappings 白名单不动） |
| verify 计数上调的误杀（手工白名单） | 低 | 沿用 KNOWN_HAND_CONFIGURED_AI_BUTTONS 机制 |

回滚：h4 单脚本单提交；`--rollback`（flow-page-lib 磁盘回滚记录）+ 种子 marker 清除即回 H3 终态。
