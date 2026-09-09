# Connector

English | [中文](connector.zh.md)

The connector seam makes external and expert data sources first-class: [`ctx.connector`](../../packages/connector/connector/src/index.ts) owns the provider registry, dataset discovery/fetch routing, and the five-step transfer that lands a dataset in this deployment — pull → classify → route → deliver → confirm. Providers register themselves (`dsh-connector-file` for a local drop-in directory, `dsh-connector-nocobase` for a NocoBase business backend over REST); the tool consumer `dsh-tool-connector` projects the seam into model-facing tools.

## Discovery and fetch

`discover` fans one query (free text plus an optional kind filter) across every provider that declares the capability and is `available()`; unavailable providers are skipped — the documented degraded mode, so a missing credential never fails the providers that work. `fetch` resolves exactly one provider by id and fails loud with a distinct code per failure shape (`CONNECTOR_PROVIDER_MISSING`, `CONNECTOR_PROVIDER_UNAVAILABLE`, `CONNECTOR_CAPABILITY_MISSING`). Dataset ids are provider-scoped; the tool consumer demands a `provider_id` when several providers share one id.

## The unified dataset packet

`ConnectorDataset` is a closed discriminated union keyed by `kind`: `tabular` (parsed rows plus an optional sanitized table-name hint), `file` (raw bytes), `document`/`expert-profile` (kb-ingest-shaped text), and `service` (a serviceable offering with no data payload). Every dataset carries a manifest — source provider, update time, authorization scope (`search`/`derive`/`share`, isomorphic to the kb and lakehouse scope unions), and a description. Transferred copies inherit the manifest's scope as their provenance scope.

## The five-step transfer

1. **pull** — `fetch` the dataset from its provider.
2. **classify** — `tabular` → lakehouse, `document`/`expert-profile` → kb, `file` → the shared data router (`@deepseek-ai/dsh-lakehouse/data-router`), so connector transfers and workbench uploads route by one truth; `service` refuses (`CONNECTOR_TRANSFER_UNSUPPORTED_KIND`), and a pinned `target` that disagrees with classification refuses (`CONNECTOR_TRANSFER_TARGET_MISMATCH`).
3. **route** — resolve a lakehouse `load` request (table identity, provenance `connector:<providerId>`) or a kb `ingest` request (namespaced source path, provider provenance, inherited scope).
4. **deliver** — execute through the destination seam. Both landings are overwrite-shaped: a re-run replaces the prior table or document.
5. **confirm** — append the catalog transfer record (`ctx.lakehouse.recordTransfer`) carrying the destination, row count, and timestamp.

## Failure semantics

Every step fails loud with a machine-readable code. A landing whose confirm fails throws `CONNECTOR_CONFIRM_FAILED` naming what landed and stating that a retry converges; absent destination seams throw `CONNECTOR_LAKEHOUSE_MISSING`/`CONNECTOR_KB_MISSING`; router refusals surface as `CONNECTOR_ROUTE_<REASON>`; non-UTF-8 text and pdf/docx files (whose extraction the gateway upload channel owns today) refuse with distinct codes. Usage metering rides the destination seams: a lakehouse landing counts `loadedTables`, a kb landing counts `ingestedDocuments`.

Source: [`packages/connector/connector/src/index.ts`](../../packages/connector/connector/src/index.ts) · [`packages/connector/tool-connector/src/index.ts`](../../packages/connector/tool-connector/src/index.ts)
<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

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
