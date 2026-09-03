/**
 * MiniMax chat-completions wire format (OpenAI-compatible with MiniMax
 * deviations). Types only.
 *
 * Source of truth: live-endpoint probes against api.minimaxi.com/v1
 * (2026-08-29). Deviations from OpenAI: thinking arrives INLINE in
 * `delta.content` as `<think>…</think>` (no `reasoning_content` field, and
 * `enable_thinking: false` is not honored); intermediate chunks carry
 * `finish_reason: ""`; the stream ends with a usage-only chunk
 * (`choices: []`) followed by connection close — no `[DONE]` sentinel; error
 * bodies use `{"type":"error","error":{"type","message","http_code"}}`.
 *
 * @module dsh-llm-minimax/types
 */

/** Request body for `POST {baseURL}/chat/completions`. */
export interface WireRequest {
  model: string
  messages: WireMessage[]
  stream: true
  stream_options: { include_usage: true }
  tools?: WireTool[]
  temperature?: number
  max_tokens?: number
  /** Stop sequences (OpenAI `stop`), mapped from `GenerateOptions.stop`. */
  stop?: string[]
}

/** System-role message: a single string of instructions. */
export interface WireSystemMessage {
  role: 'system'
  content: string
}

/** User-role message: text only (the endpoint accepts no images). */
export interface WireUserMessage {
  role: 'user'
  content: string
}

/**
 * Assistant-role history message. Reasoning replays as an inline
 * `<think>…</think>` prefix inside `content` — the same shape the model
 * itself produces — because the endpoint has no separate reasoning field.
 * Text-less turns send `""`, never null.
 */
export interface WireAssistantMessage {
  role: 'assistant'
  content: string
  tool_calls?: WireToolCall[]
}

/** Tool-role message: the result of one tool call, keyed by its call id. */
export interface WireToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

/** One entry of the request `messages` array, discriminated on `role`. */
export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage

/* jscpd:ignore-start */
// jscpd: intentional template symmetry — the vendor-adapter skeleton every
// LLM adapter reproduces while evolving independently; extraction would
// couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/** A completed tool call replayed on an assistant history message; `arguments` is the raw JSON string. */
export interface WireToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

/** One entry of the request `tools` array; `parameters` is a JSON Schema object. */
export interface WireTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** One parsed SSE `data:` payload (a chat.completion.chunk). */
export interface WireChunk {
  /** Empty on the trailing usage-only chunk; entries may carry `finish_reason: ""`. */
  choices?: WireChoice[]
  /** Arrives as a trailing usage-only chunk; `null` on content chunks. */
  usage?: WireUsage | null
}

/** One streamed choice (requests always ask for a single one). */
export interface WireChoice {
  delta?: WireDelta
  /** Empty string on intermediate chunks; the terminal value on the last content chunk. */
  finish_reason?: string | null
}

/** The incremental content of one streamed choice; any subset of fields may be present per chunk. */
export interface WireDelta {
  role?: string
  /** Visible text AND inline `<think>…</think>` reasoning, interleaved. */
  content?: string | null
  /* jscpd:ignore-end */
  tool_calls?: WireToolCallDelta[]
}

/**
 * A streamed fragment of one tool call; fragments sharing an `index`
 * concatenate into one call. Each call's FIRST delta carries its full `id`
 * and `function.name`; continuation deltas of parallel calls re-emit both as
 * EMPTY strings (live-wire observation, 2026-09-02), so consumers must
 * ignore empty values rather than treat presence as authoritative.
 */
export interface WireToolCallDelta {
  /** Disambiguates parallel tool calls; stable across a call's deltas. */
  index: number
  /** Full id on the call's first delta; empty string on continuation deltas. */
  id?: string
  type?: 'function'
  function?: {
    /** Full name on the call's first delta; empty string on continuation deltas. */
    name?: string
    /** Argument JSON fragment (concatenate across deltas). */
    arguments?: string
  }
}

/**
 * Wire token accounting. `prompt_tokens` INCLUDES cache hits; `mapUsage`
 * subtracts them to keep the harness convention of disjoint counts.
 */
export interface WireUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens?: number
  prompt_tokens_details?: { cached_tokens?: number }
  completion_tokens_details?: { reasoning_tokens?: number }
}

/** Non-2xx error body: `{"type":"error","error":{"type","message","http_code"}}`. */
export interface WireError {
  type?: string
  error?: { type?: string; message?: string; code?: string; http_code?: string }
  request_id?: string
}
