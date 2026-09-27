# Agent Note: B2 供应商单真源——准入收编 wfl 引擎、生命周期卡口与旧表降级

Status: implemented

[English](2026-09-26-b2-supplier-single-source.md) | 中文

## Problem

供应商数据散落三张互不相通的表：`srm_suppliers`（SRM 八态生命周期 + 创建即触发的 NocoBase manual workflow）、`hub_po_suppliers`（mobile 填表助手的写入目标，六列，status=待审核）、`hub_as_vendors`（资产服务商，无关）。WMS 收货引用 `srm_suppliers`，而 mobile 登记与采购单引用 `hub_po_suppliers`——跨域断链。B2 批次（plans/2026-09-25-mfg-closure/03-b2-supplier-lifecycle.md）要求归一为单一数据源，带真实准入流（potential → 审核 → qualified 才可下 PO）、PO 下单 AVL 卡口、双端可操作（mobile 审批卡 + NocoBase 审批中心/准入页），并处置存量五条待审核行（id=7~11）。

## Decision

**`srm_suppliers` 是唯一供应商真源；`hub_po_suppliers` 降级为只读的「采购联系人（历史）」。** mobile 登记改写 `srm_suppliers`（formRegistry 切换表项；persona 契约、fieldControls 枚举、rich.ts 标签随迁；`.dsh/.agent-presets` 部署拷贝同一变更内同步）。w2 脚本把 B0 的「采购供应商」v2 页改题为「采购联系人（历史）」，历史行一律不迁出——只有五条待审核的 mobile 登记行迁移为 `potential`/`internal` 行并生成新的 `SUP-YYYY-NNNN` 编号（按名称去重；迁移 id 记磁盘账本供回滚；hub 原行保留）。mobile 生成编号在 `srm_suppliers.code` 上续号；h4 种子的 `SUP-001` 形态编号模式不同，永不冲突。

**准入作为第二词汇族跑在 W1 引擎上，而不是再造一台引擎。** `wfl_flow_configs` 本就带 `state_field`；B2 把词表做成可插拔：`state_field='lifecycle_status'` 的流走供应商准入词表（potential → reviewing → qualified | rejected，qualified 为生效态，`admitted_at` 为生效日期扩展列，reviewing 锁直接编辑），六态 doc_status 机原样不动。`approval-rules.ts`（两个入口共同 import 的唯一代码真源）新增 `FlowVocabulary`——states/labels/anchors/effectiveState/lockedStates/nextOf/illegalMessage——以及按流配置解析的 `vocabularyForStateField`，未知字段 fail-loud。脚本引擎与 `nb_approve` 每次 act 各解析一次词汇族并共享全部文案。任一词汇族的初始态（draft/potential）之后 submit、驳回态（rejected）之后 resubmit 是同一条规则。

**h4 创建即触发的准入 workflow 退役，由 w2 脚本停用。** 若保持启用，每条新 potential 行都会双轨进队（NocoBase manual 队列 + wfl 待办）。停用走 `workflows:update` 写 `enabled: false`——2.2.6 的 workflows 没有 `:toggle` action（该路由经 flow-page 库的 `call` 静默 404），这一 wire 事实已记入脚本注释。verify 断言停用态，并断言 h4 种子供应商珠海鲜丰水产科技有限公司仍为 qualified（生命周期变更绝不触碰存量行）。

**AVL 卡口是 B1 卡口长出的枚举集。** `wfl_gate_configs` 新增 `upstream_state_field`（留空 = doc_status，向后兼容），`required_status` 接受逗号分隔集合。种子行绑定 `hub_po_purchase_orders.supplier_id → srm_suppliers.lifecycle_status ∈ {qualified, preferred}`；`nb_create` 前置校验（工具侧与引擎的 `enforceGates` 双侧）以「未准入/不合格供方」消息拒绝，消息点名实际生命周期状态与准入集合。生命周期卡口 required 为空集时 fail-loud 视为种子错误——空集什么都放不进来，那是配置不是策略。

**双端操作同一条准入流。** mobile：登记回执追加「已进入准入审核，审核通过后可下单」；状态查询回读真实行渲染报告卡；「提交准入」与审批卡驱动 `nb_approve`（wfl 待办表不限 doc_type 地供给审批卡）。NocoBase：审批中心意图表单（source=page → workflow → :13110 `/act`）写出同样五要素的审计行；SRM 供应商准入/供应商档案页读同一 `lifecycle_status` 列。`approval_result` 围栏协议的封闭状态集扩到四个准入态（potential/reviewing/qualified 加共享的 rejected）并带中文归一；审批卡补了它们的印章/文案/底色行。

## Alternatives considered

- 保留 h4 manual 链作准入引擎（批次文档的字面表述）——放弃：mobile 审批卡与审批中心页都从 `wfl_approval_todos`/`nb_approve` 投影；改由 NocoBase manual 节点供给需要第二条未经证实的投影路径，并破坏 W1 note 拥有的「状态转移唯一真源」不变式。生命周期词汇族保住了单引擎。
- 把生命周期词并进 `WorkflowState`——放弃：六态机封闭且与 B3+ 单据共享；混入词集会让 `qualified` 读起来像合法的 `doc_status`。按流词汇族让每台状态机保持完整。
- 通用「卡口 DSL」替代枚举集——放弃：当前唯一需求是固定集合的成员判断；`parseRequiredStatuses` 就是全部表面，空集 fail-loud。
- 迁移全部 hub_po_suppliers 行——放弃：非待审核行是历史联系人不是待办准入；迁它们等于伪造准入工作。

## Consequences

- `pnpm vitest run packages/connector/tool-nocobase`（29 测，准入链 + 卡口负正例）与 `packages/client/ui-mobile`（623）保持绿；`approval-engine.mts --selftest` 在内存里覆盖准入序列、reviewing 锁编辑、非法动作文案与卡口对。
- `setup-nocobase.mts` 在 w1 之后（n18 之前）跑 w2；verify 断言准入流配置、供应商卡口、h4 workflow 停用、h4 种子未动、以及「采购联系人（历史）」页题。
- 长驻部署必须同时重启 `dsh web` 网关与 :13110 引擎才能装载词汇族（3080 模块图冻结在验收时咬过一次：mobile 提交对着旧六态工具代码失败，重启后通过）。
- 旧表的行数是「不再增长」守卫：mobile 登记落 `srm_suppliers`；`hub_po_suppliers` 保持基线（research/2026-09-25-w-round/b2-psql.txt 断言）。

## Verification

- psql（只读，research/2026-09-25-w-round/b2-psql.txt）：迁移行 potential/internal 带 SUP-2026-NNNN 编号；h4 种子未动；`qualified,preferred` 卡口行；准入流配置与其四条转移；h4 workflow 停用；真实库上的引擎全序列（submit → reviewing → approve → qualified + admitted_at；对 potential 供应商的卡口拒绝点名「未准入/不合格供方」；qualified/preferred 放行）；同一单据的双入口审计行（engine 与 page）。
- 浏览器：b2-mobile-register.png（真实 LLM 对话 → 草稿卡 → 确认 → 回执 + 准入提示）、b2-mobile-status.png（回读真实行的报告卡）、b2-mobile-approve.png（审批卡 → 同意 → 合格）、b2-admin-approve-before/after.png（准入页状态流转）、b2-admin-approval-center.png（待办 + 双来源审计）。
