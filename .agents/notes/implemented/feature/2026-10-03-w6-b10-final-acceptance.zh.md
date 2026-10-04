# Agent Note: W6-B10 终验——八角色演练（含 mobile 腿）、44 门对账矩阵、GB 14881-2025 映射与全轮收口

Status: implemented

[English](2026-10-03-w6-b10-final-acceptance.md) | 中文

- **日期**：2026-10-03
- **范围**：`demos/acceptance-w6/w6-b10-walkthrough.mjs` + `w6-b10-matrix.sh` + `w6-b10-gates.sh` + `w6-b10-shot-statcard.mjs`（新证据驱动）、`examples/kb-agent/scripts/w6b10-statcard-order.mts`（新收口腿）、`w6b4-assert.mts`（可重跑性修复）、`.oxlintrc.json`（labels 豁免）、`QUICKSTART.zh.md`（W6 全轮节）、`research/2026-10-01-w6-rework/b10/gb14881-mapping.md` + `99-w6-deliverables.md`。

## Problem

W6 轮需要终验：含 mobile 腿的八角色演练、≥30 门对账矩阵、GB 14881-2025 条款复核、遗留收口（labels lint/B2 统计卡位序/R5 裁决）、文档与全量回归。

## 落了什么

### 1. 八角色演练 + mobile 腿（W5 b8 形态扩展）
- 真实账号（buyer/planner/shop_lead/qc_inspector/keeper/sales_rep/finance/admin）各走：PC 登录 + auth:check 身份锚点、member/admin 权限矩阵页隔离对照、3~5 步 W6 面核心旅程（比价矩阵/效期看板/召回/检验向导 `/insp`/出厂报告/CCP 配置/配方版本/车间卡片流/商机管道/维保日历/驾驶舱/财务工作台/预警规则/设计器 iframe），每步 DOM 断言（等待文案、无 403、非白屏、行数/形态探针），每角色 ≥1 张截图（`w6-b10-r1..r8-*.png`）+ 只读 psql 对账（`w6-b10-psql-recon.log`）。
- mobile 腿走 B0/B1 成果：buyer `#/docs/pur_orders`、planner `#/todos`、keeper `#/alerts`、sales `#/docs/so_orders`、finance `#/alerts`——真实登录以 `dsh-mobile-auth` 锚定（375×812 手机视口）。终轮 **8/8 角色、106/106 步**（`w6-b10-walkthrough.json`、逐动作 `w6-b10-actions.json`、汇总 `w6-b10-walkthrough-summary.md`）。
- 启动契约踩坑沉淀：网关必须带 `--patch examples/kb-agent/cordis.patch.yml` 启动——裸 `pnpm dsh web` 时 nocobase domain 关闭，mobile 登录全部死在「未启用」结构化拒绝；且全新启动下 `/mobile` 404，入口是 `/mobile.html#/…`。

### 2. 44 门对账矩阵（`w6-b10-matrix.sh` → `w6-b10-matrix.log`）
- W5 的 20 门终验矩阵扩到全轮，十段：B0/B1 身份同步（发号唯一、非 admin 审批数、engine `/todos`=psql、补偿队列 pending=0、湖仓 nb_*=13 表+行数对齐）、B2 规则（八路启用、效期引擎=手写双轨 SQL diff=0、dedup 幂等、通知 ≥1、keeper 路由）、B3 追溯召回条码（视图在位、召回单号唯一、冻结快照=闭包、通知 ≥1、receipts 孤儿=0、无批次完工=0、labels 源=wms_lots）、B4（CCP 行、ccp_deviation 预警、BOM 版本 ≥2、approved ECO）、B5（AQL15 段、九要素完整、唯一索引、inspection_fail 预警）、B6（阶段/概率一致、商机 ≥1、报价 `converted_so_code` 回链）、B7（每组至多一个 `is_won`、定标行、`awarded_at` 闭环）、B8（维保状态闭集、plan 工单、校准预警、what-if 留痕）、B9（驾驶舱营收卡=psql、账龄五桶=逾期 AR、对账单等式 Σ=0、付款门 403、催收 append-only 拒改）、wfl 横切（动作闭集、待办状态闭集、流配置 ≥1）。
- **44/44 PASS**，每门带实测计数；任一 FAIL 即 exit 1（实测过三轮修复：sqlite GLOB、召回 `scope` 列、真实动作闭集——每处都先 FAIL 后 PASS，日志链完整）。

### 3. GB 14881-2025 条款↔功能映射（`research/2026-10-01-w6-rework/b10/gb14881-mapping.md`）
- 14 行条款表（追溯 §10/42、效期/FEFO §10、CCP 监控程序五要素 §8+HACCP 附录、出厂检验九要素 §9/51/52、召回 §11/63、供应商资质效期 §6/7、计量强检、记录 §14、人员 §12）。
- 核心五面**已覆盖**（页面+引擎+psql 三层证据）；人员健康证台账与受控文件归档**部分覆盖**（W7 候选，计划 §9 明确不做/推后）；硬件章节不适用。购标准全文逐条字句核对列为后续项（映射引用仓内双源调研）。

### 4. 收口项
- **labels lint**：59 错（B3 的 64 减 R3 带走的 5）全部是「游离 TS 工程外」类型感知伪错，非缺陷——`.oxlintrc.json` ignorePatterns 收编（注释注明其门禁=esbuild bundle + `w6b3-labels-assert` round-trip）；前后对比 `w6-b10-04-labels-lint.log`。examples 更广 .ts 面（247/151 文件，既有仓况）记 W7 候选。
- **B2 统计卡位序（B2 遗留债）**：`w6b10-statcard-order.mts` 重写预警页 grid 的 rows/sizes/rowOrder（B7 先例的同一杠杆）——统计卡有 parentId 但无所属行（渲染器把它们 append 挂到表格后，三种 sortIndex 从未生效），合成两行卡行置于 rowOrder 头部：持久化（`w6b10cards-a/b,autoRow1,autoRow2`）并以截图证实卡片在表格上方。单列成因是首轮落库的卡行 cell 为一格多 uid（psql 实测 `w6b10cards-a=[[4 uid]]` 纵向堆叠），当前脚本已是每格一 uid 分格写法、复跑时卡行已在前被 no-op 跳过未重写——四列条带清旧卡行重跑即可得，非平台渲染限制（R6 归因修正，与代码对齐）。
- **R5 推来裁决（已知边界统一记录）**：planner 驾驶舱可见性=设计分层——聚合面（KPI/趋势/运营链/异常摘要）对平台会话开放可读、客户级明细服务端脱敏（非 finance/admin 读 `/fin/cockpit` 时 customers 置空 + masked，R6 复核断言 `w6-r6-02-cockpit-mask.log` 8/8：planner 脱敏、finance 全量），明细钱面 `/fin/aging` 403；演练观察步实测 planner 直开经营总览渲染成功（actions.json rendered=true denied=false——早前写作「被拦」与实测相反，R6 修正）；付款门留在引擎 `/fin/pay/apply`（围栏+审计单一事实源），平台页只读消费；`customerOwnedBy` 以 `crm_deals.owner` 逐字符匹配会话 username（从严默认，中文显示名规范化随 owner 字段规格推 W7）；`seatBlockRowTop` 页间差异（比价表生效、发票匹配不生效）维持平台 grid 渲染器限制记录——同机制本轮修好了预警页。
- **文档**：QUICKSTART 增 W6 全轮节（菜单组、引擎路由、演练/矩阵/gates 用法与 `--patch` 启动契约、`W6*` 环境旋钮）；`99-w6-deliverables.md` 承载逐批一行（B0~B10+R1~R5）、B10 期间债修复与 W7 候选清单。
- **演练数据清理**：b9 `--clean` / b6 `--cleanup` / b5 `--cleanup` 作为 gates 末段执行；append-only 审计行按演练标记保留。

### 5. 全量回归（`w6-b10-gates.sh` → `gates-b10.log`）
- 补播（b9 --demo、b6 --seed、b5 向导重放——出厂报告只能经向导产生）→ 16 条断言腿（B0~B9+B10 统计卡）→ 矩阵 44 门 → 演练 8/8 门 → typecheck → oxlint staged（本批新文件面）→ pairing → 清理腿。**终轮 22/22 腿 GATES ALL PASS**。
- 顺带修复两条断言腿可重跑性：`w6b4-assert` 演练 ECO 改为撤收（默认 BOM 回滚+演练 ECO 删除）——此前每次运行永久加宽 product11 行，第 26 次耗尽全部 add 候选（随附一次性 v1 基线复位）；`w6b6` gates 序列化为 cleanup→seed→assert（演练报价 converted 状态跨轮残留）。ECONNRESET（NocoBase dev-server keep-alive 竞态，两次命中 `w6b3-recall --assert`）在 runner 内做仅限该错误码的单次透明重试（`w6-b10-gates.sh:41-49`，首试日志 mv 为 `*.retry1.log`）；该两次首试输出未随 demos 留存（demos 内无 .retry1.log、grep 仅命中 gates.sh 本身），可复核面=重试代码与终轮首试即绿——R6 修正「两次日志均留档」的失实表述。

## 证据（demos/acceptance-w6/，数字实测）
- `w6-b10-walkthrough.json` / `-summary.md` / `actions.json` / `psql-recon.log`：8/8 角色、106/106 步、13 张截图、五条 mobile 身份锚定。
- `w6-b10-matrix.log`：44 门 0 失败，逐门计数（非 admin 审批 73、通知 1077、追溯 131 节点/129 边、AQL 15 段、驾驶舱营收 80920.0=psql 等）。
- `gates-b10.log`：22 腿 0 失败；逐腿 `w6-b10-gate-*.log`（28 个，含补播/清理/重试链）。
- `w6-b10-05a-statcard-order.log` + `w6-b10-05b-statcard-seated.png`/`-dom.log`：rowOrder 前后 + 置顶截图（懒挂载探针竞争如实记录）。
- `w6-b10-04-labels-lint.log`：59 → 豁免后 0，附更广既有面说明。

## 已知边界 / W7 候选（99-w6-deliverables.md §六承接）
人事四件套+健康证台账（GB 14881 §12）；examples 面 lint 类型感知伪错治理（tsconfig 收编或整面豁免）；发票匹配 JSBlock 前置+统计卡四列形态；SPC 图形+留样；驾驶舱 Top 销售员榜/对账单批量导出/催收外发通道；GB 14881 全文逐条核对；BP-19 发号 TOCTOU 平台收敛；报价转单平台原生表单。

## Alternatives considered

- **复用 W5 的 20 门矩阵 vs 扩全轮 44 门**——选扩（各批对账全部汇编）。
- **修 labels 59 错 vs 豁免+注释**——选豁免：那是游离工程外的类型感知伪象，非缺陷。

## Consequences

成本：矩阵与演练驱动是要维护的面。买到：可重跑的全轮终验底座（8/8 角色、44/44 门、22/22 腿）与 GB 映射留档。
- `pnpm run doc-sync`：29 门 exit 0（收口同时把 14 条 W6 Note 修到统一骨架——77 违例清零、755 条全合规——外加包路径修复、tool/config-catalog 重生成与 zh 块同步、两条 B1 JSDoc 补齐、31 对 pairing 重录；修复链见 gates 日志补录段）。
