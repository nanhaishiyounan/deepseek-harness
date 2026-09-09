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
}
