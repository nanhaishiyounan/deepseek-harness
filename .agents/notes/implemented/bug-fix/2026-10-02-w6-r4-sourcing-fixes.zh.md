# Agent Note: Agent Note：W6-R4 比价矩阵验证 FAIL 86/100 修复轮——交期 N/A 计分、错误反馈断链、定标审计与读围栏

Status: implemented

[English](2026-10-02-w6-r4-sourcing-fixes.md) | 中文

## 问题

W6-B7 验证 FAIL 86/100，5 项 BLOCKING 集中在四个文件：计分内核 `w6b7-sourcing.mts`（`num(null)=0` 把未报交期计成 0 天并污染 min-lead，全组供应商白得交期分；送审 `catch{}` 静默吞错且幂等早退分支让 PO 永远停在 draft）、矩阵 JSBlock `w6b7-blocks.mts`（`loadMatrix` 无 catch，不存在的 RFQ 在页面上无任何反馈；定标弹窗只显示内部 id「报价行 #N」；双击竞态把原始 409 文本甩给用户）、引擎路由 `approval-engine.mts`（GET `/sourcing/*` 只做登录围栏，sales_rep/finance 可读全部供应商报价；外层 catch 只对 `/recall/`、`/label/` 附 CORS，`/sourcing/*` 的跨域错误响应被浏览器吞成 fetch failure）、以及 PO 详情零快照（`compare_note` 落库但 UI 不呈现）。另有 5 项 ADVISORY（弹窗信息量、竞态文案、`pur_quotes` 无每询价单唯一中标约束、权重配置覆盖式 `updated_by` 无审计、回链 chip 不可点）与 3 笔真话债（Note 误记「assert 17/17」实测 14、gates-b7.log 未注明节选、`w6b7-verify.mts:172` 一条恒真断言）。

## 决策

- **交期 N/A（TC-08）**：`rawLead()` 把 null/undefined/`<=0`/非有限值一律判「未报交期」；min-lead 只在有效子集内求；null 行 `lead_score=null`、`lead_time_days=null`，该轴从加权总分剔除并重归一（与质量维缺失同一套 present-axes 机制），算式文本相应「交期分=N/A」。`MatrixRow` 两字段类型放宽为 `number | null`；定标时 winner 未报交期则不写 `expected_date`，比价阶梯文本显示「交期N/A」。
- **错误反馈（TC-17）**：`loadMatrix` 包 try/catch（fetch reject 与 `ok:false` 双路），失败清旧矩阵并把「RFQ 不存在或已关闭」写进 note；引擎外层 catch 对全部 API 路由错误响应附 `RECALL_CORS`（仅静态 HTML 面豁免）并补 `code/message` 字段；`sourcingRoute` 的 `fail()` 三参化（code/message/error 兼容别名），matrix 对不存在 RFQ 映射 404+`rfq_not_found`。
- **PO 定标快照**：`compare_note` 增补「定标时间」（来自同事务写入的 `awarded_at`）；PO 泳道卡片新增「定标快照」`<details>` 渲染 `compare_note` 全文（权重/算式/定标人/定标时间），数据源经 NocoBase REST list 验证携带全文。
- **定标审计 + 送审去静默**：`pur_award_audit`（award_id/actor/action/payload/ts，action 覆盖 award/replay/resubmit/submit_failed）；状态迁移 CAS、winner/losers 翻转、审计行合并为一条 data-modifying CTE 原子落库（won/lost 以 `EXISTS (SELECT 1 FROM moved)` 依赖 CAS）；`pur_rfqs` 幂等迁移加 `awarded_at TIMESTAMPTZ` 并回填；送审失败改为 `console.warn` + `submit_failed` 审计行；幂等早退分支检测 PO 停 draft 时重新送审（写 `resubmit` 行）。
- **读围栏**：新增 `assertSourcingReader`（采购部/admin/nocobase 可读，sales_rep/finance 403 `read_fenced`），与写围栏 `assertSourcingActor` 共用 `procurementUsernames()` 查询。
- **ADVISORY**：定标弹窗从矩阵行解析供应商名/单价×数量/交期/总分/排名替换「报价行 #N」；409 与 CAS 冲突统一映射 409，note 显示「已定标（双击/并发竞态被引擎拒绝）」；`ux_pur_quotes_won_per_rfq` 部分唯一索引（`(rfq_id) WHERE is_won`，B6 `ux_crm_quotes_converted` 先例）；`pur_sourcing_weight_audit` append-only 记录权重 old→new+actor；回链 chip 改 `<a href=比价表?rfq=…>` 且矩阵块启动时从 `window.location.search` 预选 RFQ；矩阵空态区分「暂无可比价询价单」。
- **真话债**：B7 Note「17/17」按实测改 14/14（R4 扩至 20/20）；gates-b7.log 头部注明节选来源与完整日志指针；`w6b7-verify.mts` 恒真断言改为 DB 原文与矩阵 JSON 逐字节比对（证明 JSON 层无 HTML 求值/转义）。另核实 4 处变更面失真指控：仓库无任何 `/scm/*` 路由实现（grep 零命中）、`approval-rules.ts` 文件不存在、`w6b4-bomver` 归属 W6-B4 批次（gates-b4.log:2448）——B7 Note 范围行未声称这三者，指控源于批次交接叙述而非入库 Note，本 Note 记录核实结论备查。

## 后果

demo 腿 13 段全绿（leg 0-10，新增 leg 5b 读围栏、leg 7b 送审失败留痕+幂等重送审、leg 9 交期 N/A、leg 10 404+CORS 双侧），assert 腿 20/20；b2 回归绿。TC-08 断言钉死三态：lead=(null,7,14) 中 7 天者交期分=100、14 天者=50、null 者该轴 N/A 且总分=价格单轴（无评分卡时）。送审失败可在 `pur_award_audit`（submit_failed 行）与引擎日志（w6-r4-engine-boot.log 的 `[sourcing] PO … 送审失败` warn）双侧查证；重放触发重送审把 PO 从 draft 推进 pending。证据集 `demos/acceptance-w6/w6-r4-01..11-*`（demo/assert 日志、psql 审计对账、读围栏 curl、TC-08/404 toast/弹窗/双击/PO 快照/回链落地截图）+ `w6-r4-shot-meta.json`。已知残留：JSBlock 代码经 `flowModels:save` 升级后，SPA 对旧代码的二次挂载延迟可达数分钟（服务端 `flowSurfaces:get` 已返回新码；reload 会重置等待）——取证脚本以 4 分钟静默轮询兜底，生产无影响但调块时需知晓；`MATRIX_PAGE` 路由 uid 以常量写入 po-board 块代码，页面重建需同步该常量。

## 备选方案

- **null 交期计 0 分**——正是被验证否决的原实现：0 天是最优交期语义，等于奖励未报价者。
- **送审失败回滚定标**——定标事实（CAS+落选处置）已对供应商生效，回滚需要反向补偿；留痕+幂等重送审以最小代价保住可追溯性。
- **审计行在 PO mint 后单独 INSERT**——丢失「与状态迁移同事务」的原子性，恰是 lesson 24 的要求。
- **读围栏复用写围栏**——会把矩阵页对 nocobase 集成账号关死，且采购部之外的合法只读场景（admin 审计）被误伤。
