# Agent Note: W3-B6 操作者终端——serve 业务动词承载的 iframe 触屏页（报工/检验/收货）、三数等式钳制与部门围栏端点面

Status: implemented

[English](2026-09-28-w3b6-operator-terminals.md) | 中文

## 问题

三条车间最高频动线（报工/检验打分/按单收货）此前只有表格+表单页——正是用户「不是人能用的」所指的形态。业界参考（Odoo Shop Floor、ERPNext QI readings、Odoo Barcode）把这些动线剥离为专门终端形态：卡片队列 + 大按钮、逐项打分单（读数自动判定）、按单扫码收货。一切写路径必须继续走既有引擎函数（D9：无第二实现，不经 NocoBase 表单写引擎管辖状态）。

## 决策

- **承载形态 = 每 flowPage 一个 iframe 块（mode:url）指向 approval-engine `--serve` :13110 的静态页**（`/terminals/{report,inspect,receive}.html` + 共用 `terminal.css`），uid 前缀 `w3b6`，三个业务菜单组各一页（生产制造/质量管理/仓储管理）。URL 直开兜底天然成立——页面就是纯 HTTP。触屏形态：卡片队列、≥44px 目标、高对比、无框架。
- **`serve()` 内三个窄动词，各自调用既有引擎函数**：`POST /report-job`（全量校验通过后建 mfg_job_reports 行，再 `postJobReport`）、`POST /inspect-submit`（先写 qm_inspection_readings 行再 `inspectInspection`；判定失败会删除刚写的行——库内无残留）、`POST /receive-goods`（`enforceGates` PO 生效卡口 + 行级钳制，建 wms_receipts 行，再 `postReceipt`）。卡片队列走 `GET /terminal/{report,inspect,receive}`。
- **报工等式 = ERPNext complete_job_card 钳制映射到我们的工序累计上限**：完成 + 待求 + 损失 = 本循环计划数，其中本循环计划数 = MO qty − Σ已过账 (qty_good + qty_scrap)。qty_pending 不进引擎累计列（它是下循环续报的未完成余量，落在报工行 remark）——等式因此同时证明 qty_good + qty_scrap 不超引擎上限，并强制每个单位都有去向交代。纯函数 `validateReportEquation` 进 selftest（正例/不闭合/负数/已报满）。
- **读数判定按行分型**：数值行（任一规格界有限）自动判 actual ∈ [spec_min, spec_max]，缺 actual 拒绝；非数值行用大按钮 pass/fail，沉默拒绝。fail 行勾「严重」计 critical（0 收 1 拒），否则 major——`defectsFromReadings` 折叠后交给 `inspectInspection`，AQL 判定权仍在引擎单一处。
- **超收卡口由端点持有**：postReceipt/updatePoReceiving 没有超收检查，`validateReceiveLines` 在建任何行之前拒绝错品行、空批次、非正数量、以及把 PO 行推过 订购 − 已收 的行。
- **鉴权 = token + 部门围栏**：`W3_TERMINAL_TOKEN`（header `x-terminal-token` 或 query `token`；未设 = 宽松演示档，响应头 `x-terminal-auth: strict|lenient-demo` 标明——生产必须设置）+ B5 部门表围栏各端操作员（report→生产车间、inspect→质检部、receive→仓储部；跨部门 403，admin 放行）。`W3_TERMINAL_ENABLED=false` 整组路由摘除，引擎零变化（缺省零漂移：端点不调用就不写）。

## 结果

- 三个操作角色获得触屏优先的终端承担日常动线；一切状态推进仍走且只走同一引擎函数——wfl 锚点、FCS 排产权、检验 single-shot、Σmovements==stock 门禁在终端在线时继续成立。
- serve 进程成为终端使用的必要部署件（:13110，与 NocoBase、网关并列）；其 env 开关（`W3_TERMINAL_TOKEN`、`W3_TERMINAL_ENABLED`）就是生产旋钮。
- setup-nocobase verify 永久探测端点族（一个 400 负例 + 一个 403 围栏），只要 serve 应答 healthz。

## 备选方案（未采纳）

- **NocoBase 表单块直写引擎集合**——拒绝：表单表达不了等式钳制、逐项判定、fail-loud 重入语义，除非引入 workflow 引擎做读改写算术（W 轮坑 ⑪）；也违反单实现规则。
- **workflow 插件状态机包裹终端**——作为第二引擎拒绝：终端的存在意义是*喂*既有动词，不是拥有状态。
- **每终端独立 SPA**——拒绝：三个纯 HTML 页共享同一 serve 进程，部署面只多一个端口，页面还能在亭子上打印。

## 注意

- **`gridUidOfExistingPage` 返回的是 tabs 的 schemaUid，不是块挂载的 grid uid**（它是 grid 的*父*）。B3 从未踩到分歧路径——其幂等检查在 kanban 存在时直接跳过；B6 的 assert 起初按 `IframeBlockModel.parentId === tabsUid` 读，失败。`terminalGridUid` 改为 tabs → `flowModels:findOne?parentId=<tabs>&subKey=grid` → 真 grid uid；`dataOf` 会解包响应而裸 `call` 需要读 `.data.uid`（setup-verify 的同款检查起初在未解包的 null 上读 `grid?.uid`）。
- **`resolveOrderByCode` 必须容忍 code 缺失**——报工页只发 `mo_id`；对 undefined 裸调 `code.trim()` 以「Cannot read properties of undefined」横幅暴露。修复为 `typeof code === 'string'` 守卫，且在任何写之前完成（失败请求零残留，因为所有建行都发生在校验之后）。
- 引擎写腿（postJobReport / inspectInspection / postReceipt 每次拉多个全量集合）可能超过 20–60 秒的 UI 等待；页面保持提交锁，serve 日志是权威完成信号（JR-2026-0005 / QI-2026-0011 / RCV-TERM-2026-0001 都在 wait_for 超时后落地）。
- 打分单的读数输入需要 `step="any"`——Chrome 在默认整数步长下会把小数读数（6.2 → 6）取整，悄悄改变被判定值。
- 顺路修复两处既有数据故障（证据文件内留痕）：B5 旅程行 `QM-W3B5-JOURNEY-2026-09-28` 带集合枚举外的 `status='open'`（破坏 B3 看板分布断言）→ `pending`；MO-2026-0002 的陈旧预留 `RSV-MO-MO-2026-0002-04` 指向已删除的库存行（bin 89）阻断齐套检查 → 释放，随后缺料组件经引擎正门（`--post-adjust`）回补、重算齐套到 assigned，领料才开工 MO。
- setup-nocobase verify 只在 :13110 活着时探测端点（healthz → /report-job 一个 400 负例 + 一个跨部门 403 围栏）；否则打印提示而不失败——终端页本来就需要 serve 在跑。

## 证据

- `research/2026-09-27-w3-usability/w3-b6-curl.txt`——静态页 200（`x-terminal-auth: lenient-demo`）、三个队列的正确操作员、三个跨部门 403、MO 状态 400 负例，以及判定三连：重判 single-shot 400 / 超收 400 / 错品 400。
- `w3-b6-psql.txt`——十段行级证明：JR-2026-0005（9000 + 6000 记 remark + 1000 = 16000）、工序 1 planned→started、三行读数（水分 6 fail / 外观 pass / 中心温度 18 pass）、判定行（critical 1 → failed，n=200 Ac=10 Re=11）、qc_status 回写 + CAPA 草稿、RCV-TERM-2026-0001 posted pending、PO 300/300 received、PUTAWAY 流水 + SH-Q-02-01 hold 库存 + 隔离 lot、QI-2026-0012 IQC 挂点、两处数据修复留痕。
- `w3-b6-report-01-queue.png … w3-b6-report-05-390px-touch.png`——车间主任旅程：卡片队列（未排产 MO 带禁用的先排产按钮）、等式红 ≠ 且提交禁用、等式绿 = 且勾送检、报工后队列（工序1 已开工 · 已报 10000/16000）、390px 单列触屏形态。
- `w3-b6-inspect-01-queue.png … 03-verdict.png`——质检员旅程：待检队列（报工送检挂出的 QI-2026-0011）、行级红/绿判定 + 严重开关的打分单、引擎判定横幅（AQL 2.5 normal，n=200，严重 1 → 拒收 Rejected，CAPA 已发起）。
- `w3-b6-receive-01-queue.png … 03-posted.png`——仓管旅程：带 `# 行数` 徽标的 PO 卡、扫码面板（lot 聚焦 + ±1/±10 步进 + 预填剩余 120）、过账成功横幅与待检区隔离提示。
- `w3-b6-iframe-nocobase.png`——NocoBase（:3080/nocobase）内「车间终端」flowPage 经 iframe 块渲染 :13110 终端页。
- 门禁：`approval-engine --selftest`（含终端校验用例）、`nocobase-w3-views --assert`（终端 iframe + URL 钉住）、`setup-nocobase.mts verify`（三页 + 端点冒烟）、`--assert-ledger`（33 组 145 条流水平衡）、9 步链 s4/s5/s6 绿。
