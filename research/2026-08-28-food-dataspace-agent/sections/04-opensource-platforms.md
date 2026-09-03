# 第 4 章 开源知识库 + Agent 平台：架构与商业化（维度 B）

> 审计方法说明【实证】：MaxKB、FastGPT、coze-studio 经 GitHub contents API 逐文件源码级读取（FastGPT 5 个核心文件、MaxKB 6 个、Coze 3 个）；RAGFlow、Dify 经官方文档级审计；4 家定价页浏览器直读。本地浅克隆因网络 early EOF 失败，未产生本地副本。

## 4.1 五产品总览

| 产品 | 出品方 | Stars | License | 技术栈 | 与我方同构度 |
|---|---|---|---|---|---|
| MaxKB | 飞致云 fit2cloud | ~20k | GPLv3 | Python/Django + Vue + LangChain + PostgreSQL/pgvector | 中 |
| FastGPT | labring/Sealos | 29.5k | 自有（可后台商用、禁 SaaS） | **TypeScript monorepo** + Next.js + MongoDB + 可插拔向量库 | **高** |
| RAGFlow | infiniflow | 89.4k | Apache-2.0 修改版 | Python + MySQL + MinIO + ES/Infinity | 中 |
| Dify | langgenius | ~100k 级 | Apache-2.0 + 附加条件 | Python Flask + Next.js + PostgreSQL/pgvector + Redis | 中 |
| Coze Studio | 字节 | — | Apache-2.0 | Golang DDD + React/TS | 低（语言异构） |

## 4.2 MaxKB（源码级）

### 4.2.1 架构

apps/ 按域划分：knowledge、application、chat、models_provider、tools、trigger、users、system_manage。**单库架构**：关系数据与向量同存 PostgreSQL/pgvector。

### 4.2.2 RAG 管道（关键源码）

- `apps/knowledge/vector/base_vector.py`：`BaseVectorStore` 抽象（save/query 注入 LangChain `Embeddings` 接口），唯一实现 `pg_vector.py`；embedding 前做 `normalize_for_embedding`（去 emoji/合并空白）
- **三路检索 SQL**（`apps/knowledge/sql/`）：
  - `embedding_search.sql`：pgvector `<=>` 余弦距离，先取 `LEAST(topN*10, 500)` 预取，再 `DISTINCT ON paragraph_id` 去重 + 阈值过滤
  - `keywords_search.sql`：`ts_rank_cd(search_vector, websearch_to_tsquery('simple'), 32)` 全文检索
  - `blend_search.sql`：**混合检索加法融合** `(1-向量距离) + COALESCE(ts_rank_cd, 0)`——非 RRF
- rerank 走 models_provider 的重排模型类型（"模型优化"命中模式）

### 4.2.3 知识库数据模型（`apps/knowledge/models/knowledge.py`）

```
Knowledge（uuid7 主键、workspace_id 多租户列、type=通用/WEB/飞书/语雀/工作流、
          scope=共享/工作空间、MPTT 树形文件夹）
└─ Document（char_length 冗余、hit_handling_method=模型优化/直接返回、
            directly_return_similarity 默认 0.9、meta JSON）
   └─ Paragraph（content≤102400、title、hit_num 命中计数、position、
                chunks ArrayField 段落内子块）
      + Problem/ProblemParagraphMapping（QA 问题增强：LLM 生成问题也建向量索引）
      + Tag/DocumentTag（知识库级 key-value 元数据过滤）
      + Termbase（术语库——食品行业专业词替换刚需）
```

任务状态用位压缩字符串状态机（EMBEDDING/GENERATE_PROBLEM/SYNC/TOKENIZE × PENDING…IGNORED），celery 异步。

### 4.2.4 商业化【实证，maxkb.cn/price】

- 社区版：免费无限制（V2 起不限用户/应用/知识库数）
- 专业版：**¥4.8 万/套永久授权**（含 1 年维保，次年 ¥9600/年，X-Pack 增强包）
- 企业版：联系销售（多租户/集群/跨工作空间共享/SSO LDAP·OIDC·CAS·SAML2）
- 1000+ 付费客户；官网直接对标 Dify/n8n/RAGFlow
- 开源版单租户（workspace_id 字段已预留 default="default"），仓库内 `list_knowledge_user_ee.sql`（EE 后缀=企业版 SQL 与开源共存）

## 4.3 FastGPT（源码级，与我方最同构）

### 4.3.1 架构

**TypeScript monorepo**（Next.js + MongoDB 业务库 + 向量库可插拔 + S3/GridFS 文件）。`packages/service/common/vectorDB/` 提供 **pg/milvus/oceanbase/opengauss/seekdb 5 后端抽象**（controller.ts 单入口）。

### 4.3.2 切片算法（`packages/service/common/string/textSplitter.ts`）

- 参数：chunkSize、paragraphChunkDeep（段落递归深度）、paragraphChunkMinSize（小块合并）、overlapRatio、customReg、lengthUnit(char|token)、maxChunks
- token 模式下**二分查找边界减少 tokenizer 调用**；按 Unicode code point 切防代理对截断
- overlap 取上一块**尾部**（getMaxSuffixByLength）
- CPU 密集切片跑在 `worker/text2Chunks`（worker_threads）

### 4.3.3 Embedding 管道（`packages/service/core/ai/embedding/index.ts`）

zod 校验 → 批 token 计数 → 单条截断兜底 → 按 model.batchSize 分块**顺序**请求（防限流）+ retry；OpenAI 兼容协议；**db/query 双配置**（入库与查询可用不同模型参数）。

### 4.3.4 检索与重排（`packages/service/core/dataset/search/defaultRecall/`）

- `embeddingRecall.ts`：文本/图片描述/原图三源查询（多模态 embedding），向量库只存 dataId，回查 Mongo 补齐 q/a
- `rerank.ts`：**只 rerank 文本召回**，图片走 RRF；`rerankWeight<1` 时加权融合原始序与 rerank 序；**rerank 失败静默降级**返回原序；score 记录多阶段分数数组

### 4.3.5 数据模型

- `dataset_collections`（文档表：parentId 树形、type、fileId(GridFS/S3)、rawTextLength+hashRawText 去重、ChunkSettings 内嵌）
- `dataset_datas`（chunk 表：**q/a QA 对**、imageId/imageDescMap、indexes[]（dataId+text 向量引用）、**history[]（chunk 级修改历史）**、chunkIndex、rebuilding 标志）
- 4 组复合索引全部以 teamId 打头

### 4.3.6 商业化【实证】

- License：可后台商用、禁 SaaS 服务；完整版=社区版镜像+商业版镜像（License 启动）
- Sealos 全托管：**1 万元/月起（3 个月起）或 12 万/年**（8C32G）；多节点 2.2 万/月；自有服务器面议；技术服务费 2000-3000 元/人/天
- 团队空间/权限/SSO/多用户支付全部是商业版功能；开源版 teamId+tmbId 双键已预留

## 4.4 RAGFlow（文档级）

- **架构观**（docs/basics/rag.md）：DeepDoc/VLM 把多模态文档"翻译"为结构化单模态文本
- **模板化 chunking**：法律/论文/简历/表格等模板 + 语义目录 + 知识图谱增强；切片可视化人工干预；2025-10 起支持可编排 ingestion pipeline、MinerU/Docling 解析器
- **检索**：向量+BM25 混合 + 融合重排 + 元数据过滤 + 多向量/tensor 表示
- 部署重：MySQL + MinIO + ES/Infinity（vm.max_map_count 需 262144）
- **商业化**【实证，ragflow.io】：云服务 Free（5 apps/0.1GB/500 credits）/ Starter $29-59 月（5GB/5000 credits）/ Pro $129-259（50GB/2 万 credits）/ Enterprise（BYOC+本地部署）；分层维度=apps 数/成员/存储/credits/API key

## 4.5 Dify（文档级）

- **索引两档**：High Quality（embedding 向量）vs **Economical（每 chunk 10 关键词倒排，零 token 成本）**
- **检索三式**：向量/全文/混合；**rerank 默认关闭**，接第三方 rerank 模型
- **默认参数**：TopK=3、Score 阈值 0.5（仅 rerank 阶段生效）
- **切片两式**：General（分隔符+最大长度+overlap）vs **Parent-child 父子模式**（子块精确匹配、返回父块；父=段落或全文，全文限 1 万 token）
- 多模态 embedding（图片入索引）；外部知识库 API 接入
- **商业化**【实证，dify.ai/pricing】：Sandbox 免费（200 credits/50 文档/50MB）/ Professional（5000 credits/月、500 文档、5GB、3 成员）/ Team（1 万 credits、1000 文档、20GB、50 成员）/ Enterprise（SSO/多 workspace）/ Community 自托管——**知识文档数与存储量是分层核心杠杆**

## 4.6 Coze Studio（源码级）

- **Golang 单体分层 DDD**（backend/：api/application/bizpkg/crossdomain/domain/infra，Hz 框架）；MySQL 可换 OceanBase；17 个领域含独立 permission/openauth 域
- **knowledge 领域**（backend/domain/knowledge/）：实体=knowledge/document/**slice**/**strategy**/review
- `strategy.go` 三策略结构体【可直接抄成 TS 类型】：
  - **ParsingStrategy**：FastParsing vs AccurateParsing 两档精度、ExtractImage/ExtractTable/ImageOCR/FilterPages、Sheet 的 headerLine/dataStartLine/rowsCount、图片 CaptionType
  - **ChunkingStrategy**：chunkSize/separator/overlap/trimSpace/trimURLAndEmail + **层级切分 maxDepth/saveTitle**
  - RetrievalStrategy
- **开源版 README 明确警告存在水平越权与 SSRF 风险**——开源版非多租户安全就绪；商业版=Coze SaaS（coze.cn），定价页 404 未取得

## 4.7 行业共识模式（五产品交叉提炼）

1. **混合检索是标配**：向量 + 全文（BM25/FTS），融合方式三家分歧（MaxKB 加法/FastGPT RRF/Dify rerank 模型）——无共识，需实测
2. **rerank 可选且必须降级安全**：失败静默返回原序（FastGPT 模式）
3. **QA 增强**：LLM 为 chunk 生成问题并同建索引（MaxKB Problem 表、FastGPT q/a 对）——显著提升召回
4. **多租户/RBAC/SSO 永远是最高付费墙**（MaxKB 企业版、FastGPT 商业版、Dify Enterprise 一致）
5. **免费层杠杆**：知识文档数 + 存储量 + credits（Dify 50 文档/50MB → 1000 文档/20GB；RAGFlow 0.1→50GB）
6. **私有化买断 vs 全托管订阅双轨**：MaxKB ¥4.8 万买断+20% 年维保；FastGPT 12 万/年起托管

## 4.8 对我方的直接启示

1. **架构蓝本选 FastGPT**（TS 同构）：向量库抽象层（controller 单入口+多后端）+ worker 线程切片 + db/query 双 embedding 配置 + chunk 级 history
2. **数据模型选 MaxKB**：Knowledge→Document→Paragraph 三层 + QA 增强 + Tag 元数据过滤 + Termbase 术语库（食品行业刚需）+ directly_return_similarity 0.9 直返机制
3. **切片策略选 Coze 三策略结构**：Parsing（两档精度）/Chunking（含层级切分）/Retrieval 分离
4. **默认参数取行业交集**：chunkSize 512-1024 token、overlap 0.1-0.2（取尾）、TopK 3-5、阈值 0.5
5. **商业化分层照抄 Dify/RAGFlow**：免费层限文档数+存储+积分；多租户/SSO 留给企业版
