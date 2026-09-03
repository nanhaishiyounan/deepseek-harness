# @deepseek-ai/dsh-llm-minimax

[English](README.md) | 中文

DeepSeek Harness LLM 缝的 MiniMax chat-completions 适配器：在 `ctx.llm` 注册 `minimax` provider 路由（默认模型 `MiniMax-M3`），连接事实经 settings/credentials 分层按请求解析。

## Wire 格式

端点 OpenAI 兼容但有 MiniMax 差异，均经真实 API 验证：思考以 `<think>…</think>` 内联在 `delta.content`（无 `reasoning_content` 字段，且 `enable_thinking: false` 不生效），翻译层运行流式拆分器，即使标签跨 chunk 断裂也能分离两通道；中间 chunk 携带 `finish_reason: ""`（不是结束）；流以 usage-only chunk（`choices: []`）加连接关闭结束——没有 `[DONE]` 哨兵（网关发送时也接受）。`prompt_tokens` 含缓存命中，`mapUsage` 减去以符合缝的不相交计数约定。助手推理在历史中以模型自身输出的同款内联 `<think>` 前缀回放。

## 配置（schemastery）

```ts ignore-check
interface Config {
  apiKeyEnv?: string           // credential reference; default MINIMAX_API_KEY
  baseURL?: string             // falls back to $MINIMAX_BASE_URL, then https://api.minimaxi.com/v1
  maxTokens?: number           // default per-request output cap; default 32,768
  defaultContextWindow?: number // advisory capacity when a model entry omits one; default 200,000
  models?: CatalogModel[]      // advisory catalog; default [{ id: 'MiniMax-M3' }]
  streamIdleTimeoutMs?: number // per-read idle watchdog; default 300,000 ms
  retryPolicy?: RetryPolicyConfig
}
```

适配器对图像内容与推理力度请求抛 `UNSUPPORTED` 而非静默丢弃，尊重 `signal`，并映射 HTTP 401/403→`AUTH`、429→`RATE_LIMIT`、5xx→`SERVER`、400→`INVALID_REQUEST`。

## Model Experience

### MiniMax request

#### 模型所见

选定的 MiniMax 模型收到 harness 系统 prompt、消息历史、工具 schema、停止序列与调用配置。先前轮次的助手推理以模型自身输出的内联 `<think>…</think>` 前缀回放；图像内容在任何请求前以 `UNSUPPORTED_CONTENT` 拒绝。

#### Token 影响

提供方分词决定精确输入；`<think>` 回放把每个带推理轮次的思维链带入后续请求。`max_tokens` 限制每请求输出。

#### KV Cache 影响

缓存统计从提供方 `prompt_tokens_details.cached_tokens` 流入 `cacheReadTokens`；本适配器自身不做请求前缀缓存。模型路由变化或任何上游 prompt、schema、前缀、历史变化可能从首个变化 token 起阻止复用。

### MiniMax response

#### 模型所见

内联 `<think>` 内容分离为独立 `reasoning` 块、可见文本为 `text` 块、原始字符串工具参数为 `tool-call` 块，供循环记录与组装。

#### Token 影响

生成 token 含始终开启的内联思考，端点披露时单独报告为 `reasoningTokens`；只有循环保留的块影响后续输入。

#### KV Cache 影响

循环保留的响应块追加到下一请求并保留其更早的可复用前缀；被丢弃的块无后续缓存影响。更换 provider 或模型选择不同的缓存域。

## 已知限制与遗留工作

- **思考无法关闭** —— 模型总是内联思考；`resolveModel` 不声明推理力度，显式力度请求以 `UNSUPPORTED_REASONING_EFFORT` 失败。
- **保守的默认上下文窗口** —— 端点不披露精确窗口；200,000 默认值为顾问性质，可按目录项覆盖。
- **无图像输入** —— 适配器拒绝图像内容；支持视觉的 MiniMax 模型需要独立目录项与序列化路径。
