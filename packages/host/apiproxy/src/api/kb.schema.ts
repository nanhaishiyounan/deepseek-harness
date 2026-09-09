/**
 * kb domain zod schemas: request/value validation for the five unary methods.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { KbHitView, KbIngestView, KbSearchView, KbStatsView, KbUploadView, RequestPayload } from './index.ts'

/** One retrieved passage (the citation row the panel renders). */
const kbHitSchema = z.object({
  chunk_id: z.number(),
  doc_id: z.number(),
  source_path: z.string(),
  title: z.string().optional(),
  doc_kind: z.string(),
  collected_at: z.string().optional(),
  heading_path: z.string().optional(),
  chunk_idx: z.number(),
  content: z.string(),
  score: z.number().optional(),
}) as unknown as z.ZodType<Wire<KbHitView>>

/** kb.stats request payload (empty by design: the deployment owns the tenant). */
export const kbStatsRequestSchema = z.object({}) as unknown as z.ZodType<Wire<RequestPayload<'kb.stats'>>>

/** kb.stats response value. */
export const kbStatsValueSchema = z.object({
  documents: z.number(),
  chunks: z.number(),
  embedded_chunks: z.number(),
  embed_available: z.boolean(),
  embed_model: z.string().optional(),
  usage: z.object({
    searches: z.number(),
    ingested_documents: z.number(),
    ingested_chunks: z.number(),
    embed_texts: z.number(),
    embed_tokens: z.number(),
  }),
}) as unknown as z.ZodType<Wire<KbStatsView>>

/** kb.search request payload. */
export const kbSearchRequestSchema = z.object({
  query: z.string().min(1),
  doc_kind: z.string().optional(),
  max_results: z.number().int().min(1).max(8).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'kb.search'>>>

/** kb.search response value. */
export const kbSearchValueSchema = z.object({
  mode: z.enum(['hybrid', 'text']),
  embed_model: z.string().optional(),
  results: z.array(kbHitSchema),
}) as unknown as z.ZodType<Wire<KbSearchView>>

/** Shared file-ingest payload fields. */
const ingestFields = {
  doc_kind: z.string().optional(),
  title: z.string().optional(),
  collected_at: z.string().optional(),
} as const

/** kb.ingest request payload. */
export const kbIngestRequestSchema = z.object({
  path: z.string().min(1),
  ...ingestFields,
}) as unknown as z.ZodType<Wire<RequestPayload<'kb.ingest'>>>

/** kb.ingestUrl request payload. */
export const kbIngestUrlRequestSchema = z.object({
  url: z.string().min(1),
  ...ingestFields,
}) as unknown as z.ZodType<Wire<RequestPayload<'kb.ingestUrl'>>>

/**
 * Chunk width for the base64 alphabet scan. Bounded slices keep the regex
 * engine's stack flat; quartet alignment keeps padding out of every scanned
 * slice.
 */
const BASE64_CHUNK = 4_096

/**
 * Stack-safe canonical RFC-4648 base64 check. A whole-string regex over the
 * upload body exhausted V8's backtracking stack from ~3.5 MB (the channel's
 * cap is 64 MiB), so validation splits into a length-modulo-4 gate, an
 * alphabet scan in 4 KiB slices over everything before the final quartet, and
 * a final-quartet check that alone may carry '=' padding. Node's decoder is
 * lenient and would silently drop invalid characters; this keeps every
 * non-canonical shape refusing before decoding.
 * @param value - the raw `data` string from the upload request.
 * @returns true when the string is canonical base64 (the empty body included).
 */
export function isCanonicalBase64(value: string): boolean {
  if (value.length === 0) return true
  if (value.length % 4 !== 0) return false
  for (let offset = 0; offset < value.length - 4; offset += BASE64_CHUNK) {
    const end = Math.min(offset + BASE64_CHUNK, value.length - 4)
    if (!/^[A-Za-z0-9+/]+$/u.test(value.slice(offset, end))) return false
  }
  return /^(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)$/u.test(value.slice(-4))
}

/**
 * kb.upload request payload: the browser file's base64 bytes, validated as
 * canonical RFC-4648 (Node's decoder is lenient and would otherwise silently
 * drop invalid characters); the byte-size cap is a business refusal, not
 * schema, so the client gets the structured too-large error.
 */
export const kbUploadRequestSchema = z.object({
  filename: z.string().min(1),
  data: z.string().refine(isCanonicalBase64, { message: 'data must be canonical RFC-4648 base64' }),
  ...ingestFields,
}) as unknown as z.ZodType<Wire<RequestPayload<'kb.upload'>>>

/** Stored-document summary fields shared by every ingest response. */
const ingestValueFields = {
  doc_id: z.number(),
  chunks: z.number(),
  embedded: z.boolean(),
  embed_model: z.string().optional(),
} as const

/** Shared ingest response value (kb.ingest and kb.ingestUrl). */
export const kbIngestValueSchema = z.object(ingestValueFields) as unknown as z.ZodType<Wire<KbIngestView>>

/** kb.upload response value: the ingest summary plus the replacement fact. */
export const kbUploadValueSchema = z.object({
  ...ingestValueFields,
  replaced: z.boolean(),
}) as unknown as z.ZodType<Wire<KbUploadView>>
