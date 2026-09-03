# Agent Note: P1 role presets, the 100-question eval, and the KB workbench

Status: implemented

English | [中文](2026-08-30-kb-p1-presets-eval-workbench.zh.md)

## Problem

P1-2 ships the product's first intelligent surface: two role agent presets (AI 食安合规官 / 企业数据助手), a 100-question retrieval evaluation proving the RAG acceptance line (Top5 ≥ 80%, citation validity ≥ 90%), and a minimal web workbench (usage stats, cited search, ingest) ([`plans/food-kb-agent-plan.md`](../../../../plans/food-kb-agent-plan.md), P1-2/P1-3/P1-6).

## Decision

- **Presets are thin agent-plane compositions**: persona + a scoped `tool-kb` row. The kb seam (registries) stays host-plane — the standard preset architecture rule — so a preset changes an agent's identity and tool surface, never the capability. The example composition additionally disables the base bundle's model-facing tool rows (the web-app bundle's own pattern), making the deployment retrieval-only: the "no destructive tools" requirement is a composition fact, not a per-preset filter.
- **Presets live in `examples/kb-agent/agent-presets/`**, not the shipped `apps/cli/config/agent-presets/`: the CLI's dependency closure has no kb packages, so a shipped preset row would fail to resolve. The example's workspace resolves them; the roster row points its `roots` there.
- **The eval harness measures two metrics with explicit rules** (`examples/kb-agent/scripts/eval-retrieval.mts`): Top5 hit rate = gold document among the top-5 `kb_search` hits; citation validity = at least one `[n]` citation in the MiniMax-M3 answer resolving to a retrieved passage whose source is the gold document (numbers outside 1..5 are invalid). Keyless text mode and real-key hybrid mode share the harness.
- **Measured results (2026-08-30, real key)**: hybrid Top5 **99%**, citation validity **95%** — both above the acceptance line without tuning. Text-only degraded mode reads 71% (FTS5 trigram phrase windows miss long Chinese queries); the vector path closes the gap, which is the documented reason hybrid mode is the deployment default.
- **The workbench is a gateway domain plus a client plugin**: `kb.stats/search/ingest/ingestUrl` on the ApiProxy (the kb capability resolved with `ctx.get` at call time — a deployment without a knowledge base keeps a working gateway and every kb method refuses with `kb-not-composed`), and `dsh-client-ui-kb` (sidebar footer action → panel) driving `connection.api.kb`. URL ingest reuses tool-kb's SSRF gate (`assertPublicUrl`) — the workbench never becomes a private-network probing surface.

## Alternatives considered

- **Presets owning the kb stack behind an isolate realm** — rejected: presets must not own registries; two presets would also race on one SQLite path.
- **A typert remote for the kb domain** — deferred: the connection's `api` face already reaches the browser; a generated remote adds a generator hop for no new capability.
- **Tuning retrieval (RRF weights, chunk sizes) to lift the text-mode score** — unnecessary: the acceptance line is measured in the deployment's hybrid mode; the 71% text baseline is recorded as the degraded-mode expectation.

## Consequences

- The keyless preset snapshot (`examples/kb-agent/tests/kb-presets.spec.ts`) pins the retrieval-only tool surface, persona shadowing, and cited retrieval through a real Loader mount; the scenario-set snapshot extends the same pattern to every scenario directory.
- The eval corpus grew to 14 documents (five demand categories), each question gold-annotated; re-running the harness reproduces both numbers without a key for the text metric.
- The gateway's `kbTenant` config field is the deployment-side tenant binding for the workbench, mirroring `tool-kb`'s `tenant` — one more place a deployment states its tenant.
- Known gap: the workbench panel is minimal (no pagination, no document list); the gateway domain is the stable seam for richer UI.
