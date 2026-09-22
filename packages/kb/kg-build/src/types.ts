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
  /**
   * The declarative mapping file (kg-mappings.yml) — the collection
   * whitelist's only home. The inline `collections` key is retired: an old
   * configuration fails config validation loudly instead of silently
   * mapping nothing.
   */
  mappingsFile?: string
}

/** Extraction corpus configuration (plain-text/Markdown documents on disk). */
export interface CorpusSourceConfig {
  /**
   * Directory holding the corpus files (md/txt). Explicitly undefined-typed:
   * schemastery materializes the nested object even when the deployment omits
   * it, so the runtime value is undefined.
   */
  root?: string | undefined
  /**
   * The declarative corpus manifest (kb-corpus.yml) — the corpus directory
   * list's only home. When set, the scan covers exactly the manifest
   * directories instead of recursing the whole root, so non-corpus drop-ins
   * under the root never enter extraction. Explicitly undefined-typed for the
   * same schemastery-materialization reason as {@link root}.
   */
  manifestFile?: string | undefined
  /** Glob-free suffix filter list; defaults to md and txt. */
  extensions?: string[]
  /**
   * Protective document ceiling per run: a scan finding more documents than
   * this fails the run loudly instead of silently truncating; default 50.
   */
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
  /** Prompt protocol: `instruct-kgc` (JSON schema dict, split batches) or `legacy`;
   * default `legacy` until the zh-corpus A/B gate passes (the plan's adoption rule). */
  protocol?: 'legacy' | 'instruct-kgc'
  /** Gate extraction through the SHACL validation loop; default true. */
  shaclGate?: boolean
}

/** Entity alignment configuration. */
export interface AlignConfig {
  /** Jaro-Winkler score at or above which same-type candidates auto-merge; default 0.9. */
  autoThreshold?: number
  /** Lower bound of the gray zone sent to LLM adjudication; default 0.8. */
  grayFloor?: number
}

/** Cross-source coreference alignment configuration. */
export interface CrossSourceAlignConfig {
  /** Whether the pass runs at all; default true (edges only, never merges). */
  enabled?: boolean
  /** Restrict matching to normalized-name equality, dropping containment matches; default false. */
  exactOnly?: boolean
  /** Run the v2 pass: gray-zone containment pairs go to the pairwise LLM judge; default true. */
  v2?: boolean
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
  /** Cross-source coreference alignment settings; absent keeps the pass on. */
  crossSourceAlign?: CrossSourceAlignConfig
  /** Import the curated FoodOn subtree snapshot into the registry (idempotent); default true. */
  foodon?: boolean
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

/** One declared fk link in the mappings file (reference → edge wiring). */
export interface KgMappingFkLink {
  readonly field: string
  readonly target: string
  readonly relation: string
  readonly style?: 'plain-id' | 'collection-address'
}

/** One collection entry in the mappings file. */
export interface KgMappingCollection {
  readonly name: string
  readonly anchor?: string
  readonly titleField?: string
  readonly fkLinks?: readonly KgMappingFkLink[]
}

/** The declarative mappings file (kg-mappings.yml) as code reads it. */
export interface KgMappingsFile {
  readonly version: number
  readonly sources: readonly { system: 'nocobase'; collections: readonly KgMappingCollection[] }[]
  readonly rules: { skipHiddenCollections: boolean; emptyFkNoEdge: boolean; derivesTitle: boolean }
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
  /** Relation-shaped fields the mapping could not wire (R06 target unmapped, self-links, …). */
  readonly skippedRelationFields: readonly string[]
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
  /** Retired scopes (manifest-external leftovers) whose edges and watermarks this run swept. */
  readonly tombstonedScopes: number
  /** Entities quarantined by the SHACL gate (never landed). */
  readonly quarantinedEntities: number
  /** Relations quarantined by the SHACL gate (never landed). */
  readonly quarantinedRelations: number
  /** Feedback rounds the SHACL gate ran across chunks (0 = all first-pass conforms). */
  readonly shaclRounds: number
}

/** Cross-source coreference alignment totals for one run. */
export interface CrossSourceAlignReport {
  /** Corpus-extracted entities eligible for coreference this run. */
  readonly docCandidates: number
  /** NocoBase row nodes considered this run. */
  readonly nocobaseNodes: number
  /** corefers_with edges (re)asserted this run. */
  readonly edgesCreated: number
  /** Stale coreference edges tombstoned before the rebuild. */
  readonly tombstonedEdges: number
  /** Gray-zone pairs the LLM judge ruled on (v2). */
  readonly judgedPairs: number
  /** Pairs the judge rejected — reject tombstones persisted (v2). */
  readonly rejectedPairs: number
  /** Same-verdict pairs under the auto floor, queued for review (v2). */
  readonly reviewQueue: number
  /** Materialized equivalence classes over the accepted edges (v2). */
  readonly clusters: number
}

/** The quality metrics document one run computes and persists. */
export interface KgBuildRunMetrics {
  readonly nodes: number
  readonly edges: number
  readonly islands: number
  readonly conflicts: number
  readonly nodeCoverage: { readonly numerator: number; readonly denominator: number; readonly ratio: number }
  readonly degraded: number
  readonly droppedRelations: number
  readonly mergedEntities: number
  readonly tombstonedEdges: number
  readonly computedAt: string
}

/** The persisted build-run ledger row (the latest-run readout). */
export interface KgBuildRunRecord {
  readonly id: number
  readonly tenant: string
  readonly startedAt: string
  readonly finishedAt: string
  readonly report: KgBuildRunReport
  readonly metrics: KgBuildRunMetrics
}

/** The aggregated per-run report `ctx.kgBuild.run()` resolves with. */
export interface KgBuildRunReport {
  readonly collections: readonly CollectionRunReport[]
  readonly lakehouse?: SimpleSourceReport
  readonly connector?: SimpleSourceReport
  readonly corpus?: CorpusReport
  readonly crossSourceAlign?: CrossSourceAlignReport
  /** Registry entries persisted this run (derived types and relations). */
  readonly persistedTypes: number
  readonly persistedRelations: number
  /** Rule hit counts keyed by the mappers.ts header numbering (R01…R13). */
  readonly ruleHits: Readonly<Record<string, number>>
  /** The ontology revision id appended this run, when the registry changed. */
  readonly ontologyRevision?: number
  /** The kg_build_runs ledger row id this run persisted. */
  readonly buildRunId?: number
  /** The quality metrics computed at run end (same document as the ledger row). */
  readonly metrics?: KgBuildRunMetrics
  readonly startedAt: string
  readonly finishedAt: string
  /** FoodOn-imported registry classes persisted this run (0 when disabled or already converged). */
  readonly foodonTypes?: number
}

/** One scope an incremental run observed changing (the five-source diff evidence). */
export interface KgIncrementalScopeChange {
  readonly sourceSystem: string
  readonly scope: string
  readonly previousRunAt?: string
  readonly lastRunAt: string
  /** Whether the scope's fingerprint advanced (false = watermark-only touch). */
  readonly updated: boolean
}

/** The `runIncremental()` verdict: the run report plus the changed-scope diff. */
export interface KgIncrementalReport {
  readonly report: KgBuildRunReport
  readonly changedScopes: readonly KgIncrementalScopeChange[]
}
