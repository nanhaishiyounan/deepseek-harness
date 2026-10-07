# Agent Note: present_card non-intercepting payload declaration and widget/null mirror alignment — W21-R2

Status: implemented

English | [中文](2026-10-06-present-card-nonintercept-payload-and-mirror-alignment.zh.md)

## Problem

Two findings from the W21-R1 verification rerun:

1. **The framework-level matched-0 residual was real, not theoretical.** The verifier's num leg (session-c86a6a7e, seq289) sent an object payload whose `report.metrics[].kind` carried the invented `"id"`; the framework oneOf walk refused it with `must match exactly one oneOf branch (matched 0)` — no field path — and the model blind-corrected once before passing by luck. The leg finished 2/3 against the batch's 3/3 claim, falsifying the R1 note's "zero observations" stance.
2. **`widget` requiredness diverged between the mirrors.** The server schema declared it optional at both positions (`ask_field.field.widget`, `form_draft.fields[].widget`) while the ui-mobile parser required it, so a payload legal to the server could conclude the turn and then fold degraded on the client — the end-to-end break shape.

The same audit exposed a leniency-divergence family: optional-collection `null` (rows/table treated as absent client-side, rejected server-side; actions rejected on both but by different rules), client-side defaults for omitted presentation hints (`mode`/`variant`/`allowFreeText`/`suggestions`), the captured `create-task` `text` alias fold, and Chinese approval-state spellings — all client-lenient shapes the server rejects.

## Decision

**Declare `payload` as `type: 'json'` so the framework matcher never rejects a payload shape; every violation reports from the execute-side resolve walk with a Chinese field path and the legal candidates.** An exact-one `oneOf` cannot carry a fallback branch beside the nine strict branches — a valid object would match two branches and die `matched 2` (the same trap as R1's `number`+`integer` scalar union) — so the nine-branch skeleton stays the walk's authority while the model-facing guidance moved into the parameter description (a per-branch field/enum table) plus the persona's worked examples. The seq289 shape now returns `payload.metrics[1].kind 应为 "count"/"money"/"percent"/"text" 之一（收到字符串 "id"）`.

**Mirror alignment, adjudicated per item.** `widget` becomes `required: true` on the server at both positions (the client was already strict; the card cannot render without it — client wins). An explicit `null` at an optional leaf without an enum/const constraint means "left this one out" and is omitted; the server walk gained this rule and `report.actions` joined rows/table on the client, so both mirrors now treat all three optional collections identically. Optional enum leaves keep rejecting `null` (present-but-illegal), matching the client. The client's fence-path leniencies (presentation-hint defaults, `text` alias fold, Chinese state words) stay deliberately for legacy fence replay and are unreachable on the tool path because the server rejects those shapes first — documented in the tool README rather than forced into symmetry.

The persona's two stale sentences (「数字会整卡被拒」「payload 必须是对象」) were rewritten to the current mechanism and the `.dsh` preset projection re-synced byte-identically.

## Alternatives considered

- **Loosening only the enum/discriminant literals in the declared schema** — rejected: the framework oneOf would still reject missing-required and extra-property object payloads pathlessly; the residual would shrink, not close, and a "zero matched-0" claim would again rest on luck.
- **Pathing the oneOf failure inside `packages/core/tools`** — rejected (again): shared base; every tool's matcher semantics and tests would carry the blast radius for one consumer's diagnostics.

## Consequences

- Framework-level payload rejection is structurally unreachable: any lossless JSON value reaches `resolvePresentCardPayload`, and the model always gets a pathed correction target.
- Schema-carried generation guidance is gone by design; first-shot adherence now leans on the parameter description table and the persona. The R1 note's rejection of this shape is reversed here on falsification evidence, not preference.
- `PresentCardPayload` types `widget` as required at both positions; a fixture omitting it would now fail — none did.
- Server and client agree on null semantics at every optional leaf without a literal constraint; the remaining asymmetries are enumerated, scoped to fence replay, and documented.

## Verification

- `pnpm vitest run packages/interaction/tool-present-card` (66 tests: a 13-entry enum out-of-range table over every enum leaf, the seq289 replica through `ctx.tools.execute` asserting the pathed text and no `matched`, widget-missing rejections on both mirrors, null-collection normalization), `pnpm vitest run packages/client/ui-mobile` (815 tests incl. the mirror corpus), e2e `mobile-assistant-toolcard` 4/4.
- Live re-verification under [demos/acceptance-w21/](../../../../demos/acceptance-w21/) (`w21-r2-*` evidence): num ×3 strengthened inductions, an enum-out-of-range live leg.
