/**
 * data domain contract: the unified upload surface. One entry classifies the
 * uploaded file (extension + declared mime + magic number, via the lakehouse
 * seam's shared data router) and lands it in the right destination —
 * structured csv/xlsx/json bodies load as lakehouse tables, document kinds
 * ingest through the existing kb pipeline.
 *
 * Like the kb domain, the lakehouse seam is deliberately NOT in the gateway's
 * inject list: a deployment that composes no lakehouse keeps a working
 * gateway, and a routed-to-lakehouse upload fails with the structured
 * `data-lakehouse-unavailable` error instead. The tenant binding is the
 * deployment's own (the shared `kbTenant` config); the wire surface never
 * carries a tenant.
 *
 * The composer-attachment pair rides the same domain: `describeImage` admits
 * one image through the shared attachment admission (durable store, same
 * limits as `session.prompt` image parts) and returns a VLM description the
 * mobile composer splices into its draft; `extractText` returns one
 * pdf/md/txt document's text layer for the same draft-quote purpose (the
 * kb ingest channels stay untouched).
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'
import type { KbIngestView } from './kb.ts'

/** `data.upload` response when the file routed to the knowledge base. */
export interface DataKbUploadView {
  readonly destination: 'kb'
  /** True when a prior upload had already landed under the same sanitized name. */
  readonly replaced: boolean
  /** The stored document summary (same shape as `kb.upload`'s). */
  readonly document: KbIngestView
}

/** `data.upload` response when the file routed to the lakehouse. */
export interface DataLakehouseUploadView {
  readonly destination: 'lakehouse'
  /** True when the same table identity held a prior registration (replaced by this load). */
  readonly replaced: boolean
  /** The derived lakehouse table name. */
  readonly table: string
  /** Row count loaded. */
  readonly rows: number
}

/** `data.upload` response: the route receipt, discriminated by destination. */
export type DataUploadView = DataKbUploadView | DataLakehouseUploadView

/** `data.describeImage` response: the durable admission plus the VLM description. */
export interface DataDescribeImageView {
  /** The content-addressed attachment id (readable back via `session.attachment`). */
  readonly attachmentId: string
  /** The upload's declared name, echoed when one was provided. */
  readonly name: string | undefined
  /** The vision model's description of the image (zh-CN prompt by default). */
  readonly description: string
}

/** `data.extractText` response: the document's text layer under the wire bound. */
export interface DataExtractTextView {
  /** The extracted text (pdf) or raw utf-8 body (md/txt), truncated to the wire bound. */
  readonly text: string
  /** True when the source text exceeded the wire bound and the tail was cut. */
  readonly truncated: boolean
}

/** The unified data-upload surface; every call fails loud when routing or the destination refuses. */
export interface DataApi {
  /**
   * Store one browser-uploaded file (base64 bytes + file name + declared
   * mime), classify it, and land it in the routed destination: structured
   * formats load as a lakehouse table named after the file, document kinds
   * ingest into the knowledge base. Single file per call — the client loops
   * for batches, matching the per-image admission `session.prompt` established
   * for browser→host byte transfer.
   */
  upload(
    request: RpcRequest<{ filename: string; data: string; mime?: string; doc_kind?: string; title?: string; collected_at?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<DataUploadView>>
  /**
   * Admit one base64 image into the durable attachment store (same batch
   * admission policy as `session.prompt` image parts) and describe it through
   * the deployment's configured vision endpoint. The description is the only
   * model-facing projection this returns — the mobile composer quotes it into
   * the draft text, so `session.prompt`'s content stays plain text.
   */
  describeImage(
    request: RpcRequest<{ image: string; mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; name?: string; prompt?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<DataDescribeImageView>>
  /**
   * Extract one pdf/md/txt document's text layer for a draft quote. Unlike
   * `data.upload` nothing is stored: the caller (the mobile composer) splices
   * the returned text into its message draft, where the user can edit or
   * remove it before sending.
   */
  extractText(
    request: RpcRequest<{ filename: string; data: string; mime?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<DataExtractTextView>>
}
