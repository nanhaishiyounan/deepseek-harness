# Agent Note: 湖仓能力缝——SQLite catalog、Parquet 文件、DuckDB 引擎

Status: implemented

[English](2026-09-03-lakehouse-seam-duckdb-sqlite-catalog.md) | 中文

## Problem

连接器 Agent 阶段（[plans/connector-lakehouse-nocobase/PLAN.md](../../../../plans/connector-lakehouse-nocobase/PLAN.md)）需要让客户上传的结构化数据可查询：加载一次表格数据集，之后用真实 SQL 回答数值与清单类问题。功能基线的终态（Iceberg/Spark/Flink/Kafka）压在"避免重型基础设施"红线之内无从起步，而 harness 里没有任何能存储或查询表的能力。这条缝必须先于工具面（N2）与连接器缝（N3）落地，并且必须在所选引擎的原生模块无法加载的主机上安全降级。

## Decision

### 缝是同一存储拓扑上的三个包

`packages/lakehouse/lakehouse` 是 Service Definition（`ctx.lakehouse`）：`CatalogStore` 与 `QueryProvider` 契约、不依赖注册顺序的选择规则（每个角色沿用 kb 缝的五分支错误码）、以及 load/query/drop/stats/usage 编排。`lakehouse-sqlite-catalog` 把表登记、连接器传输记录与用量计数器持久化进单个 `node:sqlite` 数据库（`SCHEMA_VERSION = 1`、application id `"DSHL"`、复用 kb 存储的所有权校验模板）。`lakehouse-duckdb` 经 `@duckdb/node-api` 对 Parquet（与 CSV）文件执行 SQL。能力缝三角色齐备；Tool Consumer 有意留给 N2，不在本批。

存储沿 session 与 kb 组已划下的同一条线切分：持久元数据进 SQLite，批量数据是 `<dataRoot>/<tenantId>/<tableName>.parquet`（默认根 `workspace/lakehouse`）下的 workspace 相对 Parquet 文件。`(tenantId, tableName)` 是表身份——重载即替换文件与登记，镜像 kb 的 `(tenantId, sourcePath)` 模型。

### DuckDB：加载期探测，注册式降级

DuckDB 赢得引擎席位：单二进制进程内 OLAP、SQL 方言完整（NL2SQL 只需工具面、无需翻译层）、Parquet 是通往开放湖表格式的垫脚石、官方 prebuilt 的 `@duckdb/node-api` 覆盖 darwin/linux/win 且无安装脚本（pnpm 的严格构建许可名单从不触发）。wasm 回退保持为 CI prebuilt 失败时的计划级预案，不是已交付代码。

原生模块只在插件探测时导入——绝不在模块顶层。探测失败会记录原因并让 provider 保持"已注册但不可用"：组合照常加载、catalog 操作继续应答，`load`/`query` 以 `LAKEHOUSE_ENGINE_UNAVAILABLE` 显式失败且消息携带记录的原因。这是 kb embed 降级模式在一个没有替身的角色上的应用：降级收缩为"catalog 仍可观测"，绝不收缩为静默变弱的查询。

### 租户隔离即可见表集合，行上限包裹用户 SQL

`query` 解析租户的全部登记，为每张表交给引擎一个 `EngineTableRef`（绝对路径由 runtime 解析），引擎为且仅为这些名字建每次调用的临时视图。跨租户引用以未知表失败——不做 SQL 改写、不解析白名单。调用方 SQL 以 `SELECT * FROM (<sql>) LIMIT maxRows + 1` 执行；多取的一行是截断标记，而 DuckDB 自己的解析器会拒绝子查询包裹里的多语句文本。

### load 路径的安全靠闭集，不靠转义

表名必须匹配 `[A-Za-z_][A-Za-z0-9_]*`，租户 id 不得含路径分隔符——两者都会成为文件名与视图名。列 `sqlType` 文本必须在进入 DDL 前命中闭集标量类型。标识符以双引号包裹、内部引号翻倍；无法避免插值的文件路径以单引号包裹、内部引号翻倍；其余一切走参数或 appender。

## Alternatives considered

- **托管湖格式（对象存储上的 Iceberg、Spark/Trino）** — 功能基线的终态，但拖着一支 JVM 服务舰队与 catalog 服务，压在禁止重型基础设施的红线上；DuckDB + Parquet 保住 SQL 面同时一切留在进程内。
- **`@duckdb/duckdb-wasm` 作引擎** — 零原生足迹，但更慢、接线更重；仅作为 CI prebuilt 泳道失败时已文档化的回退，不作默认。
- **元数据放进同一个 DuckDB 实例** — 少一个进程，但 catalog 持久性从此绑定引擎可用性，破坏"catalog 必须继续应答"的降级模式；SQLite 保持两个故障域独立，并复用 kb 存储的 schema 所有权模板。
- **用 SQL 改写做租户隔离** — AST 级白名单需要解析每条语句；可见表集合用 DuckDB 自身的名字解析拿到同一保证，解析成本为零。
- **连接器自持传输表** — 传输记录放在湖仓 catalog，因为未来传输的两个目的地（kb、lakehouse）需要同一条登记轨迹，而 catalog 已经是持久元数据的所有者。
- **给 kb 缝扩一个 `table` doc kind** — 表不是文档：分块、向量化和引用对行集毫无意义，load/query 的生命周期与 ingest/search 是本质差异。

## Consequences

缝的契约就是 N2/N3 的地基：N2 的 `tool-lakehouse` 读取 `listTables` 并投影 `query` 结果；N3 的连接器传输把 confirm 步落进 `recordTransfer` 并复用 `load`。引擎写入是整文件替换式 Parquet——没有增量插入、没有跨表事务；在客户上传规模下都可接受，等 Iceberg 这类格式配得上它的重量时再议。查询并发受限于单实例上的每次调用连接；第二个实例是升级路径而非配置开关。`available()` 的探测结果缓存于进程生命周期，装上原生模块需要重启才会被看见——这是无 I/O 可用性检查的已文档化代价。

### Testing

`pnpm vitest run packages/lakehouse`（94 个测试）覆盖每个角色的五分支选择、对真实 DuckDB 引擎与真实 Parquet 文件的 load→query 往返、端到端租户隔离、截断与 bigint/时间戳规范化、经注入 loader 的探测失败降级路径、schema 所有权拒绝、经失败触发器的事务回滚，以及从 `cordis.yml` 加载全部三个插件的 Loader 组合测试。覆盖率门：每文件 100%（`pnpm vitest run packages/lakehouse --coverage --coverage.include='packages/lakehouse/*/src/**'`）。
