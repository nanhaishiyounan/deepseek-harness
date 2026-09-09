# @deepseek-ai/dsh-connector-nocobase

English | [中文](README.zh.md)

NocoBase connector provider (`connector-nocobase` on `ctx.connector`): a minimal REST client speaking the resourcer's wire semantics under `Authorization: Bearer <token>` (list, get, and create), and the collection mapping that turns three NocoBase collections into connector datasets — `experts` rows into expert-profile documents that carry the expert's service catalog (deliverable + pricing per offering), `datasets` rows into tabular datasets (rows pulled from the source collection the row names) or inline documents by the row's own kind, `expert_services` rows into service offerings with their published pricing. Discovery summaries carry structured card fields: the expert's affiliation and domain tags, and each service's full reference.

## Wire semantics

- **`GET /api/<collection>:list`** — URL-encoded JSON `filter`, `page`, `pageSize`, plus optional `sort` (comma-joined, `-` prefix = descending), `fields` (column projection), and `appends` (relation expansion); the paged envelope `{count, rows, page, pageSize}`. Discover translates free-text queries into `$includes` filters over each collection's searchable fields.
- **`GET /api/collections:listMeta`** — one unpaginated answer whose `data` array carries every runtime collection definition (name, title, fields with relation targets, `filterTargetKey`); the schema-discovery surface the nb_* tools and the apiproxy nocobase domain project onto their views.
- **`GET /api/<collection>/<id>`** — REST-style row get with optional `appends`; a 404 reads back as `CONNECTOR_DATASET_MISSING`.

The package also owns the **restricted filter vocabulary** every NocoBase consumer accepts: flat `{field, op: eq|in|gt|lt, value}` conditions joined by one and/or, compiled onto the NocoBase filter tree (`compileNbFilter`). Arbitrary operator trees never cross a consumer boundary.
- Timeouts combine with the caller's signal; one transport-level retry (connection reset, DNS blip) precedes the `NOCOBASE_NETWORK_ERROR` refusal; HTTP failures surface as `NOCOBASE_HTTP_ERROR` with status and a body excerpt — they never retry.

## Credentials and degradation

The base url comes from config or `NOCOBASE_BASE_URL`; the token resolves through the credentials seam first (`apiKeyEnv`, default `NOCOBASE_API_KEY`), then the trusted launch environment. Without both, the provider still registers but reads `available() === false` — discovery skips it and direct fetch fails loud (`CONNECTOR_PROVIDER_UNAVAILABLE`). Availability is resolved once at load (the registry's gate is I/O-free by design); a changed key needs a composition reload.

## Configuration (schemastery)

- `baseUrl?: string` — server origin; omitted = the `NOCOBASE_BASE_URL` environment variable.
- `apiKeyEnv?: string` — credential reference for the token (default `NOCOBASE_API_KEY`).
- `timeoutMs?: number` — per-request timeout (default `15000`).
- `listPageSize?: number` — discovery page size per collection (default `100`).
- `fetchRowsCap?: number` — row cap for one tabular dataset fetch (default `1000`).

## Model Experience

Indirectly, through the tool consumer `dsh-tool-connector`: this provider registers no prompt, schema, or tool of its own, so every model-facing projection of the mapped NocoBase datasets belongs to that package.

#### KV Cache effect

Independent of the model request stream: REST lists and gets produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- The client covers list, get, create, and primary-key update (the seeding and ordering channels use these): destroy, attachments (`attachments:upload`/`attachments:create`), and workflow surfaces arrive with the batches that consume them (N6 attachment delivery).
- Dataset ids are `<collection>/<row id>` addresses scoped to this provider's mapping; a NocoBase collection named with a `/` would need an escaping rule (none exists today).
- The tabular fetch pulls a single page up to `fetchRowsCap`; datasets larger than the cap truncate silently on the wire side — a paging loop waits for a real dataset that exceeds it.
- Fixture rows (the 张红喜 skeleton) live in the package's mock server; N4 seeds the real instance and shares the authoritative JSON with it.
