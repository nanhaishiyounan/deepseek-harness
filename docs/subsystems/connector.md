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
