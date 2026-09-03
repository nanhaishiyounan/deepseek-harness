# @deepseek-ai/dsh-kb-embed-minimax

[English](README.md) | 中文

知识库缝的 MiniMax embed provider：经 MiniMax `/embeddings` 端点提供 `embo-01`（1536 维），批量请求、指数退避重试、凭据门控——缺凭据时 provider 保持注册但不可用，缝将其报告为 text-only 降级检索。

## Wire 格式

端点是 MiniMax 原生协议而非 OpenAI 兼容：输入以 `texts` 携带且 `type` 字段必填；业务失败出现在 HTTP 200 的 `base_resp.status_code` 内；鉴权失败同时使用 HTTP 状态码与错误信封。provider 对文档与查询对称地发送 `type: "query"`：针对真实端点实测，对称 query 编码对相关/不相关文本的区分度不低于非对称 db/query 组合，而缝的单一 `embed()` 调用点无法区分两种角色。

## 配置（schemastery）

```ts
interface Config {
  apiKeyEnv?: string    // credential reference; default MINIMAX_API_KEY
  baseURL?: string      // endpoint base; default https://api.minimaxi.com/v1
  model?: string        // embedding model; default embo-01
  dimensions?: number   // vector dimensionality; default 1536
  batchSize?: number    // texts per request; default 32 (the live endpoint accepted 128)
  timeoutMs?: number    // per-request timeout; default 30,000 ms
  maxRetries?: number   // retries for HTTP 429/5xx and network errors; default 3
  backoffBaseMs?: number // base delay of the exponential retry backoff; default 100 ms
  backoffMaxMs?: number  // cap on one backoff delay; default 2,147,483,647 ms (Node's setTimeout ceiling, effectively unbounded)
}
```

凭据解析是对 `apiKeyEnv` 的同步启动环境查找。HTTP 401/400 与 `base_resp` 业务失败不重试、直接失败；维度与数量不符在 wire 边界拒绝。

## Model Experience

间接：经 kb 工具套件生效。本 provider 不注册任何 prompt、schema 或工具；向量只改变检索质量与工具呈现的 `mode`/`embed_model` 字段。

#### KV Cache 影响

与模型请求流无关：向量调用发生在工具执行内，本包既不追加也不失效任何可复用请求前缀。

## 已知限制与遗留工作

- **对称 `type: "query"` 编码** —— 缝的 `EmbedProvider.embed()` 没有文档/查询角色参数，两侧都用 query 编码；若实测召回要求非对称编码，缝增加角色字段是升级路径。
- **固定 1536 维模型** —— `embo-01` 不支持配置维度；其他模型需要独立目录项与维度覆盖。
- **无请求级限流** —— 仅指数退避重试；持续 429 以失败上浮，由缝包装为 `KB_EMBED_FAILED`。
- **仅从启动环境解析凭据** —— `apiKeyEnv` 只经启动环境（进程环境与 `.env` 层）解析，不查托管凭据库，因为 `EmbedProvider.available()` 是同步探测。仅通过 Web Models 页存入的 key 会让本 provider 不可用（检索降级为纯文本），而经凭据服务解析的 chat 适配器仍可应答。要让两者同时可用，请导出该变量或写入 `.env`；统一解析需要在缝上提供异步可用性探测，而凭据服务的逐操作重解析契约目前禁止缓存式实现。
