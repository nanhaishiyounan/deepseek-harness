# Agent Note: Hallucinated CSS theme tokens fail silently until the static gate

Status: implemented

English | [中文](2026-09-08-hallucinated-theme-tokens-static-gate.zh.md)

## Problem

Theme-namespace custom properties (`--dsw-*`, `--ds-*`) resolve at computed-value time: an undefined `var(--dsw-font-s-13)` is not an error — the declaration becomes invalid at computed-value time and the property falls back to inherited or initial. No gate compared `var()` references with definitions, so component CSS written against token names that were never defined (~77 declarations across four packages, plus 8 pre-existing tokens in five more packages) rendered silently wrong while looking correct to the eye; the same wave left 14 `var()` fallbacks carrying literal colors, which [docs/web-styling.md](../../../../docs/web-styling.md) forbids in feature components. Diagnosis and measured numbers: [plans/diagnosis-2026-09-08.zh.md](../../../../plans/diagnosis-2026-09-08.zh.md).

## Decision

### Repair by mapping to existing tokens, not by defining new ones

Most hallucinated names were misspellings or near-duplicates of an existing semantic token (`--dsw-font-s-13` → `--dsw-font-xs-13`, `--dsw-alias-border` → `--dsw-alias-border-l1`, `--dsw-alias-bg-sink` → `--dsw-alias-bg-module-platform`, `--dsw-alias-state-danger` → `--dsw-alias-state-error-primary`); each reference was retargeted to the existing token, and the literal-color fallbacks were deleted the same way — every needed semantic color already had a token.

Three tokens were genuinely missing and got definitions:

- `--dsw-alias-state-error-tertiary` completes the tertiary layer that success/warn/business already had (light `red-100`, dark `red-900`), in both theme segments of design-platform.css.
- `--ds-skeleton-pulse` / `--ds-skeleton-shimmer` (skeleton animation timings) live in base.css's upstream `--ds-*` area, defined only under `prefers-reduced-motion: no-preference`, with opposite-phase keyframes.

`--dsw-alias-gap-sm` / `--dsw-alias-gap-md` had no spacing scale to map to; those call sites use inline 4px/8px lengths.

### Static gate: packages/client/ui-theme/tests/css-tokens.client.spec.ts

Three rules over all client CSS, running with the ordinary test suite:

1. every theme-namespace `var()` reference resolves against the union of client CSS definitions;
2. no `var()` fallback carries a color literal (`#hex`, `rgb()`, `hsl()`); the only exemption is the hardcoded `FALLBACK_EXEMPTIONS` list — `web/src/base.css`, whose fallbacks keep the pre-theme first paint readable (boot order per the [pre-plugin theme bootstrap note](2026-08-10-pre-plugin-theme-bootstrap.md)) — and a hygiene test keeps every entry a real file that still uses fallbacks; there is no per-line inline exemption syntax;
3. every theme token defined in design-platform.css must be defined in both its light and dark segments — the sheet defines the static scale and the alias/specific layers twice, once per theme, and a token present in only one segment silently vanishes in the other theme (173 tokens per segment when the rule landed).

Non-theme component contract variables (`--dsh-*`, `--trajectory-*`, injected by React inline styles at runtime) are outside the gated namespaces on purpose: they are invisible to static analysis by design.

## Alternatives considered

**Defining each hallucinated token instead of retargeting references.** Rejected: the names were near-duplicates of existing semantic tokens; defining them would grow the token surface with synonyms and guarantee future drift between each pair.

**A runtime computed-style sweep as the gate.** Rejected: it observes only rendered nodes on pages someone opens, needs a browser in CI, and reports DOM locations instead of the declaring file:line. The static scan runs in vitest, sees every CSS file including unmounted components, and fails at the declaration site.

**Requiring a fallback in every `var()`.** Rejected: a fallback hides the missing-token bug (the declaration renders with the fallback value) and re-legitimizes the literal-color path web-styling.md forbids.

## Consequences

- 327 `var()` references across the four repaired packages: 104 undefined → 0; whole-client theme namespace: 33 undefined → 0; literal fallbacks 14 → 0 (including 5 animation fallbacks).
- A hallucinated token name, a literal color fallback outside base.css, or a one-sided light/dark definition in design-platform.css fails `pnpm test` with file:line.
- A new design-platform token must land in both theme segments in the same change, or the symmetry rule fails the build.
- `web/src/base.css` stays the only fallback exemption; removing its boot-order reason requires re-visiting the pre-plugin theme bootstrap note.
