# @deepseek-ai/dsh-kb

[English](README.md) | 中文

知识库能力缝（`ctx.kb`）的 Service Definition：store 与 embed provider 注册表，加上入库/检索编排（切片 → 向量化 → 存储；全文与向量两路经倒数排名融合）。缺少 embed provider 是文档化的降级模式——检索仅走全文路径，并通过结果 `mode` 与 `stats` 显式声明。

## 服务 API

`KbRuntime`（默认导出）挂载为 `ctx.kb`：

- `registerStoreProvider(store)` / `registerEmbedProvider(provider)` —— 注册表写入；重复 id 抛 `KbError` `KB_DUPLICATE_PROVIDER`；均返回 fiber 作用域的 disposer。
- `ingest(request, signal?)` —— 对 `request.content` 做结构感知 Markdown 切片，存在可用 embed provider 时对切片文本向量化，再存储文档。同 `(tenantId, sourcePath)` 重复入库经 store 替换旧文档。
- `search(request, signal?)` —— 全文路径恒执行；可用 embed provider 追加向量排名；两路经 RRF 融合。结果携带 `mode: 'hybrid' | 'text'`，hybrid 模式附带 embed 标识。
- `stats(tenantId?, signal?)` —— store 计数，外加 `embedAvailable` / `embedModel` 路由可观测性。
- `deleteDocument(tenantId, sourcePath, signal?)` —— 按身份删除一份文档。

`(tenantId, sourcePath)` 是文档身份；`tenantId` 是硬隔离键，作用于两路检索与计数。

## Provider 选择

Store 选择在执行时解析，绝不依赖注册顺序：

| 条件 | 结果 |
|---|---|
| 配置的 id 已注册且 `available()` | 该 store |
| 配置的 id 未注册 | `KB_STORE_CONFIGURED_MISSING` |
| 配置的 id 已注册但不可用 | `KB_STORE_CONFIGURED_UNAVAILABLE` |
| 未配置 id，恰好一个可用 store | 该 store |
| 未配置 id，多个可用 store | `KB_STORE_AMBIGUOUS` |
| 未配置 id，无可用 store | `KB_STORE_UNAVAILABLE` |

Embed 选择附加降级模式：无可用 provider（从未配置、配置但不可用、注册但不可用）使检索降级为纯文本 `mode: 'text'`，每次降级转换记录一条日志。仅"配置的 id 根本未注册"抛错（`KB_EMBED_CONFIGURED_MISSING`）——那是组合错误而非运行时状态。入库或检索中的 embed 调用失败抛 `KbError` `KB_EMBED_FAILED`，provider 失败链在 `cause`；降级只覆盖配置状态，不覆盖运行时故障。

## 配置（schemastery）

```ts
interface KbRuntimeConfig {
  storeProvider?: string   // explicit store id; omitted = auto-select
  embedProvider?: string   // explicit embed id; omitted = auto-select
  chunkMaxTokens?: number  // default 512
  chunkOverlapTokens?: number // default 50
  rrfK?: number            // RRF rank damping; default 60
  minRelevanceScore?: number // minimum fused RRF score to keep a hit; default 0 (keep every hit)
  vectorTopK?: number      // vector-path candidates per search; default 32
  textTopK?: number        // text-path candidates per search; default 32
  maxResults?: number      // default result cap; default 8
}
```

`minRelevanceScore` 按融合 RRF 分数过滤命中，hybrid 与 text-only 两路一致（text-only 排名同样经单路 RRF 计分），无关查询因此可能解析为零结果。RRF 分数是按排名阻尼的倒数：单路命中的分数至多 `1/(rrfK+1)`，双路命中至多 `2/(rrfK+1)`。kb-agent 语料实测标定（embo-01，k=60，Agent Note 2026-09-02-kb-relevance-threshold）：乱码查询的分数恰以 `1/(rrfK+1)` 封顶——其全文路径零命中——而约 28% 的 eval gold 文档以同样的分数只走单路，因此不存在既能滤掉乱码查询又能保住这些命中的阈值。不超过 `1/(rrfK+1)` 的阈值只修剪深排名；超过它则只保留双路命中。

## 扩展点

- `KbStore` —— 存储后端契约（`putDocument`、`deleteDocument`、`textSearch`、`vectorSearch`、`stats`、`available`）。`putDocument` 事务化且按覆盖语义执行。
- `EmbedProvider` —— 向量化后端契约（`embed`、`available`、`modelId`、`dimensions`）。可用性是廉价的本地检查（凭据存在）；网络只发生在 `embed` 内部。

切片器（`chunkMarkdown`、`estimateTokens`）与 RRF 融合（`fuseRrf`）导出供 provider 无关的复用与测试。

## 事件

无。检索结果仅经工具消费者的 tool result 到达模型，session log 已记录该结果；本缝不新增模型可见输入，因此不需要 `SessionEventMap` 成员。

## Model Experience

Indirectly, through the kb tool suite: this seam registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of ingest and search outcomes.

#### KV Cache effect

Independent of the model request stream: ingest and search produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **无 rerank 阶段** —— 混合检索只融合两路排名；rerank provider 缝推迟到评测证实时再引入。
- **Markdown 优先切片** —— 切片器对 Markdown 标题、表格与中文句读做结构感知；其他格式需要上游解析 provider。
- **线性向量扫描假设** —— 缝的 `vectorTopK` 契约假设 store 能在 MVP 语料规模下廉价扫描候选；无法满足该假设的 store 自担索引责任。
