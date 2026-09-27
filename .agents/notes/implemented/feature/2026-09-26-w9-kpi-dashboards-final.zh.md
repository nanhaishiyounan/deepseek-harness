# Agent Note: W9/B9 真实数据看板——T+1 KPI 快照、90 天回算与 W 轮九步终验

Status: implemented

[English](2026-09-26-w9-kpi-dashboards-final.md) | 中文

## 问题

到 B8 为止，平台的单据闭环齐了但缺度量层：没有物化 KPI 存储、没有真实聚合驱动的看板页、没有 OTIF 的准时锚点（集合没有 `shipped_at`）、也没有一条可重跑的追溯命令能把一张 PO 和一张 MO 沿上下游整链走一遍。本批（plans/2026-09-25-mfg-closure/10-b9-dashboards-final.md）交付 KPI 引擎（`kpi-run.mts`）、`kpi_snapshots` 集合与「经营分析」四看板页（F4 图表通道）、mobile 驾驶舱承接（persona 技能 + fold 投影），并跑完 W 轮 9 步端到端终验（双端截图 + 逐步 psql 断言）。

## 决策

**T+1 物化快照，只做趋势——不做红绿灯。** PLAN D9 原文执行：`kpi_snapshots` 按（board、kpi_code、dim、value、calc_date）存，对账 SQL 口径随 `note` 列落到每一行——看板把口径摆在数字旁边。22 个 KPI 编码分四板（经营 5 / 供应链 6 / 生产 5 / 库存 6），全部是活单据的纯聚合、psql 可复算；`--selftest` 钉住批次文档的工例（FPY=(90−5)/90、OTIF 分子分母口径、账实相符率、percentile_cont 对齐、呆滞库龄、临期窗口、RTY 连乘、KPI 表形态）。

**90 天回算物化 null，不造数。** `--backfill 90` 每天每码写一行（90 天 1981 行——连续性下限）。真源不存在的日期（库存表无历史、W 轮集合无 created-at 列）写 `value=null`：行保住连续性计数，图上就是没有点。带单据日期的 KPI（approved_at / received_at / report_date / pay_date / count_no 的 CNT-YYYYMMDD 段）逐历史日真实重演；三个现状态 KPI（资金占用/在制/在架）按声明的口径只算当日。

**OTIF 需要真锚点，`so_orders` 因此长出 `shipped_at`。** 发货引擎在「全部交付」瞬间落章；W 轮重放世界里已发订单回填 `shipped_at = approved_at`（两者同日落地——回填打日志明示）。毛利率/计划达成率的完工时间锚在该 MO 最晚一张 `mfg_completions.completed_at`（mfg_orders 没有该列）——口径写明 JOIN。

**图表直读 `kpi_snapshots`，走 F4 authoring 通道。** 九块：每板折线趋势 + 柱状对比，供应链页加供应商五维雷达（h4 的 `visual.mode='custom'` 原生 ECharts 线），库存页加 wms_lots 效期台账表（T+1 扫描节奏写在页面描述里——小时级扫描要开源快照没有的 schedule 插件；approval-engine serve 的 `/calc-kpi` 是 cron 目标）。值得记的坑：图表 query 的 filter 必须写成 `{kpi_code: {$eq: …}}`（裸标量被拒），服务端会规范化成 `{logic, items: [{path, operator, value}]}`，持久化的行还会丢掉 `resource` 键换成 `collectionPath`——存在性判别两种形态都解析，`ensureCharts` 对历史双建自愈。

**追溯走 ISSUE 流水，不走领料行。** `--trace po=<PO> mo=<MO>` 断言 19 条链：PO 向上到 RFQ→PR 与三家报价，向下过收货→IQC→批次四日期→发票→付款；MO 向上到 BOM 与 driver_suggestion→SO，向下过领料→报工→完工→成品批次。批次三级追溯（成品批次 → 组件批次 → 供应商）最初读 `mfg_material_issues.lot_id`——该列按设计留空（引擎过账时定批）；ISSUE_WIP 流水才是批次真源，trace 现在走流水（成品 MFG-20260926-04 → 组件 RM-260920-M1 → 供应商 山东鲁丰）。

**B3 期的真缝隙浮出：早期 seed 的流带着未替换的金额条件。** mobile 登记的 PR（真有 `total_est`、没有 `total`）在 act() 处 fail-loud——存量 `pur_requests` 的 transition 还留着金额字段替换机制出现之前的原文 `total <= 100000`。`seedDocFlow` 的幂等分支从「keep」升级为「修复」：每条 transition 与 `extras.amount_field` 收敛到配置目标——w7 的 gate-repair 模式搬到流表上。这是全轮第一次真实 PR 送审；此前每张 PR 都是种子直接 approved。

**mobile 驾驶舱 = 读技能 + 工具行投影——不加新组件。** persona 增加看板查询技能（kpi_code ↔ 名称对照、T+1 副题、`value=null` 如实说暂不可算、维度行进 table 槽）；`fold.ts` 把指向 `kpi_snapshots` 的 `nb_list` 工具行改标为查询看板指标（有测试）；首页快捷入口本就路由到填表助手。验收问句「这周 OTIF 多少」渲染出真实 ReportCard（快照 66.7%）。

## Consequences

`kpi_snapshots` 成为 admin 看板与 mobile 驾驶舱的唯一读源；all 链每次拉起都重放 90 天回算（已落定的日按 upsert 幂等）；`seedDocFlow` 现在就地修复存量流配置；`so_orders.shipped_at` 成为发货引擎落章的常驻列。


## 备选方案

- **把 OEE 物化成 KPI**——可用率/性能需要停机与节拍记录，W 轮数据面没有；拼出来的合成数违反无 mock 原则。留作书面缺口。
- **看板上做行业对标红绿灯**——PLAN D9：先做趋势与同环比；没有溯源基准的配色是装饰。
- **小时级临期扫描**——页面写明 T+1 节奏；接小时级任务需要开源快照没有的 schedule 插件，假装有就是谎报节奏。
- **用现状回填历史库存 KPI**——每个历史日都会显示今天的库存；null 才是诚实的值。
- **手工（psql）修残留 transition**——下次 reset 还会咬人；修复属于 `seedDocFlow` 的 ensure 路径。

## 验证

`kpi-run.mts --selftest`（纯层）、`--calc-kpi`、`--backfill 90`（1981 行 / 90 天 / 22 码）、`--trace po=PO-B9F-0001 mo=MO-2026-0009`（PASS 19/19）。9 步剧本活体跑通（真实服务、mobile 腿真实 LLM）：mobile 登记 → 准入，PR → RFQ → 3 报价 → 授标 → PO，收货 → AQL J/80 d=2≤Ac5 passed → 放行带四日期，SO → 审批 → 硬预留，MRP 日结 → mobile 计划卡 → 转单 MO → 审批 → 下达 → 排产 apply → 齐套 → 领料 → 3+1 报工 → 完工 → OQC passed → 放行，发货回写 `shipped_at` → 三方匹配发票 → 付款生效。对账：OTIF 0.6667 = 2/3、FPY 0.9972 = 106818/107118、账实相符率 0.9825 = 1−26/1487（psql 手算与快照逐项相等）；MRP 收官 run 六项复算 6 行全等；`--assert-ledger` 平衡（31 组 127 条流水，B9 五类事件齐）。门禁：`setup-nocobase.mts verify` 含 B9 下限全绿（集合、shipped_at、四页、≥8 kpi 图 + 雷达、≥90 天 × 22 码）；`pnpm vitest run packages/client/ui-mobile packages/connector/tool-nocobase` 660/660；typecheck 与 oxlint 在触达面上 0。证据：research/2026-09-25-w-round/ —— b9-final-01..07-*.png（逐步双端）、b9-admin-dashboard-*.png ×4（ECharts canvas 实渲染）、b9-mobile-kpi.png、b9-psql.txt（逐步断言 + MRP 复算 + 总账）、b9-kpi-reconcile.txt（三项手算）、b9-trace.txt（19/19）、b9-final-chain.mts（可重跑的分段驱动）。
