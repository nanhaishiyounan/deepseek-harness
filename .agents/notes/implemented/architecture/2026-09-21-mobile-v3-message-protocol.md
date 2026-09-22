# Agent Note: Mobile v3 — the dsh fence protocol, the form registry, and the welcome-not-impersonation contract

Status: implemented

English | [中文](2026-09-21-mobile-v3-message-protocol.zh.md)

## Problem

The mobile v2 fill loop impersonated the user (the contacts page auto-sent an opening `user` message), demanded every field from the user in `key=value` prose, had no pickable-ask concept, bound each AI colleague to one form family, and drove confirm/reject through natural-language prefixes (`确认推送：…`) parsed back by regex. The v3 redesign plans ([01](../../../../plans/2026-09-21-mobile-v3-redesign/01-product-problem.md), [02](../../../../plans/2026-09-21-mobile-v3-redesign/02-information-architecture.md)) replaced this with an eleven-state conversation machine over a structured message protocol.

## Decision

**Seven message kinds over one fence.** `protocol.ts` owns the wire vocabulary: every structured payload rides a ` ```dsh ` fence carrying `v:3` + `type` (ask_choice / ask_field / form_draft / form_confirm / reject_flow / submit_receipt); the seventh kind, `welcome`, is deliberately NOT on the wire — it is preset metadata the client renders on an empty session (static copy, no model turn, titles never consume it). Model-output tolerance: malformed or unknown fences degrade to ordinary narrative text and count in `FoldedTurn.degradedFences` instead of breaking the flow; optional presentation hints (mode/variant/allowFreeText, hints, units, reasons, suggestions) degrade to defaults rather than rejecting the payload; only structural violations of required members reject.

**Fences never render as prose.** `fold.ts` splits each assistant message into narrative runs and structured items in source order (`ChatItem` gained `ask` / `field-ask` / `action` / `receipt`); the v2 ` ```json ` draft fences keep parsing for history sessions with the recognized fence stripped from the bubble. A pick answers an ask as an ordinary user text message (`option.send ?? option.label`); the fold derives the answered state (greyed group, highlighted pick, small capsule reply) purely from replay — free text answers it too, without a highlight. User actions ride the wire as `确认写入`/`驳回` plus their fence; v2 prefix messages (`确认推送：`/`驳回：`) fold into the same `action` item, so the old protocol text no longer pollutes bubbles.

**Phase replay anchors on draftId+revision.** `cardState.ts` discriminates by fence payload: a form_confirm claims its draftId's newest-revision card (an older confirm changes nothing), a reject_flow rejects it unless it landed, a submit_receipt settles pending→submitted and carries the receipt payload; superseded revisions hide from the flow. v2 sessions keep the collection-prefix replay. Pending state now derives from the log alone.

**The six-form registry.** `formRegistry.ts` is the single source the assistant's intent matching, field-tier derivation rules, and welcome capabilities project from (采购/供应商/质检/入库/出库/回款). `matchIntent` scores intent terms with generic-register verbs weighting every entry and anti-terms demoting their family, then answers unique (≥3 leading by 2, or one strong declarative verb ≥2 with a clear lead), ambiguous (top-3 fork), or none (question-shaped sentences below the strong-hit bar hand to the read-only branch). A registry edit must be mirrored into the persona text of `mobile-form-assistant` (the plan's `{{formRegistry}}` template variable is inlined literally — the persona plugin owns the variable table and adding a slot is out of scope here).

**One form-capable colleague.** `mobile-form-assistant` is the only table-holding preset (the six-step contract rewritten around registry matching, derivation-first drafting, tier-annotated `form_draft` fields, fenced asks, and receipt summaries); `purchase-assistant`/`quality-assistant` retired. Presets publish a `welcome` block (greeting/capabilities/starters) through preset.yml → `readPresetMetadata` → `agentPreset.list` (schema-validated); the client prefers the wire block and falls back to the local `colleagues.ts` table. Sessions start by rendering the welcome — `ContactsView.start` no longer prompts anything, and the fresh-session golden asserts zero user messages.

## Consequences

- The durable log stays the single audit: picks, confirms, rejects, and receipts are all ordinary messages; a reload or the PC preview replays identical card phases and answered asks without localStorage.
- The v3 scaffolding components (`WelcomeCard`, `ChoiceBubble`, `FieldAskBubble`, `ActionBadge`, `RichContent`, `forms/v3/{PhaseStamp,DraftCard,ReceiptCard}`) carry the class/testid structure the visual batch (03 §4) restyles; tokens and Markdown rendering are intentionally out of this batch.
- The e2e seed set covers the fork lifecycle end to end: an ambiguous sentence → two-card ask_choice → picked send-text in the log → three-tier draft → fenced confirm → receipt metric card, plus a blank session asserting the welcome and A1's zero-user-message invariant.
- Legacy v2 sessions replay unchanged (fence-parse fallbacks, prefix actions, text receipts); their drafts keep the two-step review cards.

## Alternatives considered

- **`welcome` as a logged assistant message.** Rejected (02 §2.2): static copy on the wire tempts future implementations to use it as a turn trigger, recreating the impersonation bug.
- **A `nocobase.create` wire method for submit.** Unchanged rejection from v2: the agent's fenced confirm → `nb_create` flow audits the human's exact confirmed fields.
- **Per-form colleague presets.** Retired: one registry-driven assistant with a fork ask replaces the entry-bound form families (the user's "并不是只有采购单").
