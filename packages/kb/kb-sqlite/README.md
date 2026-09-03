# @deepseek-ai/dsh-kb-sqlite

English | [中文](README.zh.md)

SQLite store provider for the knowledge-base seam: one `node:sqlite` database with an FTS5 trigram full-text index and BLOB-stored embeddings scanned in JS, registered on `ctx.kb` at load.

## Storage model

Schema 2 keeps four structures: `documents` (identity `UNIQUE (tenant_id, source_path)`, citation metadata), `chunks` (`UNIQUE (doc_id, chunk_idx)`, `embedding BLOB` as raw little-endian `Float32Array` bytes), the `chunks_fts` FTS5 virtual table with the `trigram` tokenizer, and `usage_counters` (one row per tenant, atomically upserted increments for the seam's usage metering). Every statement and fixed pragma lives in a packaged `.sql` resource; values use SQLite parameters and runtime code never assembles query text.

A pristine database initializes inside one `BEGIN IMMEDIATE` transaction that also stamps `user_version = 2` and the reserved application id (`"DSHK"`). Any other on-disk version (older or newer), a foreign application identity, or an unversioned database that already owns tables rejects; this pre-release provider supplies no migration. Connection setup applies `trusted_schema = OFF`, `foreign_keys = ON`, `synchronous = FULL`, and WAL journaling for file-backed paths.

## Retrieval

`textSearch` builds the FTS5 MATCH expression from the trimmed query: quoted phrase literals joined by OR (inner quotes doubled, so query syntax cannot inject). A short segment stays one phrase; a long natural-language segment becomes overlapping four-character sliding-window phrases, because an FTS5 phrase requires the whole string to appear contiguously — a full question never matches prose even when every word of it does. A query with no segment reaching one trigram (three Unicode code points) falls back to an escaped `LIKE` scan. `vectorSearch` loads every embedded candidate row, skips stored vectors whose dimensionality differs from the query, ranks the rest by cosine similarity (ties by ascending chunk id), and fetches citation metadata for the top-k ids. Zero vectors have no finite direction and are skipped.

`putDocument` overwrites transactionally: an existing `(tenantId, sourcePath)` document's FTS rows delete first, then the document row (cascading chunks), then the new rows insert. A mid-transaction failure rolls back and preserves the prior document.

## Configuration (schemastery)

```ts
interface Config {
  path: string             // database path (":memory:" supported); relative resolves against cwd
  busyTimeoutMs?: number   // wait for another connection's lock; default 5,000 ms
}
```

The open is eager: an unwritable path or a foreign on-disk schema fails composition load instead of the first tool call. Disposing the plugin unregisters the store and closes the owned connection (idempotent).

## Model Experience

Indirectly, through the kb tool suite: this store registers no prompt, schema, or tool of its own; the consumer package owns every model-facing projection of stored and retrieved content.

#### KV Cache effect

Independent of the model request stream: storage and retrieval produce tool results consumed by a later request, so this package neither appends to nor invalidates any reusable request prefix.

## Known Limitations and Deferred Work

- **Single connection per store instance** — concurrent writers contend through SQLite's lock and the configured busy timeout; no connection pool is provided.
- **Linear JS cosine scan** — every embedded candidate loads per vector search; acceptable at MVP corpus sizes, with a native vector index (for example sqlite-vec) the documented escalation path.
- **Trigram minimum length** — queries under three Unicode code points use the LIKE fallback, which scans chunk contents without index support.
