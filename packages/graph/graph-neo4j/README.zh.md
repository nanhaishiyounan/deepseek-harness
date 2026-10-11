# dsh-graph-neo4j

[English](README.md) | 中文

Neo4j 图存储能力：面向知识图谱的 bolt 连接存储服务——本体版本以只增不改的 JSON-LD 文档入链、模型侧查询走只读 Cypher 语句闸门、业务湖仓→图谱 ETL 映射 manifest，以及纯函数 LLM 本体归纳管线。

B5 批次实跑证据见 `research/2026-10-09-w24-rebuild/b5-ontology/`。

## Model Experience

间接（Indirectly）：本存储只承载 bolt 能力；全部 prompt、schema 与工具面都在 dsh-tool-graph。

#### KV Cache effect

独立于模型请求流：图谱查询产生的是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- 孤岛 <100 目标未达（桥接后 375；语料侧 Concept/Dataset 单例节点没有业务表名可桥接）——下一步：carbon 源 crossSource v2 + WeKnora 实体通道。
- ETL 每次运行先清图以保证可复现；增量 watermark 入图暂缓。
- 行表与 customer 经 READ_ONLY postgres attach（DuckLake 目录被 web 进程持锁期间）；并入湖仓快照暂缓。
