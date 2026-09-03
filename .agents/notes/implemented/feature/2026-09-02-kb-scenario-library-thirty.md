# Agent Note: kb-agent scenario library filled to thirty — content design rules for probes and desensitized corpora

Status: implemented

English | [中文](2026-09-02-kb-scenario-library-thirty.zh.md)

## Problem

The P2 goal for the food-industry kb-agent example is a thirty-scenario library. Eleven scenarios existed with the directory contract settled (`scenarios/<id>/{preset.yml, agent.cordis.yml, SKILL.md, data/corpus.md}`, auto-enrolled by `tests/scenarios.spec.ts`); nineteen were only named in the bilingual `scenarios/README`. Filling them is pure content, but two properties are easy to lose when writing that content: a scenario's probe must actually retrieve its own corpus in the keyless text-only degraded mode, and the corpus must stay desensitized while remaining concrete enough for probe-grounded Q&A.

## Decision

### Roster and categories follow the published list exactly

The nineteen ids and their categories come verbatim from the "to fill" list in the scenario README: three market-insight, two process, two food-safety, two cost (one of them the cross-category enterprise-data generalist), five supply-chain, four overseas, one data-asset; supply-chain-finance spans supply-chain/overseas. Orders run 31–49 behind the existing 20–30, so the portal card order stays deterministic.

### The four-file shape is copied, not varied

Every scenario keeps the shipped template verbatim: `preset.yml` (probe/name/description/order), `agent.cordis.yml` (persona + scoped tool-kb row, kb stack still host-plane), `SKILL.md` (when-to-use / method / tools), `data/corpus.md` (3–4 sections of concrete facts). Personas all mandate kb_search first, `[n]` citations, and explicit marking of unsupported claims as hypotheses.

### Probe wording obeys the text-only retrieval mechanics

Text-only degraded search splits the query on non-word boundaries; segments of ≥3 code points become FTS5 OR phrases (≤8 code points stay whole, longer segments become 4-code-point sliding windows), and a query whose segments are all shorter than 3 code points falls back to whole-string LIKE. Consequences written into every probe:

- Each probe keeps at least one segment of ≥3 code points that appears **contiguously in corpus body text** (chunk indexing covers body prose, not heading lines — cold-chain's probe word initially lived only in a heading and returned zero hits until moved into a body sentence).
- All-short-segment probes are rejected on sight: "HS 归类 拼箱" and "豆粕 期货 套保" both fall to LIKE and cannot match; they gained a longer segment ("预裁定", "卖出套保").
- Probe words are chosen to be cross-corpus distinctive so each scenario cites its own corpus first, but the spec's `some`-semantics check tolerates a shared generic word.

### Corpus sourcing and desensitization rules

Company names are invented (锦丰食品 etc.) and internal codes are fictional (SOP-CC-04, SCF-01, PM-EXP-03). Real regulatory anchors (GB 2760 / GB 14881 / GB 28050, FDA facility registration, HALAL) are kept because standards references are public and probes need recognizable anchors; no real meeting-note text is copied. Numbers inside one corpus must be self-consistent (the 30-minute cold-chain excursion cap equals the break-trigger threshold; the 2.0 stock-to-sales alarm vs the 2.3 reading), so probe answers stay supportable. Business themes follow the food-enterprise operating spine of `plans/food-kb-agent-plan.md` (sourcing/scheduling/cold-chain/overseas/ESG).

## Alternatives considered

- **Embedding-first probes** (pick probe terms that only hybrid mode retrieves well): rejected — the keyless spec gate runs in text-only mode; a probe that needs a key is unverifiable in CI.
- **Per-scenario host compositions**: rejected — scenarios are content-only presets; the kb seam stays host-plane per the directory contract.
- **Longer, realistic-meeting-style corpora**: rejected — the shipped corpora are deliberately compact (~10–15 lines); probe-grounded Q&A needs contiguity and self-consistency, not volume, and longer text raises cross-corpus keyword collisions.

## Consequences

- `tests/scenarios.spec.ts` covers 30/30 scenarios, all citing their own corpus; the expected snapshot was re-recorded and each entry reports `own corpus cited`. The portal-side sync of this roster and its drift gate are owned by the [portal-sync note](../testing/2026-09-02-kb-portal-scenario-sync-gates.md).
- Probe review becomes a checklist for any future scenario: ≥3-code-point segments only, contiguous in body text, cross-corpus distinctive.
- The bilingual scenario README now carries the full 30-row roster (the "to fill" list is gone), QUICKSTART counts updated to thirty, and the `cordis.patch.yml` comment that said "eleven food-industry scenarios" now says thirty.
