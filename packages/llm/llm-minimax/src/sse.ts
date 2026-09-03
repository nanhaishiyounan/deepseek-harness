/**
 * Decode an SSE byte stream into event `data` payloads. Framing — chunk
 * reassembly, UTF-8/CRLF/BOM handling, comment and non-data field skipping,
 * multi-`data:` joining — is `eventsource-parser`'s. Comments are reported
 * only through an optional transport-activity callback.
 *
 * This module keeps the MiniMax protocol: the stream ENDS at connection
 * close (or an optional `[DONE]` sentinel on compatible gateways) with no
 * truncation error of its own — the trailing usage-only chunk and the
 * adapter's idle watchdog own termination detection.
 *
 * @module dsh-llm-minimax/sse
 */

import { EventSourceParserStream } from 'eventsource-parser/stream'

/* jscpd:ignore-start */
// jscpd: intentional template symmetry — the vendor-adapter skeleton every
// LLM adapter reproduces while evolving independently; extraction would
// couple vendor timelines (Agent Note 2026-08-29-duplication-gate-intentional-symmetry).
/** The terminal payload OpenAI-compatible gateways may send after the last chunk. */
export const DONE = '[DONE]'

/**
 * Parse an SSE byte stream into data payloads. Yields a `[DONE]` sentinel if
 * the endpoint sends one, then returns; ends normally at EOF otherwise.
 * @param stream - raw SSE bytes; reads may split anywhere, including mid-UTF-8 sequence.
 * @param onComment - optional transport-activity callback; comments never enter the yielded payload stream.
 * @returns each event's data payload in arrival order.
 */
export async function* parseSse(
  stream: ReadableStream<BufferSource>,
  onComment?: (comment: string) => void,
): AsyncGenerator<string> {
  const events = stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(new EventSourceParserStream({ onComment }))
  for await (const { data } of events) {
    yield data
    if (data === DONE) return
  }
  /* jscpd:ignore-end */
}
