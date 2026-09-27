# W 轮交付说明与遗留问题总表（B0–B9，2026-09-26 收官）

## 交付总览

W 轮十批（`plans/2026-09-25-mfg-closure/`）把「mobile 对话式录入 + NocoBase 业务平台」升级为真实制造业完整业务闭环。全部批次 `setup-nocobase.mts verify` 绿；库存总账 `stock == Σmovements` 恒成立；`pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 660/660。

| 批次 | 主题 | 核心交付 |
|---|---|---|
| B0 | 供应商可见性 P0 | 补读视图 + 状态词汇对齐 |
| B1 | 通用审批引擎 | `wfl_*` 五表 + 金额阈值路由 + 双端同一入口 + 卡口四件套 + 审批中心页 |
| B2 | 供应商全生命周期 | mobile 登记归一 `srm_suppliers` + 准入审批链 + AVL 卡口 |
| B3 | 采购全链路 | PR→RFQ→报价→比价→PO 审批→收货→IQC 挂点→入库→发票三方匹配→付款 |
| B4 | 库存实务 | 移库过账 + 硬预留/ATP + ROP 扫描 + 循环盘点 + 旁路守卫 |
| B5 | 生产 I | BOM 版本 + 工作中心/工序/日历 + MO 审批/下达 + FCS 日桶排产 |
| B6 | 生产 II | 齐套硬预留 + 领退料 + 报工工序推进 + 完工入库 + OQC 挂点 + 成本双列 |
| B7 | 销售→MRP | SO 审批生效 + 报价版本 + MRP 日结（净需求公式 + JIT 窗）+ 计划单 mobile 确认卡 |
| B8 | 质量域 | 三检单据 + AQL 实测数组 + 严格度切换 + 四路处置（让步走审批）+ 季度绩效物化 |
| B9 | 真实看板 + 终验 | `kpi_snapshots` T+1 快照（22 码 × 90 天回算）+ 经营分析四页（9 图表）+ `/calc-kpi` 路由 + mobile KPI 查询 + 9 步端到端终验 + 双向追溯（19/19） |

B9 证据：`research/2026-09-25-w-round/` 下 `b9-final-01..07-*.png`（9 步双端截图）、`b9-admin-dashboard-*.png` ×4、`b9-mobile-kpi.png`、`b9-psql.txt`、`b9-kpi-reconcile.txt`、`b9-trace.txt`、`b9-final-chain.mts`（可重跑分段驱动）。

## 遗留问题总表（各批汇总）

| # | 来源 | 遗留 | 影响 | 建议处置 |
|---|---|---|---|---|
| 1 | B1 | 审批人 `approver_map` 单 admin 试点；金额阈值 10 万硬编码在 transition 条件里 | 多角色组织无法按人分派；阈值不可按单据类型配置 | 阈值入 `wfl_flow_configs` extras；approver_map 接用户表 |
| 2 | B2/B0 | `hub_po_suppliers` 旧表数据留档（「采购联系人（历史）」页） | 双表并存有误录风险 | 观察一个季度后归档删除 |
| 3 | B3 | `sendRfq`/`awardRfq` 无独立 CLI（仅 demo-chain 内函数）；发票容差 ¥0.05 固定 | RFQ 发出/授标只能走链路重放；容差不可配 | 抽 CLI 参数；容差入 flow extras |
| 4 | B4 | ROP 扫描/盘点 workflow 依赖外部 cron（开源快照无 schedule 插件）；`wms_counts` 无日期列（盘点日靠 `CNT-YYYYMMDD` 编码解析） | 夜间任务需手动/宿主 cron；日期解析对非标准编号不健壮 | 部署侧 launchd/cron 文档化；集合补日期列需迁移 |
| 5 | B5 | 跨天长工序（发酵/杀菌）排不进日桶（产品边界，已入合同话术）；工序时长时间静态 | 长工艺需拆单 | 拆单建议卡（D5 边界）已设计，未实现 |
| 6 | B6 | 齐套全锁：部分缺料时不能「先领已齐组件」（需仓库手工绕）；实际成本 VWAP 简化（不按工单归集） | 紧急订单灵活性差；成本粒度粗 | 部分领料开关入 MO 配置；成本归集属企业版范围 |
| 7 | B7 | MPS/预测未做（与 reordering rules 并用会冲突，Odoo 官方警告）；JIT 窗口 60 天固定 | 预测驱动补货缺位 | D6 边界已声明，按需再立项 |
| 8 | B8 | AQL 只实测三段（≤1200，段外 fail-loud）；放宽/停检切换未落；绩效权重 40/30/20/10 未溯源（行业惯例） | >1200 批量需人工判定或分批（B9 剧本即按 1200 分批演示） | 补全 15 段需转写箭头规则后的标准数组（企业版） |
| 9 | B9 | OEE 未物化（无停机/节拍数据源）；产能利用率按自然日历 8h/日估算口径粗 | 生产板少一个综合指标 | 先落停机记录表，再物化 OEE |
| 10 | W 轮通用 | 业务集合无 created-at/时间列（本套建法不落系统时间戳）；`wms_movements` 无日期列 | 月度收发存不可算；流水只有 id 序；KPI 库存类无历史（回算 null） | 集合补时间列是一次性迁移（涉及全部域表），未做 |
| 11 | B9 | ~~看板 KPI 表格块的 `defaultFilter`（board 过滤）未生效~~ **R1 已修复**：filter 移到 `stepParams.tableSettings.dataScope`（三段式 `{logic, items}`，beforeRender 时 dataScope action 重放进 resource filter group），并补 `defaultSorting` calc_date desc | 无 | `nocobase-w9-dashboards.mts`（R1）；需 `--rollback` 重建 |
| 12 | B9 | mobile 看板查询第二张汇总卡偶发 degraded（LLM 围栏超限/字段非法）；单指标卡（OTIF）稳定 | 多指标汇总偶尔折叠 | persona 加自查示例或拆两次查询 |
| 13 | B9 | `/calc-kpi` 夜间重算需外部 cron curl（与 #4 同根：无 schedule 插件） | T+1 节奏依赖部署侧 | 同 #4 |
| 14 | R2R 边界 | 只做数量台账 + 移动加权 + 应收应付余额，无会计凭证（D11，Odoo manual valuation 背书） | 对外话术须带「业务台账，非会计核算系统」 | 合同边界，非缺陷 |

## R1 定向修复批次（2026-09-26，终验 84 分 FAIL 后）

必修 5 项 + 建议 7 项全部落在以下文件（`--rollback` 重建四页后生效）：

| 文件 | 改动 |
|---|---|
| `examples/kb-agent/scripts/nocobase-w9-dashboards.mts` | rollback 前缀 `startsWith('w9kpi')`（原 `n17-w9kpi` 永不匹配）；`pageHasBlock` 加 uid 前缀 + 页面 ownership 限定；`rowsOf` fail-closed（meta.total 校验）；TableBlock 写 `tableSettings.dataScope` filter（board $eq 三段式）+ `tableSettings.defaultSorting`（calc_date desc）；`kpi_snapshots` rolesResources 只读守卫；verify 增 wire/守卫断言 |
| `examples/kb-agent/scripts/kpi-run.mts` | `rowsOf` fail-closed（`assertFullPage` 导出）；reconcile pageSize 4000（1982 行规模）；`PRESENT_ONLY` 补 pending_approvals/shortage_alerts/inbound_lines；`lot_pass_rate` 分母剔除 pending/空 result（已判定批口径）；`KpiFacts` 补 workCenterCount/oqcInspections 声明 + `ReportFact.duration_min`（去三处 as 断言逃逸）；selftest 补批次合格率/PRESENT_ONLY/rowsOf 截断负例；OTIF 口径 SQL 多余右括号 |
| `examples/kb-agent/scripts/nocobase-h5-wms.mts`、`nocobase-w6-mfg-exec.mts`、`mrp-run.mts` | `rowsOf` 同款 fail-closed 校验（同模式三处） |
| `examples/kb-agent/agent-presets/business-advisor/agent.cordis.yml`（+.dsh 镜像） | 补看板查询技能（kpi_snapshots 读端契约，与 mobile-form-assistant 同源姿势），Home「问经营」chip 入口对齐 |
| `packages/client/ui-mobile/src/client/fold.ts` | kpiLookupLabel 空 catch 补「吞的是什么、为何无他路」注释 |
| `research/2026-09-25-w-round/b9-final-chain.mts` | stage6 else 块缩进归位 |
| `research/2026-09-25-w-round/99-w-round-deliverables.md` | 本清单 + 遗留 #11 关闭 |

未处理：建议 9 的「N21 死链修复残留悬空方括号 ×10」——多轮模式扫描（空 `[]`、`[文字]` 无后随 `(`、`\]` 转义、中文紧邻方括号）只命中合法类型/mermaid/KaTeX 语法，验证器所指 10 处无法从现有内容复现，不做盲改。

## R4/R5 证据补录（2026-09-27）

- `r4-01-projection-sync.txt` — `.dsh` 投影 sixteen-form 头注释同步（修复前后全量 diff + identical 复核 + first-root-wins 勘误段）
- `r4-02-timeout-valid-value.txt` — NOCOBASE_TIMEOUT_MS 双正例（300000/150）`setup-nocobase.mts verify` 全绿，补 r3-00 #9 正例缺口
- `r4-03-liveness-post-restart.txt` — :3080 重启进程（PID 37891，lstart Sep 27 06:55:06）存活物理链：lsof/ps + 带时间戳 curl（/mobile ×3、/ ×2 全 200，07:16:45 > lstart）

## 复跑入口

```sh
node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts verify          # 全量结构门禁
node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --selftest            # KPI 纯公式
node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --backfill 90         # 快照回算（幂等）
node --import tsx/esm examples/kb-agent/scripts/kpi-run.mts --trace po=PO-B9F-0001 mo=MO-2026-0009
node --import tsx/esm research/2026-09-25-w-round/b9-final-chain.mts --stage s9   # 终验审计段
node --import tsx/esm examples/kb-agent/scripts/nocobase-h5-wms.mts --assert-ledger
```
