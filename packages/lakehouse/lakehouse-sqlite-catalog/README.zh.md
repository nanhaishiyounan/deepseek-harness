# @deepseek-ai/dsh-lakehouse-sqlite-catalog

[English](README.md) | 中文

湖仓缝的 SQLite catalog provider：单个 `node:sqlite` 数据库承载表登记、连接器传输记录与用量计数器，加载时注册到 `ctx.lakehouse`。

## 存储模型

Schema 1 维护三个结构：`lakehouse_tables`（身份 `UNIQUE (tenant_id, table_name)`，列元数据存为 JSON 数组，确权三元组与时间戳）、`lakehouse_transfers`（只增的连接器传输记录）、`usage_counters`（每租户一行，原子 upsert 累加）。每条语句与固定 PRAGMA 都在打包的 `.sql` 资源中；值一律走 SQLite 参数，运行时代码从不拼装查询文本。

全新数据库在同一个 `BEGIN IMMEDIATE` 事务内初始化，并同时写入 `user_version = 1` 与保留 application id（`"DSHL"`）。任何其他盘上版本（更旧或更新）、外来 application 身份、或已拥有表但无版本的数据库都会拒绝；此预发布 provider 不提供迁移。连接设置应用 `trusted_schema = OFF`、`foreign_keys = ON`、`synchronous = FULL`，文件库启用 WAL 日志。

`registerTable` 以事务覆盖：upsert 替换既有身份的全部可变字段并保留其 `created_at`；结果报告是否替换了既有登记。读取登记时解析列记录，存储文本不是 `{name, sqlType}` 条目的 JSON 数组时以 `LAKEHOUSE_CATALOG_CORRUPT` 显式失败。

## 配置（schemastery）

```ts
interface Config {
  path: string             // database path (":memory:" supported); relative resolves against cwd
  busyTimeoutMs?: number   // wait for another SQLite connection's lock; default 5,000 ms
}
```

打开是急切的：不可写路径或外来盘上 schema 会让组合加载失败，而不是等到第一次调用。销毁插件会注销 catalog 并关闭持有的连接（幂等）。

## Model Experience

间接：本存储不注册任何 prompt、schema 或工具；Consumer 包拥有已登记表的全部模型可见呈现。

#### KV Cache effect

与模型请求流无关：注册表读取产生的是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- **每实例单连接** — 并发写者通过 SQLite 锁与配置的 busy timeout 竞争；不提供连接池。
- **列存为 JSON 文本** — 列元数据放在 JSON `TEXT` 列而非规范化表；查询从不过滤列字段，在出现这种需求前更简单的表示胜出。
- **无传输记录读取** — provider 追加传输记录并返回 id；列举 API 等待需要它的 Consumer。
