# W3 轮交付总表（真实可用性形态 · B1–B7 收官）

> 目标 = 清偿用户第八轮反馈三点（[PLAN §3](../../plans/2026-09-27-w3-usability/PLAN.md) 处置总表）；验收口径 = **真实操作者日常任务完成性**（用户原话「记住 这不是演示 要实际交付使用」），页面存在性截图不算数。收官日 2026-09-28：五角色七条旅程（J1–J7）全部走通，9 步链三轮全 PASS，`setup verify` 全绿（含 B1–B6 全部新增断言）。B7 终验并修复 B6 遗留引擎缺陷三处（[w3-b7-defects.md](w3-b7-defects.md)）。

## 一、用户三点反馈逐项处置结论

| # | 用户反馈（原话） | 处置结论 | 交付形态清单 | 关键证据 |
|---|---|---|---|---|
| 1 | 「都是表格+表单，不是人能用的」 | **已清偿（分层形态体系）**——高频动线剥离专门形态，低频配置保留表格（Odoo/ERPNext 同款分工，业界报告逆耳观点 #1：全盘去表格化反而降可用性） | ① **只读状态看板 ×4**：采购/生产订单/销售/质检（B3，D4 引擎对象一律 dragEnabled:false，拖拽仅自由态集合）② **排产甘特**（B3，官方 plugin-gantt v1 只读单视图，D5 不 SVG 自建）③ **双块日历**：计划日历（MO planned_start/end）+ 交期日历（SO/pur need_date，B3）④ **行详情 drawer + 子表 drill-down**（B1/B2，95 块全域）⑤ **操作者终端 ×3**（B6：报工终端/质检逐项打分/扫码收货，iframe 独立页 + serve 动词端点） | 形态旅程序列截图：`w3-b7-journey-j2-3/4`（看板+甘特）、`w3-b7-journey-j1-6`（交期日历）、`w3-b7-journey-j3-2..5`（报工终端三数等式）、`w3-b7-journey-j4-2..4`（逐项打分行级判定色）、`w3-b7-journey-j5-1..4`（扫码收货）；各形态截图全集见 [03 报告](03-industry-reference.md) 与批次证据 |
| 2 | 「表格行点详情没有任何显示」 | **已清偿（P0 根因三处修复 + 全域 heal）**——P0 实锤：13 个 v2 工厂同构复制 E1 模板从不产行操作（95 表格块 94 块零行操作）；唯一例外项目页 ViewAction `subModels:{}` 三层断链；两看板卡片 drawer 204 | ① **统一行详情工厂**：`ensureTableRowDetail` + `drawerPageTreeFor`（flow-page-lib，E1 生产模板泛化，openView 五键全量契约 D2）② **95 块幂等 heal**（`w3b1` 前缀，存在即跳过）③ **断链三处修复**（项目页 7f141 重挂子树/两看板卡片 drawer）④ **member view ACL 配套**（83 集合逐个 view 授予——否则修了 admin、member 仍无显示）⑤ **子表深化**（B2：12 页 drawer 内嵌子表块：订单行/报价行/BOM 行/工序/盘点行/检验读数等）+ **审批单据跳转**（业务行「审批进度」→审批中心；待办行「前往单据」→业务页，双向） | heal 全量：`w3-b1-heal-run.txt`（95 块）；终验探针：`w3-b7-probe-final.txt`（pages=80 tableRows=99 **anomalies=0 addNewMissing=0**，4 看板/日历卡 ViewAction 子树全 present）；双端行详情：`w3-b1-*-drawer.png`（admin+member）、`w3-b7-journey-j1-4/5`（比价子表）、`w3-b7-journey-j7-1b`（member drawer） |
| 3 | 「审批流可视化配置界面 + 部门员工权限管理」 | **已清偿（治理层两页一中心）** | ① **审批流配置中心**（B4：JSBlock SVG 状态图节点=flow_states 边=flow_transitions 含条件/阈值/审批人摘要 + wfl 六表表单化编辑直写 REST + **仅 admin**（b4guard 403 探针）+ config_note 必填审计 + 保存后一致性探针 fail-loud：单激活/转移状态存在/无孤儿）② **组织架构页**（B5：plugin-departments 原生部门树 D7——新源食品集团 8 部门 + 11 挂接，不自建 org_*）③ **角色权限矩阵页**（B5：JSBlock 只读矩阵渲染 + 行级 EditForm 直写 rolesResources）④ **approver_map 部门路由**（D8：`{type:'department',value:'质检部'}` 全员展开任一人可审，纯 username 零漂移）⑤ **员工档案 org_dept 列** | B4：`w3-b4-map-page.png`（SVG）、`w3-b4-edit-drawer.png`（EditForm）、`w3-b4-member-url-404.png`（403 围栏）；B5：`w3-b5-org-chart.png`、`w3-b5-acl-matrix.png`、`w3-b5-selftest.txt`（部门路由六态）；B7 终验：`w3-b7-journey-j6-1..4`（改流 200000→250000→复原，config_note 双向留痕 + 探针 0 问题）、`w3-b7-journey-j7-3`（member 404）+ REST 写探针 403 |

附：「还有很多其他地方没实现」→ B6 三终端页补齐；D10 不做清单留档（条码打印/移动推送/拣货分派/工时计时/批量审批/MPS 网格，理由见 PLAN §3）。

## 二、B7 五角色真实旅程（J1–J7 任务完成性双证）

| 旅程 | 动线（步骤完成性） | 终点数据断言（psql 对拍） | 证据 |
|---|---|---|---|
| J1 采购员 | 部门待办（审批中心）→ 询价管理比价（drawer 报价子表）→ PO-B7J1 ¥238,000 下单 → 两级审批通过（一审→pending_level2→二审 approved）→ 审批中心「前往单据」跳回 → 交期日历跟踪 | wfl 留痕 3 行（submit/一审/二审）；行金额合计 1000×220+200×90=238,000=表头；交期日历含 PO 事件；待办 open=0 | `w3-b7-journey-chain1.txt` + `w3-b7-journey-j1-*` ×9 |
| J2 计划员 | 主生产计划行详情（item 子表）→ MRP 日结（MRP-20260928-xx）→ MO 建议确认 → MO-2026-0014 审批 → release → 排产 apply → 生产订单看板 → 排产甘特 → 计划工作台建议卡 | MPS-202610-01（approved，5 item 行）→MRP 快照→MO qty=23606 链路一致；甘特 3 工序（混合搅拌/烘焙膨化/调味包装 10-09~10-10）=FCS apply 结果；**看板列分布五列对拍全等**（草稿4/已生效7/已下达4/执行中5/已完工2） | `w3-b7-journey-chain2.txt` + `w3-b7-journey-j2-*` ×5 |
| J3 车间主任 | 生产订单 drawer（工序子表）→ 齐套（组件回补→assigned）→ 领料×4（reserved→consumed）→ 车间终端报工（UI 三数等式 23606+0+0=23606）→ 补报齐 → 完工 → OQC → 放行 → 完工单页核对 | **三数等式逐工序成立**（posted 合格+损失=MO qty，equation_ok=t×3）；MO 状态轨迹 released→in_progress→completed；完工 MC-B7J2-0014 OQC passed 放行 | `w3-b7-journey-chain2.txt` + `w3-b7-journey-j3-*` ×6 + `w3-b7-psql.txt` |
| J4 质检员 | 质检看板 → 质检工作台逐项打分（默认「水分 0~5」填 6.8 红行 + 感官「不合格」大按钮 + 5 新增数值行 150 全超 → 7/7 红）→ 提交总判 → 放行（A 单 passed→合格库）/ 处置（E 单 failed→return→RETURN_VENDOR→closed） | A 单 reduced 档 n32 d=0 passed + 放行（lot→qualified ±MOVE）；B 单 d=5=Ac5 临界接收留证；D 单 d=7≥Re4 failed（感官翻转修复后 major=7）；E 单 d=2≥Re2 failed → 处置单 QM-NC-2026-0006 return closed + movements −200 RETURN_VENDOR；**AQL 严格度状态机**（拒收后供应商 reduced→normal，GB/T 2828.1 第 9 章） | `w3-b7-journey-chain1.txt` + `w3-b7-journey-j4-*` ×7 + `w3-b7-psql.txt` |
| J5 仓管 | 收货终端扫码（PO 卡 → 行级 lot 键入 B7J1-LOT1/2 + 数量 → 验证收货）→ 待检区 → 库存查询 → 月度收发存台账 → 盘点管理行详情 | RCV-TERM-2026-0002/0003 两单落库（待检 hold bin SH-Q-02-01）；movements +1000/+200；IQC 挂点自动建单（QI-2026-0013/0014）；收货后 iqc 状态全部由质检闭环驱动；月度台账 2026-09 17 行 | `w3-b7-journey-chain1.txt` + `w3-b7-journey-j5-*` ×7 |
| J6 管理员 | 审批流配置中心（SVG）→ EditForm 改流 pur 阈值 200000→250000（extras+转移条件两处同写）→ 一致性探针 → 复原 → 权限矩阵页 → 组织架构页 | config_note 双向留痕（改+复原两行 w3b7-j6）；探针 0 问题；wfl 六表完整；阈值复原 200000 | `w3-b7-journey-chain3.txt` + `w3-b7-journey-j6-*` ×4 |
| J7 member | qc_inspector（质检部）URL 直达：采购订单行详情 drawer → 生产订单看板（2560 宽全列）→ 审批流配置页 | member 83 集合 view 授权在位；行详情 drawer 可见（22 行 + drawer 非空）；看板可见；配置页 404 + **REST 直写 403**（写路径封死） | `w3-b7-journey-chain3.txt` + `w3-b7-journey-j7-*` ×4 |

双端说明：业务平台取证走 `:3080/nocobase`（admin + member 双账号）；操作者终端即 B6 触屏形态（iframe 于 NocoBase 页内 + 390px 触屏视口取证在 B6：`w3-b6-report-05-390px-touch.png`）；mobile 通道（`:3080/mobile`）的采购/审批动线取证已在 W 轮 B2/B9 完成（`b2-mobile-approve.png`、`b9-final-01-mobile-supplier-receipt.png`），W3 未新增 mobile 页面故未重拍。

## 三、B7 终验发现并修复的 B6 遗留缺陷（三处）

详见 [`w3-b7-defects.md`](w3-b7-defects.md)。共性：三者都藏在「第二次」——页面冒烟验证了首张单，任务完成性动线（多张单/两种判定/库存后果）才暴露。

| # | 缺陷 | 根因 | 修复 |
|---|---|---|---|
| 1 | receive-goods 收货单编号永远撞号（400 already exists） | `nextDocCode` 扫 `code` 列，`wms_receipts` 编号列是 `receipt_no` → 恒产 0001 撞 B6 首行 | codeField 参数化，receive 调用传 receipt_no |
| 2 | **感官检验行「不合格」静默翻转为「合格」**（质量判定失真） | `Number(null)===0`：两 null 边界被当数值行 `[0,0]`，actual null→0，0∈[0,0]→pass=true；数值行忘填读数也静默判 0 | `isNumericRow`/min/max 改 typeof number 收窄；actual 缺失 fail-loud；selftest 全绿复验 |
| 3 | availability-check 重入把预留打入永久 released，领料死锁（assigned 但 post-issue 无有效预留） | 重入先释放 reserved 旧行（→released），但 reserve() 按 code 幂等「kept released」——released 旧行永久挡住重建 | 重入时同步 destroy 本 MO 的 released 旧行（重挑 FEFO 语义完整）；领料×4 posted → in_progress 实证 |

## 四、收官门禁记录（2026-09-28）

| 门禁 | 结果 | 证据 |
|---|---|---|
| 9 步链 s1–s9 全量（三轮） | **全 PASS**（s5 幂等护栏新增：旅程确认全部 MO 建议后新 run 无建议 → 在途 MO 承接续跑，与 s3/s7 护栏同族；其余各段含 s6 幂等续跑全绿） | `w3-b7-final-chain.txt`、`w3-b7-chain-second-round.txt` |
| `--assert-ledger` | **OK**（36 组、189 条流水，Σmovements==stock——旅程新增收货/退货/领料/完工流水后仍平） | `w3-b7-final-gates.txt` |
| `approval-engine --selftest` | **OK**（含 B6 终端校验三数等式/读数判定/缺陷汇总/收货卡口——缺陷 2 修复后复验） | `w3-b7-final-gates.txt` |
| `kpi-run --selftest` | **OK** | `w3-b7-final-gates.txt` |
| `kpi-run --backfill 90` 幂等 | **两趟均 2081 rows** | `w3-b7-final-gates.txt` |
| `setup-nocobase.mts verify` | **OK**（B1 row-detail+member ACL / B2 子表+守卫+跳转 / B3 四看板+甘特+双日历 / B4 配置中心五件套 / B5 组织权限六件套 / B6 三终端+端点冒烟+部门围栏 403 + W/W2 全部既有断言；旅程流水落库后 `--recalc` 月度快照对账 20 行==重放） | `w3-b7-final-verify.txt` |
| wire 健康探针 | **anomalies=0，addNewMissing=0**（pages=80 tableRows=99 全在线；4 看板/日历卡 ViewAction 子树全 present） | `w3-b7-probe-final.txt` |
| 性能抽查 | **交互全达标**：drawer-open 1496ms / 看板 4958 / 甘特 4460 / 终端 4339ms；整页冷载 5.8–8.6s 为 dev 模式（NocoBase 未构建+网关代理）特性 → 遗留 #4 生产构建复测 | `w3-b7-perf.txt`（B1 基线：drawer 交互 786ms） |
| 防呆抽查 | 删除确认弹窗（B2 `w3-b2-delete-confirm.png`）；报工三数等式负例（`w3-b6-report-02-equation-neg.png` + B7 旅程实测 1+0+0≠23606 提交按钮锁死）；终端负例 curl（B6 `w3-b6-curl.txt`）；引擎对象无 UI 直改状态路径（D4 只读看板 + 全部写走引擎动词——J1–J7 动线即证） | 各批次证据 |
| psql 行级证明集 | **0 错误 111 行**（J1–J7 全断言面） | `w3-b7-psql.txt` |

## 五、W3 批次交付面（B1–B7）

| 批 | 交付 | 关键证据 |
|---|---|---|
| B1 | 行详情工厂 + 95 块全域 heal + 断链三处修复 + member 83 集合 view ACL + 回滚演练 | `w3-b1-heal-run.txt`、`w3-b1-*-drawer.png`（admin+member×7 域）、`w3-b1-rollback-drill.txt`、`w3-b1-perf-mo-drawer.txt` |
| B2 | 12 页子表 drill-down + Edit/Delete 守卫行操作（删除确认）+ 审批单据双向跳转 | `w3-b2-*-drawer.png`（PO/供应商/检验/BOM 等子表行）、`w3-b2-jump-*.png`（双向跳转）、`w3-b2-delete-confirm.png` |
| B3 | 四只读看板 + 排产甘特（plugin-gantt v1 只读）+ 计划/交期双块日历 + member 看板可见 | `w3-b3-kanban-*.png`（含 member）、`w3-b3-gantt.png`、`w3-b3-calendar-*.png` |
| B4 | 审批流配置中心（SVG 状态图 + wfl 六表表单化直写 + admin 专用 + config_note + 一致性探针）| `w3-b4-map-*.png`、`w3-b4-edit-drawer.png`、`w3-b4-consistency.txt`、`w3-b4-member-url-404.png` |
| B5 | 组织架构（部门树+挂接）+ 权限矩阵页 + approver_map 部门路由 + 员工 org_dept 列 | `w3-b5-org-chart.png`、`w3-b5-acl-matrix.png`、`w3-b5-selftest.txt`（六态部门路由） |
| B6 | 三操作者终端（报工/逐项打分/扫码收货）+ serve 三动词端点（闭环强校验+token+部门围栏）| `w3-b6-report/inspect/receive-*.png`（各 3–5 步序列 + 390px 触屏 + 负例）、`w3-b6-curl.txt` |
| B7 | 五角色七旅程 × 双端 + 全链零回归 + 三缺陷修复 + 99 交付总表 + 本批 Note | 本文件 + `w3-b7-*`（journey/chain/psql/gates/verify/probe/perf/defects） |

## 六、W3 遗留表

| # | 遗留 | 定性 | 建议 |
|---|---|---|---|
| 1 | 终端端点 token：`W3_TERMINAL_TOKEN` 未设时 lenient-demo（serve 日志自警示） | 生产必设项（B6 设计内，env 开关） | 部署清单固化：`W3_TERMINAL_TOKEN=<32+ 随机>`；可选 `W3_TERMINAL_ENABLED=false` 一键下线 |
| 2 | runjs 白名单只许读（权限矩阵页渲染矩阵 → 写靠 EditForm REST） | 设计取舍（runjs 无安全写通道） | 若 NocoBase 上游提供 runjs 写沙箱再评估 |
| 3 | 私有集合（wfl 六表等）列渲染走通用表格无中文标题美化 | 低频配置页保留表格是正确分工（业界逆耳 #1） | W4 若做配置页字段汉化，走 flow-page-lib 列定义通道 |
| 4 | 整页冷载 5.8–8.6s（dev 模式 NocoBase 未构建 + :3080 代理链）；drawer/看板/甘特/终端**交互**全 <1.5s | dev 环境特性，非 W3 引入（B1 基线 drawer 786ms） | 生产 `APP_ENV=production` + 前端构建 + nginx 静态化后复测预算 |
| 5 | b9 s5 幂等护栏新增（旅程确认全部 MO 建议后新 run 无 MO 建议 → 在途 MO 承接续跑） | 剧本对真实数据形态的适应性（与 s3/s7 护栏同族），非遗留缺陷 | 若重置演示数据需同步回顾护栏条件 |
| 6 | MO-2026-0013（旅程中途孤儿，released/assigned 停态）与 JR-B7J2-0001..3（挂 0013 的 draft）留存 | 真实系统中间态；0014 为完整闭环载体 | 可在下一次数据治理时 void 或归档 |
| 7 | 感官翻转缺陷的存量污染面：B6 期间经工作台判定的感官行（若有）pass 已失真 | 修复前单据 QI-B7J4-C 留证（感官行 pass=true）；B6 时段的 pending 单已被 B7 全部重判或留证 | 若有 B6 时段已判单需追溯，按 `inspected_at` 窗口人工复核 |

## 七、W4 候选

- 终端 token 生产化部署清单 + `W3_TERMINAL_ENABLED` 运维演练（遗留 #1）。
- 拣货扫码/盘点任务分派页（D10：与收货同模板复制——B6 已验证一版模板）。
- 生产构建性能复测（遗留 #4）+ nginx 静态化部署口径。
- 移动端（`:3080/mobile`）与 W3 新形态的整合页（看板/终端形态的 mobile 适配——当前 mobile 为 W 轮 v6 体系）。
- MPS 可编辑网格（Odoo 式）——现 MPS 表格+拆单建议卡已覆盖计划员动线，网格化属增强（D10 维持）。

## 八、Agent Note 索引（W3）

- B5 组织权限 [`.agents/notes/implemented/architecture/2026-09-27-w3-b5-org-acl.md`](../../.agents/notes/implemented/architecture/2026-09-27-w3-b5-org-acl.md)
- B7 终验口径（旅程取证规范 + 三缺陷）[`.agents/notes/implemented/process/2026-09-28-w3-b7-acceptance-journeys.md`](../../.agents/notes/implemented/process/2026-09-28-w3-b7-acceptance-journeys.md)
- B1–B4/B6 的决策记录在各自批次文档与 `w3-bN-*` 证据内（B2 通道契约/B3 D4 只读口径/B4 config_note 审计/B6 D9 端点架构）
