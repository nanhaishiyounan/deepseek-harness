# @deepseek-ai/dsh-kb-weknora

[English](README.md) | 中文

知识库 seam 的 WeKnora 存储提供者：一个 WeKnora v0.8.2 sidecar 加一把作用域 API key，加载时注册到 `ctx.kb`。seam 配置 `storeProvider: 'weknora'` 后，`kb_search` / `kb_ingest` 走 WeKnora 混合检索（召回 RRF 融合，租户配置了 rerank 则加重排）；`kb-sqlite` 保留为可用的 fallback 存储。

## 映射模型

每个 `(租户, 分类)` 对应一个 WeKnora 知识库：分类取文档 source path 的第一个 `/` 段（`food-safety/gb7718.md` → 知识库 `demo-food-co/food-safety`），首次入库时自动创建。检索解析该租户名下全部 `tenant/…` 知识库并扇出检索，既保持 seam 的租户隔离，又让语料分类直接呈现为 WeKnora 知识库列表。文档身份经 WeKnora 手工条目标题 `[docKind] sourcePath` 往返（超上限的文档追加 `#N` 分段后缀，解码时剥除）；检索到的标题解码回引用元数据，WeKnora 的字符串 id 经 FNV-1a 哈希为 seam 的数字 chunk / 文档 id。

`putDocument` 把 seam 的分块重组为一段文本并以 `status: "publish"` 创建手工条目——此后分块与嵌入由 WeKnora 异步完成（draft 默认态不进管线）。返回的 chunk 数是提交数；存量在 WeKnora 管线跑完后收敛。向量路上，store 把文本路的查询交给 hybrid-search 调用（v0.8.2 要求 `query_text`，而 seam 在该路只传向量），一次 `kb.search` 的两路共享同一查询。

## 降级契约

传输失败或 HTTP 5xx 且未配 `allowFallback` 时响亮失败（`KB_WEKNORA_UNAVAILABLE`）。配置 `allowFallback: true` 与 `fallbackPath` 后，内嵌 SQLite 存储接管入库、删除、检索与统计，fallback 命中的每条结果携带 `notice`，seam 把它提升到检索结果上（`kb_search` 渲染为一行降级提示），每次降级与恢复转换各记一条 warn/info 日志。被拒绝的请求（HTTP 4xx——凭据错误、知识库越权）永不降级：那是 fallback 会掩盖的配置错误。

## 配置（schemastery）

```ts
interface Config {
  baseUrl: string          // WeKnora app origin (no /api/v1); default http://localhost:18081
  apiKey?: string          // scoped X-API-Key; blank marks the store unavailable
  allowFallback?: boolean  // serve from the fallback store on outages; default false
  fallbackPath?: string    // SQLite db for the fallback store; required with allowFallback
  requestTimeoutMs?: number// per-request timeout; default 15,000 ms
  topK?: number            // retrieval depth per knowledge base per path; default 32
}
```

`allowFallback` 缺 `fallbackPath` 在组合加载时失败。`stats` 汇总租户各知识库的文档数；chunk 计数为零（WeKnora 异步分块且无按租户的 chunk 总数接口）。用量计量为空操作：WeKnora 在自己的审计面上计量。

## 模型体验

间接经由 kb 工具套件：本存储不注册任何提示词、schema 或工具；消费方包拥有存储与检索内容的全部模型可见投影。

#### KV Cache 影响

与模型请求流无关：存储与检索产出的是后续请求消费的工具结果，本包既不追加也不失效任何可复用请求前缀。

## 已知限制与后续工作

- **租户绑定的检索**——作用域 API key 钉死一个 WeKnora 空间，无租户过滤的 seam 检索与统计以 `KB_WEKNORA_TENANT_REQUIRED` 失败，而非跨空间检索。
- **引用元数据有损**——`collectedAt` 与 provenance 不进标题编码；命中结果不带这两项。
- **幂等替换是先删后建**——旧条目同步删除，但 WeKnora 重分块异步收敛，同名重入库后短时间内以新条目配旧 chunk 计数。
- **docKind 后置过滤**——`docKind` 限制在映射后的命中上过滤而非进入 WeKnora 检索，过滤后可能少于请求上限。
