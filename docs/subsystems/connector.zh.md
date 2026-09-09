# 连接器（Connector）

[English](connector.md) | 中文

连接器缝让外部与专家数据源成为一等公民：[`ctx.connector`](../../packages/connector/connector/src/index.ts) 拥有 Provider 注册表、数据集发现/拉取路由，以及把数据集落进本部署的五步传输——pull → classify → route → deliver → confirm。Provider 自行注册（`dsh-connector-file` 面向本地投放目录，`dsh-connector-nocobase` 面向经 REST 对接的 NocoBase 业务后台）；工具消费方 `dsh-tool-connector` 把缝投影为模型可见工具。

## 发现与拉取

`discover` 把一次查询（自由文本加可选类型过滤）扇出到每个声明该能力且 `available()` 的 Provider；不可用的 Provider 被跳过——这是文档化的降级模式，缺凭据绝不拖垮其余 Provider。`fetch` 按 id 精确解析到一个 Provider，每种失败形态都有独立错误码（`CONNECTOR_PROVIDER_MISSING`、`CONNECTOR_PROVIDER_UNAVAILABLE`、`CONNECTOR_CAPABILITY_MISSING`）。数据集 id 以 Provider 为作用域；多个 Provider 共享同一 id 时，工具消费方会要求 `provider_id`。

## 统一数据包

`ConnectorDataset` 是以 `kind` 判别的闭 union：`tabular`（已解析行集加可选的已净化表名提示）、`file`（原始字节）、`document`/`expert-profile`（kb ingest 形态文本）、`service`（无可载数据的可服务化商品）。每个数据集携带 manifest——来源 Provider、更新时间、授权范围（`search`/`derive`/`share`，与 kb 和湖仓的 scope union 同构）与描述。传输副本把 manifest 的 scope 继承为确权 scope。

## 五步传输

1. **pull** —— 从 Provider `fetch` 数据集。
2. **classify** —— `tabular` → 湖仓，`document`/`expert-profile` → kb，`file` → 共享数据路由器（`@deepseek-ai/dsh-lakehouse/data-router`），连接器传输与工作台上传因此共用同一路由真相；`service` 拒绝（`CONNECTOR_TRANSFER_UNSUPPORTED_KIND`），显式 `target` 与分类不一致时拒绝（`CONNECTOR_TRANSFER_TARGET_MISMATCH`）。
3. **route** —— 解析湖仓 `load` 请求（表身份、确权 `connector:<providerId>`）或 kb `ingest` 请求（命名空间化 source path、Provider 确权、继承 scope）。
4. **deliver** —— 经目的地缝执行。两侧落地均为覆写语义：重跑替换旧表或旧文档。
5. **confirm** —— 追加 catalog 传输记录（`ctx.lakehouse.recordTransfer`），携带目的地、行数与时间戳。

## 失败语义

每一步都以机读错误码 fail-loud。落地成功但确认失败抛 `CONNECTOR_CONFIRM_FAILED`，点名已落地内容并说明重试可收敛；目的地缝缺失抛 `CONNECTOR_LAKEHOUSE_MISSING`/`CONNECTOR_KB_MISSING`；路由拒绝以 `CONNECTOR_ROUTE_<REASON>` 透出；非 UTF-8 文本与 pdf/docx 文件（其抽取今天归网关上传通道所有）以独立错误码拒绝。用量计量走目的地缝：湖仓落地计 `loadedTables`，kb 落地计 `ingestedDocuments`。

Source: [`packages/connector/connector/src/index.ts`](../../packages/connector/connector/src/index.ts) · [`packages/connector/tool-connector/src/index.ts`](../../packages/connector/tool-connector/src/index.ts)
<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxconnector--connectorruntime"></a>

### `ctx.connector` — `ConnectorRuntime`

The connector service. Registered as `ctx.connector` (one instance per context). Discover fans out to every available provider declaring the capability and skips unavailable ones (the documented degraded mode — a missing credential must not fail the providers that work); fetch resolves exactly one provider and fails loud when it is missing, unavailable, or lacks the capability.

```ts cordis-catalog
/**
 * Register a connector provider. Throws {@link ConnectorError}
 * `CONNECTOR_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param provider - the connector provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerProvider(provider: ConnectorProvider): () => void

/**
 * Registered provider ids in registration order, for observability surfaces.
 * @returns the registered provider ids.
 */
providerIds(): readonly string[]

/**
 * Every registered provider with its live availability and declared
 * capabilities, for connector-catalog surfaces (the connector page). A
 * provider absent from this list is not registered; an unavailable one
 * carries its credentials-missing state rather than being hidden.
 * @returns provider views ordered by id.
 */
describeProviders(): readonly ConnectorProviderView[]

/**
 * List datasets across every available provider declaring `discover`.
 * Unavailable providers are skipped (degraded, not failed); an available
 * provider that errors mid-discover fails the whole call loud.
 * @param request - query text and optional kind restriction.
 * @param signal - cancellation signal forwarded to every provider.
 * @returns merged summaries, ordered by provider id then dataset id.
 */
async discover(request: ConnectorDiscoverRequest, signal?: AbortSignal): Promise<readonly ConnectorDatasetSummary[]>

/**
 * Pull one dataset's full content packet from its provider.
 * @param ref - the dataset address.
 * @param signal - cancellation signal forwarded to the provider.
 * @returns the unified dataset packet.
 */
async fetch(ref: ConnectorDatasetRef, signal?: AbortSignal): Promise<ConnectorDataset>

/**
 * Run the five-step transfer: pull the dataset, classify its destination
 * (kind-driven; file bytes go through the shared data router so connector
 * transfers and workbench uploads route by one truth), deliver to the kb
 * (`ingest`, overwrite-shaped) or the lakehouse (`load`, overwrite-shaped),
 * and confirm by appending the catalog transfer record. Usage metering rides
 * the destination seams (a load counts `loadedTables`, an ingest counts
 * `ingestedDocuments`). Both landings are idempotent under retry, so a
 * confirm failure retries the same transfer safely.
 * @param request - source address, owning tenant, and target pin.
 * @param signal - cancellation signal honored across every step.
 * @returns the landing receipt and the catalog transfer-record id.
 */
async transfer(request: ConnectorTransferRequest, signal?: AbortSignal): Promise<ConnectorTransferResult>
```

Source: [`packages/connector/connector/src/index.ts`](../../packages/connector/connector/src/index.ts)

<a id="ctxorders--ordersruntime"></a>

### `ctx.orders` — `OrdersRuntime`

The orders service: order lifecycle plus the deliverable pipeline, bound to one NocoBase source of truth. Registered as `ctx.orders`.

```ts cordis-catalog
/**
 * Resolve the ordered service, snapshot identity and pricing, and land a
 * `pending` order at the source of truth.
 * @param request - the ordered service, brief, and optional client name.
 * @param signal - caller cancellation.
 * @returns the stored pending order.
 */
async create(request: OrderCreateRequest, signal?: AbortSignal): Promise<OrderRecord>

/**
 * Read one order by its primary key.
 * @param orderId - the NocoBase orders row id.
 * @param signal - caller cancellation.
 * @returns the stored order, or `undefined` when the source has no such row.
 */
async get(orderId: number | string, signal?: AbortSignal): Promise<OrderRecord | undefined>

/**
 * List orders (newest rows last, source order, one page).
 * @param signal - caller cancellation.
 * @returns every stored order row on the page.
 */
async list(signal?: AbortSignal): Promise<readonly OrderRecord[]>

/**
 * Run the deliverable pipeline for one order: transition to `generating`,
 * retrieve kb references, draft the proposal (model stream or the named
 * template fallback), typeset it through expert-pdf, land the PDF under
 * the configured deliverables directory, and write `delivered` with the
 * path back at the source. A failure writes `failed` with the cause and
 * rethrows; a `failed` order may be fulfilled again (retry).
 * @param orderId - the NocoBase orders row id.
 * @param signal - caller cancellation.
 * @returns the stored order in `delivered` status.
 */
async fulfill(orderId: number | string, signal?: AbortSignal): Promise<OrderRecord>

/**
 * Read one delivered order's PDF deliverable.
 * @param orderId - the NocoBase orders row id.
 * @param signal - caller cancellation.
 * @returns the landed file's path and bytes.
 */
async readDeliverable(orderId: number | string, signal?: AbortSignal): Promise<OrderDeliverableFile>
```

Source: [`packages/expert/expert-orders/src/index.ts`](../../packages/expert/expert-orders/src/index.ts)
<!-- END GENERATED cordis-surface -->
