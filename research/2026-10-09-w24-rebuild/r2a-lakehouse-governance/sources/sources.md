# 来源索引（R2a 湖仓 + 数据治理开源选型调研）

> 全量来源明细见本归档 report.md 第 8 章（sections/08-来源清单.md）。本文件为 sources/ 目录的索引页。
> 所有来源均于 2026-10-09 实际访问取证；★ 为决策级关键来源。

## 本目录内容

| 条目 | 类型 | 说明 |
|---|---|---|
| iceberg-python/ | 浅克隆仓库（.git 已删） | pyiceberg main@2026-10-09——SqlCatalog 双表 schema / 写 API 全集 / maintenance 边界的源码审计对象（审计要点：pyiceberg/catalog/sql.py:117、pyiceberg/table/maintenance.py:30-46、tests/conftest.py:3146） |
| vanna/ | 浅克隆仓库（.git 已删） | vanna main@2026-10-09——legacy prompt 模板与训练数据组织的源码审计对象（审计要点：src/vanna/legacy/base/base.py L238/L586-658/L1807-1860/L1882-1936、legacy/chromadb/chromadb_vector.py L45-100、components/rich/data/dataframe.py L20） |

## 决策级关键来源（★，摘录）

- Apache Iceberg：https://iceberg.apache.org （1.12.0）；pyiceberg：https://github.com/apache/iceberg-python （0.12.0）
- DuckDB：https://duckdb.org/docs/current/core_extensions/iceberg/overview （iceberg 扩展写边界与 REST 后端限制原文）；npm @duckdb/node-api 1.5.6-r.1
- Apache Doris：https://doris.apache.org （4.1.4.1；中文倒排 parser + Faiss 向量 + MySQL 9030）
- Apache Gravitino：https://gravitino.apache.org/docs/1.3.1/ （1.3.1 TLP；12 relational + fileset + model + 内嵌 Iceberg REST + MCP）
- Apache Polaris：https://polaris.apache.org （1.8.0 TLP；in-memory/PG/MongoDB 持久层）
- Unity Catalog OSS：https://github.com/unitycatalog/unitycatalog （0.6.0）；文档域 https://docs.unitycatalog.io
- iceberg-js（TS 唯一 Iceberg REST 客户端）：https://github.com/supabase/iceberg-js （v1.0.0 MIT）
- OpenMetadata：https://docs.open-metadata.org/v2.0.x/ （2.0.5；5 容器 8GB sizing；Iceberg 无独立 connector）
- DataHub：https://docs.datahub.com （1.6/1.8rc；Kafka+OpenSearch 双栈；Neo4j GA connector；OpenLineage HTTP 端点）
- Soda 许可证实锤：https://raw.githubusercontent.com/sodadata/soda-core/main/LICENSE （ELv2）
- dbt v2 许可：https://www.getdbt.com/dbt-fusion-engine-license-agreement
- Debezium：https://debezium.io/documentation/reference/3.7/connectors/postgresql.html （3.7.0.Final）
- memiiso Iceberg sink：https://github.com/memiiso/debezium-server-iceberg （1.2.0.Final）
- SeaTunnel：https://seatunnel.apache.org/docs/3.0.0/connectors/sink/Iceberg （Zeta 单 JVM CDC→Iceberg）
- Airbyte 出局证据：https://docs.airbyte.com/platform/using-airbyte/getting-started/oss-quickstart （"runs on Kubernetes" 原文）
- WrenAI：https://github.com/Canner/WrenAI （多许可：core Apache-2.0）；MCP：https://docs.getwren.ai/oss/guides/mcp
- Vanna：https://github.com/vanna-ai/vanna （MIT；2.0 重写，经典 RAG 在 legacy/）
- Doris 官方 MCP：https://github.com/apache/doris-mcp-server （351★ read-only）
- Databricks Genie：https://docs.databricks.com/aws/en/genie-agents/conversation-api
- Snowflake 语义视图：https://docs.snowflake.com/en/user-guide/views-semantic/semantic-view-yaml-spec
- 评测：https://bird-bench.github.io/ 、https://spider2-sql.github.io/
- arm64 镜像探测：https://hub.docker.com/v2/repositories/apache/doris/tags 等 tags API

另：DIVE-C 的 95 文件 curl 取证落盘于 research/2026-10-09-catalog-hub/（FETCH-REPORT.md）；DIVE-F 过程报告四份在本归档根目录 subtask-*.md。
