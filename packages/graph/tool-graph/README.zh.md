# dsh-tool-graph

[English](README.md) | 中文

面向模型的图谱工具行（`ctx.neo4jGraph`）：`kg_graph_query`（语句形状闸门下的单条只读 Cypher）与 `kg_ontology`（只增不改的本体版本链）。

B5 批次实跑证据见 `research/2026-10-09-w24-rebuild/b5-ontology/`。

## Model Experience

### System prompt

#### What the model sees

工具启用时系统提示词挂载两段指引，逐字如下。

##### kg-graph-query guidance

```markdown
Use the kg_graph_query tool to run one read-only Cypher statement over the Neo4j graph when a question needs entity neighborhoods, multi-hop relationships, or graph counts. Nodes carry gid/name/nodeType; relationships are typed (e.g. orderedBy, orderedFrom, orderedItem, purchasedItem, MENTIONS). Only single read statements starting with MATCH/OPTIONAL MATCH/WITH/UNWIND and containing RETURN are accepted — writes (CREATE/MERGE/DELETE/SET/REMOVE/CALL) are rejected. For lakehouse table aggregates use lakehouse_query instead; for the ontology schema census use kg_ontology.
```

##### kg-ontology guidance

```markdown
Use the kg_ontology tool to read the stored ontology version chain and the head document's class/relation census before planning kg_graph_query traversals. Ontology versions are append-only (LLM induction drafts pass the SHACL gate before storage); the census lists the legal class ids and relation ids.
```

#### Token effect

两段固定成本指引（约 130 tokens），每次组装注册一次——相对工具自身 schema 可忽略。

#### KV Cache effect

动态会话体之前的静态提示文本；缓存稳定。

### Tool schemas

#### What the model sees

模型看到生成的 [`kg_graph_query` 与 `kg_ontology` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-graph)。`kg_graph_query` 声明一个必填 `cypher` 字符串；`kg_ontology` 无参数。

#### Token effect

两个 schema 合计约 50 tokens——组合中最小的一档。

#### KV Cache effect

静态 schema 文本；缓存稳定。

### Query result

#### What the model sees

`kg_graph_query` 返回结果列、行集与截断标记，并附 Neo4j 图谱的来源署名；`kg_ontology` 返回版本链表与头部 census。

#### Token effect

与结果行数成正比，受存储的行预算封顶。

#### KV Cache effect

独立于模型请求流：查询结果是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- 孤岛 <100 目标未达（桥接后 375；语料侧 Concept/Dataset 单例节点没有业务表名可桥接）——下一步：carbon 源 crossSource v2 + WeKnora 实体通道。
- ETL 每次运行先清图以保证可复现；增量 watermark 入图暂缓。
- 行表与 customer 经 READ_ONLY postgres attach（DuckLake 目录被 web 进程持锁期间）；并入湖仓快照暂缓。
