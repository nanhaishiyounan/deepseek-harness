/**
 * Vocabulary for the kg-build pipeline plugin (`ctx.kgBuild`): source
 * configurations (NocoBase collections with explicit foreign-key links, the
 * lakehouse catalog, connector discovery, and the extraction corpus), the
 * deterministic mapping surfaces, closed-set extraction outputs, and the
 * per-run report.
 * @module @deepseek-ai/dsh-kg-build/types
 */

import type {
  KgEdge, KgNode, KgNodeTypeId, KgNodeType, KgRelation, KgRelationId,
} from '@deepseek-ai/dsh-kb-graph'

/** How a configured foreign-key link stores the target row address. */
export type FkLinkStyle = 'plain-id' | 'collection-address'

/**
 * One explicitly configured cross-collection foreign-key link — the extension
 * of mapping rule R06 for schemas that store the reference as a scalar column
 * (denormalized integer id, or a `<collection>/<pk>` address string) instead
 * of a declared relation field. Explicit configuration, never guessing.
 */
export interface FkLinkConfig {
  /** Owning collection field carrying the reference value. */
  field: string
  /** Target collection name (must also appear in the mapped collection set). */
  target: string
  /** Registered relation id the derived edge uses. */
  relation: string
  /** `plain-id` = the value is the target pk; `collection-address` = `<collection>/<pk>`. */
  style: FkLinkStyle
}

/** One NocoBase collection the pipeline maps (whitelist entry). */
export interface NocoBaseCollectionConfig {
  /** Collection name as `collections:listMeta` reports it. */
  name: string
  /** Builtin node-type id the derived type extends (owl:subClassOf anchor). */
  anchor?: string
  /** Field whose value becomes the node display name; default heuristics otherwise. */
  titleField?: string
  /** Explicit foreign-key links from this collection's scalar columns. */
  fkLinks?: FkLinkConfig[]
}

/** NocoBase source configuration. */
export interface NocoBaseSourceConfig {
  /**
   * Server origin; defaults through the same env chain as tool-nocobase.
   * Explicitly undefined-typed: schemastery materializes the nested object
   * even when the deployment omits it, so the runtime value is undefined.
   */
  baseUrl?: string | undefined
  /** Credential reference (env var name) the API token resolves through. */
  apiKeyEnv?: string
  /** Collections to map — the explicit whitelist; absent users/system tables never map. */
  collections?: NocoBaseCollectionConfig[]
}

/** Extraction corpus configuration (plain-text/Markdown documents on disk). */
export interface CorpusSourceConfig {
  /**
   * Directory holding the corpus files (md/txt). Explicitly undefined-typed:
   * schemastery materializes the nested object even when the deployment omits
   * it, so the runtime value is undefined.
   */
  root?: string | undefined
  /** Glob-free suffix filter list; defaults to md and txt. */
  extensions?: string[]
  /** Maximum documents per run; newest mtime first; default 50. */
  maxDocuments?: number
  /** Maximum chunks per document; default 4. */
  maxChunksPerDocument?: number
}

/** Closed-set LLM extraction configuration. */
export interface ExtractConfig {
  /** LLM provider name on the llm seam; default `minimax`. */
  provider?: string
  /** Model name; default `MiniMax-M3`. */
  model?: string
  /** Maximum characters per chunk handed to extraction; default 4000. */
  maxChunkChars?: number
}

/** Entity alignment configuration. */
export interface AlignConfig {
  /** Jaro-Winkler score at or above which same-type candidates auto-merge; default 0.9. */
  autoThreshold?: number
  /** Lower bound of the gray zone sent to LLM adjudication; default 0.8. */
  grayFloor?: number
}

/** Pipeline plugin configuration (the schemastery-validated shape). */
export interface KgBuildConfig {
  /** Tenant every graph write lands under — the deployment-side binding. */
  tenant: string
  /** NocoBase structured source; absent disables the source. */
  nocobase?: NocoBaseSourceConfig
  /** Lakehouse catalog source; default true when the seam is composed. */
  lakehouse?: boolean
  /** Connector discovery source; default true when the seam is composed. */
  connector?: boolean
  /** Extraction corpus source; absent disables extraction. */
  corpus?: CorpusSourceConfig
  /** Closed-set extraction settings. */
  extract?: ExtractConfig
  /** Entity alignment settings. */
  align?: AlignConfig
  /** Page size for NocoBase row fetches; default 100 (R13 batching). */
  pageSize?: number
  /** Repeat-run interval in ms; 0 (default) disables scheduling — manual runs only. */
  intervalMs?: number
}

/** One mapped NocoBase collection's derived registry entries. */
export interface NocoBaseMapping {
  readonly nodeType: KgNodeType
  /** Relations from declared belongsTo fields whose target is also mapped (R06). */
  readonly declaredRelations: readonly KgRelation[]
  /** Relation fields skipped because the target collection is not mapped (R06/R07 record). */
  readonly skippedRelationFields: readonly string[]
}

/** The deterministic mapping of one NocoBase row: its node plus derived edges. */
export interface RowMapping {
  readonly node: KgNode
  readonly edges: readonly KgEdge[]
}

/** One extracted entity before alignment, with its registry-resolved type. */
export interface ExtractedEntity {
  /** Entity name as the model stated it. */
  readonly name: string
  /** Registry type the pipeline will write (UNCLASSIFIED bucket becomes `Concept`). */
  readonly resolvedType: KgNodeTypeId
  /** The type the model claimed — differs from resolvedType on degradation. */
  readonly claimedType: string
  /** Optional properties the model attached. */
  readonly props?: Readonly<Record<string, unknown>>
  /** Evidence span from the source text. */
  readonly evidence?: string
  /** True when the claimed type failed the closed set and degraded to the bucket. */
  readonly degraded: boolean
}

/** One extracted relation that passed every closed-set check. */
export interface ExtractedRelation {
  readonly subjectName: string
  readonly objectName: string
  readonly relation: KgRelationId
  readonly confidence: number
  readonly evidence?: string
}

/** One dropped relation with the reason it never reached the graph. */
export interface DroppedRelation {
  readonly predicate: string
  readonly subjectName: string
  readonly objectName: string
  readonly reason: string
}

/** Closed-set extraction outcome for one chunk. */
export interface ExtractionOutcome {
  readonly entities: readonly ExtractedEntity[]
  readonly relations: readonly ExtractedRelation[]
  readonly dropped: readonly DroppedRelation[]
  /** True when the first parse or shape check failed and one feedback retry ran. */
  readonly retried: boolean
}

/** One NocoBase collection run slice in the report. */
export interface CollectionRunReport {
  readonly scope: string
  readonly rows: number
  readonly nodesUpserted: number
  readonly edgesUpserted: number
  readonly newRows: number
  readonly tombstoned: number
  readonly skipped: boolean
  readonly watermark: string
  readonly contentHash: string
}

/** The lakehouse / connector / corpus slices in the report. */
export interface SimpleSourceReport {
  readonly scope: string
  readonly items: number
  readonly nodesUpserted: number
  readonly edgesUpserted: number
  readonly skipped: boolean
  readonly contentHash: string
}

/** Corpus extraction totals across every document. */
export interface CorpusReport {
  readonly documents: number
  readonly chunks: number
  readonly extractionCalls: number
  readonly extractedEntities: number
  readonly extractedRelations: number
  readonly degradedEntities: number
  readonly droppedRelations: number
  readonly mergedEntities: number
  readonly tombstonedEdges: number
}

/** The aggregated per-run report `ctx.kgBuild.run()` resolves with. */
export interface KgBuildRunReport {
  readonly collections: readonly CollectionRunReport[]
  readonly lakehouse?: SimpleSourceReport
  readonly connector?: SimpleSourceReport
  readonly corpus?: CorpusReport
  /** Registry entries persisted this run (derived types and relations). */
  readonly persistedTypes: number
  readonly persistedRelations: number
  readonly startedAt: string
  readonly finishedAt: string
}
