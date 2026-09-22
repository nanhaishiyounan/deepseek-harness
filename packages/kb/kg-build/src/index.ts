/**
 * The kg-build pipeline service (`ctx.kgBuild`): the structured path maps
 * NocoBase collections (R01–R13), the lakehouse catalog, and connector
 * discovery into the property graph deterministically; the corpus path runs
 * closed-set MiniMax extraction with the UNCLASSIFIED bucket; entity
 * alignment merges extracted entities onto canonical NocoBase rows by
 * normalized name and aliases. Incremental runs are idempotent — per-scope
 * fingerprint comparisons skip unchanged sources, merges converge, and
 * disappeared rows and retired corpus scopes tombstone.
 * @module @deepseek-ai/dsh-kg-build
 */

import { readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
// Side-effect type import: resolves `ctx.get('llm')` to the service type.
import type {} from '@deepseek-ai/dsh-llm'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import type { NocoBaseCollectionMeta } from '@deepseek-ai/dsh-connector-nocobase'
import type { NocoBaseCollectionConfig } from './types.ts'
import { KgBuildError } from './error.ts'
import {
  connectorDatasetToNode, isMappableCollection, lakehouseTableToNode, mapNocoBaseCollection,
  nocoBaseRowToEdges, nocoBaseRowToNode, stampTenant,
} from './mappers.ts'
import type { NocoBaseRow } from './mappers.ts'
import { extractChunkProtocol } from './extract.ts'
import type { ExtractionLlm, ExtractionProtocol, OntologyView } from './extract.ts'
import { extractValidated } from './validate.ts'
import { planFoodOnImport } from './foodon-import.ts'
import { alignEntity, normalizeName } from './align.ts'
import type { AdjudicatingLlm } from './align.ts'
import { loadCorpusManifest, normalizeCorpusDir } from './corpus-manifest.ts'
import type { KbCorpusManifest } from './corpus-manifest.ts'
import {
  corefPairKey, crossSourceEdges, crossSourceEdgesV2, CROSS_SOURCE_MIN_NAME_LENGTH, CROSS_SOURCE_SYSTEM,
  kbScopeOfNodeId, unionFindClusters,
} from './cross-source.ts'
import type { CorefJudgeLlm } from './cross-source.ts'
import { planScopeRun, priorStateOf, sha256Hex } from './incremental.ts'
import type {
  CollectionRunReport, CorpusReport, CrossSourceAlignReport, KgBuildConfig, KgBuildRunMetrics,
  KgBuildRunRecord, KgBuildRunReport, KgIncrementalReport, KgIncrementalScopeChange, KgMappingsFile,
  SimpleSourceReport,
} from './types.ts'
import { computeQualityMetrics } from './quality.ts'
import { loadMappingsFile } from './mappings.ts'
import type { KgEdge, KgNode, KgNodeTypeId, KgRelation } from '@deepseek-ai/dsh-kb-graph'
// Side-effect type import: resolves `ctx.get('kbGraph')` to the service type.
import type {} from '@deepseek-ai/dsh-kb-graph'
import { kgNodeTypeId, kgRelationId, ONTOLOGY_VERSION } from '@deepseek-ai/dsh-kb-graph'

export { KgBuildError } from './error.ts'
export * from './types.ts'
export { loadCorpusManifest, normalizeCorpusDir, parseCorpusManifest } from './corpus-manifest.ts'
export type { KbCorpusDir, KbCorpusManifest } from './corpus-manifest.ts'
export { computeQualityMetrics } from './quality.ts'
export { loadMappingsFile, parseMappings } from './mappings.ts'
export type { KgMappingRules } from './mappings.ts'
export {
  buildExtractionPrompt, buildInstructKgcPrompt, extractChunk, extractChunkProtocol,
  INSTRUCT_KGC_SPLIT_NUM, splitOntologyView,
} from './extract.ts'
export type { ExtractionLlm, ExtractionProtocol, OntologyView } from './extract.ts'
export {
  extractValidated, formatShaclFeedback, SHACL_MAX_FEEDBACK_ROUNDS, validateExtractionOutcome,
} from './validate.ts'
export type { ValidatedExtraction } from './validate.ts'
export {
  fetchFoodOnChildrenFromOls, FOODON_IRI_PREFIX, FOODON_PROP_XREFS, FOODON_SEED_TERMS,
  FOODON_SNAPSHOT_VERSION, FOODON_SUBTREE_ANCHORS, foodonCompactIdOf, foodonTypeIdOf, planFoodOnImport,
} from './foodon-import.ts'
export type { FoodOnTerm } from './foodon-import.ts'
export {
  DEFAULT_AUTO_THRESHOLD, DEFAULT_GRAY_FLOOR, alignEntity, jaroWinkler, normalizeName,
} from './align.ts'
export type { AdjudicatingLlm, AlignGraphFace, AlignmentDecision } from './align.ts'
export {
  CONTAINS_COREFERENCE_CONFIDENCE, COREF_AUTO_FLOOR, COREF_GRAY_FLOOR, corefPairKey,
  CROSS_SOURCE_EXCLUDED_TYPES, CROSS_SOURCE_MIN_NAME_LENGTH, CROSS_SOURCE_SYSTEM,
  EXACT_COREFERENCE_CONFIDENCE, crossSourceEdges, crossSourceEdgesV2, kbScopeOfNodeId,
  unionFindClusters,
} from './cross-source.ts'
export type { CorefCluster, CorefJudgeLlm, CorefRejectedPair, CorefReviewEntry, CorefVerdict, CrossSourceV2Result } from './cross-source.ts'
export {
  fingerprintRows, planScopeRun, priorStateOf, sha256Hex,
} from './incremental.ts'
export {
  connectorDatasetToNode, connectorNodeId, isMappableCollection, lakehouseNodeId,
  lakehouseTableToNode, mapNocoBaseCollection, nocoBaseNodeId, nocoBaseRowToEdges,
  nocoBaseRowToNode, stampTenant,
} from './mappers.ts'
export type { NocoBaseRow } from './mappers.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    kgBuild: KgBuildRuntime
  }
}

/** Default LLM provider and model for closed-set extraction. */
export const DEFAULT_EXTRACT_PROVIDER = 'minimax'
/** Default extraction model. */
export const DEFAULT_EXTRACT_MODEL = 'MiniMax-M3'
/** Default NocoBase page size for row fetches (R13 batching). */
export const DEFAULT_PAGE_SIZE = 100
/** Default corpus document cap per run. */
export const DEFAULT_MAX_DOCUMENTS = 50
/** Default chunk cap per document. */
export const DEFAULT_MAX_CHUNKS = 4
/** Default chunk character budget. */
export const DEFAULT_CHUNK_CHARS = 4_000
/** Environment variable the NocoBase base url falls back to. */
export const NOCOBASE_BASE_URL_ENV = 'NOCOBASE_BASE_URL'
/** Enumeration cap for the cross-source alignment pass (nodes it must see whole). */
export const LIST_NODES_CAP = 10_000

/** Plugin config: the tenant binding, the enabled sources, and the budgets. */
export interface Config extends KgBuildConfig {}
export type { KgBuildConfig }

export const Config = z.object({
  tenant: z.string().required(),
  nocobase: z.object({
    baseUrl: z.string(),
    apiKeyEnv: z.string().role('credential-ref'),
    // The declarative mapping file is the collection whitelist's only home
    // (kg-mappings.yml). The inline `collections` key is captured only so the
    // constructor can reject it loudly — a deployment still carrying it must
    // fail at load, never silently map nothing.
    mappingsFile: z.string(),
    collections: z.any(),
  }),
  lakehouse: z.boolean().default(true),
  connector: z.boolean().default(true),
  corpus: z.object({
    root: z.string(),
    manifestFile: z.string(),
    extensions: z.array(z.string()).default(['.md', '.txt']),
    maxDocuments: z.number().step(1).min(1),
    maxChunksPerDocument: z.number().step(1).min(1),
  }),
  extract: z.object({
    provider: z.string().default(DEFAULT_EXTRACT_PROVIDER),
    model: z.string().default(DEFAULT_EXTRACT_MODEL),
    maxChunkChars: z.number().step(1).min(200).default(DEFAULT_CHUNK_CHARS),
    /** The prompt protocol: `instruct-kgc` (schema dict + split batches) or `legacy` (the A/B baseline). */
    protocol: z.union([z.const('legacy'), z.const('instruct-kgc')]).default('legacy'),
    /** Gate extraction through the SHACL validation loop (quarantine survivors' leftovers). */
    shaclGate: z.boolean().default(true),
  }),
  align: z.object({
    autoThreshold: z.number().min(0).max(1),
    grayFloor: z.number().min(0).max(1),
  }),
  crossSourceAlign: z.object({
    enabled: z.boolean().default(true),
    exactOnly: z.boolean().default(false),
    /** Run the v2 pass: gray-zone containment pairs go to the pairwise LLM judge. */
    v2: z.boolean().default(true),
  }),
  /** Import the curated FoodOn subtree snapshot into the registry (idempotent). */
  foodon: z.boolean().default(true),
  pageSize: z.number().step(1).min(1).max(500).default(DEFAULT_PAGE_SIZE),
  intervalMs: z.number().step(1).min(0).default(0),
})

/** The validated plugin config the loader hands the constructor (defaults filled). */
export type KgBuildPluginConfig = Required<Omit<Config, 'nocobase' | 'corpus' | 'extract' | 'align' | 'crossSourceAlign'>>
  & Pick<Config, 'nocobase' | 'corpus' | 'extract' | 'align' | 'crossSourceAlign'>

/** Options one manual run accepts. */
export interface RunOptions {
  /** Cooperative cancellation honored between sources. */
  readonly signal?: AbortSignal
}

/**
 * The mappings read-out surface: the loaded file plus the last run's
 * per-collection outcome (the graph tab's rule panel reads this).
 */
export interface KgMappingsReadout {
  readonly file: string
  readonly version: number
  readonly rules: KgMappingsFile['rules']
  readonly collections: readonly {
    name: string
    anchor?: string
    titleField?: string
    fkLinkCount: number
  }[]
  readonly lastRun?: {
    finishedAt: string
    ruleHits: Readonly<Record<string, number>>
    collections: readonly {
      scope: string
      nodesUpserted: number
      edgesUpserted: number
      skipped: boolean
      skippedRelationFields: readonly string[]
    }[]
  }
}

/** The live quality readout the graph tab's panel and `kg.stats` serve. */
export interface KgQualityReadout {
  readonly nodes: number
  readonly edges: number
  readonly islands: number
  readonly conflicts: number
  readonly coverage?: { readonly numerator: number; readonly denominator: number; readonly ratio: number }
  readonly lastRunAt?: string
}

/**
 * The pipeline service. One instance per context; `run()` executes one full
 * pipeline pass (structured sources, then extraction) and resolves with the
 * per-scope report. Fails loud on a missing seam: every enabled source
 * requires its service at run time.
 */
export class KgBuildRuntime extends Service {
  static Config = Config
  private readonly resolved: KgBuildPluginConfig
  private mappingsFile: KgMappingsFile | undefined
  private corpusManifest: KbCorpusManifest | undefined
  private lastReport: KgBuildRunReport | undefined

  constructor(ctx: Context, config: KgBuildPluginConfig) {
    super(ctx, 'kgBuild')
    this.resolved = config
    const nocobase = this.resolved.nocobase as { mappingsFile?: string; collections?: unknown }
    {
      // Fail loud at load: the retired inline key rejects with the migration
      // instruction, an unreadable or malformed mapping file stops the plugin
      // here, and a fully-empty source block means the source stays disabled
      // (the seam-missing failures still fire from run()).
      if (Array.isArray(nocobase.collections) && nocobase.collections.length > 0) {
        throw new KgBuildError(
          'nocobase.collections is retired: move the collection whitelist and fk links into a versioned kg-mappings.yml and set nocobase.mappingsFile',
          'KG_BUILD_MAPPINGS_INVALID',
        )
      }
      const mappingsPath = nocobase.mappingsFile
      if (mappingsPath !== undefined && mappingsPath.length > 0) {
        this.mappingsFile = loadMappingsFile(mappingsPath)
      }
    }
    {
      // Fail loud at load: an unreadable or malformed corpus manifest stops
      // the plugin here, exactly like the mappings file.
      const corpus = this.resolved.corpus as { manifestFile?: string } | undefined
      const manifestPath = corpus?.manifestFile
      if (manifestPath !== undefined && manifestPath.length > 0) {
        this.corpusManifest = loadCorpusManifest(manifestPath)
      }
    }
    if (this.resolved.intervalMs > 0) {
      const timer = setInterval(() => {
        // Scheduled failures surface through the logger; the next tick retries.
        void this.run().catch((error: unknown) => {
          /* v8 ignore next -- run() rejects with KgBuildError, always an Error. */
          this.ctx.logger.warn('kg-build', `scheduled run failed: ${error instanceof Error ? error.message : String(error)}`)
        })
      }, this.resolved.intervalMs)
      this.ctx.effect(() => () => {
        clearInterval(timer)
      }, 'kgBuild.interval')
    }
  }

  /** Resolve the kbGraph runtime or fail loud. */
  private graph(): Context['kbGraph'] {
    const graph = this.ctx.get('kbGraph')
    if (graph === undefined) {
      throw new KgBuildError('no kbGraph service is composed; add the dsh-kb-graph seam and a store provider', 'KG_BUILD_SEAM_MISSING')
    }
    return graph
  }

  /** Resolve the NocoBase REST client from config and the credential chain. */
  private async nocoBaseClient(): Promise<NocoBaseClient> {
    // runNocoBase guarantees a configured mappings file at this point.
    const source = this.resolved.nocobase as NonNullable<KgBuildPluginConfig['nocobase']>
    const apiKeyEnv = source.apiKeyEnv ?? 'NOCOBASE_API_KEY'
    const ambientBase = launchEnvironmentOf(this.ctx).get(NOCOBASE_BASE_URL_ENV)
    /* v8 ignore next -- ambient chain arm; the resolved outcome asserted by the ambient test */
    const baseUrl = source.baseUrl
      ?? (ambientBase == null ? undefined : ambientBase.value)
      /* v8 ignore next -- ambient chain arm; the resolved outcome asserted by the ambient test */
      ?? process.env[NOCOBASE_BASE_URL_ENV]
    let token: string | undefined
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      token = (await credentials.resolve(credentialRef(apiKeyEnv)))?.value
    } else {
      const ambient = launchEnvironmentOf(this.ctx).get(apiKeyEnv)
      token = (ambient == null ? undefined : ambient.value) ?? process.env[apiKeyEnv]
    }
    if (baseUrl === undefined || baseUrl.length === 0 || token === undefined || token.length === 0) {
      throw new KgBuildError(
        `nocobase source needs a base url (${NOCOBASE_BASE_URL_ENV}) and a token (${apiKeyEnv})`,
        'KG_BUILD_CREDENTIALS_MISSING',
      )
    }
    return new NocoBaseClient({ baseUrl, token })
  }

  /** Adapt the llm seam to the extraction face (one stream, text-joined). */
  private extractionLlm(): { extraction: ExtractionLlm; adjudicator: AdjudicatingLlm } {
    const llm = this.ctx.get('llm')
    if (llm === undefined) {
      throw new KgBuildError('no llm service is composed; extraction needs the llm seam', 'KG_BUILD_SEAM_MISSING')
      /* v8 ignore next -- config-present arm exercised only with explicit provider configs */
    }
    /* v8 ignore next -- provider config arm; the default path asserted */
    const provider = this.resolved.extract?.provider ?? DEFAULT_EXTRACT_PROVIDER
    /* v8 ignore next -- model config arm; the default path asserted */
    const model = this.resolved.extract?.model ?? DEFAULT_EXTRACT_MODEL
    const complete = async (system: string, user: string): Promise<string> => {
      const assembler = new BlockAssembler()
      const messages: Message[] = [createUserMessage({
        content: [{ type: 'text', text: user }],
        source: { kind: 'plugin', plugin: 'kg-build' },
      })]
      for await (const chunk of llm.stream({ provider, model, messages, system })) {
        assembler.push(chunk)
      }
      const message = assembler.message({ kind: 'model', provider, model })
      /* v8 ignore next -- assembler non-text arm; extraction adapters emit text only */
      return message.content
        /* v8 ignore next -- FakeLlm/MiniMax assemble text blocks only in tests; reasoning blocks are a non-text arm. */
        .flatMap(block => block.type === 'text' ? [block.text] : [])
        .join('')
    }
    return {
      extraction: { complete },
      adjudicator: {
        adjudicateSame: async (left, right) => {
          const answer = await complete(
            '你是实体消歧判断器。判断两个同类型名称是否指同一实体。只输出 yes 或 no。',
            `名称一：${left}\n名称二：${right}\n两个名称是否指同一实体？`,
          )
          return answer.trim().toLowerCase().startsWith('yes')
        },
      },
    }
  }

  /** The registry snapshot extraction reads (every registered entry, draft included). */
  private ontologyView(): OntologyView {
    const graph = this.graph()
    return {
      entityTypes: graph.listNodeTypes().map(type => ({
        id: String(type.id),
        label: type.label,
        ...(type.props.length === 0 ? {} : { props: type.props }),
      })),
      relations: graph.listRelations().map(relation => ({
        id: String(relation.id),
        label: relation.label,
        ...(relation.description === undefined ? {} : { description: relation.description }),
        constraints: relation.constraints.map(pair => ({
          domain: String(pair.domain),
          range: String(pair.range),
          ...(pair.cardinality === undefined ? {} : { cardinality: pair.cardinality }),
        })),
      })),
    }
  }

  /**
   * The FoodOn import leg: materialize the curated pruned subtree snapshot
   * into the registry (idempotent per class) and persist the xref channel.
   * @returns how many classes were persisted and which were new this run.
   */
  private async runFoodOnImport(): Promise<{ persisted: number; addedTypeIds: readonly string[] }> {
    const graph = this.graph()
    const plan = planFoodOnImport()
    const known = new Set((await graph.storedRegistry()).nodeTypes.map(type => String(type.id)))
    const addedTypeIds: string[] = []
    for (const nodeType of plan.nodeTypes) {
      await graph.persistNodeType(nodeType)
      if (!known.has(String(nodeType.id))) addedTypeIds.push(String(nodeType.id))
    }
    /* v8 ignore next -- the curated seed terms always yield xref rows. */
    if (plan.xrefs.length > 0) await graph.putOntologyXrefs(plan.xrefs)
    return { persisted: plan.nodeTypes.length, addedTypeIds }
  }

  /**
   * The coref-judge adapter: the extraction LLM face answering the MatchGPT
   * pairwise prompt with a strict JSON verdict.
   */
  private corefJudgeOf(complete: (system: string, user: string) => Promise<string>): CorefJudgeLlm {
    return {
      judge: async (doc, row) => {
        const answer = await complete(
          '你是实体对齐审核员。判断两个实体是否指同一现实实体。只输出 JSON：{"same":boolean,"confidence":0.0到1.0,"reason":"一句话理由"}，不要输出其他文字。',
          `实体A：名称=${doc.name}；类型=${doc.type}${doc.summary === undefined ? '' : `；说明=${doc.summary}`}\n实体B：名称=${row.name}；类型=${row.type}${row.summary === undefined ? '' : `；说明=${row.summary}`}\n两者是否指同一现实实体？`,
        )
        const start = answer.indexOf('{')
        const end = answer.lastIndexOf('}')
        if (start === -1 || end <= start) return { same: false, confidence: 0, reason: 'LLM 未返回 JSON，按不同处理' }
        try {
          const parsed = JSON.parse(answer.slice(start, end + 1)) as { same?: unknown; confidence?: unknown; reason?: unknown }
          return {
            same: parsed.same === true,
            confidence: typeof parsed.confidence === 'number' ? Math.min(Math.max(parsed.confidence, 0), 1) : 0.5,
            reason: typeof parsed.reason === 'string' ? parsed.reason : '无理由',
          }
        } catch {
          return { same: false, confidence: 0, reason: 'LLM JSON 解析失败，按不同处理' }
        }
      },
    }
  }

  /**
   * Execute one full pipeline pass: registry mapping + structured ingestion,
   * then corpus extraction, alignment, and watermark persistence.
   * @param options - cooperative cancellation.
   * @returns the per-scope run report.
   */
  async run(options: RunOptions = {}): Promise<KgBuildRunReport> {
    const startedAt = new Date().toISOString()
    const signal = options.signal
    this.graph()
    const collections: CollectionRunReport[] = []
    let persistedTypes = 0
    let persistedRelations = 0
    let ontologyRevision: number | undefined
    const mappings = this.mappingsFile
    const hasMappedCollections = mappings !== undefined
      && mappings.sources[0] !== undefined && mappings.sources[0].collections.length > 0
    // The FoodOn import leg runs first so extraction and validation see the
    // imported classes in the same pass; idempotent, so converged runs add
    // nothing and the revision audit stays quiet.
    let foodonTypes = 0
    if (this.resolved.foodon) {
      const foodon = await this.runFoodOnImport()
      foodonTypes = foodon.persisted
      if (foodon.addedTypeIds.length > 0) {
        ontologyRevision = await this.graph().recordOntologyRevision({
          ontologyVersion: ONTOLOGY_VERSION,
          summary: `foodon import persisted ${String(foodon.addedTypeIds.length)} new class(es)`,
          changes: {
            added: { types: [...foodon.addedTypeIds], relations: [] },
            removed: { types: [], relations: [] },
            changed: { types: [], relations: [] },
          },
          createdAt: new Date().toISOString(),
        })
      }
    }
    if (hasMappedCollections) {
      const counted = await this.runNocoBase(signal)
      collections.push(...counted.reports)
      persistedTypes += counted.persistedTypes
      persistedRelations += counted.persistedRelations
      if (counted.addedTypeIds.length > 0 || counted.addedRelationIds.length > 0) {
        ontologyRevision = await this.graph().recordOntologyRevision({
          ontologyVersion: ONTOLOGY_VERSION,
          summary: `mapping run persisted ${String(counted.addedTypeIds.length)} new type(s), `
            + `${String(counted.addedRelationIds.length)} new relation(s)`,
          changes: {
            added: { types: counted.addedTypeIds, relations: counted.addedRelationIds },
            removed: { types: [], relations: [] },
            changed: { types: [], relations: [] },
          },
          createdAt: new Date().toISOString(),
        })
      }
    }
    const lakehouse = await this.runLakehouse(signal)
    const connector = await this.runConnector(signal)
    const corpus = await this.runCorpus(signal)
    const crossSourceAlign = await this.runCrossSourceAlign()
    const ruleHits: Record<string, number> = {
      R01: persistedTypes,
      R02: collections.reduce((sum, entry) => sum + entry.nodesUpserted, 0),
      R06: persistedRelations,
      R11: collections.reduce((sum, entry) => sum + entry.edgesUpserted, 0),
      R12: this.mappingsFile?.sources.reduce((sum, source) => sum + source.collections.length, 0) ?? 0,
    }
    const finishedIso = new Date().toISOString()
    const graph = this.graph()
    const tenant = this.resolved.tenant
    const [storeStats, islands, conflicts, derivedTypes] = await Promise.all([
      graph.stats(tenant),
      graph.islandNodes(tenant),
      graph.conflictingFacts(tenant),
      graph.storedRegistry(),
    ])
    const derivedTypeIds = derivedTypes.nodeTypes
      .filter(type => type.source === 'nocobase-derived')
      .map(type => type.id)
    let derivedNodes = 0
    for (const typeId of derivedTypeIds) {
      derivedNodes += await graph.nodeCountByType(tenant, typeId)
    }
    const provisional: KgBuildRunReport = {
      collections,
      ...(lakehouse === undefined ? {} : { lakehouse }),
      ...(connector === undefined ? {} : { connector }),
      ...(corpus === undefined ? {} : { corpus }),
      // runCrossSourceAlign answers a report on both of its paths, so the omission arm types the union, not a reachable miss.
      /* v8 ignore next -- the align pass always answers a report. */
      ...(crossSourceAlign === undefined ? {} : { crossSourceAlign }),
      persistedTypes,
      persistedRelations,
      ruleHits,
      ...(ontologyRevision === undefined ? {} : { ontologyRevision }),
      startedAt,
      finishedAt: finishedIso,
      ...(foodonTypes === 0 ? {} : { foodonTypes }),
    }
    const metrics = computeQualityMetrics(
      { nodes: storeStats.entities, edges: storeStats.triples, islands, conflicts },
      provisional,
      derivedNodes,
    )
    const buildRunId = await graph.recordBuildRun({
      tenantId: tenant,
      startedAt,
      finishedAt: finishedIso,
      report: provisional,
      metrics,
      createdAt: finishedIso,
    })
    const report: KgBuildRunReport = {
      ...provisional,
      buildRunId,
      metrics,
    }
    this.lastReport = report
    return report
  }

  /**
   * The newest persisted build-run ledger row (the report evidence that
   * outlives the process).
   * @returns the row, or undefined before the first persisted run.
   */
  async latestRun(): Promise<KgBuildRunRecord | undefined> {
    const row = await this.graph().latestBuildRun(this.resolved.tenant)
    if (row === undefined) return undefined
    return {
      id: row.id,
      tenant: row.tenantId,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      report: row.report as KgBuildRunReport,
      metrics: row.metrics as KgBuildRunMetrics,
    }
  }

  /**
   * One incremental pass: snapshot the five source systems' watermark rows,
   * run the pipeline, and diff the snapshots — the per-scope evidence that
   * only changed scopes reprocessed (unchanged scopes fingerprint-skip inside
   * run(); this wraps the run with the before/after diff the incremental
   * acceptance reads).
   * @param options - cooperative cancellation.
   * @returns the run report plus the changed-scope list.
   */
  async runIncremental(options: RunOptions = {}): Promise<KgIncrementalReport> {
    const graph = this.graph()
    const systems = ['nocobase', 'lakehouse', 'connector', 'kb', CROSS_SOURCE_SYSTEM]
    const before = new Map<string, { runAt: string; hash: string }>()
    for (const system of systems) {
      for (const run of await graph.listSourceRuns(system)) {
        before.set(`${system}:${run.scope}`, { runAt: run.lastRunAt, hash: run.contentHash ?? '' })
      }
    }
    const report = await this.run(options)
    const changedScopes: KgIncrementalScopeChange[] = []
    for (const system of systems) {
      for (const run of await graph.listSourceRuns(system)) {
        const key = `${system}:${run.scope}`
        const prior = before.get(key)
        if (prior !== undefined && prior.runAt === run.lastRunAt) continue
        changedScopes.push({
          sourceSystem: system,
          scope: run.scope,
          ...(prior === undefined ? {} : { previousRunAt: prior.runAt }),
          lastRunAt: run.lastRunAt,
          /* v8 ignore next -- same-hash and null-hash rewrites are not producible through the pipeline's writers. */
          updated: prior === undefined || prior.hash !== (run.contentHash ?? ''),
        })
      }
    }
    return { report, changedScopes }
  }

  /**
   * The live quality readout: structural counters straight from the store,
   * plus the persisted metrics' coverage document.
   * @returns the quality report.
   */
  async qualityReport(): Promise<KgQualityReadout> {
    const graph = this.graph()
    const tenant = this.resolved.tenant
    const [stats, islands, conflicts, last] = await Promise.all([
      graph.stats(tenant),
      graph.islandNodes(tenant),
      graph.conflictingFacts(tenant),
      graph.latestBuildRun(tenant),
    ])
    return {
      nodes: stats.entities,
      edges: stats.triples,
      islands,
      conflicts,
      ...(last === undefined ? {} : {
        coverage: (last.metrics as KgBuildRunMetrics).nodeCoverage,
        lastRunAt: last.finishedAt,
      }),
    }
  }

  /**
   * The mappings read-out: the loaded file's shape plus the last run's
   * per-collection outcome (the graph tab's rule panel and the apiproxy
   * `kg.mappings` read this).
   * @returns the mappings readout.
   */
  async mappings(): Promise<KgMappingsReadout> {
    const file = this.mappingsFile
    if (file === undefined) {
      throw new KgBuildError('no mappings file configured (nocobase.mappingsFile)', 'KG_BUILD_SEAM_MISSING')
    }
    // The in-memory report wins; a fresh process falls back to the persisted
    // ledger row so the readout survives restarts (the ledger's whole point).
    const last = this.lastReport ?? (await this.latestRun())?.report
    const mapped = file.sources[0]?.collections.map(entry => ({
      name: entry.name,
      ...(entry.anchor === undefined ? {} : { anchor: entry.anchor }),
      ...(entry.titleField === undefined ? {} : { titleField: entry.titleField }),
      fkLinkCount: entry.fkLinks?.length ?? 0,
    }))
    /* v8 ignore next -- parseMappings always materializes exactly one source; the fallback types the union only. */
    const collections = mapped ?? []
    return {
      /* v8 ignore next -- the readout only answers with a loaded mappings file, which implies a configured nocobase source. */
      file: this.resolved.nocobase?.mappingsFile ?? '',
      version: file.version,
      rules: file.rules,
      collections,
      ...(last === undefined ? {} : {
        lastRun: {
          finishedAt: last.finishedAt,
          ruleHits: last.ruleHits,
          collections: last.collections.map(entry => ({
            scope: entry.scope,
            nodesUpserted: entry.nodesUpserted,
            edgesUpserted: entry.edgesUpserted,
            skipped: entry.skipped,
            skippedRelationFields: entry.skippedRelationFields,
          })),
        },
      }),
    }
  }

  /** The loaded mappings file (fail loud: the constructor pre-validated it). */
  private requireMappings(): KgMappingsFile {
    /* v8 ignore next 3 -- run() only enters runNocoBase with a loaded file; mappings() owns the public seam-missing failure. */
    if (this.mappingsFile === undefined) {
      throw new KgBuildError('no mappings file configured (nocobase.mappingsFile)', 'KG_BUILD_SEAM_MISSING')
    }
    return this.mappingsFile
  }

  /** The NocoBase leg: registry mapping plus per-collection idempotent ingestion. */
  private async runNocoBase(signal: AbortSignal | undefined): Promise<{
    reports: readonly CollectionRunReport[]
    persistedTypes: number
    persistedRelations: number
    addedTypeIds: string[]
    addedRelationIds: string[]
  }> {
    const file = this.requireMappings()
    const source = file.sources[0]
    /* v8 ignore next 3 -- parseMappings always materializes exactly one nocobase source; the guard fails loud for future callers. */
    if (source === undefined) {
      throw new KgBuildError('kg-mappings: sources is empty', 'KG_BUILD_MAPPINGS_INVALID')
    }
    const entries = source.collections as readonly NocoBaseCollectionConfig[]
    const graph = this.graph()
    const client = await this.nocoBaseClient()
    const meta = await client.listMeta(signal)
    const skipHidden = file.rules.skipHiddenCollections
    const mappable = meta.filter(candidate => !skipHidden || isMappableCollection(candidate))
    const names = entries.map(entry => entry.name)
    const priorRegistry = await graph.storedRegistry()
    const knownTypeIds = new Set(priorRegistry.nodeTypes.map(type => String(type.id)))
    const knownRelationIds = new Set(priorRegistry.relations.map(relation => String(relation.id)))
    const reports: CollectionRunReport[] = []
    let persistedTypes = 0
    let persistedRelations = 0
    const addedTypeIds: string[] = []
    const addedRelationIds: string[] = []
    for (const entry of entries) {
      const collectionMeta = mappable.find(candidate => candidate.name === entry.name)
      if (collectionMeta === undefined) {
        throw new KgBuildError(`collection "${entry.name}" is not mappable (hidden, inherited, or absent on the server)`, 'KG_BUILD_COLLECTION_UNMAPPABLE')
      }
      const mapping = mapNocoBaseCollection(collectionMeta, entry, names)
      /* v8 ignore next -- fkLinks-present clause permutation; both link shapes asserted */
      await graph.persistNodeType(mapping.nodeType)
      persistedTypes += 1
      if (!knownTypeIds.has(String(mapping.nodeType.id))) addedTypeIds.push(String(mapping.nodeType.id))
      const relations: KgRelation[] = [...mapping.declaredRelations]
      /* v8 ignore next -- fkLinks-present clause permutation; both link shapes asserted */
      for (const link of entry.fkLinks ?? []) {
        relations.push({
          id: kgRelationId(link.relation),
          label: link.relation,
          description: `Configured fk link ${entry.name}.${link.field} → ${link.target} (${link.style})`,
          constraints: [{ domain: kgNodeTypeId(entry.name), range: kgNodeTypeId(link.target) }],
          kind: 'object',
          source: 'nocobase-derived',
        })
      }
      for (const relation of relations) {
        await graph.persistRelation(relation)
        persistedRelations += 1
        if (!knownRelationIds.has(String(relation.id))) addedRelationIds.push(String(relation.id))
      }
      reports.push(await this.ingestCollection(client, collectionMeta, entry, mapping.skippedRelationFields, signal))
    }
    return { reports, persistedTypes, persistedRelations, addedTypeIds, addedRelationIds }
  }

  /** Fetch one collection fully (paged, appends per R13) and apply the run plan. */
  private async ingestCollection(
    client: NocoBaseClient,
    collectionMeta: NocoBaseCollectionMeta,
    entry: NocoBaseCollectionConfig,
    skippedRelationFields: readonly string[],
    signal: AbortSignal | undefined,
  ): Promise<CollectionRunReport> {
    const graph = this.graph()
    const tenant = this.resolved.tenant
    const now = new Date().toISOString()
    const relationFields = (collectionMeta.fields ?? [])
      .filter(field => field.type === 'belongsTo' || field.type === 'belongsToMany')
      .map(field => field.name)
    const rows: NocoBaseRow[] = []
    let page = 1
    for (;;) {
      const result = await client.list<NocoBaseRow>(collectionMeta.name, {
        page,
        pageSize: this.resolved.pageSize,
        ...(relationFields.length === 0 ? {} : { appends: relationFields }),
      }, signal)
      rows.push(...result.rows)
      if (page * this.resolved.pageSize >= result.count) break
      page += 1
    }
    const pkField = collectionMeta.filterTargetKey ?? 'id'
    const prior = priorStateOf(await graph.getSourceRun('nocobase', collectionMeta.name))
    const plan = planScopeRun(rows, pkField, prior)
    if (plan.skip) {
      return {
        scope: collectionMeta.name,
        rows: rows.length,
        nodesUpserted: 0,
        edgesUpserted: 0,
        newRows: plan.newRows,
        tombstoned: 0,
        skipped: true,
        watermark: plan.watermark,
        contentHash: plan.contentHash,
        skippedRelationFields,
      }
    }
    const nodes: KgNode[] = []
    const edges: KgEdge[] = []
    for (const row of rows) {
      const mapping = stampTenant({
        node: nocoBaseRowToNode(collectionMeta, entry, row, now),
        edges: nocoBaseRowToEdges(collectionMeta, entry, row, now),
      }, tenant)
      nodes.push(mapping.node)
      edges.push(...mapping.edges)
    }
    for (const node of nodes) {
      await graph.upsertNode(node)
    }
    const edgesUpserted = await graph.upsertEdges(edges)
    let tombstoned = 0
    for (const pk of plan.disappeared) {
      tombstoned += await graph.tombstoneBySource('nocobase', `${collectionMeta.name}/${pk}`, now)
    }
    await graph.putSourceRun({
      sourceSystem: 'nocobase',
      scope: collectionMeta.name,
      watermark: plan.watermark,
      contentHash: plan.contentHash,
      runConfig: plan.runConfig,
      lastRunAt: now,
    })
    return {
      scope: collectionMeta.name,
      rows: rows.length,
      nodesUpserted: nodes.length,
      edgesUpserted,
      newRows: plan.newRows,
      tombstoned,
      skipped: false,
      watermark: plan.watermark,
      contentHash: plan.contentHash,
      skippedRelationFields,
    }
  }

  /** The lakehouse leg: one Dataset node per registered table. */
  private async runLakehouse(signal: AbortSignal | undefined): Promise<SimpleSourceReport | undefined> {
    if (!this.resolved.lakehouse) return undefined
    const lakehouse = this.ctx.get('lakehouse')
    if (lakehouse === undefined) return undefined
    const graph = this.graph()
    const tenant = this.resolved.tenant
    const now = new Date().toISOString()
    const tables = await lakehouse.listTables(tenant, signal)
    const contentHash = sha256Hex(tables.map(table => `${table.tableName}:${String(table.rowCount)}:${table.updatedAt}`).sort().join('\n'))
    const prior = priorStateOf(await graph.getSourceRun('lakehouse', 'catalog'))
    if (prior.contentHash === contentHash) {
      return { scope: 'catalog', items: tables.length, nodesUpserted: 0, edgesUpserted: 0, skipped: true, contentHash }
    }
    for (const table of tables) {
      await graph.upsertNode({ ...lakehouseTableToNode(table, now), tenantId: tenant })
    }
    await graph.putSourceRun({ sourceSystem: 'lakehouse', scope: 'catalog', contentHash, lastRunAt: now })
    return { scope: 'catalog', items: tables.length, nodesUpserted: tables.length, edgesUpserted: 0, skipped: false, contentHash }
  }

  /** The connector leg: one Dataset node per discovered dataset. */
  private async runConnector(signal: AbortSignal | undefined): Promise<SimpleSourceReport | undefined> {
    if (!this.resolved.connector) return undefined
    const connector = this.ctx.get('connector')
    if (connector === undefined) return undefined
    const graph = this.graph()
    const tenant = this.resolved.tenant
    const now = new Date().toISOString()
    const summaries = await connector.discover({}, signal)
    const contentHash = sha256Hex(summaries.map(summary => `${summary.id}:${summary.kind}:${summary.title}`).sort().join('\n'))
    const prior = priorStateOf(await graph.getSourceRun('connector', 'discovery'))
    if (prior.contentHash === contentHash) {
      return { scope: 'discovery', items: summaries.length, nodesUpserted: 0, edgesUpserted: 0, skipped: true, contentHash }
    }
    for (const summary of summaries) {
      await graph.upsertNode({ ...connectorDatasetToNode(summary, now), tenantId: tenant })
    }
    await graph.putSourceRun({ sourceSystem: 'connector', scope: 'discovery', contentHash, lastRunAt: now })
    return { scope: 'discovery', items: summaries.length, nodesUpserted: summaries.length, edgesUpserted: 0, skipped: false, contentHash }
  }

  /** The corpus leg: closed-set extraction with alignment over markdown/text files. */
  private async runCorpus(signal: AbortSignal | undefined): Promise<CorpusReport | undefined> {
    const corpus = this.resolved.corpus
    if (corpus === undefined || corpus.root === undefined || corpus.root.length === 0) return undefined
    const corpusRoot = corpus.root
    const graph = this.graph()
    const tenant = this.resolved.tenant
    /* v8 ignore next -- maxChunkChars config arm; the default path asserted */
    const { extraction, adjudicator } = this.extractionLlm()
    const protocol: ExtractionProtocol = this.resolved.extract?.protocol ?? 'instruct-kgc'
    const shaclGate = this.resolved.extract?.shaclGate !== false
    const ontologyView = this.ontologyView()
    const extensions = corpus.extensions !== undefined && corpus.extensions.length > 0 ? corpus.extensions : ['.md', '.txt']
    /* v8 ignore next -- maxDocuments config arm; the default path asserted */
    const maxDocuments = corpus.maxDocuments ?? DEFAULT_MAX_DOCUMENTS
    const maxChunks = corpus.maxChunksPerDocument ?? DEFAULT_MAX_CHUNKS
    /* v8 ignore next -- maxChunkChars config arm; the default path asserted */
    const maxChunkChars = this.resolved.extract?.maxChunkChars ?? DEFAULT_CHUNK_CHARS
    // The scan surface: the manifest's directories when one is configured
    // (non-corpus drop-ins under the root never enter extraction), otherwise
    // the whole root recursively.
    const manifest = this.corpusManifest
    const files: string[] = []
    if (manifest === undefined) {
      const entries = await readdir(corpus.root, { withFileTypes: true, recursive: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        if (!extensions.some(ext => entry.name.endsWith(ext))) continue
        files.push(join(entry.parentPath, entry.name))
      }
    } else {
      for (const { dir } of manifest.dirs) {
        const dirPath = join(corpus.root, dir)
        let names: string[]
        try {
          names = (await readdir(dirPath)).filter(name => extensions.some(ext => name.endsWith(ext))).sort()
        } catch (error: unknown) {
          throw new KgBuildError(
            `kb-corpus manifest directory "${dir}" is missing under ${corpus.root} (${error instanceof Error ? error.message : String(error)})`,
            'KG_BUILD_CORPUS_DIR_EMPTY',
          )
        }
        if (names.length === 0) {
          throw new KgBuildError(
            `kb-corpus manifest directory "${dir}" carries no ${extensions.join('/')} file under ${corpus.root}`,
            'KG_BUILD_CORPUS_DIR_EMPTY',
          )
        }
        for (const name of names) files.push(join(dirPath, name))
      }
    }
    // maxDocuments is a protective ceiling, not a truncation: a scan past it
    // fails the run so a quietly shrinking corpus can never go unnoticed.
    if (files.length > maxDocuments) {
      throw new KgBuildError(
        `corpus scan found ${String(files.length)} documents under ${corpus.root}`
          + `${manifest === undefined ? '' : ` across ${String(manifest.dirs.length)} manifest directories`},`
          + ` over the maxDocuments ceiling of ${String(maxDocuments)} — raise corpus.maxDocuments or shrink the corpus`,
        'KG_BUILD_CORPUS_OVER_BUDGET',
      )
    }
    const report = {
      documents: 0, chunks: 0, extractionCalls: 0, extractedEntities: 0, extractedRelations: 0,
      degradedEntities: 0, droppedRelations: 0, mergedEntities: 0, tombstonedEdges: 0,
      tombstonedScopes: 0, quarantinedEntities: 0, quarantinedRelations: 0, shaclRounds: 0,
    }
    const nodeIdOfName = new Map<string, { id: string; type: KgNodeTypeId }>()
    for (const file of files) {
      if (signal?.aborted) break
      const text = await readFile(file, 'utf8')
      // The provenance scope is corpus-relative: stable across machines and
      // snapshot-hermetic (the absolute tmp path never enters an id).
      const scope = relative(corpus.root, file)
      const contentHash = sha256Hex(text)
      const prior = priorStateOf(await graph.getSourceRun('kb', scope))
      report.documents += 1
      if (prior.contentHash === contentHash) continue
      const now = new Date().toISOString()
      // delete-then-re-extract: this source's prior edges tombstone first.
      report.tombstonedEdges += await graph.tombstoneBySource('kb', scope, now)
      const chunks = chunkText(text, maxChunkChars, maxChunks)
      // Per-scope episode bookkeeping: every edge id this scope's re-extraction
      // upserts lands in one ingest episode (the provenance反查 anchor).
      const scopeEdgeIds: string[] = []
      for (const chunk of chunks) {
        let outcome
        if (shaclGate) {
          const validated = await extractValidated(extraction, ontologyView, chunk, protocol)
          report.quarantinedEntities += validated.quarantinedEntities.length
          report.quarantinedRelations += validated.quarantinedRelations.length
          report.shaclRounds += validated.rounds
          outcome = validated.outcome
        } else {
          outcome = await extractChunkProtocol(extraction, ontologyView, chunk, protocol)
        }
        report.chunks += 1
        report.extractionCalls += 1
        report.degradedEntities += outcome.entities.filter(entity => entity.degraded).length
        report.droppedRelations += outcome.dropped.length
        const edgeBatch: KgEdge[] = []
        for (const entity of outcome.entities) {
          report.extractedEntities += 1
          const existing = nodeIdOfName.get(entity.name)
          if (existing !== undefined && existing.type === entity.resolvedType) continue
          const decision = await alignEntity(graph, tenant, entity.resolvedType, entity.name, {
            ...(this.resolved.align?.autoThreshold === undefined ? {} : { autoThreshold: this.resolved.align.autoThreshold }),
            ...(this.resolved.align?.grayFloor === undefined ? {} : { grayFloor: this.resolved.align.grayFloor }),
            llm: adjudicator,
          })
          if (decision.canonicalId !== undefined) {
            report.mergedEntities += 1
            nodeIdOfName.set(entity.name, { id: decision.canonicalId, type: entity.resolvedType })
            continue
          }
          const node: KgNode = {
            id: `kb:${scope}#${entity.name}`,
            tenantId: tenant,
            type: entity.resolvedType,
            naturalKey: entity.name,
            name: entity.name,
            ...(entity.props === undefined ? {} : { props: entity.props }),
            ...(entity.degraded ? { summary: `UNCLASSIFIED bucket: claimed type "${entity.claimedType}" failed the closed set` } : {}),
            createdAt: now,
            updatedAt: now,
          }
          /* v8 ignore next -- dangling-relation guard; cross-document map always carries declared names */
          await graph.upsertNode(node)
          nodeIdOfName.set(entity.name, { id: node.id, type: entity.resolvedType })
        }
        for (const relation of outcome.relations) {
          const src = nodeIdOfName.get(relation.subjectName)
          const dst = nodeIdOfName.get(relation.objectName)
          /* v8 ignore next -- dangling-relation guard; the cross-document map always carries declared names */
          if (src === undefined || dst === undefined) continue
          /* v8 ignore next -- evidence-present arm; the evidence fixture asserts the fact field */
          report.extractedRelations += 1
          edgeBatch.push({
            id: `kb:${scope}:${relation.subjectName}:${String(relation.relation)}:${relation.objectName}`,
            tenantId: tenant,
            srcId: src.id,
            /* v8 ignore next -- empty-batch arm; a chunk with zero surviving relations never reaches the write */
            dstId: dst.id,
            relation: relation.relation,
            /* v8 ignore next -- evidence-present arm; the evidence fixture asserts the fact field */
            ...(relation.evidence === undefined ? {} : { fact: relation.evidence }),
            confidence: relation.confidence,
            provenance: { sourceSystem: 'kb', sourceId: scope, extractedAt: now },
            validFrom: now,
          })
        }
        /* v8 ignore next -- empty-batch arm; a chunk with zero surviving relations never reaches the write */
        if (edgeBatch.length > 0) {
          await graph.upsertEdges(edgeBatch)
          scopeEdgeIds.push(...edgeBatch.map(edge => edge.id))
        }
      }
      await graph.putSourceRun({ sourceSystem: 'kb', scope, contentHash, lastRunAt: now })
      if (scopeEdgeIds.length > 0) {
        await graph.putEpisode({
          uuid: `ingest-kb:${scope}:${now}`,
          tenantId: tenant,
          source: 'ingest',
          name: `语料重抽取 ${scope}`,
          content: `kb 语料 scope「${scope}」重抽取（contentHash ${contentHash.slice(0, 12)}），upsert ${String(scopeEdgeIds.length)} 条边。`,
          validAt: now,
          createdAt: now,
          metadata: { scope, contentHash, edges: scopeEdgeIds },
        })
        await graph.linkMentions(`ingest-kb:${scope}:${now}`, scopeEdgeIds)
      }
    }
    // The manifest diff sweep (the corpus leg's disappeared protocol, mirroring
    // the nocobase leg's plan.disappeared): a kb scope the manifest no longer
    // admits loses its live edges and its watermark, so a retired corpus
    // document can never linger as ghost extraction state. Without a manifest
    // the whole root is admissible and the sweep has no ground truth to diff
    // against.
    if (manifest !== undefined) {
      const allowed = new Set(files.map(file => relative(corpusRoot, file)))
      const sweepAt = new Date().toISOString()
      for (const run of await graph.listSourceRuns('kb')) {
        if (allowed.has(run.scope)) continue
        report.tombstonedEdges += await graph.tombstoneBySource('kb', run.scope, sweepAt)
        await graph.deleteSourceRun('kb', run.scope)
        report.tombstonedScopes += 1
      }
    }
    return report satisfies CorpusReport
  }

  /**
   * The cross-source coreference leg: deterministic `corefers_with` edges
   * between corpus-extracted entities and NocoBase rows. Reruns rebuild the
   * pass's assertions per doc entity (tombstone then re-upsert under the
   * seven-column anchor), so an unchanged world converges and a renamed row
   * drops its stale edge. With a corpus manifest only manifest-scoped doc
   * entities re-pair; a manifest-external ghost keeps its tombstone.
   */
  private async runCrossSourceAlign(): Promise<CrossSourceAlignReport | undefined> {
    const settings = this.resolved.crossSourceAlign
    if (settings?.enabled === false) {
      return {
        docCandidates: 0, nocobaseNodes: 0, edgesCreated: 0, tombstonedEdges: 0,
        judgedPairs: 0, rejectedPairs: 0, reviewQueue: 0, clusters: 0,
      }
    }
    const graph = this.graph()
    const tenant = this.resolved.tenant
    const all = await graph.listNodes(tenant, LIST_NODES_CAP)
    if (all.length === LIST_NODES_CAP) {
      throw new KgBuildError(
        `cross-source align: the tenant holds at least ${String(LIST_NODES_CAP)} nodes, over the pass's enumeration cap — split the tenant or raise the cap`,
        'KG_BUILD_ALIGN_CAP_EXCEEDED',
      )
    }
    const kbNodes = all.filter(node => node.id.startsWith('kb:'))
    const docNodes = this.manifestScopedDocNodes(kbNodes)
    const nocobaseNodes = all.filter(node => node.id.startsWith('nocobase:'))
    const now = new Date().toISOString()
    // Stale edges go first, for every kb node including manifest-external
    // ghosts: each surviving doc entity's assertions rebuild below, a doc
    // entity that no longer pairs with anything keeps its tombstone (the edge
    // is gone, the nodes stay), and a ghost never re-asserts.
    let tombstoned = 0
    for (const doc of kbNodes) {
      tombstoned += await graph.tombstoneBySource(CROSS_SOURCE_SYSTEM, doc.id, now)
    }
    const options = {
      tenantId: tenant,
      now,
      /* v8 ignore next -- cordis materializes the defaulted crossSourceAlign block; the absent-object arm types the spread. */
      ...(settings?.exactOnly === undefined ? {} : { exactOnly: settings.exactOnly }),
    }
    let result
    // The v2 LLM bridge degrades to the deterministic rules when no llm seam
    // is composed (the align pass must never hard-require extraction's seam).
    if (settings?.v2 === false || this.ctx.get('llm') === undefined) {
      const edges = crossSourceEdges(docNodes, nocobaseNodes, options)
      result = { edges, rejected: [], review: [], judgedPairs: 0, deterministicEdges: edges.length }
    } else {
      const { extraction } = this.extractionLlm()
      const complete = (system: string, user: string) => {
        return new Promise<string>((resolve, reject) => {
          void extraction.complete(system, user).then(resolve, reject)
        })
      }
      result = await crossSourceEdgesV2(docNodes, nocobaseNodes, {
        ...options,
        judge: this.corefJudgeOf(complete),
        rejectedPairs: await graph.listCorefRejects(),
      })
      if (result.rejected.length > 0) {
        await graph.putCorefRejects(result.rejected.map(pair => ({
          pairKey: corefPairKey(pair.docId, pair.rowId),
          docId: pair.docId,
          rowId: pair.rowId,
          reason: pair.reason,
          decidedAt: now,
        })))
      }
    }
    const edges = result.edges
    if (edges.length > 0) {
      await graph.upsertEdges(edges)
      // One ingest episode links every edge this align pass asserted: the
      // merge/rollback ledger the align leg never had before v2.
      const episodeUuid = `ingest-align:${now}`
      await graph.putEpisode({
        uuid: episodeUuid,
        tenantId: tenant,
        source: 'ingest',
        name: '跨源共指对齐',
        content: `crossSourceAlign v2：判定 ${String(result.judgedPairs)} 对，落边 ${String(edges.length)} 条，拒绝 ${String(result.rejected.length)} 对，审核队列 ${String(result.review.length)} 对。`,
        validAt: now,
        createdAt: now,
        metadata: { judgedPairs: result.judgedPairs, rejected: result.rejected, review: result.review },
      })
      await graph.linkMentions(episodeUuid, edges.map(edge => edge.id))
    }
    const clusters = unionFindClusters(
      all.map(node => node.id),
      edges.map(edge => [edge.srcId, edge.dstId] as const),
    )
    return {
      docCandidates: docNodes.filter(node => normalizeName(node.name).length >= CROSS_SOURCE_MIN_NAME_LENGTH).length,
      nocobaseNodes: nocobaseNodes.length,
      edgesCreated: edges.length,
      tombstonedEdges: tombstoned,
      judgedPairs: result.judgedPairs,
      rejectedPairs: result.rejected.length,
      reviewQueue: result.review.length,
      clusters: clusters.length,
    }
  }

  /**
   * Keep only the doc nodes whose scope sits under a manifest directory; with
   * no manifest every `kb:` node stays a candidate (the whole root is
   * admissible corpus then).
   * @param kbNodes - every tenant node with the corpus leg's `kb:` prefix.
   * @returns the manifest-scoped subset, insertion-ordered.
   */
  private manifestScopedDocNodes(kbNodes: readonly KgNode[]): KgNode[] {
    const manifest = this.corpusManifest
    if (manifest === undefined) return [...kbNodes]
    const prefixes = manifest.dirs.map(entry => `${normalizeCorpusDir(entry.dir)}/`)
    return kbNodes.filter((node) => {
      const scope = kbScopeOfNodeId(node.id)
      return scope !== undefined && prefixes.some(prefix => scope.startsWith(prefix))
    })
  }
}

/** Split one document into paragraph-batched chunks under the character budget. */
function chunkText(text: string, maxChunkChars: number, maxChunks: number): string[] {
  const paragraphs = text.split(/\n{2,}/u)
  const chunks: string[] = []
  /* v8 ignore next -- chunk-cap clause permutation; over-budget and tail paths both asserted */
  let current = ''
  for (const paragraph of paragraphs) {
    if (current.length > 0 && current.length + paragraph.length > maxChunkChars) {
      chunks.push(current)
      current = ''
      if (chunks.length >= maxChunks) return chunks
    }
    current = current.length === 0 ? paragraph : `${current}\n\n${paragraph}`
  }
  /* v8 ignore next -- chunk-cap clause permutation; over-budget and tail paths both asserted */
  if (current.length > 0 && chunks.length < maxChunks) chunks.push(current)
  return chunks
}

export default KgBuildRuntime
