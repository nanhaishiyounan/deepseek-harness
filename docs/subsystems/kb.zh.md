# 知识库

[English](kb.md) | 中文

知识库缝把检索能力与存储、向量化后端分离。[`ctx.kb`](#ctxkb--kbruntime) 拥有 provider 注册表与入库/检索编排：文档切片（结构感知的 Markdown 切分）、在存在可用 provider 时向量化、事务性存储；检索恒跑全文路径，可选叠加向量排序，两路经倒数排名融合。

`tenantId` 是每条检索路径、计数与用量计数器上的硬隔离键；`(tenantId, sourcePath)` 是用于引用与覆盖的文档身份。模型可见工具把租户绑定在部署侧（`tool-kb` 的 `Config.tenant`，必填）——模型从不提供租户。结构性缺失的 embed provider 把检索降级为 text-only，`mode: 'text'` 可观测；运行时 embed 失败抛 `KbError` `KB_EMBED_FAILED`——降级是配置状态，绝不是被吞掉的故障。store 选择在执行时解析，每种失败形态有专属错误码（`KB_STORE_CONFIGURED_MISSING`、`KB_STORE_CONFIGURED_UNAVAILABLE`、`KB_STORE_AMBIGUOUS`、`KB_STORE_UNAVAILABLE`）。

每次完成的入库与检索都经 store 记录每租户用量计数（`searches`、`ingestedDocuments`、`ingestedChunks`、`embedTexts`、`embedTokens`）；计数写失败只记警告，绝不连累数据操作。`ctx.kb.usage(tenantId)` 读取租户累计计数，`kb_stats` 予以汇报。

Source: [`packages/kb/kb/src/index.ts`](../../packages/kb/kb/src/index.ts)

## Provider contracts

```ts type-equiv
/**
 * Closed union of ingested document kinds. Consumers `switch` on the value
 * ending in `assertNever`; a new kind is a coordinated change across this
 * package and its consumers, not a plugin extension.
 */
type KbDocKind = 'meeting' | 'interview' | 'report' | 'regulation' | 'profile' | 'table' | 'other'
```

```ts type-equiv
/**
 * One document to store. `(tenantId, sourcePath)` is the document identity:
 * re-ingesting the same pair replaces the previous document and its chunks.
 * `sourcePath` is the stable citation identity (the workspace-relative path
 * the consumer supplied), not a resolved absolute path.
 */
interface KbDocumentInput {
  /** Owning tenant slug (for example `hongfa-food`); the hard isolation key. */
  readonly tenantId: string
  /** Stable source identity used in citations and overwrite matching. */
  readonly sourcePath: string
  readonly title?: string
  readonly docKind: KbDocKind
  /** Collection date (ISO-8601) for same-tenant recency disambiguation. */
  readonly collectedAt?: string
  /**
   * Data-space provenance: who provided the document and how far its use may
   * spread. Absent on legacy ingests (the pre-dataspace default: tenant-only
   * retrieval, no provider attribution).
   */
  readonly provenance?: KbProvenance
  /**
   * SHA-256 hex digest of the UTF-8 document content. The seam computes and
   * fills this on every `ingest`; a caller-supplied value is overwritten (the
   * seam owns the integrity fact, not the caller).
   */
  readonly contentHash?: string
  /** Character length of the document content; filled by the seam on ingest. */
  readonly contentLength?: number
}
```

```ts type-equiv
/** One chunk of a document, as handed to the store by the seam's chunker. */
interface KbChunkInput {
  /** Markdown heading chain, for example `三、成本分析>原料成本`. */
  readonly headingPath?: string
  /** Document-sequence index used to restore chunk order. */
  readonly chunkIdx: number
  readonly content: string
  /** Dense vector, or `null` when no embed provider was usable (degraded mode). */
  readonly embedding: Float32Array | null
  /** Embed identity (`<providerId>:<modelId>`) covering every embedding of this ingest. */
  readonly embedModel?: string
}
```

```ts type-equiv
/**
 * One retrieved chunk with the citation metadata a consumer needs to render a
 * numbered reference: source path, title, document kind, collection date, and
 * heading path.
 */
interface KbSearchHit {
  readonly chunkId: number
  readonly docId: number
  readonly tenantId: string
  readonly sourcePath: string
  readonly title?: string
  readonly docKind: KbDocKind
  readonly collectedAt?: string
  readonly headingPath?: string
  readonly chunkIdx: number
  readonly content: string
  /** Data-space provenance, when the ingest carried it. */
  readonly provenance?: KbProvenance
  /**
   * Fused RRF relevance score, attached by `search()` (stores rank; they do
   * not score). One meaning in both modes — the threshold's score basis.
   */
  readonly score?: number
}
```

```ts type-equiv
/**
 * Hybrid-retrieval outcome. `mode` makes the degraded path observable:
 * `'text'` means no usable embed provider existed, so only the full-text path
 * ran.
 */
interface KbSearchResult {
  readonly mode: 'hybrid' | 'text'
  /** Embed identity used for the query vector, in hybrid mode. */
  readonly embedModel?: string
  readonly results: readonly KbSearchHit[]
}
```

`KbStore` 实现事务性覆盖式存储（`putDocument`、`deleteDocument`、`textSearch`、`vectorSearch`、`stats`）；`EmbedProvider` 在廉价的本地可用性检查之后实现批量向量化。

后端与消费者：

- 存储：[`packages/kb/kb-sqlite`](../../packages/kb/kb-sqlite/README.zh.md) —— 单个 `node:sqlite` 数据库，FTS5 trigram 全文索引（查询构造 OR 连接的短语字面量，自然语言问句可命中散文）加 JS 侧扫描的 BLOB 向量。
- 向量：[`packages/kb/kb-embed-minimax`](../../packages/kb/kb-embed-minimax/README.zh.md) —— 经 MiniMax 原生 `/embeddings` 协议的 `embo-01`（1536 维）；[`packages/kb/kb-embed-dashscope`](../../packages/kb/kb-embed-dashscope/README.zh.md) —— 经 OpenAI 兼容端点的 `text-embedding-v4`（1024 维）。两者都从启动环境解析凭据；缺 key 时 provider 保持注册但不可用，即上文降级模式。
- 工具：[`packages/kb/tool-kb`](../../packages/kb/tool-kb/README.zh.md) —— 模型可见的 `kb_search`（编号引用加降级说明）、`kb_ingest`（workspace `.md`/`.txt` 按文本、`.pdf`/`.docx` 经 unpdf/mammoth 解析）、`kb_ingest_url`（经可选 `ctx.web` 服务抓页面，带 SSRF 私网门）、`kb_stats`（覆盖情况、embed 路由可观测性与累计用量）——全部绑定部署租户。
- 示例：[`examples/kb-agent`](../../examples/kb-agent/README.zh.md) —— 脱敏食品行业语料上的可运行闭环，keyless 快照锁定其 text-only 模式。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxkb--kbruntime"></a>

### `ctx.kb` — `KbRuntime`

The knowledge-base service. Registered as `ctx.kb` (one instance per context).

Store selection (resolved at execution time, never order-dependent):

- A configured id that is registered and `available()` → that store.
- A configured id not registered → `KB_STORE_CONFIGURED_MISSING`.
- A configured id registered but unavailable → `KB_STORE_CONFIGURED_UNAVAILABLE`.
- No id configured, exactly one registered usable store → that store.
- No id configured, multiple usable stores → `KB_STORE_AMBIGUOUS`.
- No id configured, no usable store → `KB_STORE_UNAVAILABLE`.

Embed selection adds the degraded mode: an available provider participates in hybrid retrieval, while NO usable provider (never configured, or configured-but-unavailable, or registered-but-unavailable) degrades search to the text path with `mode: 'text'`. Only a configured id that is not registered at all throws (`KB_EMBED_CONFIGURED_MISSING`) — that is a composition error, not a runtime condition.

```ts cordis-catalog
/**
 * Register a store provider. Throws {@link KbError} `KB_DUPLICATE_PROVIDER`
 * if its id is already registered. Returns a disposer; disposed with the
 * calling fiber.
 * @param store - the store; its `id` is the registry key.
 * @returns the disposer that unregisters the store.
 */
registerStoreProvider(store: KbStore): () => void

/**
 * Register an embed provider. Throws {@link KbError}
 * `KB_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param provider - the embed provider; its `id` is the registry key.
 * @returns the disposer that unregisters the provider.
 */
registerEmbedProvider(provider: EmbedProvider): () => void

/**
 * Chunk and store one document, embedding chunks when a usable embed
 * provider exists. Re-ingesting the same `(tenantId, sourcePath)` replaces
 * the prior document.
 * @param request - document identity plus full content.
 * @param signal - cancellation signal forwarded to the embed provider and store.
 * @returns the store's ingest outcome (doc id, chunk count, embedded flag).
 */
async ingest(request: KbIngestRequest, signal?: AbortSignal): Promise<KbIngestResult>

/**
 * Run one hybrid retrieval: the text path always runs; the vector path adds
 * a second ranking when a usable embed provider exists, and the two fuse
 * through RRF. With no usable embed provider — or one that fails at runtime
 * on the query — the result is the text ranking alone with `mode: 'text'`
 * (a runtime failure logs a warning; ingest keeps failing loud on the same
 * fault so partial vectors never enter the store).
 * @param request - query, optional tenant/kind filters, optional result cap.
 * @param signal - cancellation signal forwarded to both paths.
 * @returns the fused (or text-only) hits with citation metadata; hits whose
 *   fused score falls below `minRelevanceScore` are dropped in both modes,
 *   so an unrelated query can resolve to zero results.
 */
async search(request: KbSearchRequest, signal?: AbortSignal): Promise<KbSearchResult>

/**
 * Read one tenant's cumulative usage counters through the resolved store.
 * @param tenantId - owning tenant.
 * @param signal - cancellation signal.
 * @returns the tenant's counters; all zeros when none were recorded.
 */
async usage(tenantId: string, signal?: AbortSignal): Promise<KbUsage>

/**
 * Report store counts plus embed-route observability for `kb_stats`.
 * @param tenantId - tenant filter; `undefined` counts across tenants.
 * @param signal - cancellation signal.
 * @returns store counts plus embed availability and identity.
 */
async stats(tenantId?: string, signal?: AbortSignal): Promise<KbStats>

/**
 * Delete one document by identity through the resolved store.
 * @param tenantId - owning tenant.
 * @param sourcePath - stable source identity.
 * @param signal - cancellation signal.
 * @returns whether a document was deleted.
 */
async deleteDocument(tenantId: string, sourcePath: string, signal?: AbortSignal): Promise<boolean>
```

Source: [`packages/kb/kb/src/index.ts`](../../packages/kb/kb/src/index.ts)

<a id="ctxkbgraph--kbgraphruntime"></a>

### `ctx.kbGraph` — `KbGraphRuntime`

The knowledge-graph service. Registered as `ctx.kbGraph` (one instance per context). Owns two registries: graph store providers and the ontology (node types and relations, seeded with the built-in three-layer model).

Store selection (resolved at execution time, never order-dependent):

- Exactly one registered usable store → that store.
- Multiple usable stores → `KB_GRAPH_STORE_AMBIGUOUS`.
- No usable store → `KB_GRAPH_STORE_UNAVAILABLE`.

```ts cordis-catalog
/**
 * Register a graph store provider. Throws {@link KbGraphError}
 * `KB_GRAPH_DUPLICATE_PROVIDER` if its id is already registered. Returns a
 * disposer; disposed with the calling fiber.
 * @param store - the store; its `id` is the registry key.
 * @returns the disposer that unregisters the store.
 */
registerStoreProvider(store: GraphStore): () => void

/**
 * Register one node type. The `extends` parent must already be registered;
 * a duplicate id refuses. Returns a disposer; disposed with the calling
 * fiber.
 * @param type - the node-type registration entry.
 * @returns the disposer that unregisters the type.
 */
registerNodeType(type: KgNodeType): () => void

/**
 * Register one relation. Every constraint endpoint and a declared
 * `inverseOf` must already be registered; a duplicate id refuses. Returns
 * a disposer; disposed with the calling fiber.
 * @param relation - the relation registration entry.
 * @returns the disposer that unregisters the relation.
 */
registerRelation(relation: KgRelation): () => void

/**
 * Look up one registered node type.
 * @param id - the registry key.
 * @returns the registered entry, or `undefined` when absent.
 */
nodeType(id: KgNodeTypeId): KgNodeType | undefined

/**
 * Look up one registered relation.
 * @param id - the registry key.
 * @returns the registered entry, or `undefined` when absent.
 */
relation(id: KgRelationId): KgRelation | undefined

/**
 * List registered node types, optionally narrowed to one layer, in
 * registration order (top layer first, then domain, then later plugins).
 * @param layer - optional layer filter.
 * @returns the matching registry entries.
 */
listNodeTypes(layer?: KgOntologyLayer): readonly KgNodeType[]

/**
 * List registered relations in registration order.
 * @returns the registry entries.
 */
listRelations(): readonly KgRelation[]

/**
 * Closed-set shape validation for one edge: unknown relation, unknown
 * endpoint types, and (for constrained relations) direction violations.
 * Unrestricted hierarchical relations accept any two registered endpoints.
 * @param relationId - the relation to check.
 * @param src - the subject node type.
 * @param dst - the object node type.
 * @returns the violations (empty when the edge shape is legal).
 */
validateEdge(relationId: KgRelationId, src: KgNodeTypeId, dst: KgNodeTypeId): KgShapeViolation[]

/**
 * Store triples idempotently under one tenant.
 * @param tenantId - owning tenant; the hard isolation key.
 * @param triples - the triples to store.
 * @param signal - cancellation signal forwarded to the store.
 * @returns how many triples were newly inserted.
 */
async putTriples( tenantId: string, triples: readonly KbGraphTriple[], signal?: AbortSignal, ): Promise<number>

/**
 * One-hop neighbors of one entity.
 * @param tenantId - owning tenant.
 * @param entity - the entity to expand.
 * @param signal - cancellation signal.
 * @returns the touching triples.
 */
async neighbors(tenantId: string, entity: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]>

/**
 * Two-hop paths between two entities.
 * @param tenantId - owning tenant.
 * @param entity - the path start.
 * @param target - the path end.
 * @param signal - cancellation signal.
 * @returns the triples of every matching path, deduplicated.
 */
async twoHopPaths(tenantId: string, entity: KbGraphEntity, target: KbGraphEntity, signal?: AbortSignal): Promise<KbGraphStoredTriple[]>

/**
 * Search entities by id substring and optional type.
 * @param tenantId - owning tenant.
 * @param query - case-insensitive substring of the entity id.
 * @param type - optional entity-type restriction.
 * @param limit - maximum entities to return; defaults to 10.
 * @param signal - cancellation signal.
 * @returns the matching entities.
 */
async searchEntities( tenantId: string, query: string, type?: KgNodeTypeId, limit?: number, signal?: AbortSignal, ): Promise<KbGraphEntity[]>

/**
 * Count stored triples and distinct entities.
 * @param tenantId - tenant filter; `undefined` counts across tenants.
 * @param signal - cancellation signal.
 * @returns the triple count and the distinct-entity count.
 */
async stats(tenantId?: string, signal?: AbortSignal): Promise<{ triples: number; entities: number }>

/**
 * Search nodes by name / natural-key substring — the name→id resolution
 * primitive behind seed lookup and entity alignment.
 * @param tenantId - owning tenant; the hard isolation key.
 * @param query - case-insensitive substring of the name or natural key.
 * @param type - optional node-type restriction.
 * @param k - maximum nodes to return; defaults to 10.
 * @returns the matching node hits.
 */
async searchNodes(tenantId: string, query: string, type?: KgNodeTypeId, k: number = 10): Promise<readonly KgNodeHit[]>

/**
 * Merge one node onto its anchors through the v2 store face.
 * @param node - the node to merge.
 * @returns whether an existing row was merged (false = fresh insert).
 */
async upsertNode(node: KgNode): Promise<{ merged: boolean }>

/**
 * Merge edges onto their seven-column anchors through the v2 store face.
 * @param edges - the edges to merge.
 * @returns how many edges were newly inserted.
 */
async upsertEdges(edges: readonly KgEdge[]): Promise<number>

/**
 * Read the k-hop neighborhood around seed nodes (undirected, cycle-safe).
 * @param tenantId - owning tenant; the hard isolation key.
 * @param seedIds - minted node ids the walk starts from.
 * @param hops - maximum walk depth; 0 returns just the seeds.
 * @param limits - optional size bounds; defaults apply.
 * @returns the subgraph with a truncation signal.
 */
async subgraph(tenantId: string, seedIds: readonly string[], hops: number, limits?: KgSubgraphLimits): Promise<KgSubgraph>

/**
 * Read the one-hop neighborhood of one node (the visualization
 * load-on-demand primitive).
 * @param tenantId - owning tenant.
 * @param nodeId - the minted node id to expand.
 * @param limit - maximum nodes returned.
 * @returns the one-hop subgraph.
 */
async expand(tenantId: string, nodeId: string, limit?: number): Promise<KgSubgraph>

/**
 * Tombstone every live edge one source currently asserts; parallel
 * assertions from other sources survive.
 * @param sourceSystem - the asserting system.
 * @param sourceId - the assertion address inside that system.
 * @param at - ISO timestamp written into `valid_until`.
 * @returns how many edges were tombstoned.
 */
async tombstoneBySource(sourceSystem: string, sourceId: string, at: string): Promise<number>

/**
 * Bind one alias for entity resolution; refuses an alias already bound to
 * a different node.
 * @param tenantId - owning tenant.
 * @param typeId - the node type the alias narrows within.
 * @param alias - the alias text.
 * @param nodeId - the minted node id the alias resolves to.
 */
async putAlias(tenantId: string, typeId: KgNodeTypeId, alias: string, nodeId: string): Promise<void>

/**
 * Advance (or create) one source-run watermark row.
 * @param run - the run snapshot to persist.
 */
async putSourceRun(run: KgSourceRun): Promise<void>

/**
 * Read one source-run watermark row.
 * @param sourceSystem - the asserting system.
 * @param scope - the collection/table/prefix scope.
 * @returns the stored run, or `undefined` when never run.
 */
async getSourceRun(sourceSystem: string, scope: string): Promise<KgSourceRun | undefined>

/**
 * Register one node type in the runtime registry AND persist it as a
 * registry row (the two-layer registry's write path). Idempotent per id:
 * an already-registered id skips the runtime registration and refreshes
 * only the persisted row.
 * @param type - the node-type registration entry.
 */
async persistNodeType(type: KgNodeType): Promise<void>

/**
 * Register one relation in the runtime registry AND persist it as a
 * registry row; see {@link persistNodeType}. Constraint endpoint types
 * persist first (the registry tables foreign-key them), as does a declared
 * inverse other than the relation itself.
 * @param relation - the relation registration entry.
 */
async persistRelation(relation: KgRelation): Promise<void>

/**
 * Read every persisted registry row (the two-layer registry's read path;
 * store providers re-register these at boot).
 * @returns the stored node types and relations.
 */
async storedRegistry(): Promise<{ nodeTypes: readonly KgNodeType[]; relations: readonly KgRelation[] }>
```

Source: [`packages/kb/kb-graph/src/index.ts`](../../packages/kb/kb-graph/src/index.ts)

<a id="ctxkgbuild--kgbuildruntime"></a>

### `ctx.kgBuild` — `KgBuildRuntime`

The pipeline service. One instance per context; `run()` executes one full pipeline pass (structured sources, then extraction) and resolves with the per-scope report. Fails loud on a missing seam: every enabled source requires its service at run time.

```ts cordis-catalog
/**
 * Execute one full pipeline pass: registry mapping + structured ingestion,
 * then corpus extraction, alignment, and watermark persistence.
 * @param options - cooperative cancellation.
 * @returns the per-scope run report.
 */
async run(options: RunOptions = {}): Promise<KgBuildRunReport>
```

Source: [`packages/kb/kg-build/src/index.ts`](../../packages/kb/kg-build/src/index.ts)
<!-- END GENERATED cordis-surface -->

## 可信数据空间衔接

每份入库文档可携带确权记录——数据提供方、授权范围、采集来源——以及由缝自行计算完整性事实：SHA-256 内容哈希与字符长度（确权三元组：哈希 + 长度 + 来源）。SQLite store 持久化它们（schema 版本 3）并在每次命中时返回，引用因此可以指名其提供方。

授权范围是闭集（`search` | `derive` | `share`），在两条检索路径上一致执行：`share` 文档对其他租户保持可检索（跨租户检索），而 `search` 与 `derive` 文档——以及一切未携带确权信息入库的历史文档——保持租户私有。这是可信数据空间政策链在仓库层的落点：数据二十条（数据产权三权分置）、"数据要素×"三年行动计划（产业链数据融通）、《可信数据空间发展行动计划（2024—2028 年）》（数据二十条 → 数据要素× → 可信数据空间）。派生工作产品与数据资产登记仍是消费侧流程；缝的义务是诚实的确权记录与遵守授权范围的过滤。
