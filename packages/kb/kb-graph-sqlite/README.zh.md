# @deepseek-ai/dsh-kb-graph-sqlite

[English](README.md) | 中文

知识图谱缝的 SQLite `GraphStore` provider：一个 `node:sqlite` 库（application id "DSHG"，schema 版本 1）承载租户隔离三元组，幂等写入、一跳邻居展开、两跳路径 join、实体投影检索。

## Model Experience

间接地，经 kb 工具套件：本 store 不注册自己的 prompt、schema 或工具；消费包拥有图谱查询与写入的每一个模型可见投影。

#### KV Cache effect

无：本 provider 绝不触达模型请求；以本地 SQLite 读应答缝查询。

## Known Limitations and Deferred Work

- 两跳路径 join 在两个 `(tenant, endpoint)` 索引之外无提示地扫双向边；大图可能需要物化邻接表。
- 实体检索在 UNION 扫描后于 JS 过滤；带 FTS 索引的专用实体表是扩展路径。
- 除共享的 kb-sqlite 约定外，无 WAL 特定的备份指引。
