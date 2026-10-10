# 01 · WeKnora 深度解剖（知识库主候选）

本章覆盖调研问题 1。数据基础：仓库 clone 审计（112MB，4804 文件，VERSION=0.8.2，已存 `sources/WeKnora/`）+ 官方文档站深读（7 核心页 + 全目录 80+ 页）+ GitHub API/Issues + npm registry 机械验证。

## 1.1 基本面与定位

腾讯（微信团队）开源 LLM 知识平台「维娜拉」：RAG 问答 + 多步推理 Agent + 自动维护 Wiki 三能力共享同一知识库。32,810★/4,364 forks/596 open issues（GitHub API 实取）；创建 2025-07-22，**最后 push 2026-10-09（调研当日）**；release 月度节奏（v0.6.3→v0.7.2→v0.8.0→v0.8.2@2026-09-24）。技术栈：Go/Gin 后端(:8080) + Vue3 前端 + Python/gRPC docreader 解析服务(:50051)。界面五语言（简中/英/日/韩/俄）。数据源连接器：飞书/Notion/Confluence/语雀/钉钉/IMA/GitLab/RSS。投入度判定：核心团队+高校"犀牛犀鸟"贡献混合，文档站用 weknora.weixin.qq.com 域名（微信事业群资源背书）——**真实且高投入，非弃疗项目**。

## 1.2 架构与部署（docker-compose 26 服务分层）

- **默认启动（无 profiles）**：frontend(weknora-ui) + app(Go/Gin) + docreader(Python/gRPC，含 LibreOffice+Playwright) + postgres(**paradedb/paradedb:v0.22.6-pg17**，BM25+pgvector 二合一) + redis:7.0 + searxng；
- **可选 profile**（每个挂 `<name>` 与 `full` 双 profile）：minio、**neo4j:2025.10.1**（APOC，7474/7687）、qdrant v1.16.2、milvus v2.6.11、weaviate 1.28.4、**apache/doris fe/be 4.1.0**（湖仓！）、dex(OIDC)、langfuse 全家桶(clickhouse24.8+minio+worker+web)、mcp、sandbox；
- **资源**：官方建议 4 核 8GB 起步（8GB 不含 Ollama 权重）；**macOS 16GB：核心栈约 4-5GB 可行；32GB：可加 neo4j+qdrant 全开**；ParadeDB x86-64-v2 基线（不强制 AVX2）→ Apple Silicon Docker 可跑（多架构镜像）；
- **Lite 单二进制模式**（docs/LITE.md）：SQLite(FTS5+sqlite-vec)+内存队列零外部依赖，单空间免注册，仅 Simple 解析引擎——低资源备选；另有 macOS 桌面版（Wails2，未正式发布）；
- 对象存储七选一（local/MinIO/腾讯COS/火山TOS/AWS S3/华为OBS/阿里OSS）；Asynq 任务队列六 lane（core8/postprocess2/enrichment12/maintenance4/shared6/wiki8）。

## 1.3 检索引擎抽象层（对 dsh capability seam 的直接参照）

`internal/types/interfaces/retriever.go`：**11 种引擎枚举**（postgres/elasticsearch v7+v8/infinity/elasticfaiss/qdrant/milvus/weaviate/doris/sqlite/tencent_vectordb/opensearch），实现位于 `internal/application/repository/retriever/<engine>/`。三层接口：

```go
type RetrieveEngine interface {
    EngineType() types.RetrieverEngineType
    Retrieve(ctx context.Context, params types.RetrieveParams) ([]*types.RetrieveResult, error)
    Support() []types.RetrieverType   // 向量/关键词能力声明
}
type RetrieveEngineRegistry interface {
    Register(svc RetrieveEngineService) error
    GetRetrieveEngineService(t types.RetrieverEngineType) (RetrieveEngineService, error)
    GetOrLoadByStoreID(ctx, tenantID, storeID) (RetrieveEngineService, error) // 按需重建+租户防IDOR
}
```

`RETRIEVE_DRIVER` env 支持逗号多驱动并行扇出（`MULTI_STORE_RETRIEVE_TIMEOUT_SEC` 控超时），默认 postgres。引擎注册表有自愈机制（构建超时 10s/冷却 30s/代际防竞态）。**注意：切换引擎需重建索引且 KB 绑定不可改——选型一步到位**。

## 1.4 检索管线：混合→加权 RRF→Rerank 全链路

- `fuseOrDeduplicate`（`knowledgebase_search_fusion.go`，235 行纯算法）：按 RetrieverType 分向量/关键词两路；混合走 `fuseWithRRF`：`score = vw/(k+vRank) + kw/(k+kRank)`，除以理论最大值归一化到 [0,1]（**多源分数可比较——五源融合直接可用**）；
- 可配置项（tenant 级 JSONB，`/tenants/kv/retrieval-config`）：embedding_top_k(50)/vector_threshold(0.15)/keyword_threshold(0.3)/rerank_top_k(10)/rerank_threshold(0.2)/rrf_k(60)/rrf_vector_weight(0.7)/rrf_keyword_weight(0.3)；请求级可覆盖、可关 rerank；
- Rerank 前有 **passage 清洗**（`internal/reranking/passage.go`：剥 markdown 图链/URL/表格分隔行/LaTeX 保留正文）+ MMR 多样性 + 图像 rerank；
- 多轮查询改写：`config/prompt_templates/rewrite.yaml`（共指消解+省略补全+意图分类三合一，i18n 四语言）；
- 中文检索技术根（官方文档 03-features/05-retrieval-engines）：默认 ParadeDB pgvector halfvec+HNSW 表达式索引+pg_search BM25；**SQLite Lite 用手动 bigram 分词（官方自述"对中文友好"）**；Milvus 内置 Jieba 中文分析器。

## 1.5 文档解析管道（docreader）

gRPC :50051（TLS+Token 可选）。解析器矩阵：pdf/docx(两代)/doc/excel(+merge/repair)/ppt(markitdown)/html/mhtml/epub/markdown/image(OCR)/xmind/csv/markitdown/opendataloader，按扩展名+引擎回退路由；**高精度通道：MinerU 与 PaddleOCR-VL**（自建 :10051 HTTP 或云端轮询，超时 1000s/600s）+ WeKnoraCloud 托管解析——达到 DeepDoc 级深度解析能力（对标 RAGFlow）。Chunking：Go 生产路径 `internal/infrastructure/chunker/`（heading_splitter 标题层级+breadcrumb、**父子分块 parent-child**（legacy+adaptive，表格 offset 测试）、protected_spans 保护公式/表格/代码、fenced_code）；Python 侧 splitter（512 字符/overlap 80，分隔符 `["\n","。"," "]` 中文句号优先）——**中文 PDF/表格友好证据充分**。口碑避坑：加密 PDF 直接解析失败（入库前解密）；扫描件确认 OCR 引擎启用；WPS 另存 DOCX 标题层级易丢（LibreOffice 预转）。

## 1.6 GraphRAG/Neo4j 集成

开关唯一：`NEO4J_ENABLE=true`（compose profile neo4j）。图谱作为 **agent 工具 `query_knowledge_graph`**（不是检索管线内嵌）：实体名子串匹配种子节点→扩展邻居→返回关系+证据 chunk，带三重截断上限（seed 200/rows 2000/relations 30）和**截断标记防幻觉设计**（graphTruncation 明示模型"这不是全部邻居"——该模式适用于 dsh 所有截断型工具输出）。建图：LLM 实体抽取（11 类封闭枚举 Person/Organization/Location/Product/Event/Date/Work/Concept/Resource/Category/Operation，JSON 输出，`{{language}}` 变量保证中文描述，"宁缺毋滥"规则）→ 关系抽取（batch 5，并发 4）→ 边权 PMI×0.6+强度×0.4，间接关系衰减 0.5，归一化 1-10。Neo4j schema：节点 label=`ENTITY<Namespace>` + 属性 `{name, kg, attributes, chunks[]}`（**实体自带 chunks 溯源**）；边 `apoc.merge.relationship` 建带权；删 `apoc.periodic.iterate` 批量。官方自认建图是"**管线中最昂贵的增强扇出**"（每 chunk 一次 LLM 调用）——成本敏感，按 KB 级开关。可视化 Mermaid graphBuilder 是**未装配的遗留实现**（官方文档自认，无开箱图可视化）。

## 1.7 REST API 完整面与 MCP

- **292 个路径**（swagger.json：POST 132/GET 148/PUT 46/DELETE 47），核心分组：knowledge-base CRUD、knowledge 文件（file/url/manual 三种创建+reparse+preview+spans）、chunks（CRUD+revision 回滚+generated questions）、FAQ、sessions（fork/rewind/steer/附件/沙箱ticket）、agents、skills、organizations、memory、wiki（16 端点+graph 可视化）、datasource 连接器、mcp-services/mcp-endpoints、models、审计；
- **认证三通道**（`internal/middleware/auth.go`）：匿名邀请 token / Bearer JWT / **X-API-Key（能力分片 retrieve/chat/ingest/full + KB 范围限定，AES-256-GCM 存储）**；
- **两个对外检索端点**：`POST /api/v1/knowledge-search`（**外部系统首选**，与产品问答同管线，rerank 默认开，meta.rerank.outcome 诊断空结果）；`POST /api/v1/knowledge-bases/{id}/hybrid-search`（底层召回，支持 query_embedding 预计算向量，父块/相邻块独立行，skip_context_enrichment 可关）；SSE 问答 `POST /api/v1/knowledge-chat/:session_id`；
- **内置 MCP Server（Go 原生，Streamable HTTP/stdio/SSE）**：设置页创建 endpoint → 连 `/mcp/<endpoint_id>`；**12 工具四组**：retrieve(list_knowledge_bases/search_knowledge/grep_chunks/list_documents/read_document)+chat(ask)+wiki(wiki_search/wiki_read_page/wiki_index)+ingest(add/update/delete_document，Destructive 默认不勾选)；每 endpoint 独立 token+KB 范围+工具白名单。

## 1.8 TS SDK 与官方 dsh 插件（W24 决定性发现）

npm 无通用官方 SDK（官方 SDK 仅 Go：`client/` 独立 module 含 SSE 流式）。**但存在官方 deepseek-harness 插件 `@wxg-prc-cpg/dsh-weknora`（npm registry 机械验证：v0.1.0 唯一版本，2026-08-21 发布，MIT，零运行时依赖，SLSA provenance，tarball shasum 双验一致，npmmirror 同步存在；源码=WeKnora 仓库 `packages/dsh-weknora`，发布者 wxg_prc_cpg@tencent.com）**。提供四工具：`weknora_list_knowledge_bases` / `weknora_search`（混合检索）/ `weknora_read_document`（翻页读全文）/ `weknora_ask`（服务端会话+引用）。安装：`dsh plugin --profile web add @wxg-prc-cpg/dsh-weknora`（或本地 `./packages/dsh-weknora`）；配置经 `WEKNORA_BASE_URL`/`WEKNORA_API_KEY`/`WEKNORA_KNOWLEDGE_BASE_IDS` 环境变量（cordis.patch.yml `!!js` 插值）；API Key 需 retrieve 能力（ask 另需 chat）；`resourceUrls=public` 默认、限定 KB 遇 403 自动降级 handle；已验证 dsh 0.1.0-rc.8 / WeKnora 0.7.2+ 兼容。**⇒ W24 不需要自研 HTTP client：官方插件即最短路径，或参照其 dist/{client,config,harness,tools} 实现定制。**

## 1.9 许可证与企业级成熟度

- **LICENSE 原文级结论**：MIT 主体（腾讯自研代码）+ 第三方例外清单（Apache-2.0：paddle/playwright/grpc-health/OpenCC；MPL-2.0：go-sql-driver-mysql（Doris 驱动）/go-m1cpu；BSD/MIT-CMU/Python-2.0 若干）。**无 AGPL/GPL 传染组件**；MPL-2.0 仅文件级义务；dsh 仅 API 调用不分发二进制→**商用风险低**；若随包分发需保留 LICENSE+THIRD_PARTY_NOTICES+licenses/ 三件套；
- 企业级：四级 RBAC（Owner/Admin/Contributor/Viewer + 每路由 guard）、空间配额（默认 10GB）、邀请 TTL、审计日志（90 天）、跨空间开关、OIDC/Dex SSO、Langfuse 全链路追踪、API key 能力分片、MCP 工具人工审批（fail-close）。

## 1.10 口碑与风险（诚实面）

- **中文社区实践沉淀≈0**（掘金/博客园/腾讯云开发者社区均无，知乎人机墙；CSDN 约 167 结果但多为内容农场变体）——**与 32.8k★ 严重不对称，无第三方大规模生产案例佐证**（star 多为宣传效应）；
- GitHub Issues：检索类 528 条/基础设施类 709 条；高赞痛点：#1679「重建/重解析不复用 OCR/Embedding 缓存」（77 评论，open——**大批量语料调分块参数前先小样验证**）；#263 ParadeDB 镜像启动失败（Ubuntu 环境）；v0.8.2 换嵌入会话签名算法（旧链接失效）；ParadeDB v0.22.2→v0.22.6 需手动停写备份升级；
- 唯一可信横评（CSDN hzp666，2026-06，v0.8 前口径）：WeKnora=微信生态+轻量+混合检索；短板"企业级特性较少"（**滞后一个版本代际——v0.8 已补齐多租户 RBAC/审计/OIDC**）；RAGFlow 表格识别更强（90%+）；
- **风险结论**：选型成立但必须自建基准——W24 落地第一步就用食品语料做 WeKnora vs RAGFlow（远端/demo）vs FastGPT 的小规模解析+检索对照（07 节行动项）。

## 1.11 部署 checklist（macOS 单机，可直接执行）

```bash
git clone https://github.com/Tencent/WeKnora.git && cd WeKnora
cp .env.example .env    # 填 LLM/embedding API key（DeepSeek OpenAI 兼容）或 Ollama
# 必留密钥：JWT_SECRET=openssl rand -hex 32；SYSTEM_AES_KEY=openssl rand -hex 16（升级必须沿用，否则凭据无法解密）
docker compose pull && docker compose up -d                # 核心：ui+app+docreader+paradedb+redis
docker compose --profile neo4j up -d                       # W24 图谱需要；.env 加 NEO4J_ENABLE=true
# 设置→模型：配 Embedding（bge-m3）+ Rerank（bge-reranker-v2-m3）+ LLM（DeepSeek）
# 创建 scoped API Key（retrieve+chat，限定 KB 白名单）→ 交给 dsh 侧
dsh plugin --profile web add @wxg-prc-cpg/dsh-weknora      # 官方插件直装
```

**检索 curl 例**：
```bash
curl -X POST $BASE/api/v1/knowledge-search -H "X-API-Key: $KEY" -H 'Content-Type: application/json' \
  -d '{"query":"产品保质期要求","knowledge_base_ids":["kb-1"],"match_count":10}'
curl -N -X POST $BASE/api/v1/knowledge-chat/s-1 -H "X-API-Key: $KEY" \
  -d '{"query":"供应商准入流程","knowledge_base_ids":["kb-1"]}'   # SSE
```

**「宣传 vs 实测」警示表**：GraphRAG（官方自认最贵扇出+可视化未装配）｜开箱即用（部署失败 issues 存在，macOS 未被社区验证）｜10 种检索引擎（切换=重建索引不可逆）｜32.8k★ 生态（社区实践≈0）｜表格解析（社区公认 RAGFlow 更强，需实测）。
