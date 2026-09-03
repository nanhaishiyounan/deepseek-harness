# Agent Note: MiniMax parallel tool-call streams must keep first-delta ids through empty re-emissions

Status: implemented

English | [中文](2026-09-02-minimax-parallel-tool-call-id-aggregation.zh.md)

## Problem

MiniMax-M3 streams each parallel tool call with its full `id` and `function.name` on the call's FIRST delta, then re-emits both fields as EMPTY strings on continuation deltas. The llm-minimax aggregation treated field presence as authoritative (`call.id !== undefined`), so continuation deltas of every parallel call clobbered the captured identity. The assembled blocks dispatched as `unknown tool ""`, and the empty-id `tool_calls` entries replayed in history made the endpoint reject every later request with `400 duplicate tool_call id: "" (2013)` — the session became permanently unusable. An earlier kb-agent batch-ingest run had already observed intermittent 2013s that passed on retry; a parallel tool call in any step reproduces the failure deterministically.

## Decision

Two layers, in `packages/llm/llm-minimax`:

1. `src/translate.ts` advances an open block's `callId`/`name` only on NON-EMPTY delta values, keeping the first-delta identity of each parallel call. `closeBlock` synthesizes `chatcmpl-tool-synth-<uuid>` when a stream supplies no id at all, so the assembled block stays dispatchable and its history replayable; the random suffix keeps ids unique across steps.
2. `src/serialize.ts` repairs OUTBOUND tool-call ids per request: `serializeMessages` tracks claimed ids; an assistant tool-call with an empty or already-claimed id receives a fresh synthetic id, and a synthetic-id queue plus per-id pairing quota rewrites the matching `tool_call_id` of subsequent tool results in call order. History written before the fix therefore replays without 2013 instead of poisoning the session. A result id no assistant call ever claimed passes through unchanged so the endpoint reports the mismatch visibly.

The wire observation lives in `src/types.ts` (`WireToolCallDelta`): full id/name on the first delta of each call, empty strings on continuation deltas of parallel calls — a deviation from the OpenAI convention of omitting absent fields. `llm-deepseek` keeps `!== undefined`: DeepSeek's wire omits continuation fields, and that adapter is untouched by this change.

## Alternatives considered

**Synthesize ids in translate only, no serialize defense.** Rejected: history already written with empty ids keeps failing with 2013 on every later request; the repair must live where the request is built to rescue existing sessions.

**Pair tool results to block index instead of id.** Rejected: the wire protocol pairs `role: 'tool'` messages with `tool_call_id` only; an id-based quota preserves pairing without inventing a protocol.

**Drop tool calls with empty names at serialize time.** Rejected: dropping an assistant call strands its tool result (the endpoint rejects dangling tool messages) and silently edits history.

## Consequences

- Parallel calls dispatch correctly; every replayed request carries unique, non-empty tool_call ids paired with their results.
- The serialize repair is per-request only: session logs keep the ids they recorded (stored history is not rewritten), and a monotonic counter makes the pairing deterministic across identical requests.
- A tool result whose id no assistant call ever claimed is forwarded as-is by design.
- kb-agent batch ingest and any preset that triggers parallel tool calls no longer risk the intermittent 2013.

## Testing

`packages/llm/llm-minimax/tests/translate.spec.ts` replays the captured wire sequence (`tests/fixtures/parallel-tool-calls.events.json`, with the failing-session evidence excerpt alongside it) and asserts all three parallel blocks keep their first-delta ids and names, that no continuation-delta chunk regresses to empty identity, and that parallel calls receiving no wire ids get distinct synthesized ids. `tests/serialize.spec.ts` covers empty/duplicate id synthesis, in-order result pairing, collision-avoiding synthetic ids, orphan pass-through, surplus empty-result minting, and the non-mutation of already-unique ids. `tests/adapter.spec.ts` drives the full stream-assemble-replay path over a mock SSE server, asserting the replay request contains only unique non-empty ids paired with its tool results. `tests/adapter.e2e.ts` runs the same two-step flow against the live endpoint and self-skips without `MINIMAX_API_KEY`. A production-shape replay of the export-tax kb-agent scenario on an isolated port and database copy completed two turns with eight fully-identified parallel tool calls and zero 2013s.
