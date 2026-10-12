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

<a id="ctxcarbon--carbonservice"></a>

### `ctx.carbon` — `CarbonService`

The carbon capability surface (`ctx.carbon`): the catalog projection plus the table CRUD over the live session client. The service stays registered without credentials; every data method then throws the structured no-credentials refusal (the documented degraded mode).

```ts cordis-catalog
/**
 * The credential-backed usability check.
 * @returns true when a credential-backed client composed; `false` in the degraded mode.
 */
available(): boolean

/**
 * The live session (authenticating on demand).
 * @param signal - caller cancellation.
 * @returns the ensured GoTrue session; refused in the degraded mode.
 */
async session(signal?: AbortSignal): Promise<CarbonSession>

/**
 * The business-table catalog projection.
 * @returns the module groups (navigation order) and the full table metadata roster.
 */
catalog(): { modules: readonly { id: string; label: string }[]; tables: readonly CarbonTableMeta[] }

/**
 * Query one catalog table's rows.
 * @param table - the camelCase table name (must be on the catalog).
 * @param options - filters, ordering, paging.
 * @param signal - caller cancellation.
 * @returns the matched row count and the page of rows.
 */
async list( table: string, options: CarbonListOptions = {}, signal?: AbortSignal, ): Promise<{ count: number; rows: Record<string, unknown>[] }>

/**
 * Read one catalog row by its key column value (the composite-key stock
 * table addresses by `itemId`; every other table by its prefixed `id`).
 * @param table - the camelCase table name (must be on the catalog).
 * @param id - the row key (`item_WgSb…`, or an itemId for the stock table).
 * @param signal - caller cancellation.
 * @returns the row, or undefined when no row matches the key.
 */
async get(table: string, id: string, signal?: AbortSignal): Promise<Record<string, unknown> | undefined>

/**
 * Insert one row into a `write`-risk catalog table (read-tier tables
 * refuse: postings like stock movements belong to composite
 * server-functions with no Data API surface).
 * @param table - the camelCase table name (must be on the catalog at write risk).
 * @param values - the row's column values (companyId injected when absent).
 * @param signal - caller cancellation.
 * @returns the inserted row as the server stored it.
 */
async create(table: string, values: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>

/**
 * Patch one row of a `write`-risk catalog table.
 * @param table - the camelCase table name (must be on the catalog at write risk).
 * @param id - the row id.
 * @param values - the columns to change.
 * @param signal - caller cancellation.
 * @returns the patched row as the server stored it.
 */
async update(table: string, id: string, values: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>>
```

Source: [`packages/connector/connector-carbon/src/index.ts`](../../packages/connector/connector-carbon/src/index.ts)

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
<!-- END GENERATED cordis-surface -->
