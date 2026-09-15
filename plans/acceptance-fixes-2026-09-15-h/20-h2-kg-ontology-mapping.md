# 批次 H2：KG 本体版本化 + 映射规则文件化

> 隶属 [PLAN.md](PLAN.md)。主题二工程侧前半。前置：无（与 H1 可并行排程）。调研依据 [02](02-research-ontology-kg.md)；选型锚 [R4 报告 §06/§07](../../research/2026-09-15-ontology-kg-engineering/report.md)。规模：kb-graph/kb-graph-sqlite/kg-build 三包 + kb-agent 组装面；~10 文件改 + 2 新表 + 1 新配置文件。

## 第 0 步（必做）

1. **v2→v3 迁移安全确认**：当前 `workspace/kg-graph.sqlite` 有 ~1100 节点；[`setup-dsh-data.mts:161`](../../examples/kb-agent/scripts/setup-dsh-data.mts:161) 无条件重放 kg-build——确认「删库重建」路径在真机跑通（kg-build.mts 六段断言电池全绿）后才 bump SCHEMA_VERSION 2→3（v2 库拒绝、按 pre-release 立场不迁移）。
2. **快照链盘点**：[`examples/kb-agent/tests/kg-tools.spec.ts`](../../examples/kb-agent/tests/kg-tools.spec.ts) + [`snapshots/kg-tools/expected.md`](../../examples/kb-agent/tests/snapshots/kg-tools/expected.md) 中 registry 枚举文本位置逐处标注（本批 registry 结构变化会触碰）。
3. **`skippedRelationFields` 现状确认**：[`mappers.ts:122`](../../packages/kb/kg-build/src/mappers.ts:122) 收集点与 `CollectionRunReport` 字段缺口核对。

## 改动面 1：本体版本化（kb-graph + kb-graph-sqlite）

1. **registry 行版本列**：[`schema.sql`](../../packages/kb/kb-graph-sqlite/resources/sql/schema.sql) `kg_node_types`/`kg_relations` 加 `version INTEGER NOT NULL DEFAULT 1`；新表 `kg_ontology_revisions`（id/created_at/summary/changes_json——变更审计：added/removed/changed 三分类，changes_json 存类型/关系级 diff）；SCHEMA_VERSION bump 2→3 + `set-user-version-3.sql` 资源。
2. **TS 内置种子声明式化**：[`ontology.ts`](../../packages/kb/kb-graph/src/ontology.ts) 的 NODE_TYPES/RELATIONS 旁新增**本体 JSON 导出**（`exportOntology(): {version, nodeTypes, relations}`，semver 字符串 `ontologyVersion`，初始 `1.0.0`）；定义面 JSON Schema（ajv 校验：类型 id 唯一/extends 引用存在/关系 domain-range 引用存在/foodClass 等元数据完整）——**运行时注册路径不变**（避免破坏 [`runtime.spec.ts`](../../packages/kb/kb-graph/tests/runtime.spec.ts) 语义），校验作为 seed 加载时断言 + 可独立调用的 `validateOntology()`。
3. **`KgOntologySource` 的 `'agent-defined'` 落地**：registry persist 路径接受带版本来源标记的注册（为后期本体编辑 UI 预留），本期仅打通类型+来源枚举，不做 UI。
4. **版本透传**：`ctx.kbGraph` 增 `ontologyVersion()` 读数；tool-kb [`kg_schema`](../../packages/kb/tool-kb/src/kg.ts:265) 输出带 `ontologyVersion`；apiproxy `kg.schema` 透传。

## 改动面 2：映射规则文件化（kg-build + kb-agent 组装）

1. **独立映射文件**：新建 `examples/kb-agent/kg-mappings.yml`（版本化声明，YARRRML 语义子集的务实起点）：
   ```yaml
   version: 1
   sources:
     - system: nocobase
       collections: [experts, expert_services, datasets, customs_export, orders]  # 现 cordis.patch.yml 白名单迁入
       fkLinks:
         - field: expert_services.expertId
           target: experts
           style: plain-id
         - field: orders.serviceId
           target: expert_services
           style: collection-address
   rules: { skipHiddenCollections: true, emptyFkNoEdge: true, derivesTitle: true }  # R12/R11/R10 开关化
   ```
   [`cordis.patch.yml`](../../examples/kb-agent/cordis.patch.yml) 的 `collections`/`fkLinks` 标注 deprecated 指向新文件（双源期一个批次内收口：kg-build 读新文件，旧键报错提示迁移——fail loud 惯例）。
2. **规则命中上报**：`CollectionRunReport` 增 `skippedRelationFields`（收集点已存在只缺上报）+ 每规则命中计数（`ruleHits: {R01: n, R06: n, ...}` 按文件头编号对齐）；`KgBuildRunReport` 汇总（[`types.ts:210`](../../packages/kb/kg-build/src/types.ts:210)）。
3. **规则清单 API**：`ctx.kgBuild` 增 `mappings()` 读数（文件版本+每 collection 映射状态+规则命中）；apiproxy kg 域增 `kg.mappings`（只读）——为 H3 图谱 tab 规则面板供数。

## 改动面 3：测试与快照同步

- [`kb-graph-sqlite/tests/store.spec.ts`](../../packages/kb/kb-graph-sqlite/tests/store.spec.ts)/`registry.spec.ts`：版本列+revisions 表断言；SCHEMA_VERSION=3 断言。
- kg-build 新增 `mappings.spec`（yml 解析/规则开关/命中计数/双源 fail-loud）。
- [`kg-tools.spec.ts`](../../examples/kb-agent/tests/kg-tools.spec.ts) 快照更新（registry 枚举+ontologyVersion 出现）；[`kg-pipeline.e2e.ts`](../../examples/kb-agent/tests/kg-pipeline.e2e.ts) 回归。
- [`scripts/kg-build.mts`](../../examples/kb-agent/scripts/kg-build.mts) 断言电池扩：派生 registry 版本≥1、幂等二跑零漂移保持、revisions 表审计行存在。

## 验收断言（证据落 `demos/acceptance-h2/`）

1. 真机 `kg-build.mts` 全绿（六段原断言+新增三段）；幂等二跑零漂移（revisions 表不新增审计行——纯 skip 跑）；
2. 改 `kg-mappings.yml` 白名单（临时加一 collection）重跑：该 collection 派生类型/节点出现且 revisions 记录 diff——**改映射零改代码**实证；
3. `ontologyVersion=1.0.0` 在 `kg_schema` 工具输出与 apiproxy `kg.schema` 响应中出现；
4. `skippedRelationFields` 出现在 run report（真机一次跑的 JSON 证据）；
5. v2 旧库被拒：用 v2 sqlite 文件启动 store 报 SCHEMA_VERSION 错误码（单测断言）；
6. `pnpm run test`（kb 组相关包）+ typecheck + lint EXIT=0；快照基线双跑一致。

## 风险与回滚

| 风险 | 等级 | 预案 |
|---|---|---|
| SCHEMA_VERSION bump 后 workspace 旧库启动即拒 | 中 | 第 0 步先跑通重建链；setup-dsh-data 重放自动重建；QUICKSTART 补一句运维说明 |
| 双源（yml+collections 键）漂移期引入静默跳过 | 中 | 旧键存在即 fail loud（misconfiguration fails loud 惯例）；单测覆盖 |
| 快照枚举文本更新遗漏（expected.md 多处） | 低 | 第 0 步标注清单逐处改；test:snapshot 局部重录 |
| ajv 引入新依赖 | 低 | 查 workspace 既有 ajv（npm 生态常见传递依赖）——若未有则按「依赖优先于手写校验」惯例引入并记 third-party-notices |

回滚：kb 三包 + 组装面单提交；revert 后回 v2 库（旧 workspace 库需从备份恢复——第 0 步留存 sqlite 副本作回滚资产）。
