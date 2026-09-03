/**
 * The wire-contract mirrors the workbench renders: the `kb.stats`, `kb.search`,
 * and ingest values as the gateway returns them.
 * @module @deepseek-ai/dsh-client-ui-kb/client/KbTypes
 */

/** The `kb.stats` value (mirrored from the wire contract). */
export interface KbStatsState {
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

/** One numbered retrieval hit as rendered by the workbench. */
export interface KbHitState {
  readonly source_path: string
  readonly heading_path?: string
  readonly doc_kind: string
  readonly content: string
}

/** The `kb.search` value (mirrored from the wire contract). */
export interface KbSearchState {
  readonly mode: 'hybrid' | 'text'
  readonly results: readonly KbHitState[]
}

/** The `kb.ingest` / `kb.ingestUrl` value (mirrored from the wire contract). */
export interface KbIngestState {
  readonly doc_id: number
  readonly chunks: number
  readonly embedded: boolean
}
