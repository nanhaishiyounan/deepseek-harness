# @deepseek-ai/dsh-kb-graph

[English](README.md) | 中文

知识图谱能力缝（`ctx.kbGraph`）：存储提供方注册表、运行时本体注册表，以及属性图上的读写编排。与文档缝（`ctx.kb`）平级——三元组与检索命中契约不同，各自拥有独立的缝；两者共享租户隔离模型。

## 注册表（本体 v5）

节点类型与关系是品牌化开放集 id（`KgNodeTypeId`/`KgRelationId`）。每个类在属性上携带约束四件套（`required`/`isArray`/`enumValues`/`pattern`）、幂等合并锚 `naturalKey`，以及 FoodOn 锚（`foodonUri`/`foodonId` 与用于实体消歧的源本体 `synonyms`）。来源枚举：`builtin-ontology`、`builtin-food`、`foodon-imported`、`nocobase-derived`、`agent-defined`。状态门控写入与模型可见性：`draft` 可写但不出现在模型可见枚举中；`deprecated`（KGCL NodeObsoletion）保留实例与历史、退出所有创建面向的表面。插件经 `registerNodeType`/`registerRelation` 扩展注册表；`persistNodeType`/`persistRelation` 走双层注册表写穿（运行时映射 + 存储行）。闭集校验在注册表边界——未知 id 与方向违规响亮失败（`KB_GRAPH_UNKNOWN_ENTITY_TYPE`、`KG_DIRECTION_VIOLATION` 等）。

## 纯算法层

- `kgcl.ts`——闭合的 KGCL 操作词表：`kg_edit` 工具规划的实例操作（`add_edge`/`remove_edge`/`set_node_props`）、模式级操作（`add_node`/`rename_node`/`set_parent`/`deprecate_node`/`change_cardinality`），以及两者共用的 diff 预览渲染。
- `shacl.ts`——注册表→shapes 编译、带违规路径的候选校验，以及抽取修复回灌的解释性反馈串。
- `kg-nl.ts`——L0 模板编译器（短语→游走计划）与 L1 参数填充契约。
- `ppr.ts`——平坦邻接上的个性化 PageRank（L1.5 检索层）。
- `louvain.ts`——平坦邻接上的确定性 Louvain 社区检测（每节点 `assignments` 加分区模块度；节点顺序即平局裁决）。

## 时序账本与写面

`KgStore` 提供方承载 episode 账本（`putEpisode`/`linkMentions`/`listEpisodes`/`edgeMentions`/`edgeIdsOfEpisode`）、记录退役（`expireEdges`/`restoreEdges`）、矛盾读取（`liveEdgesBetween`）、全图邻接（`liveAdjacency`，PPR/louvain 输入）、时间点回放读（`snapshotAt(tenant, asOf)`）、FoodOn xref 通道（`putOntologyXrefs`/`listOntologyXrefs`）与共指拒绝墓碑（`putCorefRejects`/`listCorefRejects`）；`kgCorefPairKey`/`kgCorefEdgeId` 铸造共享的配对键与合并边 id。

运行时在存储之上追加三个编排面：

- `applyOntologyOps(ops)`——手动编辑器的写路径：整个操作集先对照「活注册表叠加集合内更早操作」的覆盖层校验（重复 id、父类环、非法基数对在任何落库前拒绝），然后持久化受影响行并记一条本体 revision 审计行。
- `communities(tenant)`——供画布着色的预计算 louvain 分区。
- `snapshotAt(tenant, asOf)`——revision 回放读（live 即 `asOf = now` 特例）。

## 模型体验

间接：经由 kb 工具套件。本缝不注册任何 prompt、schema 或工具；消费包拥有图查询与写入的每个模型面向投影，注册时把注册表的 active 条目物化进其工具描述。

#### KV 缓存效应

独立于模型请求流：图查询产生供后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## 已知限制与后续工作

- 存储选择仅自动：恰好一个可用提供方胜出；多个可用提供方抛 `KB_GRAPH_STORE_AMBIGUOUS`（通过只组合一个来配置）。
- 社区检测按请求在 `liveAdjacency` 上运行；跨运行需要聚类的管线批次再落物化集群表。
- `applyOntologyOps` 记录 revision 并更新注册表；撤销走调用方的 episode 语义（反向操作集），没有专门的注册表 revision 回滚。
