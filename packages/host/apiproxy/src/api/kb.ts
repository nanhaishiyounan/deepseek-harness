/**
 * kb domain contract: the knowledge-base workbench surface (stats, cited
 * retrieval, file/URL/upload ingest) over the host's optional `ctx.kb` capability.
 *
 * The kb seam is deliberately NOT in the gateway's inject list: a deployment
 * that composes no knowledge base keeps a working gateway, and every kb
 * method fails with the structured `kb-not-composed` error instead. The
 * tenant binding is the deployment's own (the `tool-kb` row's `tenant`
 * config); the wire surface never carries a tenant.
 */

import type { RpcRequest, RpcResponse } from './rpc.ts'

/** One retrieved passage with the citation metadata the panel renders. */
export interface KbHitView {
  readonly chunk_id: number
  readonly doc_id: number
  readonly source_path: string
  readonly title?: string
  readonly doc_kind: string
  readonly collected_at?: string
  readonly heading_path?: string
  readonly chunk_idx: number
  readonly content: string
}

/** `kb.stats` response: store counts, embed-route facts, and usage counters. */
export interface KbStatsView {
  readonly documents: number
  readonly chunks: number
  readonly embedded_chunks: number
  readonly embed_available: boolean
  readonly embed_model?: string
  readonly usage: {
    readonly searches: number
    readonly ingested_documents: number
    readonly ingested_chunks: number
    readonly embed_texts: number
    readonly embed_tokens: number
  }
}

/** `kb.search` response: the retrieval mode plus the ranked passages. */
export interface KbSearchView {
  readonly mode: 'hybrid' | 'text'
  readonly embed_model?: string
  readonly results: readonly KbHitView[]
}

/** `kb.ingest` / `kb.ingestUrl` / `kb.upload` response: the stored document summary. */
export interface KbIngestView {
  readonly doc_id: number
  readonly chunks: number
  readonly embedded: boolean
  readonly embed_model?: string
}

/** Knowledge-base workbench methods; every call fails loud when no kb capability is composed. */
export interface KbApi {
  /** Store counts, embed availability, and the tenant's cumulative usage counters. */
  stats(request: RpcRequest<Record<string, never>>): Promise<RpcResponse<KbStatsView>>

  /** Hybrid (or degraded text) retrieval with citation metadata. */
  search(
    request: RpcRequest<{ query: string; doc_kind?: string; max_results?: number }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<KbSearchView>>

  /** Read one workspace file and ingest it (md/txt/pdf/docx; the kb tool suite's channel). */
  ingest(
    request: RpcRequest<{ path: string; doc_kind?: string; title?: string; collected_at?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<KbIngestView>>

  /**
   * Store one browser-uploaded file (base64 bytes + file name) under the
   * workspace uploads directory and ingest it. Single file per call — the
   * client loops for batches, matching the per-image admission `session.prompt`
   * established for browser→host byte transfer.
   */
  upload(
    request: RpcRequest<{ filename: string; data: string; doc_kind?: string; title?: string; collected_at?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<KbIngestView>>

  /** Fetch one public http(s) page and ingest it (same SSRF gate as the kb_ingest_url tool). */
  ingestUrl(
    request: RpcRequest<{ url: string; doc_kind?: string; title?: string; collected_at?: string }>,
    signal?: AbortSignal,
  ): Promise<RpcResponse<KbIngestView>>
}
