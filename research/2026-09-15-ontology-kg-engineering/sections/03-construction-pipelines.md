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
