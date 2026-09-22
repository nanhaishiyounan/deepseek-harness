# 第 6 章 LLM 抽取范式与实体链接/共指消解

## 6.1 学术脉络：本体学习从 2005 到 LLM 时代

**演进主线**：Text2Onto（2005，Cimiano & Völker）的「任务分解+概率融合」骨架 → 2024-2025 三派分化：schema 先行 / schema 共生 / schema-free。

- **Text2Onto 遗产**：把本体学习分解为术语/概念/层次/关系四个可独立评估子任务；POM（概率本体模型）让多算法输出在概率层融合。2025 综述已不直接引用它，但其骨架以问题分解形式存活——TF-IDF 概念打分→embedding 聚类，Hearst 模式→LLM few-shot 关系抽取。
- **清单证伪（诚实记录）**：KGLIB 不存在（Spear-AI/KGLIB 与 IBM/kglib 双 404，最接近的真实项目是 boschresearch/ExeKGLib，AGPL，与本体学习无关）；WhyHow.AI 已消亡（DNS 失效+org 404，遗产经 DeepWiki 镜像可考：FastAPI+MongoDB 三件套，Schema JSON（Entities/Relations/Patterns 三组件，description 即抽取 prompt 基础）→ 多 agent 管线（Entity Definition→Relationship Detection→Pattern Alignment 过滤不合法三元组→Coreference Resolution）→ 人工审核）；SKEMA 已休眠（最后 push 2024-05，license NOASSERTION，GroMEt 中间表示思想可鉴）。
- **综述 taxonomy**（arXiv 2510.20345）：Ontology Construction 分 top-down（LLM 当本体助手：CQbyCQ 把 competency questions 直转 OWL，产出与初级建模员相当）与 bottom-up（EDC Extract-Define-Canonicalize 三段式）；Extraction 分 schema-based 与 schema-free（AutoSchemaKG 同步抽 triple+归纳 schema，ATLAS 50M 文档→900M 节点/5.9B 边，"92% 语义对齐"是零人工+开放域条件下的测量）。

## 6.2 ODKE+ 生产级验证工作流（Apple，arXiv 2509.04696）——最值得抄的质量闸门

五模块：Initiator（信号检测过期/缺失 fact）→ Evidence Retriever → 混合抽取（**pattern 规则先受 KG 类型约束校验** + ontology-guided LLM）→ **Grounder（第二 LLM 对每条 triple 构造自然语言断言判 Yes/No，削减 35% 幻觉）** → Corroborator（Duckling 归一化+跨证据频次/置信度评分，91%→98.8% 精度）。生产治理：周审 2000 条随机 triple、≥95% 精度红线。

**抄四件**：① Grounder 断言式验证（独立小 LLM 判"是否被源 chunk 显式支持"）；② 类型约束前置（规则层先于 LLM）；③ 多源频次+置信度合并（冲突值择优而非全收）；④ 周期抽检+精度红线（食品领域建议起步 ≥90%）。

**GraphJudge**（EMNLP'25）：ECTD 实体为中心去噪 + KASFT（用 triple 分类任务 SFT 开源 LLM 成"图裁判"，90%+ 准确率）——当人工审核积攒 ≥数千条标注后可微调专职裁判，与 Grounder 串联双闸（异构双 LLM 降低同源幻觉）。

## 6.3 Instruct-KGC JSON 协议的 TS 落地（registry v4 → DeepSeek 抽取 prompt）

```typescript
// registry v4 → Instruct-KGC 式抽取 prompt（close-mode, JSON 协议, schema dict 增强, split_num 分批）
function buildExtractionPrompt(relations: RegistryRelation[], classes: Map<string, RegistryClass>, text: string) {
  // schema dict 模式（OneKE 验证）：类型名 → 定义 + 代表实体
  const schemaDict = Object.fromEntries(relations.map(r => {
    const d = classes.get(r.domain), g = classes.get(r.range);
    return [r.label, `${r.description}。头实体=${d.label}(${d.description}，如：${d.exampleMentions.slice(0,3).join('、')})；尾实体=${g.label}(${g.description})`];
  }));
  const instruction = "你是专门进行知识图谱三元组抽取的专家。请从input中抽取出符合schema定义的关系三元组，" +
    "不存在的关系类型返回空列表，不存在的实体返回NAN。请按照JSON字符串的格式回答，" +
    '格式为 {"关系名": [{"head": 头实体, "tail": 尾实体}], ...}。';
  return JSON.stringify({ instruction, schema: schemaDict, input: text });
}
// 双轨容错解析：先 JSON.parse，失败回退行协议 (S,R,O) 正则；NAN/空列表归一化
```

要点：按 domain Class 分组分批（等效 split_num=1~4，防大 schema 遗漏）；温度 0；每批成功样例回写 few-shot（OneKE example 注入）；训练侧负采样思想（掺入无关关系期望 NAN）可用于评测集构造。

## 6.4 实体链接标准流程与 LLM 简化

四段流程：mention detection → candidate generation（别名表/检索）→ disambiguation（上下文+类型约束）→ nil 处理（新实体）。工程铁律：**无 mention 召回基线的 EL 管线免谈；LLM EL 必须约束输出到合法 KB id**（候选集封闭式输出，禁止自由生成）。

**GLiNER**：双向 encoder 将「类型标签序列 [SEP] 输入文本」拼接编码，span 表示与类型向量匹配——一次前向同时输出 mention 边界+类型。9 变体：BiEncoderSpan（标签预计算，100+ 类型生产推荐）、UniEncoderSpanRelex（实体+关系联合，官方定位单次建 KG）、StreamingSpan。**Node 部署可行**：官方 ONNX 导出+INT8、GLiNER.js（TS 推理引擎）、@lmoe/gliner-onnx、onnxruntime-node 全链路存在。定位：GLiNER 解决 mention 段（文档腿 NER 升级），不解决跨源对齐。

**LLM 直接 ER**（MatchGPT/Peeters-Bizer）：ChatGPT 零样本实体匹配 82.35% F1，与微调 RoBERTa 竞争且 OOD 更稳；有效模式 = 两实体档案 → same/different/confidence JSON。矛盾调和：EntGPT 报朴素 prompt 大幅落后（-36% F1）——**效果强依赖 prompt 结构与输出约束，非"丢两个名字就能判"**。

## 6.5 corefers_with 升级方案（对标现状的完整设计）

**现状判定**：混合模型——同类型走「腿合并」（align.ts Jaro-Winkler≥0.9 自动 merge + 0.8-0.9 灰区 LLM 裁决 + 可逆别名）；跨源走「边加法」（cross-source.ts 只加边、无等价类、无传递闭包维护）。A-B、B-C 有边而 A-C 无边时等价性无人负责。

**升级 = 保留边为 source of truth，叠加 union-find 物化等价类**（不改边表语义，向后兼容）：

```ts
// 阶段A blocking：DeepSeek embedding 召回 + 规则 blocking（OR 并集，Splink 式 3-10 条）
for (const node of allNodes) node.embedding ??= await deepseekEmbed(profileOf(node))
// profileOf = `${类型}|${normalizeName(name)}|${来源摘要}` —— 类型必须进 profile（中文第一道防线）
const neighbors = await vectorTopK(node.embedding, { k: 20, minCos: 0.75, sameTenantOnly: true })
// 阶段B matching：LLM pairwise 判决（MatchGPT 模式）
const verdict = await llmJudge({
  system: '你是实体对齐审核员。只输出 JSON：{"same":boolean,"confidence":number,"reason":"…"}',
  user: `实体A：名称=${a.name}；类型=${typeOf(a)}；上下文=${a.context}\n实体B：…\n两者是否指同一现实实体？`,
})
if (verdict.confidence >= 0.9)      await putCorefersEdge(a, b, verdict.confidence, 'llm-align')
else if (verdict.confidence >= 0.5) await enqueueReview(a, b, verdict)  // 灰区人工队列
else if (verdict.same)              await enqueueReview(a, b, verdict)
else                                await putTombstone(a, b, 'llm-reject')
```

**等价类维护**：每次 putCorefersEdge 后 union(a,b) 并物化 kg_cluster 表（cluster_id/size/canonical_name/member_ids JSON）；拒绝/删边时该 cluster 标 stale 下次重算——cluster 是派生视图，边才是真相源。tombstone 表（pairKey 无序对主键）防被拒边在下一轮重建复活（KB leg 教训的对称修复）。查询侧 kg_query 附带 cluster 代表 id。

**置信度分层人工审核队列**：review_queue(pending|accepted|rejected, reviewer, decided_at)；KG 工作台加"对齐审核"卡片（两实体档案并排+LLM 理由+accept/reject）；accept→边转正（confidence=1、provenance=human），reject→tombstone。Splink 英国政府实战证明可消减 90% 人工校正。

**中文挑战**：别名字典是核心资产；类型约束是第一道防线（"张红喜"人名 vs 公司名——现状以 CROSS_SOURCE_EXCLUDED_TYPES 排除 Expert 回避，升级后类型硬门替代排除法）；两段式消歧显著提升准确率（情报学报实证）。

**分工建议**：corefers_with 升级用 DeepSeek embedding API + chat pairwise 判决（零运维）；GLiNER.js/onnxruntime-node 留给文档腿的零样本 mention+类型抽取升级，两处不耦合。
