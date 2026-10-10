# R2b 调研来源清单（按 17 分支归类）

> 评级：★★★★★ 决定性一手源 / ★★★★☆ 核心 / ★★★ 辅助 / ★★ 旁证。全部 URL 于 2026-10-09 访问验证（或经 API/raw 通道取得）。

## 分支 0 · SCOUT
- https://github.com/Tencent/WeKnora — ★★★★★ 主候选仓库（32.8k★，MIT，v0.8.2）
- https://weknora.weixin.qq.com/docs/01-getting-started/01-introduction — ★★★★★ 官方产品介绍（架构全景）
- https://www.cnblogs.com/itech/p/22987248 — ★★ 第三方中文报道（2.37 万星时期）
- https://juejin.cn/post/7686341837754318883 — ★★ 掘金报道

## 分支 1 · WeKnora clone 审计（sources/WeKnora 本地）
- docker-compose.yml（26 服务/profile 分层）— ★★★★★
- internal/types/interfaces/retriever.go（11 引擎三层抽象）— ★★★★★
- internal/application/service/knowledgebase_search_fusion.go（RRF 归一化）— ★★★★★
- internal/application/service/graph.go（1039 行，Neo4j 建图/检索）— ★★★★★
- internal/application/repository/retriever/neo4j/repository.go — ★★★★★
- config/prompt_templates/graph_extraction.yaml（11 类枚举+{{language}}）— ★★★★★
- docs/swagger.json（292 路径）+ internal/router/routes_*.go — ★★★★★
- internal/mcpserver/ + internal/types/mcp_endpoint_tools.go（12 工具）— ★★★★★
- docreader/（解析器矩阵）+ internal/infrastructure/chunker/（父子分块）— ★★★★★
- LICENSE + THIRD_PARTY_NOTICES.md + licenses/（MIT+例外清单）— ★★★★★
- website-docs/05-clients/08-deepseek-harness.md（官方 dsh 插件文档）— ★★★★★
- https://github.com/Tencent/WeKnora/tree/main/client（Go SDK module）— ★★★★☆

## 分支 2 · WeKnora 文档+口碑
- https://weknora.weixin.qq.com/docs/01-getting-started/02-installation — ★★★★★ 部署与资源
- https://weknora.weixin.qq.com/docs/03-features/05-retrieval-engines — ★★★★★ 检索引擎矩阵（中文友好证据）
- https://weknora.weixin.qq.com/docs/03-features/09-knowledge-graph — ★★★★★ GraphRAG 机制
- https://weknora.weixin.qq.com/docs/04-api/01-api-overview — ★★★★★ API/认证模型
- https://weknora.weixin.qq.com/docs/01-getting-started/05-troubleshooting — ★★★★☆ 升级坑
- https://github.com/Tencent/WeKnora/issues/1679 — ★★★★☆ 重解析缓存痛点（77 评论）
- https://blog.csdn.net/hzp666/article/details/162068203 — ★★★☆☆ 独立横评（唯一可信）

## 分支 3 · RAGFlow
- https://github.com/infiniflow/ragflow — ★★★★★（91.9k★，Apache-2.0）
- https://ragflow.io/docs/http_api_reference — ★★★★★ 111 端点+v1.0 破坏性变更
- https://ragflow.io/docs/dataset_configuration — ★★★★★ 13 chunk 模板/6 解析器/Extractor
- https://ragflow.io/docs/faq — ★★★★★ amd64-only/CPU-only 推理证据
- https://ragflow.io/docs/release_notes — ★★★★☆ Go 重写细节
- https://ragflow.io/docs/knowledge_compilation/built_in_templates_and_dedicated_configuration — ★★★★☆ Graph 模板
- https://hub.docker.com/v2/repositories/infiniflow/ragflow/tags/ — ★★★★☆ 架构铁证
- https://ragflow.com.cn/docs — ★★★ 官方中文站；demo.ragflow.io — ★★★ 免部署对照

## 分支 4 · Dify + 国产对照
- https://docs.dify.ai/en/cloud/use-dify/knowledge/（setting-indexing-methods / chunking-and-cleaning-text / connect-external-knowledge-api）— ★★★★★
- https://docs.dify.ai/en/api-reference/openapi_service.json — ★★★★★ 机器可读 OpenAPI
- https://api.github.com/repos/langgenius/dify（+LICENSE 原文）— ★★★★★ 1b 后端豁免句
- https://github.com/langgenius/dify-official-plugins（extensions/llamacloud）— ★★★☆☆ External KB 参考实现
- https://github.com/1Panel-dev/MaxKB（GPL-3.0 证据）— ★★★★☆
- https://github.com/labring/FastGPT（+LICENSE 原文）— ★★★★☆ TS 全栈证据
- https://doc.fastgpt.cn/zh-CN/openapi/intro — ★★★★☆ OpenAPI 面
- https://github.com/netease-youdao/QAnything（commits API 停更证据）— ★★★★☆ AGPL+Qwen 双重限制
- https://cdn.jsdelivr.net/gh/<owner>/<repo>@<branch>/<path> — ★★★★★ 本环境 GitHub 文件旁路通道

## 分支 5 · LightRAG + Haystack + LlamaIndex
- https://github.com/HKUDS/LightRAG（README 39398 字符全文）— ★★★★★ 双层检索/四存储抽象/REST 官方立场
- https://pypi.org/project/lightrag-hku — ★★★★☆ lightrag-server 安装面
- https://arxiv.org/abs/2410.05779 — ★★★★☆ LightRAG 论文
- https://github.com/deepset-ai/haystack + Hayhooks（README Tip）— ★★★★☆ 服务化官方答案
- https://github.com/run-llama/LlamaIndexTS（弃维公告置顶）— ★★★★★ TS 路线否决证据
- https://github.com/langchain-ai/langchainjs — ★★★ TS 原生唯一活选项（迁移指向）

## 分支 6 · Neo4j
- https://neo4j.com/legal-terms/ — ★★★★★ GPLv3 定性
- https://neo4j.com/open-core-and-neo4j/ — ★★★★★ driver Apache-2.0 原文
- https://neo4j.com/docs/operations-manual/current/introduction/ — ★★★★★ CE/EE/Infinigraph 对比表
- https://neo4j.com/docs/cypher-manual/current/indexes/search-indexes/vector-indexes/ — ★★★★★ CE vector 边界
- https://api.npmjs.org/downloads/point/last-week/neo4j-driver + https://registry.npmjs.org/neo4j-driver/latest — ★★★★★ 92万/周+TS 内置
- https://hub.docker.com/v2/repositories/library/neo4j/tags/ — ★★★★★ arm64 实测
- https://neo4j.com/developer-blog/enhancing-hybrid-retrieval-graphrag-python-package/ — ★★★★☆ 混合检索范式
- https://neo4j.ac.cn/docs/ — ★★★★☆ 官方中文站
- https://github.com/neo4j/neo4j-graphrag-python — ★★★★☆ 官方 GraphRAG 库

## 分支 7 · Apache AGE
- https://projects.apache.org/project.html?age — ★★★★★ ASF Active 状态
- https://api.github.com/repos/apache/age（+commits?per_page=10）— ★★★★★ 活跃度量化
- https://github.com/apache/age/tree/master/drivers/nodejs — ★★★★★ TS 路线（node-pg 薄封装）
- https://age.apache.org/age-manual/master/advanced/prepared_statements.html — ★★★★☆ 参数化边界
- https://github.com/apache/age/issues/1121 — ★★★★☆ pgvector 共存提案
- https://github.com/apache/age-viewer — ★★☆ 可视化子项目
- https://hub.docker.com/v2/repositories/apache/age/tags/ — ★★★★★ arm64 全量解析（1.6.0+ 双架构）

## 分支 8 · NebulaGraph + Memgraph
- https://github.com/vesoft-inc/nebula/releases（29 个月停更证据）— ★★★★★
- https://docs.nebula-graph.com.cn/3.8.0/（9 容器 compose）— ★★★★★
- https://memgraph.com/docs/client-libraries/nodejs（neo4j-driver 官方钦定）— ★★★★★
- https://github.com/memgraph/memgraph/blob/master/licenses/BSL.txt — ★★★★★ BSL 全文
- https://memgraph.com/docs/database-management/enabling-memgraph-enterprise — ★★★★★ CE/EE 边界
- https://memgraph.com/docs/querying/vector-search — ★★★★☆ 向量（节点+边）
- https://github.com/memgraph/orb — ★★☆ 官方可视化

## 分支 9 · GraphDB + Oxigraph
- https://graphdb.ontotext.com/documentation/11.5/licensing.html — ★★★★★ Free 边界唯一权威页
- https://github.com/Ontotext-AD/graphdb-docker + org 页（graphdb.js/graphdb-workbench）— ★★★★☆
- https://registry.npmjs.org/graphdb — ★★★★★ 官方 TS driver v4.0.0
- https://hub.docker.com/v2/repositories/ontotext/graphdb/tags/ — ★★★★☆ multi-arch
- https://github.com/oxigraph/oxigraph（README + js/README）— ★★★★★ 定位/许可/JS in-memory 边界
- https://arxiv.org/search/?query=%22text-to-SPARQL%22 与 ?query=text2cypher — ★★★★☆ LLM 生成友好度证据面

## 分支 10 · 本体标准（重派）
- https://www.w3.org/TR/owl2-profiles/ — ★★★★★ profile 定位
- https://www.w3.org/TR/shacl/ — ★★★★★ 校验模型/约束组件/RDF 报告
- https://w3c.github.io/data-shapes/shacl12-overview/ — ★★★★☆ SHACL 1.2 "inform other agents"
- https://www.w3.org/TR/skos-primer/ — ★★★★★ KOS 建模+混用惯例
- https://www.w3.org/TR/json-ld11/ — ★★★★★ @context/100% JSON 定位
- https://www.w3.org/TR/rdf-schema/ — ★★★ domain/range 非约束表述
- https://neo4j.com/blog/knowledge-graph/rdf-vs-property-graphs-knowledge-graphs/ — ★★★★☆ Jim Webber 论战（⚠️ 厂商一方）
- https://www.iso.org/standard/76120.html — ★★★ GQL=ISO/IEC 39075:2024
- https://api.github.com/repos/neo4j-labs/neosemantics/contents/docs/modules/ROOT/pages/ — ★★★★★ n10s 文档源（TBox 5 类元素）
- https://registry.npmjs.org/jsonld（v9.0.0）+ https://registry.npmjs.org/rdf-validate-shacl — ★★★★★ TS 工具
- https://pypi.org/pypi/pyshacl/json — ★★★★☆；https://foodon.org/design/foodon-structure/ + https://api.github.com/repos/FoodOntology/foodon — ★★★★☆ FoodOn CC-BY-4.0
- https://obofoundry.org/ontology/agro.html — ★★★ AgrO

## 分支 11 · LLM 本体抽取
- https://github.com/monarch-initiative/ontogpt — ★★★★★（1048★，LinkML→OWL）
- https://github.com/KRR-Oxford/DeepOnto — ★★★★☆
- https://github.com/sciknoworg/OntoLearner — ★★★★☆（AgrO/Wine 食品域）
- https://github.com/NVIDIA/auto-ontology — ★★★★☆（PG 元数据→本体）
- https://github.com/microsoft/graphrag（+ https://microsoft.github.io/graphrag/index/outputs/）— ★★★★★ parquet 产物结构
- https://github.com/OpenSPG/KAG — ★★★★★（结构化+非结构化统一入图原文）
- https://github.com/zjunlp/OneKE + https://github.com/zjunlp/DeepKE — ★★★★★ 中文/DeepSeek 适配
- https://docs.llamaindex.ai（PropertyGraphIndex/SchemaLLMPathExtractor）— ★★★★☆
- https://github.com/F1y1113/MFI（SHIELD）+ https://github.com/wandugu/paper_scion — ★★★★☆ 学术线
- https://github.com/microsoft/Ontology-Playground — ★★★★☆ 人工关卡
- https://arxiv.org/abs/2609.34540（APOLO）/2609.31663/2609.26029（CQ4OE）/2609.15779（EvoOntology）— ★★★

## 分支 12 · force-graph + sigma
- https://github.com/vasturiano/force-graph（README 22587 字符）— ★★★★★
- https://github.com/vasturiano/react-force-graph（README 50697 字符）— ★★★★★
- https://vasturiano.github.io/react-force-graph/example/expandable-nodes/ + large-graph（75k）— ★★★★★ 官方示例
- https://github.com/vasturiano/force-graph/issues/201、/366 — ★★★★☆ 性能证据
- https://github.com/jacomyal/sigma.js + https://www.sigmajs.org/ — ★★★★★（v4@2026-10-08）
- https://github.com/sim51/react-sigma + https://sim51.github.io/react-sigma/docs/ — ★★★★★ 不可变范式
- https://api.npmjs.org/downloads/point/last-week/{force-graph,react-force-graph-2d,sigma,graphology} — ★★★★★ 下载量
- https://graphology.github.io/ — ★★★★☆

## 分支 13 · cytoscape/vis/3d/Cosmograph
- https://js.cytoscape.org/（910KB 全文档）— ★★★★★（renderedPosition/#3486 v4 重设计）
- https://github.com/plotly/react-cytoscapejs（20 个月停摆）— ★★★★★ React 层死亡证据
- https://github.com/visjs/vis-network（README"few thousand nodes"）— ★★★★★ 官方口径
- https://github.com/vasturiano/3d-force-graph（+issue #81 50k+）— ★★★★☆
- https://cosmograph.app/pricing/ + npm @cosmograph/*（CC-BY-NC-4.0）— ★★★★★ 许可否决证据
- https://github.com/obsidianmd/obsidian-help（en/Plugins/Graph view.md）— ★★★★★

## 分支 14 · Obsidian 范式
- https://obsidian.md/help/plugins/graph（+backlinks/outgoing-links/page-preview）— ★★★★★ 官方规格
- https://github.com/HEmile/juggl（package.json + juggl.io/layouts）— ★★★★★ Cytoscape 系复刻
- https://github.com/mmy-lana/react-obsidian-graph-knowledgebase — ★★★★★ React 复刻蓝图
- https://github.com/logseq/logseq（package.json: d3-force 3.0.0+graphology）— ★★★★★
- https://github.com/ElsaTam/obsidian-extended-graph — ★★★★☆ 增强生态
- forum.obsidian.md：t/32146（depth 上限 5）/t/2349（空闲 CPU）/t/72586（River d3 证词）/t/258/t/2077/t/22594 — ★★★★☆

## 分支 15 · GraphRAG + 五源
- https://microsoft.github.io/graphrag/（index/overview + outputs + query/overview + config/yaml.md raw + byog）— ★★★★★（BYOG=本调研最高价值发现）
- https://github.com/neo4j/neo4j-graphrag-python（README + src/retrievers）— ★★★★★ schema patterns/策略面
- https://neo4j.com/labs/apoc/4.4/database-integration/（+load-jdbc/ +database-modeling/）— ★★★★★ RDBMS→图官方模式
- https://api.github.com/repos/neo4j/neo4j-kafka-connector — ★★★★☆ CDC 现状
- https://neo4j.com/labs/genai-ecosystem/ — ★★★；https://arxiv.org/pdf/2409.13731（KAG 论文）— ★★★★☆

## 补洞验证（机械通道）
- https://registry.npmjs.org/@wxg-prc-cpg%2Fdsh-weknora（+npmmirror+tarball shasum 双验）— ★★★★★ A 路径定谳
- https://api.github.com/repos/langchain-ai/langchain-experimental + raw llm.py L318-330 — ★★★★★ LLMGraphTransformer 签名（archived 判定）
- https://hub.docker.com/v2/repositories/apache/age/tags/?page_size=25 — ★★★★★ arm64 定谳

## 本地资产
- research/2026-10-09-w24-rebuild/r2b-kb-graph-ontology/sources/WeKnora（112MB clone，v0.8.2）
- research/2026-09-17-ontology-kg-ai-deep-research/（W 轮既有深研：Local/Global/DRIFT 源码级、HippoRAG、text2cypher 四象限、L0-L3 查询分级——本报告交叉基线）
