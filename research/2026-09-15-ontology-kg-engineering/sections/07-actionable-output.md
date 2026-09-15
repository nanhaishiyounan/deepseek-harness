# 07 · 可操作产出汇总（代码骨架 / 清单 / 可复用资产）

> 本节集中全部可直接复制使用的产出。对应详细论证见 §02-§06。

## 7.1 存储层：DDL + 核心 SQL 模板

### 7.1.1 双时态边表 DDL（直接可用）

```sql
PRAGMA journal_mode = WAL;
CREATE TABLE entities (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, entity_type TEXT NOT NULL,
  summary TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT, source TEXT, content_hash TEXT, metadata TEXT, embedding BLOB);
CREATE TABLE edges (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES entities(id),
  target_id TEXT NOT NULL REFERENCES entities(id), relation TEXT NOT NULL, fact TEXT,
  valid_from TEXT, valid_until TEXT, recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  confidence REAL DEFAULT 1.0, episode_id TEXT, content_hash TEXT, metadata TEXT);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_relation ON edges(relation);
CREATE INDEX idx_edges_valid ON edges(valid_from, valid_until);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_hash ON entities(content_hash);
-- 失效语义（不删行保历史）：
-- UPDATE edges SET valid_until = :new_valid WHERE id = :old AND valid_until IS NULL;
```

### 7.1.2 多跳遍历（双向、可变深度、防环）

```sql
WITH RECURSIVE traversal(entity_id, depth) AS (
  SELECT ?1, 0
  UNION
  SELECT CASE WHEN e.source_id = t.entity_id THEN e.target_id ELSE e.source_id END,
         t.depth + 1
  FROM traversal t JOIN edges e
    ON (e.source_id = t.entity_id OR e.target_id = t.entity_id)
  WHERE t.depth < ?2 AND e.valid_until IS NULL
) SELECT DISTINCT ent.*, t.depth FROM traversal t
  JOIN entities ent ON ent.id = t.entity_id ORDER BY t.depth;
```

### 7.1.3 加权最短路径（sqlite.org 论坛 Keith Medcalf 模板）

```sql
WITH RECURSIVE paths(endAt, visited, hops, dist) AS (
  SELECT :start, '/' || :start || '/', 0, 0
  UNION ALL
  SELECT toNode, visited || toNode || '/', hops+1, dist + distance
  FROM paths, edges
  WHERE fromNode = endAt
    AND instr(visited, '/' || toNode || '/') = 0
    AND instr(visited, '/' || :end || '/') = 0   -- 到达即停
    AND hops < :maxHops AND dist < :maxDist
  ORDER BY dist                                   -- 优先队列
) SELECT * FROM paths WHERE endAt = :end ORDER BY dist LIMIT 1;
```

注：递归 CTE 无剪枝（穷举），上界三重封顶必须保留；更优解用应用层 Dijkstra。

### 7.1.4 孤岛检测（SQL 版，≤1 万节点；更大用 graphology）

```sql
WITH RECURSIVE reach(start, node) AS (
  SELECT id, id FROM entities
  UNION
  SELECT r.start, CASE WHEN e.source_id = r.node THEN e.target_id ELSE e.source_id END
  FROM reach r JOIN edges e ON (e.source_id = r.node OR e.target_id = r.node)
  WHERE e.valid_until IS NULL
), comp AS (SELECT start, MIN(node) AS comp_id FROM reach GROUP BY start)
SELECT comp_id, COUNT(*) AS size FROM comp GROUP BY comp_id ORDER BY size DESC;
-- size 小于阈值的分量 = 孤岛；注意全图 reach 是 O(V·E)
```

## 7.2 图算法层：graphology 片段

```ts
import Graph from 'graphology';
import { connectedComponents } from 'graphology-components';
// import louvain from 'graphology-communities-louvain';   // 需要社区检测时

const g = new Graph({ multi: false, type: 'undirected' });
for (const { source_id, target_id, relation } of db.prepare(
  'SELECT source_id, target_id, relation FROM edges WHERE valid_until IS NULL').all()) {
  g.mergeNode(source_id); g.mergeNode(target_id);
  g.mergeEdge(source_id, target_id, { relation });   // 幂等，直接吃边表
}
const comps = connectedComponents(g);                 // 弱连通分量（数组的数组）
const islands = comps.filter(c => c.length < 3);      // 孤岛判定
```

## 7.3 向量层：sqlite-vec 集成（实体去重 KNN）

```ts
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
const db = new Database('kg.db'); sqliteVec.load(db);
db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS entity_vec USING vec0(embedding float[384])`);
const dup = db.prepare(
  `SELECT rowid, distance FROM entity_vec WHERE embedding MATCH ? ORDER BY distance LIMIT 5`
).all(queryEmb.buffer);
// distance < 阈值（自标定）→ 判定重复候选，进去重漏斗
```

## 7.4 校验层：SHACL-in-TS 最小集成

```ts
// pnpm add rdf-validate-shacl @zazuko/env-node
import rdf from '@zazuko/env-node';
import SHACLValidator from 'rdf-validate-shacl';

const shapes = await rdf.dataset().import(rdf.fromFile('shapes.ttl'));
const validator = new SHACLValidator(shapes);          // shapes 复用；勿设 maxErrors（跨调用累计 bug）

function toQuads(f: any, row: { id: string; type: string; name: string; founded: number }) {
  const id = f.namedNode(`https://example.org/kg/${row.type.toLowerCase()}/${row.id}`);
  const q = (p: string, o: any) => f.quad(id, f.namedNode(p), o);
  return [
    q('http://www.w3.org/1999/02/22-rdf-syntax-ns#type', f.namedNode(`https://example.org/kg/${row.type}`)),
    q('https://example.org/kg/name', f.literal(row.name)),
    q('https://example.org/kg/founded', f.literal(String(row.founded), f.namedNode('http://www.w3.org/2001/XMLSchema#integer'))),
  ];
}
// 分批：10 万节点按 1000/批
for await (const rows of readBatch(db, 1000)) {
  const dataset = rdf.dataset();
  for (const row of rows) dataset.addAll(toQuads(rdf, row));
  const report = await validator.validate(dataset);
  if (!report.conforms) for (const r of report.results)
    console.log(r.severity?.value, r.focusNode?.value, r.path?.value, r.message.map(m => m.value));
}
```

配套 shapes.ttl 片段：
```turtle
@prefix sh: <http://www.w3.org/ns/shacl#> .
@prefix kg: <https://example.org/kg/> .
kg:SupplierShape a sh:NodeShape ;
  sh:targetClass kg:Supplier ;
  sh:property [
    sh:path kg:name ; sh:datatype xsd:string ;
    sh:minCount 1 ; sh:maxCount 1 ; sh:minLength 2 ;
    sh:severity sh:Violation ; sh:message "供应商名称必填且唯一" ; ] .
```

## 7.5 NL→图查询：推荐管线骨架

```ts
// ① enhanced schema 注入（含样本值与枚举——LangChain enhanced_schema 同构）
const schemaBlock = renderSchema({
  nodes: [{ label: 'Supplier', props: { id: 'TEXT', name: 'TEXT', level: "TEXT enum:['A','B','C']" } }],
  edges: [{ type: 'SUPPLIES', from: 'Supplier', to: 'Material' }],
  samples: { Supplier: ['三只松鼠', '安井食品'] },
});
// ② 路由：模板命中（预期 40-60% 流量）→ 槽位填充；否则 adhoc 兜底
// ③ 模板（cycle guard + depth 上限已内置，LLM 只填参数）
const TEMPLATES = {
  multiHopNeighbors: `WITH RECURSIVE reach(node, path, is_cycle) AS (
      SELECT ?, printf('[%s]', ?), 0
      UNION ALL
      SELECT e.dst, reach.path || ',' || e.dst,
             instr(reach.path || ',', e.dst || ',') > 0
      FROM edges e JOIN reach ON e.src = reach.node
      WHERE reach.is_cycle = 0) SELECT node FROM reach WHERE NOT is_cycle LIMIT ?`,
};
const args = await llm.fillParams(question, templateSchema);  // structured output，JSON schema 校验
// ④ adhoc 自由生成：prompt 约束 "Use only the relationship types and properties in the schema"
//    + few-shot store（200-500 批准对，每次检索 5-8 条）
// ⑤ 三段校验门
const stmt = parseSQLite(sql); assertReadOnly(stmt); assertRecursiveGuards(stmt);
db.exec('BEGIN'); try {
  db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
  const rows = db.prepare(sql + ' LIMIT 1000').all();
} finally { db.exec('ROLLBACK'); }
// ⑥ 空集区分：去掉过滤条件探测重跑（仍空=数据无；有数据=过滤写错→错误回灌重生成 ≤2 次）
// ⑦ 失败回退：adjacent 模板 → FTS5+vec 检索式（GraphRAG local 兜底）
```

## 7.6 映射 DSL：mappings.yaml 草图（YARRRML 语义子集 TS 化）

```yaml
version: 1
sources:                          # 数据源与映射分离（Morph-KGC 模式）
  lake: { kind: duckdb, dsn: ${LAKE_DSN} }
entityTypes:                      # 本体类型注册（等价 prefixes 的本地化）
  supplier: { idPrefix: 'urn:dsh:supplier:' }
mappings:
  supplier:                       # 13 条规则之一
    source: lake
    from: 'select * from ods_suppliers'
    subject: { template: 'urn:dsh:supplier:$(id)', type: supplier }
    fields:
      - { p: name,      o: '$(company_name)' }
      - { p: riskLevel, o: '$(level)', when: 'equal($(level), A|B|C)' }
      - { p: upperName, fn: 'toUpperCase', args: ['$(company_name)'] }   # fn → TS 注册表
      - { p: supplies,
          ref: { mapping: material, on: { left: '$(id)', right: '$(supplier_id)' } } }  # join
```

执行器输出属性图三元组（node/edge/property）而非 RDF。函数层与映射层分离（FNO 惯例）：`registry['toUpperCase'] = (s) => s.toUpperCase()`。

## 7.7 LLM 抽取：Zod 契约 + strict 后过滤

```ts
const Extracted = z.object({
  entities: z.array(z.object({
    name: z.string(), type: z.enum(allowedNodes), description: z.string() })),
  relationships: z.array(z.object({
    source: z.string(), target: z.string(), type: z.enum(allowedRels),
    description: z.string(), strength: z.number().min(1).max(10) })),
});
const parsed = Extracted.safeParse(await llm.json(prompt, Extracted.schema));
// 校验失败 → 错误清单拼回 prompt 重试 ≤2 次
// 成功后 strict 后过滤（langchainjs 版没有，必须自补）：
const validNames = new Set(parsed.entities.map(e => e.name));
const [okEnts, droppedEnts] = partition(parsed.entities, e => allowedNodes.includes(e.type));
const okRels = parsed.relationships.filter(
  r => allowedRels.includes(r.type) && validNames.has(r.source) && validNames.has(r.target));
// 白名单外实体 → 连带丢弃引用它的边
```

可抄开源 prompt 模板清单（文件路径）：
- `microsoft/graphrag: packages/graphrag/graphrag/prompts/index/extract_graph.py`（实体+关系主模板）
- 同 repo `prompts/index/extract_claims.py / community_report.py / summarize_descriptions.py`；`prompts/query/local_search_system_prompt.py` 等
- `neo4j-labs/llm-graph-builder: backend/src/shared/schema_extraction.py`（从文本/现有图生成 ontology 的 3 个 prompt）+ `frontend/src/assets/newSchema.json`
- `getzep/graphiti: graphiti_core/prompts/`：extract_nodes.py（655 行：NEGATIVE 清单 + 6 组反例 few-shot + "能否有 Wikipedia 条目"判别 + speaker 永远第一）、extract_edges.py（fact 保真规则 + ISO8601 时间抽取规则）、dedupe_nodes.py（candidate_id 协议，-1=非重复）、dedupe_edges.py（连续 idx 双列表：duplicate_facts + contradicted_facts）、snippets.py（摘要十准则，≤1000 字符）
- `HKUDS/LightRAG: lightrag/prompt.py`（JSON 模式实体关系抽取 + 合并摘要）

## 7.8 从克隆/解包仓库提取的可复用实现（本地路径）

| 仓库 | 本地路径 | 可复用资产 |
|---|---|---|
| linkml/linkml-runtime.js | `sources/linkml-runtime.js/` | ① `src/SchemaView.ts` inducedSlot/mergeSlot（~50 行 slot 继承推导语义，BSD-3）② `bin/gen-linkml.js`（50 行 schema 物化 CLI 模板）③ `test/inputs/kitchen_sink.yaml`（官方全特性测试 schema，自研工具的现成测试数据） |
| getzep/graphiti | `sources/graphiti/` | ① `graphiti_core/prompts/` 全部 prompt（语言无关可直译 TS）② `utils/maintenance/node_operations.py` + `dedup_helpers.py`（三层去重漏斗，MinHash/LSH ~300 行几乎可逐行移植）③ `community_operations.py::label_propagation`（~45 行纯算法）④ `driver/kuzu_driver.py` SCHEMA_QUERIES（DDL 蓝本）⑤ `driver/graph_operations/graph_operations.py`（~40 方法的 driver 接口模板，照此写 SQLite 实现）⑥ `search/search_config_recipes.py`（bm25/cosine/bfs × rrf/mmr/cross_encoder 组合配方） |
| zazuko/rdf-validate-shacl | `sources/rdf-validate-shacl/` | ① `packages/shacl/src/validators.ts`（28 个约束参考实现，自定义 constraintValidators 照抄接口）② `test/data/data-shapes/` W3C 官方套件 + manifest 驱动机制（可整体复用为回归测试床）③ `test/data/benchmarks/shacl-shacl/sh-sh.ttl`（直接校验自己的 shapes 文件） |
| kuzu npm（tarball） | `sources/kuzu-npm/`（含 NOTES.md） | ① kuzu.d.ts 全部 API 签名（未来与 @ladybugdb/core 的 lbug.d.ts 逐符号 diff 迁移成本）② 加载机制快照（install 期平台选择 + process.dlopen + NAPI_VERSION=6）——fork 跟进评估的结构性证据 |

## 7.9 检查清单汇总

**P0 冒烟清单**：[ ] content_hash 幂等重跑 [ ] 递归 CTE 多跳（cycle guard+depth） [ ] graphology 孤岛清单 [ ] sqlite-vec top-k [ ] 3-hop 延迟实测 [ ] rdf-validate-shacl 100 节点试校验

**NL 查询陷阱 checklist**（全条目溯源见 §4.4.2）：[ ] enhanced schema+样本值 [ ] schema 向量裁剪 [ ] cycle guard [ ] 递归项内无聚合 [ ] EXPLAIN 预检 [ ] 只读+行数+超时 [ ] 空集探测 [ ] 错误回灌 ≤2 次 [ ] 检索式兜底

**LLM 抽取成本 checklist**：[ ] 便宜模型做抽取层 [ ] 白名单约束（更短输出更少重试）[ ] chunk 实体数封顶 [ ] token 记账限额 [ ] GLiNER 兜底预筛 [ ] 增量：新文档只抽新 chunk 合并描述（LightRAG 模式）

**本体演化 checklist**：[ ] semver 映射表 [ ] schema_version 表 [ ] 迁移脚本不可变 [ ] 废弃不删除 [ ] 双写过渡 [ ] 级联重校验（限受影响类型）
