# W2 轮交付总表（制造业演进清偿 · B1–B7 收官）

> 输入 = [W 轮 99 文档 14 项演进清单](../2026-09-25-w-round/99-w-round-deliverables.md)；批次规格 [`plans/2026-09-27-w2-evolution/`](../../plans/2026-09-27-w2-evolution/PLAN.md)。本批收官日 2026-09-27：9 步链 s1–s9 全量复跑一次全 PASS（含 s3 已判定跳过护栏与 s7 已终态幂等处置，见 [`w2-b7-final-chain.txt`](w2-b7-final-chain.txt)）。

## 一、14 项遗留逐项处置结论

| # | W 轮遗留 | 处置 | 落点与实证 |
|---|---|---|---|
| 1 | 审批人单 admin、阈值 10 万硬编码 | **已清偿（B5）** | 阈值/容差入 `wfl_flow_configs.extras`（5 流已配置），approver_map 多角色分档路由；`w2-b5-threshold-cases.txt`、`w2-b7-final-w2-capabilities.txt` |
| 2 | `hub_po_suppliers` 旧表留档 | **拒绝（观察期未满）** | 距归一不足一季，保持现状；W2 未动该表 |
| 3 | sendRfq/awardRfq 无 CLI、发票容差 ¥0.05 固定 | **已清偿（B5）** | 容差入 extras + 两动词 CLI 参数化；`w2-b5-rfq-cli.txt`、`w2-b5-negatives.txt` |
| 4 | 夜间任务依赖外部 cron、`wms_counts` 无日期列 | **已清偿（B3+B7）** | B3 补 `biz_date`（覆盖率 100% 断言）；B7 serve 内置夜间定时器（默认关零漂移、env fail-loud、`/run-nightly` 手动等价）；`w2-b7-nightly-positive.txt` / `w2-b7-nightly-default-off.txt` / `w2-b7-nightly-negatives.txt` |
| 5 | 跨天长工序排不进日桶 | **已清偿·方案 B（B6）** | FCS 口径显式声明 + 结构化拆单建议卡（决策 D9，不做跨天连续排）；`w2-b6-split-card.png`、`w2-b6-kit-cases.txt` |
| 6 | 齐套全锁无部分投料；成本不按工单归集 | **齐套已清偿（B6）/ 成本归集拒绝** | `kit_policy`（full_lock 18 + partial_allowed 2 实证）+ `overissue_ratio`；成本归集维持企业版边界（99 已定性）；`w2-b7-final-w2-capabilities.txt` |
| 7 | MPS/预测缺位、JIT 窗 60 天固定 | **已清偿（B2）** | `mps_plans`/`mps_plan_items` 月度 max(SO 未交,预测) 合并 → MRP gross0 新需求源（覆盖互斥代码强制）；`W1_PLAN_HORIZON_DAYS` 可覆盖；`w2-b2-mps-mrp.txt`、`w2-b2-admin-mps-plans.png` |
| 8 | AQL 只 3 段、放宽/停检未落、权重未溯源 | **全表已清偿（B1）/ 权重溯源拒绝** | 15 段 × 3 严格度 135 行种子 + 四态状态机（转移得分≥30 放宽、加严累计 5 批停检）；权重 40/30/20/10 维持行业惯例 note 标注（无标准原文可溯）；`w2-b1-aql-cases.txt`、`w2-b7-final-w2-capabilities.txt` |
| 9 | OEE 未物化 | **拒绝（无数据源）** | 无停机/节拍数据，假指标违背真实商业化原则；停机记录表落地后再立项 |
| 10 | 业务集合无时间列、movements 无日期 | **已清偿（B3+B4）** | 全部 `wms_*` 业务时间列 + 存量回填（`biz_date IS NULL`=0）+ KPI 库存三码按日重放 + 周转两码月度粒度；91 天 × 25 码快照；`w2-b3-backfill-assert.txt`、`w2-b4-kpi-history.txt` |
| 11 | 看板 defaultFilter | **已关闭（W 轮 R1）** | dataScope + defaultSorting 走线，W2 未动；setup verify 持续绿 |
| 12 | mobile 多指标卡偶发 degraded | **已清偿（B7）** | persona 围栏自查清单 + 违规修正对照 + 拆查指引（business-advisor + mobile-form-assistant 源与 `.dsh` 镜像双写，diff 门禁进 setup verify）；五连「经营怎么样」degraded=0、报告卡 5/5；`w2-b7-mobile-bizhow-1..5.png` |
| 13 | `/calc-kpi` 外部 cron | **已清偿（B7，与 #4 同根）** | 同夜间定时器；手动四动词 curl 路径永久保留（默认关零漂移实证） |
| 14 | R2R 只到余额、无凭证 | **余额内已清偿（B7）/ 总账凭证继续拒绝** | `ap_balance` 镜像码（AP 手算 241,880−880=241,000 ✓）+ 应收应付对账页（两趋势图 + 四明细块，行数与 psql 一致）；D11 合同边界维持；`w2-b7-arap-reconcile.txt`、`w2-b7-arap-*.png` |

小计：**11 项清偿、3 项拒绝**（#2 观察期、#9 无数据源、#14 总账凭证——拒绝理由均在批次文档与 PLAN §3 留档）。

## 二、W2 新增交付面（按批次）

| 批 | 交付 | 关键证据 |
|---|---|---|
| B1 | AQL 全表（135 行 × normal/tightened/reduced）+ 箭头解析 + 四态转换 + 存量行补 rigor | `w2-b1-aql-cases.txt`、`w2-b1-admin-aql-full-table.png` |
| B2 | MPS 主生产计划层（max 合并防双计 + 覆盖互斥 + 审批锁快照） | `w2-b2-mps-mrp.txt`、`w2-b2-mobile-mps-query.png` |
| B3 | `biz_date` 落库回填 + `wms_monthly_balances` 月末快照（差分对账 + `--recalc`）+ 月度收发存台账页 | `w2-b3-backfill-assert.txt`、`w2-b3-ledger-page.png` |
| B4 | KPI 库存三码按日重放 + `inv_turnover_rate`/`inv_turnover_days`（月度粒度） | `w2-b4-kpi-history.txt`、`w2-b4-inventory-charts.png` |
| B5 | 审批阈值/容差配置化（extras）+ approver_map 多角色 + RFQ CLI | `w2-b5-verify.txt`、`w2-b5-approval-center.png` |
| B6 | MO 级齐套策略（kit_policy/overissue_ratio）+ FCS 跨天口径显式化与拆单建议卡 | `w2-b6-kit-cases.txt`、`w2-b6-split-card.png` |
| B7 | serve 内置夜间定时器（默认关）+ `ap_balance`（第 25 码）+ 应收应付对账页 + mobile 围栏自查 + b9 链 s3/s7 复跑护栏 + 全链收官 | `w2-b7-nightly-*.txt`、`w2-b7-arap-*`、`w2-b7-final-chain.txt` |

## 三、收官门禁记录（2026-09-27）

| 门禁 | 结果 | 证据 |
|---|---|---|
| 9 步链 s1–s9 全量复跑 | **全 PASS**（s3 护栏 / s7 幂等跳过生效，s8 落 26 rows / 25 valued） | `w2-b7-final-chain.txt` |
| `setup-nocobase.mts verify` | **OK**（25 码下限 + 对账页四块两图 + persona 镜像 diff 门禁 + 既有全断言） | `w2-b7-final-verify.txt` |
| `kpi-run --selftest` | **OK**（含 ap_balance 镜像三用例） | `w2-b7-final-gates.txt` |
| `kpi-run --backfill 90` 幂等 | **两趟均 2077 rows** | `w2-b7-final-gates.txt` |
| `nocobase-h5-wms --assert-ledger` | **OK**（32 组、138 条流水，Σmovements==stock） | `w2-b7-final-gates.txt` |
| 定时器正例 / 默认关零漂移 / 负例 ×3 | **全过**（3/3 腿 ok + 手动等价；80s 零漂移；三 env 启动即拒 exit 1） | `w2-b7-nightly-{positive,default-off,negatives}.txt` |
| AR/AP psql 手算对账 | **双侧闭合**（AP 241,000 / AR 24,820；未来 paid_at 204,500 正确排除；无 confirmed 发票月=0 非-null） | `w2-b7-arap-reconcile.txt` |
| mobile 五连取证 | **degraded 合计 0、报告卡 5/5、OTIF 单指标稳** | `w2-b7-mobile-*.png` + `.shoot-b7-mobile-evidence.json` |
| W2 六大能力链上实证 | **齐**（AQL 135×3 / MPS / 台账 2 月 / 91 天×25 码 / extras 5 流 / kit_policy 分布 / ap_balance） | `w2-b7-final-w2-capabilities.txt` |
| oxlint（staged 配置，改动脚本） | **0 警告 0 错误** | 本文件同目录 git 记录 |

## 四、W2 遗留表

| # | 遗留 | 定性 | 建议 |
|---|---|---|---|
| 1 | `hub_po_suppliers` 旧表观察期（W 轮 #2 顺延） | 观察期至 2026-12（归一后一季） | 到期归档（`--rollback` 前缀式清理 + note） |
| 2 | OEE 物化前置——停机/节拍数据源缺位（W 轮 #9 顺延） | 需先建 `mfg_downtime_records` 类采集面 | 数据源落地后按 availability×performance×quality 立项 |
| 3 | 总账/凭证（W 轮 #14 拒绝部分顺延） | D11 合同边界，企业版范围 | 商业化需要时另行立项（会计期间/科目表/凭证分录） |
| 4 | MPS 计划行当前 1 行且 void（B2 验证后释放） | 数据形态非缺陷——MPS 引擎与互斥已实证 | 商业化演示前重灌一组活跃 MPS 行走完整确认链 |
| 5 | KPI 成本类口径为现值移动加权（capital_occupied/周转两码） | 已在快照 note 声明口径（非期间加权） | 若需期间成本，等成本归集（#3）一并立项 |
| 6 | 夜间定时器 marker 为进程内存（重启同日补跑一次） | 设计取舍（各腿幂等，补跑无害，note 留档） | 多实例部署时再引分布式锁 |

## 五、Agent Note 索引（W2）

- [B2 MPS](../../.agents/notes/implemented/feature/2026-09-27-w2b2-mps-master-schedule.md) · [B4 KPI 历史回放](../../.agents/notes/implemented/feature/2026-09-27-w2b4-kpi-history-replay.md) · [B7 运维收官](../../.agents/notes/implemented/feature/2026-09-27-w2b7-ops-closure-nightly-ap-balance.md)（B1/B3/B5/B6 的决策记录在各自批次文档与 `w2-bN-*` 证据内）
