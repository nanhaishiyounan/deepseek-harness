# @deepseek-ai/dsh-kb-graph

[English](README.md) | 中文

知识图谱能力缝（`ctx.kbGraph`）：存储 Provider 注册表、运行时本体注册表，以及实体-关系三元组的查询编排。它是文档缝（`ctx.kb`）的兄弟而非其内部存储——三元组与检索命中的契约不同，各自持有自己的缝；两者共享租户隔离模型。

本体是三层运行时注册表：五个 schema.org 风格的顶层锚点（Object/Process/Event/Role/Concept）、业务域模块（Customer、Supplier、Product、Order……），以及作为 `builtin-food` 种子的食品合规 7×7。节点类型与谓词是 branded 开放集合 id（`KgNodeTypeId`/`KgRelationId`）；插件经 `registerNodeType`/`registerRelation` 扩展本体（ctx.effect 托管的 disposer，重复 id 拒绝），闭集校验落在注册表边界——写入未注册的类型或谓词时以机读错误码响亮失败（`KB_GRAPH_UNKNOWN_ENTITY_TYPE`、`KB_GRAPH_UNKNOWN_PREDICATE`）。`validateEdge` 校验方向约束（注册表快照上的 SHACL 式 shape）。

runtime 同时转发属性图 v2 面——合并 upsert、k-hop `subgraph`/`expand` 读取、tombstone、别名、源运行水位、注册表持久化（双层注册表上的 `persistNodeType`/`persistRelation`），以及 `searchNodes`（种子解析与实体对齐共用的名称→id 解析原语）。

## Model Experience

间接：经 kb 工具族暴露——本缝自身不注册 prompt、schema 或工具；消费方包拥有图谱查询与写入的全部模型可见投影，并在注册时把注册表的 active 项物化进工具描述。

#### KV Cache effect

与模型请求流独立：图谱查询产生的工具结果由后续请求消费，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- 存储选择只有自动模式：恰一可用 Provider 胜出；多个可用 Provider 抛 `KB_GRAPH_STORE_AMBIGUOUS`（通过组合一个来配置）。
- v1 面最深为两跳路径查询；v2 的 `KgStore.subgraph` 支持k-hop 邻域遍历，但尚未经运行时转发（kg-build 批之前消费者直接取 store）。
- 注册表为进程内存 + sqlite 种子行；跨进程注册同步随 kg-build 管线（注册表 upsert）到来。
