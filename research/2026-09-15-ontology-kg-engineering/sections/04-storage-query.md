# 04 · 存储与查询选型：Kùzu 剧变、SQLite 路线与 NL→图查询

> 对应调研问题 3。证据来源：GitHub 归档横幅页面实测、npm registry 一手元数据、gdotv 全景文全文、FalkorDB 官方迁移博客、cognee 站内 issue 检索、SQLite 官方文档/论坛全文、CongraphDB 基准、dev.to ctxgraph 实证文、graphology/sqlite-vec 官方文档与 npm 数据、Neo4j/LangChain/dbt/memgraph 基准与工程文、kuzu tarball 解包审计。

## 4.1 事件背景：Kùzu 归档与嵌入式图库剧变 [Critical]

**事实链时间线**：
- 2025-10-10：npm kuzu 0.11.3 最后发布（18:52Z）；同日 15:32Z 标记 deprecated（"Package no longer supported"）
- 2025-10-10/11：GitHub kuzudb/kuzu 归档（横幅 "archived by the owner on Oct 11, 2025"；社区报道记 10-10——跨 UTC 日界差异，无实质影响）
- 最终版本 v0.11.3（非传闻的 0.8.x）；0.11.3 特意打包多数 extensions 供离线迁移；自 v0.11.0 起单文件 data.kz 存储
- 2025-10：Apple 完成收购（2026-02-11/12 MacRumors/BetaKit 报道 + 欧盟委员会收购备案确认，Kitchener-Waterloo 约 10 人团队 acqui-hire）
- 归档含义：repo 只读、不再发版、issue/PR 冻结（307 个 open issue 永不处理）、PyPI 同步标记归档

**npm kuzu 包审计（tarball 解包实测）**：
- unpacked ~500MB / 5747 文件（其中 349M 是测试 dataset）；五平台 prebuilt 二进制全量打入（darwin-arm64 18M / darwin-x64 18M / linux-arm64 22M / linux-x64 24M / win32-x64 13M）；**缺 win32-arm64、无 musl 变体**（Alpine 触发源码编译回退）
- engines 字段不存在（零 Node 版本约束）；`scripts.install = "node install.js"`（install 期从 tarball 内 kuzu-source 复制 JS 胶水 + 选平台二进制）
- ESM：浅层——`type: commonjs`，exports 三条件（require/import/types），index.mjs 是 re-export 转发壳
- API 面（kuzu.d.ts 全量）：Database（7 参构造：path/bufferManagerSize/enableCompression/readOnly/maxDBSize/autoCheckpoint/checkpointThreshold）、Connection（prepare/query/execute + Sync 变体/setQueryTimeout）、PreparedStatement、QueryResult（hasNext/getNext/getAll/each/all/getNumTuples/getColumnNames）——同步 API 阻塞主线程（JSDoc 自认）
- 周下载 2,770；686 dependents（存量生态）

**结论**：新引入 kuzu@0.11.3 = 引入永久冻结的 deprecated 原生依赖——安全补丁真空 + 存储格式锁死 + 平台缺口无人修。**AVOID。**

## 4.2 后继生态横评（逐一核验裁决）

| 候选 | 语言/Node binding | 状态 | 裁决 |
|---|---|---|---|
| **LadybugDB**（github.com/LadybugDB/ladybug） | C++/7 语言含 Node（`@ladybugdb/core`） | 0.20.4（2026-09-10 发布，前一天仍发 dev 版）；1.7k★；143 forks；93 贡献者 | 唯一「活跃+真 Cypher+可嵌入+官方 Node binding」选项——但 0.x，观察名单 |
| Raphtory | Rust+Python，无 Node | 活跃（Pometry 商业化） | 排除（时序图专用+无 Node） |
| Lance Graph | 前 Kùzu 成员在 LanceDB 进行中 | 无产品页 | 观察期，勿采用 |
| TuringDB | C+++Python（pip），无 Node | 180★；特色 Git 式版本化+向量 | 排除（无 Node binding） |
| FalkorDBLite | Python 变体 | 活跃 | 排除（本体是 Redis 模块=服务器型） |
| pgGraph | Postgres 扩展 | 2025 发布，CSR 邻接 | 排除（需 Postgres，违反 SQLite 约束） |
| SparrowDB | Rust+Node/Python/Ruby「图界 SQLite」 | 76★ 0.1.x；⚠️单进程独占锁，0.1.26 前并发可致不可恢复损坏 | 排除（远未成熟） |
| SurrealDB | 嵌入式多模型 | RELATE/-> 图遍历但非 openCypher、图算法弱 | 半排除 |
| Memgraph/FalkorDB/Neo4j | 服务器进程 | — | 排除（违反嵌入式约束） |

**LadybugDB 深读**：创始人 Arun Sharma（前 Facebook Dragon 负责人）；npm `@ladybugdb/core` 首发 2026-03-01，主包仅 69KB/13 文件（vs kuzu 500MB），**optionalDependencies 五平台分包**（分发架构显著优于 Kùzu）；周下载 94,554（kuzu 的 34 倍）；依赖新增 apache-arrow ^21；仍处 0.x/`--pre`（dist-tags 为 next）。2026-03 路线图已兑现：多标签节点 `CREATE (p:Person:Employee:Manager)`、ATTACH Arrow/DuckDB/Parquet 免迁移直查、原生子图。
**头部用户迁移实录（cognee，147 个 ladybug 相关 PR）**：迁移非零成本——#4474 timestamp() 大小写 Catalog exception、#4365 不支持的 Cypher 语法、#3491 get_graph_metrics 连通分量算错（3-hop 截断、丢孤立点）、#5042 为无边图伪造 SELF 边、#5031 后端间 AND/filter/方向语义不一致。
**文件级兼容疑点**：gdotv 称可直接打开 Kùzu 文件，官方迁移路径却是 EXPORT/IMPORT——未获权威确认 [Observation]。

## 4.3 SQLite 递归 CTE 路线（推荐主路线）

### 4.3.1 官方文档的图遍历模式（sqlite.org/lang_with.html 全文精读）

执行模型：初始 select 入队 → 循环取一行 → 假装递归表只有这一行跑递归 select 入队；**UNION 丢弃重复行（可防环），UNION ALL 全保留（官方建议尽量用，省内存）**。

官方三例（可直接抄）：
```sql
-- ① 无向图连通分量（官方例）
CREATE TABLE edge(aa INT, bb INT);
CREATE INDEX edge_aa ON edge(aa); CREATE INDEX edge_bb ON edge(bb);
WITH RECURSIVE nodes(x) AS (
  SELECT 59
  UNION SELECT aa FROM edge JOIN nodes ON bb=x
  UNION SELECT bb FROM edge JOIN nodes ON aa=x
) SELECT x FROM nodes;

-- ② DAG 最近 K 祖先（优先队列技巧：递归 select 内 ORDER BY ... LIMIT 20）
-- ③ BFS/DFS 控制：ORDER BY level（升序=BFS，降序=DFS）；官方建议已知上界时总是加 LIMIT
```

### 4.3.2 环检测三式与硬限制

环检测：①path 字符串 `WHERE reachable.path NOT LIKE '%/'||edge.dst||'/%'`（分隔符防 1 匹配 12）②JSON 数组 `WHERE edge.dst NOT IN (SELECT value FROM json_each(reachable.path))` ③depth 上限与 path 检查并存。**反模式：带 path 列后 UNION 行级去重永不触发（每行 path 唯一）退化为更贵的 UNION ALL——必须自担环守卫。**

**硬限制（sqlite.org 官方论坛权威论证）**：
- 递归查询是穷举搜索，**无法基于已发现路径剪枝分支** → 原生 Dijkstra 不可表达（CTE 结果集只增不能删改）
- 递归 select 内**不能再次引用递归表**（multiple references 报错）
- 出路：TEMP TABLE + 递归 TEMP TRIGGER 可直白实现 Dijkstra；或应用层循环 Dijkstra（O(NlogN)）；或 C 扩展 sqlite3-bfsvtab-ext
- 性能实测（论坛）：LIMIT 50 万行 ≈9-10s；去掉一个"冗余" join 条件慢 3 倍（9s→25s）——查询计划敏感

### 4.3.3 性能证据（1k~100k 节点）

- **CongraphDB 基准**（利益相关方自测，方向性采信）[Important]：100K 节点遍历矩阵 1-hop 1.2ms / 2-hop 4.5ms / **3-hop 12.5ms / 4-hop 35ms**；1M 节点 4-hop 超时；摄取 42K nodes/s；内存 100K→680MB；PageRank 只能应用层（5.5s/10 迭代，比图库慢 80%）
- **dev.to ctxgraph 实证**（2026-03，弃 Neo4j 转 SQLite）[Critical]：**「数万节点级别 + 正确索引 = 够用」；<50k entities 与 Neo4j 差异可忽略；遍历成本 = O(分支因子^深度) 由 max_depth 封顶、与表总大小无关**；F1 0.800（vs Graphiti+gpt-4o 0.337）、$0（vs $2-5）、2s（vs 8min）
- 明确反例边界（诚实告知）：>100k 深遍历、多写者并发（进程级写锁）、需 Cypher 模式匹配、分布式——超出 SQLite 舒适区
- 采信区间综合：**100K 节点 3-hop ≈10-30ms 量级**，覆盖本产品目标

### 4.3.4 表结构与双时态设计（生产实证融合）

```sql
CREATE TABLE entities (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, entity_type TEXT NOT NULL,
  summary TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT, source TEXT, content_hash TEXT,   -- 幂等键
  metadata TEXT, embedding BLOB);
CREATE TABLE edges (
  id TEXT PRIMARY KEY, source_id TEXT NOT NULL REFERENCES entities(id),
  target_id TEXT NOT NULL REFERENCES entities(id), relation TEXT NOT NULL, fact TEXT,
  valid_from TEXT, valid_until TEXT,                  -- 业务时间线（事实有效期）
  recorded_at TEXT NOT NULL DEFAULT (datetime('now')),
  confidence REAL DEFAULT 1.0, episode_id TEXT, content_hash TEXT, metadata TEXT);
-- 8 索引清单（没有前两个，递归 CTE 每步全表扫描）：
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_relation ON edges(relation);
CREATE INDEX idx_edges_valid ON edges(valid_from, valid_until);
CREATE INDEX idx_entities_type ON entities(entity_type);
CREATE INDEX idx_entities_hash ON entities(content_hash);
```

双时态语义（Datomic/Graphiti 同款）：失效 = `UPDATE edges SET valid_until=?1 WHERE id=?2 AND valid_until IS NULL`（不删行保历史）；当前态查询 = `valid_until IS NULL` 过滤；溯源 = episode_id/source/confidence。

### 4.3.5 graphology（应用层图算法）

- 核心包 0.26.0：周下载 114 万、431 dependents；**2 年未发新版（成熟稳定期解读，被 sigma.js 锁定依赖）**；TS 类型开箱（peer dep graphology-types）
- 标准库 22 子包：**components（connectedComponents/stronglyConnectedComponents/count/largest/cropTo）**、communities-louvain、metrics（modularity/density/centrality）、shortest-path（Dijkstra/A*）、simple-path、dag（环检测+拓扑排序）、traversal(BFS/DFS)、gexf/graphml 导入导出
- `mergeNode/mergeEdge` 幂等写入——直接吃边表 upsert 流
- 轻量替代品盘点：**levelgraph 死寂**（2 年零发布、26 dependents、LevelDB 原生栈——Hexastore 六索引论文 2008）；cytoscape 3.34.3（7 天前发布、周下载 1219 万，可视化+分析一体但重）；ngraph/@datastructures-js/graph 生态边缘（搜索零命中本身即结论）

### 4.3.6 sqlite-vec（向量检索）

- vec0 虚拟表 + KNN 语法：`WHERE embedding MATCH ? ORDER BY distance LIMIT k`；float/int8/binary；纯 C 零依赖全平台（含 WASM）；npm 0.1.9 周下载 122 万/1032 dependents（pre-v1 明示 breaking changes）
- better-sqlite3 集成三行：`import * as sqliteVec from 'sqlite-vec'; sqliteVec.load(db);`（兼容 node:sqlite 23.5+/node-sqlite3/bun:sqlite）
- 实体去重场景：暴力扫描 50-100k embeddings 内可行（10k×384 维 ≈15MB 毫秒级），超过才需要 vec0

## 4.4 NL→图查询：实践与陷阱

### 4.4.1 官方管线与基准数字

- **Neo4j Text2Cypher Guide（2026-02）七步工作流**：工具取 schema → 迭代补信息 → LLM 生成 → 校验+修正 → 执行 → 错误回灌再修正循环 → 结果回填。**决策四象限：高复杂度×高频查询必须做成预写参数化查询工具**（"will not be capable of reliably generating the same required query"）
- **基准**：Neo4j text2cypher 数据集执行评测（ExactMatch）**最好的 GPT-4o 与微调模型都只有 ~30% 匹配率**（ExactMatch 对空白敏感；翻译评测 Google BLEU 下 closed>open>微调）；错误 Top5：多余 MATCH/字段、ground truth 本身错、命名不匹配、WHERE 与属性条件混淆、节点 vs 属性混淆
- NL2SQL 侧企业悬崖：Spider 85% / BIRD 75-82%，但 Spider2.0/BIRD-Ent 掉到 39-60%；歧义基准 33%；人类天花板 93%
- **dbt 语义层基准（2026，开源可复现 dbt-labs/dbt-llm-sl-bench）**：text-to-SQL 2023→2026 从 32.7% 升至 64.5%；**语义层覆盖范围内 100%（两模型一致）且失败模式是报错说答不了，text2sql 失败=自信给错数**；LLM 还会自动建 3 个 dbt 模型
- 三类问题分流（memgraph）：**Analytical（精确值/计数/最短路/过滤分组）→ 生成式；Local（单点邻域叙事）→ pivot+expand+rank；Global（主题综合）→ 社区摘要**——聚合/计数检索式结构性答不了

### 4.4.2 陷阱清单（逐条溯源）

1. schema 不全 → 幻觉 label/property（解法：enhanced schema——元素描述+示例值+数值分布+枚举+索引；大 schema 向量裁剪 subschema 或锚点 n-hop 截取）
2. 缺 join → 幻觉 join（Fortune 500 真实事故：桥表没检索到，模型编造 join）
3. 递归 CTE 无 cycle guard → **无限循环挂死不报错**；UNION+depth 仍不安全（depth 使每行唯一，去重永不触发）
4. SQLite 特有：**递归项内禁聚合/窗口函数**（须在外层聚合）；非递归 SELECT 必须在递归 SELECT 之前；WITH RECURSIVE 需 3.8.3+；无存储过程（重试逻辑在外层应用）
5. MAX() vs ORDER BY+LIMIT 等价写法歧义；歧义 top-k 未指明排序字段
6. 写权限未隔离 → 注入诱导删库（LangChain 官方安全警告：必须窄权限只读）
7. 无行数/成本上限 → $40,000 单次扫表事故（真实案例）
8. 空结果未区分「查询错 vs 数据无」（解法：去掉过滤条件探测重跑）

### 4.4.3 生产化三段校验门（aiworkflowlab 范式，SQLite 特化）

```ts
// ① 语法 parse + 只读断言 + 递归守卫断言
const stmt = parseSQLite(sql); assertReadOnly(stmt); assertRecursiveGuards(stmt);
// ② dry-run：EXPLAIN QUERY PLAN（幻觉表/列在此报错）
db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
// ③ 只读事务 + 行数上限 + 超时，永久 ROLLBACK
db.exec('BEGIN'); try { const rows = db.prepare(sql + ' LIMIT 1000').all(); } finally { db.exec('ROLLBACK'); }
```

语义层降级方案：JSON 指标目录（name/description/sql_template/params）——论文测得语义层约 60% 幻觉消减。

### 4.4.4 推荐管线（模板优先混合架构）

**模板+槽位填充为主（确定性 100%）、自由生成受控兜底、检索式兜底语义探索**。证据：dbt SL 覆盖内 100% vs 裸 text2sql 64.5%；Neo4j 四象限把「复杂高频」判给预写工具；LlamaIndex 把 CypherTemplateRetriever 做成一等检索器；Neo4j 语义层博客 token 成本砍 81%。few-shot 三级实践：静态 SME 写死 → 向量 example store 动态检索 → 从 LLM traces 挖掘成功对回流（200-500 真实批准对，每次检索 5-8 条）。

## 4.5 存储决策总结

**留在 SQLite** [Critical，三源交叉]：① 性能够用（3-hop 10-30ms@100K）；② 递归 CTE 表达力覆盖多跳/连通分量/防环遍历，最短路用优先队列模式或应用层 Dijkstra；③ 图算法上 graphology 应用层；④ 向量 sqlite-vec、全文 FTS5 全家桶同一文件；⑤ 零新增原生依赖风险。**代价如实告知团队**：变长路径/最短路在 SQL 冗长；无原生图算法（PageRank/社区检测应用层做）；Cypher→SQL 心智转换。**触发重评的条件**（退出条款）：节点 >500k 或深度遍历延迟不可接受或需要 Cypher 模式匹配 → 届时唯一候选 LadybugDB（需先过 cognee 式迁移磨合测试）。
