# H2 验收证据（2026-09-15，真机 :13000/:5432 + 单测/快照）

## 断言 1：真机 kg-build.mts 全绿（六段原断言 + 新增三段）+ 幂等二跑零漂移

重建链（删除 v2 库后重建）输出：
```
[PASS] full build ingested every collection
[PASS] ontologyVersion is 1.0.0 — 1.0.0
[PASS] mappings readout carries 5 collections — 5 collections, v1
[PASS] registry carries ≥4 nocobase-derived types — 5: experts, expert_services, datasets, customs_export, orders
[PASS] draft statuses carry through
  graph stats: nodes=496 edges=141（重建首跑；含 corpus: docs=47 calls=47 entities=114）
[PASS] 张红喜 canonical node exists / reaches its services (hop 1)
[PASS] watermark persisted for experts — watermark=33
[PASS] second run skips every unchanged scope（幂等二跑全 skip）
[PASS] second run changes no counts — nodes 496→496, edges 141→141（零漂移）
[PASS] incremental … tombstones …（增量五断言）
kg-build.mts: ALL CHECKS PASSED
```

**v2 旧库被拒（fail loud 真机证据）**：bump 后首跑输出
`Error: graph database at "examples/kb-agent/workspace/kg-graph.sqlite" has schema version 2, incompatible with this build (3); delete the file and rebuild the graph from its sources`（v2 备份留存本目录 `kg-graph.v2-backup.sqlite`）。

**sqlite 直查**：`PRAGMA user_version` = **3**；`kg_ontology_revisions` 恰 1 行
`1|1.0.0|mapping run persisted 5 new type(s), 2 new relation(s)`；`kg_node_types` 36 行全部 `version=1`（幂等纯 skip 跑不新增审计行）。

## 断言 2：改 kg-mappings.yml 白名单重跑即出新 collection 节点（改映射零改代码实证）

yml 临时加 `hub_inv_products`（anchor Product）重跑（**零代码改动**）：
```
collection hub_inv_products: rows=7 nodes=7 watermark=7 skipped=false
[PASS] registry carries ≥4 nocobase-derived types — 6: …, hub_inv_products
revisions: 1|…5 new type(s)…  2|mapping run persisted 1 new type(s), 0 new relation(s)  ← diff 审计
```
脚本固定位断言（期望 5 collection）如预期 FAIL —— 正是映射变化生效的证明。随后恢复 yml 原样、删库重建：ALL CHECKS PASSED、revisions 回到 1 行、`hub_inv_products` 类型清除（基线干净）。

## 断言 3：ontologyVersion=1.0.0 出现在 kg_schema 工具输出

`kg-tools.spec.ts` 快照两处 `ontology_version: 1.0.0`（before/after build 段）——`kg_schema` 模型面输出与 apiproxy `kg.schema`（wire schema `ontology_version` required）同源（`ONTOLOGY_VERSION` 常量经 kb-graph service `ontologyVersion()` / tool-kb `kgOntologyViews` 透传）。

## 断言 4：skippedRelationFields 出现在 run report

`CollectionRunReport.skippedRelationFields`（[mappers.ts 收集点](../../packages/kb/kg-build/src/mappers.ts) R06 未接线关系字段上报）+ `KgBuildRunReport.ruleHits`（R01/R02/R06/R11/R12 计数）；单测覆盖于 `pipeline.spec.ts`/`mappings.spec.ts`；真机 readout：`build.mappings()` 输出 5 collections + v1。

## 断言 5：v2 旧库被拒（单测）

`store-v2.spec.ts`：`/schema version 1, incompatible with this build \(3\).*rebuild/`（v1 库同样拒绝）。

## 断言 6：测试门禁

- `npx vitest run packages/kb examples/kb-agent/tests/kg-tools.spec.ts` → 39 files / **519 tests 全绿**（含新 `mappings.spec.ts` 10 cases：严格解析/未知 system 闭集/重复 collection/未知键/fk 缺字段/坏 style/规则默认/非对象文档/退役 collections 键 constructor 拒绝）
- `pnpm run typecheck` EXIT=0；`pnpm run build` EXIT=0；`oxlint packages/kb packages/host/apiproxy examples/kb-agent` 0 errors
- 快照 `kg-tools/expected.md` 双跑一致（重跑一次比对通过）

## 实施要点

- **映射文件化**：`examples/kb-agent/kg-mappings.yml`（version1 + sources[].system='nocobase' 闭集 + collections/fkLinks + rules 三开关 R10/R11/R12）；`kg-build` Config 的 `nocobase.collections` 退役——constructor 捕获该键即 `KG_BUILD_MAPPINGS_INVALID`（"move … into a versioned kg-mappings.yml"），双源静默漂移不可能发生（单测锁定）。
- **版本化**：schema.sql v3（registry 两表 `version` 列 + `kg_ontology_revisions` 审计表 + `set-user-version-3.sql`）；`ONTOLOGY_VERSION='1.0.0'` + `exportOntology()`/`validateOntology()`（TS 纯函数：id 唯一/extends 引用/domain-range 引用/inverseOf——registry 构造时 assert；ajv 未引入：typed TS 边界按 AGENTS.md 交给编译器，结构校验用 `parseMappings` 严格解析承载）。
- **透传面**：`ctx.kbGraph.ontologyVersion()/recordOntologyRevision()/ontologyRevisions()`；`ctx.kgBuild.mappings()` 读数；apiproxy 新 `kg.mappings` RPC（wire 四件套齐：rpc-map/handler/client/zod schema）+ `kg.schema` 带 `ontology_version` 与 `revisions` 尾巴。
