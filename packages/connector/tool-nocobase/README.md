# @deepseek-ai/dsh-tool-nocobase

English | [中文](README.zh.md)

Model-facing NocoBase business tools: `nb_collections` (schema discovery), `nb_list`/`nb_get` (row reads), and `nb_create`/`nb_update` (confirmed-change writes) over the shared [`NocoBaseClient`](../connector-nocobase/README.md).

## Tool surface

- **`nb_collections`** — lists every visible collection with its fields (name, type, relation targets); hidden collections stay dropped unless `include_hidden` is true. The first step of every business question.
- **`nb_list`** — queries one collection's rows with the restricted filter vocabulary (`{field, op: eq|in|gt|lt, value}` conditions joined by `match: and|or`), sorting (`-` prefix = descending), field projection, and bounded paging (`page_size` ≤ 100).
- **`nb_get`** — reads one row by collection and id; the pre-change read the confirmation flow mandates.
- **`nb_create`** — lands one new row; answers the receipt with the server-assigned id and the stored row.
- **`nb_update`** — reads the row first, changes exactly the named fields, and answers the before→after diff receipt plus the stored row.

## Confirmed-change contract

The in-conversation confirmation lives in the system-prompt guidance, not in tool state: the agent must present the planned change (nb_create's full new row; nb_update's field-by-field before→after diff over an `nb_get`) and only call the write tool after the user's explicit go-ahead. The tools themselves carry no UI confirmation state — the persona drives the preview → go-ahead → receipt flow, and the receipts let the conversation echo exactly what landed.

## Configuration

```yaml
- id: tool-nocobase
  name: '@deepseek-ai/dsh-tool-nocobase'
  config:
    baseUrl: http://127.0.0.1:13000   # or NOCOBASE_BASE_URL
    apiKeyEnv: NOCOBASE_API_KEY       # credential reference, defaults to this name
    readTimeoutMs: 10000               # nb_collections/nb_list/nb_get budgets
    writeTimeoutMs: 60000              # nb_create/nb_update budgets (update runs get+write)
```

Credentials resolve through the credentials seam first, then the trusted launch environment. Missing credentials register the tools anyway — every call then fails with the structured no-credentials refusal (the suite's documented degraded mode) instead of failing the composition. The tenant is never model input: every tool rejects a `tenant` argument; the service account the client runs under is the permission boundary.

## Model Experience

### System prompt

#### What the model sees

Five guidance sections ride the system prompt while the tools are enabled, verbatim below.

##### nb-collections guidance

```markdown
Use the nb_collections tool before any other nb_* call when the conversation names a business record type you have not seen: it lists every visible collection with its fields (name, type, relation targets). Ground collection and field names in this listing instead of guessing.
```

##### nb-list guidance

```markdown
Use the nb_list tool to answer questions over business records: name the collection from nb_collections, filter with the restricted conditions (field, op eq/in/gt/lt, value; joined by match and/or), sort with leading `-` for descending, and page when count exceeds page_size. Answer from the returned rows and name the collection.
```

##### nb-get guidance

```markdown
Use the nb_get tool to read one business record by collection and id — the current values you need before proposing any change (the nb_update confirmation diff) and the follow-up read after a write.
```

##### nb-create guidance

```markdown
Use the nb_create tool only AFTER the user explicitly confirmed the new record: draft the full row first (fields grounded in nb_collections), show it as a preview in the conversation, and ask for the go-ahead. Fill missing slots by asking — never invent business values. One call lands the row and returns the receipt with the server-assigned id.
```

##### nb-update guidance

```markdown
Use the nb_update tool only AFTER the user explicitly confirmed the change: nb_get the row first, show the field-by-field before→after diff in the conversation, and ask for the go-ahead. Update just the fields the user asked to change. The call answers the same diff as its receipt, plus the stored row.
```

#### Token effect

Five fixed-cost guidance sections (~230 tokens total), registered once per composition.

#### KV Cache effect

Static text keyed by section name; identical across sessions, so it sits at the head of every cached prefix.

### Tool schemas

#### What the model sees

The model sees the generated [`nb_collections`, `nb_list`, `nb_get`, `nb_create`, and `nb_update` schemas](../../../docs/tool-catalog.md#deepseek-aidsh-tool-nocobase). `nb_collections` declares an optional `include_hidden` boolean; `nb_list` declares a required `collection` plus optional `filter` (closed eq/in/gt/lt conditions), `match`, `page`, `page_size`, `sort`, and `fields`; `nb_get` declares a required `collection` and `id`; `nb_create` declares a required `collection` and `values`; `nb_update` adds the required `id`. None declares `tenant`.

#### Token effect

~200 tokens for all five schemas.

#### KV Cache effect

Static schema text; cache-stable.

### Tool results

#### What the model sees

Schema discovery renders one section per collection with its fields (title and relation targets included); the row reads render the page header plus one JSON row per line; nb_create renders the landing receipt (the assigned id and the stored row's fields); nb_update renders the field-by-field before→after diff followed by the stored row.

#### Token effect

`nb_collections` is linear in collections (~10 tokens per field line); `nb_list` is bounded by `page_size` (default 20, max 100); the write receipts are fixed and small.

#### KV Cache effect

Tool results are per-turn content; they never enter a cached prefix.

## Known Limitations and Deferred Work

- Reads and writes go through the deployment's service account; per-user NocoBase roles are not impersonated.
- The filter vocabulary is closed (eq/in/gt/lt with one and/or join); arbitrary operator trees are out of scope by design.
- The confirmation contract lives in prompt guidance; a future batch may add a tool-call-time approval gate (the interaction seam) for deployments that want a hard UI stop.
