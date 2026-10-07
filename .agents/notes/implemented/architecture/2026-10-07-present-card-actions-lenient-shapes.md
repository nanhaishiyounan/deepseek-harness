# Agent Note: present_card actions lenient shapes — wrapper-key flattening, missing-kind inference, skeleton errors

Status: implemented

English | [中文](2026-10-07-present-card-actions-lenient-shapes.zh.md)

## Problem

A live supply-chain session on the mobile colleague (enterprise-data-assistant, gateway :3080) folded four consecutive `present_card` report calls on the same `actions` mistake and finally dropped the buttons to get a card through — a functional-loss bypass. The raw session capture showed the model's two spellings: the wrapper key (`{"view":{"label":…,"route":…}}`, attempts 1–3) and the flat object with the `kind` field missing (attempt 4). The four violations were byte-identical and named only the four kind values — never the discriminant field name, never a concrete element example — so the model had no path to the one legal flat shape. Two teaching amplifiers: the failing session's persona carried zero present_card guidance (relying entirely on the tool description), and the tool's own parameter description used the compact union notation `actions?[≤4]{view{label,route}|…}` which reads exactly as the wrapper-key shape the model sent.

## Decision

Three lossless actions spellings now resolve instead of violating, mirrored on the client protocol parser (the fold re-validates the raw tool arguments, so a server-coerced card with a malformed raw spelling still needs the client mirror to render):

- The **wrapper key** flattens: a single-key object whose key is a branch's const value wrapping that branch's fields merges to `{kind, …inner}`; the wrapper key wins over an inner discriminant of the same field.
- A **missing discriminant** is filled when no branch's discriminant field is present and exactly one branch's other required fields are all present (`{label,route}` → view; `{label,title}` → create-task). An explicit-but-illegal `kind` is never overridden; an ambiguous signature (`{label,route,title}`) stays a violation.
- A **lone actions object** lifts to the one-element array before the walk.

A discriminant failure now appends the four concrete JSON skeletons (`{"kind":"view","label":"…","route":"…"}/…`), generated from the branch schemas so they cannot drift, and the parameter description spells the flat shape with a copyable example instead of the ambiguous union notation. The mobile-form-assistant persona few-shot gained the `view` form beside `create-task` plus the "kind is a sibling field, not a wrapper key" rule.

## Alternatives considered

- **Persona teaching only** — rejected as sufficient: the failing session ran a preset with no present_card teaching at all; tool-surface fixes protect every preset, persona fixes protect one.
- **Coercing the create-task `text` alias server-side** — deferred: the client fence parser already folds it; on the tool path the server's two pathed violations self-correct in one round. Pre-existing documented asymmetry.
- **Lifting any single object at any array position** — rejected: unscoped array-position lifting would also widen `options`/`metrics`/`fields` without diagnosis evidence; the lift stays report-actions-specific.

## Consequences

- The user's exact failure spellings now pass outright (server accepts, client renders the buttons); novel malformed spellings fail with a copyable shape.
- Live matrix (7 legs): cards 7/7, actions retained 7/7, zero wrapper-key/missing-kind recurrences (all first shots flat-kind), zero `matched 0`. Residual non-actions break points recorded honestly for future batches: `table.rows` object rows, report body re-wrapped under a `report` key, invented `rows[].level` enum, actions >4.
- The error-text change updates the exact-text spec assertions with the behavior change; fixtures grew 3 valid + 1 ambiguous-invalid entries consumed by both mirror specs.

## Verification

- `pnpm vitest run packages/interaction/tool-present-card` and `pnpm vitest run packages/client/ui-mobile` (both mirror specs over the shared fixture corpus); `pnpm run test:web apps/web/tests/mobile-assistant-toolcard.e2e.ts`; `pnpm run typecheck`.
- Live matrix ledger and screenshots: [demos/acceptance-w21/](../../../../demos/acceptance-w21/) (w21-r8-diagnosis.md, w21-r8-matrix-runs.jsonl, w21-r8-matrix-summary.json).
