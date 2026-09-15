# 05 · AI+KG 质量工程：去重、归纳、指标与本体演化

> 对应调研问题 4。证据来源：graphiti 克隆审计（代码级算法细节）、Zep 论文（转述级）、splink Fellegi-Sunter 一手文档、embedding-at-scale 工程书、Zaveri 2016 框架（KG Book 第7章开放全文）、OntoQA 论文镜像、OBO Foundry FP-004、SHACL ValidationReport 规范、EMNLP 2024 schema 构建论文。

## 5.1 实体对齐与去重

### 5.1.1 graphiti 三层去重漏斗（代码级，可直接移植 TS）

来自克隆仓库 `graphiti_core/utils/maintenance/node_operations.py::resolve_extracted_nodes` + `dedup_helpers.py`：

```
for node in extracted:
  # 层① 语义候选：name embedding 余弦 ≥0.6（NODE_DEDUP_COSINE_MIN_SCORE=0.6）取 top15（NODE_DEDUP_CANDIDATE_LIMIT=15）
  candidates = cosine_search(embed(node.name), min=0.6, top=15)   # SQLite: sqlite-vec
  # 层② 确定性（零 API 成本）：
  #   精确：normalize(name) 相等且唯一 → 命中（_promote_resolved_node 把具体类型标签晋升给泛型节点）
  #   模糊：shannon_entropy(name)>=1.5 → minhash(3-gram shingle, blake2b, 32 permutation, band=4) LSH 候选
  #         → jaccard>=0.9 → 命中；否则进 unresolved
llm_batch(unresolved, candidates) → NodeResolutions[{id, duplicate_candidate_id}]
  # 层③ LLM 批量终审（一次调用判全部）：dedupe_nodes.py prompt，输入 NEW ENTITY + EXISTING(candidate_id) + episode 上下文
  # 防御性校验：缺 id/越界 id/重复 id 一律忽略 → 保持新节点（宁漏合不误合）
```

prompt 细节（`prompts/dedupe_nodes.py`）：输出 duplicate_candidate_id（-1=非重复）；few-shot 含 "NYC"≡"New York City"、"Java 语言"≠"Java 岛" 消歧例。
**边去重**（`dedupe_edges.py::resolve_edge`）：EXISTING FACTS 与 INVALIDATION CANDIDATES 拼接连续编号双列表 → LLM 输出 duplicate_facts + contradicted_facts 索引数组（同一条可既重复又被推翻）；被矛盾的旧边 `invalid_at = 新边.valid_at`、`expired_at ??= now()`——**失效不删除**；时间窗校验（旧边已先失效→跳过；新边先失效→跳过）。已知缺陷（issue #1728）：失效候选全图搜索会误伤无关事实——移植时限定候选范围（同实体对+同关系类型）。

### 5.1.2 概率框架与阈值工程

**splink Fellegi-Sunter 框架**（可简化移植 TS）[Critical]：三参数 λ（先验匹配率）、m（匹配下观测一致概率，数据质量度量）、u（非匹配下巧合一致概率，基数度量）；**match weight (bits) = log2(m/u)**，特征独立假设下可加；weight=0 ⟺ 概率0.5。TS 移植：每特征维护 (m,u) 二元组，u 可从全库频率统计自动估出——比单阈值余弦更可解释。

**阈值经验值**（embedding-at-scale 工程书）：**0.9+ 自动合并（precision 优先）；0.5-0.7 进人工审（recall 优先）；或按业务成本函数选阈值**。0.85/0.92 无权威出处——正确做法是标注样本上画 PR 曲线自标定 [Critical 反面证据]。
blocking 清单：LSH、ANN（FAISS IVF/HNSW）、Canopy 聚类、Sorted Neighborhood、多路组合；高召回要求 blocking recall>99%。
合并策略：匹配传递性 → 连通分量/correlation clustering（尊重负证据）；主动学习选 P≈0.5 不确定对标注。

TS 库盘点：`natural`（JaroWinkler/Dice/Jaccard/Levenshtein 齐全，首选）、`fast-fuzzy`、自写余弦（<10 行）配 sqlite-vec。

## 5.2 Schema Induction（从数据归纳本体）

- 传统：Text2Onto 等 ontology learning（语料驱动，规则/统计）
- LLM 时代三段式（EMNLP 2024《Extract, Define, Canonicalize》）：抽取 → LLM 定义 schema 元素 → 规范化对齐
- AutoSchemaKG：LLM 同时抽三元组+生成/精炼 type/relation inventory
- OntoGenix（JODS 2025）：LLM 多智能体本体构建
- Graphiti 双模式：prescribed（Pydantic 预定义 ontology）vs learned（数据中涌现）——**两者可并存：31 类型预定义 + learned 候选池**
- **共同坑：提议类型过多/粒度失控**——治理：实例数下限（如 <N 个实例的候选类型不转正）+ 人工审批门禁 + 类型合并审查周期

实操建议管线：属性共现聚类 → LLM 看实例分布提议类型/关系 → 与现有 registry 对齐（embedding 相似 + LLM 判定）→ 候选池（pending 状态）→ 人工审批转正（minor 版本发布）。

## 5.3 质量指标体系

### 5.3.1 理论框架（Zaveri 2016，经 KG Book 第7章验证）

四大维度组：**Accuracy**（syntactic 语法/类型违规率、semantic 语义准确度、timeliness 时效）、**Coverage**（schema completeness / property completeness 缺失值率 / population completeness / linkability completeness 互联度）、**Coherency**（consistency 逻辑矛盾、validity 约束违规——SHACL 理论定位）、**Succinctness**（schema 冗余 + 数据冗余 + understandability 有 label 率）。每个子维度可映射为一条 SQL 可算指标。

### 5.3.2 可执行指标清单（SQL/TS 实现草图 + 阈值建议）

| # | 指标 | SQL 草图 | 门禁建议 |
|---|---|---|---|
| 1 | 属性填充率 | `SELECT node_type, COUNT(value)/COUNT(*) FROM props GROUP BY node_type` | 关键字段 <0.9 → Violation |
| 2 | 类型使用率 | `SELECT type, COUNT(*) FROM nodes GROUP BY type` | 使用率=0 的类型 → dead class Warning |
| 3 | 实例-schema 连接率 | 无类型节点占比 | >1% → Violation |
| 4 | 孤岛检测 | 递归 CTE 连通分量（见 §4.3.1 官方例）或 graphology connectedComponents | >2 个 size>50 分量 → Warning |
| 5 | 冲突检测·属性 | `SELECT node_id, prop, COUNT(DISTINCT value) FROM props GROUP BY 1,2 HAVING COUNT>1` | Violation |
| 6 | 冲突检测·关系 | 同 (src,rel,dst) 多条活跃边（valid_until IS NULL） | Violation |
| 7 | 类型互斥 | 违反 disjoint 声明表 | Violation |
| 8 | OntoQA·RR | `|P|/(|P|+|SC|)`（非继承关系数 vs subClassOf 数） | 趋势监控 |
| 9 | OntoQA·AR/IR | `|slots|/|classes|`、`|SC|/|C|` | 趋势监控 |
| 10 | 度分布/枢纽 | `SELECT node_id, COUNT(*) FROM edges GROUP BY 1 ORDER BY 2 DESC LIMIT 20` | top-1 度占比>10% → hub 风险 Warning |
| 11 | 陈旧度 | `updated_at < now()-90d` 占比 | Warning |
| 12 | 标签可读性 | 无 label/description 节点占比 | Info |

### 5.3.3 OntoQA 公式（论文镜像）

- Relationship Richness **RR = |P|/(|P|+|SC|)**（离纯分类树的距离）
- Attribute Richness **AR = |slots|/|classes|**（每类平均属性数，预示实例信息量）
- Inheritance Richness **IR = |SC|/|C|**（继承树广度）
- KB 侧：class richness（有实例类占比）、average population、dangling classes（无实例连接的类）
注意：GitHub oeg-upm/OntoQA 已 404，指标以论文镜像为准 [Important]。

### 5.3.4 质量报告 schema（SHACL ValidationReport 风格 TS 类型）

```ts
interface QualityReport {
  conforms: boolean;              // 无 Violation 级结果（对应 sh:conforms）
  generatedAt: string; schemaVersion: string; contentHash: string;
  metrics: Array<{ id: 'property-fill-rate'|'RR'|'AR'|'IR'|'islands'|'conflicts'|'...';
    value: number; threshold: number }>;
  results: Array<{
    severity: 'violation'|'warning'|'info';      // 对应 sh:Info/Warning/Violation
    focusNode?: string; path?: string; value?: string;
    source: string;                              // 检查器 id（对应 sh:sourceConstraintComponent）
    message: string; detail?: QualityReport['results'];
  }>;
}
```

门禁实践：CI 中 violation 数>0 或任一 metric 越限 → 非零退出；报告序列化存档供趋势对比。

## 5.4 本体演化与版本迁移

### 5.4.1 semver 语义映射

- 加类 / 加可选关系 / 加属性 = **minor**
- 改语义 / 改域约束（range 收窄）/ 废弃类 = **major**（deprecated 标记 + 替代 IRI + 双写过渡一个 minor 周期）
- 修描述文案 = **patch**

### 5.4.2 机制设计（OBO FP-004 + db migrations 融合）

- `schema_version` 表：版本号 + 应用时间 + 本体内容 hash
- **迁移脚本不可变、只增不改**（OBO：已发布制品不可变，bug 只能发新版本）；本体定义与迁移脚本同 PR 提交
- term/类型 **永不物理删除**，只 deprecated 并保留替代链接（OBO Cell Ontology 实践）——历史数据回放依赖
- diff：本体即文本文件（TS registry/YAML），git 行级 diff 是主流实践；OWL 侧有专门 diff 工具（Java 系，不引入）
- **级联重校验**：本体变更 → 按受影响类型/关系反查实例 → 只对这些实例重跑 SHACL/ajv 校验与去重（限定候选范围，规避 graphiti #1728 全图误伤模式）
- 双写过渡：major 变更（如废弃类）发布后一个 minor 周期内新旧字段双写，迁移脚本回填，然后删旧读路径

### 5.4.3 增量构建与幂等

- 源内容 → content_hash（sha256）存 entities/edges；重跑 `WHERE content_hash = ?` 命中即跳过（幂等 upsert；graphology 侧对应 mergeNode/mergeEdge）
- 事实变更不删行（双时态 UPDATE 失效 + 插新行，全历史可回放）
- 变更波及判定：改动节点的一跳邻域 = 受影响子图，只对子图重算（连通分量/中心性等全量指标另行批处理）
- 所有写入包事务 + WAL（`PRAGMA journal_mode = WAL` 允许并发读）
- 重跑契约：「全量输入 → hash 对比 → 最小 diff 写入」，任意时刻中断重跑结果一致
- 向量表与实体表同步：embedding 变更仅 UPDATE vec0 对应 rowid

## 5.5 AI 增强综述结论（对选型的支撑）

- LLM 本体工程六任务综述（2411.09601）：**模块化是根本前提**——分而治之：每次只让 LLM 处理一个本体子任务（提议/扩展/修改/对齐），不要求一次性生成完整本体
- 边失效与去重均需「LLM 终审 + 结构化输出 + 防御性校验」三件套（graphiti 模式）
- 质量指标必须自动化进 CI（门禁），人工审查只保留「人工审队列」（0.5-0.7 相似度带）
