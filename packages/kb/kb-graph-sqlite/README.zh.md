# @deepseek-ai/dsh-kb-graph-sqlite

[English](README.md) | 中文

知识图谱缝的 SQLite `KgStore` Provider：一个 `node:sqlite` 数据库（application id "DSHG"，schema version 2）承载七表属性图——节点类型与关系注册表、带 FTS5 名称索引的节点表、携带 provenance 的双时态边表、别名表、源运行水位表与计量表。写入为 MERGE 形态且幂等（七列锚点 `tenant/src/dst/relation/source_system/source_id`），删除由 tombstone 取代，k-hop 子图遍历以防环的递归 CTE 执行。v1 的 `GraphStore` 面原样保留：`putTriples` 在内部转译为节点/边合并。v1 的 `triples` 数据库会被拒绝并给出重建指引——图谱是派生的、可溯源的数据，跑一次全量管线即可恢复。

## Model Experience

间接：经 kb 工具族暴露——本存储不注册 prompt、schema 或工具；消费方包拥有图谱查询与写入的全部模型可见投影。

#### KV Cache effect

无：本 Provider 从不触达模型请求；它以本地 SQLite 读取应答缝查询。

## Known Limitations and Deferred Work

- 注册表持久化仅有种子：建库时物化 built-in 本体，写入路径确保注册行存在，但尚无注册表 upsert/diff API——随 kg-build 管线批到来。
- v1 面的两跳路径连接在两个 `(tenant, endpoint)` 索引之外无索引提示地扫描双方向；大图可能需要物化邻接表。
- 节点向量（`embedding` BLOB 列）尚无写入方；实体对齐批将经 kb embed 通道填充。
- 除共享的 kb-sqlite 惯例外，无 WAL 特定的备份指引。
