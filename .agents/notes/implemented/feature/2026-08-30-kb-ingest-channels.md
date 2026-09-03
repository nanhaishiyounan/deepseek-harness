# Agent Note: PDF/docx/web ingest channels for the kb tools

Status: implemented

English | [中文](2026-08-30-kb-ingest-channels.zh.md)

## Problem

P0 ingested only workspace `.md`/`.txt`. Real food-industry sources are PDFs (regulations, audit reports), Word documents (visit write-ups), and web pages (standard announcements) — the P1-1 data-plane batch requires all three to flow through the existing chunker+store pipeline with the same idempotent replace semantics, and the web channel must not turn the knowledge base into an intranet probe ([`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md), P1-4).

## Decision

**Parsing libraries (maintained-dependency policy):** `unpdf` for PDF text extraction (serverless pdf.js build, pure JS, zero native dependencies — the same cross-platform CI constraint that ruled out sqlite-vec), `mammoth` for docx→HTML (the de-facto standard converter; its HTML projection keeps heading levels), and `node-html-parser` for HTML parsing (zero-dependency, maintained; hand-rolling tag/edge-case/entity handling would own ~100 lines of parser code the policy says not to own). All three are lazy `import()`s inside `tool-kb/src/extract.ts`, so compositions that never ingest binaries never load pdf.js. HTML→text is one owned pure function (`htmlToStructuredText`): headings become `#`-prefix lines and list items `- ` lines, so the seam's structure-aware chunker still sees a document outline; script/style subtrees and the doctype drop out; `<`/`>` entities are parked in the private-use area during parsing because node-html-parser re-parses them as tags. `kb_ingest` extends its whitelist to `.pdf`/`.docx` and reads binaries through `ctx.fs.readBytes` (64 MiB cap); the URL is the citation identity for web pages, the path for files — both keep the `(tenantId, sourcePath)` replace semantics.

**Web channel:** a fourth tool `kb_ingest_url` fetches through the **optional** `ctx.web` service (`ctx.get('web')`, the app-boot optional-service pattern — vendored Cordis has no `'web?'` inject syntax, and a required inject would break file-only compositions). The tool stays visible without a web service and fails with a structured error at execution, matching the store-availability convention. Non-2xx responses and provider-truncated bodies are refused (storing an error page or a partial corpus would poison citations).

**SSRF posture:** `tool-kb/src/url-policy.ts` enforces http(s)-only, credential-free, length-bounded URLs, then resolves the hostname (`node:dns` `lookup` with `all: true`) and refuses the fetch when **any** resolved address is loopback, RFC1918, link-local, CGNAT, unspecified, unique-local, or link-local IPv6 (IPv4-mapped IPv6 unwraps first). `web-fetch-http`'s own policy already covers scheme/credentials/same-origin redirects but explicitly defers private-network blocking (its package Agent Note says so), so the kb channel owns that gate. `Config.allowPrivateNetworks` (default `false`) is the explicit opt-in for fixtures and intranet deployments — a deployment-varying choice is a validated config field, not a hardcoded switch. A hostname that fails to resolve here stays admitted: the fetch provider's own resolution is authoritative and an unresolvable name reaches no address.

## Alternatives considered

- **Hand-rolled PDF/docx parsing** — rejected outright: both are container formats (object streams, OOXML zip) where the policy's "genuinely delete owned code" test fails decisively.
- **A dedicated extract package or provider seam** — rejected: parsing has no multi-backend selection requirement (no YAGNI consumer); the tools own their input formats.
- **`mammoth.extractRawText()`** — rejected for losing the heading outline the chunker splits on; `convertToHtml()` plus the shared HTML→text path keeps structure for every HTML-bearing source.
- **SSRF check inside `web-fetch-http`** — its Agent Note owns that deferral; changing the shared provider's posture is a separate decision with the whole web toolchain as its blast radius. The kb channel needs the guarantee now and owns its gate.
- **Blocking unresolvable hostnames** — rejected: it would make air-gapped test runs fail on DNS rather than on the fetch itself, and adds no protection.

## Consequences

- `tool-kb` gains three runtime dependencies (unpdf, mammoth, node-html-parser — MIT/BSD-2/Apache-2.0), registered in `THIRD_PARTY_NOTICES.md`; the lazy imports keep them out of the load path of text-only compositions.
- DNS-rebinding remains a residual risk: the gate resolves once per ingest while the fetch provider resolves again; an attacker controlling DNS could pass the check and hit a private address on the fetch's resolution. Mitigating needs pinning the resolved IP through the fetch, which the `ctx.web` request type does not carry — recorded as the known limit of this posture.
- Fixtures are deterministic generated files (hand-built PDF with exact xref offsets, minimal OOXML zipped with the stock `zip`, static HTML with script/style noise); URL tests run against a local `node:http` server with `allowPrivateNetworks: true`, never the public internet.

## Verification

- `packages/kb/tool-kb/tests/extract.spec.ts` — PDF/docx extraction over the fixtures, heading/list/entity/doctype handling, fail-loud on non-PDF/non-docx bytes.
- `packages/kb/tool-kb/tests/ingest-url.spec.ts` — private-address classification table (loopback/RFC1918/link-local/CGNAT/ULA/mapped), URL admission rules, local-server end-to-end ingest+search, URL replace semantics, text-body path, private-network refusal without the opt-in, 404 and truncation refusal, structured errors without a web service or fetch provider.
- `packages/kb/tool-kb/tests/ingest.spec.ts` — `.pdf`/`.docx` end-to-end ingest through the real seam and retrievable by content.
- Real-key smoke: PDF, docx, and `https://example.com/` all ingest with MiniMax embeddings; both channels retrieve in hybrid mode with the right citation identity; `http://127.0.0.1` is refused by the SSRF gate.
