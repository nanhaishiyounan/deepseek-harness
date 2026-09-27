# Agent Note: W1 审批引擎——数据层状态机作为唯一转移真源、双入口汇流与卡口四件套

Status: implemented

[English](2026-09-25-w1-approval-engine-single-source.md) | 中文

## 问题

产品里并存三个互不相通的审批模式：NocoBase collection workflow（三条域内链）、expert-orders 的代码级状态机、mobile v3 人审卡（`nb_create` 直写、不产生平台审批任务）。没有通用引擎、没有审计表、没有「未生效不能驱动下游」的卡口——而用户的核心诉求就是 审核怎么审、审批流呢。NocoBase PRO Workflow Approval 插件不可用（且其 update 节点做不了读-改-写算术，2026-09-15 的 workflow note 已有此定论）。

## 决策

**数据层持有状态机；一个脚本引擎是唯一写路径。** 六张 `wfl_*` 集合（ERPNext Workflow 范式 NocoBase 化）：`flow_configs` / `flow_states` / `flow_transitions`（配置）、`approval_records`（append-only 审计，谁/何时/动作/意见/轮次五要素）、`approval_todos`（双端待办队列），外加 `gate_configs`（下游卡口）。`examples/kb-agent/scripts/approval-engine.mts` 是唯一移动单据 `doc_status` 的模块；其余一切经由它。

**doc_status 存字符串状态；锚点是映射不是列。** `hub_po_purchase_orders` 的试点列存六态字符串（`draft/pending/pending_level2/approved/rejected/void`）；ERPNext 的 0/1/2 锚点由 `DOC_STATUS_ANCHORS` 承载，逐转移记录在每条审计行上（`from_anchor`/`to_anchor`）。旧业务 `status` 列不动——D2 双轴分离。

**规则落在一个两端共 import 的代码文件。** `packages/connector/tool-nocobase/src/approval-rules.ts` 持有状态词表、锚点、含金额阈值路由的转移表（`total <= 100000` 一审生效；超限进 `pending_level2`，Odoo `po_double_validation` 语义）、条件 DSL 求值器（只认 `字段 <= n` / `字段 > n`，其余 fail-loud）与中文拒绝文案。脚本引擎（`approval-engine.mts`，NocoBase workflow 的 request 节点经 :13110 HTTP 调用）与 `nb_approve` 工具（`write.ts` 的 `nbApproveEngine` 走 REST client）各自在此唯一规则模块之上跑结构平行的编排；规则漂移不可能，编排漂移由两个模块头部的平行结构契约约束并被镜像测试覆盖。

**卡口四件套挂在写工具上，配置驱动。** `nb_create` 落库前跑 `enforceCreateGates`：每条绑定目标集合的 `wfl_gate_configs` 行解析 values 的上游引用（`upstream_field`，经 `upstream_ref_field` 匹配——试点绑 `wms_receipts.source_no` → `hub_po_purchase_orders.po_number`）并要求上游行为 `approved`，否则以「未生效」拒绝。`nb_update` 跑锁编辑（`pending`、`pending_level2`、`approved`、`void` 拒绝；`draft`/`rejected` 保持可编辑供改后重提）。引擎接入之前的 NocoBase 部署保持旧行为：两个探测把 `wfl_*` 集合的 404 读作「无引擎」，答空放行——其余失败照常上抛。

**并发幂等是乐观条件回写。** 引擎的 act/submit 先以 `filter: {id, [state_field]: 当前态}` 更新单据；0 行即并发者已胜，败者在写任何 record/todo 之前拒绝。这封掉一次真实双发：NocoBase collection workflow 对 request 回调重试了一次，加固前的引擎为一次审批写了两条审计行。工具侧保持普通写（单用户对话路径）；其序列级幂等（重复 act 撞 非法审批转移）有单测覆盖。

**页面入口是被引擎消费的 intent 行。** 审批中心页的 Add-new 写一条 `source=page` 的 `wfl_approval_records` 行；workflow 的 condition（`source == 'page'`）转发到引擎 `/act`，引擎成功后删除该 intent 行——记录表只显示引擎写的审计行。`source` 判别同时也是回环断路器：引擎自己 `source=engine` 的行永不触发回调。

## 备选方案

- NocoBase PRO Workflow Approval——不可用；且 OSS workflow 的 update 节点做不了读-改-写，审批级联本就必须在脚本侧。
- 两端共用一个编排包——被否：脚本引擎跑在 tsx 下有自己的 REST 面（`update?filter=` 乐观写，`NocoBaseClient.update` 不暴露），而工具包必须能脱离示例脚本部署。共享规则文件把漂移面收敛为规则零漂移 + 编排一对镜像。
- 把锚点（0/1/2）存成单据列——被否：psql 可断言的生命周期（`draft → pending → approved`）与中间态（`pending_level2`）都需要字符串；锚点是逐状态属性，属于 `flow_states` 与每条审计行。
- workflow trigger 的 `config.filter` 代替 source 条件——wire 未实锤；condition 节点是 h4:707 已验证的模式。

## 后果

- 后续批次（B2–B8）按同一 `PILOT_TRANSITIONS` 形状种子 `wfl_*` 行即可挂载各自单据流——每个域零新增引擎代码。
- `approval_pending` / `approval_confirm` / `approval_result` 三个协议围栏（v3）扩展了 mobile wire：待审卡可操作（同意/驳回 + 意见发送围栏化用户消息，AI 同事据此调 `nb_approve`），结果卡只读。解析器把模型的中文状态词归一到闭合英文枚举——枚举仍闭合；双语拼写是同一状态词表。
- `setup-nocobase.mts` 的 all 链在 h5 与 n18 之间重放 `nocobase-w1-approval.mts`，verify 断言六集合、审批中心页、激活的试点流程配置、卡口行与试点列（n18 下限 43→44）。
- 已知缺口：审批中心待办块的 `status=open` 默认过滤未生效（v2 TableBlockModel 的 filter wire 尚无实锤形态）；块标题注明了过滤口径，状态列渲染彩色标签。补实锤的块过滤留给后续批次。
- 引擎 `--serve`（:13110）需运行才有页面入口；mobile 与 CLI 入口不依赖它。
