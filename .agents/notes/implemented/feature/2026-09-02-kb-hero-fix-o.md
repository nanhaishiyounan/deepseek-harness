# Agent Note: kb hero FIX-O batch — derived count assertion, rail wrap defense, reduced-motion, probe fail-loud, railCount wiring

Status: implemented

English | [中文](2026-09-02-kb-hero-fix-o.zh.md)

## Problem

Six small defects clustered on the kb blank-session hero and its owning tests: the scenario-badge spec assertion hardcoded `'11'` while the component derives the count from `KB_SCENARIOS.length` (the next catalog sync would fail the spec on a number that is not the source of truth); a six-card category group (supply-chain) is 1000px wide against a 960px-capped portal, so at narrower desktop widths the card row overflowed the rail horizontally; the scenario card's hover `transition` had no `prefers-reduced-motion` exemption unlike the four established module-CSS patterns elsewhere in the client; the scenario-set spec silently fell back to `meta.name` when a `preset.yml` lacked `probe`, hiding an incomplete scenario behind a name-only retrieval; the `.railCount` CSS module class existed but nothing rendered it; and the spec's `afterEach` ran `dispose()` before `rm(root)` on one chain, so a disposal failure skipped scratch-root removal entirely.

## Decision

### O1: the badge assertion derives from the same table the component reads

`kbherodock.client.spec.tsx` imports `KB_SCENARIOS` and asserts `String(KB_SCENARIOS.length)` into the `usage.chipScenarios` template — the spec and the chip now drift together or not at all.

### O2: hero rail, motion, fail-loud, and cleanup hardening

- **Rail wrap.** `.scenarioCards` wraps on desktop and `.scenarioGroup` gains `max-width: 100%` — without the cap a `flex: none` group never shrinks, so the wrap could not engage and the row kept overflowing. The `max-width: 768px` media query restores `nowrap` plus the unclamped group, keeping the narrow-screen one-row horizontal scroll untouched. Evidence: an 800px-viewport Playwright run over the built app (separate OS-assigned port, the kb-workbench world) asserts the portal's `scrollWidth - clientWidth <= 1` and captures `.artifacts/hero-800px.png`; the supply-chain cards visibly wrap into a second row inside the rail.
- **Reduced motion.** `@media (prefers-reduced-motion: reduce) { .scenarioCard { transition: none } }` joins the existing QuestionComposer/SkillRow/SidebarRoot/Toast pattern family.
- **Probe fail-loud.** `ScenarioMeta` declares `probe?: string`; the structure block asserts `expect(meta.probe, ...)` per scenario, and the retrieval keyword reads `meta.probe ?? meta.name!` — the fallback is now type completeness only, never a silent degradation.
- **railCount wiring.** New `scenario.railCount` key (zh `'{n} 个场景 · 滚动查看'`, en `'{n} scenarios · scroll for more'`) renders inside the scenario heading as a `.railCount` span with `n = KB_SCENARIOS.length` — same source as the badge. The class overrides the heading's inherited `text-transform` and rides its own 12px tertiary style. The ready-chips spec asserts the line with the same derived count.
- **Cleanup isolation.** The scenario-set `afterEach` collects `dispose()` and `rm(root)` failures independently (`.catch` into a failures array; single failure rethrown, multiple wrapped in `AggregateError`) — the kb-workbench.e2e.ts cleanup template.

## Alternatives considered

- **`flex-wrap: wrap` on `.scenarioCards` alone**: insufficient — an unclamped `flex: none` group sizes to its max-content width, so the row wraps nothing and still overflows; the group cap is what makes the wrap reachable.
- **Reusing `usage.chipScenarios` for the rail line**: the chip copy has no "scroll for more" tail, and concatenating untranslated fragments per call site is worse than one owned key in the plugin's locale namespace.

## Consequences

- `packages/client/ui-kb/src/client/hero/hero.module.css` (group cap, wrap, railCount styling, reduced-motion block), `src/client/locales.ts` (new key, zh + en), `src/client/hero/KbHeroDock.tsx` (railCount span).
- `packages/client/ui-kb/tests/kbherodock.client.spec.tsx` (derived badge + railCount assertions); `examples/kb-agent/tests/scenarios.spec.ts` (probe fail-loud, isolated afterEach).
- The 800px evidence shot is run-scoped (`.artifacts/`, gitignored); the geometry assertion lived in a temporary spec deleted after the capture.
