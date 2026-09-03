# Agent Note: kb retrieval relevance threshold — RRF score calibration and why the default is off

Status: implemented

English | [中文](2026-09-02-kb-relevance-threshold.zh.md)

## Problem

The kb seam (`ctx.kb`) returned top-N hits for every query: the vector path always ranks its top-`vectorTopK` nearest neighbors regardless of absolute similarity, so a garbage query ("qwfpzxcvbnm", "锟斤拷烫烫烫屯") produced N unrelated citations and the workbench's zero-result empty state was unreachable at runtime in hybrid deployments. The fix had to add a deployment-tunable relevance threshold on the seam without touching the UI, without hurting the eval baseline (hybrid Top5 99%, citation validity 96%), and with the score semantics measured before being committed to.

## Decision

### `minRelevanceScore` filters fused RRF scores in both modes, default 0

The kb `Config` gains `minRelevanceScore` (`z.number().min(0).default(0)`). `search()` drops fused entries scoring strictly below it before the result cap; the text-only degraded ranking now passes through `fuseRrf(textIds, [], rrfK)` so one threshold has one meaning in both modes (the single-path pass preserves the FTS rank order exactly — rank-reciprocal scores are strictly decreasing). Hits exactly at the threshold are kept (`>=` semantics, locked by a unit test at `1/62`). Zero results keep `mode` unchanged and the tool layer's `truncated` stays false (it derives from `results.length >= maxResults`).

### Calibration measured the score range and found the collision

`examples/kb-agent/scripts/calibrate-relevance.mts` (real key, embo-01, k=60, topK 32, eval corpus + 10 garbage probes) records every fused score with its path membership:

- RRF score bounds: single-path hit `(0, 1/(k+1)]` = 0.016393; dual-path hit `(0, 2/(k+1)]` = 0.032787.
- All 10 garbage probes: full-text path 0 hits, vector path 32 hits, fused top-1 exactly `1/(k+1)` (vector rank 0 single-path). Garbage never scores below the single-path maximum.
- 99/100 eval golds sit in Top5; 28 of them ride a single path (their queries match no FTS trigram phrase — table-heavy documents fragment 4-code-point windows), scoring 0.014925–0.016393, i.e. **the same region as garbage top-1**.
- Threshold simulation: ≤0.015 keeps Top5 at 99% but empties 0/10 garbage probes; ≥0.0164 empties 10/10 garbage probes but drops Top5 to 71% (exactly the dual-path-only subset).

### The default is off because no threshold can win both

The collision above is structural, not noise: an RRF score is a function of ranks only, so a vector-only hit at rank 0 scores the same whether the query is garbage or a legitimate table-heavy question. Every threshold either prunes deep ranks only (garbage top-1 survives at `1/(k+1)`) or demands dual-path confirmation (kills the 28% single-path recall that is hybrid mode's value over text-only). Default `0` therefore ships: every existing deployment and the eval baseline are untouched (rerun after the change: Top5 99%, citation validity 98%). The two deployment semantics are documented in `dsh-kb`'s README and kb-agent DEPLOY: `≤1/(rrfK+1)` = deep-rank pruning, `>1/(rrfK+1)` = dual-path confirmation (0.017 empties all garbage probes; the corpus-specific single-path-recall cost is stated alongside).

## Alternatives considered

- **Default a conservative non-zero threshold (≤0.015)**: rejected — the calibration shows garbage top-1 survives it, so it buys no empty state while risking corpus-specific over-pruning.
- **Default dual-path confirmation (0.017)**: rejected — silently cuts the 28% single-path gold recall; on the eval corpus Top5 falls 99%→71%.
- **Text-path gating (empty results when FTS matches nothing)**: rejected — the same 28 legitimate queries have zero full-text hits; this is gating on the exact signal those queries lack.
- **Threshold on vector cosine similarity**: the signal that separates garbage from the 28 queries is the absolute cosine (garbage top-1 is a weak neighbor, theirs are strong ones), but `KbStore.vectorSearch` does not return scores and `KbSearchHit` carries none. Surfacing similarity through the store contract is the follow-up that would make an honest absolute-relevance threshold possible; deferred to avoid widening the store contract in the same change.

## Consequences

- `packages/kb/kb` unit tests cover threshold filtering in hybrid and text-only modes, boundary inclusion/exclusion at `1/62`, the all-filtered empty result with unchanged mode, default-off regression, and config rejection of negative values.
- kb-agent ships with the threshold unset; DEPLOY documents the knob, the calibration method (`calibrate-relevance.mts`), and the dual-path trade-off so operators decide per corpus.
- The zero-result empty state is reachable in deployments that opt into dual-path confirmation; with the default it remains reachable only for queries where both paths genuinely match nothing.
- Follow-up candidate recorded above: expose vector similarity through the `KbStore` contract for an absolute-relevance threshold.
