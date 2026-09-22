# Agent Note：M2-P2 知识图谱工作台——本体编辑、变更流、语义着色、回放

Status: implemented

[English](2026-09-18-m2-p2-kg-workbench.md) | 中文

## Problem

M2a 交付了工作台的后端脊柱（registry v5、episode 账本、kg_edit、cross-source v2），但产品的四项能力仍没有人工表面：手动本体编辑只是 `KgOntologyChangeOp` 上「留给后续表面」的注释；episode 账本与灰区审核队列（0.5–0.9 对）不可见；画布按类型哈希着色（本体结构不可见）；也没有办法看到某次变更之前的图。P2 计划段还指定 `@xyflow/react` 做树、`graphology-communities-louvain` 做聚类，都待依赖政策评审。

## Decision

**零新依赖。** OntoTree 以图例已有的两级 `<ul>` 递归渲染 subClassOf 层级——树库买来的拖拽交互不在工作台规格里。Louvain 落为纯函数（[louvain.ts](../../../../packages/kb/kb-graph/src/louvain.ts)），与既有 ppr.ts 并排：`graphology-communities-louvain` 是浏览器画布依赖图，把它拉进服务端包会让 host 构建耦合画布栈，换约 150 行算法。缝侧计算分区（`communities(tenant)`），浏览器消费预计算分配——主线程从不跑检测。

**本体 CRUD 是一条先校验的写路径。** `applyOntologyOps` 先对照「活注册表叠加集合内更早操作」的覆盖层校验整个操作集（后面的操作可以指向前面刚加的类），再提交：重复、父类环、非法基数对、废弃父类在任何落库前拒绝。新类经 effectful 注册路径落 `draft`/`agent-defined`；改名/移动/废弃替换运行时映射条目并经双层注册表持久化。`deprecate_node` 引入 `deprecated` 状态（KGCL NodeObsoletion）：实例与历史保留，创建面向的枚举移除该类。线侧走一个新 RPC（`kg.ontologyEdit`），同时记 human-edit episode；revision 审计行归缝，episode 归 RPC。

**变更流、审核队列、回放是对权威流的读取。** `kg.episodes` 供给时间线（指令原文、来源徽标、mention 计数、按 episode 回滚走 M2a 的 `kg.rollback` 链）。审核队列从最新对齐 episode 的 review 元数据减去已决对推导——live 合并边、拒绝墓碑、或已记录的裁决 episode——不加新表。裁决（`kg.reviewDecide`）落 human-edit episode；合并把 `corefers_with` 边写在共享的 `kg-align:<doc>:<row>` 锚上，重复裁决保持幂等。revision 回放走 `kg.history` → `snapshotAt(tenant, asOf)`：该时刻及以前创建的节点，加上该时刻及以前记录且在此之前既未墓碑也未退役的边（live 即 `asOf = now` 特例）。

**语义着色来自注册表，不是哈希。** `semanticRootOf` 沿 extends 链走到根类，整个家族共享根的阶梯色；编辑类树后图例重载即在同一帧重导出颜色（last-ready legend ref 让树在刷新期间保持挂载而不是闪断）。三档颜色开关（类型哈希/本体语义/louvain 社区）只经一个画布 prop（`nodeColor`）注入——sigma 画布本身除该注入外未动。

**louvain 的统一 stub 口径。** 每个邻接槽存有向 stub：非自环对各写一个方向的 stub，自环把两个 stub 写进自己的单槽。`2m`、度数、Σin 与商图的自环数的是同一批 stub，模块度跨聚合层不变（早先混合口径会虚高——双团夹具报 0.51，真实最优是 0.426）。

## Consequences

- 以继承复用响应 schema 会继承其必填字段：`kg.history` 起初 extend subgraph 值 schema，因缺 `seeds_resolved` 在客户端校验失败——回放改从共享投影构造。
- Playwright 的 `hasText` 是大小写不敏感的子串匹配；本体行锚定必须用 `<code>id</code>` 芯片加精确正则（Product 行会匹配 'product'），图例行断言需要精确标签正则（FoodOn 标签互为子串）。测试夹具的类型哈希恰好等于语义色（`FrozenSoy`→9）时语义断言静默通过、只在类型档失败——用无撞色 id 双向断言。
- 测试里的快照时序必须让墙钟严格越过捕获点（同毫秒的 `expired_at > asOf` 平局会丢边）。
- 覆盖：louvain/ontology-edit/snapshot 单测套件、ui-kg 工作台组件套件、keyless 浏览器 e2e（kg-workbench-p2：网关分区与队列读、KGCL 编辑带 revision/episode 回执、对新增子类的语义 vs 类型图例着色、回滚使 live 边退役、合并裁决排空队列、回放横幅 + 空时刻 history）——6/6 绿，伴随既有 kg-graph-page e2e。
- 顺手修的 M2a 遗留：四包测试桩缺新 kg API 成员（含 episodes/rollback）、kg-build 测试配置缺 `foodon`/隔离字段、M2a agent note 早于 note 格式语法（重组为 Problem/Decision 形式、修正相对链接层级、补双语对）。

## Alternatives considered

- `@xyflow/react` 做本体树——否决（为规格从未要求的交互付 bundle 与许可评审；递归渲染同一层级）。
- `graphology-communities-louvain`——按上述 stub 口径决策否决；若检测需要手写 pass 没有的加权/多重图特性可再议。
- 物化 `kg_cluster` 表（计划 P2-4）——延后：按请求在 `liveAdjacency` 上检测对 1159 节点毫秒级应答且每次编辑后保持新鲜；物化只在跨运行消费者出现时才划算。
- 用专门的待决对表推导审核队列——否决：episode 账本加墓碑已能从权威流回答「什么未决」。
