# W6 轮交付总结（B0~B10 + R1~R6，2026-10-01 ~ 2026-10-03）

> 主计划 [`plans/plan-w6.zh.md`](../../../plans/plan-w6.zh.md)；证据根 `demos/acceptance-w6/`（W6 目录，与 W5 两家目录区分）；批次底稿 `research/2026-10-01-w6-rework/<批次>/`；Agent Notes `.agents/notes/implemented/feature/2026-10-*-w6-*.md`。本文每行结论都有实测证据锚点（数字全部实测，真话债零容忍）。

## 一、批次交付记录（每批一行：做了什么 / 证据 / 验证结论）

| 批次 | 做了什么 | 证据（demos/acceptance-w6/ 与 research/…/w6-rework/） | 验证结论 |
|---|---|---|---|
| B0 mobile 身份基座 | mobile 真实登录对接 NocoBase users；apiproxy 会话→身份绑定，approver/requester 服务端注入；越权审批闸门；G1 登记即送审 | `w6-b0-04/06/07/09`；Note `2026-10-01-w6-b0-mobile-identity` | 断言腿绿；matrix 门02（非 admin 审批 73 单） |
| B1 mobile 同步闭环 | G2~G8 六断点：待办/单据读方法、#/todos、#/docs、工作台账服务端投影、outbox 重试+服务端发号、湖仓 transfer 定时化、补偿队列 | `w6-b1-01~06`；`b1/recon.sql` | 断言腿绿；matrix 门01/03/04/05/06 |
| B2 规则引擎+预警中心 | alert_rules 统一模型+小时扫描+预警中心两页+四路规则（效期/证照/账期/质量）+in-app 通知 | `w6-b2-01~05`、`vfy-w6b2-*`；`b2/recon.sql` | 断言腿绿；matrix 门07~11（八路规则、幂等 diff=0、通知1077） |
| B3 食品合规核心包 | 效期看板（双轨阈值热力矩阵）、批次追溯 DAG（CTE 视图+正反向+召回高亮）、召回状态机+冻结快照、labels 条码 SPA（GS1 四 AI round-trip）、receipts 外键迁移 | `w6-b3-*`、`vfy-b3-*`；`b3/recon.sql` | 断言腿绿（trace/recall/labels 三腿）；matrix 门12~18 |
| B4 MES 执行面 | 车间卡片流终端（签到+MO 卡+报产+gear 菜单）、Pending Qty、CCP 五要素监控+越限冻结联动、Plant Floor、BOM 版本+ECO 审批+diff+影响面板 | `w6-b4-01~09`；Note `…-w6-b4-mes-execution-surface` | 断言腿绿（b4-assert/ccp/bomver 三腿）；matrix 门19~22；B10 修复可重跑性（ECO 演练撤收） |
| B5 QMS 检验工作台 | 队列三视图+全屏检验向导（AQL 徽章+超差双按钮+拍照）、四路处置决策卡、出厂检验报告九要素+合格证号、CAPA 轻量 | `w6-b5-01~07d`；`b5/recon.sql` | 断言腿绿（含向导重放）；matrix 门23~26 |
| B6 CRM 激活 | 商机管道 Kanban（拖拽+概率回写+加权统计）、客户 360 三层、报价单据化→转 SO、今日待办 | `w6-b6-*`、`w6-b6fix-*` | 断言腿绿（32✓）；matrix 门27~29 |
| B7 SCM 比价矩阵 | JSBlock 分组嵌套比价矩阵+逐行定标+三维（价格/交期/质量）、prevent 联动准入、定标→PO、采购域治理 | `w6-b7-*`、`vfy-b7-*` | 断言腿绿；matrix 门30~32 |
| B8 EAM+APS | eam_* 五集合、维保日历/工单看板/资产卡时间线、点检终端、计量校准+到期预警、hub_as_* 退役重定向、APS 瓶颈归因+负荷热力+what-if 沙箱 | `w6-b8-*` | 断言腿绿（aps+eam 两腿）；matrix 门33~36 |
| B9 驾驶舱+财务 P1 | 经营总览（KPI/趋势/Top/期间过滤/钻取）、运营九步链路、AR 账龄五桶、对账单四段式 PDF、分级催收、三单匹配付款门 | `w6-b9-*`；`b9` assert（六门禁） | 断言腿绿；matrix 门37~41 |
| B10 终验+收口 | 八角色演练（含 mobile 腿）、44 门对账矩阵、GB 14881 映射、labels lint 收编、B2 统计卡位序修复、R5 裁决记录、文档收口、全量回归 | `w6-b10-*`、`gates-b10.log` | 演练 8/8（106 步）；矩阵 44/44；gates 全绿（见 §三） |
| R1 修复 | mobile 深链守卫/幂等重提拒斥（B0/B1 验证债） | `w6-r1-02/03`；Note `…-w6-r1` | 断言复绿 |
| R2 修复 | 跨源动词拆分/OPTIONS 预检/失败隔离/docs | `w6-r2-02~08` | 断言复绿 |
| R3 修复 | 条码绘制/XSS 负例/追溯断链可见性/召回身份门/mobile 条码默认 | `w6-r3-01~07a`；Note `…-w6-r3` | 断言复绿 |
| R4 修复 | 演练负例（lead N/A/404 toast/双击竞态/弹窗信息）+curl 围栏 | `w6-r4-01~10` | 断言复绿 |
| R5 修复 | 仪表注入探针/dedup/KPI 预警/AP 切换/脱敏/mobile 催收徽章+六坑位沉淀 | `w6-r5-01~08`；B9 Note 六坑位 | 断言复绿（expect 数值归一/真 FAILS 退出） |
| R6 轻量收尾 | 真话债双修（§五.1 planner 实测陈述 + ECONNRESET 可复核表述）+statcard 归因四处修正（§四.3）+cockpit 脱敏复核断言 8/8+UX 三小项（启用列是/否渲染/mobile 空提交 toast/member 图表 403 记 W7 §六.9） | `w6-r6-01~05`、`gates-r6.log` | 文档修正落位；b2 assert 绿；typecheck/oxlint 过 |

## 二、终验三件套（B10 本批）

1. **八角色演练**：`w6-b10-walkthrough.mjs`（可重跑）——8/8 角色、106 步全过、13 张截图（`w6-b10-r1~r8-*.png`）、逐动作 `w6-b10-actions.json`、随行 psql 对账 `w6-b10-psql-recon.log`。覆盖 mobile 腿（buyer 单据浏览/planner 待办/keeper+finance 预警，真实登录 dsh-mobile-auth 锚定）与 W6 新面（比价矩阵/效期看板/召回/检验向导/出厂报告/CCP/配方版本/商机管道/维保日历/驾驶舱/财务工作台/预警规则/设计器/权限矩阵对照）。
2. **对账矩阵**：`w6-b10-matrix.sh` → `w6-b10-matrix.log`——**44 门全 PASS**（≥30 要求；W5 基线 20 门扩展），十段（身份同步/预警/追溯召回条码/MES/QMS/CRM/SCM/EAM/财务/引擎横切），每门带实测计数。
3. **GB 14881-2025 复核**：[`b10/gb14881-mapping.md`](b10/gb14881-mapping.md)——14 行条款映射，核心五面（追溯/效期/CCP/出厂检验/召回）已覆盖，人员台账与受控文件两处部分覆盖如实标注（W7 候选）。

## 三、全量回归（gates-b10.log 如实）

- 最终轮（2026-10-03 12:04 CST）**22/22 腿全绿**：演练补播 3 腿（b9 --demo / b6 --seed / b5 向导重放 28✓）+ 断言腿 16 条（B0~B9 全部 --assert 与断言脚本 + B10 统计卡腿）+ 矩阵 44 门 + 演练 8/8 门 + typecheck + oxlint staged（本批新文件面）+ pairing + 清理腿 3 条——逐腿行见 `demos/acceptance-w6/gates-b10.log`，逐腿详 log `w6-b10-gate-*.log`。
- **`pnpm run doc-sync` 29 门 exit 0 全绿**（12:56 补录）：B10 期间修复 14 条 W6 Note 统一骨架（77 违例→755 条全合规）、b3 Note 两处包路径、tool/config-catalog 双语重生成与块级同步、b1 Note 链接深度、两条 B1 遗留 JSDoc、31 对 pairing 漂移重录（1207 对一致）——修复链如实记录于 gates-b10.log 补录段。
- 过程轮失败与修复全部留痕（§四）；ECONNRESET（NocoBase dev-server keep-alive 竞态）在 gates 断言腿内置仅限该错误码的单次透明重试（`w6-b10-gates.sh:41-49`，首试日志 mv 为 `*.retry1.log` 后重跑）——B10 试跑期间两次命中 `w6b3-recall --assert` 均重试后成功；该两次首试输出未随 demos 留存（demos 内 grep ECONNRESET 仅命中 gates.sh 本身、无 .retry1.log 文件），可复核面=重试代码与终轮 `gates-b10.log` 首试即绿（R6 修正：早前版本写作「两次日志均留档」，与 demos 现状不符）。
- 演练数据清理：b9 --clean、b6 --cleanup、b5 --cleanup 三腿 done（可识别演练行撤收）；append-only 审计行（召回通知/预警处理流/审批轨迹）按演练标记保留，如实标注。

## 四、B10 期间发现并修复的债

1. **B4 断言腿可重跑性**（ECO 演练累积耗尽 add 候选，第 26 次运行撞墙）：断言腿改为演练后撤收（默认版本回滚+演练 ECO 删除），一次性复位 v1 基线（4 行）——`w6b4-assert.mts` + `/tmp` 复位 SQL 记录于 `w6-b10-gate-b4-mes.log`。
2. **B6 断言腿可重跑性**（报价 converted 状态跨轮残留）：gates 序列化为 cleanup→seed→assert。
3. **B2 统计卡位序**（B2 验证遗留）：生效机制是重写 grid rows/rowOrder——`w6b10-statcard-order.mts` 合成两行卡行置于 rowOrder 头部并持久化（`w6b10cards-a/b,autoRow1,autoRow2`），截图 `w6-b10-05b-statcard-seated.png` 证实卡片在表格上方。呈现单列的成因是首轮落库的卡行 cell 为一格多 uid（psql 实测 `w6b10cards-a=[[4 uid]]`，一格内多卡纵向堆叠）；当前脚本已是每格一 uid 的分格写法（`chunk.map(uid => [uid])`），复跑时卡行已在前被 no-op 跳过、未重写 cell 形态——四列条带清除旧卡行重跑即可得，非平台渲染限制（R6 归因修正，早前版本把单列记作「一格多 uid」渲染限制，与代码相反）。
4. **labels lint 59 错**（B3 遗留 64）：`.oxlintrc.json` ignorePatterns 收编（platform/native 同格式+注释），`w6-b10-04-labels-lint.log` 前后对比；examples 更广同类伪错（247/151 文件）为既有仓况，记 W7 候选。
5. **网关启动深坑**：裸 `pnpm dsh web` 不带 `--patch` 时 nocobase domain 关闭（mobile 登录 404/「未启用」结构化拒绝）——正确命令 `DSH_HOME=examples/kb-agent/.dsh pnpm dsh web --patch examples/kb-agent/cordis.patch.yml`（QUICKSTART 已有，B10 演练脚本注释复述）。

## 五、R5 推来裁决（「已知边界」统一记录）

1. **planner 驾驶舱可见性**：设计分层裁决——经营总览聚合面（KPI 卡/趋势/运营链/异常摘要）对 planner/buyer 等平台会话开放可读，客户级明细（Top 客户、账龄钻取行）由引擎侧服务端脱敏（非 finance/admin 读 `/fin/cockpit` 时 customers 置空 + masked=true；R6 复核断言 `w6-r6-02-cockpit-mask.log` 8/8 过：planner 脱敏、finance 全量、KPI 可见），明细钱面 `/fin/aging` 对 planner 403。演练观察步实测 planner 直开经营总览路由渲染成功（`w6-b10-actions.json` observe 条目 rendered=true denied=false）——早前版本写作「被拦」与实测相反，R6 修正。后续方向：若试点厂要求 planner 见成本占用，加只读过滤视图而非开钱面。
2. **付款门 NocoBase 原生通道**：三单匹配付款拦截现行走引擎 `/fin/pay/apply`（403+message），NocoBase 原生 workflow 通道不承载该围栏——裁决维持引擎单一事实源（审批/围栏/审计同层），平台页只读消费。后续方向：平台侧按钮直连引擎端点（前端接线），不改围栏位置。
3. **customerOwnedBy 中文姓名**：`crm_deals.owner` 与会话 username 逐字符匹配，中文显示名 owner 需先规范化（owner 字段现阶段存 username）。裁决：围栏从严（宁可拒绝不可放行），中文姓名规范化随 owner 字段规格推 W7（B9 Note 遗留同条）。
4. **seatBlockRowTop 平台限制**：发票匹配页 JSBlock 前置从不生效（B7 比价表页同机制生效）——判定为平台 grid 渲染器对「已有行内块搬移」的页间差异；B10 用同机制修好了预警页统计卡（合成新行+rowOrder 前置），发票匹配页维持「增量块在下」并记录。后续方向：上游问询或整页重铺（W7）。

## 六、W7 候选遗留清单（终局盘点）

| # | 项 | 出处 |
|---|---|---|
| 1 | 人事四件套（报销/考勤/请假/档案）+健康证效期台账+培训记录（GB 14881 第12章） | 计划 §9 + GB 映射行10 |
| 2 | examples 面 lint 类型感知伪错治理（tsconfig 收编或整面豁免，247/151 文件） | B10 §四.4 |
| 3 | 发票匹配页 JSBlock 前置（seatBlockRowTop 页间差异）+预警统计卡四列条带落铺（机制已具备：清旧卡行重跑 `w6b10-statcard-order.mts` 即每格一 uid 分格成形，R6 归因修正） | B10 §四.3/§五.4 |
| 4 | SPC 图形（X-bar/R、Cp/Cpk）、留样管理 | 计划 §9 + C2 |
| 5 | 驾驶舱 Top 销售员榜（owner 数据稀疏）、对账单批量导出、催收外发通道（企微/邮件） | B9 Note 遗留 |
| 6 | GB 14881-2025 标准全文逐条字句核对（购文本后补录）+致敏物质/微生物监控表单化 | GB 映射复核结论 |
| 7 | BP-19 发号 TOCTOU 全平台收敛（服务端发号已落 mobile 腿） | W5 结论延续 |
| 8 | 报价→SO 的平台原生表单化（现走引擎工作台） | B6 边界 |
| 9 | member 角色读预警列表统计卡 403：`/api/charts:queryData` 对 member 无 ACL——8 卡「请配置图表」空置 + No permissions 弹窗（B10 演练与终验截图均在）；平台 v2 块无按角色显隐配置，候选修复=grant member `charts:queryData`（全局 ACL 面需评估）或块级显隐支持 | R6 诊断 `w6-r6-03-member-charts-before.png` + 4xx 清单 |
