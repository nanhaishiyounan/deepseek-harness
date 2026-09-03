# @deepseek-ai/dsh-kb-embed-shared

[English](README.md) | 中文

知识库能力缝 embed 供应商包（`@deepseek-ai/dsh-kb-embed-minimax`、`@deepseek-ai/dsh-kb-embed-dashscope`）共享的传输核心：瞬时失败分类、带倒置区间 fail-loud 守卫的抖动指数退避，以及编排它们的重试循环。本包不注册任何插件、不持有任何线上格式；请求体、响应解码与 cordis 配置仍归各供应商包所有。

## 导出

- `HttpEmbedError` —— 携带供应商响应 HTTP 状态的传输失败。
- `isRetryable(error, status?)` —— HTTP 429/5xx 与网络层 `TypeError` 拒绝视为瞬时；其余立即上抛。
- `backoffDelay(attempt, baseMs, maxMs)` —— 单次抖动延迟：`min(baseMs × 2^attempt, maxMs)` 的均匀 50–100% 比例。
- `backoff(attempt, signal, baseMs, maxMs)` —— 等待一个延迟槽，信号中止时提前结束。
- `withEmbedRetries(request, options, signal, label)` —— 按共享重试策略执行一次可嵌入请求，并输出逐次尝试的 debug 诊断。
- `assertBackoffOrdered(baseMs, maxMs)` —— 下文的 fail-loud 守卫。
- `EmbedRetryOptions`、`DEFAULT_BACKOFF_BASE_MS`（100）、`DEFAULT_BACKOFF_MAX_MS`（2,147,483,647 —— Node `setTimeout` 上限，等效不设限）。

## Fail-loud 退避守卫

`backoffBaseMs > backoffMaxMs` 是配置错误而非调度参数：供应商在构造时调用 `assertBackoffOrdered`，倒置区间会在插件加载时抛出 `[kb-embed] backoffBaseMs (…) must be less than or equal to backoffMaxMs (…)`。这与 `@deepseek-ai/dsh-llm` 中 `resolveBackoff` 的解析期校验同构，而不是等到第一次重试才计算出无意义的封顶延迟。

## Model Experience

间接：通过各供应商 embed 包生效。本包不注册任何插件、prompt、schema 或工具；它只影响工具执行内部的重试时序。

#### KV Cache effect

与模型请求流无关：嵌入重试发生在工具执行内部，本包既不追加也不失效任何可复用请求前缀。

## Known Limitations and Deferred Work

- **仅 embed 缝词汇** —— 重试循环只讲 embed 供应商的统一策略（429/5xx/网络、均匀 50–100% 抖动）。`@deepseek-ai/dsh-llm` 更丰富的 `RetryPolicySchema`（模式、`retryableCodes`、`jitterRatio`）刻意不引入：embed 缝用不上该词汇，引入会让工具包耦合 LLM 能力。
- **无插件面** —— 这是供两个供应商包消费的库；组合、凭据与配置都在那边。
