# 分域计划 02｜湖仓 + 数据治理（B2 / B6）

- Spec 溯源：主计划 §1.1 指令 4/6/7 + §3 选型表；[`r2a-lakehouse-governance/report.md`](../../r2a-lakehouse-governance/report.md:1)（结论章 [`sections/07`](../../r2a-lakehouse-governance/sections/07-结论与整合方案.md:1)）
- 分层策略：**Tier0（B2）纯 TS 零容器** DuckDB+DuckLake → **Tier1（B6）docker sidecar** Gravitino+MinIO+Iceberg REST。分层是完整能力的交付节奏，不是阉割：Tier0 已具备真查询全链路，Tier1 补 catalog 枢纽与 REST 写。

## 现状基线（R3 §4.2）

- seam：`ctx.lakehouse` = catalog/engine 双 provider 注册表 + load/query 编排（[`docs/subsystems/lakehouse.zh.md:5`](../../../docs/subsystems/lakehouse.zh.md:5)）；(tenantId, tableName) 身份；query 只暴露本租户表 + maxRows 截断
- 实现：`lakehouse-sqlite-catalog`（SCHEMA_VERSION=1）+ `lakehouse-duckdb`（@duckdb/node-api，进程内查 Parquet/CSV，缺模块降级 LAKEHOUSE_ENGINE_UNAVAILABLE）+ `tool-lakehouse`（lakehouse_tables/lakehouse_query）
- 同步雏形：[`w6b1-lakehouse-transfer.mts:24`](../../../examples/kb-agent/scripts/w6b1-lakehouse-transfer.mts:24) 13 表 REST→Parquet 幂等全量替换 + 夜间链调度
- 数据：3 种子表 + 13 张 nb_* 快照 + kpis.json

## B2 范围（Tier0）

### 新增包

| 包 | 职责 | 关键点 |
|---|---|---|
| `packages/lakehouse/lakehouse-engine` | DuckDB 实例管理 | fromCache / READ_ONLY ATTACH / memory_limit / threads / allowed_paths / attachMode 全 Config 字段化（对齐无硬编码纪律）；承载 postgres/ducklake 扩展加载 |
| `packages/lakehouse/lakehouse-sync` | 同步编排 | 调度（syncSchedule Config）→ ATTACH postgres READ_ONLY → updated_at watermark 增量 → DuckLake append；表清单 syncTables Config；幂等重跑安全 |

### tool-lakehouse 三工具升级（Interfaces）

```ts
// Consumes：lakehouse-engine 的 DuckDB 实例；lakehouse-sqlite-catalog 的表登记
// Produces（会话工具面，全部 SessionEventMap 落事件）：
//   lakehouse_introspect_schema(tenantId, tableName?) → 列名/类型/注释/行数（information_schema 口径）
//   lakehouse_dry_run(sql) → EXPLAIN 校验 + 只读白名单预检（不执行）
//   lakehouse_execute_readonly(sql) → 三层只读防御后执行，maxRows/timeoutMs Config 限额
// 三层防御：①语句解析白名单（仅 SELECT/SHOW/DESCRIBE/EXPLAIN，拒多语句）②READ_ONLY ATTACH 会话 ③资源限额（maxRows/timeout/memory）
// prompt 面：Vanna get_training_plan_generic 范式的列文档种子生成（仅借鉴模板，不引入依赖）
```

### 初始化数据

- B0 导出的 legacy 全量 Parquet（49+5+wfl）登记入 catalog（`legacy_*` 命名空间，tenant 隔离规则沿用）
- 食品种子三表（原辅料价格/进出口/冷链运价）续用；kpis.json 概览 SQL 面向新表重写
- 语义层种子：INFORMATION_SCHEMA→按表 markdown 列文档 + 食品行业术语表（物料/批次/效期/AQL/追溯 DAG——复用 W6 语料）落 Git

### 实施步骤

- [ ] 第一验证项：单测加载 postgres/ducklake 扩展 + ATTACH PG 冒烟（失败→降级 B'：pyiceberg sidecar 写路径，先回报编排者再动工）
- [ ] lakehouse-engine 包（4 步 5 验证流程 + coverage 100% + doc-sync）
- [ ] lakehouse-sync 包 + legacy Parquet 登记 + 种子表续接
- [ ] tool-lakehouse 三工具 + 三层防御 + 事件落日志
- [ ] 治理 v0：表目录浏览（lakehouse_tables 增强：列级/行数/水印时间）+ 用量计数面板
- [ ] cordis.patch.yml：readonly/maxRowsDefault/timeoutMsDefault/memoryLimit/threads/allowedPaths/syncSchedule/syncTables 全 Config 化
- [ ] Agent Note + 快照（真实查询会话 transcript）

### B2 验收（R2 验证轮）

1. dsh 会话真实链路：introspect_schema 返回真实列清单 → dry_run 通过 → execute_readonly 返回 legacy 业务数据行（transcript 落盘）
2. `DELETE FROM`/`DROP TABLE`/多语句注入被三层防御拒（事件记录拒因）
3. PG 侧插行 → sync（手动触发+调度各一次）→ 湖仓查询可见（watermark 增量证明）
4. 扩展加载证据（单测输出）或 B' 降级决策记录

## B6 范围（Tier1 + 治理四能力）

### Sidecar

- Gravitino 1.3.1（:8090，docker pull 验证 → fallback `bin/gravitino.sh` 裸进程）；metalake 登记：湖仓 Iceberg catalog + fileset（KB 语料目录）+ jdbc-postgresql（carbon 业务库）+ model（本体）
- MinIO :9000（S3 网关）：解锁 DuckDB→Iceberg REST 写（R2a 第 2 章证实的存储后端限制）
- DuckLake→Iceberg 迁移脚本（数据文件本就 Parquet，元数据面转换）

### 治理（轻量自建，四能力完整）

| 能力 | 实现 |
|---|---|
| 元数据目录 | Gravitino API 直读 + ui-governance 面板（新 client 包，sidebar.nav governance=14.5 座位） |
| 血缘 | OpenLineage 事件（START/COMPLETE 终态对 + 输入输出 facet，TS fetch 自实现）：carbon→湖仓（sync 发射）→图谱（ETL 发射）；血缘图可视化复用 react-force-graph-2d |
| 质量 | 质量规则引擎（GE/dbt 范式 TS 实现：not_null/unique/range/regex/自定义 SQL 断言），规则 Config 化，失败→告警 |
| 告警 | 告警通道（复用现有交互面）+ 用量阈值告警；DataHub HTTP 端点预留（Config 开关，升级路径） |

### B6 验收（R6 验证轮）

1. Gravitino UI 浏览四源元数据（截图）
2. 血缘图展示真实链路 carbon 表→湖仓表→图节点（事件驱动非手写）
3. 故意注入脏数据（违反 not_null/range）→ 质量规则 FAIL → 告警实测
4. DuckLake→Iceberg 迁移后 DuckDB `ATTACH TYPE iceberg` 读写往返

## 风险

| 风险 | 缓解 |
|---|---|
| R-2 DuckDB 扩展加载（Tier0 阻断） | B2 第一验证项 + B' pyiceberg sidecar 降级线 |
| Gravitino 镜像 tag 未验证 | docker pull 先行验证 + 裸进程 fallback（macOS ARM64 官方支持） |
| legacy 表无 updated_at 列（NocoBase 旧表） | 全量替换模式（沿用 w6b1 语义）+ 行数对账；carbon 新表才有 watermark |
| 治理四能力范围蔓延 | 能力边界=目录/血缘/质量/告警四件；DataHub 升级是预留端点不是本批交付 |
