/**
 * Translate MiniMax SSE payloads into the harness `StreamChunk` protocol.
 *
 * The M3 wire interleaves thinking INLINE in `delta.content` as
 * `<think>…</think>`, so translation runs a small streaming state machine
 * that splits the two channels even when a tag is split across chunk
 * boundaries. Parallel tool calls carry their full id and name on each
 * call's FIRST delta and re-emit both as empty strings on continuation
 * deltas; aggregation keeps the first non-empty values and synthesizes an
 * id only when a stream supplies none. Finish reason and the latest usage
 * are deferred until the stream terminates — the `[DONE]` sentinel when
 * present, otherwise EOF (MiniMax ends the stream with a usage-only chunk
 * and connection close) — covering both shapes while ensuring no chunk
 * follows `finish`. Intermediate chunks carry `finish_reason: ""`, which is
 * not a finish.
 *
 * @module dsh-llm-minimax/translate
 */

/* jscpd:ignore-start */
// jscpd: intentional template symmetry — the vendor-adapter skeleton every
// LLM adapter reproduces while evolving independently; extraction would
// couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
import { randomUUID } from 'node:crypto'
import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import { DONE } from './sse.ts'
import type { WireChunk, WireUsage } from './types.ts'

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  /** tool-call only */
  callId?: string
  name?: string
}

/**
 * Map the wire finish_reason vocabulary to the harness FinishReason.
 * @param reason - the wire `finish_reason` string (never empty here).
 * @returns the mapped reason; unrecognized values (content_filter, …) become `{kind: 'error'}` with the uppercased value as `code`.
 */
export function mapFinishReason(reason: string): FinishReason {
  switch (reason) {
    case 'stop': return { kind: 'stop' }
    case 'tool_calls': return { kind: 'tool-calls' }
    case 'length': return { kind: 'max-tokens' }
    default:
      // content_filter, future additions.
      return {
        kind: 'error',
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
      }
  }
}

/**
 * Map wire usage fields. MiniMax's `prompt_tokens` INCLUDES cache hits
 * (`prompt_tokens_details.cached_tokens`); the harness TokenUsage convention
 * is DISJOINT counts, so cache reads are subtracted out of `inputTokens`.
 * @param usage - wire usage from the trailing usage-only chunk.
 * @returns disjoint harness counts; cache/reasoning fields present only when the wire reported them.
 */
export function mapUsage(usage: WireUsage): TokenUsage {
  const cacheRead = usage.prompt_tokens_details?.cached_tokens
  const reasoning = usage.completion_tokens_details?.reasoning_tokens
  return {
    inputTokens: usage.prompt_tokens - (cacheRead ?? 0),
    outputTokens: usage.completion_tokens,
    ...cacheRead !== undefined ? { cacheReadTokens: cacheRead } : {},
    ...reasoning !== undefined ? { reasoningTokens: reasoning } : {},
  }
}

/**
 * Synthesize a tool-call id for a stream that never supplies one. The
 * endpoint has always sent ids on first deltas so far; this fallback keeps
 * the assembled block dispatchable and its history replayable (empty or
 * colliding ids are rejected with error 2013) using the endpoint's own
 * `chatcmpl-tool-*` namespace plus a random suffix unique across sessions.
 * @returns a unique non-empty tool-call id.
 */
function synthToolCallId(): string {
  return `chatcmpl-tool-synth-${randomUUID()}`
}

/** Assemble the final ContentBlock for one open block. */
function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: CallId(block.callId && block.callId.length > 0 ? block.callId : synthToolCallId()),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}
/* jscpd:ignore-end */

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

/** The longest strict prefix of `tag` that `text` ends with, or -1 when none. */
function trailingTagPrefixLength(text: string, tag: string): number {
  const limit = Math.min(text.length, tag.length - 1)
  for (let length = limit; length > 0; length -= 1) {
    if (text.endsWith(tag.slice(0, length))) return length
  }
  return -1
}

/**
 * Streaming splitter for inline `<think>` markup: routes content to the
 * reasoning channel inside the tags and to the text channel outside them,
 * buffering a possible partial tag at every chunk boundary. The whitespace
 * run directly after the closing tag is dropped (the model emits
 * `</think>\n\n` before its answer).
 */
class ThinkSplitter {
  private phase: 'before' | 'inside' | 'after' = 'before'
  private pending = ''
  /** Set when the closing tag was seen but its trailing whitespace has not. */
  private droppingWhitespace = false

  /** Feed one content fragment; returns the reasoning and text it produced. */
  push(fragment: string): { reasoning: string; text: string } {
    this.pending += fragment
    let reasoning = ''
    let text = ''
    while (this.pending.length > 0) {
      if (this.phase === 'before') {
        const at = this.pending.indexOf(OPEN_TAG)
        if (at >= 0) {
          text += this.pending.slice(0, at)
          this.pending = this.pending.slice(at + OPEN_TAG.length)
          this.phase = 'inside'
          continue
        }
        const prefix = trailingTagPrefixLength(this.pending, OPEN_TAG)
        if (prefix === this.pending.length) break // whole buffer is a partial tag; await more input
        if (prefix > 0) {
          text += this.pending.slice(0, this.pending.length - prefix)
          this.pending = this.pending.slice(this.pending.length - prefix)
        } else {
          text += this.pending
          this.pending = ''
        }
        continue
      }
      if (this.phase === 'inside') {
        const at = this.pending.indexOf(CLOSE_TAG)
        if (at >= 0) {
          reasoning += this.pending.slice(0, at)
          this.pending = this.pending.slice(at + CLOSE_TAG.length)
          this.phase = 'after'
          // Drop the whitespace run the model emits right after the tag —
          // possibly across later chunks.
          this.droppingWhitespace = true
          this.pending = this.pending.replace(/^\s*/u, '')
          if (this.pending.length > 0) this.droppingWhitespace = false
          continue
        }
        const prefix = trailingTagPrefixLength(this.pending, CLOSE_TAG)
        if (prefix === this.pending.length) break // whole buffer is a partial tag; await more input
        if (prefix > 0) {
          reasoning += this.pending.slice(0, this.pending.length - prefix)
          this.pending = this.pending.slice(this.pending.length - prefix)
        } else {
          reasoning += this.pending
          this.pending = ''
        }
        continue
      }
      // after: everything is visible text
      if (this.droppingWhitespace) {
        const stripped = this.pending.replace(/^\s*/u, '')
        if (stripped.length === 0) {
          this.pending = ''
        } else {
          this.droppingWhitespace = false
          this.pending = stripped
        }
      }
      text += this.pending
      this.pending = ''
    }
    return { reasoning, text }
  }

  /** Flush any buffered partial tag as visible text at end of stream. */
  flush(): string {
    const rest = this.pending
    this.pending = ''
    return rest
  }
}
/* jscpd:ignore-start */
// jscpd: intentional template symmetry — the vendor-adapter skeleton every
// LLM adapter reproduces while evolving independently; extraction would
// couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).

/**
 * Consume SSE data payloads and yield StreamChunks. The stream terminates at
 * the `[DONE]` sentinel or at input exhaustion (the MiniMax native shape);
 * `block-end`s, `usage`, and `finish` are all deferred to that point.
 * Malformed JSON payloads abort the stream with `MALFORMED_RESPONSE`.
 * @param payloads - SSE data payloads from {@link parseSse}.
 * @returns deltas as they arrive; a `stop` (or absent) finish with no opened
 *   blocks is a degenerate provider completion and maps to an `EMPTY_RESPONSE`
 *   error finish instead of a successful empty message.
 */
export async function* translate(payloads: AsyncIterable<string>): AsyncGenerator<StreamChunk> {
  let nextIndex = 0
  let textBlock: OpenBlock | undefined
  let reasoningBlock: OpenBlock | undefined
  const toolBlocks = new Map<number, OpenBlock>()
  const order: OpenBlock[] = []
  let pendingFinish: FinishReason | undefined
  let pendingUsage: TokenUsage | undefined
  /* jscpd:ignore-end */
  const splitter = new ThinkSplitter()

  function open(kind: OpenBlock['kind']): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: '' }
    order.push(block)
    return block
  }

  const emitContent = (split: { reasoning: string; text: string }): void => {
    const { reasoning, text } = split
    if (reasoning.length > 0) {
      if (!reasoningBlock) {
        reasoningBlock = open('reasoning')
        chunks.push({ type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' })
      }
      reasoningBlock.text += reasoning
      chunks.push({ type: 'reasoning-delta', index: reasoningBlock.index, text: reasoning })
    }
    if (text.length > 0) {
      if (!textBlock) {
        textBlock = open('text')
        chunks.push({ type: 'block-start', index: textBlock.index, blockType: 'text' })
      }
      textBlock.text += text
      chunks.push({ type: 'text-delta', index: textBlock.index, text })
    }
  }

  /** Deferred chunks for the current wire payload (deltas emit in order). */
  let chunks: StreamChunk[] = []

  const finish = (): void => {
    const trailing = splitter.flush()
    if (trailing.length > 0) {
      if (!textBlock) {
        textBlock = open('text')
        chunks.push({ type: 'block-start', index: textBlock.index, blockType: 'text' })
      }
      textBlock.text += trailing
      chunks.push({ type: 'text-delta', index: textBlock.index, text: trailing })
    }
    for (const block of order) {
      chunks.push({ type: 'block-end', index: block.index, block: closeBlock(block) })
    }
    if (pendingUsage) chunks.push({ type: 'usage', usage: pendingUsage })
    const reason = pendingFinish ?? { kind: 'stop' as const }
    chunks.push({
      type: 'finish',
      reason: reason.kind === 'stop' && order.length === 0
        ? {
          kind: 'error',
          failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
        }
        : reason,
    })
  }

  for await (const payload of payloads) {
    chunks = []
    if (payload === DONE) {
      finish()
      for (const chunk of chunks) yield chunk
      return
    }

    let chunk: WireChunk
    try {
      chunk = JSON.parse(payload) as WireChunk
    } catch {
      throw new LlmError(`malformed SSE payload: ${payload.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }

    for (const choice of chunk.choices ?? []) {
      const delta = choice.delta

      const content = delta?.content
      if (typeof content === 'string' && content.length > 0) {
        emitContent(splitter.push(content))
      }

      for (const call of delta?.tool_calls ?? []) {
        let block = toolBlocks.get(call.index)
        if (!block) {
          block = open('tool-call')
          toolBlocks.set(call.index, block)
          chunks.push({ type: 'block-start', index: block.index, blockType: 'tool-call' })
        }
        // Each call's FIRST delta carries its full id and name; continuation
        // deltas of parallel calls re-emit both as EMPTY strings. Only
        // non-empty values advance the assembly, or later deltas would
        // clobber the captured identity.
        if (call.id) block.callId = call.id
        if (call.function?.name) block.name = call.function.name
        const fragment = call.function?.arguments ?? ''
        block.text += fragment
        chunks.push({
          type: 'tool-call-delta',
          index: block.index,
          id: CallId(block.callId ?? ''),
          ...block.name !== undefined ? { name: block.name } : {},
          argumentsDelta: fragment,
        })
      }

      // Intermediate M3 chunks repeat finish_reason: ""; only a non-empty
      // value is the terminal one.
      if (typeof choice.finish_reason === 'string' && choice.finish_reason.length > 0) {
        pendingFinish = mapFinishReason(choice.finish_reason)
      }
    }

    // Usage arrives as a trailing choices-empty chunk — keep the latest.
    if (chunk.usage) pendingUsage = mapUsage(chunk.usage)

    for (const out of chunks) yield out
  }

  // MiniMax terminates the stream with the usage-only chunk and connection
  // close; reaching here is the normal native end, not truncation.
  chunks = []
  finish()
  for (const chunk of chunks) yield chunk
}
