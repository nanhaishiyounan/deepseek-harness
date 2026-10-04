# Agent Note: W6-B4 MES 执行面——车间卡片流、CCP 监控、BOM 版本化/ECO

Status: implemented

[English](2026-10-02-w6-b4-mes-execution-surface.md) | 中文

## Problem

制造业轮调研的结论把生产链切成执行面与治理面两张皮，W6-B4 批次对两面都欠账。车间现场只有一个操作工靠 `?operator=` 自报的报工终端；食品 HACCP 关键控制点读数既无台账也无预警通道；配方 BOM 带着 `version`/`bom_status` 列却没有变更单纪律——一次配方编辑可能悄悄改动在产订单脚下的版本。本批必须在既有底座（W3 终端、W 轮 mfg 表、B2 预警引擎、B3 追溯视图、wfl 审批引擎）上交付三件事且不另起炉灶：操作工身份由会话推导的触屏卡片流、限值长在数据里的 CCP 监控、以及对在产 MO 保持版本快照语义的 ECO 门控 BOM 版本切换。

## Decision

**卡片流 = 会话身份 + 引擎发号幂等。** `scripts/w3-terminals/cards.html`（经 `/terminals/cards.html` 提供）通过引擎 `POST /terminal/session` 签到——引擎代理 NocoBase `auth:signIn` 换回平台 token；此后每个读写都带 `authorization: Bearer`，引擎用 `recallActor` + 生产车间部门围栏推导操作工（`approval-engine.mts` 的 `cardFlowOperator`）。写路由一律不接受自报操作工。`POST /job-report` 复用 W3 三数等式钳制与 `postJobReport` 过账路径，新增客户端生成的一次性 `submit_key`（每次打开报工弹层一个，字符集门禁 `[A-Za-z0-9:_-]`——标记与 SQL 元字符在任何 psql 之前被拒），并在 `mfg_job_reports.submit_key` 上去重（唯一索引；重放返回原裁决并带 `duplicate: true`）。发号始终在服务端（`nextDocCode`）。

**CCP 监控 = 配置化监控点、只增台账、单一预警通道。** `mfg_ccp_points` 行承载参数/单位/CL 上下限/监控频率/工序范围/纠偏指引——限值是「CCP监控配置」页可编辑的数据，不是代码常量。`POST /job-report` 在本工序每个在围监控点都录入有限读数前拒绝提交（HACCP 监控完整性），并追加 `mfg_ccp_records` 行（谁/何时/实测值/CL 快照/是否越限/纠偏动作）。一次越限在同一次写路径里触发三件事：报告挂名的批次冻结（`wms_lots.status='frozen'`）、开一张纠偏 `qm_nc_dispositions` 草稿、并跑一遍 `scanAlerts()` 按种子规则的路由落 `ccp_deviation` critical 预警 + in-app 通知。预警行只经 B2 扫描器产生（其 `hitsSelect` 分支以「已 resolved 的预警不再进命中集」尊重质量侧关闭），绝不走第二条插入路径。

**ECO = 创建即草稿、影响分析创建即冻结、版本切换在引擎。** `mfg_ecos` 挂六态 wfl 流（manager 档为质检部双账号数组，gm 档 admin）。`POST /eco/create`（按 cordis.patch.yml 角色矩阵做 planner/质检/admin 部门围栏）把产品当前生效默认 BOM 克隆为下一版草稿、套用经校验的 `line_changes`（`add` 对基线已有产品拒绝——应改用 `update`）、复制工序，并冻结影响分析快照：挂在原版本上的在产 MO、该产品的成品批次、以及经 `so_order_lines` **或** B3 `v_trace_edges` 递归闭包可达的未交付 SO。审批通过触发 `effectiveEffects('mfg_ecos')` 钩子（`applyEco`）：一条 psql 把该产品现有默认全部降级、新版本转生效默认、原版本停用，并盖 `effective_at` 章。MO 各自保有 `bom_id`——在产订单永不迁移（版本快照）。「配方版本与变更」JSBlock 控制台渲染版本时间线、蓝/黑/红行差异、影响面板，并用会话 bearer 经引擎送审草稿 ECO（`window.__w6b4PlmRender` 是证据驱动器的渲染入口）。

## Alternatives considered

**只用终端 token 的身份（W3 形态）。** 既有 `W3_TERMINAL_TOKEN` 仍守着每条终端路由，但它认证的是终端机不是人。B0 真实账号底座让按操作工的会话成为可能，且 R3 纪律禁止写路由自报身份——尽管共用终端要多一步签到，会话链仍胜出。

**CCP 限值塞进 `alert_rules.params`。** B2 规则行承载路由很称职，但 CL 上下限需要按工序圈定、单位、监控频率、纠偏指引，规则行得超载。专用 `mfg_ccp_points` 表把规则行留在路由（B2 的本分），又给配置页一张一等公民的编辑面。

**越限时直插 `wfl_alerts`。** 从终端路由直接写预警行省一次扫描，但它分叉了预警产生路径：去重语义、重开行为、通知盖章都会与扫描器漂移。落记录后跑一遍 `scanAlerts()` 保住唯一产生通道，并继承「尊重已关闭」的命中过滤。

**审批时才建新版本。** 在生效钩子里建 to 版本能保证草稿不落库，但审批人批的是变更*描述*而无从 diff。创建即草稿让 PLM 控制台有一个真实版本可对比，审批流审的是工件本身。

## Consequences

执行面拿到了真实的身份边界：无会话访问、错误密码、质检会话进卡片流、shop_lead 会话发起 ECO，全部被拒（401/403）且有断言。双击提交恰好落一行——count=1 的 psql 对账腿进了验收矩阵。代价是引擎面增长：五条新终端路由、三条 eco 路由和 `applyEco` 钩子住在 `approval-engine.mts`，沿用既有 token 守卫与 CORS 信封，引擎需重启才加载。演练数据可识别、清理脚本化（冻结批次恢复、演练 MO 删除、常驻 `MO-W6B4-FLOW` 承载 MO 在循环计划耗尽时深重置自身演练报工），断言矩阵可无限重跑全绿。

遗留：Andon 齿轮的维护请求项等 B8 维保模块（按钮可见地禁用并注明原因）；B2 预警列表页的 `rule_type` 枚举章先于 `ccp_deviation`（行正常渲染、可按状态过滤，第五张统计卡属 B10 打磨）；卡片流的 mobile 腿不在 B4 范围。

## Testing

`w6b4-assert.mts` 六腿 44 门：live 三联、卡片流会话身份与 psql 对账（会话推导 `operator=shop_lead`、工序状态推进）、幂等重放（count=1）、CCP 越限链（预警行 critical/open、≥3 路由通知、批次冻结→恢复、纠偏单）、ECO 版本梯（影响分析在列、送审、审批、版本切换、新 MO 用新默认、在产 MO 不动、diff 行 psql 对账）、负向用例。连续三轮原样全绿。证据：`demos/acceptance-w6/w6-b4-01..10-*`（CDP 驱动器 `demos/acceptance-w6/.shoot-w6b4.mjs` 采的九张浏览器截图、断言日志、psql 对账日志）与 `demos/acceptance-w6/gates-b4.log`（typecheck、oxlint staged、三模块断言腿）。
