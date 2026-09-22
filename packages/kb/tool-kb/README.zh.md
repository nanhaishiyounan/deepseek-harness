# @deepseek-ai/dsh-tool-kb

[English](README.md) | 中文

知识库缝（`ctx.kb`）上的模型可见工具 `kb_search`、`kb_ingest`、`kb_ingest_url` 与 `kb_stats`。本包拥有 schema、校验、prompt 指引、限额与呈现，绝不拥有具体 store 或 embed provider。租户是部署侧绑定（`Config.tenant`，必填）：模型从不提供租户，任何调用携带 `tenant` 参数都会被拒绝。开关控制工具注册；工具在 store 不可用时仍保持可见，执行时抛结构化错误。

## 工具

- **`kb_search`** —— 带编号引用的混合检索，限定在绑定租户内。每条结果行是 `[n] source_path — heading_path — doc_kind — chunk idx` 加段落文本；降级模式附加常驻提示，canonical value 报告 `mode: 'text' | 'hybrid'` 与 embed 身份。融合 RRF 分数低于缝的 `minRelevanceScore`（dsh-kb 配置；默认 0 保留全部命中）的命中被丢弃，无关查询因此可能返回零结果。常驻指令要求模型以 `[n]` 加文档名引用。
- **`kb_ingest`** —— 把工作区 `.md`/`.txt` 文件按 UTF-8 文本读入，或把 `.pdf`/`.docx` 文件经对应解析器（unpdf、mammoth）转文本，切片后经 `ctx.kb.ingest` 存入绑定租户；同路径重摄入替换旧文档。300 秒默认预算覆盖解析与嵌入批次。
- **`kb_ingest_url`** —— 经可选的 `ctx.web` 服务抓取一个 http(s) 页面，正文转为结构化文本后以 URL 为引用身份入库；同 URL 重摄入替换旧文档。拒绝非 2xx 响应、provider 截断的正文，以及（未设 `allowPrivateNetworks` 时）主机解析到私网/内网地址空间的任何 URL。
- **`kb_stats`** —— 文档/切片/已嵌入切片计数、embed 路由可用性，以及绑定租户的累计用量计数。

## 配置（schemastery）

```ts
interface Config {
  search?: boolean           // register kb_search; default true
  ingest?: boolean           // register kb_ingest; default true
  urlIngest?: boolean        // register kb_ingest_url; default true
  stats?: boolean            // register kb_stats; default true
  allowPrivateNetworks?: boolean  // let kb_ingest_url fetch intranet hosts; default false
  maxResults?: number        // citation cap per search; default 8
  tenant: string             // required deployment-side tenant binding
  searchTimeoutMs?: number   // default 30,000 ms
  ingestTimeoutMs?: number   // default 300,000 ms
  statsTimeoutMs?: number    // default 10,000 ms
  urlIngestTimeoutMs?: number // default 300,000 ms
  kgQuery?: boolean          // register kg_query (needs the llm seam for L1 fills); default true
  kgEdit?: boolean           // register kg_edit; default false
  kgQueryTimeoutMs?: number  // default 60,000 ms
  kgEditTimeoutMs?: number   // default 60,000 ms (includes one planning stream)
  kgLlmProvider?: string     // kg_edit planning + kg_query L1 fill provider; default 'minimax'
  kgLlmModel?: string        // kg_edit planning + kg_query L1 fill model; default 'MiniMax-M3'
}
```

各预算以 `ToolDefinition.timeoutMs` 挂到工具上，由 `@deepseek-ai/dsh-tool-call-timeout-policy` 执行。`kb_search` 与 `kb_stats` 是并发安全读；`kb_ingest` 与 `kb_ingest_url` 不是。

kg 面新增 `kg_schema`（本体浏览——含 FoodOn 锚、同义词与基数）、`kg_subgraph`（k-hop 子图读取，按实体聚合的 YAML 序列化——不存在自由图查询生成）与 `kg_query`（一条模板化中文短语——「X的供货链」「含Y的产品」「X和Y的关系」——经 `dsh-kb-graph` 内共享的 kg-nl 模块编译，与 apiproxy `kg.query` RPC 同一编译器，随后按 kg_subgraph 形态走查；不匹配时报出支持的句式并指向 kg_schema + kg_subgraph 回退）。`kg_edit`（经 `kgEdit` 选择性开启）按四步契约从一条自然语言指令改图：`propose` 对照注册表闭集规划经过校验的 KGCL 操作集并渲染 diff（不落库），`apply` 把一个已确认提案作为一个 episode 执行（`source: 'ai-edit'`，指令原文入 content、diff 入 metadata），以边记录退役代替删除并做矛盾消解，`rollback` 把一个 episode 作为反向 episode 回滚，`episodes` 列出变更账本。每次写都是一个 episode——「这条边来自哪次修改」仅凭 mention 表即可回答。

## 模型体验（Model Experience）

### 系统提示词

#### 模型看到什么

`kb_search` 贡献下列检索指引。配置关闭工具时该节一并移除。

##### kb-search 指引

```markdown
Use the kb_search tool to retrieve knowledge-base passages relevant to a question before answering it. Pass a natural-language query; optionally narrow with doc_kind (meeting, interview, report, regulation, profile, table, other) and cap results with max_results (1–8). Results are numbered citations [n] carrying the source document, heading path, and passage text. Answer from these passages and cite them as [n] with the document name; say when the knowledge base has nothing relevant instead of guessing.
```

#### Token 效应

`kb_search` 启用期间每次请求一条固定成本指引节。

#### KV Cache 效应

指引文本与可见性不变则前缀稳定；配置关闭移除该节，可能从第一个变化 token 起失效复用。

### 工具 schema

#### 模型看到什么

模型看到生成的 [`kb_search`、`kb_ingest`、`kb_ingest_url` 与 `kb_stats` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-kb)。引用上限、租户绑定、私网姿态与超时预算是部署设置，不是模型参数。

#### Token 效应

启用工具集的每次请求固定 schema 成本；配置关闭同时移除 schema 与指引。

#### KV Cache 效应

定义与可见性不变则前缀稳定；配置或生命周期变化可能从第一个变化 schema token 起失效复用。

### 检索结果

#### 模型看到什么

降级模式检索以 `(text-only mode: no embed provider is available; results come from full-text search alone)` 开头；hybrid 检索以 `(hybrid mode via <embed_model>)` 开头。每条命中是 `[n] <source_path> — <heading_path> — <doc_kind> — chunk <idx>` 加缩进段落文本。空结果输出 `No results found. Try different terms, or ingest more documents with kb_ingest first.` 触顶列表追加 `(Showing the first <count> results. Refine the query for fewer or more precise hits.)`；每个结果以 `Cite the sources above as [n] — document name and heading path — in your answer.` 结尾。

#### Token 效应

数据相关的段落会重发直至压缩；命中数受部署 `maxResults` 限制。

#### KV Cache 效应

只追加；新出现的内容跟在可复用请求前缀之后，不使既有 KV-cache 条目失效。

### 入库结果

#### 模型看到什么

文件入库成功输出 `Ingested <path> into tenant "<tenant>": document <doc_id>, <chunks> chunks, embedded via <embed_model>` 或 `stored text-only (no embed provider available)`，随后是 `Re-ingesting the same path replaces the prior document.`。URL 入库同形，路径换 URL、结尾换 `Re-ingesting the same URL replaces the prior document.`。

#### Token 效应

每次调用一行短固定成本；入库内容本身不重进模型历史。

#### KV Cache 效应

只追加；该行跟在可复用请求前缀之后，不使既有 KV-cache 条目失效。

### 统计结果

#### 模型看到什么

恰为 `Knowledge base for tenant "<tenant>": <documents> documents, <chunks> chunks (<embedded> embedded), <hybrid retrieval via <embed_model> | text-only retrieval (no embed provider available)>. Cumulative usage: <searches> searches, <documents> documents ingested (<chunks> chunks), <embed_texts> embed texts.`

#### Token 效应

每次调用一行短固定成本。

#### KV Cache 效应

只追加；该行跟在可复用请求前缀之后，不使既有 KV-cache 条目失效。

### 参数与执行错误

#### 模型看到什么

schema 校验在执行前拒绝类型错误的字段。值错误变成 `Error: <message>` —— 空查询、未知 `doc_kind`、不允许的路径扩展名、`tenant` 参数（租户由部署绑定）、畸形 `collected_at`、私网/内网 URL、非 2xx 或截断页面，或 seam 的结构化 store/embed 失败。

#### Token 效应

仅失败的调用增加这些保留 token。

#### KV Cache 效应

只追加；错误跟在可复用请求前缀之后，不使既有 KV-cache 条目失效。

## 已知限制与遗留工作

- **PDF 抽取仅限文本层** —— unpdf 读文本层；扫描图片 PDF（无 OCR）入库为空并触发无可抽取文本检查失败。
- **截断是触顶而非总量感知** —— seam 不报总命中数，`truncated` 表示结果到达上限。
- **`embed_tokens` 计零** —— MiniMax 原生 wire 只返回向量；在 provider 上报 token 用量前按 embed 文本条数计量。
