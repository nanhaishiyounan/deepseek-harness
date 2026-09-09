# lakehouse/ — 湖仓能力族

[English](README.md) | 中文

湖仓能力缝及其 provider：按租户隔离、以 Parquet 落盘于数据根目录的表格数据，登记元数据的 SQLite catalog，DuckDB 查询引擎，模型可见的工具套件，以及供 `data` 域与连接器传输共用的上传判别器。全部为**产品**包。

| 包 | 职责 | ctx key |
|---|---|---|
| [`lakehouse/`](lakehouse/README.zh.md) | 能力缝：provider 注册表与 load/query 编排；`./data-router` 子导出对上传分类 | `ctx.lakehouse` |
| [`lakehouse-sqlite-catalog/`](lakehouse-sqlite-catalog/README.zh.md) | 基于 `node:sqlite` 的 catalog provider | 注册 `ctx.lakehouse` |
| [`lakehouse-duckdb/`](lakehouse-duckdb/README.zh.md) | 基于 `@duckdb/node-api` 的查询引擎（原生模块缺失时降级） | 注册 `ctx.lakehouse` |
| [`tool-lakehouse/`](tool-lakehouse/README.zh.md) | 模型可见的 `lakehouse_tables`/`lakehouse_query` 工具 | 消费 `ctx.lakehouse` |

能力缝保持经典三角色：Service Definition 拥有选择与编排，provider 注册 catalog/引擎实现，工具套件是纯 Consumer。上传经 apiproxy `data` 域抵达 load 路径——该域与连接器传输管道共用同一 `./data-router` 判别器。
