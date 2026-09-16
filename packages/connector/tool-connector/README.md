# @deepseek-ai/dsh-tool-connector

English | [中文](README.zh.md)

Model-facing `connector_discover`, `connector_fetch`, `connector_transfer`, `order_create`, `order_status`, and `assets_browse` tools over the connector seam (`ctx.connector`) and the optional orders seam (`ctx.orders`). This package owns schemas, validation, prompt guidance, budgets, and presentation, never concrete providers. The tenant is a deployment-side binding (`Config.tenant`, required): the model never supplies one, and a `tenant` argument on any call is rejected. Enablement controls tool registration; an enabled tool remains visible when no provider is usable and fails with a structured error at execution time — the seam's documented degraded mode.

## Tools

- **`connector_discover`** — searches every usable connector provider for datasets, expert profiles, and expert services. Expert entries render as cards (affiliation, domain tags, the expert's orderable services with deliverable and pricing); a service attached to a discovered expert folds into that expert's card, unattached services keep their own section, and data datasets list with their provider and dataset ids — the addresses the follow-up tools take. An empty result says so explicitly instead of an empty list. Default budget 15 s; concurrency-safe (read-only fan-out).
- **`connector_fetch`** — previews one dataset: the first 8 rows of tabular content with a truncation note, a 400-character excerpt of a document or expert profile, a file's receipt and decodable text head, or a service offering. Resolves the dataset id to its sole owning provider, demands `provider_id` when several share it, and refuses unknown ids loud. Default budget 30 s; concurrency-safe.
- **`connector_transfer`** — runs the seam's five-step transfer for one dataset under the bound tenant and renders the landing receipt: the lakehouse table (with replacement fact and the next-step `lakehouse_query` guidance) or the kb document (with `kb_search` citation guidance), plus the catalog transfer-record id. `target` pins the destination; a pin that disagrees with classification refuses loud. Default budget 120 s; not concurrency-safe (it lands data).
- **`order_create`** — places an expert-service order and runs the deliverable pipeline to completion in one call (create → fulfill over `ctx.orders`): the service id comes from a discovered expert card, the brief restates the client's need, and the receipt carries the order number, settled status, and the proposal PDF's workspace path. Default budget 60 s (it drafts and typesets); not concurrency-safe (it transacts).
- **`order_status`** — reads one order by id, or lists the recent orders when no id is given; delivered rows carry the deliverable path. Default budget 10 s; concurrency-safe (read-only).
- **`assets_browse`** — the data-asset market's read-only catalog face over the same discovery the gateway's assets domain serves: `list` renders asset cards (title, kind, provider and dataset ids, pricing anchor on services), `detail` renders one asset's full card, `stats` counts assets per kind and provider. Ordering and landing stay on their own tools. Default budget 15 s; concurrency-safe (read-only projections).

## Configuration (schemastery)

- `discover?` / `fetch?` / `transfer?: boolean` — register each tool (default `true`).
- `assets?: boolean` — register `assets_browse` (default `true`); `assetsTimeoutMs?: number` — its cooperative budget (default `15000`).
- `tenant: string` (required) — the deployment-side tenant binding every landing operates on.
- `discoverTimeoutMs?` / `fetchTimeoutMs?` / `transferTimeoutMs?: number` — cooperative budgets (defaults `15000` / `30000` / `120000`).

## Presentation (UI render intent)

All three tools render `generic` cards: pending cards title by the query or dataset id; completed cards restate the match count (discover) plus one line per discovered expert (`专家：<name>（<org>）`), the previewed dataset (fetch), or the landing destination and table/document (transfer). Presentation is a pure function of `args` + `meta`, replayable from the session log.

## Model Experience

### System prompt

#### What the model sees

Three guidance sections ride the system prompt while the tools are enabled, verbatim below.

##### connector-discover guidance

```markdown
Use the connector_discover tool to search external and expert data sources (connector providers) for datasets, expert profiles, and expert services — for example when the question needs experts (出海、中亚), external structured data, or a serviceable offering. Expert cards carry the expert's affiliation, domains, and orderable services (deliverable + pricing); recommend a matching expert by these card fields when the question calls for one. Results carry a provider and dataset id: preview content with connector_fetch, and land a dataset into the knowledge base or the lakehouse with connector_transfer.
```

##### connector-fetch guidance

```markdown
Use the connector_fetch tool to preview one connector dataset before transferring it: the first rows of a tabular dataset, an excerpt of a document or expert profile, the receipt of a file, or a service offering. Pass the dataset id from connector_discover; add provider_id when several providers share the id.
```

##### connector-transfer guidance

```markdown
Use the connector_transfer tool to land one connector dataset into this deployment: tabular content and csv/xlsx/json files load as lakehouse tables, documents and expert profiles ingest into the knowledge base (auto-classified; target pins the destination and disagreements refuse). After a transfer, answer from the landing — lakehouse_query over the named table, or kb_search with [n] citations.
```

#### Token effect

Three fixed-cost guidance sections (~150 tokens total), registered once per composition.

#### KV Cache effect

Static text keyed by section name; identical across sessions, so it sits at the head of every cached prefix.

### Tool schemas

#### What the model sees

The model sees the generated [`connector_discover`, `connector_fetch`, `connector_transfer`, `order_create`, `order_status`, and `assets_browse` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-connector). `connector_discover` declares an optional `query` string and an optional `kinds` string array (enum-closed); `connector_fetch` declares a required `dataset_id` and an optional `provider_id`; `connector_transfer` adds an optional `target` enum; `order_create` declares a required `service_id` and `brief` plus an optional `client_name`; `order_status` declares an optional `order_id`; `assets_browse` declares a required `action` enum (`list`/`detail`/`stats`) with optional `query`, `provider_id`, and `dataset_id`. None declares `tenant`.

#### Token effect

~180 tokens for all three schemas.

#### KV Cache effect

Static schema text; cache-stable.

### Tool results

#### What the model sees

Discovery renders the grouped listing with ids; fetch renders the kind-specific preview with a next-step line; transfer renders the landing receipt — destination, table or document summary, replacement fact, transfer-record id, and the standing instruction to answer from the landing (name the table, or cite with [n]).

#### Token effect

Discover is linear in matches (typically < 30 entries); fetch is capped (8 rows / 400 characters); transfer is a fixed ~80-token receipt.

#### KV Cache effect

Tool results are per-turn content; they never enter a cached prefix.

## Known Limitations and Deferred Work

- Id resolution runs one discovery fan-out per unnamed fetch/transfer call; a provider-declared ownership index would save the round trip, waiting for a provider whose discovery is expensive.
- The expert card rendering (name/org/domains/services with an orderable hint) is N4's presentation batch; today expert entries render through the generic grouped listing.
