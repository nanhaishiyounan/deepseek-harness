# Agent Note: W5-B2 审批流高级节点全量迁移 —— 六特性解锁 + 10 型 round-trip + 三入口 effect 收敛

Status: implemented

[English](2026-09-29-w5b2-approval-advanced-nodes.md) | 中文

- 日期：2026-09-29
- 状态：已实现
- 范围：`examples/kb-agent/scripts/approval-engine.mts`（标记审批人解析/聚合判定/回退边/cc/effect 层/编译器与导入器扩展/selftest 矩阵）、`examples/kb-agent/scripts/w5b2-advanced.mts`（取证跑批）、`examples/kb-agent/scripts/nocobase-w3-approval-visual.mts`（装饰标题 heal）、`examples/kb-agent/designer/src/` + `dist/`（department 类型/levels/emptyAssignee/rejectTo/userFields 面板）、`packages/connector/tool-nocobase/src/write.ts` + `approval-rules.ts`（nb_approve 委派与生效钩子、通用条件 DSL）、`examples/kb-agent/demos/acceptance-w5/b2-capture.mjs` + `b2-00..05.png`

## 问题

B1 以「B2 启用」指针拒发布六类高级特性（supervisorChain/formField/deptLeader/依次审批/会签/autoPass/assignUser），10 个启用审批的 doc_type 中仅 3 型验证过 round-trip；approve 的三入口（CLI/HTTP/nb_approve）副作用分叉——移动入口既无 so_orders/mps_plans 生效钩子（BP-02）也不解析部门路由条目（BP-14）；配置中心装饰标题仍承诺「发布派生在 B1」；页面回调工作流与引擎审计行构成隐性重放环（多级流下幻影推进二级）。

## 决策

**graph 仍为编辑态唯一事实源；高级语义经三类通道下派生行与运行时——approver_map 对象标记（运行时解析型审批人）、extras 图属键（sign_modes/cc_after/condition_dsl）、转移行本身（回退边与通用条件正置字面量）；act() 的 approve/reject 路由改为行驱动（条件行优先、无条件行兜底），共享规则 resolver 降为无行可用时的回退。生效钩子收敛为 effectiveEffects() 单出口，三入口全部经它。**

- **标记审批人**：deptLeader/supervisorChain/formField 编译为 approver_map 内 `{type, emptyPolicy, emptyAssignee?, levels?, value?}` 对象；openTodo 按单据上下文解析——提交人主部门（mainDepartmentId 回退首挂接）的 isOwner 成员、沿 parentId 上溯 N 级主管链、单据字段（`row[field] ?? row[field+'_id']`，REST 行携带裸外键列）所指用户。空解析按节点空策略处理：transferAdmin/assignUser 改派待办，autoPass/autoReject 经 act('(auto)') 自动推进（深度上限 8，审计行落 '(auto)'）。既有部门全员或签形态与新增「部门成员」assigneeType 字节互通（department 条目不再误读为 deptLeader）。
- **会签/依次**：extras.sign_modes 按角色记录非或签档；countersign 全员待办、任一拒绝即整单拒绝、全员 approve 才推进（每签一行 from=to 审计）；sequential 一次一签、越序被拒（无待办）、按解析序开下一签。
- **回退边**：approval 节点 rejectTo 属性编译为 `pending_level2×reject→pending` 转移行（无 rejectTo 保持 →rejected）；拒绝落地后按「下一状态有 approve 行即等待态」重开一级待办；导入器把该行还原为 approval_2.rejectTo。
- **通用条件**：条件行扩为多行（AND/OR）× 八操作符（`> >= < <= == != contains in`）；单行 `字段 > 数字` 保持 B1 阈值模板（字面量镜像直批行），更丰富形状走 v2 编译——正置字面量挂 `pending→pending_level2` 行、金额键删除、extras.condition_dsl='v2' 标记（nb_approve 据此识别行驱动流）。approval-rules 的 conditionApplies 解析同一 DSL（子句序列 + 单一连接词），两入口共享。
- **cc 运行时**：编译期把 cc 节点挂到其链锚点的「离开态」（start→draft、approval_i→pending/pending_level2）落 extras.cc_after；act 的 approve 转移离开被键状态时生成 kind='cc' 只读待办（wfl_approval_todos 幂等增列 kind，NULL 视为 todo；一切聚合计数排除 cc）。
- **迁移字节中性**：编译器对金额键「默认值不落键」（amount_field=total 或阈值=100000 时不写 extras），等价断言经引擎解析透镜（thresholdOf/total 缺省）归一——10 型迁移后 extras 与种子形状逐字节一致（hub_po/so_orders/pur_payments/mfg 无新增键，pur_orders 200000 原样保留），W2-B5「so_orders 无 amount_threshold」探针零扰动。单审批发布仍带模板的 vestigial pending_level2 行；导入器按 gm 角色是否有映射判层级，空映射不再产出无审批人的二级节点。
- **三入口收敛（BP-02/14）**：effectiveEffects(token, docType, docId, code) 为 so_orders→reserveForSo、mps_plans→recalcPlan 的唯一出口；CLI --act、HTTP /act（inline）、新 POST /effective-effects（幂等重放）三处调用；nb_approve 检测高级流（approver_map 对象条目或 sign_modes/cc_after/condition_dsl 键）整体委派引擎 /act，本地路径落地生效后经 /effective-effects 补钩子（不可达时 fail-loud 给出重放指引，不静默跳过）。CLI 效应链 Promise.race 25s 超时防传输悬挂。
- **页面回调环切断**：引擎经 HTTP 写的审计行一律 source='engine'——页面回调工作流按 source='page' 触发重放，引擎自写 'page' 行曾使每个 HTTP 审批被幻影重放（多级流下自动推进二级）；页面真意图行（页面 UI 创建）仍触发回调并被引擎消费销毁，来源语义保留在意图行上。
- **装饰标题 heal**：flowModels w3b4edtnkmzmd50m 的 JS 块文案由「发布派生在 B1」heal 为当前状态（保存后读回校验，未落库即抛）；--assert 增负检查（旧文案不得残留）。

## 固化的坑

- **页面回调工作流按 source='page' 重放 /act**：引擎经 HTTP 路由写行的 source 曾硬编码 'page'，多级跑单中二级审批被幻影推进（日志双 act 佐证）；引擎写行必须 'engine'，'page' 仅属页面创建的意图行。
- **模板 vestigial 行**：单审批图派生仍含 pending_level2×approve/reject 行；导入器若按行存在判定两级，会产出无审批人的二级节点卡死 round-trip——按 gm 角色映射存在性判定。
- **fields:list 双形态**：REST 字段行的 options 可能是 JSON 字符串、relation 目标在顶层 `target` 列而非 options.target/targetCollection——词表与人员字段判定需两种读法（曾致 formField 门禁全员拒绝、条件字段词表为对象集）。
- **默认值不落键**：迁移把默认金额字段/阈值写成显式 extras 键会破坏 W2-B5「so_orders 无 amount_threshold」探针——引擎本就按缺省解析，默认值保持隐式使迁移对默认阈值流 extras 字节中性。
- **psql `-t -A` 下 `DELETE … RETURNING` 输出命令标签而非行**——清理脚本先 SELECT id 再逐行删。
- **CLI 生效钩子链偶发传输悬挂**（keep-alive 断连致顶层 await 永不落定、进程以 unsettled 警告退出 0）——Promise.race 超时 + 幂等 /effective-effects 重放，取证披露重放路径。
- **oxlint 对 JSON.stringify 的类型窄化**（string 而非 string|undefined）：`?? ''`、`=== undefined`、`as string` 三种写法各触发一条规则——unknown 转文本用 `typeof x === 'string' ? x : JSON.stringify(x)`。

## 后果口径

- `--migrate`：10/10 类型全绿（每型：逆向导入 → round-trip 等价 → graph 保存 → CAS 发布 → psql 行数/发布标记复核 → 发布行内存状态机回放到 approved/qualified），70 断言全过；迁移后 10 型 extras 与种子形状逐字节一致。
- `--features`：F1 会签（两待办/首签不推进/全员通过生效/任一拒即拒）、F2 依次（仅首人待办/越序 400/次人待办/末序生效）、F3 回退边（转移行改写/拒绝回一级/待办重开/重走生效）、F4 抄送（审批前零 cc 行/通过触发 kind=cc/不阻塞）、F5 deptLeader（解析质检部主管）、F6 主管链（两级依次）、F7 formField（owner 所指人）、F8 autoPass（无部门提交人提交即生效 + '(auto)' 留痕）、F9 assignUser（空解析回退指定人）、F10 通用条件（区间内进二级/区间外直批/正置字面量落库）——65 断言全过；发布门禁负例 8 例（含保存期 3 例）逐例 400 + 可读 + 版本不动；恢复基线后 states/transitions/approver_map/extras 四元组字节一致。
- `--parity`：CLI/HTTP/nb_approve 三入口各跑一张真实 SO——状态推进 approved、记录 submit+approve=2、待办清零、reserveForSo 预留行各 ≥1（CLI 一次传输中断经幂等重放补齐，披露）；BP-14 探测部门路由流走引擎（不再报 approver_map 值非法），20 断言全过。
- 回归：`approval-engine --selftest`（含 B2 高级节点运行时矩阵 + 编译器 B2 矩阵 + 四组新 round-trip）OK；`w5b2-advanced --selftest` OK；`pnpm run lint` 26 基线持平；`pnpm run typecheck` 0 错；designer `tsc --noEmit` 0 错；`w5r1-concurrent-cas` PASS；`setup-nocobase.mts verify` 全链 OK；`nocobase-w3-approval-visual.mts` build（含 heal）+ `--assert` OK。
- 截图 `demos/acceptance-w5/b2-00..05`（会签属性面板/会签跑单中途/依次次人待办/回退后一级重开/cc 只读待办/条件多行面板），采集脚本 `b2-capture.mjs` 可重复并恢复基线；组织 isOwner 主管数据作为常驻改进保留（披露）。

## 备选方案

- 会签聚合下推 SQL（待办表聚合查询）——否决：跨 NocoIO（REST/内存）不可移植；act() 内应用层聚合以既有行表为准。
- 通用条件编译为多转移行展开——否决：组合爆炸且拒绝路由不可表达；单行正置字面量 + 行驱动求值是行表的最小扩展。
- nb_approve 复刻全部高级语义（本地实现标记解析/聚合）——否决：双实现必然漂移；委派引擎使每特性单一代码路径，本地孪生仅保留静态模板（字节等价于既有路径）。
- 修改 W2-B5 探针以接纳显式默认键——否决：迁移应向现状收敛而非要求现状放宽；默认值隐式化让探针零改动通过。
