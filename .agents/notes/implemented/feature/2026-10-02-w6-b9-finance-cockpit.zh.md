# Agent Note: W6-B9 经营驾驶舱 + 财务 P1 — 五卡驾驶舱/AR账龄/四段对账单/分级催收/三单匹配付款门

Status: implemented

[English](2026-10-02-w6-b9-finance-cockpit.md) | 中文

- **Date**: 2026-10-02
- **Scope**: `w6b9-cockpit.mts` + `w6b9-blocks.mts` (new), `/fin/*` routes on `approval-engine.mts`, three pages (经营总览 first-nav / 财务工作台 / 发票匹配 JSBlock), fin_config + fin_statements + fin_dunning_tasks + fin_dunning_records(append-only trigger) + fin_dunning_audit + fin_match_issues (psql DDL, idempotent).

## Problem

经营驾驶舱整页缺失，财务 P1（AR 账龄/客户对账单/分级催收/三单匹配付款门）也没有。

## Decision

### 1. 经营驾驶舱（一级导航首位，sort=-1）
- 三层结构（Odoo Dashboards 姿态）：五张 KPI 数字卡（期间营收[发货口径]/期间发货订单数/平均订单值/逾期应收/到期应付）+ 六枚次行小卡（回款/库存总量/生产达成率/供应商准时率/批次合格率/开放预警）+ 月度营收趋势（kpi_snapshots.revenue_monthly 复用）+ Top 客户/产品榜 + AR 账龄分桶 + 异常清单（severity 排序 top8）+ 九步链路计数条（线索/商机/报价/订单待批/在制/待检/入库待检/在途发货/未清应收——回款步红边）。
- 期间过滤 30/90/180/365 切换→引擎重取→数字+图表联动（浏览器实测 90→30 标题与卡值随动）。**不做毛利**（ADR：成本数据未治理，假数字不上驾驶舱——gross_margin KPI 存在但不展示）。
- 口径单一来源：每指标一条 SQL 在 `computeCockpit`，psql 对账腿逐条复算（03 log）；AR 口径与 B2 `ar_overdue` 规则同式（approved SO amount − received payments，`AR_BALANCE_SQL` 共享）。
- 角色可见性：聚合卡任何平台会话可读；客户维度明细（Top 客户榜/账龄钻取行）服务端脱敏（`masked: true`，keeper 实测），finance/admin 全量。

### 2. 账龄分析（AR 五桶 + AP 镜像 + 客户钻取）
- 桶：逾期 0-30/31-60/61-90/91-120/120+（`fin_config.aging` 口径，未到期另计）；每桶金额+单数+客户维度明细（桶点击展开，驾驶舱页内钻取）。
- 对账闭环：分桶合计 = 逾期应收卡 = psql 直算（18800=18800=18800 三方一致）；AP 到期口径 = 发票 billed_at+fin_config.pay_term_days(30) 天 < 今日 且未付清余额。

### 3. 客户对账单（四段式 + 打印 + 幂等）
- 期初（期间前 approved 发货 − received 回款）+ 期间发货 − 期间回款 = 期末；明细行（发货/回款逐行）快照进 `fin_statements.lines` JSONB。
- 幂等：`UNIQUE(customer_id, period_start, period_end)`——同客户同期间重复生成返回同一份 `duplicate: true`（实测两连发同单号、行数不增）。
- 打印面（B5 /insp/report 先例）：`GET /fin/statement/print` 独立 HTML + `@media print` + window.print（打印要素：单号/客户/期间/四段平衡表/明细/制表/客户确认盖章/打印日期）；新窗口无 Bearer 头——query token 回退通道（同浏览器会话自用，Authorization 头仍是首选）。

### 4. 分级催收（预警→任务→append-only 跟进→关闭）
- 任务从 B2 `ar_overdue` 开放预警一键创建（幂等 per alert_id）；等级按 `fin_config.dunning_levels` 天梯（1/15/60 天→L1 提醒/L2 正式催收/L3 强催收）——负天数预警（到期前提醒）建 L1 任务（-3 天样本在列）。
- 跟进记录 `fin_dunning_records`：电话/上门/邮件/备注 × 结果（接通/未接通/承诺/部分回款/拒付），承诺结果必须登记承诺日期；**append-only 由数据库触发器保证**（UPDATE/DELETE 抛错——psql 实测拒篡改）；任务状态机 open→contacted→promised→closed|bad_debt（close 前置≥1 条跟进记录），`fin_dunning_audit` 行级审计。
- 通知走 B2 alert-center 通道（route_to 的 finance+sales_rep 每人一行 in-app）；mobile 可见性：finance 的 #/alerts 含 3 条账期预警（SO-W6B2-SEED 逾期 31 天 ¥18,800 红色在列）+ 催收任务通知——W6-R5 mobile 重拍按定位钉死（`w6-r5-shot-mobile-meta.json` mobileBadge.firstDunningHead =「催收任务 DUN-2026-0003 已建立」，`w6-r5-08-mobile-dunning-badge.png`）。
- 工作台形态（非纯表格）：候选区→任务卡（状态灯/等级徽章/余额/逾期天数/承诺日/责任人）→选中展开跟进表单+时间线（07 截图）。

### 5. 三单匹配差异工作台 + 付款门
- 重扫对拍（PO 订购/收货量 × 发票开票量/金额 × 收货单存在性）落 `fin_match_issues`：qty_short（开票>收货）/price_diff（超 fin_config.price_tol=0.05 容差）/no_receipt（开票无收货单且收货 0）三类；消除即 auto-resolve（system）；UNIQUE(invoice_id, diff_type) 幂等。
- 处置状态机 open→resolved|waived（终态，处置人+说明留痕）；工作台挂「发票匹配」页（B7 match_result 柱图保留为聚合面，09 截图 6 差异行+分类 chip+处置按钮）。
- 付款门 `POST /fin/pay/apply`：已收货量 ≥ 账单量 且无 open qty/no-receipt 差异才建 `pur_payments` 草稿并送审（wfl 付款审批流）；否则 403 拦截带事实文案（INV-B9F-0001 实测：收货 0 < 账单 1000 →「付款拦截」）。

### 6. 围栏（角色矩阵）
- 财务明细读+全部写：finance/admin/nocobase（username 直配——finance 无部门行）；keeper 实测 403×3（aging 读/跟进写/打印页）。
- 驾驶舱聚合面：任何平台会话（401 无会话负例在列）。
- sales 例外：对账单仅当客户归属自己（crm_deals.owner 通道）——非归属 403。
- 自报 actor≠会话身份：403（引擎层，R3 纪律）。

## W6-R5 修复轮（同一 feature 增量）

- **B1**：验收门禁的 `expect` 跑在 `expect ... | tee` 管道里——每次 FAILS 自增都落在管道子 shell，汇总因此恒报 PASS；比较还是字符串精确匹配（80920 vs 80920.0 假阴性）。修复后 expect 在主 shell 执行、numeq 数值归一比较、以真实 FAILS 退出码收尾。修复让两条门禁内的过时假设现形并一并修复：对账单幂等腿硬编码表内 1 行（改前后行数比较）、付款门探针钉死在 no_receipt 行（被后续处置消耗后取不到——改用 b9-assert 的 qty_short|no_receipt 口径）。
- **B3**：两处打印入口统一走一个 `printUrl()`（statement_no 与 token 均 encodeURIComponent）；列表 `<a>` 带 token、fetch 200、打开页渲染四段表（w6-r5-03a/03b）。
- **KPI×100**：KPI_FORMAT 契约表（scale/suffix）驱动唯一的 formatKpi 渲染——schedule_hit=1 显示 100%，不再显示 1%（w6-r5-04）。
- **卡片下钻+认领**：逾期应收/到期应付卡点击跳账龄面板（复用桶钻取），AR/AP 侧切控件挂 AP 镜像（computeCockpit 此后携带 aging.ap）；异常清单每行走 POST /alerts/act 认领（CCP 白名单行属 planner；会话身份走新增 GET /fin/whoami——RunJS 沙箱 fetch 不了相对平台 URL）。
- **跟进防重**：前端 inFlight 锁 + 后端 client_msg_id 部分唯一索引——同 id 并发双 POST 恰落一条（w6-r5-04-dedup.log：两响应同 record_id，一 duplicate=false 一 duplicate=true，行数恰 +1）。
- **顺手项**：三单处置说明改可编辑 textarea 且落行留痕（w6-r5-07）；route 失败日志经 redactUrl 剥离 token=/bearer= 查询值（w6-r5-05c——boot log 显示 `token=<redacted>` 且字面值 0 命中）；`--clean` 截断五张演练表（TRUNCATE 天然绕过行级 append-only 触发器——触发器只拦 UPDATE/DELETE，只有从未安装的语句级 TRUNCATE 触发器才看得到它）；mobile 的 alert-center 通知按类目出徽章——催收通知戴「催收」不再冠「召回」（w6-r5-08 + w6-r5-shot-mobile-meta.json）。

## 坑与修复（本批实测踩到）
- **RunJS authoring 双雷**：①多行 HTML 用「首行逗号续行」非法（`const x = (c) => 'a', 'b'` 第二段非声明符→语法错；`return 'a', 'b'`→逗号表达式只返回末段）——全部改 `[...].join('')` 数组模式；②声明前引用的 `render` 判「未知全局」（B8 已沉淀先例）——FIN_WB/MATCH_WB 改提升 `function render() {}`；COCKPIT 结构差异侥幸过检但同修。
- **fullPage 截图在 NocoBase SPA 塌陷**：`captureBeyondViewport: true` 把布局折回视口高（813px）且触发骨架——DOM 断言过而截图全白 spinner；viewport 截图（1440×900）反而完整（04/01 对比实证）。B9 全部证据改 viewport 拍摄；块在页下方的加 scrollIntoView（09）。
- **打印页新窗口无 Bearer**：window.open 不带 localStorage——query token 回退（引擎侧 Authorization 头优先）。
- **列名三坑**：wms_stock 是 `qty_on_hand`（非 qty）；flowModels 的 stepParams 藏在 `options` JSONB；notificationInAppMessages 是 `"channelName"` 带引号驼峰。
- **NULL 拼接丢行**：`'#' || b.customer_id` 当 customer_id NULL → 整行 NULL → psql 输出空行被过滤——账龄全 0 的根因；COALESCE(b.customer_id::text, '?') 修复。
- **GROUP BY 含聚合**：`to_char(...) || round(max(value)...) GROUP BY 1` 非法——子查询先聚合再格式化。
- **bash 变量名后紧跟多字节字符**：`$PAY）` 被解析为变量 `PAY\xef...`→unbound——`${PAY}` 花括号隔离。
- **RunJS 沙箱内相对路径 fetch 直接 "Failed to fetch"**（W6-R5）：块内 fetch 必须指向 ENGINE 绝对 URL——平台身份读取因此走引擎（GET /fin/whoami），绝不能调页面 origin 的 `/api/...`。
- **`/alerts/act` 没有应答 OPTIONS 预检**（W6-R5）：其余跨源 JSBlock 通道的预检都答 204（R4 教训的另一半）；浏览器直连认领把这个缺口暴露成裸 fetch 失败，直到补上预检分支。
- **NocoBase SPA 在全新 headless profile 下冷启动约 30 秒**（W6-R5）：登录探针必须保持单次导航并长轮询——按 attempt 重复导航会每次重置等待，表单永远等不到（mobile 探针同理必须锚定数据行，不能锚定页面标题——标题在裸骨架态就命中）。

## Evidence（demos/acceptance-w6/，数字实测）
- `w6-r5-01-assert-rerun.log`（W6-R5 修复版门禁重跑）：23 ✓ / 0 ✗、`GATES ALL PASS`、exit 0——expect-matrix PASS（0 fails）、dunning-flow/match-recon/negatives 各检查绿、b9-assert all asserts green（27 项，含 W6-R5 六项新腿）、b2-regression 全过。门禁现以真实 FAILS 退出；注入错值反证（`w6-r5-01c-inject-e2e.log`：want 99999999 got 80920.0 → FAIL(1) → GATES FAILED → exit 1）证明 miss 不再可能打印 PASS。
- 截图 01-11：驾驶舱全景（5 卡+6 mini+趋势+Top+账龄+异常+链路9）、期间切 30 天联动、账龄桶点击客户钻取、对账单打印页（四段平衡+打印钮）、财务工作台（3 任务卡+DUN-0001 展开 2 条跟进时间线+承诺 2026-10-10+对账单生成器）、三单差异工作台（6 行三类+处置按钮）、mobile finance 预警（1 紧急+3 账期 chip，¥18,800 红行）。
- log：03 每指标 psql 对账、05b 四段等式+幂等（两连发同单号）、08 催收流、09b 三单对拍+付款拦截、10 负向 6 项、12 assert、13 b2 回归。

## 遗留（新）
- sales 对账单围栏用 `crm_deals.owner` 与会话 username 逐字符匹配；中文显示名 owner 字段需先规范化（随 owner 字段规格推 B10）。
- 发票匹配页的增量 JSBlock 仍位于 B7 聚合图之下（seatBlockRowTop 在该页从不生效——平台 grid 渲染器限制，推 B10）。
- 驾驶舱 Top 销售员榜未做（crm_deals.owner 数据稀疏，Top 客户/产品榜已覆盖计划口径）。
- 银行对账（P2，明确不做清单）——收款流水↔应收单勾对延后。
- 催收的企微/邮件外发通道未接（B2 通知同为 in-app——外发渠道是平台级能力，等通道基建）。
- 对账单批量导出（ERPNext Process Statement of Accounts 形态）未做——单客户期间已闭环，批量是包装层。

## Alternatives considered

- **毛利上驾驶舱 vs 只做营收/应收（ADR#7）**——成本归集不受控，假毛利卡比没有更糟。

## Consequences

成本：成本口径受控前没有毛利卡。买到：每卡一条 SQL 可对账，付款门与催收台账 append-only 有审计。
