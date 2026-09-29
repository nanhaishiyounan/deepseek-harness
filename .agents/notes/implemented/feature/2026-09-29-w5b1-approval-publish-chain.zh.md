# Agent Note: W5-B1 审批流发布链路 —— graph → wfl 单向编译 + fail-loud 门禁 + 原子 CAS 发布

Status: implemented

[English](2026-09-29-w5b1-approval-publish-chain.md) | 中文

- 日期：2026-09-29
- 状态：已实现
- 范围：`examples/kb-agent/scripts/approval-engine.mts`（编译器 + 发布动词 + selftest 矩阵）、`examples/kb-agent/scripts/w5b1-publish.mts`（取证跑批）、`examples/kb-agent/designer/src/` + `dist/`（发布按钮 + 反馈 + 已发布标识）、`examples/kb-agent/scripts/nocobase-w3-approval-visual.mts`（textarea 退役）、`examples/kb-agent/demos/acceptance-w5/b1-capture.mjs`

## 问题

B0 把设计器 graph 落为编辑态唯一事实源，但引擎消费的仍是种子 states/transitions 行——画布怎么改运行时都不变，且配置中心仍靠手写 JSON textarea 编辑 approver_map/extras（用户原始投诉）。发布链路需要：graph→引擎行的单向编译器、fail-loud 门禁、先证明编译器能无损重现当前行的逆向导入器，以及与并发保存安全竞逐的原子发布。

## 决策

**graph 保持编辑态唯一事实源；发布经固定词汇表模板 + 规范角色键派生 wfl 行；每次发布先过 round-trip 等价门禁；写入是单条 data-modifying CTE 语句。** 引擎转移代码零改动（B1 红线）。

- `compileGraphToRows(graph, ctx)` 把主链（cc 节点作透传折叠）映射到种子模板：单据词汇表 → 6 状态 + 8 条 PILOT 形状转移（角色 `manager`/`gm`）；准入词汇表 → 4 + 4（`srm_manager`）。规范角色键（非节点 id）让派生行与种子字节一致——这正是逆向导入器与等价断言互为精确逆运算的前提。可选条件节点编译为两级金额路由：`extras.amount_field`/`amount_threshold` + 直批行上的 `field <= N` 字面量（代码侧 `nextStateOf` 的阈值判定仍是权威）；无条件则删除这两个 extras 键（仅 graph 拥有的键——invoice_match_tolerance 原样透传）。
- 门禁（全部聚合、全部可读、每次拒绝 400 附完整清单）：结构校验（复用 validateFlowGraph）、孤立节点、恰好一个开始、至少一个结束、环（DFS 灰黑标记，先于度约束症状报告）、可达性、各节点类型的度契约、条件 DSL（恰一行、操作符 `>`、数值、字段在 /designer/meta 词表内）、引擎可消费特性矩阵——B1 可发布 user/role 审批人（role 在发布期经 psql rolesUsers 联查快照为用户名）、或签、autoReject/transferAdmin 空策略；supervisorChain/formField/deptLeader/依次审批/会签/autoPass/assignUser 以标注 B2 的可读理由拒绝（各自需要零改动引擎表达不了的运行时语义）。
- `rowsToGraph` 把现库行逆向为 graph 草稿（≤ 字面量变为条件节点的 `field > N` 行；无字面量的结构两级流——pur_rfqs 形状——导入为不带条件的两个审批节点）。发布路由先把**当前**行经 导入+编译+`assertRowsEquivalent`（角色键经 approver_map 值归一）重放一遍，任何漂移即拒绝——编译器必须先证明能重现现库配置，才被信任去替换它。三种现存形状全部 round-trip：阈值两级（pur_orders）、结构两级（pur_rfqs）、准入（srm_suppliers）。
- `POST /flow-graph/publish {doc_type, base_version}` 与保存共用 graph_version CAS 计数器（并发保存/发布恰好一胜；实证两轮各一 200 一 409）。改写是**单条** psql 语句：`WITH bumped AS (UPDATE wfl_flow_configs SET … WHERE id AND doc_type AND graph_version = base RETURNING id)` 加全部挂在 `bumped` 上的 DELETE/INSERT 臂——CAS 落败则所有臂 no-op。多语句字符串做不到这一点：psql 隐式事务会把干净的「UPDATE 0」提交掉、照样执行 DELETE（版本没动而派生已落库）。发布前行快照进 config_note 作可重放回滚锚；`published_graph_version`/`published_at` 列（幂等新增）供设计器已发布标识与 /designer/meta。
- 设计器顶栏新增 发布（未保存修改先自动保存，链上返回的版本号）：成功弹派生统计（N 状态 / M 转移、词汇表、角色、时间），拒绝逐条列出全部门禁错误，409 提示重载。配置中心 textarea 通道退役：CONFIG_EDIT_FIELDS/CONFIG_CREATE_FIELDS 去掉 approver_map/extras，`retireTextareaEditing` 销毁四个存量 FormItemModel（行编辑 + 新建两表单）及其子字段模型并修复 FormGridModel 布局行；--assert 新增负检查——任何 w3b4 表单再绑定这两个字段即 FAIL。

## 固化的坑

- **发布被拒不得推进版本号**：负例矩阵逐例断言 400 后 `graph_version` 不动——门禁全部先于 CTE 执行；且浏览器发布同样推进计数器（浏览器发布后再脚本化保存，不重读版本必 409）。
- **psql 的 `SELECT user` 求值为 CURRENT_USER**（数据库角色）而非 todos 列——必须写 `"user"`，否则待办归属断言静默读到 nocobase。
- **角色键是规范名而非节点 id**：与种子模板字节一致才让 assertRowsEquivalent 精确比対现库与派生行；按节点 id 造角色键会破坏 round-trip 与 W3 一致性探针的阈值字面量对齐。
- **行内「编辑」打开的是页内 ChildPage（role=dialog）而非抽屉**——深链（`/view/<树uid>/filterbytk/<id>`）渲染同一表单，是稳定的取证路径；页面上存在两棵编辑树，「第一个编辑按钮」可能打开的是详情视图。

## 结果

- 取证（`w5b1-publish.mts --run`，全程真实 PG + 真实引擎 HTTP）：快照 → 逆向导入基线 → 脚本化设计器编辑（一级审批 admin→chenliqun）→ 发布 200（6 状态 / 8 转移，published_at 落库）→ psql 断言（approver_map 携带编辑、行数吻合、allowed_role 可解析）→ 十例 HTTP 负例矩阵（逐例 400 + 可读 + 版本不动）→ 真实 RFQ 跑单（提交 → chenliqun 待办 → 审批 → approved、记录 2 条、待办关闭）→ 保存∥发布 CAS 竞逐 ×2（各恰好一胜）→ 回滚重发布（行表与跑批前快照语义一致）→ 回归跑单（待办回到基线审批人）→ 清理（0 残留，披露 diff）。
- `--selftest` 增编译器矩阵（门禁负例、编译正例、双词汇 round-trip、阈值漂移捕获）；`w5b1-publish.mts --selftest` 独立运行。R1 回归全绿：`w5r1-concurrent-cas` PASS、`pnpm run lint` 26 基线、设计器 `tsc --noEmit` 0 错、引擎 `--selftest` OK、`setup-nocobase.mts verify` 全链 OK（含发布后行表上的 w3b4 一致性探针）。
- 截图 `demos/acceptance-w5/b1-01..04`（发布成功弹窗 + 已发布标识、含画布孤立节点的拒绝清单、跑单开待办 JSON、退役后编辑表单只剩 流程名/激活/配置变更留痕）；取证脚本 `b1-capture.mjs` 可重复且跑完把流程恢复到已发布态。

## 备选方案

- 多语句 psql 事务（BEGIN/UPDATE/DELETE/INSERT/COMMIT）——否决：CAS 判定需要第二次往返，「版本已动而行未改写」之间存在崩溃窗口；单条 CTE 语句构造上就是全有或全无。
- 按节点 id 派生角色键——否决：破坏与种子模板的字节等价和 round-trip 门禁；规范 manager/gm/srm_manager 让引擎行词汇表保持封闭。
- 把 supervisorChain/formField/deptLeader/会签编译成近似语义（部门全员、任一人可审）——否决：静默语义放宽；改为发布期以可读的 B2 指针逐项拒绝。
