# Agent Note: W2-B7 运维收官——进程内夜间定时器、ap_balance 镜像码、应收应付对账页与报告围栏自查

Status: implemented

[English](2026-09-27-w2b7-ops-closure-nightly-ap-balance.md) | 中文

## 问题

四项 W 轮遗留落在本批（99 遗留 #4/#12/#13/#14）：夜间链（ROP 扫描 / MRP 日结 / KPI 物化 / 季度绩效）依赖外部 cron 逐动词 curl——开源 NocoBase 快照不带 schedule 插件；应付侧没有 KPI 码（ar_balance 已有、ap_balance 缺位——pur_invoices/pur_payments 的数据一直没被物化）；mobile 多指标看板卡偶发折叠成 degraded 通知（persona 围栏契约违约，99 #12）；b9 九步链无法整链复跑——stage 3 会对已判定的 QI 单重判（single-shot 语义）而 stage 7 会对已终态的 SO 再发货。批次 07-b7 要求四项全部关闭，且全链 s1–s9 复跑绿。

## 决策

- **夜间定时器是 `serve()` 里一个朴素的 `setInterval`，仅在 `W1_NIGHTLY_ENABLED=true` 时于 listen 之后挂载（默认关 = 零漂移：无定时器日志、无自动写库——80 秒空转探针显示 kpi_snapshots 与 mrp_suggestions 逐字节不变）。不引调度库：四个幂等动词配一分钟 tick 不值得一个 cron 解析器，进程内标记（闭包里的日期串）正是单进程部署需要的全部状态。** `>=` 触发比较加内存当日标记意味着重启可能同日补跑一次——每条腿都幂等（scanReorder 按策略去重、runMrp 开新 run、snapshotMonthlyBalances 与 calcDay 均 destroy-then-create），补跑无害且写进了 arm 日志。
- **env 校验在 serve 启动时即 fail-loud，与定时器是否开启无关**：`W1_NIGHTLY_ENABLED` 严格 `true`/`false`、`W1_NIGHTLY_AT` 严格 `HH:MM`、`W1_NIGHTLY_TZ` 任意 IANA 时区（以构造校验——`Intl.DateTimeFormat` 对垃圾值直接抛）。校验先于任何 NocoBase 调用，坏 env 在产生任何副作用之前死掉。
- **腿序为 scan-reorder → run-mrp →（仅月末）snapshot-month → calc-kpi，季初日追加 calc-scorecard。** 月末快照腿排在 calc-kpi 之前是有意为之：周转两码读结算月的 `wms_monthly_balances`，月末夜跑必须先物化快照再跑 KPI 腿，否则当晚周转码落不了行。任一腿失败记日志后继续下一腿（互不阻断）；整趟以逐腿汇总行收尾。`POST /run-nightly` 手动跑同一份腿体，无论 env 如何都可用——且从不占当日标记，定时器照常按点触发。
- **ap_balance 与 ar_balance 逐点镜像**：`Σ pur_invoices(invoice_amount WHERE match_result='confirmed' AND billed_at ≤ 日) − Σ pur_payments(amount WHERE doc_status='approved' AND pay_date ≤ 日)`，每日粒度、board=business、money 单位。confirmed 发票是应付确认态（正是打开付款卡口的那个状态），approved 付款是已结清流出——draft 付款永不冲减应付。每行快照的 note 声明「业务台账口径，非会计核算」（PLAN D11 把总账挡在范围外）。无 confirmed 发票的月读 0 非 null（q4(0−0)）；验收手算双侧闭合（AP 241,880−880=241,000；AR 280,820−256,000=24,820，其中 204,500 的未来 paid_at crm_payments 行被 paid_at ≤ 日锚正确排除）。
- **对账页是经营分析组的第五张 w9 flowPage**（board 类型拓宽为 'finance'）：两张逐码折线图走同一 F4 图表通道（ar_balance / ap_balance 按 calc_date）加四个只读明细块（so_orders、crm_payments、pur_invoices、pur_payments）。setup-nocobase verify 读图过滤条件时走服务器规范化的 `{logic, items:[{path, operator, value}]}` 形态——与 w9 的 `chartFilterValue` 同款读法；裸读 `filter.kpi_code` 会错过已持久化的行。25 码下限与镜像 diff 门禁（两份 persona 源与各自 `.dsh` 镜像必须逐字节一致，R4 r4-01 惯例）自此也挂进 setup verify。
- **mobile degraded 修复是 persona 文案，给两份带围栏的 preset（business-advisor + mobile-form-assistant，源与镜像同步双写）各加三段**：输出前自查清单（发送前逐项数条数对上限）、违规→修正对照（超 6 指标 → 留最关键 4 个、其余用一句叙述带过；表格超 10 行 → 前 8 行加「完整可追问」注明）、两步拆查指引（「经营怎么样」类宽问题先出 ≤4 指标汇总卡并附 send 追问动作；明细留给第二次查询）。渲染端的契约（metrics 1-6 / rows ≤8 / table ≤5×10 / actions ≤4、禁 `"table": null`）客户端本就在强制——persona 层现在阻止模型写出违约载荷，而不是让 UI 把它折叠。五连活探针（新会话、「经营怎么样」×5）5/5 渲染报告卡、degradedNotice 折叠零次，每张卡 ≤6 指标且动作里可见拆查指引；单指标 OTIF 轮同样干净。
- **b9 链复跑护栏**：stage 3 在 QI 行 result 已 ≠pending 时跳过 inspect 腿（single-shot 判定保留、复跑继续——release-receipt 本就幂等）；stage 7 在 SO 已 shipped 时整段跳过发货腿（首轮已消耗预留，shipSo 会死在「无有效预留」），并以 shipped_at 非空断言替代当日断言——首跑日期才是真相。加这两道护栏后 s1–s9 整链复跑全绿。

## 备注

- 非月末、非季初当日的夜间腿恰好三条（scan-reorder / run-mrp / calc-kpi）；月末快照腿与季初绩效腿只在各自的日子出现，所以 09-27 的正例日志是三腿形态，arm 行写明了完整条件形态。
- `runNightlySteps` 与 `parseNightlyEnv`/`tzNow`/`isMonthEndDay` 一样是导出的，未来 selftest 可以不经过 HTTP 直接驱动纯层。
- 对账页的 blocks[0] 是 so_orders 不是 kpi_snapshots——w9 verify 的 dataScope 走线循环在该页下找不到 kpi 表块即按构造 continue（`owned === undefined → continue`），无需特判。
- mobile 五连必须从通讯录进 persona（「智能填表助手」），不能进场景卡：首轮探针误入「企业数据助手」（无围栏纪律的场景 persona）得到纯叙述回答——roster 目标匹配是 `填表`，证据日志有断言。

## 证据

- `research/2026-09-27-w2-evolution/w2-b7-nightly-positive.txt`——armed 定时器 19:15 到点触发（arm 日志 → pass start trigger=timer → 三腿 ok → 3/3 pass done），随后 `POST /run-nightly` 返回 ok、同三条腿（trigger=manual）；kpi_snapshots 2026-09-27 当日 26 行（25 码 + 1 维度），ap=241,000 / ar=24,820。
- `w2-b7-nightly-default-off.txt`——不带 env：80 秒空转零 timer/pass 日志行（唯一 "nightly" 命中是 serving 行列出 POST /run-nightly 路由），kpi_snapshots 2096/8107 与 mrp_suggestions 26 不变；手动 `/calc-kpi` curl 照常 ok（W 轮路径未动）。
- `w2-b7-nightly-negatives.txt`——`W1_NIGHTLY_AT=99:99`、`W1_NIGHTLY_ENABLED=abc`、`W1_NIGHTLY_TZ=Mars/Olympus` 均在 serve 启动即抛（exit 1），先于任何 NocoBase 调用。
- `w2-b7-arap-reconcile.txt`——AP 手算（241,880−880=241,000 ✓）、AR 手算含未来 paid_at 排除（280,820−256,000=24,820 ✓）、无 confirmed 发票月读 0 非 null（2026-06-30）、四个明细块行数与 psql 对齐（8/10/5/2）。
- `w2-b7-setup-verify.txt` + `w2-b7-final-verify.txt`——setup verify 两次 OK（25 码下限、对账页四块 + 两趋势图、镜像 diff 门禁）。
- `w2-b7-final-chain.txt`——s1–s9 整链复跑全绿，两道新护栏可见（s3 前轮已判定跳过重判 / s7 前轮已完成 shipped 跳过发货与当日断言），s8 落 26 rows / 25 valued。
- `w2-b7-final-gates.txt`——`--assert-ledger`（32 组、138 条流水）、`--selftest`（ap_balance 镜像用例）、`--backfill 90` 幂等（两趟均 2077 rows）。
- `w2-b7-final-w2-capabilities.txt`——W2 六大能力活证据（AQL 135 行 × 3 严格度 / MPS 计划 / 月度台账 2026-08+09 / KPI 91 天 × 25 码 / extras 覆盖 5 流 / kit_policy full_lock 18 + partial_allowed 2 / ap_balance 241,000）。
- `w2-b7-arap-page.png`、`w2-b7-arap-details.png`、`w2-b7-arap-charts.png`——对账页四个台账块与两条趋势线（ar 线在回放窗口内穿越负值、ap 线在 09-26 发票确认后阶跃至 ~241K）。
- `w2-b7-mobile-bizhow-1..5.png` + `w2-b7-mobile-otif.png` + `.shoot-b7-mobile-evidence.json`——五个新会话宽问题，degraded 合计 0、报告卡 5/5（每张 ≤6 指标、拆查指引动作在场），OTIF 单指标干净。

## 备选方案

- **cron 表达式解析器或调度依赖（node-cron 类）**——拒绝：需求就是带 env 开关的每日一次触发；60 秒 `setInterval` 加墙钟比较就是全部状态机，部署文档明确调度器二选一（内置定时器或外部 cron），勿双跑。
- **仅在精确 HH:MM 分钟窗口内触发**——拒绝：`>=` 加当日标记容忍繁忙或晚启动的进程（02:30 之后起的 serve 当天仍会跑一次）；因为进程忙了六十秒就整夜漏跑，对幂等链是错误的失败模式。
- **持久化运行标记表**——拒绝：每条腿幂等，重启同日补跑是无害空转；标记表会给一个纯调度关注点增加可写面。
- **`/run-nightly` 手动跑后标记当日**——拒绝：手动路由是运维的验证工具；让它压制当晚的计划任务，等于让手动探针摧毁它要验证的调度。
- **ap_balance 做成月度粒度码（仅月末落行）**——拒绝：批次文档的「月度」说的是对账台账性质而非粒度；镜像 ar_balance（每日落行）让两侧在每个日期上可比，且趋势图拥有与 AR 侧相同的 90 天分辨率。
- **draft pur_payments 计入 AP 流出**——拒绝：付款申请未 approved 不是钱出去（W 轮 s7 链先批 PAY 才算结清）；note 声明 approved-only 锚。
- **渲染端自动裁剪（静默削掉超限卡）**——拒绝：卡会显示模型从未背书的数字；围栏契约是模型的输出纪律，修复属于 persona 文案（自查 + 对照 + 拆查），渲染端的折叠保留为最后一道信号。
- **重置 QI 单让 stage 3 无条件重判**——拒绝：single-shot 判定是质量引擎的不变式（W2-B1 保留至今）；复跑护栏只跳过、永不改判定。

## 后果

本 Note 记录的决策自此成为对应面的现行契约（详见 决策 与 证据）。
