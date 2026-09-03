# Agent Note: kb embed providers, tool suite, llm-minimax, and the kb-agent example

Status: implemented

English | [中文](2026-08-29-kb-agent-stack.zh.md)

## Problem

With the kb seam and the SQLite store landed, the closed loop still lacked four pieces: an embed provider (the task assumed MiniMax `/embeddings` was OpenAI-compatible and the model name was unverified), the model-facing search/ingest/stats tools, a MiniMax-M3 chat adapter (wire details unverified), and a runnable example assembling them into "real data in, cited answers out". Implementing any piece on assumption instead of measurement would surface a protocol misunderstanding only weeks before the September demo.

## Decision

### Measure every wire assumption before implementing it

Both endpoints were probed with a real key; the findings went straight into the implementation and its tests:

- **MiniMax embeddings are native, not OpenAI-compatible**: the request body is `{model, texts, type}` (`type` mandatory, `db`/`query`), business failures arrive inside an HTTP 200 `base_resp.status_code` (2013 invalid params, 1004 auth), and auth failures also use HTTP 401. The usable model is **`embo-01`, fixed 1536 dimensions** (`embo-02` and `MiniMax-Embedding` do not exist); batches of 128 succeeded live.
- **Four MiniMax-M3 chat deviations**: thinking arrives inline as `<think>…</think>` inside `delta.content` (no `reasoning_content` field; `enable_thinking: false` is not honored); intermediate chunks carry `finish_reason: ""`; the stream ends with a usage-only chunk (`choices: []`) plus connection close — **no `[DONE]` sentinel**; assistant history replaying `<think>` content is accepted. `prompt_tokens` includes cache hits (same semantics as DeepSeek).

### Symmetric `type: 'query'` encoding, no seam change

`EmbedProvider.embed()` carries no document/query role parameter, while embo-01 requires `type` per request. Measured separation of relevant from unrelated text: standard asymmetric db/query 0.784, symmetric all-db 0.818, **symmetric all-query 0.832** — symmetric use is not worse than the standard pairing. kb-embed-minimax therefore fixes `type: 'query'` with zero seam deviation; if measured recall later demands asymmetric encoding, the escalation path is a role field on the seam (recorded in the README Known Limitations).

### llm-minimax follows the llm-deepseek template, trimmed

The connection-snapshot / credential layering / settings card / retry-policy structure is retained; the Files API and image paths are deleted (M3 is text-only). The translate layer adds a streaming `<think>` splitter (chunk-boundary tag fragments and whitespace after the closing tag), serialize replays assistant reasoning as the `<think>` prefix, and SSE treats EOF as the normal terminator (an optional `[DONE]` is accepted). Reasoning-effort requests throw `UNSUPPORTED_REASONING_EFFORT` (thinking cannot be disabled, so there is nothing selectable to declare).

### FTS5 Chinese retrieval switched to OR-joined phrases

The first keyless closed-loop run exposed a real kb-sqlite defect: `ftsMatchExpression` quoted the whole query as one FTS5 phrase, and a phrase requires the entire string to appear contiguously — a natural-language question never matches prose. The fix splits the query on non-word characters, keeps short segments as single phrases, cuts long segments into four-character sliding windows (stride 2, tail-aligned), joins the phrases with OR (capped at 12), and doubles inner quotes against injection; queries with no valid phrase fall back to LIKE. After the fix, the same question hit the relevant GB 2760 excerpt and visit-note passages instead of nothing.

### Example closed loop and snapshot shape

`examples/kb-agent` ships six desensitized documents (two meeting minutes, two enterprise profiles, two regulation excerpts, facts drawn from the project plan and research report) plus a real-document import script (copy into the gitignored workspace, then ingest by path — real visit notes never enter the repository). The keyless snapshot locks the tool-level closed loop through the real Loader composition (ingest output, stats, three cited queries, tenant isolation, `mode: 'text'`); the with-key e2e locks hybrid ingest and one real cited M3 answer. The test fixture pins the SQLite path and fs root through environment variables and uses `KB_TEST_EMBED_ENV` to demonstrate the "embed credential pulled, chat still live" degradation.

## Alternatives considered

- **A role parameter on the seam for asymmetric encoding** — rejected by measurement: symmetric query encoding separated best, and changing the frozen seam interface would ripple through four packages.
- **Falling back to dashscope as the default embed provider** — unnecessary: embo-01 probed successfully, so the one-MiniMax-key-for-both plan holds.
- **A headless streaming-replay snapshot for kb-agent** — rejected: keyless, the LLM is unavailable, so that shape locks no kb behavior; the tool-level loop through the Loader already covers the invalid-Loader-exports risk, and model-layer behavior is locked by llm-minimax's own mock tests plus the with-key e2e.
- **A Chinese word-segmentation dependency for FTS5** — rejected: sliding-window OR phrases reach demo-grade recall with zero dependencies; segmentation tuning belongs to the P1 evaluation line (the 100-question set).

## Consequences

- Every wire deviation on both MiniMax endpoints is pinned by mock tests, so endpoint drift shows up keyless.
- Chinese natural-language retrieval works on the trigram index; the 12-phrase cap bounds MATCH cost for long queries.
- The demo path holds: the real-key run shows hybrid mode embedding all 19 chunks of 3 documents, 8 hits, and an M3 answer citing `[1][2][4]`; with the embed credential pulled, `mode: 'text'`, 3 hits, and the answer still cites.
- Deferred: `truncated` means cap-reached, not total-aware (the seam reports no total); the M3 context window is undisclosed, so the 200,000 default is advisory; thinking cannot be disabled.

## Verification

- `pnpm vitest run packages/kb packages/llm/llm-minimax`: kb-embed-minimax 27, kb-embed-dashscope 25, tool-kb 44, kb-sqlite 42 (including the new Chinese-question match test), llm-minimax 45 — all green.
- `pnpm vitest run examples/kb-agent/tests/kb-closed-loop.spec.ts`: keyless snapshot passes (refresh with `DSH_SNAPSHOT=refresh`).
- `MINIMAX_API_KEY=… pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent packages/llm/llm-minimax`: real M3 streaming and the real closed-loop answer pass.
