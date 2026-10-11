# Agent Note: W24-B5 graph Neo4j storage + LLM ontology induction (auto-primary, manual fallback)

Status: implemented

[English](2026-10-11-w24-b5-graph-neo4j-ontology-induction.md) | 中文

## Problem

「图谱本体功能现在都没完善，显示可以参考 obsidian，要实现给你资料，自动生成本体，手动只是备选」——图谱缺真实图库存储、缺自动本体生成主路径、可视化缺 Obsidian 范式、业务数据未成链入图（孤岛 343+）。

## Decision

1. 新增 `dsh-graph-neo4j`（`ctx.neo4jGraph`：bolt 存储 + 只读 Cypher 闸门 + 只增不改本体版本链 + 业务 ETL manifest）与 `dsh-tool-graph`（`kg_graph_query`/`kg_ontology`），lakehouse-engine 降级模式与 sql-guard 防御范式复用。
2. 新增纯函数库 `dsh-ontology-induction`：分块→OntoGPT 式结构化输出→合并→SHACL 语义闸门→界限修复→确定性 JSON-LD；模型永不写语法。归纳产物以 draft 入 registry v5（模型不可见），手动 KGCL 工作台为备选（修订审计行只增不改）。
3. `kg.graphPage` RPC（global/local/search/node）+ ui-kg Obsidian 画布（react-force-graph-2d 静态导入——单产物 client 契约；全局力导向/Local Graph 跳数/hover 卡/出入边面板），保留 sigma 语料子图为副画布。
4. 湖仓行版本（updatedAt watermark 追加）在 ETL 读侧按 id 去重取最新（item 344→43 与任务书示例一致），对账覆盖 source↔planned↔landed 三层；孤岛 436→375（桥接 223 条 SAME_AS），<100 未达并归因（语料单例无业务名可桥）。

## Implementation notes

- `dsh-graph-neo4j`（`ctx.neo4jGraph`）：bolt 连接（密码走 credentials env 链——`.env` 拒收 `DSH_*` 键，部署方导出 `DSH_NEO4J_PASSWORD`）；缺密码或服务不可达时一条 operator warning 后全部方法 fail-loud `NEO4J_DRIVER_UNAVAILABLE`。
- 只读 Cypher 闸门（`cypher-guard.ts`，lakehouse sql-guard 同范式）：单条读子句（MATCH/OPTIONAL MATCH/WITH/UNWIND 开头 + RETURN 必带），写/DDL/过程 token 在剥掉字面量后的文本上拒绝；多语句与空白拒绝。
- 本体版本链在 Neo4j：`__OntologyVersion` 节点存完整 JSON-LD 文档；`storeOntologyVersion` 只追加（旧头失 head、得 PREV）——从不覆盖。
- `dsh-ontology-induction`（纯库）：分块 → 结构化输出（一次重试）→ 合并（首个定义胜出，后续块只补缺 prop/constraint）→ SHACL 闸门 → 界限修复回环（修复输出**替换**合并结果；不降违规数的修复被丢弃）→ 确定性 JSON-LD（`@graph` 按 @id 排序；解析经各 `sh:NodeShape` 的 `sh:property` 列表保声明序；多约束关系以 `constraints` 列表为权威）。
- registry v5 接线：归纳类按依赖序注册 `status: 'draft'`（draft 顺序是文档序而 registry 拒绝前向引用）。手动备选 = 既有 KGCL 工作台：一组 `add_node` op 追加审计修订 3；重跑命中 append-only 重复拒绝——本身就是历史保全证据。
- 业务 ETL（`etl.ts` + `examples/kb-agent/scripts/b5-etl-run.mts`）：manifest v2 映射 lake.carbon item/customer/supplier/salesOrder/purchaseOrder（+ job/location/itemStockQuantities 为五核心之外的首批扩展）。湖 parquet 行带版本（updatedAt watermark 追加）：脚本取每 id 最后一行；行表与 customer 在湖目录被 web 持锁期间经同一 DuckDB 栈的 READ_ONLY postgres attach 读。对账断言 source↔planned 全 OK 且 landed 计数披露真实掉边（orderedItem 36→34，两行引用当前 item 版本不存在的物料）。
- 统一图 + 孤岛：语料账本（1139 节点/794 活边）导入为基线 → 孤岛 436；业务图（134 节点/304 边含 SO↔customer、SO↔item 行、PO↔supplier、job→SO/item、stock→location）+ 名称桥接（legacy experts/services SAME_AS 共 223 条）→ 375 孤岛（最大连通分量 489→581）。<100 未达：语料 Concept/Dataset 单例节点无业务表名可桥；文档化下一步为 crossSource v2 over carbon sources、WeKnora 实体通道、其余表映射。
- `kg.graphPage` RPC + Obsidian 画布：apiproxy kg 域新增 graphPage（store 缺席时结构化拒绝 `kg-graph-store-not-composed`）；ui-kg 渲染 `KgObsidianCanvas`（react-force-graph-2d **静态导入**遵单产物 client 契约；jsdom spec 模块 stub 同 sigma 法）：全局视图带孤岛统计脚注、搜索定位→Local Graph（1–3 跳、面包屑）、hover 卡、出入边关系面板点击穿行。

## Why these decisions

- **两包而非一包**：主计划 §4.1 将 graph-neo4j 与 ontology-induction 分列；归纳库保持零依赖（纯函数、无 cordis 也可测），存储拥有 driver——脚本组装两者。
- **闸门优先于 driver auth**：Neo4j Community 无只读会话语义；语句形状闸门（进 driver 前、纯函数、每条拒绝路径有测试）与 B2 为 SQL 验证的防御层同构。
- **版本去重在 ETL 而非 sync**：湖仓 append-only 文件保留行版本是设计行为；图只要当前态。读侧 last-writer-wins 去重不动 sync 契约（B2 的 watermark 证明拥有该行为）。
- **TS union-find 孤岛度量**：Community 不带 GDS；对边表的确定性 TS 遍历与 kb-graph sqlite 的指标定义完全同口径（04-islands-report.json 的 cross-check 行）。

## Operational notes

- Neo4j 以 docker `dsh-neo4j` 运行（镜像 `neo4j:5.26-community` 经 `docker.m.daocloud.io` CN 镜像拉取；colima x86_64），端口 7474/7687，卷 `dsh-neo4j-data`，首次启动设 auth。
- ETL 每轮先 `MATCH (n) DETACH DELETE n` 清图保证可复现——重跑得到完全一致的状态（按 gid 的幂等 MERGE 本也会收敛，但报告就只反映单轮）。
- kb-agent sqlite 账本的 `kg_node_types` 现含归纳 draft 类（修订 3 审计行）；draft 条目在工作台晋升前不出现在模型可见枚举。

## Consequences

- 新增运行依赖 `neo4j-driver`（Apache-2.0）与 client 依赖 `react-force-graph-2d`（MIT）；THIRD_PARTY_NOTICES 由门禁再生成。
- kg 域面扩 `kg.graphPage`（新错误码 `kg-graph-store-not-composed`/`kg-node-not-found`）；connection/runtime 两套 fixture 同步扩。
- kb-agent sqlite 账本新增归纳 draft 类与修订 3 审计行（append-only）；重跑命中重复注册即历史保全证据。
- 孤岛收敛至 375（<100 未达），归因与下一步已写入证据 04-islands-report.json——B6+ 的 crossSource v2 与 WeKnora 实体通道接手。

## Alternatives considered

- GDS 连通分量 vs TS union-find：Community 版不带 GDS，且与 kb-graph sqlite 同算法口径可直接对账——选 TS。
- 修复循环「重复合并」vs「修复输出替换合并」：实测前者让违规约束残留（repair 追加不消除）——改为替换语义。
- 动态 import react-force-graph-2d vs 静态：单产物 client 契约禁止 chunk——静态导入，jsdom 用模块 stub（sigma 同法）。
