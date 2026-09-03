# Agent Note: kb workbench browser file upload — the kb.upload gateway channel

Status: implemented

English | [中文](2026-09-02-kb-browser-upload.zh.md)

## Problem

The kb workbench's ingest wizard accepted only a server-side path (browse `host.listDirectory`, then type the file name) and a web URL. A browser user with a local document had no way to ingest it: files had to be placed on the server by an administrator first, and the file tab said exactly that. The product goal — users build the knowledge base by uploading their own files from wherever they are — required a browser→gateway byte channel with the same tenant/write gates and ingest pipeline as the existing channels.

## Decision

### Wire shape: one unary JSON method, base64 bytes, single file per call

`kb.upload` is a fifth unary route in the kb domain: payload `{ filename, data, doc_kind?, title?, collected_at? }`, response the shared `KbIngestView`. The bytes ride as canonical RFC-4648 base64 text inside the standard `application/json` POST envelope, one file per call — the browser loops for batches. This matches the only existing browser→host byte precedent (`session.prompt`'s base64 image parts admitted through `admitEncodedImages`) and keeps the carrier's cross-site write fence intact: the fetch handler accepts only the JSON media type so side-effectful RPCs stay behind a CORS preflight the server never answers; a multipart or octet-stream route would punch a second content-type path through that fence for no functional gain. The zod schema pins the base64 alphabet (Node's decoder is lenient and would silently drop invalid characters), while the byte-size cap stays a business refusal so clients get the structured `kb-upload-too-large` error rather than a generic bad-request.

Multi-file batching was rejected as an array payload: per-file calls give per-file error attribution and progress rows in the wizard with no server-side partial-failure semantics to invent, and `session.prompt`'s per-image admission is the established grain.

### Landing directory: workspace/data/uploads under the host cwd

The gateway decodes the payload, sanitizes the file name, and writes the raw bytes to `workspace/data/uploads/<name>` under `ApiProxyDefaults.cwd` (the host process cwd, the same root `kb.ingest` paths resolve against), then parses and stores through the exact code the file channel uses: `INGEST_EXTENSIONS` gate, `parseIngestDocKind`, fatal-UTF-8 text decoding for md/txt (mirroring `fs.readText`'s FS_NOT_TEXT refusal instead of storing replacement characters), `extractPdfText`/`extractDocxText` for binaries, and `storeKbDocument` under `sourcePath: workspace/data/uploads/<name>` — so re-uploading the same file name replaces the prior document under the seam's same-path semantics. The durable landing is deliberate: uploaded corpus stays auditable and re-parseable on disk, and in the kb-agent example the pre-existing `workspace/data/*` ignore with its per-corpus allowlist already excludes `uploads/` (the `.gitignore` comment names the directory). The gateway writes through `node:fs/promises` directly because the fs capability's write face is text-and-target shaped (`writeText` over a resolved `FsTarget`) and cannot carry binary pdf/docx bytes.

### Security gates: the shared write fence plus file-name sanitizing

`kb.upload` runs behind the same `ingestGates()` as `kb.ingest`/`kb.ingestUrl` — `kb-not-composed`, `kb-write-disabled` (the deployment's `kbWriteEnabled` opt-in, whose JSDoc and refusal message now name all three write methods), and the config-bound `kbTenant`; the wire never carries a tenant. The file name reduces to its final `/`- or `\`-separated segment with control characters and the dot names refused (`kb-invalid-filename`): directory traversal in the raw name can only ever select its last segment, and a name that reduces to nothing has no safe landing name. The decoded byte length is capped at the file channel's `MAX_KB_INGEST_BYTES` (64 MiB). The zod base64 regex plus the shared error-code vocabulary (`kb-upload-too-large`, `kb-invalid-filename`) round out the wire table in `rpc.ts`/`rpc.schema.ts`.

### Workbench UX: upload-first wizard

The ingest wizard opens on a new "Upload files" tab (zh: 上传本地文件) holding a multiple `input[type=file] accept=".md,.txt,.pdf,.docx"` behind a pick label; the URL and server-file tabs follow it unchanged. Each picked file gets a row (busy → done with passage count → classified failure), uploads run sequentially, and the batch carries a sequence-token race guard so a reopen drops a superseded batch's late row updates — the same discipline the browse list's `browseSeq` established. The client encodes `File` bytes to base64 in the ui-kb plugin (`base64Of`, chunked because `String.fromCharCode` spread is argument-capped) and records the `workspace/data/uploads/<name>` sighting beside the receipt like the other ingest faces. The server-file tab's unavailable copy now steers to upload/URL instead of only "contact your admin".

## Alternatives considered

**A multipart/form-data or raw-body upload route.** Rejected: it would need a second physical carrier path beside the JSON-only `/api/` POST fence (which exists precisely to force cross-site writes through an unanswered preflight), and the largest realistic payload (64 MiB → ~85 MiB of base64 in one JSON body) is well within a local deployment's fetch budget. The attachment image precedent already proved base64-in-JSON adequate for browser bytes.

**An array-of-files `kb.uploadBatch`.** Rejected: per-file calls keep error attribution, retry, and progress local to the wizard loop; a batch payload would need invented partial-failure semantics at the wire and give nothing the loop cannot.

**Landing uploads in a temp directory and ingesting from memory.** Rejected: no durable copy would remain for audit or re-parse, and the same-path replace semantics that make re-upload idempotent are anchored on a stable `workspace/data/uploads/<name>` sourcePath.

**Writing through the fs capability's write face.** Rejected: `writeText` is text-only over resolved targets and cannot carry pdf/docx bytes; binary upload would need a second fs write method for one caller.

## Consequences

The gateway now owns one more write surface guarded by the same opt-in; deployments that never set `kbWriteEnabled` see the upload tab fail with the shared read-only refusal, which the wizard's failure classification renders as the generic ingest-failed row copy. Base64-in-JSON costs ~33% wire overhead per upload — acceptable at the 64 MiB cap for a workbench tool, and the cost of the fence-safe alternative. The uploads directory is deployment state: examples/kb-agent ignores it via the existing `workspace/data/*` rule, and other deployments should exclude it from version control explicitly. The wizard's default tab changed from URL to upload, so tests and docs that assumed the URL tab on open were updated with the behavior.

## Testing

`packages/host/apiproxy/tests/kb-domain.spec.ts` owns the deployment-gate and upload matrix (gates, landing bytes, pdf parsing, traversal sanitizing, reserved names, extension/doc_kind refusals, the 64 MiB cap, invalid UTF-8). `fetch-carrier.spec.ts` round-trips every kb method through the real handler+client wire pair, and `client-handler.spec.ts`'s stub gained the `upload` row. `packages/client/ui-kb` covers the wizard's upload tab (default tab, per-row busy/done/failed with too-large classification, batch race guards, empty pick) and the plugin's `uploadFile` face over a scripted api. `apps/web/tests/kb-workbench.e2e.ts` drives a real Chromium `setInputFiles` round trip (one md + the tool-suite sample pdf → rows, badge, cited retrieval of both). `examples/kb-agent/scripts/upload-real-key-smoke.mts` runs the channel against the real MiniMax embedder in an independent temp library (hybrid retrieval with citations).
