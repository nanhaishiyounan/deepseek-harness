# @deepseek-ai/dsh-kb-graph-sqlite

[English](README.md) | 中文

知识图谱缝的 SQLite `KgStore` 提供方：一个 `node:sqlite` 数据库（应用标识 "DSHG"，`SCHEMA_VERSION` 5）承载属性图——节点类型与关系注册表（FoodOn 锚列、同义词、带基数的约束 JSON）、带 FTS5 名称索引的节点、四时间戳携带来源的边、别名、source-run 水位、本体 revision 与 build-run 双账本、`kg_episode`/`kg_mention` 时序账本、`ontology_xref` 映射通道，以及 `kg_align_rejects` 共指墓碑。写入为合并形且幂等（七列锚 `tenant/src/dst/relation/source_system/source_id`）；墓碑写 `valid_until`，回滚标 `expired_at`，live 即两者皆 NULL——`idx_edge_live` 部分索引服务所有 live 读。k 跳子图游走是环安全的递归 CTE；`snapshotAt(tenant, asOf)` 为 revision 回放冻结图（该时刻及以前创建的节点、该时刻及以前记录且在此之前既未墓碑也未退役的边）。v1 `GraphStore` 面原样保留：`putTriples` 内部翻译到节点/边合并。注册表持久化是双层的：建库时物化内置本体，`upsertNodeType`/`upsertRelation` 刷新派生与编辑条目（kg-build 与本体编辑器的写路径），插件加载时把持久行重新注册进运行时注册表（父先子后；孤儿行响亮失败；存储的 `deprecated` 状态可往返）。v1–v4 数据库被拒绝并给出重建指引——图是派生的、可溯源的数据，全量管线运行即可还原。

## 模型体验

间接：经由 kb 工具套件。本存储不注册任何 prompt、schema 或工具；消费包拥有图查询与写入的每个模型面向投影。

#### KV 缓存效应

无：本提供方不触达模型请求；以本地 SQLite 读应答缝查询。

## 已知限制与后续工作

- 注册表 upsert 整行刷新但不携带 schema 漂移 diff——该比较由管线的 revision 审计在 run 首步负责。
- v1 面的两跳路径连接双向扫描，除两条 `(tenant, endpoint)` 索引外无索引提示；大图可能需要物化邻接表。
- 节点 embedding（`embedding` BLOB 列）尚无写入方；实体对齐批次将经 kb embed 通道填充。
- `snapshotAt` 按字典序比较 ISO 字符串；调用方传入 `Date.now()` 形状的时刻（episode 账本自身的时间戳），排序正确。
