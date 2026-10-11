# W24-B6: Tier1 catalog + 轻量自建治理四能力

- 日期：2026-10-11 ｜ 批次：W24-B6（Gravitino + 对象存储 + iceberg-rest 接线 + governance seam + 治理面板）
- 证据：[`research/2026-10-09-w24-rebuild/b6-governance/`](../../../research/2026-10-09-w24-rebuild/b6-governance/)（01~08 全真实实跑）

## 结论

1. **对象存储换轨**：MinIO 社区版已终止分发（dl.min.io 410 Gone、Docker Hub 仓库下架、全部镜像 403），S3 席位改 **SeaweedFS 4.48**（Apache-2.0，`chrislusf/seaweedfs` daocloud 加速）。端口保持任务书预算：S3 :9000、控制台 :9001（filer）。调研报告与现实的冲突按「以现状为准」处理。
2. **Gravitino 1.3.1 aux Iceberg REST 桥接配方**（镜像 tag 存在性验证通过，R-9 关闭）：`catalog-config-provider = dynamic-config-provider` + `gravitino-metalake = dsh` + `gravitino-uri = http://localhost:8090` 三键**缺一即 fail-fast**（aux 静默退出 255，真实错误只在容器内 gravitino-server.log）；`default-metalake` 是无效键（provider 读的是 `gravitino-metalake`，jar 内字符串实证）。colima 单文件替换挂载会让 JVM 读坏 conf（挂到新路径 + entrypoint cp 才干净）。
3. **lakehouse-engine Tier1 判别式**：`kind: 'iceberg-rest'`（restUri/warehouse/s3），ATTACH 形态 `ATTACH 'lakehouse' AS lake (TYPE ICEBERG, ENDPOINT '…/iceberg', AUTHORIZATION_TYPE none)`；S3 region 必须经 Gravitino catalog properties 的 `s3-region` 走 vended config（ATTACH 无 REGION 选项）。**DuckDB 1.5.6 三个坑**：同实例 ducklake+iceberg 双 attach 令 S3 凭据上下文互踩（metadata PUT 静默不落地）；同会话写后读有 stale metadata-location 断言；REST catalog 的 DROP+CREATE 命中 Gravitino memory backend 陈旧缓存——两 Tier 迁移脚本用「独立实例 + 全新表名 + 写后新实例读回」绕过（[`b6-tier-migration.mts`](../../../examples/kb-agent/scripts/b6-tier-migration.mts)），两 Tier 3 行=3 行对账 PASS。
4. **governance seam**（Service Definition/Provider/Consumer 三件套）：`dsh-governance`（类型 + `ctx.governance` 声明）+ `dsh-governance-engine`（SQLite：lineage_edges/quality_rules/alert_events；五源采集器；湖仓真查询评估；webhook Config 化默认关）。**采集器降级链**：Neo4j→kg-graph sqlite 注册表、WeKnora API→kb-sqlite 文档表（DSH_NEO4J_PASSWORD 与 WeKnora token 均不可得时五源仍全量 252 资产）。**评估引擎必须惰性解析**：plugin 加载序不保证 lakehouse-engine 先注册，`evaluate()` 内 `ctx.get('lakehouseEngine')` 兜底。
5. **接线面**：apiproxy governance 域 9 方法（contract/schema/rpc-map/fetch handler+client/ApiProxyService/IApiClient 全链 + FakeApi/fixture/两 spec stub）；ui-governance 四 tab（目录搜索/血缘/质量评估/告警+webhook测试）挂 sidebar.nav order 12.6。web-app bundle 三注册面齐。

## 教训

- Gravitino aux 服务失败不写 stderr：定位必须 `docker cp …/logs/gravitino-server.log`，别猜 compose 差异。
- `cp -r` 复制包会拖 node_modules 循环软链（colima 输出洪水）：按文件白名单复制。
- apiproxy 新域的 IApiClient/FakeApiClient/fixture/dispatch 四处是**手工枚举面**，RpcMethodMap 加行不自动跟随。
