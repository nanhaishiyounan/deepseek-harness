# 第 7 章 GraphRAG 式问答与 kg-query 整合路径（硬性要求 4）

## 7.1 三路检索范式（源码级）

**Local Search**（实体锚定）：query+对话历史 → 语义匹配 KG 实体作入口点 → 相连实体/关系/covariates/社区报告 + 关联原文 text_units → 排序过滤装配进单个 context window。v2 源码（local_context.py）证实参与表：**entities / relationships / covariates / community_reports / text_units 五路**；实体 rank = **关系度数**；关系过滤两级：in-network（选中实体之间）优先，out-of-network 按 links 计数+rank/weight 排序，预算 = `top_k_relationships(10) × len(selected_entities)`。context 格式 = `-----Entities-----` 分段 + `id|entity|description|rank` 管道分隔 markdown 表，逐行累加至 token 预算（默认 8000/段）。（注意：文档说 contextual/semantic 排序，源码实际是关系度数——以源码为准。）

**Global Search**（map-reduce）：query → 指定社区层级的 community_reports → map 阶段每份报告并行产中间答案+重要性评分 → reduce 聚合。低层级报告更细但更贵；v2 新增 dynamic community selection（LLM 先给社区打相关性分再选读哪些报告）。

**DRIFT Search**（混合）：Primer 对 top-K 语义相关社区报告产初始答案+follow-up 问题 → local search 逐轮精化（每节点带 confidence 决定是否继续扩展）→ 输出按相关性排序的 QA 层级。即"global anchor + local refine"。

**HippoRAG**（arXiv 2405.14831）：离线 OpenIE（先 NER 再三元组）+ 同义边（cosine>τ）；在线：LLM 抽 query 实体 → embedding 最大节点作 **PPR 种子 → Personalized PageRank 一次迭代式传播即完成多跳检索** → 经 P 矩阵聚合回段落排序。**单步多跳胜迭代检索（IRCoT）：便宜 10-30×、快 6-13×**；2WikiMultiHopQA R@5 89.5 vs ColBERTv2 68.2。

## 7.2 text2cypher 工业四象限（Neo4j 官方指南）

核心框架：**复杂度×频率四象限**——高频复杂查询用预写参数化工具（确定性）；低频/探索性交给 Text2Query fallback。三大挑战对应解法：enhanced schema（节点/关系/属性+索引+描述+示例值+枚举注入 prompt）、term lookup 工具、大 schema 裁剪（组件描述向量检索或 n-hop 子 schema）；**validation-correction loop**：regex/CyVer 校验 + CypherQueryCorrector 按合法 schema patterns 确定性纠正关系方向，错误信息回灌 LLM 重生成。WrenAI 走 **MDL 语义层**（Git-reviewable 的 schema/metrics/joins 显式工件）——"业务感知上下文而非裸 schema"。

**LlamaIndex CypherTemplateRetriever 的「模板+LLM 仅填参」安全模式**比自由 Text2Cypher 更适合产品化——LLM 只产出受 schema 校验的参数对象，杜绝注入。

## 7.3 context 装配格式证据（arXiv 2402.11541，KBS 2025）

**反直觉结论——事实型问答中无序线性化 triples 比流畅自然语言文本更利于 LLM 理解**（literal+attention 双层验证）；**噪声、不完整、边缘相关子图仍提升表现**（裁剪不必完美）；不同 LLM 对格式偏好有差异（DeepSeek 需自测）。GraphRAG 生产实现用管道分隔表（非 JSON-LD/mermaid）与此互相印证——**不做 NL 化叙述，照抄管道表格式**：

```
-----Entities-----
id|entity|type|degree
17|张红喜|Person|12
-----Relationships-----
id|source|target|relation|evidence
5|张红喜|俄乌冲突-物流|负责处理|kb-2026-08-supply 第3段
-----Sources-----
[1] workspace/data/supply/2026-08-supply-packaging.md#第3段（原文片段 200 字）
```

要点：关系带 evidence 指回 text_units 溯源段（faithfulness）；每段独立 token 预算（2-4k）逐行累加截断；含 1-2 个噪声邻点无害，裁剪可激进。

## 7.4 小图特殊性（1093→1159 节点）

千节点不可全图 LLM 直读（GraphRAG 数据集 8.5k-15.7k 节点也走检索），但 **k-hop 邻域全读完全可行**：度数排序 + links 计数 + `top_k×种子数` 预算即够。SubgraphRAG（ICLR 2025）：检索子图大小应弹性匹配 query 与下游 LLM 能力。**global search 在千节点图的价值无文献直接回答**（GraphRAG 场景是 8.5k+ 全文语料）——社区报告 map-reduce 是否优于直接 PPR+局部需自有 benchmark 判定，故近期不做 global。

## 7.5 kg-query 四层升级路径与推荐落点

| 层级 | 内容 | 判定 |
|---|---|---|
| L0 模板路由 | 现状 9 模板编译器 | **保留**（高频问题零 LLM 成本） |
| L1 参数化模板+LLM 填参 | 意图分类路由到模板 + LLM 只产实体名/关系名/k 等受限参数（JSON schema 校验后填 SQL）；参数用 embedding top-k 匹配节点而非精确匹配 | **首选增量（近期落地）** |
| L1.5 PPR 邻域检索 | 种子=LLM 抽实体名→embedding top-k 匹配节点→PPR 传播→top-N 邻域装配 | **同 PR 落地（纯代码，无新 LLM 面）** |
| L2 受限 DSL | LLM 生成白名单 AST（match entity / traverse rel [k-hop] / filter prop / aggregate count）编译到 SQL，带 validation-correction 环（等价 CypherQueryCorrector：按合法 edge patterns 纠方向） | 中期 |
| L3 自由 Cypher/GQL | — | **不做**（SQLite 非图数据库；高频场景已被 L0/L2 覆盖，剩余低频复杂查询收益不抵幻觉风险） |

**PPR 实现（SQLite 邻接表上，~15 行核心）**：

```ts
async function ppr(seeds: NodeId[], db: Database, opts = { d: 0.85, iters: 20, topN: 40 }) {
  const adj = await loadAdjacency(db);   // 1159 节点/855 边全量载入，毫秒级
  const rank = new Float64Array(N).fill(0);
  for (const s of seeds) rank[s] = 1 / seeds.length;   // 个性化分布
  for (let i = 0; i < opts.iters; i++) {                // power iteration
    const next = new Float64Array(N).fill((1 - opts.d) / seeds.length);
    for (const [src, outs] of adj) {
      const share = opts.d * rank[src] / outs.length;
      for (const dst of outs) next[dst] += share;
    }
    rank.set(next);
  }
  return topN(rank);                                    // → k-hop 邻域装配（7.3 格式）
}
```

**度数 rank 与 in/out-network 过滤的 SQL 化**（GraphRAG local 的 SQLite 等价）：

```sql
CREATE VIEW node_degree AS
  SELECT id, (SELECT COUNT(*) FROM edges e WHERE e.src = n.id OR e.dst = n.id) AS rank FROM nodes n;
WITH seed(id) AS (VALUES (?1), (?2)),
ranked AS (
  SELECT e.src, e.dst, e.rel,
         CASE WHEN e.src IN seed AND e.dst IN seed THEN 0 ELSE 1 END AS tier,
         (SELECT COUNT(DISTINCT x.src) FROM edges x WHERE x.src = e.src AND x.src IN seed) AS links
  FROM edges e WHERE e.src IN seed OR e.dst IN seed
  ORDER BY tier, links DESC, e.weight DESC
  LIMIT :top_k * (SELECT COUNT(*) FROM seed))
SELECT * FROM ranked;
```

## 7.6 评测 checklist

- [ ] 检索层：demo 场景构造 30-50 问，人工标注 gold 实体/边，测 **hits@5 / recall@10**（HippoRAG 式），对比 L0 现状 vs L1+PPR
- [ ] 生成层：LLM-as-a-judge 成对对比（新 vs 旧 kg-query），四指标 comprehensiveness/diversity/directness/empowerment 各 50 问报告胜率（GraphRAG 评测法：persona 生成自适应问题；其论文结论 comprehensiveness 72-83% 胜 vector RAG、directness 反超 40-53%）
- [ ] 客观验证：claim 抽取计数+多样性聚类（可简化为"答案中可溯源关系数/幻觉关系数"）
- [ ] L2 上线前：translation 准确率（生成 DSL vs 人工参考）+ execution 结果一致率（Neo4j 两程序评测）
- [ ] 回归：L0 模板不被 L1/L2 退化（路由准确率 ≥95% 才放开）
- [ ] 成本：PPR 延迟 <50ms；每次问答新增 LLM 调用 ≤1 次（意图分类可与主调用合并）
