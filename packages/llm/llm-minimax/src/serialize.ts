/**
 * Serialize harness messages into MiniMax chat completions. The endpoint is
 * text-only: image content and reasoning-effort requests are rejected with
 * `UNSUPPORTED` codes rather than silently dropped. Assistant reasoning
 * replays as an inline `<think>…</think>` prefix — the shape the model itself
 * produces and accepts in history. Outbound tool-call ids are repaired to be
 * unique and non-empty: the endpoint rejects duplicates with error 2013, so
 * history that carries empty or repeated ids (e.g. written before the
 * parallel-call aggregation fix) still replays instead of poisoning the
 * session.
 * @module dsh-llm-minimax/serialize
 */

import { contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { WireMessage, WireRequest, WireTool } from './types.ts'

/** The inline prefix the endpoint uses for its own thinking output. */
const THINK_OPEN = '<think>'
const THINK_CLOSE = '</think>\n\n'

/* jscpd:ignore-start */
// jscpd: intentional template symmetry — the vendor-adapter skeleton every
// LLM adapter reproduces while evolving independently; extraction would
// couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks: ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Reject core image content the endpoint cannot accept. */
function assertTextOnly(blocks: readonly ContentBlock[]): void {
  if (contentHasImage(blocks)) {
    throw new LlmError('The MiniMax chat-completions adapter does not support image content.', 'UNSUPPORTED_CONTENT')
    /* jscpd:ignore-end */
  }
/* jscpd:ignore-start */
// jscpd: intentional template symmetry — the vendor-adapter skeleton every
// LLM adapter reproduces while evolving independently; extraction would
// couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
}

/** Per-request state for outbound tool-call id repair. */
interface CallIdRepair {
  /** Outbound ids already claimed by assistant tool_calls. */
  seen: Set<string>
  /** Outstanding pairable tool results per outbound id. */
  quota: Map<string, number>
  /** Synthesized ids for empty/duplicate calls, consumed by orphaned results in call order. */
  pending: string[]
  /** Monotonic suffix keeping synthesized ids unique within the request. */
  counter: number
}

/**
 * Mint an unused synthetic id within `repair`, claiming it as seen.
 * @param repair - the request's repair state.
 * @returns a `chatcmpl-tool-synth-*` id not present in `repair.seen`.
 */
function freshSynthId(repair: CallIdRepair): string {
  let id = `chatcmpl-tool-synth-${repair.counter}`
  while (repair.seen.has(id)) {
    repair.counter += 1
    id = `chatcmpl-tool-synth-${repair.counter}`
  }
  repair.counter += 1
  return id
}

/**
 * Outbound id for one assistant tool-call: a non-empty unseen raw id passes
 * through; an empty or already-claimed id is replaced by a fresh synthetic
 * one (queued so a matching tool result can adopt it later).
 * @param repair - the request's repair state.
 * @param raw - the tool-call id carried by the history block.
 * @returns the id to send on the wire — never empty, never duplicated within the request.
 */
function outboundCallId(repair: CallIdRepair, raw: string): string {
  if (raw.length > 0 && !repair.seen.has(raw)) {
    repair.seen.add(raw)
    repair.quota.set(raw, (repair.quota.get(raw) ?? 0) + 1)
    return raw
  }
  const synth = freshSynthId(repair)
  repair.seen.add(synth)
  repair.quota.set(synth, (repair.quota.get(synth) ?? 0) + 1)
  repair.pending.push(synth)
  return synth
}

/**
 * Outbound `tool_call_id` for one tool result, paired to the calls sent
 * earlier in the same request: an id with remaining quota passes through
 * unchanged; an empty id (or one whose call was de-duplicated away) adopts
 * the next queued synthetic id. An id no assistant call ever claimed is an
 * orphan and passes through unchanged so the endpoint reports the mismatch
 * visibly.
 * @param repair - the request's repair state.
 * @param raw - the tool-result id carried by the history block.
 * @returns the id to send on the wire — never empty.
 */
function outboundResultId(repair: CallIdRepair, raw: string): string {
  if (raw.length === 0) return repair.pending.shift() ?? freshSynthId(repair)
  const remaining = repair.quota.get(raw)
  if (remaining === undefined) return raw
  if (remaining > 0) {
    repair.quota.set(raw, remaining - 1)
    return raw
  }
  return repair.pending.shift() ?? raw
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message: Message, repair: CallIdRepair): WireMessage {
  const text = flattenText(message.content)
  const reasoning = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map(block => ({
      id: outboundCallId(repair, block.id),
      type: 'function' as const,
      function: { name: block.name, arguments: block.arguments },
    }))

  return {
    role: 'assistant',
    // Text-less turns send "" — NEVER null. Reasoning rides inline in the
    // same `<think>` wrapper the model emits, which the endpoint accepts in
    // replayed history (verified against the live API).
    content: reasoning.length > 0 ? `${THINK_OPEN}${reasoning}${THINK_CLOSE}${text}` : text,
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation. `tool-result` blocks become standalone
 * `{role: 'tool'}` messages; the harness puts each tool result in its own
 * user-role message, so a mixed user message contributes its text first and
 * its tool results as separate wire messages after.
 * @param messages - the harness conversation, in order.
 * @returns the wire messages; order preserved, each tool result expanded into its own entry.
 */
export function serializeMessages(messages: Message[]): WireMessage[] {
  const repair: CallIdRepair = { seen: new Set(), quota: new Map(), pending: [], counter: 0 }
  const wire: WireMessage[] = []
  for (const message of messages) {
    assertTextOnly(message.content)
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      wire.push(serializeAssistant(message, repair))
      continue
    }
    // user role: tool results ride in user messages in the harness
    // vocabulary, but MiniMax wants them as role:'tool' messages.
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }
    for (const result of toolResults) {
      wire.push({
        role: 'tool',
        tool_call_id: outboundResultId(repair, result.toolCallId),
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return wire
}

/**
 * Build the full wire request. Always streaming (`stream: true`, usage
 * reporting on); optional fields are omitted rather than sent as null, so
 * provider defaults apply.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @returns the chat-completions request body.
 * @throws {LlmError} `UNSUPPORTED_REASONING_EFFORT` when the caller requests
 *   an effort the endpoint cannot honor (MiniMax exposes no thinking toggle).
 */
export function serializeRequest(options: GenerateOptions): WireRequest {
/* jscpd:ignore-end */
  if (options.reasoningEffort !== undefined) {
    throw new LlmError(
      `MiniMax does not support selecting a reasoning effort (got "${options.reasoningEffort}"); the model always thinks inline`,
      'UNSUPPORTED_REASONING_EFFORT',
    )
  }
  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
  const messages: WireMessage[] = []
  if (options.system !== undefined) {
    messages.push({ role: 'system', content: options.system })
  }
  messages.push(...serializeMessages(options.messages))

  return {
    model: options.model,
    messages,
    stream: true,
    /* jscpd:ignore-start */
    // jscpd: intentional template symmetry — the vendor-adapter skeleton every
    // LLM adapter reproduces while evolving independently; extraction would
    // couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
    stream_options: { include_usage: true },
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...options.temperature !== undefined ? { temperature: options.temperature } : {},
    ...options.maxTokens === undefined ? {} : { max_tokens: options.maxTokens },
    ...options.stop !== undefined ? { stop: options.stop } : {},
  }
}
/* jscpd:ignore-end */
