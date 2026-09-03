/**
 * kb domain zod schemas: request/value validation for the five unary methods.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { KbHitView, KbIngestView, KbSearchView, KbStatsView, RequestPayload } from './index.ts'

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
 * kb.upload request payload: the browser file's base64 bytes. The regex pins
 * canonical RFC-4648 base64 (Node's decoder is lenient and would otherwise
 * silently drop invalid characters); the byte-size cap is a business refusal,
 * not schema, so the client gets the structured too-large error.
 */
export const kbUploadRequestSchema = z.object({
  filename: z.string().min(1),
  data: z.string().regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  ...ingestFields,
}) as unknown as z.ZodType<Wire<RequestPayload<'kb.upload'>>>

/** Shared ingest response value (kb.ingest, kb.ingestUrl, and kb.upload). */
export const kbIngestValueSchema = z.object({
  doc_id: z.number(),
  chunks: z.number(),
  embedded: z.boolean(),
  embed_model: z.string().optional(),
}) as unknown as z.ZodType<Wire<KbIngestView>>
