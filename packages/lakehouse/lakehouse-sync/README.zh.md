# lakehouse-sync

[English](README.md) | 中文

湖仓同步管线（`ctx.lakehouseSync`）：从只读 PostgreSQL 挂接做定时 watermark 增量同步，落入 DuckLake 目录；另有幂等的 legacy 入湖 —— 把 B0 Parquet 导出（138 张 NocoBase 业务表）落成湖仓的永久历史。

## 同步模式

每张配置表按运行时探测走两种模式之一：

- **Watermark 追加** —— 源表带任一配置的变更游标候选列（`updatedAt`、`updated_at`）时，追加超过已持久化游标的行，并把游标推进到源当前最大值。游标存湖仓内部状态表（`lake.main._dsh_lake_state`），watermark 与它描述的数据同库持久化；最大值以 `::VARCHAR` 读出，时间戳游标在引擎的 epoch-bigint 表示下也能往返。
- **全量替换** —— 无游标列的表落入全量当前内容（`CREATE OR REPLACE TABLE AS SELECT`），即 w6b1 对从无 `updated_at` 的 legacy 表的语义。

## Legacy 入湖

`ingestLegacy()` 扫描 B0 导出目录：每个 `<table>.parquet` 成为一张湖仓表（同名重跑替换 —— 幂等）；没有导出文件的业务表按源列元数据建 schema-only 空表（PG 类型映射为 DuckDB DDL；JSON/UUID/数组落 TEXT，与 B0 导出的序列化单元一致）。结果表集与 B0 对账表完全一致：128 张数据表 + 10 张空表。

## 配置

全部 `Config` 字段（cordis.yml）：`dsn`（默认 nocobase PostgreSQL 源；B3 换 carbon）、`sourceSchema`、`targetSchema`（`synced_nocobase`）、`tables`、`watermarkCandidates`、`scheduleIntervalMs`（0 关闭调度）、`legacyIngest`（enabled / parquetDir / targetSchema `legacy_nocobase` / sourceDsn / prefixes / standaloneTables —— 默认 B0 业务表集）。启动入湖失败按配置错误处理（fails loud）；调度轮失败仅记日志，服务保持下一轮就绪。

## 模型体验

间接：经湖仓工具套注册；同步的行仅经后续读取到达模型，本包不拥有任何 prompt、schema 或工具。

#### KV Cache 影响

独立于模型请求流：结果以工具结果到达后续请求，本包既不追加也不失效任何可复用请求前缀。

## 已知限制与遗留工作

- 遗留：水位 append 之外的真 CDC（删除传播）；SeaTunnel Zeta 线仍是参照。
