# lakehouse-engine

[English](README.md) | 中文

湖仓引擎服务（`ctx.lakehouseEngine`）：一个进程内 DuckDB 实例，挂接配置化的表目录 —— Tier 0 为 DuckLake（单一 SQLite 目录文件 + Parquet 数据文件，零外部服务）。消费方：模型工具面（`tool-lakehouse`）、同步管线（`lakehouse-sync`）、网关湖仓域（`lakehouse.tables/query/schema`）。

## 只读防御

模型可见面（`query` / `listTables` / `describeTable` / `sampleRows`）在到达 DuckDB 之前经三层防御：

1. **语句形态守卫** —— 仅接受单条只读语句（`SELECT`、`WITH … SELECT`、`PRAGMA`、`DESCRIBE`）；DML、DDL、`ATTACH`/`INSTALL`/`COPY`、`SET`、`SELECT … INTO`、赋值型 `PRAGMA` 与多语句文本一律以结构化错误码拒绝（`LAKEHOUSE_SQL_NOT_READONLY`、`LAKEHOUSE_SQL_MULTI_STATEMENT`、`LAKEHOUSE_SQL_EMPTY`）。字符串字面量与注释先被掩蔽，载荷文本无法夹带第二条语句。
2. **源侧 READ_ONLY** —— 同步源以 `(TYPE postgres, READ_ONLY)` 挂接，源别名上的任何语句都不能改写它。
3. **资源限额** —— 行上限把 `SELECT`/`WITH` 包进 `LIMIT cap + 1`（`PRAGMA`/`DESCRIBE` 事后截断）；时间预算与连接竞速，到期中断 DuckDB。

写面是一组结构化操作（Parquet 入湖、空表建表、watermark 追加、状态 upsert）——绝不接受来自模型或 UI 的自由 SQL。DuckLake 拒绝键约束，内部状态表以 delete-then-insert 做 upsert；追加行数来自有界预计数（DuckLake 无 `INSERT … RETURNING`）。

## Tier 1 升级面

目录挂接是判别式配置（当前 `kind: 'ducklake'`）；Tier 1（B6）以 Iceberg REST 成员（Gravitino + MinIO）扩展联合类型 —— 配置同形，挂接 SQL 不同。此处不声明 Tier 1 成员：未落地的成员就是死代码。

## 配置

所有随部署变化的选项都是校验过的 `Config` 字段（cordis.yml）：`catalog.catalogPath` / `catalog.dataPath`（默认 `workspace/lakehouse/ducklake/…`）、`memoryLimitMb`、`threads`、`maxRows`（200）、`queryTimeoutMs`（30000）、`extensionAutoinstall`（true）。DuckDB 锁定 1.5.6（`@duckdb/node-api` 1.5.6-r.1）；DuckLake/postgres 社区扩展缺失时以 `INSTALL` 重试加载。
