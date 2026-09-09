# Agent Note: Upload chain debt clearing — stack-safe base64, row identity, replacement reporting, pinned fetch addresses

Status: implemented

English | [中文](2026-09-03-upload-chain-debt-clearing.zh.md)

## Problem

Four defects sat on the kb upload and URL-ingest chain, all filed as debt in the food-KB plan (plans/food-kb-agent-plan.md §十一.5 #1 and the N0 batch of plans/connector-lakehouse-nocobase/02-batches.md). First, the `kb.upload` wire gate validated the browser's base64 body with one whole-string canonical RFC-4648 regex; V8's backtracking stack over that pattern throws `RangeError: Maximum call stack size exceeded` from roughly 3.5 MB of input, while the channel's business cap is 64 MiB — multi-megabyte uploads could never pass the gate. Second, the ingest wizard matched an upload's completion to its row by `row.name === file.name && row.status === 'busy'`, so two same-name files picked in one batch lit every busy same-name row at the first completion. Third, re-uploading a same-name document silently replaced the prior one (the seam's same-path semantics) with no signal on the wire or in the UI. Fourth, the `kb_ingest_url` SSRF gate resolved the host, admitted it, and then handed only the URL to the fetch provider, which resolved again — a DNS rebinding between the two resolutions reaches an address the gate never saw (debt #1's TOCTOU).

## Decision

Four fixes, each inside the N0 scope (apiproxy kb domain + ui-kb + the web fetch path):

1. **Stack-safe canonical base64** (`packages/host/apiproxy/src/api/kb.schema.ts`): the `data` field validates through a length-modulo-4 gate, an alphabet scan over 4 KiB slices of everything before the final quartet, and a final-quartet check that alone may carry `=` padding. Bounded slices keep the regex engine's stack flat at any size the byte cap admits; the refusal semantics are unchanged — every shape Node's lenient decoder would silently mis-decode (missing padding, whitespace, URL-safe alphabet, trailing quartets) still rejects before decoding. `kb.ingestUrl` carries no same-shaped megabyte field, so no sibling change was needed.
2. **Row identity** (`packages/client/ui-kb/src/client/workbench/KbIngestDialog.tsx`): every upload row carries a monotonically increasing id minted at pick; completions and failures match their row by id, and the React key is the id. Two same-name files in one batch now advance independently.
3. **Replacement reporting**: `kb.upload` answers `KbUploadView` — the ingest summary plus `replaced: boolean`, computed by sampling the uploads landing target (`workspace/data/uploads/<sanitized>`) before the write replaces it. The uploads file is the single-tenant workbench's durable identity for this channel, so a prior landing is the same-path fact the seam's re-ingest replaces. `uploadFile` in ui-kb passes the flag into the receipt, and the workbench toast reads「已替换同名文档」(`ingest.doneReplaced`) instead of the plain ingest copy.
4. **Pinned fetch addresses** (debt #1): `WebFetchRequest` gains `pinnedAddresses?: readonly string[]`; `resolveAdmittedAddresses` in `packages/kb/tool-kb/src/url-policy.ts` (the renamed `assertPublicUrl`) resolves the host, refuses private resolutions unless opted in, and returns the admitted set — sent by both `kb_ingest_url` and the workbench's `kb.ingestUrl`. `dsh-web-fetch-http` connects to the pinned addresses over `node:http`/`node:https` with the URL's own Host header and TLS `servername`, trying the next address after a connection refusal and never consulting DNS; same-origin redirects stay on the pinned host, and an empty or absent list resolves normally (the unresolvable-name stays admitted with an empty set). The intranet opt-in path pins too.

## Alternatives considered

**`Buffer.from(data, 'base64')` round-trip comparison instead of chunked validation.** Rejected: the round-trip proves canonicality only by re-encoding equality, costs a full decode plus re-encode on every request, and buries the canonical rule in an implicit property rather than an explicit check.

**Padding-shape regex on the tail plus one whole-string alphabet regex.** Rejected: a whole-string `^[A-Za-z0-9+/]+$` over tens of megabytes is exactly the unbounded-input pattern that motivated the fix.

**`replaced` from the store layer (`putDocument` reporting its delete count).** Rejected for this batch: it changes the kb Service Definition and every store implementation, while the N0 file list scopes `replaced` detection to the gateway; the landing-file sample is exact for the upload channel's identity domain. A store-level fact remains the right home if `replaced` ever needs to cover multi-tenant lookups.

**Pin a single address (first resolved) instead of the admitted list.** Rejected: multi-A-record public hosts would gain a new single point of failure; trying each admitted address in order preserves fetch()'s reachability while still never consulting DNS.

**Re-validation inside the fetch provider (resolve-then-check per request).** Rejected: it moves the SSRF policy into a provider whose module contract explicitly leaves admission to callers, and re-opens the same TOCTOU one layer down unless the provider also pins.

## Consequences

- A 20 MB canonical body parses through the wire gate in milliseconds; the previous behavior threw from ~3.5 MB. Files up to the 64 MiB business cap are again limited by that cap, not by the validator.
- Two same-name rows in one batch keep independent busy/done/failed state; the row key is stable across completion rewrites.
- The workbench makes replacement visible: the wire carries `replaced`, the receipt carries it, the toast states it. The overwrite itself stays unconditional — `replaced` reports, never gates. A landing that outlived a failed ingest (the file lands, the parse refuses) reports `replaced: true` on the next same-name upload even though no document row existed; that edge is accepted rather than adding failure-path file cleanup to this batch.
- DNS rebinding between the gate and the connect can no longer redirect `kb_ingest_url` or the workbench URL ingest: the connect honors the admitted set, Host and SNI keep the original hostname, and certificate verification stays truthful. `assertPublicUrl` is gone from the public surface; `resolveAdmittedAddresses` is the export.
- The pinned path adds a `node:http(s)` request route inside `dsh-web-fetch-http` alongside `fetch()`; responses wrap into the same `Response` shape, so caps, decoding, and redirect handling are shared.

## Testing

`packages/host/apiproxy/tests/kb-domain.spec.ts` holds the schema matrix (20 MB canonical accept; the lenient-decode refusal shapes; the canonical quartet forms including the empty body), the replacement fact (first upload `replaced: false`, same-name re-upload `replaced: true`), and the workbench URL ingest's pin pass-through. `packages/client/ui-kb/tests/kbworkbench.client.spec.tsx` proves two same-name rows advance on their own completions and that a replaced receipt renders the replacement toast; `apply.client.spec.tsx` proves the receipt carries the wire flag. `packages/kb/tool-kb/tests/ingest-url.spec.ts` covers `resolveAdmittedAddresses` (literal public host, opt-in pinning, private refusal, unresolvable-admitted-empty) and that the tool sends the admitted set with the fetch request. `packages/web/web-fetch-http/tests/fetch-http.spec.ts` pins to a `.test` hostname that resolves nowhere (only the pin reaches the server, Host header preserved), retries after a refused address, fails as a transport error when every pin refuses, follows a same-origin redirect while pinned, wraps a bodyless 304, and observes the URL hostname as TLS SNI on a pinned https attempt against a self-signed fixture. The real-browser lane `apps/web/tests/kb-workbench.e2e.ts` drives a 12 MiB markdown pick through the actual wire gate and toasts the replacement on a same-name re-pick; `examples/kb-agent/scripts/upload-real-key-smoke.mts` lands a 12 MiB text-only upload plus a same-name re-upload against the real server path.
