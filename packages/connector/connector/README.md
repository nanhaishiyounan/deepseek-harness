# @deepseek-ai/dsh-connector

English | [中文](README.zh.md)

Connector capability seam (`ctx.connector`): the provider registry, dataset discovery and fetch routing, and the five-step transfer orchestration that lands external datasets in this deployment — pull → classify (the lakehouse seam's shared data router for file bytes, kind-driven otherwise) → route → deliver (kb ingest or lakehouse load) → confirm (a catalog transfer record). The seam owns no provider: file sets, NocoBase, and later upstreams register themselves.

## Service contract

- **`registerProvider(provider): () => void`** — registers one `ConnectorProvider` (`id`, I/O-free `available()`, startup `capabilities`, `discover(request)`, `fetch(ref)`); a duplicate id throws `CONNECTOR_DUPLICATE_PROVIDER`. Registration is an effect: the disposer removes it, and disposing the mounting fiber removes it too.
- **`discover(request, signal)`** — fans the query (free text plus optional kind restriction) to every available provider declaring `discover` and merges the summaries ordered by provider id then dataset id. Unavailable providers are skipped — the documented degraded mode (a missing credential must not fail the providers that work); an available provider erroring mid-discover fails the whole call loud.
- **`fetch(ref, signal)`** — resolves exactly one provider (`CONNECTOR_PROVIDER_MISSING` / `CONNECTOR_PROVIDER_UNAVAILABLE` / `CONNECTOR_CAPABILITY_MISSING` otherwise) and returns the unified `ConnectorDataset` packet.
- **`transfer(request, signal)`** — the five-step orchestration below; every step fails loud with a machine-readable code.

## The dataset packet

`ConnectorDataset` is a discriminated union keyed by `kind`: `tabular` (parsed `TabularData`, optional sanitized `tableName` hint), `file` (raw bytes routed at transfer time), `document`/`expert-profile` (kb-ingest-shaped text), `service` (a serviceable offering with no data payload). The manifest carries the source provider, update time, authorization scope, and a description. `ConnectorScope` mirrors the kb/lakehouse scope unions: transferred copies inherit it as their provenance scope.

## The transfer protocol (five steps)

1. **pull** — `fetch` the dataset from its provider.
2. **classify** — `tabular` → lakehouse, `document`/`expert-profile` → kb, `file` → `resolveDataRoute(filename, bytes, mime)` from `@deepseek-ai/dsh-lakehouse/data-router` (one routing truth shared with the workbench upload channel; csv/xlsx/json parse through the shared `./tabular` parsers), `service` → refuses `CONNECTOR_TRANSFER_UNSUPPORTED_KIND`. A pinned `target` that disagrees refuses `CONNECTOR_TRANSFER_TARGET_MISMATCH`.
3. **route** — resolve the delivery: a lakehouse `load` request (table identity + provenance `connector:<providerId>` + collectedSource datasetId) or a kb `ingest` request (namespaced source path, provider provenance, inherited scope).
4. **deliver** — execute through the destination seam. Both landings are overwrite-shaped: re-running a transfer replaces the prior table or document instead of duplicating.
5. **confirm** — append the catalog transfer record (`LakehouseRuntime.recordTransfer`) with the landing destination, row count, and timestamp; usage metering rides the destination seams (a load counts `loadedTables`, an ingest counts `ingestedDocuments`).

**Failure semantics.** A landing that succeeds but cannot be confirmed throws `CONNECTOR_CONFIRM_FAILED` naming what landed and stating that a retry converges (both landings are overwrite-shaped); an absent destination seam throws `CONNECTOR_LAKEHOUSE_MISSING`/`CONNECTOR_KB_MISSING`; router refusals surface as `CONNECTOR_ROUTE_<REASON>`; non-UTF-8 text and pdf/docx files (whose extraction the gateway upload channel owns today) refuse with distinct codes.

## Configuration (schemastery)

None — the seam has no tunables. Providers register themselves with their own configs (`dsh-connector-file`, `dsh-connector-nocobase`); the tool consumer (`dsh-tool-connector`) owns the tenant binding.

## Model Experience

Indirectly, through the tool consumer `dsh-tool-connector`: this seam registers no prompt, schema, or tool of its own, so every model-facing projection of connector datasets and transfers belongs to that package.

#### KV Cache effect

Independent of the model request stream: discovery, fetch, and transfer produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- File-kind kb landings decode `.md`/`.txt` only; pdf/docx extraction stays with the gateway's upload channel until a shared extractor package exists (`CONNECTOR_FILE_HANDLER_MISSING` names the supported set).
- Connector-operation counters (discoveries/fetches per tenant) ride the destination seams' own usage meters; a dedicated connector counter store waits for its first consumer (N4/N5 bring order metering).
- Transfer-record listing has no seam surface yet: `recordTransfer` appends and returns the id, and the audit trail is read straight from the catalog store (the kb-agent demo script shows the sqlite read); a listing API arrives with its first UI consumer.
- Discover pagination is provider-side (each provider pages internally up to its configured page size); a seam-level cursor protocol waits for a provider that actually exceeds it.
