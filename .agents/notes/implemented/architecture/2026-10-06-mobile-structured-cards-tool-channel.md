# Agent Note: mobile structured cards ride a present_card tool call — the v:3 dual-channel contract

Status: implemented

English | [中文](2026-10-06-mobile-structured-cards-tool-channel.zh.md)

## Problem

Every structured card in the mobile form assistant (ask_choice / ask_field / form_draft / submit_receipt / report / approval_pending / approval_result / plan_suggest / plan_result) was a ```dsh fenced JSON block the model emitted by prompt convention. Nothing enforced the fence: MiniMax-M3 sometimes skipped the card, sometimes drifted the format (an unclosed JSON block degrades the whole card, a `type:"choice"` typo folds the card forever), and one committed turn could answer after the card. The W-round complaint —「结构化输出要保证一致，不能是掷骰子一样概率出现」— named this exactly. The plan ([plans/2026-10-06-mobile-structured-output-determinism.md](../../../../plans/2026-10-06-mobile-structured-output-determinism.md)) chose the industry-standard remedy: the card becomes a tool call with schema validation and an explicit turn end.

## Decision

**The v:3 envelope now has two channels with split authority.** The `present_card` tool ([packages/interaction/tool-present-card](../../../../packages/interaction/tool-present-card/src/index.ts)) is the only channel the model may use for the nine assistant payloads: a oneOf-discriminated `payload` parameter (structure in the schema DSL), leaf-count limits in `execute` (ask options ≥1; report metrics 1-6 / rows ≤8 / table ≤5×10 / actions ≤4), and a successful execute calls `exec.concludeTurn()` — the model mechanically cannot answer after its own card. A failed validation returns an error result so the model retries (twice), then must state honestly in business language that the card failed. The client fold ([fold.ts](../../../../packages/client/ui-mobile/src/client/fold.ts)) renders a `present_card` tool/call into the same ChatItem kinds the fence produced — the two sources are byte-equivalent inputs to one pure function, so live and replay share one path.

**The fence stays as a read-only channel.** The four user-action payloads (form_confirm / reject_flow / approval_confirm / plan_confirm) are client-authored on button taps and never were model output; they keep the fence. Historical sessions replay through the fence parser forever; the fold's dual-source merge is what the P3 replay matrix proved (a legacy fence card and a new tool card render on one screen).

**Two validators, one protocol, mirrored fixtures.** The server validates through the schema DSL + execute; the client carries its own hand-written validators (the fence read path and the replay fallback depend on them). [tool-present-card/tests/fixtures](../../../../packages/interaction/tool-present-card/tests/fixtures) is the mirror source for the ui-mobile protocol spec; any protocol change must move both sides in one PR — this sync obligation is the accepted cost of the fence-compat guarantee.

## Alternatives considered

- **Stronger prompt discipline around the fence** — rejected: stays on the <40% adherence curve the research report documented; the complaint was about exactly this.
- **Provider structured output / JSON mode** — rejected: MiniMax has no strict mode, JSON mode officially admits empty returns, and a card is an intermediate presentation artifact, not a final answer; tool-call → UI component is the generative-UI pattern.
- **Reusing the ask_user_question (userQuestions pause seam)** — rejected: composer-pause semantics for the PC; the mobile chat is turn-based, replay-equivalent with the fence UX, and wiring the RPC would build a parallel Q&A lane. Recorded as the revival path should blocking questions ever become a product requirement.
- **Migrating all thirteen payload types** — rejected: the four user-action payloads are deterministic client output, never model output; tool-izing them would only duplicate what the buttons already do.
- **Leaf-value tolerance in the schema (coerce numbers to strings)** — implemented by W21-R1 (supersedes the original deferral): the P3 matrix caught the failure mode (bare numbers like `"value": 13` refused with the path-less `matched 0`; retry loops could not self-correct), and the repair landed as execute-side coercion plus Chinese field-pathed errors inside tool-present-card with both validator mirrors widened — see [the lenient-leaves note](2026-10-06-present-card-lenient-leaves-and-pathed-errors.md) for the mechanism and its exact-one trap.

## Consequences

- Format determinism is mechanical: schema + execute + concludeTurn. The card-after-answer class of bug is unreachable.
- Replay is source-agnostic: three replay legs (fence-era, tool-era, mixed) plus reload-×3 byte-consistency passed; the degraded fold of a fence-era `type:"choice"` card is preserved as the historical state it always was.
- Multi-card batches work: two plan_suggest cards were observed in one parallel batch with the turn ending once — the persona hard rule ② (batch your parallel present_card calls) matches the concludeTurn batch semantics.
- The decision-reliability boundary is measured, not assumed: the W21 P3 matrix (demos/acceptance-w21/) holds the honest numbers — S2/S4/S5b at 100%, S1 5/5 on the contract assertion, S3 4/5 with one refusal-loop break (leaf-value typing), plus a prompt-hardening attempt that post-fix sampling showed does not close it. The residual gap is a model-capability × error-message-quality interaction, owned by the deferred alternative above.
- The persona contract's「值一律字符串」rule and the tool's strict schema are two views of one rule; the `.dsh/.agent-presets` deploy mirror must be re-synced on every persona edit (setup-nocobase verify gates the byte identity — the W2-B7 gate).

## Verification

- `pnpm vitest run packages/interaction/tool-present-card` (payload validation + concludeTurn), `pnpm vitest run packages/client/ui-mobile` (mirror fixtures), `pnpm run test:web -- mobile-assistant` (legacy fence golden, untouched) and `-- mobile-assistant-toolcard` (tool-source golden).
- Live determinism matrix + replay legs + GIF: [demos/acceptance-w21/](../../../../demos/acceptance-w21/) (p3-matrix-runs.jsonl, p3-replay-results.json, p3-s1-disambiguation.gif).
