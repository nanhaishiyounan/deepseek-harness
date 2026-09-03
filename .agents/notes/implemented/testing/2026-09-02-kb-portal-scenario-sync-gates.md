# Agent Note: portal scenario catalog synced to the thirty-scenario library with a drift gate, hermetic staging, and hard own-corpus assertions

Status: implemented

English | [中文](2026-09-02-kb-portal-scenario-sync-gates.zh.md)

## Problem

The workbench portal's hero rail renders `KB_SCENARIOS`, a static bilingual display table in `packages/client/ui-kb/src/client/hero/scenarios.ts`, while selection semantics come from the runtime `agentPresets` roster (the deployment's `cordis.patch.yml` mounts `examples/kb-agent/scenarios` as a preset root). The table exists because it carries display-only copy the preset directories do not — category grouping and the English mirror — but nothing related the two sides: when the library grew from eleven to thirty scenarios, the portal still offered eleven cards and the usage chip counted eleven. Three test-hygiene gaps let that and worse pass undetected:

- `examples/kb-agent/tests/scenarios.spec.ts` evaluated its staging path as `join(root ?? exampleRoot, 'scenarios-staged')` before `boot()` assigned the temp `root`, so the `??` arm always won and staged preset copies landed in `examples/kb-agent/scenarios-staged/` inside the repository (60 files at the FIX-M review), never removed because `afterEach` deletes only the temp root.
- The own-corpus retrieval check was snapshot-only: `ownCorpus` fed a printed string but no assertion, so `DSH_SNAPSHOT=refresh` could legalize a roster whose probes stopped citing their own corpora.
- `examples/kb-agent/.gitignore` enumerated singular corpus-kind directories (`meeting/`, `regulation/`, …) that matched nothing; the plural and eval-corpus directories were unignored, and `expect(scenarioDirs.length).toBeGreaterThanOrEqual(10)` let any count pass.

## Decision

### The portal catalog mirrors the library, gated by id equality

`KB_SCENARIOS` carries all thirty entries in `preset.yml` `order` sequence, each mapped to one of the eight existing categories exactly as its `preset.yml` description prefix classifies it (esg-report → data-asset, ecommerce-ops → market, cold-chain and supply-chain-finance → supply-chain). No new categories were added: the library classifies all thirty into eight, and portal-only categories would be display-side divergence, not sync. The usage chip stays derived from `KB_SCENARIOS.length`. `scripts/scenario-catalog-sync.spec.ts` — a repo-level vitest spec running under `pnpm run test` — reads the catalog with the TypeScript AST and asserts its id set equals the `examples/kb-agent/scenarios/` directory set, so adding, removing, or renaming a scenario without updating the portal fails the unit gate.

### Scenario presets join the e2e roster; a new card click is covered

`apps/web/tests/kb-workbench.e2e.ts` passes `launchWebScaffold`'s `agentPresets` option with the scenario library mounted beside the shipped presets, mirroring the deployment's roots. A dedicated case clicks the cold-chain card — an id the portal could not offer before the sync — confirms the probe in the modal, starts the session through the real `agentPresets.select` round trip, and asserts the probe lands in the composer with no failure notice.

### Staging lives inside the run's temp root

`tests/scenarios.spec.ts` creates one `mkdtemp` scratch root per test (`ensureRoot()`), stages `scenarios-staged/` inside it, and `boot()` reuses that root for the DB and composition base URL. `afterEach` removes the whole root on pass and failure alike. The repository's `examples/kb-agent/scenarios-staged/` is deleted, and the example's `.gitignore` carries `scenarios-staged/` as the backstop against a regression of that landing spot.

### Retrieval is a hard triple assertion

Per scenario the spec asserts three things before any snapshot write: at least one cited chunk; the scenario's own corpus among the citations (`toBe(true)`, so refresh mode cannot legalize a miss); and every cited chunk's `doc_id` and `chunk_idx` resolving into the doc map recorded from this run's `context.kb.ingest` returns — citations provably point at chunk space that exists in the ingested corpora, not at stale or foreign documents.

### The corpus workspace ignore is whitelist-inverted

`examples/kb-agent/.gitignore` ignores `workspace/data/*` and negates the eight committed corpus kinds: meetings, profiles, regulations (the `import-real-docs.sh` whitelist) plus cost, food-safety, market, process, and supply. The latter five are the eval gold corpus — all 13 distinct gold documents of `eval/questions.json` live under these eight directories, and `scripts/graph-smoke.mts` reads `workspace/data/supply/` — so they are committed content, not verification residue; deleting them would break the documented eval. Any other directory under `workspace/data/` (invalid `--kind` residue) is ignored. `eval/results-*.json` are regenerable eval outputs and stay local; `questions.json` stays committed.

## Alternatives considered

- **A `verify-scenario-count` gate script wired into run-gates**: rejected — a count-only check cannot catch id mismatch (rename or typo drift keeps the count); id equality needs the parsed catalog, and the vitest spec already runs under `pnpm run test` with no new aggregate wiring.
- **The drift check inside the ui-kb package tests**: rejected — a shipped package's tests reading `examples/` couples the package to repository layout; the repo-level scripts spec keeps that dependency at repo scope (the locale-dictionary-parity precedent).
- **Importing the catalog module in the scripts spec**: rejected — it drags a client-plane source file into the host typecheck face's file list (TS6307); the AST read keeps the compiler faces separate.
- **Deleting the cost/food-safety/market/process/supply directories as residue**: rejected after verification — they hold the eval gold documents and the graph-smoke input; whitelisting is the correct disposition.
- **New portal categories for compliance/ESG/e-commerce/cold-chain/finance**: rejected — every `preset.yml` classifies into the existing eight; extra categories would create the next drift surface.

## Consequences

- Portal cards, roster, READMEs, and the library agree on thirty scenarios; adding scenario 31 without touching the portal fails `pnpm run test`. The manual-sync gap the FIX-M review scored Critical is closed by a gate, not by vigilance.
- `scenarios.spec.ts` runs leave no artifacts: no `scenarios-staged/` in the example and no `kb-scenarios-*` temp roots after runs.
- The keyless snapshot's expected output is unchanged — all thirty entries already recorded `own corpus cited` — so no refresh was needed; a future degradation now fails before the refresh write executes.
- The e2e lane depends on `examples/kb-agent/scenarios` as a preset root, the same dependency the real deployment's patch carries; the lane fails if the directory contract breaks.
- Content-design rules for the nineteen corpora remain owned by the [scenario-library note](../feature/2026-09-02-kb-scenario-library-thirty.md).
