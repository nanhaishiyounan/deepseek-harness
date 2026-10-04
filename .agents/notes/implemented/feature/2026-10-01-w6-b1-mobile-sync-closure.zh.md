# Agent Note: W6-B1：mobile 同步闭环 —— 待办页、单据浏览、服务端发号、发件箱、生效钩子补偿队列、湖仓定时 transfer

Status: implemented

[English](2026-10-01-w6-b1-mobile-sync-closure.md) | 中文

- 日期：2026-10-01
- 状态：implemented
- 领域：feature
- 范围：`packages/client/ui-mobile`（todos/docs 路由、outbox、台账投影、回执校验）、`packages/connector/tool-nocobase`（服务端发号、补偿队列入队）、`examples/kb-agent`（引擎补偿 drain + 夜间 transfer 腿、preset 契约）
- 计划：[`plans/plan-w6.zh.md`](../../../../plans/plan-w6.zh.md) §B1；断点证据 [`resear../../../../research/2026-10-01-w6-research/mobile-nocobase-sync-gaps.md`](../../../../research/2026-10-01-w6-research/mobile-nocobase-sync-gaps.md)（G2/G3/G5/G6/G7/G8）
- 证据：`demos/acceptance-w6/w6-b1-01…09`（live 跑：引擎+网关+NocoBase，psql 对账）

## Problem

六个同步断点（G2~G8）让 mobile 无法投产：审批状态不回流、台账在 localStorage、湖仓快照陈旧、弱网发送无保护、没有单据浏览、引擎单点。

## 改了什么

1. **G2（审批状态不回流）** —— 三条腿：
   - `#/todos`（新路由 + `TodosView`）：登录人的 open `wfl_approval_todos` 行，走网关既有 `nocobase.list` 实时转发，5s 轮询 + 下拉刷新，按单据类型分段计数，行内 同意/驳回 打开携带 B0 越权闸门的填表会话（`ledgerService.ts` 的 `actOnTodo`）。
   - 会话内审批卡空转时回读实时 `doc_status`（4s 轮询）：一旦离开审批词，冻结的 pending 快照翻成「他端已处理」（`ApprovalCard` 的 `externalState`、`ChatView` 的 `approvalStates`）。
   - 读面与引擎 `GET /todos?user=`、psql 三方对账（`w6b1-sync.mts` 断言腿）。
2. **G3（台账纯 localStorage）** —— 「本月登记」改为按登录人投影 `wfl_approval_records` 的 submit 行（`myMonthlyRegistrations`）；最近回执条继续折叠会话日志。跨设备真实、清缓存不丢。
3. **G5 上（弱网无保护）** —— 发件箱（`outboxStore.ts`）：传输层失败（fetch `TypeError`）持久入队；指数退避（首次立即 → 2^n 秒，封顶 60s）、`online` 事件触发冲刷、队列上限 50、逐条独立重试。会话内以待发条数作降级提示；恢复后自动补偿。
4. **G5 下（客户端预号竞态）** —— 守卫集合的单号列为空时由 `nb_create` 在写路径内发号（`allocateEmptyCode`/`nextNumberFor`：降序读回、同年 max+1、跨年重置 0001）。客户端预号降为纯展示（`systemFields.ts` 读回改按号降序）；preset 指示模型编号字段传 `""`、回执以落库行真实号为准。并发草稿不再撞号；重试重新发号。
5. **G6（无单据浏览）** —— `#/docs`（`docsCatalog.ts` 角色白名单目录）、`#/docs/:collection`（实时列表）、`#/docs/:collection/:id`（全字段 + `wfl_approval_records` 审批轨迹）。查单据零对话回合。
6. **G7（湖仓快照陈旧）** —— 夜间定时器新增 `lakehouse-transfer` 腿（`w6b1-lakehouse-transfer.mts`）：13 张 NocoBase 业务表走同一 `lakehouse.load` seam 全量替换为 `nb_*` Parquet 快照；business-advisor preset 强制湖仓回答标注数据截止时点、实时问题改走 `nb_list`。
7. **G8（引擎单点）** —— `/effective-effects` 失败落持久 `wfl_effect_backlog` 队列（NocoBase——引擎重启不丢）；引擎 serve 循环每 30s 自动重放（钩子幂等，10 次放弃），`/healthz` 报告 `backlog_pending`，夜间 pass 加 `drain-backlog` 腿便于观测。
8. **B0 遗留清偿** —— ① fold 只在窗口内存在同 collection:id 的成功 `nb_create` 结果时才把 `submit_receipt` 围栏渲染为回执卡；编造回执降级折叠（模型叙述不再是回执来源）。② 退出登录弹窗文案与真实账号体系一致。③ 过账集合（wms/mfg）的 draft/pending 在待办/单据面统一按过账语义翻译（待过账），绝不套用审批词。

## 为什么选这些 seam

- 待办/单据读复用既有 `nocobase.list/get` wire（不加网关方法）：该域本就是实时、有闸门的转发——B1 缺的是消费面，不是传输面。
- 审批动作刻意走 agent 会话而非直连引擎：B0 越权闸门在 `nb_approve` 内盖章校验，mobile 审批动作绕不开 acting-user 闸门；`#/docs` 匿名浏览面保持开放，写/审批一律需要登录会话。
- 补偿队列放 NocoBase（而非引擎内存）正因为要覆盖的失败模式就是引擎挂掉。

## 值得守住的不变量

- 回执卡必须匹配成功的 `nb_create` 落库（`fold.ts` `ReceiptVerification`）；会话列表投影窗口扩到 16 事件保证 call/result 对始终在视野内。
- `allocateEmptyCode` 先于 `enforceCodeUniqueness`；数据库部分唯一索引仍是调用方给号与服务端发号共同的权威兜底。
- `drainEffectBacklog` 只经 `effectiveEffects()`（唯一生效出口）重放；失败 10 次的行落 `failed` 交人工，永不无限循环。

## 验证

- `pnpm run typecheck`（0 error）；vitest：ui-mobile 644/644（含 outbox/docs-catalog/fold 降级新例与回执校验改写）、tool-nocobase 48/48（含服务端发号对例，见 gates-b1.log A 节）、apiproxy 绿；oxlint staged 0 error。
- `w6b1-sync.mts --assert` 14/14（补偿队列表+健康面、待办对账、送审→路由→批准→关闭闭环、湖仓行数相等、补偿重放 done、六守卫集合零撞号；项数与 w6-b1-09-assert.log 的 ✓ 行数一致）。
- live 证据：`w6-b1-01…05`（待办页、审批 Modal→会话→关闭且审计 `approve|qc_inspector`、单据目录/列表/详情/轨迹、buyer 角色过滤、断网→入队→恢复补偿）、`w6-b1-06`（草稿预估号 vs 落库号）、`w6-b1-09` 断言日志。

## 后续

- `#/docs` 目录是固定角色表；B10 角色演练可按站点扩展（配置面，不动代码）。
- 规模上去后推送可替代 5s 轮询；单站点规模下轮询成本正确。

## Alternatives considered

- **NocoBase mobile 布局 vs apiproxy 读方法+ui-mobile 路由**——选 apiproxy 域转发形态（ADR#2 同族）：能力已验证、不触 platform 子树。

## Consequences

成本：读路径多经引擎代理一层。买到：六断点全闭合（待办/单据/台账投影/outbox 重试/湖仓定时/补偿队列）。
