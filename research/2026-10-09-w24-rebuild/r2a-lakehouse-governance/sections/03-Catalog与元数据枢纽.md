# 第 3 章 Catalog / 元数据枢纽：Gravitino vs Polaris vs UnityCatalog vs Nessie vs Amoro vs HMS

本章回答调研问题 3：轻量单机选谁；REST catalog 协议与 Iceberg 的配合；**能否同时当「湖仓+知识库+图库+业务库」四源统一元数据中心**（五源架构的关键枢纽）；自带 UI 有无。本章对 W24 北极星架构权重最高——五源统一的第一落点就是 catalog 层。

## 3.1 Apache Gravitino 1.3.1 —— 唯一接近四源枢纽的候选（3.5/4）

**基本盘 [Critical]**：v1.3.1 发布 2026-09-30；**TLP 毕业确认**（v0.9.0-incubating 为末个孵化 tag，v1.0.0 起无后缀）；Apache-2.0；3,243★；pushed_at 2026-10-09（日活）。datastrato 捐赠。（来源：api.github.com/repos/apache/gravitino 、github.com/apache/gravitino/releases）

**单机部署 [Critical]**：Java 17；**Linux + macOS x86_64/ARM64 官方声明**；单进程 `bin/gravitino.sh` 起 :8090，**内嵌 H2 缺省存储，无外部 DB 依赖即可跑**；官方 docker 镜像 apache/gravitino（86 tags，arm64 确认存在；amd64 压缩 ~1.98GB——偏重，内嵌多 catalog 依赖）。（来源：gravitino.apache.org/docs/1.3.1/）

**catalog 支持矩阵（1.3.1 官方清单，任务书点名的矩阵页）[Critical]**：
- **Relational（12）**：**PostgreSQL（12–16，可写 DDL 代理）**、MySQL、Doris、Hologres、StarRocks、OceanBase*、ClickHouse*、Hive、**Iceberg**、**Paimon**、**Hudi**、Lakehouse-generic（**Lance**，1.3 新）；*=contrib 目录不在标准发行包；
- **Fileset**（**本地 file:// 内置** + HDFS 内置 + S3/GCS/ADLS/OSS/COS bundle jar；location 三级继承、建 schema 自动建目录）——知识库文件源的直接挂载点；
- **Messaging**（Kafka）；
- **Model**（名称→URI 映射注册表 + 版本 + production/champion 别名 + 多 URI，自管不外联）——本体/模型资产登记位；
- 治理：metalake 级 **Tag / Policy / Job Template / Role / Job**；RBAC = ownership + role(privileges: SELECT_TABLE…)→user/group，授权向下继承、默认拒绝、**显式 DENY 压倒一切**（authorization 默认关闭）。

**REST 兼容 [Critical]**：内嵌 **Iceberg REST Catalog Service**（实现 Apache Iceberg REST spec，Iceberg 1.11，端点 `/iceberg/`；standalone 缺省 :9001 或 aux 模式挂主服务 :8090；**不支持 multi-table transaction 与 view registration**；后端 memory/Hive/JDBC/REST；OAuth2 + HTTPS + 审计 + 事件监听）。另有 **Lance REST 服务**（1.3 新，向量湖格式）。OpenAPI 全量文档：gravitino.apache.org/docs/1.3.1/api/rest/gravitino-rest-api 。

**UI/CLI/SDK 与彩蛋 [Critical]**：**官方 Web UI**（:8090，metalake/catalog/schema/表/文件集/模型浏览，模型可看版本与别名；打 tag 需走 API）+ 官方 CLI。SDK 仅 **Java + Python**（官方文档声明）——**npm 无官方/社区 TS client**（搜索仅命中无关包 @gravitino-dev/erp-lib，33 月下载）。认证 simple/basic/OAuth2/Kerberos。**彩蛋：官方 Gravitino MCP Server**（gravitino.apache.org/docs/1.3.1/gravitino-mcp-server）——直接面向 AI 工具管理元数据，对 agent harness 场景高价值。

**四源覆盖判定 [Critical]**：湖仓 ✅（Iceberg/Paimon/Hudi/Lance + Iceberg REST 服务）；知识库 ✅（fileset 挂本地目录/对象存储）；业务库 ✅（PG/MySQL 元数据联邦 + DDL 代理）；**图谱 ❌——catalog 清单无 Neo4j/图数据库连接器**（relational 均为 JDBC-SQL 系）→ **3.5/4**。图谱源的折中：Neo4j 自管 schema API + 在 Gravitino 侧以 fileset/model 资产登记（或等 contrib 出图连接器）。

## 3.2 Apache Polaris 1.8.0 —— 纯 Iceberg 湖仓枢纽，最轻（418MB）

**基本盘 [Critical]**：apache-polaris-1.8.0（2026-09-28）；**TLP 毕业确认**（1.3.0-incubating 后缀止于 1.4.0）；Apache-2.0；2,086★；日活。Snowflake 捐赠，**Iceberg REST Catalog 规范 reference implementation**（0.9.0 文档树即挂 Iceberg OpenAPI 页）。

**持久化（任务书重点问题）[Critical]**：1.8.0 三种 metastore——**In-Memory（默认，测试用，重启丢数据、禁多副本）/ PostgreSQL JDBC（生产推荐）/ MongoDB NoSQL（beta）**；Eclipse Store 与 Derby 在 1.8.0 文档 0 命中（已非当前持久层话术）。单机开发可 in-memory 起步，持久化需外部 PG。配置 `polaris.persistence.type=relational-jdbc` + `quarkus.datasource.jdbc.*`。（来源：polaris.apache.org/releases/1.8.0/helm-chart/persistence/ 、/metastores/relational-jdbc/）

**部署与能力 [Critical]**：Quarkus 应用；官方镜像 apache/polaris（14 tags，arm64 确认，amd64 压缩 ~418MB）+ apache/polaris-admin-tool（bootstrap realm）；RBAC（principal/role）+ OAuth2 token broker + Keycloak 指南 + **OPA 外部 PDP** + vended-credentials；**无 Web UI**（1.8.0 文档树无 UI 页；有 Admin Tool/CLI）；1.8 新增 Generic Table 实体与 **Federation**（Iceberg REST/HMS/BigQuery metastore 联邦——联邦是读外部 catalog，不是统一资产模型）；OpenAPI：Management API + Catalog API 双 spec。**无官方 TS SDK**（Spark Java client 为主）。

**四源覆盖**：湖仓 ✅（Iceberg-only + 联邦读）知识库 ❌ 业务库 ❌ 图谱 ❌ → **1/4**。

## 3.3 Unity Catalog OSS 0.6.0 —— AI 资产语义最全，多模态 2.5/4

**基本盘 [Critical]**：v0.6.0（2026-08-20，仍 0.x）；Apache-2.0；3,553★（五家最高）；日活；另有独立版本线 **UC AI**（ai-v0.4.0 网关 + unitycatalog-ai Python client）。（来源：api.github.com/repos/unitycatalog/unitycatalog）

**资产模型 [Critical]**：catalog.schema 下的**表（Delta 主力，quickstart 预载 4 张 Delta 表；Parquet/ORC/JSON/CSV/Avro/TEXT；Iceberg 经 UniForm）+ Volumes（文件）+ Functions + Models/Model Versions + AI tools**——UI 文档逐类演示 create/describe/delete。

**部署/UI [Critical]**：`bin/start-uc-server`（需 Java）+ **官方 UI 在 repo /ui 目录**（Node+Yarn：`cd /ui && yarn install && yarn start`）；docker compose 一键起 **server :8080 + UI :3000**（宿主 DuckDB/Spark 可直连）。**无官方 Docker Hub 镜像**（Docker Hub unitycatalog 命名空间 404）。**文档真实域名 = docs.unitycatalog.io**（unitycatalog.io/docs 与 www 域平铺路径均 404——后续抓取必用此域）。apidocs 为 JS 渲染 SPA，curl 不可得。

**客户端 [Critical]**：CLI（bin/uc）+ Python；**npm 无官方 TS SDK**（@unitycatalog/unitycatalog-ts 与 -ui 均 404；npm 搜 unitycatalog 仅第三方 express-middleware 16 月下载）——**repo 历史上含 TS client 目录的传闻与 npm 现状矛盾**（见 3.7 矛盾 1）；DuckDB `uc` 扩展直连（compose 文档明示 DuckDB/Spark 宿主接入）。认证 basic/OAuth2。

**四源覆盖**：湖仓 ✅（Delta/UniForm-Iceberg）知识库 ✅（volumes）业务库 ❌ 图谱 ❌ → **2.5/4**。

## 3.4 Nessie 0.109.0 —— Git-like 版本化叠加层

**[Critical]** 0.109.0（2026-10-08，发布节奏极密：两个月 10 个 release）；Apache-2.0（**非 ASF，独立社区**）；1,520★。模型：跨表事务 + Git 语义（branch/tag/commit）；内容模型以表格式为主（Iceberg 为主），**无 relational/fileset/graph 资产类型**。官方内嵌 Iceberg REST catalog 服务；服务端多 warehouse + 每 bucket S3 凭据（**绝不暴露给客户端**）+ MinIO 本地 S3 配方 + down-scoped 凭据 vending；GCS/ADLS experimental。客户端 Java/Python 官方，**npm 无 JS/TS client**。UI 存在（projectnessie.org/guides/ui/）。镜像 ghcr.io/projectnessie/nessie（arm64 manifest 未验证）。**四源覆盖 1/4——但作为「实验分支/时间旅行」层叠加在 Iceberg 面上是独特能力**（对 agent 场景的「沙箱试验分支查询」有想象空间）。

## 3.5 Apache Amoro（孵化）与 Hive Metastore

**Amoro [Critical]**：v0.8.1-incubating（**2025-09-11，距今 13 个月无 release**；repo pushed_at 2026-10-09，Docker tag 2026-09-23 仍在推——疑似 snapshot）；1,189★。AMS + 自优化 service，面向 Iceberg/Paimon/Hudi **表维护**，非元数据枢纽；arm64 确认（amd64 ~976MB）。任务书"上次 release 2025-09"核实属实。**不作枢纽候选**；若未来 Iceberg 小文件问题尖锐，可作为维护服务再评估（但第 1 章已证明 pyiceberg+expire_snapshots + DuckDB 读取端 merge-on-read 足以覆盖演示级数据量）。

**Hive Metastore [Critical]**：对照验证出局——Thrift 遗留、无 REST/多模态；Polaris 1.8 与 Gravitino 均以"HMS 联邦/catalog"方式收编存量（polaris federation/hive-metastore-federation、gravitino apache-hive-catalog）。

## 3.6 四源统一能力矩阵与决策

| 候选 | 湖仓（表格式） | 知识库（文件） | 业务库（PG/MySQL） | 图谱（Neo4j） | 附加资产 | 四源得分 |
|---|---|---|---|---|---|---|
| **Gravitino 1.3.1** | ✅ Iceberg/Paimon/Hudi/Lance + Iceberg REST 服务内嵌 | ✅ fileset：本地 file:// 与对象存储 | ✅ jdbc-postgreSQL(12–16)/MySQL 等元数据+DDL | ❌ 无图连接器 | model/Kafka topic/Tag/Policy/RBAC | **3.5/4** |
| **UnityCatalog 0.6.0** | ✅ Delta+UniForm(Iceberg)+Parquet 族 | ✅ volumes | ❌ | ❌ | functions/models/AI tools | 2.5/4 |
| **Polaris 1.8.0** | ✅ Iceberg 专用（+HMS/BigQuery 联邦读） | ❌ | ❌ | ❌ | generic table(1.8 新) | 1/4 |
| **Nessie 0.109.0** | ✅ Iceberg+强版本化/跨表事务 | ❌ | ❌ | ❌ | — | 1/4 |
| **Amoro 0.8.1-inc** | ✅ 表维护/自优化（非枢纽） | ❌ | ❌ | ❌ | — | — |
| Hive Metastore | 遗留 | — | — | — | 出局（被联邦收编） | — |

**TS 接入面收敛 [Critical]**：湖仓读写 = **iceberg-js（npm，Supabase 维护的 Iceberg REST Catalog TS 客户端，v1.0.0 @2026-06-08，MIT，月下载 ~9,988 万，tabulario/iceberg-js 的接管版——@tabulario/iceberg-js 已 404）**；治理/元数据面 = Gravitino OpenAPI（自生成 TS client）或 Gravitino MCP Server；UC 需自写 REST 封装。

**决策**：主选 **Gravitino**（四源枢纽唯一现实候选：湖仓 + fileset 知识库 + PG 业务库三源原生；图谱源走「Neo4j 自管 + Gravitino 登记」折中；内嵌 Iceberg REST + UI + MCP 三件套；代价 = Java17 + 1.98GB 镜像 + 无官方 TS SDK）；**备选 Polaris**（只要纯 Iceberg catalog 时最轻：418MB + in-memory 起步 + PostgreSQL 持久化）；Nessie 作为 Iceberg 面上的版本化叠加层保留；UnityCatalog 若 AI 资产（model/function/AI tool）管理需求上升再评估。

## 3.7 未解决矛盾

1. **UC TS SDK**：repo 历史上含 TS client 目录的传闻 vs npm @unitycatalog/unitycatalog-ts 真实 404——包名可能变更或从未发布，需仓库树验证。
2. **Gravitino 镜像时序**：Docker Hub 首条 tag last_pushed=2026-06-28，但 v1.3.1 release=2026-09-30——1.3.1 官方镜像 tag 是否已推未验证（落地前必测）。
3. **Amoro docker tag 2026-09-23 推送** vs 13 个月无 release——snapshot 推测无直接证据。
4. **内存占用**：各家均无文档化内存数字；仅镜像压缩尺寸可代位（Gravitino 1.98GB 偏重警示，实际 JVM 堆需实测）。
5. Gravitino releases-list 中 v1.2.1 晚于 v1.3.0 出现的排序异常（GitHub 按 created_at 排序所致，非实质矛盾，列出备查）。
