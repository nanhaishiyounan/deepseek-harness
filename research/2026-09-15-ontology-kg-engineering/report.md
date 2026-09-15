# 00 · 执行摘要与阅读指南

> 调研主题：本体知识图谱工程——AI + 开源库（L4 深度调研）
> 调研日期：2026-09-14 ~ 2026-09-15 · 深度等级：Exhaustive · 覆盖 12 个深潜分支 + 4 个仓库/包审计
> 目标读者：deepseek-harness 食品行业 KB+agent 产品的 KG 工程负责人

## 0.1 调研背景与既有体系

deepseek-harness 产品已有一套自研知识图谱：TypeScript/ESM 技术栈，SQLite 存储 ~1100 节点（目标规模 1k~100k），31 类型 + 23 关系的 TS registry，双管线构建（13 条确定性映射规则 + LLM 抽取），React 画布可视化，AI 查询工具。

升级目标为「真可用」：本体工程（schema/约束/版本化）、映射层管理（本体↔数据源映射规则可管理可编辑）、AI 增强（抽取/对齐/质量评估）、质量报告、构建可重跑可增量、自然语言→图查询。

硬约束：TS/ESM、SQLite 嵌入式、无 Java、避免重基建（不引入 triple store / 独立图数据库服务，除非证据压倒性）。

五大调研问题：
1. 本体建模标准对比：LinkML vs OWL/RDFS vs SHACL vs 自定义 TS registry
2. KG 构建管线开源生态：RML 映射工具、LLM-based KG construction、映射规则管理形态
3. 存储与查询：Kùzu vs SQLite 递归 CTE vs 轻量方案；NL→图查询实践与陷阱
4. AI+KG：实体对齐/去重、schema induction、质量指标、本体演化与版本迁移
5. 务实选型输出（最重要）：「最小而正确」路径 + adopt/avoid 清单

## 0.2 十条核心结论（TL;DR）

**结论 1 · 本体 schema：自研 TS registry 保持单一事实源地位，升级而非替换。**
LinkML 工具链（generators / validator / linkml-map）全部以 Python 为中心；官方 JS runtime（npm 包 `linkml-runtime`）最后发布 2022-09-01（4 年前）、周下载仅 5 次、README 自述 EXPERIMENTAL、全库无任何校验能力（源码级审计确认，见 §2.2/§2.6）。证据压倒性地支持：TS registry 继续做单一事实源，升级其表达能力（约束/版本化/派生 JSON Schema）；LinkML 可作为可选的互操作镜像层（编译期 `gen-json-schema` / `gen-typescript`，不进运行时依赖）。

**结论 2 · 约束校验：双轨制。**
主轨 = JSON Schema + ajv（进程内、零转换成本、`additionalProperties:false` 默认闭合）；质量报告轨 = SHACL（`rdf-validate-shacl`：SHACL Core 28/28 约束组件全覆盖、纯 ESM、MIT、W3C 官方测试套件背书），其 ValidationReport（conforms/results/severity/focusNode/message）直接作为质量报告的业界标准格式。

**结论 3 · 映射层管理：声明式 YAML DSL（借鉴 YARRRML 语义子集）+ git 事实源 + 向导式 UI。**
开源世界的铁律：所有映射编辑器 UI（Matey / Karma / Mapping Workbench / Neo4j Data Importer）都以声明式文件为事实源，UI 只生成/编辑文件。Morph-KGC 等 Python 引擎的产物是 RDF 三元组，对非 RDF 团队构成「映射文件→RDF→(第二套映射)→属性图」的两跳连锁负担，不引入运行时；只借鉴 YARRRML 语义自研 TS 执行器。

**结论 4 · LLM 抽取升级为 schema 约束抽取。**
structured output + Zod 契约 + strict 后过滤（白名单外实体连同引用它的边一并丢弃——langchainjs 版 LLMGraphTransformer 恰恰缺这个端点校验，需自补）。prompt 模板直接抄三家开源：GraphRAG（`prompts/index/extract_graph.py`）、Neo4j llm-graph-builder（`schema_extraction.py`）、graphiti（extract_nodes/extract_edges/dedupe 全家桶）。抽取层用 DeepSeek 类便宜模型（实测 120 万 tokens ≈ $8.2，比 gpt-4-turbo 低一个数量级）。

**结论 5 · 存储：留在 SQLite；不引入 Kùzu（已死），也不急着上 LadybugDB（0.x）。**
Kùzu 于 2025-10-10 归档、npm 包同日 deprecated、团队被 Apple acqui-hire（2026-02 欧盟备案确认）。唯一活跃继任 LadybugDB（`@ladybugdb/core` 0.20.4，周下载 94k）仍在 0.x，头部用户 cognee 迁移实录 bug 频出（Cypher 方言差异、连通分量算错等 6+ 实录 issue）。SQLite 递归 CTE 在 10 万节点 3-hop ≈ 10-30ms（两独立来源交叉），覆盖 1k~100k 目标场景。

**结论 6 · 图算法上应用层：graphology。**
周下载 114 万、22 个标准子包（components/louvain/metrics/shortest-path/dag），直接吃边表 `mergeNode/mergeEdge` 幂等构建，孤岛检测 = `connectedComponents()` 一行。SQLite 内不硬写 PageRank/社区检测。

**结论 7 · 向量检索：sqlite-vec。**
vec0 虚拟表 + KNN MATCH 语法，npm 周下载 122 万，与 better-sqlite3 三行集成，实体去重与语义检索共用一套 embedding 基础设施。

**结论 8 · NL→图查询：模板+槽位填充优先、自由生成受控兜底。**
Neo4j 官方基准：text2cypher 执行准确率（ExactMatch）最好模型仅 ~30%；dbt 语义层基准：模板覆盖范围内 100% 且失败模式是「报错」而非「自信给错数」。推荐：确定性图查询工具集（多跳邻居/路径/社区/聚合）+ LLM 槽位填充 + 三段校验门（parse → EXPLAIN → 只读事务）兜底自由 text2SQL；FTS5 + sqlite-vec + RRF 检索式兜底语义探索。

**结论 9 · 去重三层漏斗（抄 graphiti 代码级实现）。**
① sqlite-vec 余弦候选（阈值 ≥0.6，top 15）→ ② 确定性层：精确归一化名匹配 + MinHash/LSH（3-gram、blake2b、32 permutation、band=4）Jaccard ≥0.9、Shannon 熵 ≥1.5 门控（零 API 成本）→ ③ LLM 批量终审（结构化输出 + 防御性校验：缺 id/越界 id 一律忽略，宁漏合不误合）。阈值必须在标注样本上画 PR 曲线自标定，忌拍脑袋 0.85/0.92（无文献背书）。

**结论 10 · 本体演化：semver + 不可变迁移脚本 + 废弃不删除。**
OBO Foundry FP-004 惯例（versionIRI 唯一且永久可解析、已发布制品不可变、bug 只能发新版本）+ db migrations 成熟模式（schema_version 表 + 顺序迁移脚本 + 回填）。加类/加可选关系 = minor；改语义/改域约束/废弃类 = major（deprecated 标记 + 替代 IRI + 双写过渡一个 minor 周期）；本体变更后按受影响类型反查实例做级联重校验。

## 0.3 adopt / avoid 总览表

| 维度 | ✅ ADOPT | ❌ AVOID（理由） |
|---|---|---|
| schema 定义 | 自研 TS registry（升级约束/版本化）+ 生成 JSON Schema；LinkML 作可选互操作镜像 | linkml-runtime npm（4 年弃更、无校验）；OWL DL 推理栈（HermiT/ELK/Pellet 全 Java，TS 无实现） |
| 约束校验 | ajv（主轨，进程内）+ rdf-validate-shacl（质量报告轨，Core 28/28） | 在 TS 里找 OWL DL 推理机（不存在成熟实现） |
| 映射层 | 自研 YAML DSL（YARRRML 语义子集：sources/subject/po/join/when/fn）+ git 事实源 + 向导 UI | Morph-KGC 子进程（产物 RDF，两跳转换负担）；RMLMapper/CARML（Java）；映射规则 DB 化（无业界先例） |
| LLM 抽取 | structured output + Zod + strict 后过滤；DeepSeek 便宜模型做抽取层；GLiNER（Apache-2.0，CPU/ONNX）做零样本 NER 兜底 | 无白名单自由抽取；贵模型全量抽取（GraphRAG gpt-4-turbo 1000 页 PDF=$120） |
| 存储 | SQLite（WAL + 递归 CTE + FTS5 + sqlite-vec + graphology 组合） | kuzu@0.11.3（deprecated + 归档 + 500MB 包）；triple store / 独立图数据库服务（违反硬约束且无必要）；LadybugDB（观察名单：0.x + cognee 迁移实录 bug） |
| 图算法 | graphology + graphology-components/louvain/metrics | levelgraph（2 年零发布、9 依赖 LevelDB 栈、26 dependents，死寂）；SQL 内硬写 PageRank（应用层做） |
| NL 查询 | 确定性工具集 + 槽位填充；三段校验门；FTS5+vec+RRF 检索兜底 | 裸 text2cypher/text2SQL 直连执行（~30% 执行准确率 + 幻觉 join + $40k 扫表事故先例） |
| 时态模型 | bi-temporal 边（valid_at/invalid_at 业务线 + created_at/expired_at 系统线，失效不删除） | 物理删除/覆盖历史边（丢失溯源与回放能力） |

## 0.4 阅读指南

- §02 本体建模标准对比 —— 调研问题 1（LinkML/OWL/SHACL/自研四路线全对比 + 决策矩阵）
- §03 KG 构建管线开源生态 —— 调研问题 2（RML 映射生态 + LLM KGC + 映射管理形态）
- §04 存储与查询选型 —— 调研问题 3（Kùzu 归档剧变 + SQLite 路线 + NL→图查询）
- §05 AI+KG 质量工程 —— 调研问题 4（去重/归纳/指标/演化）
- §06 务实选型与路线图 —— 调研问题 5（目标架构 + adopt/avoid 证据链 + P0/P1/P2 路线）
- §07 可操作产出汇总 —— 全部代码骨架/DDL/SQL/TS 片段/清单集中处
- §08 来源与证据质量 —— 全部 URL 来源表、三角化记录、矛盾清单、不确定性分级

证据分级约定（详见 §08）：**[Critical]** 多独立来源交叉的关键结论；**[Important]** 单一来源但可信（一手文档/源码），使用时注意边界；**[Observation]** 推测性判断，已标注不确定性。

# 01 · 知识网络图谱与调研方法论

## 1.1 本次调研的知识网络（数据源节点与扩展关系）

下图汇总本次 L4 调研覆盖的全部高价值数据源节点（颜色按簇、虚线为「审计/克隆」关系）。节点按调研五簇组织：A 本体建模、B 构建管线、C 存储查询、D AI+KG 质量、E 方法论锚点。

```mermaid
graph TB
    subgraph A[A 簇 · 本体建模标准]
        A1[LinkML<br/>linkml.io]
        A2[OWL/RDFS/Protege<br/>W3C]
        A3[SHACL W3C 规范]
        A4[linkml-runtime.js<br/>源码审计·实验性]
        A5[rdf-validate-shacl<br/>zip 审计·Core 28/28]
        A6[shacl-engine<br/>rdf-ext]
        A7[eyeling / EYE WASM<br/>N3 规则推理]
        A8[OBO Foundry FP-004<br/>版本化原则]
    end

    subgraph B[B 簇 · KG 构建管线]
        B1[RML / R2RML / YARRRML<br/>rml.io]
        B2[Morph-KGC<br/>物化引擎]
        B3[SPARQL-Anything<br/>facade-x 虚拟化]
        B4[Microsoft GraphRAG]
        B5[LLMGraphTransformer<br/>langchain-neo4j / langchainjs]
        B6[Neo4j llm-graph-builder<br/>FastAPI+React]
        B7[getzep/graphiti<br/>克隆审计·Python 时态KG]
        B8[GLiNER 零样本 NER]
        B9[LightRAG 增量索引]
    end

    subgraph C[C 簇 · 存储与查询]
        C1[Kùzu 已归档<br/>2025-10-10]
        C2[LadybugDB<br/>社区 fork 0.x]
        C3[SQLite 递归 CTE<br/>官方文档+论坛]
        C4[graphology 生态]
        C5[sqlite-vec 向量扩展]
        C6[levelgraph 死寂]
        C7[text2cypher / text2sql<br/>Neo4j/LangChain/dbt 基准]
        C8[ctxgraph dev.to<br/>SQLite 图实证]
    end

    subgraph D[D 簇 · AI+KG 质量]
        D1[Zaveri 2016 质量框架<br/>KG Book 第7章]
        D2[OntoQA 指标公式]
        D3[splink Fellegi-Sunter]
        D4[ER embedding/blocking<br/>工程阈值证据]
        D5[Zep 论文 arXiv 2501.13956]
    end

    subgraph E[E 簇 · 综述与论文锚点]
        E1[arXiv 2411.09601<br/>LLM 本体工程综述]
        E2[arXiv 2510.20345<br/>LLM KGC 综述]
        E3[arXiv 2507.03226<br/>Practical GraphRAG]
        E4[K-CAP 2025<br/>OWL+SHACL 协同教训]
        E5[CIKM 2025 石化 LinkML 案例]
    end

    %% 扩展关系（调研中由一个节点引出另一个）
    A1 --> A4
    A1 --> E5
    A3 --> A5
    A3 --> A6
    A3 --> E4
    A2 --> A7
    B1 --> B2
    B1 --> B3
    B4 --> B5
    B4 --> E3
    B5 --> B6
    B6 --> B7
    B7 --> D5
    B7 --> C5
    C1 --> C2
    C1 --> C3
    C3 --> C8
    C3 --> C4
    D3 --> D4
    D1 --> D2
    B4 --> E1
    E2 --> B4
```

图例：实线箭头 = 调研扩展关系（母节点引出子节点）；簇内布局无语义。共覆盖 35+ 个高价值节点，其中 4 个经过克隆/包级审计（A4、A5、B7、C1 的 npm 包）。

## 1.2 调研方法（L4 Real Deep Research 流程）

| 阶段 | 动作 | 产出 |
|---|---|---|
| SCOUT | DuckDuckGo 7 组总体查询 + 1 篇核心长文（gdotv 嵌入式图库全景） | 18 实体清单 + 时效性信号（Kùzu 归档确认） |
| MAP | 实体归簇为 A/B/C/D/E 五簇知识图谱 | 12 个深潜分支规划 |
| DIVE | 8 个 ask 网络研究分支 + 4 个 code 审计分支（克隆 3 仓库 + 1 npm tarball 静态解包） | 每分支 800-1500 字结构化发现 + 饱和判定 |
| SATURATE | 12/12 分支 saturated；末轮仅返回重复节点；矛盾分级处置 | FULLY_SATURATED |
| SYNTHESIZE | 编排器本人汇总撰写（本报告） | 九节报告 |

搜索工具链：chrome-devtools 驱动 DuckDuckGo（`https://duckduckgo.com/?q=QUERY&ia=web`），evaluate_script 提取 article/main 语义块，过滤 Sponsored 广告；平台内二次探索（GitHub 站内搜索、npm registry API、rml.io 站内、sqlite.org 论坛全文）。未使用 web_search mcp（覆盖率差）。

代表性查询词（完整清单见 metadata.json）：
- `knowledge graph ontology engineering open source 2025 LinkML SHACL`
- `kuzu archived embedded graph database LadybugDB`
- `LLM knowledge graph construction GraphRAG LLMGraphTransformer`
- `SHACL javascript typescript rdf-validate-shacl`
- `Morph-KGC RML YARRRML mapping editor UI`
- `sqlite recursive cte graph traversal graphology sqlite-vec`
- `text2cypher best practices guardrails benchmark`
- `knowledge graph quality metrics entity resolution embedding blocking`

降级路径实践：GitHub clone 超时 → codeload zip（rdf-validate-shacl 成功落盘）；arXiv 域名连接重置 → DeepWiki/alphaxiv/HF 页面交叉转述；ACM 全文 Cloudflare 拦截 → dblp + 引用 snippet 三角确认。

## 1.3 证据质量分级体系

| 级别 | 含义 | 本次示例 |
|---|---|---|
| **Critical** | ≥2 独立来源交叉验证的关键结论 | Kùzu 归档（GitHub 横幅 + npm deprecated + BetaKit/MacRumors 报道）；rdf-validate-shacl Core 全覆盖（源码 28 validator + W3C 套件测试） |
| **Important** | 单一来源但为一手证据（官方文档/源码/npm 元数据），使用时注意边界 | shacl-engine 15-26x 性能（作者自测博客，无第三方复核）；CongraphDB 遍历矩阵（利益相关方自测） |
| **Observation** | 推测性判断或未闭环线索，已显式标注不确定性 | LadybugDB 可持续性；gen-typescript 产物是否仍引用弃更 runtime 的类型（需本机实测） |

## 1.4 已知调研盲区（诚实披露）

1. arXiv 原文（2501.13956 Zep 论文、2411.09601/2510.20345 综述正文表格）因网络层连接重置未逐页读取，结论经 DeepWiki 代码解析 + 官方博客转述 + 摘要层三角确认，置信度高但非论文原文级。
2. ACM 付费墙内论文（K-CAP 2025 OWL+SHACL 协同）全文未取得，教训要点经 dblp + 两条独立引用转述。
3. 性能数字（SQLite 遍历矩阵、shacl-engine 基准）为他人环境实测，本产品 31 类型/23 关系的真实 schema 下需 POC 复测（见 §06 路线图 P0 验证清单）。
4. Windows 平台（win32-arm64）与 musl/Alpine 容器场景的原生模块行为未实测，仅收集了风险证据。

# 02 · 本体建模标准对比：LinkML vs OWL/RDFS vs SHACL vs 自研 TS registry

> 对应调研问题 1。证据来源：LinkML 官方文档站全量细读、linkml-runtime.js 源码级克隆审计、W3C OWL2/SHACL 规范、zazuko/rdf-validate-shacl zip 源码审计、rdf-ext/shacl-engine npm 一手数据、K-CAP 2025 论文（转述级）、OBO Foundry FP-004。

## 2.1 四条路线总览

| 路线 | 一句话定位 | TS 栈契合度 | 本次证据强度 |
|---|---|---|---|
| LinkML | YAML 优先建模语言，一份 schema 生成 40+ 种工件（JSON Schema/OWL/SHACL/Pydantic/TS/SQL DDL…） | 中（编译期友好，运行时死寂） | Critical（官方文档 + 源码审计） |
| OWL/RDFS | W3C 本体推理标准，开放世界假设（OWA） | 低（推理机全 Java） | Critical |
| SHACL | W3C 闭世界约束校验标准 | 高（两个活跃 JS 实现） | Critical（源码级审计） |
| 自研 TS registry | 代码即 schema，类型系统即约束 | 最高（现状） | 内部事实 + 外部对照 |

## 2.2 LinkML 深度评估

### 2.2.1 schema 定义能力（官方文档实测）

slots（字段统一抽象）+ classes + types + enums 的组合可以表达（真实官方样例）：

```yaml
slots:
  gender:
    slot_uri: schema:gender
    range: GenderType            # enum 作 range
  has_medical_history:
    range: MedicalEvent          # class 作 range
    multivalued: true
    inlined_as_list: true
  age_in_years:
    range: integer
    minimum_value: 0
    maximum_value: 999
```

关键机制清单（对 31 类型/23 关系移植直接相关的部分加粗）：
- **`is_a` 继承 + `slot_usage` 上下文细化**（协变继承：子类缩窄父 slot 的 range——对应 23 种关系的多态约束）
- **`mixin` / `mixins:`** 非树形横切复用（如 HasAliases）
- `abstract: true` 禁止直接实例化
- `required` / `multivalued` / `cardinality`（UCL 记法 `0..1`）/ `pattern` / `minimum_value` / `maximum_value`
- **`inverse`**（声明逆 slot：`parent_of inverse child_of`）
- `ifabsent` 默认值（`int(42)`、`date("2020-01-31")`）
- **`designates_type: true`** 类型判别器——多态反序列化的关键
- `identifier: true` / `key` / `tree_root`
- 组合约束 `any_of/all_of/exactly_one_of/none_of` → JSON Schema 的 anyOf/allOf/oneOf/not

### 2.2.2 generators 全景（决定性发现）

文档站列出 40+ 个 generator。与本产品相关的核心四个：
1. **`gen-json-schema`**：输出标准 JSON Schema（`additionalProperties: false` 默认严格），继承 rolled-down，非 inlined 引用退化为 string（文档自认损失校验信息）——可喂 ajv。
2. **`gen-typescript`**：生成纯 TS interface/type 声明（官方原话："no effect on the resulting transpiled javascript code"——无运行时行为）。
3. `gen-shacl` / `gen-owl`：需要 RDF 互操作时随时可出。
4. `gen-sqltable`（SQL DDL）：SQLite 方言支持无专门承诺，需实测。

### 2.2.3 校验工具链

官方 6 种策略：`linkml-validator`（Python 包+CLI）、Python 对象实例化、**JSON Schema + 外部校验器**、SPARQL 约束、ShEx/SHACL、SQL 加载查询。API 形如 `validate(instance, "personinfo.yaml", "Person")`，可组合插件（JsonschemaValidationPlugin(closed=True) 等）。官方明言 "not all LinkML constructs expressible in JSON Schema"——弱项需 Pydantic/SHACL 补。**[Critical] 官方文档背书「LinkML → JSON Schema → ajv」组合，但社区无端到端教程；落地建议 CI 里 gen 后立即 ajv compile 冒烟锁 draft 兼容性。**

### 2.2.4 JS/TS runtime：负面决定性发现（源码审计）

npm 包 `linkml-runtime`（仓库 linkml/linkml-runtime.js）实测数据：
- 3 个版本（0.1.1/0.1.2/0.2.0），**最后发布 2022-09-01（4 年前）**，周下载 5 次、月下载 32 次
- 全仓库有效逻辑仅 4 个文件约 1000 行：SchemaView.ts（752 行）、Namespaces.ts（159）、Walker.ts（95）；MetaModel.ts 4351 行是生成的纯 interface（编译后 JS 为空）
- README 自述 "Status: EXPERIMENTAL"；SchemaView 自述 "HIGHLY INCOMPLETE"
- **无任何校验能力**：源码中不存在 validator/JSON Schema 生成/数据实例校验；Walker.walk() 只在 strict 模式对「数组出现在非 multivalued 上下文」抛错
- 已知缺陷：`_index()` 空壳 TODO 导致 imports 场景 getEnum 查不到；slotRange() enum 分支疑似笔误
- ESM：无——package.json 无 "type" 字段（CommonJS），无 exports/module 字段

**结论：linkml-runtime.js 在「LinkML → JSON Schema → ajv」链路里没有任何位置；它只解决「TS 里读 LinkML schema 做元编程」的小众需求，且质量不足以生产使用。** 可抄资产：`inducedSlot`/`mergeSlot`（~50 行 slot 继承推导语义）、`bin/gen-linkml.js`（50 行 schema 物化 CLI 模板）、官方测试夹具 kitchen_sink.yaml。

### 2.2.5 版本化实践（官方 manage-releases 指南）

- schema 顶层元数据字段：`id` / `version` / `license` / `prefixes` / `imports`
- SemVer：Major=破坏性 / Minor=兼容新增 / Patch=修复；LinkML Project Copier 模板建仓（src/schema/*.yaml + Makefile + GH Action）；版本号由 uv-dynamic-versioning 从 Git tag 推导
- **关键坑（官方原话）**："the standard release mechanism does not handle package repositories for other languages, you will need to manage this part yourself"——TS 侧 npm 分发要自建 CI
- CIKM 2025 石化行业案例：1200+ class 本体 + 自研工具链（LinkML → graph DB schema/ER 图/文档/typed domain model code），证明 LinkML 管工业级大型本体，但其代码生成产物疑为 Python（论文全文被墙未确认）

### 2.2.6 linkml-map（映射层评估）

声明式模型间映射框架：TransformationSpecification（YAML）+ `populated_from`（class/slot 级映射）+ `expr`（Python 子集表达式，需 --unrestricted-eval）+ `inverse_of` + copy_directives + 可逆映射（表达式可逆时）+ 实验性 DuckDB SQL 编译后端。真实样例：

```yaml
class_derivations:
  Agent:
    is_a: Entity
    populated_from: Person
    slot_derivations:
      label: { populated_from: name }
      age:  { expr: "str({age_in_years}) + ' years'" }
```

**风险自认**："transformation data model is not yet fully stable"；expr 是 Python 语义（有 NULL/None/'NULL' 三义性 FIXME）。定位：若映射执行可离线（ETL 导入）可用 Python 子进程跑；若需 TS 运行时映射，只借鉴其 YAML 规范语义（populated_from/expr/inverse_of 语义简单可复刻）不引其运行时。

## 2.3 OWL/RDFS 路线

### 2.3.1 表达能力与推理生态

- 表达力：类层级、属性限制（someValuesAll/cardinality）、subclass/subproperty 传递推理——**开放世界假设（OWA）下的推理**
- 推理机生态：HermiT（唯一全 OWL 2 DL 一致实现，Java）、ELK（OWL 2 EL profile，Java）、Pellet（Java，AGPL）；Python Owlready2 也是打包的 Java 进程。**主流 OWL DL 推理机全部 Java，TS/JS 无成熟实现** [Critical]
- JS 侧可用替代（RDFS/规则级）：eyeling（纯 JS N3 reasoner，npm 可装，RDF-JS 互操作，TS 声明基于 @rdfjs/types）、eyereasoner（EYE 的 WASM 移植）、rdfjs-inference-engine（小型 TS 库，ingest 时物化）、OntoLogos（Rust+WASM）。**对「传递类层级闭包」需求，N3 规则物化即可覆盖；OWL DL 级推理在 TS 内无解**

### 2.3.2 OWA 工程陷阱（经典案例）

「每个 Order 必须有 Customer」——载入无 customer 的 order，OWL reasoner 说一切正常：**OWA 下缺失 ≠ 违规，minCardinality 不产生校验错误**。「必须有」类校验必须交给 SHACL（CWA）。另两条教训：OWL inconsistency ≠ SHACL violation（两个范式）；大数据上全 OWL DL 推理不可行，要 profile + 物化。

### 2.3.3 Protege 生态

桌面版是 Java 应用但自带 JRE 安装包（团队无需 Java 编码技能，只是装个桌面软件）；导出格式覆盖 Turtle/RDF-XML/OWL-XML/Manchester/JSON-LD——工程链路（n3.js/rdf-ext/jsonld.js 直接读）完全打通。WebProtégé 为 Web 协作版。对本产品：本体规模小（31 类型），Protege 的编辑 UI 价值有限，但其版本化惯例可借鉴（见 §2.6）。

## 2.4 SHACL 路线

### 2.4.1 规范能力

SHACL Core 28 个约束组件全清单（W3C 规范 §4）：值类型（class/datatype/nodeKind）、基数（minCount/maxCount）、值域（min/max Exclusive/Inclusive）、字符串（minLength/maxLength/pattern）、属性对（equals/disjoint/lessThan/lessThanOrEquals）、逻辑（not/and/or/xone）、形状级（node/property/qualifiedValueShape+计数）、其他（closed+ignoredProperties/in/languageIn/uniqueLang/hasValue）。

目标选择器：sh:targetNode/targetClass/targetObjectsOf/targetSubjectsOf——校验入口完全数据驱动。

**ValidationReport（§3.6）是「质量报告」的现成标准格式**：`sh:conforms` 布尔 + `sh:result` 列表，每条含 focusNode/resultPath/value/sourceShape/sourceConstraintComponent/resultMessage/resultSeverity（Info/Warning/Violation 三级）——可直接序列化存 SQLite 或喂 LLM。

### 2.4.2 TS/JS 实现横评（两个候选均有源码级证据）

**rdf-validate-shacl（zazuko）**——本次 zip 源码审计结论：
- MIT；0.6.5（2025-05-30 发布），master 最新提交 2025-10-28；TypeScript 源码 1851 行，纯 ESM（"type": "module"）
- **SHACL Core 28/28 全覆盖**（validators.ts 导出 28 个 validator，源码级核对）；SHACL-SPARQL 不支持（README Limitations 明示）
- 补偿机制：①自定义约束扩展点 `constraintValidators`（node/property/generic 三型）②property path 全 6 种语法 ③target 全 5 种 + sh:class 子类推理 ④OWL imports 支持
- 测试基础 = W3C 官方 data-shapes 套件（113 个 core 用例仅 skip 2 个，系规范自身争议）；CI 含 Bencher 持续性能基准（性能回归纳入评审）；自带 sh-sh.ttl 可自检 shapes 文件
- 性能证据：仓库基准负载 8.1MB / 61,329 三元组（欧盟 MARS 农产品数据）——10 万节点分批校验在量级内
- 复用陷阱：同一实例多次 validate() 时 violationsCount 不重置，配 maxErrors 会跨调用累计——分批复用实例时勿设 maxErrors；maxNodeChecks 默认 50（防循环引用栈溢出）
- 依赖树 11 个全部 RDFJS 官方小栈（不依赖 rdf-ext 本体/n3/SPARQL 引擎）

**shacl-engine（rdf-ext）**：
- MIT；1.1.2（2026-06-30 发布，维护更活跃）；**覆盖超过前者：SHACL Core + SHACL-SPARQL 约束 + SPARQL-based Targets**；代价是拉入 Comunica SPARQL 引擎
- 性能声称 15-26x 快（shacl-shacl 自检 15x、真实数据 26x）——**作者自测博客基准，无第三方复核 [Important]**；59 stars vs rdf-validate-shacl 540 使用者，性能与生态惯性未收敛

**选型**：数据校验只需 SHACL Core（JSON 字段级验证正是 minCount/datatype/pattern/range/in 主场）→ rdf-validate-shacl（依赖面小、可自写 validator、Core 全覆盖、W3C 套件背书）；需要 SPARQL 表达的跨节点规则或吞吐硬指标 → shacl-engine。二者 DatasetCore 接口同构，可先上前者后平替。**[Critical]**

### 2.4.3 JSON 数据进 SHACL 的最小路径（审计产出）

不必上 JSON-LD 全家桶——手工构 Dataset 更可控（十几行映射代码）：

```ts
import rdf from '@zazuko/env-node'
import SHACLValidator from 'rdf-validate-shacl'

const shapes = await rdf.dataset().import(rdf.fromFile('shapes.ttl'))
const validator = new SHACLValidator(shapes)   // shapes 复用；勿设 maxErrors

function toQuads(f, row) {  // sqlite JSON 节点 → RDF quads，字段→谓词映射可控
  const id = f.namedNode(`https://example.org/kg/company/${row.id}`)
  return [
    f.quad(id, f.namedNode(RDF+'type'), f.namedNode(`${ONT}${row.type}`)),
    f.quad(id, f.namedNode(`${ONT}name`), f.literal(String(row.name))),
    f.quad(id, f.namedNode(`${ONT}founded`), f.literal(String(row.founded), f.namedNode(XSD+'integer'))),
  ]
}
for await (const rows of readBatch(db, 1000)) {   // 10 万节点按 1000/批
  const dataset = rdf.dataset()
  for (const row of rows) dataset.addAll(toQuads(rdf, row))
  const report = await validator.validate(dataset)
  if (!report.conforms) for (const r of report.results)
    console.log(r.focusNode?.value, r.path?.value, r.sourceConstraintComponent?.value, r.message.map(m=>m.value))
}
```

### 2.4.4 K-CAP 2025 论文教训（OWL+SHACL 协同开发）

UPM 本体工程组，铁路运输领域真实案例（论文全文被 Cloudflare 拦截，核心教训经 dblp + 两条独立引用转述 [Important]）：方法论 = OWL 领域建模 + SKOS 术语 + SHACL 校验跟随；分工原则 = **「是否需要本体推理 vs 是否需要数据校验」决定约束放哪边**；生产中 OWL 本体版本与 SHACL shapes 版本必须协同演进（版本漂移 = 校验失效）。

## 2.5 自研 TS registry 路线（现状升级）

既有优势：代码即 schema（31 类型+23 关系已是 TS 类型）、零跨语言边界、与 sqlite 存储层同进程。短板与升级方向（对照标准路线得出）：
1. 约束表达不足（类型系统管不住运行时数据）→ 补 JSON Schema 派生 + ajv 校验
2. 无版本化机制 → 补 semver + schema_version 表 + 不可变迁移脚本（§5.4）
3. 无标准校验报告 → 采用 SHACL ValidationReport 结构作为质量报告格式
4. 无跨系统互操作 → 可选：LinkML 镜像（编译期生成，不进运行时）

## 2.6 版本化惯例对照

| 惯例 | 内容 | 来源 |
|---|---|---|
| OBO FP-004 | 每 release 唯一 versionIRI 且永久可解析；**已发布制品不可变**（bug 只能发新版）；版本号 ISO-8601 日期优先或 semver | obofoundry.org/principles/fp-004-versioning.html |
| OBO 术语管理 | term IRI **永不删除**，只 deprecated 并保留逻辑链接 | Cell Ontology 实践 |
| LinkML | semver（Major=breaking/Minor=兼容新增/Patch=修复）+ 版本从 git tag 推导 + release notes 替代 CHANGELOG | linkml.io manage-releases |
| OWL | owl:versionInfo（注释性）+ owl:versionIRI（规范引用）+ owl:backwardCompatibleWith | W3C OWL wiki |
| db migrations（类比） | version 表记录已应用版本；迁移文件不可变、只增不改 | 工程惯例 |

**统一建议**：本体 YAML/TS registry 与迁移脚本同 PR 提交；release 不可变；diff 用文本 diff（本体即文本文件 + Git 管理是主流实践）。

## 2.7 四路线决策矩阵与结论

| 维度 | LinkML | OWL/RDFS | SHACL | 自研 TS registry |
|---|---|---|---|---|
| schema 表达力 | 强（slot/继承/mixin/组合约束） | 最强（推理级） | 中（校验导向） | 强（TS 类型 + 自由元数据） |
| 约束表达 | 中（JSON Schema 有损映射） | OWA 下不能做「必须有」 | **最强（CWA 28 组件）** | 自定义（zod/JSON Schema） |
| 版本化 | 官方 semver 指南 | OBO/OWL 惯例成熟 | 随本体 | 需自建（= 空白） |
| 校验工具链（TS 内） | gen-json-schema → ajv（两跳） | 无推理机 | **rdf-validate-shacl / shacl-engine 直接可用** | ajv 直接用 |
| TS 运行时 | linkml-runtime 死寂 | 无 | 有（两个实现） | 原生 |
| 学习/维护成本 | 中（YAML+Python 工具链） | 高（语义网概念栈） | 中（RDF 转换层） | **零（已拥有）** |
| 锁死风险 | 中（Python 生态绑定） | 高 | 低 | 低 |

**最终立场**：
1. **主路线：升级自研 TS registry**——加三样东西：派生 JSON Schema（ajv 运行时校验）、semver+迁移机制、SHACL 风格质量报告。
2. **辅助路线：rdf-validate-shacl 做标准校验与质量报告**（当质量报告要作为数据资产给客户/审计/LLM 消费时，ValidationReport 是现成标准格式）。
3. **可选路线：LinkML 作互操作镜像**（schema 单一事实源仍在 TS registry；若未来需要与生医/工业本体生态交换或要用其 40+ generators，再以编译期生成方式引入，不进运行时）。
4. **明确不走：OWL DL 推理**（无 TS 实现，Java 依赖违反硬约束；RDFS 级传递闭包用 N3 规则物化或自写 20 行 TS 可覆盖）。

# 03 · KG 构建管线开源生态：声明式映射 + LLM 抽取

> 对应调研问题 2。证据来源：rml.io 规范与 YARRRML 教程全量细读、Morph-KGC README/配置样例、SPARQL-Anything 文档、awesome-kgc-tools 工具矩阵、Microsoft GraphRAG 官方文档与 prompt 源码路径、langchainjs API 文档、Neo4j llm-graph-builder 仓库、GLiNER/LightRAG、三篇 arXiv 综述（摘要级+转述）。

## 3.1 声明式映射标准：R2RML → RML → YARRRML

### 3.1.1 标准演进与表达力

- **R2RML**（W3C，关系库→RDF）：subject map / predicate-object map / join 三基石。
- **RML**（W3C KGC 社区组超集）：`rr:logicalTable → rml:logicalSource`（CSV/XML/JSON/HTML 任意源）、`rr:column → rml:reference`（按 referenceFormulation 的合法表达式）、新增 `rml:referenceFormulation` 与 `rml:iterator`（如 `$.episodes[*]`）。新 RML 拆六模块：Core / IO / **FNML（函数式变换，FNO 函数本体）** / CC（集合容器）等——**函数层与映射层分离是标准做法**。
- 迁移兼容性实测数据（CEUR 论文）：R2RML → RML-Core 覆盖 98.7%。
- **YARRRML**：人类可读 YAML 映射语法，官方教程样例（可直接当 TS 版 DSL 蓝本）：

```yaml
prefixes:
  ex: http://www.example.com/
  e: http://myontology.com/
mappings:
  people:
    sources:
      - ['people.csv~csv']          # access~referenceFormulation 短写
    s: ex:$(id)                     # subject 模板，$(col) 取值
    po:
      - [a, schema:Person]
      - [schema:givenName, $(firstname)]
      - p: e:debutEpisode
        o: { value: $(debut episode), datatype: xsd:integer }
      - p: dbo:hairColor
        o:
          function: grel:toUpperCase   # FNO 函数变换
          parameters:
            - [grel:valueParameter, $(hair color)]
          language: en
      - p: e:appearsIn              # 跨源 JOIN
        o:
          mapping: episode          # 引用另一 mapping 的 subject
          condition:
            function: equal
            parameters:
              - [str1, $(debut episode), s]   # s=取自主体侧
              - [str2, $(number), o]          # o=取自客体侧
  episode:
    sources:
      - [episodes.json~jsonpath, "$.episodes[*]"]
    s: ex:episode_$(number)
    po:
      - [a, schema:Episode]
      - [schema:title, $(title)]
```

语义元素清单：`prefixes / mappings/<id> / sources(access, referenceFormulation, iterator) / s / po / condition(fn+join) / graphs`。**13 条 TS 硬编码规则 ≙ 13 个 mappings 条目，一比一迁移路径清晰。**

工具链事实：`@rmlio/yarrrml-parser`（npm 包 v1.10.0，YARRRML→RML 的 JS 解析器——**YARRRML 解析器本身就是 JS/TS 生态**）；RMLMapper（Java v7.3.3）；官方样例库 github.com/RMLio/example-yarrrml-rules（含多条件 join 用例）。

### 3.1.2 Morph-KGC（物化引擎代表）

- 定位：R2RML+RML+RML-star 物化引擎（materializer），pandas 底座，mapping partitions 降执行时间与内存
- 数据源矩阵：RDB（MySQL/PostgreSQL/Oracle/MSSQL/MariaDB/**SQLite**）、表格（CSV/TSV/Excel/Parquet/Feather/ORC…）、JSON/XML、Python dict/DataFrame、Databricks/Snowflake、属性图库 Neo4j/**Kùzu（仅作输入源）**
- 配置样例（数据源与映射分离、INI 多节）：

```ini
[CONFIGURATION]
output_file=knowledge-graph.nt
output_format=N-TRIPLES
mapping_partitioning=PARTIAL-AGGREGATIONS
[DataSource1]
mappings=/path/to/mapping_file.rml.ttl
db_url=mysql+pymysql://user:password@localhost:3306/db_name
```

- CLI：`morph_kgc config.ini`；Python API：`materialize()` → RDFLib Graph
- 2025 SSW 期刊论文：优化执行计划（语言无关关系代数优化）
- **局限（对本产品的核心否决点）：产物是 RDF 三元组不是属性图**——若终点是 Neo4j/Kùzu 属性图需经 n10s 等二次导入（第二套映射配置），两跳转换 + Labs 实验级插件维护风险。Python-only、增量/流式不支持（全量重跑；流式要换 RMLStreamer/Flink）

### 3.1.3 SPARQL-Anything（虚拟化代表）

- 仓库已改名 github.com/SPARQL-Anything/sparql.anything（旧地址 404）；Java 实现
- 架构：**虚拟化（不物化）**。Façade-X 极简元模型（containers + literals 两类元素）把 14+ 格式（CSV/JSON/XML/HTML/YAML/Markdown/Binary/Archive/Word/Slides…）按原样映射成 RDF Dataset，查询期经 magic `SERVICE <x-sparql-anything:location=...>` 即时构建
- Façade-X 已进 W3C 社区组规范化（w3c-facade-x.github.io，2026-07 更新）
- **对 TS 团队的价值：架构思想可移植**——「把任意格式先归一到极简中间模型（容器+字面量+槽位）再查」，即「先投影成统一 JSON 树、再套映射规则」；直接使用价值低（Java/GPL 生态）

### 3.1.4 映射规则管理的业界形态（问题核心）

awesome-kgc-tools 官方矩阵盘点结论：**开源世界声明式文件是主流、编辑器 UI 是补充**：
- Materializers 14 个：Morph-KGC / RMLMapper(Java) / CARML(Java) / SDM-RDFizer(Python) / **RocketRML(JavaScript！)** / RMLStreamer(Flink 流式) / Chimera / Morph-xR2RML（MongoDB 24 亿三元组实战）等；Virtualizer 仅 1 个：Ontop（R2RML SPARQL→SQL 查询期翻译）
- **Mapping Editors 11 个**：Matey（YARRRML web 编辑器，浏览器内即见 RDF）、Mapping Workbench（协作 IDE：概念映射→技术映射→SPARQL/SHACL 质量验证的测试驱动方法论）、Karma（USC ISI 可视化编辑器，学界最著名）、RMLEditor、Mapeathor（Excel→R2RML）、MetaConfigurator（JSON Schema 编辑 + LLM 辅助生成 RML）、RML Playground 等
- Generators：**OWL2YARRRML**（从本体生成映射模板——与「本体↔字段映射自动起草」直接同构）、Spread2RML（从杂乱表格建议映射）
- 属性图侧向导先例：**Neo4j Data Importer**（data-importer.neo4j.io）：连库→上传 CSV→建 label→列映射到类型化属性→设唯一 ID→run，无代码
- **关键铁律：没有一个开源编辑器能脱离底层声明式文件独立存在——UI 生成/编辑 YAML 或 RML，文件才是事实源；映射文件天然纯文本，git 管理是社区既定实践，无任何「映射规则 DB 化」工具**
- JSON-LD @context 的适用边界：只做术语别名+命名空间+@type 标注，**没有**跨源 join/条件过滤/迭代器/函数变换——适合输出序列化层的术语规范化，不能当映射层；两者可叠加

### 3.1.5 TS 集成边界结论

生态并非全 Python/Java：RocketRML 证明「非 Java 实现 RML 语义」可行、yarrrml-parser 是 npm 包。**自研执行器 + YARRRML 语义子集是性价比最优解**（13 条规则规模远小于通用引擎）。若最终消费方是 RDF/triple store 才值得子进程集成 Morph-KGC。

## 3.2 LLM-based KG Construction

### 3.2.1 Microsoft GraphRAG（MIT，35,974★，Python v2 monorepo）

- **架构**：实体/关系/claims 抽取 → Leiden 社区检测 → 多层级社区报告 → 向量嵌入，输出 Parquet。local 检索 = embedding 找入口实体后图扩展单次 LLM 调用；global = 社区报告 map-reduce
- **可抄 prompt 全文路径**（v2）：`packages/graphrag/graphrag/prompts/index/extract_graph.py`（GRAPH_EXTRACTION_PROMPT：`{entity_types}` 占位符注入类型白名单；输出定界文本格式 `("entity"<|>名称<|>类型<|>描述)`；内置 2 个 few-shot）；同目录 extract_claims.py / community_report.py / summarize_descriptions.py；query 侧在 prompts/query/（local/global map/global reduce/drift）；prompt_tune 模块可自动生成领域定制 prompt
- **成本实测**（多源）：local 单查询 ~11 次 LLM 调用 ≈11,500 tokens；global 默认 12 次调用 ≈150K tokens/$0.80/查询（gpt-4o）；官方 discussion #440：demo 数据集 gpt-4-turbo $5、1000 页 PDF 全流程 $120；**DeepSeek 索引 120 万 tokens（100 万词）仅 $8.20**——抽取层用便宜模型成本可低一个数量级 [Critical]
- **TS port：无权威实现**（npm 仅零散小包）；Neo4j GraphAcademy 有 TS MCP 课程——TS 需自研抽取层

### 3.2.2 LLMGraphTransformer（schema 约束抽取样板）

- Python 版（langchain-neo4j）API：`allowed_nodes: List[str]`、`allowed_relationships: List[str] | List[Tuple[str,str,str]]`（**三元组可约束关系端点类型**）、`strict_mode=True`（抽取后强制过滤）、`node_properties/relationship_properties`、`ignore_tool_usage` 降级、`additional_instructions`
- **langchainjs 对等实现存在**：`@langchain/community`（v1.1.27+）`experimental/graph_transformers/llm/LLMGraphTransformer`，方法 `convertToGraphDocuments()`；**差异：allowedRelationships 无三元组端点约束，但有 JS 特有 fallbackRelationshipType——用它时需自行补端点类型校验** [Critical]

### 3.2.3 Neo4j llm-graph-builder（Apache-2.0，5,249★）

- 架构：Python FastAPI 后端 + React/TS 前端（非纯 TS）；Neo4j≥5.23
- **自定义 ontology 机制（映射管理 UI 先例）**：schema 表示为三元组字符串数组 `"NodeType1-<RELATIONSHIP_TYPE>->NodeType2"`；三种来源 = 预定义 schema 库（frontend/src/assets/newSchema.json）/ 从现有图加载合并 / **从样例文本自动生成**（backend/src/shared/schema_extraction.py 三个 prompt 全文开源，Pydantic + with_structured_output(function_calling)）
- 支持 11 家 LLM（含 **DeepSeek** 与任意 OpenAI 兼容 baseURL）；`TRACK_USER_USAGE=true` 按 用户×连接 记录日/月 token 消耗与限额（成本记账先例）

### 3.2.4 schema 约束抽取通用工程模式

1. schema 表示抄 llm-graph-builder 三元组字符串数组
2. Zod 输出契约：entities（name/type enum/description）+ relationships（source/target/type enum/description/strength）
3. structured outputs API（response_format/json_schema）或 langchainjs `withStructuredOutput`；`schema.safeParse()` 校验
4. 校验失败 → Zod 错误清单拼回 prompt 重试（≤2 次）→ 成功后 **strict 后过滤**：丢弃白名单外实体时连带丢弃引用它的边
5. prompt 主体抄 GraphRAG：entity_types 占位符 + few-shot + 明确输出格式

### 3.2.5 小模型与增量路线

- **GLiNER**（Apache-2.0，3,648★）：零样本 NER 家族——Uni-encoder（~50 类型）/ Bi-encoder（百万级标签）/ RelEx（NER+关系联合）/ Decoder（开放类型）/ StreamingSpan（流式）；CPU/INT8/ONNX 可部署。作为「小模型 NER 兜底层」免费本地化
- **LightRAG**（MIT，39,642★，EMNLP2025）：双层（KG+向量）架构，不用社区报告与多跳推理 → 调用数远低于 GraphRAG；**"Incremental Updates & Selective Deletion" 是官方 README 特性**（新文档增量插入、删除时清理关联）；成本旋钮：EXTRACT 角色用非思考便宜模型、`ENTITY_EXTRACTION_USE_JSON`、MAX_*_TOKENS 封顶；运维教训：模型 <50 tok/s 会超时、参考文献类 chunk 实体数爆炸需封顶
- SAP 论文（2507.03226）：**dependency parsing 构造 KG 达到 LLM 抽取性能的 94%（61.87% vs 65.83%）且成本大降**——经典 NLP 兜底路线有数据背书

### 3.2.6 综述关键结论

- **2411.09601**（LLM 本体工程）：六任务 = 本体建模/扩展/修改/泛化填充/对齐/实体消歧；中心论点：**模块化是 LLM 做本体工程的根本前提**；LLM 硬伤 = 幻觉 + 上下文窗口（GO 4 万类塞不进 prompt）
- **2510.20345**（LLM KGC）：三大趋势 = 静态 schema→动态归纳、管线模块化→生成式统一、符号刚性→语义自适应；**schema-based（结构/一致性）vs schema-free（开放发现）两范式**——支撑「升级为 schema 约束抽取」的路线定位
- GraphRAG v2 增量索引支持未能确认（v1 CLI 有 --method update，v2 文档未抓到对应证据）[Observation]

## 3.3 双管线融合建议（确定性映射 + LLM 抽取）

```mermaid
flowchart LR
    subgraph 数据源
        S1[结构化表<br/>lake/CSV/JSON]
        S2[非结构化文本<br/>文档/网页]
    end
    subgraph 确定性管线
        M1[mappings.yaml<br/>YARRRML 语义子集]
        M2[TS 执行器<br/>subject 模板/字段映射/join/when]
        M3[属性图三元组<br/>node/edge/property]
    end
    subgraph LLM 管线
        L1[chunk]
        L2[structured output<br/>+ Zod 契约]
        L3[strict 后过滤<br/>白名单连带丢弃]
    end
    subgraph 落库与质量
        Q1[content_hash 幂等 upsert]
        Q2[去重三层漏斗]
        Q3[SHACL/指标质量报告]
    end
    S1 --> M1 --> M2 --> M3 --> Q1
    S2 --> L1 --> L2 --> L3 --> Q1
    Q1 --> Q2 --> Q3
```

要点：两条管线汇入同一个「content_hash 幂等 upsert」入口；确定性映射输出带 source='mapping'/rule_id 溯源；LLM 抽取输出带 episode_id/confidence 溯源；质量报告区分两条管线的错误类别。

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

# 06 · 务实选型：最小而正确路径（adopt / avoid 与路线图）

> 对应调研问题 5（最重要输出）。所有判定均可回溯到 §02-§05 的证据链。

## 6.1 目标架构（升级后的 KG 工程全景）

```mermaid
flowchart TB
    subgraph Schema层[本体层 · TS registry 单一事实源]
        R1[31 类型 + 23 关系<br/>TS registry 升级版]
        R2[派生: JSON Schema<br/>gen 脚本 → ajv 运行时校验]
        R3[派生: SHACL shapes<br/>TTL → rdf-validate-shacl]
        R4[semver + schema_version 表<br/>+ 不可变迁移脚本]
        R5[可选镜像: LinkML YAML<br/>编译期 gen-*，不进运行时]
        R1 --> R2 & R3 & R5
    end

    subgraph 构建层[构建层 · 双管线 + 幂等]
        M1[mappings.yaml<br/>YARRRML 语义子集 DSL]
        M2[TS 执行器<br/>subject 模板/po/join/when/fn 注册表]
        L1[LLM 抽取<br/>structured output + Zod + strict 后过滤]
        L2[去重三层漏斗<br/>vec候选→MinHash→LLM 终审]
        M1 --> M2 & L2
        L1 --> L2
    end

    subgraph 存储层[存储层 · SQLite 单文件]
        D1[(entities/edges<br/>双时态 + content_hash)]
        D2[vec0 虚拟表<br/>sqlite-vec]
        D3[FTS5 全文]
        D4[WAL + 事务]
    end

    subgraph 查询层[查询层 · 模板优先混合]
        Q1[确定性工具集<br/>多跳/路径/聚合 SQL 模板]
        Q2[槽位填充<br/>LLM 只出 JSON 参数]
        Q3[三段校验门兜底<br/>parse→EXPLAIN→只读事务]
        Q4[检索式兜底<br/>FTS5+vec+RRF]
        Q1 & Q2 & Q3 & Q4 --> AI[AI 查询工具 / agent]
    end

    subgraph 质量层[质量层 · 门禁]
        V1[SHACL/ajv 校验]
        V2[12 项指标计算]
        V3[QualityReport<br/>SHACL 风格]
        V4[CI 门禁<br/>violation>0 → fail]
    end

    Schema层 --> 构建层 --> 存储层 --> 查询层
    存储层 --> 质量层
    质量层 -. 级联重校验 .-> 构建层
```

## 6.2 adopt / avoid 完整清单（含证据引用）

### ADOPT（8 项）

| # | 决策 | 证据链 |
|---|---|---|
| 1 | **自研 TS registry 保持 schema 单一事实源**，升级：约束元数据 → 派生 JSON Schema（ajv）+ semver/迁移机制 | §2.2.4 linkml-runtime 死寂审计；§2.7 决策矩阵 |
| 2 | **rdf-validate-shacl** 做标准约束校验与质量报告（Core 28/28、W3C 套件、Bencher CI、1851 行 TS 源码、8.1MB 基准负载） | §2.4.2 zip 源码审计 |
| 3 | **自研映射 DSL（YARRRML 语义子集）+ git 事实源 + 向导式 UI**（抄 Matey/Neo4j Data Importer 交互模式；UI 编辑 YAML 不替代它） | §3.1.4 工具矩阵铁律 |
| 4 | **schema 约束 LLM 抽取**：structured output + Zod + strict 后过滤；prompt 抄 GraphRAG/llm-graph-builder/graphiti 三家开源模板；抽取层 DeepSeek 便宜模型（120 万 tokens=$8.2） | §3.2.1-3.2.4 |
| 5 | **SQLite 全家桶**：WAL + 递归 CTE（多跳/连通分量/防环）+ FTS5 + sqlite-vec（vec0 KNN）+ 双时态边表 + content_hash 幂等 | §4.3 全节三源交叉 |
| 6 | **graphology** 应用层图算法（connectedComponents 孤岛检测 / louvain 社区 / metrics 中心性） | §4.3.5 |
| 7 | **NL 查询模板优先混合架构**：确定性工具集 + 槽位填充 + 三段校验门 + 检索式兜底 | §4.4.4（dbt 100% vs 64.5%；Neo4j 四象限） |
| 8 | **去重三层漏斗 + bi-temporal 边失效**（graphiti 代码级移植；失效不删除） | §5.1.1 克隆审计 |

### AVOID（10 项）

| # | 决策 | 证据链 |
|---|---|---|
| 1 | ❌ kuzu@0.11.3 新引入 | deprecated+归档+500MB+安全真空（§4.1 tarball 审计） |
| 2 | ❌ LadybugDB 现在生产采用（列观察名单：>500k 节点或需 Cypher 时重评；跟踪 cognee 磨合 issue 与 1.0 发布） | 0.x + next 标签 + 迁移实录 bug（§4.2） |
| 3 | ❌ OWL DL 推理栈（HermiT/ELK/Pellet 全 Java；TS 无实现；RDFS 级闭包用 N3 物化或自写 20 行） | §2.3.1 |
| 4 | ❌ linkml-runtime npm 运行时依赖（4 年弃更、周下载 5、无校验能力） | §2.2.4 源码审计 |
| 5 | ❌ Morph-KGC 子进程集成（产物 RDF 三元组，两跳转换负担；增量不支持）——除非未来终点变 triple store | §3.1.2 |
| 6 | ❌ 映射规则 DB 化 / 独立于声明式文件的 UI 事实源（无业界先例，放弃 git diff 能力） | §3.1.4 |
| 7 | ❌ 裸 text2cypher/text2SQL 直连执行（~30% 执行准确率、幻觉 join、$40k 扫表先例） | §4.4.1-4.4.2 |
| 8 | ❌ levelgraph（2 年零发布、26 dependents、LevelDB 栈死寂） | §4.3.5 |
| 9 | ❌ SQL 内硬写 PageRank/社区检测（应用层 graphology 做） | §4.3.3 |
| 10 | ❌ 拍脑袋 embedding 去重阈值（0.85/0.92 无文献背书；必须 PR 曲线自标定） | §5.1.2 反面证据 |

### 观察名单（不 adopt 不 avoid，设定重评触发器）

| 项 | 触发重评条件 |
|---|---|
| LadybugDB | 节点 >500k / 深度遍历延迟不可接受 / 需要 Cypher 模式匹配 / LadybugDB 发 1.0 且 cognee 级用户磨合收敛 |
| shacl-engine（替换 rdf-validate-shacl） | 需要SHACL-SPARQL 跨节点规则 / 吞吐成为瓶颈（15-26x 声称获独立复核时） |
| GLiNER 兜底层 | LLM 抽取成本或延迟超预算时启用（Apache-2.0，CPU/ONNX 零成本） |
| LinkML 镜像 | 需要与外部本体生态互操作 / 需要 40+ generators 时启用（编译期） |

## 6.3 分阶段路线图

### P0（本周可做的验证性小步，全部低风险）

1. 给 entities/edges 补 content_hash 列 + 幂等 upsert 重跑契约（中断重跑结果一致）
2. 写一条多跳查询递归 CTE（带 cycle guard + depth 上限 + valid_until 过滤）进现有查询工具
3. graphology connectedComponents 跑一遍现有 1100 节点 → 产出孤岛清单（第一次质量快照）
4. sqlite-vec load 进测试库 → 1000 实体名 embedding → top-k 相似查询冒烟
5. 本机 POC 复测关键性能数字：真实 schema 下 3-hop 遍历延迟（对照 §4.3.3 的 10-30ms 预期）；gen-json-schema → ajv compile 冒烟（若走 LinkML 镜像）
6. rdf-validate-shacl 装进 devDependency → 手工 quads 转换 100 个节点 → 出第一份 ValidationReport

### P1（2-4 周：schema 升级 + 质量体系骨架）

1. TS registry 加约束元数据（required/range/pattern/枚举/关系端点约束）+ 派生 JSON Schema 生成器 + ajv 运行时校验入口
2. semver + schema_version 表 + 第一批迁移脚本；31 类型/23 关系打上版本基线
3. SHACL shapes 起草（先覆盖关键实体类型：名称必填唯一/认证有效期/类型互斥）+ 校验进构建尾部
4. 12 项质量指标中先落地 6 项（填充率/类型使用率/孤岛/冲突×2/陈旧度）+ QualityReport schema + CI 门禁
5. 去重层①+②（sqlite-vec 候选 + MinHash/精确归一化，零 LLM 成本）上线，LLM 终审层③先只对人工审队列预筛

### P2（4-8 周：映射 DSL + LLM 抽取升级 + NL 查询）

1. 13 条硬编码映射规则 → mappings.yaml（YARRRML 语义子集）+ TS 执行器 + fn 注册表；映射变更走 PR + 输出 diff 快照对比
2. 向导式映射 UI（选源→选类型→列映射→主键→预览 N 条物化结果——抄 Neo4j Data Importer 流程）
3. LLM 抽取切 structured output + Zod 契约 + strict 后过滤；prompt 迁移到 GraphRAG/graphiti 模板（NEGATIVE 清单 + few-shot + fact 保真规则 + 时间抽取规则）
4. 确定性查询工具集（多跳邻居/最短路径 BFS/按类型聚合/社区列举）+ LLM 槽位填充路由 + 三段校验门 + FTS5+vec+RRF 检索兜底
5. bi-temporal 边模型落地（valid/invalid + created/expired 四列 + 失效 UPDATE 语义）

## 6.4 风险登记与退出条款

| 风险 | 概率 | 缓解 | 退出条款 |
|---|---|---|---|
| SQLite 深遍历性能不达预期 | 低（100K 内三源证据） | P0 实测；depth 封顶 + 索引审计 | >500k 节点或 3-hop >500ms → 启动 LadybugDB POC（含 cognee 式磨合测试清单） |
| rdf-validate-shacl 维护停更 | 中（zazuko 商业背书 + Bencher CI 降低） | 锁版本；DatasetCore 接口与 shacl-engine 同构可平替 | 连续 6 月无发布 → 评估 shacl-engine 迁移 |
| LLM 抽取成本/质量波动 | 中 | 便宜模型 + 白名单约束 + GLiNER 兜底 + token 记账限额（抄 TRACK_USER_USAGE） | 连续两周 violation 率上升 → 回退模板抽取 |
| 自研 DSL 范围蔓延 | 中 | 只实现 YARRRML 六概念子集；新需求先问「YARRRML 怎么表达」 | 单映射规则复杂度超阈值 → 降级为 TS 代码规则并标注 TODO |
| 本体 major 变更破坏存量 | 低 | 双写过渡 + 迁移脚本回填 + 废弃不删除 | — |

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

# 08 · 来源清单、三角化与证据质量

## 8.1 来源总表（按簇）

### A 簇 · 本体建模标准

| 来源 | URL | 用途 |
|---|---|---|
| LinkML 官方文档（slots/inheritance/generators/json-schema/typescript/validating-data/manage-releases） | https://linkml.io/linkml/ | schema 能力/generators/校验/版本化一手 |
| linkml-runtime npm | https://www.npmjs.com/package/linkml-runtime | JS runtime 死寂证据 |
| linkml/linkml-runtime.js 源码（本地克隆） | https://github.com/linkml/linkml-runtime.js → sources/linkml-runtime.js/ | API 面/无校验能力/ESM 审计 |
| linkml-map | https://github.com/linkml/linkml-map | 映射规范语义 + transform 样例 |
| W3C SHACL 规范 | https://www.w3.org/TR/shacl/ | Core 28 组件/ValidationReport/targets |
| zazuko/rdf-validate-shacl（zip 落盘） | https://github.com/zazuko/rdf-validate-shacl → sources/rdf-validate-shacl/ | 源码级约束矩阵/API/维护度 |
| rdf-ext/shacl-engine | https://github.com/rdf-ext/shacl-engine | 竞品对比（SPARQL 支持/性能声称） |
| W3C OWL2 / RDFS | https://www.w3.org/TR/owl2-syntax/ | OWL 表达力 |
| eyeling / EYE | https://eyereasoner.github.io/ | TS 可用 N3 推理 |
| K-CAP 2025 OWL+SHACL 协同论文 | https://dl.acm.org/doi/full/10.1145/3731443.3771340 | 分工教训（转述级） |
| OBO Foundry FP-004 | https://obofoundry.org/principles/fp-004-versioning.html | 版本化原则 |
| CIKM 2025 石化 LinkML 案例 | https://dl.acm.org/doi/10.1145/3746252.3761514 | 工业级案例 |
| OWA 工程陷阱 | https://tesseract.academy | OWA/CWA 直觉解释 |

### B 簇 · 构建管线

| 来源 | URL | 用途 |
|---|---|---|
| YARRRML 教程 | https://rml.io/yarrrml/tutorial/getting-started/ | DSL 全量样例 |
| RML vs R2RML | https://rml.io/docs/rml/rmlvsr2rml/ | 标准演进 |
| Morph-KGC | https://github.com/morph-kgc/morph-kgc | 物化引擎/配置样例/局限 |
| Morph-KGC 2025 论文 | https://journals.sagepub.com/doi/pdf/10.3233/SSW250005 | 优化计划 |
| SPARQL-Anything | https://github.com/SPARQL-Anything/sparql.anything + https://sparql-anything.cc/ | facade-x 虚拟化 |
| awesome-kgc-tools 工具矩阵 | https://kg-construct.github.io/awesome-kgc-tools/ | 映射管理形态盘点（14+11 工具） |
| OWL2YARRRML | https://github.com/kg-construct/OWL2YARRRML | 本体→映射模板生成 |
| yarrrml-parser（npm） | https://www.npmjs.com/package/@rmlio/yarrrml-parser | JS 生态证据 |
| example-yarrrml-rules | https://github.com/RMLio/example-yarrrml-rules | 官方样例库 |
| Microsoft GraphRAG | https://microsoft.github.io/graphrag/ + https://github.com/microsoft/graphrag | 架构/prompt 路径/成本 |
| GraphRAG 成本实测 | https://baeke.info/2024/07/11/token-consumption-in-microsofts-graph-rag/ + github.com/microsoft/graphrag/discussions/440 | token 数字 |
| LLMGraphTransformer（py/js） | https://reference.langchain.com/python/langchain-neo4j/graph_transformers/llm/LLMGraphTransformer + reference.langchain.com/javascript | API/差异 |
| Neo4j llm-graph-builder | https://github.com/neo4j-labs/llm-graph-builder | schema UI 先例/prompt 路径 |
| GLiNER | https://github.com/urchade/GLiNER | 零样本 NER 兜底 |
| LightRAG | https://github.com/HKUDS/LightRAG | 增量索引/成本旋钮 |
| 综述三篇 | arXiv 2411.09601 / 2510.20345 / 2507.03226 | 方法分类/94% 降本证据 |

### C 簇 · 存储与查询

| 来源 | URL | 用途 |
|---|---|---|
| Kùzu 归档 repo | https://github.com/kuzudb/kuzu | 归档横幅/v0.11.3 |
| Apple 收购报道 | https://betakit.com/apple-strikes-deal-to-acquire-canadian-database-software-startup-kuzu/ + https://www.macrumors.com/2026/02/11/apple-acquires-new-database-app/ | acqui-hire 证据 |
| kuzu npm（tarball 落盘 + NOTES.md） | https://www.npmjs.com/package/kuzu → sources/kuzu-npm/ | deprecated/500MB/API 面/加载机制 |
| LadybugDB | https://github.com/LadybugDB/ladybug + https://ladybugdb.com + registry.npmjs.org/@ladybugdb/core | fork 现状/分包架构 |
| gdotv 全景文 | https://gdotv.com/blog/kuzu-legacy-embedded-graph-database-landscape/ | 后继生态全景 |
| FalkorDB 迁移博客 | https://www.falkordb.com/blog/kuzudb-to-falkordb-migration/ | 迁移路径 |
| cognee 迁移实录 | https://github.com/topoteretes/cognee（issues #3529/#4474/#4365/#3491/#5031/#5042） | fork 磨合 bug |
| SQLite WITH RECURSIVE 官方 | https://www.sqlite.org/lang_with.html | 图遍历官方三例 |
| SQLite 论坛最短路帖 | https://sqlite.org/forum/info/a79ba01a941c29b3 | 递归 CTE 硬限制权威论证 |
| mako.ai CTE 进阶 | https://mako.ai/guides/sqlite/common-table-expressions-advanced | 环检测三式 |
| CongraphDB 基准 | https://congraph-ai.github.io/congraphdb-benchmark/engines/sqlite/ | 遍历矩阵（利益相关标注） |
| dev.to ctxgraph | https://dev.to/rohansx/sqlite-as-a-graph-database-recursive-ctes-semantic-search-and-why-we-ditched-neo4j-1ai | SQLite 图实证 |
| graphology | https://graphology.github.io/ + https://github.com/graphology/graphology | 生态/子包/TS |
| sqlite-vec | https://github.com/asg017/sqlite-vec + https://alexgarcia.xyz/sqlite-vec/js.html | vec0/Node 集成 |
| levelgraph | https://github.com/levelgraph/levelgraph | 死寂证据 |
| Neo4j Text2Cypher Guide | https://neo4j.com/blog/genai/text2cypher-guide/ | 七步管线/四象限 |
| Neo4j text2cypher 基准 | https://neo4j.com/blog/developer/benchmarking-neo4j-text2cypher-dataset/ + .../text2cypher-model-struggles-dataset-improvements/ | ~30% 数字/错误分组 |
| LangChain GraphCypherQAChain | https://docs.langchain.com/oss/python/integrations/graphs/neo4j_cypher | 参数全表 |
| text2sql 生产指南 | https://aiworkflowlab.dev/article/text-to-sql-llm-production-schema-linking-guardrails-2026 | 路由/三段门/事故 |
| dbt 语义层基准 | https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026 | 100% vs 64.5% |
| memgraph 三类问题 | https://memgraph.com/blog/text-to-cypher-graphrag-analytical-questions | 分流框架 |
| LlamaIndex PGRetriever | https://developers.llamaindex.ai | 五检索器/模板化一等公民 |
| LLM 递归 SQL 反模式 | https://github.com/ctoth/sql-skills-plugin（common-mistakes.md） | 8 反模式 |

### D 簇 · AI+KG 质量

| 来源 | URL | 用途 |
|---|---|---|
| graphiti（本地克隆） | https://github.com/getzep/graphiti → sources/graphiti/ | 三层去重/bi-temporal/prompt 全家桶 |
| Zep 论文 | https://arxiv.org/abs/2501.13956 | 时态 KG 架构（转述级） |
| splink Fellegi-Sunter | https://moj-analytical-services.github.io/splink/topic_guides/theory/fellegi_sunter.html | m/u/λ 框架 |
| embedding-at-scale ER 章 | https://snowch.github.io/embeddings-at-scale-book/chapters/ch28_entity_resolution.html | blocking/阈值经验 |
| Zaveri 2016 框架 | https://www.emse.fr/~zimmermann/KGBook/Multifile/quality-assessment/ | 质量维度（开放全文） |
| OntoQA 论文 | https://budakarpinar.github.io/papers/ontoqa.pdf | RR/AR/IR 公式 |
| EMNLP 2024 schema 构建 | https://aclanthology.org/2024.emnlp-main.548/ | 抽取-定义-规范化三段式 |
| Graphiti issue #1728 | https://github.com/getzep/graphiti/issues/1728 | 失效全图误伤缺陷 |

## 8.2 关键结论三角化记录

| 关键结论 | 独立来源数 | 来源 |
|---|---|---|
| Kùzu 归档 + deprecated + Apple 收购 | 5 | GitHub 横幅 / npm registry / BetaKit / MacRumors / gdotv |
| SQLite 递归 CTE 在 10 万节点级可用 | 3 | sqlite.org 官方 / dev.to ctxgraph / CongraphDB（方向性） |
| rdf-validate-shacl Core 全覆盖 | 2 | 源码 28 validator / W3C data-shapes 套件测试记录 |
| linkml-runtime.js 不可生产用 | 3 | npm 元数据 / 源码审计 / 官方文档自述 |
| 模板化优于自由生成 | 4 | dbt 基准 / Neo4j 四象限 / LlamaIndex 检索器 / aiworkflowlab 路由数据 |
| 声明式文件是映射管理主流 | 2 | awesome-kgc-tools 矩阵 / rml.io 教程与样例库实践 |
| graphiti 去重/失效算法细节 | 2 | 源码克隆 / DeepWiki 代码解析 + 论文摘要转述 |

## 8.3 未解决矛盾清单（显式呈现，不隐藏）

| # | 矛盾 | 处置 |
|---|---|---|
| 1 | Kùzu 归档日期 Oct-10（社区）vs Oct-11（GitHub 横幅） | 跨 UTC 日界差异，无实质影响；npm 末版发布 10-10T18:52Z 为锚 |
| 2 | CongraphDB「100K 4-hop 35ms 且 1M 超时」vs dev.to「depth4×分支10 毫秒级」 | 规模与分支因子不同所致；采信区间 100K 3-hop ≈10-30ms；CongraphDB 为利益方自测已降权 |
| 3 | shacl-engine 15-26x 性能声称 vs rdf-validate-shacl 540 使用者的生态惯性 | 性能为作者自测无第三方复核 [Important]；接口同构可平替，选型不受阻塞 |
| 4 | text2cypher ~30%（ExactMatch）vs NL2SQL 75-85%（EX） | 评测协议不同（字符串精确匹配 vs 无序结果集）；量级结论一致：复杂输入下崩塌 |
| 5 | LadybugDB 能否直接打开 Kùzu data.kz | gdotv 称可以，官方路径是 EXPORT/IMPORT；未获权威确认 [Observation]；不影响 avoid-现采用判定 |
| 6 | GraphRAG v2 是否保留增量索引（v1 有 --method update） | 未能确认 [Observation]；不依赖（增量自建 hash 幂等） |
| 7 | embedding 去重阈值 0.85/0.92 | 无文献背书；以 0.9+/0.5-0.7 经验带 + PR 曲线自标定替代 [Critical 反面证据] |
| 8 | gen-json-schema 默认 draft 档位（$defs vs #/definitions 混见） | 文档未明示；P0 本机 ajv compile 冒烟确认 |
| 9 | graphiti 语言构成 | README 提及 TS/Go SDK 指商业平台；本框架 Python 99.3%（实测语言统计）——以代码为准 |

## 8.4 不确定性分级汇总

- **Critical（多源交叉，可直接采信）**：Kùzu 归档链、SQLite CTE 性能区间、SHACL-in-TS 可行性、模板化优先、LinkML 工具链 Python 中心、DeepSeek 成本量级、graphiti 算法细节、YARRRML 语义
- **Important（单一手源，使用注意边界）**：shacl-engine 性能数字、CongraphDB 矩阵、LadybugDB 发版节奏细节（registry 一手）、GLiNER 家族划分（README）、LightRAG 运维教训（README/issue）、OntoQA 公式（论文镜像）、K-CAP 论文教训（转述）
- **Observation（推测/未闭环，已标注）**：LadybugDB 文件级兼容、GraphRAG v2 增量、gen-json-schema draft 档位、LadybugDB 商业可持续性、CIKM 案例代码生成产物语言

## 8.5 本地归档资产清单

```
research/2026-09-15-ontology-kg-engineering/
├── report.md                 # 本报告（sections/ 合并产物）
├── metadata.json             # 调研元数据
├── sections/                 # 00-08 九节源文件
├── sources/
│   ├── linkml-runtime.js/    # 克隆（.git 已删）
│   ├── graphiti/             # 克隆（.git 已删，363 文件）
│   ├── rdf-validate-shacl/   # codeload zip 解包
│   └── kuzu-npm/             # npm pack tarball 解包 + NOTES.md 审计笔记
├── images/                   # （预留；本报告图表以 Mermaid 内嵌）
└── attachments/              # （预留）
```

报告完 · 生成于 2026-09-15 · Real Deep Research（SCOUT→MAP→DIVE×12→SATURATE→SYNTHESIZE→DELIVER）
