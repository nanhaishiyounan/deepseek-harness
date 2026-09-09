# Agent Note: Unified data-upload domain with a shared routing discriminator

Status: implemented

English | [中文](2026-09-03-unified-data-upload-routing.zh.md)

## Problem

The kb workbench's upload channel (`kb.upload`) accepts only document kinds (md/txt/pdf/docx); a food-enterprise deployment also receives structured data (customs ledgers, order extracts, price tables) whose natural home is a queryable lakehouse table, not a chunked document. With the lakehouse seam shipped (N1: `ctx.lakehouse` + SQLite catalog + DuckDB engine), two routing decisions needed one owner: which upload lands where, and which retrieval surface a model answer uses. Doing this per-caller (a kb-side sniff here, a connector-side sniff later) would fork the classification rules exactly where they must never fork — the same file must route identically whether it arrives from a browser upload or a connector transfer.

## Decision

One discriminator, one wire entry, one model-facing routing posture:

- **`@deepseek-ai/dsh-lakehouse/data-router`** (sub-export on the seam's package) owns classification as a pure `resolveDataRoute(filename, bytes, mime?)`. Order: extension whitelist (csv/xlsx/json → lakehouse; md/txt/pdf/docx → kb) → declared mime fallback for extension-less files → magic-number agreement (pdf/zip/json-array signatures). Refusals carry machine-routable reasons (`unsupported-type`, `type-mismatch`, `empty-file`). The sub-export lives on the lakehouse package because both consumers — the apiproxy `data` domain and the upcoming connector transfer pipeline — already depend on the seam; no new package, one routing truth.
- **The apiproxy `data` domain** is the single upload wire: `data.upload` (same stack-safe canonical base64 gate as `kb.upload`, shared by export) classifies, then lands. The lakehouse route parses csv (in-repo RFC-4180 reader), json row arrays, and xlsx (exceljs, lazily imported) into the seam's `TabularData` with per-column SQL type inference (INTEGER/DOUBLE/BOOLEAN/TEXT; beyond-safe-integer columns stay textual), derives the table name from the file name, and calls `ctx.lakehouse.load` with `workbench-upload` provenance. The kb route reuses the existing upload pipeline verbatim. The response is destination-discriminated; both destinations report the replacement fact (landing-file identity for kb, catalog truth for lakehouse). Original bytes always land under `workspace/data/uploads/` for audit. Eight new `data-*` error codes close the refusal vocabulary; writes need an explicit `dataUploadEnabled` (independent of `kbWriteEnabled`) and share the `kbTenant` deployment binding.
- **`tool-lakehouse`** exposes `lakehouse_tables` (schema-first inventory) and `lakehouse_query` (single read statement, seam-capped rows, truncation marker, `tables_used` attribution by word-boundary match). Both render `generic` cards; the query result is a markdown table plus a `Data source: lakehouse table <name>` line and a standing instruction to name sources in the answer. The tenant is a deployment-side binding rejected as model input, mirroring `tool-kb`.
- **Query routing is prompt-side, not a new plugin**: each tool registers its own system-prompt section (list-before-SQL; numbers → lakehouse, passages → `kb_search`), and the kb-agent persona/preset carry the same split. The connector branch of the routing guidance (`connector_discover`) stays out until N3 ships the tool it names.
- **`ui-kb` switched, not forked**: the wizard's upload tab now calls `data.upload` (sending the browser's declared mime), accepts csv/xlsx/json beside the document kinds, and reports per-destination rows and toasts (「已入数据湖：<表> · N 行」/「已入库」; replacement toasts preserved). `kb.upload` remains as the kb-only channel for internal callers.

## Verification

- `pnpm vitest run packages/lakehouse` — discriminator matrix (structured trio, four document kinds, mime fallback, case-insensitivity, empty/unknown/mismatch refusals) and the tool suite over in-memory providers (tenant binding, attribution, truncation, degraded engine, schema surface).
- `pnpm vitest run packages/host/apiproxy` — five-format routing (csv/xlsx/json/md/pdf incl. a real exceljs-built workbook and the shared PDF fixture), gates, refusals, no-lakehouse composition, replacement facts, and the wire schema pair.
- `pnpm vitest run examples/kb-agent/tests/data-routing.spec.ts` — keyless snapshot over the real Loader composition locking the whole loop's transcript (upload receipts → `lakehouse_tables` → DuckDB aggregate → `kb_search` citation).
- With-key e2e `examples/kb-agent/tests/data-routing.e2e.ts` (self-skips without `MINIMAX_API_KEY`): real csv and markdown uploads (live embo-01 embeddings), lakehouse aggregate, and a real MiniMax-M3 answer restating the queried number with the source table named.

## Alternatives considered

**Why not classify inside the api gateway alone?** The N3 connector transfer pipeline needs the same classification for pulled datasets; a gateway-local module would force the connector package to depend on the whole host BFF. The seam-package sub-export keeps the dependency direction one-way (`connector → lakehouse` already exists for `TabularData`).

**Why not extend `kb.upload` with a destination hint?** A caller-supplied hint makes the client the routing authority and invites divergence (two browsers, two hints). Classification is a property of the bytes and the name; the discriminator owns it, and the client learns the outcome from the destination-discriminated response.

**Why not a parquet-aware upload now?** The plan text names parquet among structured uploads, but the seam's `load` contract is `TabularData → writeParquet`; reading parquet bytes back into that vocabulary needs engine cooperation (`read_parquet` through the query path) and column-schema extraction that N1's `QueryProvider` contract does not expose. Shipping a half-route (classify, then refuse) was worse than scoping the whitelist to csv/xlsx/json — parquet lands with the connector batch's file-level transfer, recorded here as the deliberate boundary.

**Why an in-repo CSV reader instead of a dependency?** The reader is ~70 lines over the exact RFC-4180 subset the upload channel needs (quoted fields, doubled quotes, CR/LF records, BOM) with type inference rules that must align with DuckDB's closed DDL type set anyway; papaparse's headline features (streaming, workers, its own type guessing) are unused here and would add an audit surface larger than the code they replace. exceljs is the opposite case — ZIP+OOXML parsing is genuinely library territory — so it was added (the npm `xlsx` package carries unpatched CVEs on its last registry release and was excluded).

**Why prompt-side query routing instead of an intent-classifier plugin?** The plan's own evolution ladder (D2/动线 B): tool-plus-guidance is the MVP rung with a proven precedent (the kb citation instructions), keeps zero loop changes, and degrades to a model-visible miss the operator can read in the transcript. A classifier plugin is the evolution rung, not the foundation.

## Consequences

Every upload now has exactly one entry point and one classification truth; the browser wizard, future connectors, and any other producer agree on where a file lands, and the refusal vocabulary (`data-*` codes) is closed on the wire. The cost: `data.upload` couples the gateway to two optional seams (kb, lakehouse) with structured refusals for each absence; the xlsx reader adds exceljs to the gateway's dependency weight (lazily imported); and the CSV/JSON type inference is a heuristic the operator must occasionally override by reshaping the source file. Model-side, the routing burden sits on prompt guidance — cheaper than a classifier, but a model can still pick the wrong surface, and the transcript is the diagnostic. The parquet boundary (above) means a `.parquet` upload today refuses with `data-unsupported-type` naming the supported set — honest, and the connector batch owns closing it.
