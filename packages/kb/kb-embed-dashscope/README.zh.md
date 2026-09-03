# @deepseek-ai/dsh-kb-embed-dashscope

[English](README.md) | 中文

知识库缝的 DashScope embed provider：经 OpenAI 兼容 `/embeddings` 端点提供 `text-embedding-v4`（1024 维），按提供方上限每批十条、指数退避重试、凭据门控——缺凭据时 provider 保持注册但不可用，缝将其报告为 text-only 降级检索。

## Wire 格式

请求携带 `{model, input, dimensions}`；响应返回含 `index` 与 `embedding` 的 `data[]`，provider 按 index 重排并在 wire 边界校验数量与维度。HTTP 401/400 不重试、直接失败；429/5xx 与网络错误重试。

## 配置（schemastery）

```ts
interface Config {
  apiKeyEnv?: string    // credential reference; default DASHSCOPE_API_KEY
  baseURL?: string      // endpoint base; default https://dashscope.aliyuncs.com/compatible-mode/v1
  model?: string        // embedding model; default text-embedding-v4
  dimensions?: number   // vector dimensionality; default 1024
  batchSize?: number    // texts per request; default 10 (provider cap)
  timeoutMs?: number    // per-request timeout; default 30,000 ms
  maxRetries?: number   // retries for HTTP 429/5xx and network errors; default 3
  backoffBaseMs?: number // base delay of the exponential retry backoff; default 100 ms
  backoffMaxMs?: number  // cap on one backoff delay; default 2,147,483,647 ms (Node's setTimeout ceiling, effectively unbounded)
}
```

凭据解析是对 `apiKeyEnv` 的同步启动环境查找。

## Model Experience

间接：经 kb 工具套件生效。本 provider 不注册任何 prompt、schema 或工具；向量只改变检索质量与工具呈现的 `mode`/`embed_model` 字段。

#### KV Cache 影响

与模型请求流无关：向量调用发生在工具执行内，本包既不追加也不失效任何可复用请求前缀。

## 已知限制与遗留工作

- **批量上限十条** —— 提供方拒绝更大批次，入库吞吐随请求数线性扩展。
- **单一模型与维度** —— 目录项仅覆盖 1024 维的 `text-embedding-v4`；其他 DashScope 模型需按各自限制校验配置覆盖。
- **无请求级限流** —— 仅指数退避重试；持续 429 以失败上浮，由缝包装为 `KB_EMBED_FAILED`。
- **仅从启动环境解析凭据** —— `apiKeyEnv` 只经启动环境（进程环境与 `.env` 层）解析，不查托管凭据库，因为 `EmbedProvider.available()` 是同步探测。仅通过 Web Models 页存入的 key 会让本 provider 不可用（检索降级为纯文本），而经凭据服务解析的 chat 适配器仍可应答。要让两者同时可用，请导出该变量或写入 `.env`；统一解析需要在缝上提供异步可用性探测，而凭据服务的逐操作重解析契约目前禁止缓存式实现。
