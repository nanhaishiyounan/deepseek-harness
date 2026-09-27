# Agent Note: W2-B5 审批阈值/容差配置化 + 多审批人路由 + RFQ CLI

Status: implemented

[English](2026-09-27-w2-b5-approval-threshold-config.md) | 中文

## Problem

99 遗留 #1/#3：两级审批阈值（100_000）在两个入口都是硬编码常量，发票三方匹配容差（0.05）是 w3 脚本里的第二个常量，approver_map 只带单个 admin 用户名，sendRfq/awardRfq 没有 CLI。05-b5 批次要求四者全部配置化——以 W 轮现行为精确缺省（extras 为空时零漂移），且 packages 侧规则模块（tool-nocobase，W2 唯一触碰 packages 的批次）保持脚本引擎与 `nb_approve` 两个入口同一真源。

## Decision

- **配置位是流配置行的 extras JSON，不是 cordis.yml（PLAN D7）。** `wfl_flow_configs.extras` 增 `amount_threshold`（正数）与 `invoice_match_tolerance`（非负数）。依据：approval-engine 是 scripts 侧独立进程而非插件——数据侧流配置行是天然的按流配置位；仓库 no-hardcoded-tunables 在 examples 侧的落地形态是数据文件/env（`W1_ENGINE_CALLBACK` 先例），绝不是插件 Config。
- **`thresholdOf(extras)` + `approversOfRole(map, role)` 是共享纯函数**（[approval-rules.ts](../../../../packages/connector/tool-nocobase/src/approval-rules.ts)）。thresholdOf：缺键/null extras → `DEFAULT_AMOUNT_THRESHOLD`（APPROVAL_AMOUNT_THRESHOLD 的重命名——降级为回退值，不再是唯一取值）；键存在但值非法（字符串、零、负数、NaN）fail-loud。approversOfRole：角色值可为单用户名或数组——数组 = 或签（任一人可审；会签属企业版范围，拒绝）。`nextStateOf`/`FlowVocabulary.nextOf` 增加可选尾参 `threshold`，缺省 DEFAULT——B5 前的每个调用点行为分毫不变。
- **两个入口都在流加载时解析阈值。** `loadFlow`（引擎）与 `loadFlowConfig`（nb_approve）各跑一次 `thresholdOf(extras)` 并把解析值传入 `vocab.nextOf`；缺键回退按流按进程打一行日志（引擎侧）。act() 的转移交叉检查仍读种子条件字面量，extras 与条件漂移时会以「缺转移配置」fail-loud（规则与配置互为校验）。
- **todos 逐审批人展开一行；任一人 act 即完成整档。** openTodo/openTodoAt 把 `approversOfRole` 展开为每人一行 `wfl_approval_todos`；closeTodos 本就按状态关闭全部 open 行，任一审批人 act 后其余作废——审计五要素不变。每个 map 用户名都在 users 表做存在性断言（任何 todo 落库前 fail-loud「引用不存在的用户」）。
- **seedDocFlow 收敛 options 拥有的键；每次变更追加一行 config_note 审计。** options 的 amountField/amountThreshold/invoiceMatchTolerance/approverMap 把转移条件（列名 + 阈值字面量幂等归一）、拥有的 extras 键与 map 收敛到配置目标；option 未给出的键不动现有流的值（手工配的 so_orders 阈值能在 w3 重跑中幸存）。`wfl_flow_configs.config_note`（本批新增的审计列）按次记录 谁/何时/旧值→新值——实测活闭环：种子写入 200000 切换、负例脚本的 ghost/abc 探针造成漂移、下一次 w3 运行修复回去，两个方向都留了审计行。
- **发票三方匹配容差走 pur_orders 流 extras**（`matchTolerance(io)` 读 `invoice_match_tolerance`，缺省 MATCH_TOLERANCE=0.05，非法值 fail-loud）；`--send-rfq <code>` / `--award-rfq <code> [--quote <报价行id>]` 成为 w3 独立 CLI 动词（quote 可指定非最低价中标；pur_quotes 无 code 列，行 id 即键）。
- **Demo 配置（验收对）：** pur_orders extras = amount_threshold 200000 + invoice_match_tolerance 0.1，manager 档 ['admin','quality_lead']——¥15 万一审生效（quality_lead）、¥25 万加签 gm；so_orders 与其余流不带键（缺省 100_000，W 轮字面量 `amount <= 100000` 验证不变）。`admin` 用户名落成真实 users 行（本快照超管是 `nocobase`；W 轮 map 引用的 `admin` 一直是无 users 行的裸字符串——fail-loud 校验本会拒绝所有流）。

## Notes

- 驳回→重提重放无法在已生效单据上重演待办展开（reject 只接受 pending 态）：demo 保留专证单（PO-B5-C 已生效带两行 completed 档位行；PO-B5-D 留 pending 带两行 open 供页面活样）。
- `s2` 零回归成立是因为 B9 采购单 ¥880（任何阈值下都一审）；w3 demo 链 PO ¥120,000 在配置 20 万下合法地变为一审——有意的配置效果，不是漂移。
- `pnpm run lint`（全仓 89 规则集）仍有 27 处预存错误（write.ts 的 B2/B3 `no-unnecessary-condition` 簇 + ui-mobile v6）；B5 改动面贡献为零（四个触及文件的 staged oxlint：0 错）——全仓清理属后续卫生批次，不属 B5。
- b9 `--stage s7` 在已发货 SO 上不可重放（shipSo 的预留已被首跑消耗）——W 轮幂等形态，B5 未触碰；s7 相关的 B5 面（pur_payments 缺省阈值 + 一审付款留痕）由 psql 证据覆盖。
- 负例驱动脚本（research/2026-09-27-w2-evolution/w2-b5-negatives.mts、w2-b5-rfq-cli.mts）是幂等证据驱动器：各自还原漂移配置并在退出前销毁探针单据。

## Evidence

- `research/2026-09-27-w2-evolution/w2-b5-threshold-cases.txt`——手算 psql 对：pur_orders 条件 `amount <= 200000`、PO-B5-A ¥15 万两步轨迹（submit → quality_lead approve → approved，无 gm 节点）、PO-B5-B ¥25 万三步轨迹（→ pending_level2 → gm approve）、两行档位展开（PO-B5-C completed 对、PO-B5-D open 对）、so_orders 缺省字面量 100000 + 无键 extras、其余流无键 extras、pur_payments 缺省 + B9 付款留痕、config_note 审计行（旧值→新值含 operator 与时间戳）。
- `w2-b5-negatives.txt`——容差对（差 ¥0.08：0.05 口径 exception vs 0.10 口径 matched，同一单据）、幽灵审批人 fail-loud 零残留、`"abc"` 阈值 fail-loud 且 extras 还原。
- `w2-b5-rfq-cli.txt`——`--send-rfq`（approved → sent，sent_at 回填 ×2）与 `--award-rfq --quote 9`（指定 ¥2.5 越过 ¥2.5 最低价 → closed + PO ¥250），含幂等重放。
- `w2-b5-vitest.txt`（41/41：34 基线 + 7 新增）/ `w2-b5-selftest.txt`（引擎 selftest 含 B5 段）/ `w2-b5-verify.txt`（setup-nocobase verify OK 含 w2-b5 块）。
- `w2-b5-approval-center.png`——审批中心页面（18 行待办表活样）。

## Alternatives considered

- **阈值走 cordis.yml Config**——拒绝（PLAN D7）：approval-engine 是 scripts 侧进程非插件；流配置行是现成的按流配置位，env/CLI 才是这一侧仅有的进程级旋钮。
- **extras 非法值静默回退**——拒绝：批次文档验收把 `"amount_threshold":"abc"` 定为 fail-loud（misconfiguration fails loud）；只有缺键回退（且打一次日志）。
- **数组的会签语义**——拒绝：企业版范围；数组是或签——任一人 act 即作废整档待办，审计五要素不变。
- **独立 wfl_config_audit 表**——本批拒绝：配置属主行上的 config_note 列即可回答 谁/何时/旧值→新值，无需新集合；结构化审计表以后可无痛取代（注释是 append-only 文本）。

## Consequences

本 Note 记录的决策自此成为对应面的现行契约（详见 Decision 与 Evidence）。
