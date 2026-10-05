/**
 * data domain zod schemas: request/value validation for the unified upload
 * method and the composer-attachment pair. The base64 gate is the kb domain's
 * stack-safe canonical check, shared so every upload channel refuses the same
 * lenient-decode shapes.
 */

import { z } from 'zod'
import type { Wire } from './rpc.schema.ts'
import type { DataDescribeImageView, DataExtractTextView, DataUploadView, RequestPayload } from './index.ts'
import { isCanonicalBase64 } from './kb.schema.ts'

/** data.upload request payload: the browser file's base64 bytes, its name, and its declared mime type. */
export const dataUploadRequestSchema = z.object({
  filename: z.string().min(1),
  data: z.string().refine(isCanonicalBase64, { message: 'data must be canonical RFC-4648 base64' }),
  mime: z.string().optional(),
  doc_kind: z.string().optional(),
  title: z.string().optional(),
  collected_at: z.string().optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'data.upload'>>>

/** data.describeImage request payload: one base64 image plus its wire media type. */
export const dataDescribeImageRequestSchema = z.object({
  image: z.string().refine(isCanonicalBase64, { message: 'image must be canonical RFC-4648 base64' }),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).max(2000).optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'data.describeImage'>>>

/** data.describeImage response value. */
export const dataDescribeImageValueSchema = z.object({
  attachmentId: z.string().min(1),
  name: z.string().optional(),
  description: z.string().min(1),
}) as unknown as z.ZodType<Wire<DataDescribeImageView>>

/** data.extractText request payload: one base64 pdf/md/txt document. */
export const dataExtractTextRequestSchema = z.object({
  filename: z.string().min(1),
  data: z.string().refine(isCanonicalBase64, { message: 'data must be canonical RFC-4648 base64' }),
  mime: z.string().optional(),
}) as unknown as z.ZodType<Wire<RequestPayload<'data.extractText'>>>

/** data.extractText response value. */
export const dataExtractTextValueSchema = z.object({
  text: z.string(),
  truncated: z.boolean(),
}) as unknown as z.ZodType<Wire<DataExtractTextView>>

/** data.upload response value, discriminated by the routed destination. */
export const dataUploadValueSchema = z.discriminatedUnion('destination', [
  z.object({
    destination: z.literal('kb'),
    replaced: z.boolean(),
    document: z.object({
      doc_id: z.number(),
      chunks: z.number(),
      embedded: z.boolean(),
      embed_model: z.string().optional(),
    }),
  }),
  z.object({
    destination: z.literal('lakehouse'),
    replaced: z.boolean(),
    table: z.string(),
    rows: z.number(),
  }),
]) as unknown as z.ZodType<Wire<DataUploadView>>
