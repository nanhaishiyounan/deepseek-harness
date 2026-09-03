/**
 * The SQLite `KbStore` provider: single-file storage with an FTS5 trigram
 * full-text index, JSON-independent BLOB embeddings scanned in JS, and
 * transactional overwrite-shaped ingest.
 * @module @deepseek-ai/dsh-kb-sqlite/store
 */

import { resolve } from 'node:path'
import type { DatabaseSync } from 'node:sqlite'
import { KbError } from '@deepseek-ai/dsh-kb'
import type { KbChunkInput, KbDocumentInput, KbDocKind, KbIngestResult, KbScope, KbSearchFilter, KbSearchHit, KbStore, KbStoreStats, KbUsage, KbUsageDelta } from '@deepseek-ai/dsh-kb'
import { validateSchema } from './schema.ts'
import { sql } from './sql.ts'

type DatabaseSyncConstructor = typeof import('node:sqlite')['DatabaseSync']

/** One vector-scan candidate row: chunk id plus its stored BLOB embedding. */
interface CandidateRow {
  chunk_id: number
  embedding: Uint8Array
}

/** Constructor options for {@link SqliteKbStore}. */
export interface SqliteKbStoreOptions {
  /** Database path (`:memory:` supported) or cwd-relative path. */
  readonly path: string
  /** Maximum wait for another SQLite connection's lock. */
  readonly busyTimeoutMs: number
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  // An aborted AbortSignal always carries a reason per the WHATWG standard.
  /* v8 ignore next 2 */
  if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
}

function vectorToBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength)
}

function blobToVector(blob: Uint8Array): Float32Array {
  return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
}

/** Cosine similarity; `NaN` for mismatched dimensionality or a zero vector (no direction to rank). */
function cosine(query: Float32Array, candidate: Float32Array): number {
  if (query.length !== candidate.length) return Number.NaN
  let dot = 0
  let queryNorm = 0
  let candidateNorm = 0
  for (const [index, a] of query.entries()) {
    const b = candidate[index] as number
    dot += a * b
    queryNorm += a * a
    candidateNorm += b * b
  }
  const denominator = Math.sqrt(queryNorm) * Math.sqrt(candidateNorm)
  return denominator === 0 ? Number.NaN : dot / denominator
}

function rowToHit(row: Record<string, unknown>): KbSearchHit {
  const provider = row.provider
  const provenance = typeof provider === 'string'
    ? {
      provider,
      ...(row.scope === null || row.scope === undefined ? {} : { scope: row.scope as KbScope }),
      ...(typeof row.collected_source === 'string' ? { collectedSource: row.collected_source } : {}),
    }
    : undefined
  return {
    chunkId: Number(row.chunk_id),
    docId: Number(row.doc_id),
    tenantId: String(row.tenant_id),
    sourcePath: String(row.source_path),
    ...(typeof row.title === 'string' ? { title: row.title } : {}),
    docKind: row.doc_kind as KbDocKind,
    ...(typeof row.collected_at === 'string' ? { collectedAt: row.collected_at } : {}),
    ...(typeof row.heading_path === 'string' ? { headingPath: row.heading_path } : {}),
    chunkIdx: Number(row.chunk_idx),
    content: String(row.content),
    ...(provenance === undefined ? {} : { provenance }),
  }
}

/**
 * The `node:sqlite`-backed `KbStore`. Opens and validates the database in the
 * constructor (fail-loud on schema mismatch); one instance owns one
 * connection until {@link SqliteKbStore.close}.
 */
export class SqliteKbStore implements KbStore {
  readonly id = 'kb-sqlite'
  private readonly db: DatabaseSync
  private closed = false

  constructor(options: SqliteKbStoreOptions, Database: DatabaseSyncConstructor) {
    this.db = new Database(options.path === ':memory:' ? ':memory:' : resolve(options.path), {
      timeout: options.busyTimeoutMs,
    })
    try {
      validateSchema(this.db, options.path)
    } catch (error: unknown) {
      this.db.close()
      throw error
    }
  }

  available(): boolean {
    return !this.closed
  }

  /** Close the owned connection; idempotent. */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.db.close()
  }

  async putDocument(doc: KbDocumentInput, chunks: readonly KbChunkInput[], signal?: AbortSignal): Promise<KbIngestResult> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    throwIfAborted(signal)
    this.db.exec(sql('begin-immediate'))
    try {
      const existing = this.db.prepare(sql('select-doc-id-by-source'))
        .get(doc.tenantId, doc.sourcePath) as { id: number } | undefined
      if (existing !== undefined) this.deleteDocumentRows(existing.id)
      const inserted = this.db.prepare(sql('insert-document'))
        .run(
          doc.tenantId,
          doc.sourcePath,
          doc.title ?? null,
          doc.docKind,
          doc.collectedAt ?? null,
          doc.provenance?.provider ?? null,
          doc.provenance?.scope ?? null,
          doc.provenance?.collectedSource ?? null,
          doc.contentHash ?? null,
          doc.contentLength ?? null,
        ) as { lastInsertRowid: number | bigint }
      const docId = Number(inserted.lastInsertRowid)
      const insertChunk = this.db.prepare(sql('insert-chunk'))
      const insertFts = this.db.prepare(sql('insert-chunk-fts'))
      for (const chunk of chunks) {
        throwIfAborted(signal)
        insertChunk.run(
          docId,
          chunk.headingPath ?? null,
          chunk.chunkIdx,
          chunk.content,
          chunk.embedModel ?? null,
          chunk.embedding === null ? null : vectorToBlob(chunk.embedding),
        )
        insertFts.run(chunk.content, docId, chunk.chunkIdx)
      }
      this.db.exec(sql('commit'))
      const embedModel = chunks.find(chunk => chunk.embedModel !== undefined)?.embedModel
      return {
        docId,
        chunks: chunks.length,
        embedded: chunks.some(chunk => chunk.embedding !== null),
        ...(embedModel === undefined ? {} : { embedModel }),
      }
    } catch (error: unknown) {
      this.rollback()
      throw error
    }
  }

  async deleteDocument(tenantId: string, sourcePath: string, _signal?: AbortSignal): Promise<boolean> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    this.db.exec(sql('begin-immediate'))
    try {
      const existing = this.db.prepare(sql('select-doc-id-by-source'))
        .get(tenantId, sourcePath) as { id: number } | undefined
      if (existing === undefined) {
        this.rollback()
        return false
      }
      this.deleteDocumentRows(existing.id)
      this.db.exec(sql('commit'))
    } catch (error: unknown) {
      this.rollback()
      throw error
    }
    return true
  }

  /** Delete one document's FTS rows then the document row (cascading chunks); caller owns the transaction. */
  private deleteDocumentRows(docId: number): void {
    this.db.prepare(sql('delete-chunk-fts-by-doc')).run(docId)
    this.db.prepare(sql('delete-document-by-id')).run(docId)
  }

  async textSearch(
    query: string,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
    _signal?: AbortSignal,
  ): Promise<KbSearchHit[]> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const trimmed = query.trim()
    if (trimmed.length === 0) return []
    // One trigram needs three characters; anything shorter cannot match FTS5.
    // oxlint-disable-next-line typescript/no-misused-spread -- trigram counts Unicode code points, exactly what this spread yields.
    const expression = [...trimmed].length < 3 ? '' : ftsMatchExpression(trimmed)
    const short = expression === ''
    const pattern = short ? likePattern(trimmed) : expression
    const resource = short ? 'text-search-like' as const : 'text-search' as const
    const rows = this.db.prepare(sql(resource))
      .all(pattern, tenantId ?? null, tenantId ?? null, filter?.docKind ?? null, filter?.docKind ?? null, k)
    return (rows as Array<Record<string, unknown>>).map(rowToHit)
  }

  async vectorSearch(
    vector: Float32Array,
    tenantId: string | undefined,
    k: number,
    filter: KbSearchFilter | undefined,
    signal?: AbortSignal,
  ): Promise<KbSearchHit[]> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    throwIfAborted(signal)
    const candidates = this.db.prepare(sql('select-vector-candidates'))
      .all(tenantId ?? null, tenantId ?? null, filter?.docKind ?? null, filter?.docKind ?? null) as unknown as CandidateRow[]
    const scored: Array<{ chunkId: number; score: number }> = []
    for (const candidate of candidates) {
      throwIfAborted(signal)
      const stored = blobToVector(candidate.embedding)
      const score = cosine(vector, stored)
      if (Number.isFinite(score)) scored.push({ chunkId: candidate.chunk_id, score })
    }
    scored.sort((a, b) => b.score - a.score || a.chunkId - b.chunkId)
    const hits: KbSearchHit[] = []
    for (const { chunkId } of scored.slice(0, k)) {
      const row = this.db.prepare(sql('select-hit-by-chunk-id')).get(chunkId) as Record<string, unknown> | undefined
      /* v8 ignore next 2 -- the synchronous scan leaves no deletion window. */
      if (row !== undefined) hits.push(rowToHit(row))
    }
    return hits
  }

  async stats(tenantId: string | undefined, _signal?: AbortSignal): Promise<KbStoreStats> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const documents = (this.db.prepare(sql('stats-documents'))
      .get(tenantId ?? null, tenantId ?? null) as { documents: number }).documents
    const chunkRow = this.db.prepare(sql('stats-chunks'))
      .get(tenantId ?? null, tenantId ?? null) as { chunks: number; embedded_chunks: number }
    return {
      documents,
      chunks: chunkRow.chunks,
      embeddedChunks: chunkRow.embedded_chunks,
    }
  }

  async recordUsage(tenantId: string, delta: KbUsageDelta, _signal?: AbortSignal): Promise<void> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    this.db.exec(sql('begin-immediate'))
    try {
      this.db.prepare(sql('record-usage')).run(
        tenantId,
        delta.searches ?? 0,
        delta.ingestedDocuments ?? 0,
        delta.ingestedChunks ?? 0,
        delta.embedTexts ?? 0,
        delta.embedTokens ?? 0,
      )
      this.db.exec(sql('commit'))
    } catch (error: unknown) {
      this.rollback()
      throw error
    }
  }

  async usage(tenantId: string, _signal?: AbortSignal): Promise<KbUsage> {
    // node:sqlite is synchronous; the await keeps the store contract a promise.
    await Promise.resolve()
    this.assertLive()
    const row = this.db.prepare(sql('select-usage')).get(tenantId) as {
      searches: number
      ingested_documents: number
      ingested_chunks: number
      embed_texts: number
      embed_tokens: number
    } | undefined
    if (row === undefined) {
      return { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }
    }
    return {
      searches: row.searches,
      ingestedDocuments: row.ingested_documents,
      ingestedChunks: row.ingested_chunks,
      embedTexts: row.embed_texts,
      embedTokens: row.embed_tokens,
    }
  }

  /** Roll back the open transaction, retaining the original failure. */
  private rollback(): void {
    try {
      this.db.exec(sql('rollback'))
    } catch {
      // The original statement failure remains actionable.
    }
  }

  /** Reject use of a closed store. */
  private assertLive(): void {
    if (this.closed) {
      throw new KbError('the kb-sqlite store connection is closed', 'KB_SQLITE_CLOSED')
    }
  }
}

/** Split one raw query into word segments on non-word boundaries. */
function querySegments(query: string): string[] {
  return query.split(/[^\p{L}\p{N}]+/u).filter(segment => segment.length > 0)
}

/** Upper bound on OR phrases per MATCH expression, keeping long queries cheap. */
const MAX_MATCH_PHRASES = 12
/** Sliding-phrase length (in code points) for segments longer than one phrase. */
const PHRASE_WINDOW = 4
/** Sliding-phrase stride (in code points). */
const PHRASE_STRIDE = 2

/**
 * Build the FTS5 MATCH expression for one raw query: quoted phrase literals
 * joined by OR, so trigram substring matching applies and query syntax cannot
 * inject. A short segment stays one phrase; a long natural-language segment
 * becomes overlapping sliding-window phrases, because FTS5 phrases require
 * the whole string to appear contiguously — a full question never matches
 * prose even when every word of it does.
 * @param query - the trimmed query text.
 * @returns the OR expression, or `''` when no segment reaches one trigram
 *   (the caller falls back to LIKE).
 */
export function ftsMatchExpression(query: string): string {
  const phrases: string[] = []
  for (const segment of querySegments(query)) {
    // oxlint-disable-next-line typescript/no-misused-spread -- trigram counts Unicode code points, exactly what this spread yields.
    const characters = [...segment]
    if (characters.length < 3) continue
    if (characters.length <= 8) {
      phrases.push(segment)
      continue
    }
    for (let start = 0; characters.length - start >= PHRASE_WINDOW; start += PHRASE_STRIDE) {
      phrases.push(characters.slice(start, start + PHRASE_WINDOW).join(''))
    }
    // A tail-aligned window keeps the final characters searchable when the
    // stride skips past them.
    const tailStart = characters.length - PHRASE_WINDOW
    if (tailStart % PHRASE_STRIDE !== 0) phrases.push(characters.slice(tailStart).join(''))
  }
  const capped = phrases.slice(0, MAX_MATCH_PHRASES)
  return capped.map(phrase => `"${phrase.replaceAll('"', '""')}"`).join(' OR ')
}

/**
 * Build the LIKE pattern for one raw query with `%`/`_`/`\` escaped.
 * @param query - the trimmed query text.
 * @returns the escaped `%query%` pattern.
 */
export function likePattern(query: string): string {
  const escaped = query.replaceAll(/[\\%_]/gu, character => `\\${character}`)
  return `%${escaped}%`
}
