# Agent Note: W24-B2 湖仓批——DuckDB+DuckLake 引擎/同步/三工具/老数据入湖

Status: implemented

[English](2026-10-10-w24-b2-lakehouse-duckdb-ducklake.md) | 中文

日期：2026-10-10 ｜ 批次：W24-B2（湖仓，五源①） ｜ 证据目录：[research/2026-10-09-w24-rebuild/b2-lakehouse/](../../../../research/2026-10-09-w24-rebuild/b2-lakehouse/README.md)

## Problem

湖仓批要落五源①的完整形态：DuckDB+DuckLake 引擎、watermark 增量同步、三工具只读防御、B0 导出的 legacy 数据永久入湖——但 DuckLake 与标准 Postgres/PG 挂接有三个引擎级差异（键约束/information_schema/INSERT RETURNING），只读防御的 READ_ONLY 挂接路径实测不可行，工具面还要从租户通道换轨到湖仓目录。


## Decision

## 决策 1：读写共用单 DuckLake attach，只读防御不依赖 READ_ONLY 湖仓挂接

实测 DuckDB 拒绝对同一 catalog 文件双 attach（`Unique file handle conflict`），因此引擎的读写走同一 `lake` 挂接。只读防御由三层承担：语句形态守卫（`sql-guard.ts` 纯函数，掩蔽字符串与注释后拒多语句/非只读首词/`SELECT … INTO`/赋值 `PRAGMA`）+ 源侧 postgres `(READ_ONLY)` 挂接 + 行/时间限额。分域计划里"READ_ONLY ATTACH 会话"一层在湖仓侧不可实现，实测记录在案。

## 决策 2：DuckLake 的三个引擎级差异都已绕开并留测试

- DuckLake 拒绝 PRIMARY KEY/UNIQUE 约束：内部状态表（`lake.main._dsh_lake_state`）无键约束，upsert 走 delete-then-insert。
- DuckLake attach 下没有 `information_schema`：表清单走 `duckdb_tables()`（`database_name='lake'`），`main` schema（状态表所在）从模型可见清单排除。
- DuckLake 无 `INSERT … RETURNING`：同步追加行数来自有界预计数（`SELECT count(*) FROM (…WHERE watermark)`）。

## 决策 3：watermark 游标以 `::VARCHAR` 读出并在湖仓内持久化

跨 postgres 挂接的 `max(timestamptz)` 在 node-api 侧返回 epoch bigint 而非 Date，直接数值化会破坏字面量比较往返。游标读统一 `max(col)::VARCHAR`，比较交给 DuckDB 隐式 cast；持久化在湖仓状态表（与数据同库），不引入第二存储。

## 决策 4：工具命名按任务书三件套换轨，租户绑定退役

`tool-lakehouse` 从 `lakehouse_tables`/`lakehouse_query`（走 `ctx.lakehouse` 租户通道）换轨为 `lakehouse_list_tables`/`lakehouse_query`/`lakehouse_schema`（走 `ctx.lakehouseEngine` 湖仓目录，`lake.<schema>.<table>` 引用形式）。`lakehouse_query` 名与输出格式（markdown 表 + `Data source: lakehouse table(s) …` 归因行）保持不变，ui-tool 的查询卡片与 source-trail 解析零改动。旧租户 seam（`lakehouse`/`sqlite-catalog`/`lakehouse-duckdb`）保留为上传数据面。

## 决策 5：legacy 入湖的表集对账锚定 B0 行数表

`ingestLegacy()` 以 PG `information_schema` 的 BASE TABLE 清单 + 前缀/独立表白名单（B0 同集）为准：有 Parquet 文件的走 `CREATE OR REPLACE TABLE AS SELECT FROM read_parquet`（幂等替换），无文件的按 PG 列元数据映射建 schema-only 空表（JSON/UUID/数组落 TEXT，对齐 B0 序列化单元）。结果 138=128+10 与 B0 对账表逐一相等（missing=0 mismatch=0 extra=0）。

## 决策 6：web 会话的湖仓工具面组合位置

`lakehouse-engine`/`lakehouse-sync` 行落在 dsh-web-app bundle patch（insert），kb-agent 例补丁不再自带（双层 insert 同 id 会 duplicate loader entry 失败——实测修复）。preset（enterprise-data-assistant/business-advisor）的 `tool-lakehouse` 行去掉 tenant config，服务由 host 行供给。

## Consequences

- 湖仓成为五源①的可查面（`legacy_nocobase` 138 表 + `synced_nocobase` 增量表），lakehouse_query 三层只读防御守住写面。
- 工具面换轨到湖仓目录后，ui-tool 的查询卡片与 source-trail 解析零改动（命名与输出格式保持）。
- 旧租户 seam（lakehouse/sqlite-catalog/lakehouse-duckdb）保留为上传数据面，两代语义并存。

## Alternatives considered

- **READ_ONLY 湖仓挂接作只读防御**：被否——DuckDB 拒绝对同一 catalog 文件双 attach（Unique file handle conflict），读写共用单挂接 + 三层防御（决策 1）。
- **第二存储持久化 watermark**（独立 SQLite/JSON）：被否——与数据同库（lake 状态表）零第二存储，游标与数据原子同库（决策 3）。
- **DuckLake 侧 ALTER 列类型绕差异**：被否——差异在建表/约束/返回三处，绕开比改造省（决策 2）。
