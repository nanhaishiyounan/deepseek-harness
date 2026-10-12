# Agent Note: W24-B6 Tier1 catalog + 轻量自建治理四能力

Status: implemented

[English](2026-10-11-b6-governance-tier1-catalog.md) | 中文

日期：2026-10-11 ｜ 批次：W24-B6（Gravitino + 对象存储 + iceberg-rest 接线 + governance seam + 治理面板） ｜ 证据目录：[research/2026-10-09-w24-rebuild/b6-governance/](../../../../research/2026-10-09-w24-rebuild/b6-governance/)（01~08 全真实实跑）

## Problem

W24 主计划把湖仓推到 Tier1（Gravitino catalog + 对象存储 + Iceberg 表格式），并在五源之上用轻量自建补齐治理四能力（资产目录/血缘/质量/告警）。对象存储席位的上游 MinIO 社区版已终止分发，Gravitino aux 的 Iceberg REST 桥接没有现成配方，DuckDB 1.5.6 的双 attach 组合存在多个静默失败面——三条线都要以真实实跑定配方。

## Decision

### 1. 对象存储换轨 SeaweedFS 4.48

MinIO 社区版已终止分发（dl.min.io 410 Gone、Docker Hub 仓库下架、全部镜像 403），S3 席位改 **SeaweedFS 4.48**（Apache-2.0，`chrislusf/seaweedfs` daocloud 加速）。端口保持任务书预算：S3 :9000、控制台 :9001（filer）。调研报告与现实的冲突按「以现状为准」处理。

### 2. Gravitino 1.3.1 aux Iceberg REST 桥接配方（fail-fast 三键）

镜像 tag 存在性验证通过（R-9 关闭）：`catalog-config-provider = dynamic-config-provider` + `gravitino-metalake = dsh` + `gravitino-uri = http://localhost:8090` 三键**缺一即 fail-fast**（aux 静默退出 255，真实错误只在容器内 gravitino-server.log）；`default-metalake` 是无效键（provider 读的是 `gravitino-metalake`，jar 内字符串实证）。colima 单文件替换挂载会让 JVM 读坏 conf（挂到新路径 + entrypoint cp 才干净）。

### 3. lakehouse-engine Tier1 判别式与 DuckDB 1.5.6 三坑

`kind: 'iceberg-rest'`（restUri/warehouse/s3），ATTACH 形态 `ATTACH 'lakehouse' AS lake (TYPE ICEBERG, ENDPOINT '…/iceberg', AUTHORIZATION_TYPE none)`；S3 region 必须经 Gravitino catalog properties 的 `s3-region` 走 vended config（ATTACH 无 REGION 选项）。**DuckDB 1.5.6 三个坑**：同实例 ducklake+iceberg 双 attach 令 S3 凭据上下文互踩（metadata PUT 静默不落地）；同会话写后读有 stale metadata-location 断言；REST catalog 的 DROP+CREATE 命中 Gravitino memory backend 陈旧缓存——两 Tier 迁移脚本用「独立实例 + 全新表名 + 写后新实例读回」绕过（``b6-tier-migration.mts``），两 Tier 3 行=3 行对账 PASS。

### 4. governance seam（Service Definition/Provider/Consumer 三件套）与降级链

`dsh-governance`（类型 + `ctx.governance` 声明）+ `dsh-governance-engine`（SQLite：lineage_edges/quality_rules/alert_events；五源采集器；湖仓真查询评估；webhook Config 化默认关）。**采集器降级链**：Neo4j→kg-graph sqlite 注册表、WeKnora API→kb-sqlite 文档表（DSH_NEO4J_PASSWORD 与 WeKnora token 均不可得时五源仍全量 252 资产）。**评估引擎必须惰性解析**：plugin 加载序不保证 lakehouse-engine 先注册，`evaluate()` 内 `ctx.get('lakehouseEngine')` 兜底。

### 5. 接线面

apiproxy governance 域 9 方法（contract/schema/rpc-map/fetch handler+client/ApiProxyService/IApiClient 全链 + FakeApi/fixture/两 spec stub）；ui-governance 四 tab（目录搜索/血缘/质量评估/告警+webhook测试）挂 sidebar.nav order 12.6。web-app bundle 三注册面齐。

## Consequences

- 对象存储席位绑定 SeaweedFS 4.48 的 daocloud 镜像可用性；上游分发再变时按「以现状为准」重走选型证据链。
- Tier 迁移脚本依赖「独立实例 + 全新表名 + 写后新实例读回」绕过 DuckDB 1.5.6 缺陷；DuckDB 升级后须回归验证三个坑是否仍在，仍在则绕过法继续生效，消失则可简化。
- apiproxy 新域的 IApiClient/FakeApiClient/fixture/dispatch 四处是**手工枚举面**，RpcMethodMap 加行不自动跟随——后续加域或加方法时四处同步是固定成本。
- Gravitino aux 服务失败不写 stderr：定位必须 `docker cp …/logs/gravitino-server.log`，别猜 compose 差异。
- colima 下复制包不可 `cp -r`（node_modules 循环软链造成输出洪水）：按文件白名单复制。

## Alternatives considered

- **继续用 MinIO 社区版镜像**：被否——dl.min.io 410 Gone、Docker Hub 全镜像 403，分发已终止（决策 1）。
- **`default-metalake` 作为 metalake 键名**：被否——jar 内字符串实证 provider 读 `gravitino-metalake`，该键静默无效（决策 2）。
- **同实例 ducklake+iceberg 双 attach 直跑迁移**：被否——S3 凭据上下文互踩令 metadata PUT 静默不落地，改独立实例（决策 3）。
- **质量告警 webhook 默认开启**：被否——webhook 目标属部署侧差异，Config 化默认关（决策 4）。
- **治理四能力外挂开源面板**：被否——W24 定性轻量自建，外挂与五源注册表（kg-graph sqlite/kb-sqlite）脱节，降级链拿不到资产全集（决策 4）。
