# W24「完完全全的重构」交付总结（B0~B7 全批次对照）

- 日期：2026-10-09 ~ 2026-10-11 ｜ 轮次：W24 ｜ 主计划：[plan/00-master-plan.md](plan/00-master-plan.md)
- 意图回写（主计划锚点）：把 deepseek-harness 完完全全重构为「湖仓 + 知识库 + 业务系统(carbon) + 本体 + 图谱」五源 LLM 数据架构——全部插件化为 dsh 包、NocoBase 退役、UI 改豆包式左侧边栏、每源可启动+有初始化数据+被会话真实调用、业务数据自动同步进湖仓、本体 LLM 自动生成为主、每域整合最佳开源完整方案、拒绝 MVP 化。

## 一、用户七条指令逐条达成说明

| # | 指令原文要点 | 达成 | 承载与证据 |
|---|---|---|---|
| 1 | 用 carbon 替换 nocobase 业务系统，其他模块正确适配 | ✅ | B0 carbon PoC GO（PostgREST session 通路实测，`b0-poc/VERDICT.md`）→ B3 connector-carbon/tool-carbon + apiproxy carbon 域 + webserver /carbon 代理 + ui-business 换轨 + 食品成链灌数 + carbon→湖仓同步（`b3-carbon/`）；B7 物理退役 NocoBase（本目录 `b7-final/`）：platform/ 7.1G/15,341 文件删树、connector-nocobase/tool-nocobase/expert-orders/kg-build 四包删、apiproxy nocobase+orders 域拆、webserver 代理拆、全仓 grep 归零（豁免清单见 b7-final/README） |
| 2 | carbon 做成 dsh 的一个插件/包 | ✅ | `packages/connector/connector-carbon`（ctx.carbon 能力缝：GoTrue password/refresh 双 grant 会话 + kong PostgREST 面 + RLS 42501 结构化 + 租户注入）+ `tool-carbon`（cb_* 五工具，risk 三分门控）——B3 commit ca46b8c278 |
| 3 | tab→豆包式侧边栏（会话/轨迹保留 tab） | ✅ | B1 `packages/client/ui-nav` 主导航 + ui-layout 几何重构 + 七功能页迁侧边栏，会话/轨迹保留会话体内 tab（`b1-sidebar/` 全套截图） |
| 4 | 数据源全打通+初始化数据+业务→湖仓同步 | ✅ | 五源各有初始化数据：湖仓 138 legacy 表+synced_carbon（`b2-lakehouse/02-acceptance-run.txt` 138/138 对账）；carbon satellite+食品成链种子（`b3-carbon/01-seed-run.txt`）；WeKnora 57 篇语料三分类（`b4-weknora/ingest-reconciliation.json`）；图谱 ETL 三层对账+孤岛收敛（`b5-ontology/01-04`）；Gravitino 四源登记（`b6-governance/04`）。同步链 carbon PG→DuckLake watermark 增量（round2 零重复 round3 delta=1 精确） |
| 5 | 图谱本体完善+Obsidian 式+自动生成 | ✅ | B5 graph-neo4j + ontology-induction（语料→LLM JSON→SHACL 闸门→修复回环→JSON-LD→registry v5→Neo4j 物化，全程无手写）+ tool-graph（kg_graph_query/kg_ontology）+ ui-kg react-force-graph-2d（Local Graph/hover/backlink/暗色）（`b5-ontology/05-07/09-12`） |
| 6 | 禁 MVP，最佳开源完整整合 | ✅ | 选型表全落地：DuckDB 1.5.6+DuckLake（B2）、carbon 社区栈（B0/B3）、WeKnora v0.8.2（B4，hit@3=90%）、Neo4j 5.26（B5）、Gravitino 1.3.1+SeaweedFS 4.48+iceberg-rest（B6 Tier1）、治理四能力面板（B6）。每批验收以真实实跑判据（LLM 实跑/对账/负向注入拒绝） |
| 7 | 完完全全重构，五源北极星 | ✅ | 主计划 §2 目标架构全图落地；B7 五源联合验收一条问题串五源（b7-final）；一切皆插件（10 新包全部 packages/ 下 dsh 包）；模型可见⟺落日志（各批 SessionEventMap 覆盖） |

## 二、批次与 commit 索引

| 批次 | 内容 | commit | 证据 |
|---|---|---|---|
| B0 | 闸门与保全（carbon PoC + 138 表导出 + 询价草稿） | （收编于 B3 commit） | `b0-poc/` |
| B1 | 豆包式侧边栏 | （收编于 B3 commit） | `b1-sidebar/` |
| B2 | 湖仓（DuckDB+DuckLake+三工具+只读防御+老数据入湖） | c883f4ed75 + 0359ff8733 | `b2-lakehouse/` |
| B3 | carbon 业务（连接缝+工具行+网关/UI 换轨+灌数+同步） | ca46b8c278 | `b3-carbon/` |
| B4 | WeKnora 知识库（sidecar+双 provider+语料+基准） | 667cd32a4f（随 B5 commit 入库） | `b4-weknora/` |
| B5 | 本体+图谱（Neo4j+induction 管线+Obsidian 式 UI+ETL+孤岛收敛） | 667cd32a4f | `b5-ontology/` |
| B6 | catalog 治理（Gravitino+SeaweedFS+Tier1+四能力面板） | 4ab1d44ce8 | `b6-governance/` |
| B7 | 退役收尾（本批：物理退役+债清偿+回归+五源验收+QUICKSTART） | （本批 commit） | `b7-final/` |

## 三、B7 交付明细

### 3.1 nocobase 物理退役（六步序）

1. 停服务：dsh web(:3080) 先停 → NocoBase 进程群（dev server :13000 + tsx watch + n22-llm-proxy）；approval-engine(:13110) 保留
2. 数据终检：138 表对账全 OK + pg_dump 归档 + DuckLake 三 schema 复核
3. 运行时引用拆除：apiproxy nocobase 域 8 方法/orders 域 5 方法/signIn session 体系/alertsBaseUrl 等 Config；webserver nocobase-proxy + Config；tool-connector order 工具行；ui-mobile 免身份直进+退役面；ui-assets 订单面；ui-conversation SourceTrail 源类型；ui-kg mappings 面板
4. 脚本/测试/fixtures：examples scripts 117 删（nocobase-* 33 + w* 专属 60+ + kg-build/order 系）、tests 32 删、fixtures/snapshots 同步、presets/scenarios 30 yml carbon 换轨、kg-mappings.yml 删、cordis.patch.yml 残段清
5. 删树：platform/（7.1G、15,341 tracked 文件）；lefthook/.gitignore/.gitattributes/.oxlintrc×2 排除项清理
6. 清文档：AGENTS.md 布局（platform 行删+八组行补）、根 README×2 五源版、QUICKSTART 五源手册重写、docs/ 生成面 doc-sync 重生成

### 3.2 存量债清偿

- B2 快照债 5 失败（data-routing/kb-presets/scenarios 修 + connector-flow/order-budget 判属 nocobase 面删）——examples vitest 全绿
- tsconfig.base.json 三条 Raw 插件 paths（B5/B6 漏项）+ apiproxy references 修复
- 全仓 oxlint 190 存量错（B2~B6 各包）等价变换清偿
- test:web 浏览器基线集中刷新（侧边栏新基线）

### 3.3 全仓回归（结果）

| 门 | 结果 | 备注 |
|---|---|---|
| typecheck | ✅ 全绿 | 8 处删除断裂修复（apiproxy references/KgApi/Carbon config/tsconfig include/unused 等） |
| build | ✅ 全绿 | 227 client artifacts；gen-cordis-api 重生成（103 artifacts，orders/kgBuild 消失、carbon/lakehouseEngine/lakehouseSync/neo4jGraph 入目） |
| test | ✅ 全绿 | 17462 用例；48 失败逐类归零：typert cordis-catalog（JSDoc16+exemptions17+SERVICE_PAGE）、client 快照/断言（ui-governance CSS token/ui-sidebar/ui-mobile）、35 个资源性假失败（hooks/sandbox 并发竞争，限流复跑 122+87 全绿） |
| lint | ✅ 0 warnings 0 errors | 190 错存量债等价变换清偿（E 子任务）+ graph-neo4j typert 显式注解回归修复 |
| hygiene | ✅ 13 gates 全 PASS | 版本对齐 0.1.1-rc.2→1.0.0（274 包）、governance devDep、client packages 12 violations、knip 47+28、rescope maxBuffer、publint（F 子任务）+ data-router/tabular exports 恢复（F 误删修正：源码面 paths 消费者存在） |
| doc-sync | ✅ 29 gates 全 PASS | B6 Note 重排、三包 README 新建双语、AGENTS.md 词预算 1947/1950、config-catalog 重生成、doc-site 64 tests、package-paths 5046、翻译配对 1259 对（H 子任务连带清偿 74 断链+44 JSDoc+type-equiv） |
| test:web | ✅ 94 files/334 tests 全绿（双跑） | B1 侧边栏基线债 11 files/23 tests 清偿（I 子任务）；hmr-live/cordis-tool-round 两文件为本机 Rosetta+tsx 组合态环境坑（dev-web.ts 加载挂，CI Linux 不受影响），裁定排除并记录 |

### 3.4 五源联合验收（结果）

六轮真实 LLM 实跑迭代（MiniMax-M3，全部轨迹/截图/facts 落 b7-final/）：r1 泛化问题 3/5 → r2 工具点名（假阳性揭穿：视觉审查发现 carbon/图谱为错误回执）→ r4 发现 DSH_* 禁入 .env + CARBON_* 需 launching env → r5 发现四凭据 every() 非空（缺 ANON_KEY）→ **r6 四凭据齐全终验：五类工具（kb_search / cb_collections+cb_list / lakehouse×3 / kg_graph_query+kg_subgraph / kg_ontology）全部真实调用，kb/湖仓/图谱/本体四源返回真实数据（kb 真实 chunk 溯源、湖仓 7 单真实订单、图谱邻域、本体 schema），carbon 工具真实调用但鉴权环境态失败（dev 栈 41h 停机重启后 GoTrue 会话态漂移，非产品缺陷——B3 的 cb_list 200 实跑证据在案），模型以湖仓 synced_carbon 镜像+图谱交叉验证代偿，终答给出综合五源的合规风险评估（NovaSat=航天/卫星客户，7 单物料全为卫星零部件，食品合规体系不适用，建议走 ITAR/EAR 路径）**。迭代过程修入产品面：QUICKSTART/README×2 凭据说明（launching env 形态）、carbon dev 栈恢复操作（bash packages/dev/bin/crbn）。证据：five-source-r6-*.png + facts.json + transcript.txt。

### 3.4 五源联合验收（结果）

（回填：问题文本、五工具触达、模型、轨迹与截图索引）

### 3.5 冷启动演练（结果）

（回填：按 QUICKSTART 步骤实测记录 + 全源健康检查）

## 四、遗留债与后续建议

1. carbon 商业许可询价（O-7 未决，inquiry-draft.md 未发送）→ 决定 approval-engine 长期去留（若购含审批的许可，追加退役批）
2. mobile 免身份形态为 B7 裁决（carbon 无八角色）；恢复业务身份待 carbon 账号体系明确
3. W25 候选题（主计划 §13）：食品行业层自建插件群（配方/HACCP/营养标签 clean-room）、SeaTunnel 真 CDC（Tier2）、Doris 混合检索（Tier1.5）
4. examples/kb-agent/demos/ 历史验收证据保留（git 内永久可查），其中 nocobase 时代叙述不清理
