# W24-B0 任务二：NocoBase 全量数据导出报告

- 执行时刻：2026-10-10（本地）｜导出窗口见 [`b0-export-rowcounts.json`](b0-export-rowcounts.json) 的 startedAt/finishedAt
- 数据源形态实测：NocoBase v2 服务在线（`http://127.0.0.1:13000`，node PID 11307）+ **本机原生 PostgreSQL 17**（`localhost:5432/nocobase`，brew `postgresql@17`，PID 11201）——NocoBase 配置为 postgres dialect（`platform/nocobase/.env` 的 `DB_DIALECT=postgres`）
- 导出脚本：[`b0-legacy-export.mts`](b0-legacy-export.mts)（w6b1-lakehouse-transfer.mts 链路泛化，经 repo root tsx + tsconfig paths 解析 workspace 源码面）

## 盘点（以实际库为准）

- `public` schema 物理表全集：**258 张**（[`nb-all-tables.txt`](nb-all-tables.txt)，information_schema 直查）
- 业务域表全集：**138 张**（前缀白名单 `hub_ crm_ mfg_ pur_ qm_ srm_ wms_ wfl_ mps_ mrp_ eam_ fin_ recall_ aps_ so_` + 独立业务表 `expert_services experts orders orders_deliverables alert_rules kpi_snapshots`）
- 平台系统表（users/roles/uiSchemas/collections/migrations 等 120 张）：不进 Parquet，由 pg_dump 全库兜底承载

## 产物

| 产物 | 位置 | 规模 |
|---|---|---|
| Parquet 按表分文件 | `workspace/lakehouse/legacy/<table>.parquet` | 128 个数据文件 + 空表 10 张（0 行，如实记录不落空文件） |
| 自包含 catalog | `workspace/lakehouse/legacy/legacy-catalog.sqlite` | tenant `legacy` 的表注册 + transfer 审计 |
| pg_dump 全量兜底 | `workspace/lakehouse/legacy/nocobase-full-20261010.sql.gz` | 3.0 MB gz，258 张表 COPY 数据（`gzip -dc \| grep -c '^COPY '`） |
| 行数对账表 | `workspace/lakehouse/legacy/rowcount-reconciliation.{csv,md}` | 138/138 全 OK，0 MISMATCH |

## w6b1 链路泛化的两处加固（对上游脚本的偏差）

1. **列类型全列扫描**（w6b1 首行采样）：毫秒级 epoch 单元格（13 位，如 `wfl_mobile_work.updatedAt=1791133546794`）超出 Parquet INT32，首版脚本实际触发 `Failed to cast value` 溢出；改为扫描全列后超 int32 整数列升 DOUBLE（double 53 位尾数内精确）。
2. **REST 404 表的 PG 直读兜底**：14 张业务表（fin_config/fin_statements/fin_dunning_*/aps_whatif_runs/crm_stage_audit/pur_*_audit/recall_audit/wfl_alert_*/orders_deliverables）未在 NocoBase REST 面暴露（404/400），落 `psql json_agg` 直读（JSON 里 `pgFallback` 清单）；这些表 Parquet 与 PG 行数同样对账通过。

## 对账方法

- PG 行数：`psql -Atc "select '<t>', count(*) from <t> union all …"` 一次往返
- Parquet 行数：lakehouse.load 返回的 `table.rowCount`（写入行数原值）
- 结果：**138 张全部 PG 行数 == Parquet 行数**（含 10 张空表 0==0）；空表判定 `REST/PG 读取 0 行`，Parquet 无文件（全量替换语义下空文件无意义），行数仍为 0 参与对账
