# @deepseek-ai/dsh-lakehouse-duckdb

[English](README.md) | 中文

湖仓缝的 DuckDB 查询 provider：经 `@duckdb/node-api` 对 Parquet（与 CSV）文件做进程内 OLAP，加载期可用性探测、干净降级。加载时注册到 `ctx.lakehouse`。

## 引擎模型

一个 `:memory:` DuckDB 实例服务整个进程；每次 `query` 与 `writeParquet` 各开自己的连接。查询为每张下发的表建一个临时视图（按格式判别走 `read_parquet` / `read_csv`），把调用方的 SQL 包裹为 `SELECT * FROM (<sql>) LIMIT maxRows + 1`，并用多取的一行报告 `truncated`。视图与连接随调用结束消亡，两个租户的查询永远看不到对方的表。多语句 SQL 会被包裹层本身拒绝；接受结尾分号。

`writeParquet` 建固定名称的临时表，经 DuckDB appender 逐行写入，再 `COPY` 到目标路径成 Parquet。表名与列名以双引号包裹、内部引号翻倍；列 `sqlType` 文本必须命中闭集标量类型（否则 `LAKEHOUSE_INVALID_SQL_TYPE`），因为它会进入 DDL；单元格值接受 JSON 标量域（`null`、`boolean`、`number`、`bigint`、`string`），域外以 `LAKEHOUSE_WRITE_FAILED` 显式失败。结果单元格为 JSON 消费者做规范化：`bigint` 在安全范围内收窄为 `number`，超出则转十进制字符串；时间戳转为 ISO 字符串。

## 可用性与降级

模块导入与实例创建发生在插件探测时——绝不在模块顶层。原生绑定缺失会记录加载失败并让引擎保持"已注册但不可用"：组合照常加载、catalog 操作继续可用，`load`/`query` 以 `LAKEHOUSE_ENGINE_UNAVAILABLE` 显式失败，其消息携带记录到的原因。`available()` 读取该缓存状态，不做任何 I/O。

## 配置（schemastery）

```ts
interface Config {
  memoryLimitMb?: number   // DuckDB memory limit in MB; omitted = DuckDB's own default
  threads?: number         // DuckDB worker-thread count; omitted = DuckDB's own default
}
```

## Model Experience

间接：本引擎不注册任何 prompt、schema 或工具；Consumer 包拥有查询结果的全部模型可见呈现。

#### KV Cache effect

与模型请求流无关：查询产生的是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- **每次查询重建视图** — 每次查询重建临时视图；MVP 表规模下是噪音，只有在宽表很多时视图缓存才值得做。
- **语句执行中不可取消** — abort 信号在执行前与写行间隙检查；运行中的 DuckDB 语句不会被中断（`connection.interrupt()` 是既定升级路径）。
- **依赖原生模块** — 官方 prebuilt 覆盖 darwin/linux/win；无法加载的主机以降级（仅 catalog）运行而非组合失败。
