# Agent Note: present_card lenient leaves and Chinese-pathed errors — the W21-R1 resolve step

Status: implemented

English | [中文](2026-10-06-present-card-lenient-leaves-and-pathed-errors.zh.md)

## Problem

The W21-P3 determininess matrix left one failure family open: MiniMax-M3 emits bare numbers at id/value/count leaves (`"value": 13`, a bare-number report table cell like `15800.11`), or passes the whole payload as a JSON string (the double-serialization shape an old-fence conversation context induces). The nine-branch oneOf schema correctly refused both, but the generic schema walk reports `must match exactly one oneOf branch (matched 0)` — no field path — so the model blind-retried six or seven times, once ending in a placeholder "test" card. Prompt-side hardening was falsified by post-fix sampling (s3f 1/3), proving the root cause was mechanical, not contractual.

## Decision

**Accept-and-normalize at the execute boundary, with every reachable rejection field-pathed in Chinese.** The payload schema keeps the nine closed branches as the model's generation guide but widens the 24 id/value/count leaf positions to `string | number` and adds a tenth string branch (the JSON-stringified payload). A single exported pure step, `resolvePresentCardPayload` ([tool-present-card/src/index.ts](../../../../packages/interaction/tool-present-card/src/index.ts)), owns normalization: a string payload is JSON-parsed first, `v`/`type` are discriminated with named diagnostics, and a schema-driven walk coerces finite numbers to strings while collecting Chinese field-pathed violations (`payload.options[2].value 应为字符串或数字（收到布尔值 true）`) — the request/spec resolve convention, an explicit step before validation, never hidden inside `run()`. A coerced payload behaves exactly like the equivalent all-strings payload (receipt, landing, rendering unchanged); booleans, arrays, objects, and stray nulls at those leaves stay rejections. `execute` rides the resolve step, then the existing count bounds.

**Both mirrors move in one PR.** The ui-mobile protocol validators widen the same 24 positions (`coercedText`, the any-string `fields[].value` keeps its empty-string semantics plus number coercion), and `parseDshPayloadObject` parses a stringified payload before validation — so the fence read path and the tool-call path coerce identically and a card renders the same whichever channel carried it. Nine new fixtures (`*.numeric-values.valid`, `payload-string.*`, `ask-choice.boolean-value`, `report.title-number`) lock the shared corpus.

Two mechanical traps are part of the record:

- **A scalar oneOf union must not carry both `number` and `integer` branches** — an integer matches both and the exact-one rule rejects it (`matched 2`). One `number` branch covers every finite number.
- **The generic schema walk still owned one residual surface**: a structurally broken object payload (missing required members, bad enum) was refused with the branch-less `matched 0` before `execute` could path it. The verifier's W21-R1 rerun then observed it for real — an out-of-range `report.metrics[].kind:"id"` on an object payload (session-c86a6a7e seq289) — so the "zero observations" stance did not survive. W21-R2 closed the residual by declaring `payload` as `type:'json'`; see [2026-10-06-present-card-nonintercept-payload-and-mirror-alignment](2026-10-06-present-card-nonintercept-payload-and-mirror-alignment.md).

## Alternatives considered

- **Pathing the generic oneOf error inside `packages/core/tools`** — rejected: the plan's frozen-surface list forbids touching the tools core for this feature; the execute-side resolve step achieves the model-visible goal inside the tool package.
- **Dropping the nine-branch schema to `type: 'json'`** — rejected at the time: the schema was the model's generation guide and the residual had zero observations. Reversed in W21-R2 once the residual was observed for real and the guidance moved into the parameter description table; see the R2 note.
- **Widening every leaf (label/question/title too)** — rejected: narrative leaves must stay string-only; the widening set is exactly the positions whose business meaning is numeric (ids, values, counts, money).
- **Stronger persona wording** — rejected by falsification: the P3 post-fix sample showed the violation rate unchanged with longer retry chains.

## Consequences

- The observed S3/R4 failure shapes are unreachable: numeric leaves coerce silently and succeed; a stringified payload parses; the remaining rejections name their field path so one retry corrects.
- The fence read path now coerces too: a historical fence with numeric leaves renders instead of degrading (behavior change, mirror-intended); a `form_confirm` fence with a numeric row value parses instead of degrading, but user-action payloads never render from assistant messages either way.
- `fieldRowOf` keeps the empty-string `value` semantics (the "generated after landing" spelling) — coercion added, strictness not.
- The persona's「值一律字符串」rule stays; the leniency is a safety net, not a license.

## Verification

- `pnpm vitest run packages/interaction/tool-present-card` (46 tests: coerced/valid/invalid/payload-string/Chinese-pathed diagnostics), `pnpm vitest run packages/client/ui-mobile` (809 tests incl. the mirror cases), `pnpm run test:web -- mobile-assistant-toolcard` (4/4: golden extended with the numeric-leaf approval and stringified plan cards — new entries only).
- Live re-verification matrix under [demos/acceptance-w21/](../../../../demos/acceptance-w21/) (`w21-r1-*` evidence).
