/**
 * Vocabulary for the connector capability seam (`ctx.connector`): the
 * `ConnectorProvider` contract, the `ConnectorDataset` unified content packet,
 * discover/fetch requests, and the transfer request/result pair behind the
 * seam's five-step orchestration.
 * @module @deepseek-ai/dsh-connector/types
 */

import { HarnessError } from '@deepseek-ai/dsh-llm'
import type { TabularData } from '@deepseek-ai/dsh-lakehouse'
import type { KbDocKind, KbIngestRequest } from '@deepseek-ai/dsh-kb'

/**
 * Closed union of provider capabilities, declared at startup. `discover` lists
 * datasets, `fetch` pulls one dataset's content, `transfer` marks a provider
 * able to receive landed data (no provider declares it yet; the seam owns the
 * N3 transfer orchestration).
 */
export type ConnectorCapability = 'discover' | 'fetch' | 'transfer'

/** Every member of {@link ConnectorCapability}, for boundary validation loops. */
export const CONNECTOR_CAPABILITIES: readonly ConnectorCapability[] = ['discover', 'fetch', 'transfer']

/**
 * Closed union of dataset content kinds. `tabular` carries parsed rows,
 * `file` carries raw bytes classified at transfer time through the shared
 * data router, `document`/`expert-profile` carry kb-ingest-shaped text,
 * `service` names a serviceable offering with no data payload. Consumers
 * `switch` on the value ending in `assertNever`.
 */
export type ConnectorDatasetKind = 'tabular' | 'file' | 'document' | 'expert-profile' | 'service'

/** Every member of {@link ConnectorDatasetKind}, for boundary validation loops. */
export const CONNECTOR_DATASET_KINDS: readonly ConnectorDatasetKind[] = [
  'tabular',
  'file',
  'document',
  'expert-profile',
  'service',
]

/**
 * Closed union of authorization scopes, isomorphic to the kb and lakehouse
 * seam scope unions: `search` keeps landed data inside its own tenant, `derive`
 * additionally allows derived work products inside the tenant, `share` lets
 * other tenants query it too.
 */
export type ConnectorScope = 'search' | 'derive' | 'share'

/** Every member of {@link ConnectorScope}, for boundary validation loops. */
export const CONNECTOR_SCOPES: readonly ConnectorScope[] = ['search', 'derive', 'share']

/**
 * Manifest metadata every dataset carries: where it came from, how fresh it
 * is, and how far transferred copies may spread.
 */
export interface ConnectorManifest {
  /** Owning provider id (matches the registered provider's `id`). */
  readonly providerId: string
  /** ISO-8601 timestamp of the source record's last update, when known. */
  readonly updatedAt?: string
  /** Authorization scope transferred copies inherit; defaults to `search`. */
  readonly scope?: ConnectorScope
  /** One-line human-facing description of the dataset. */
  readonly description?: string
}

/**
 * Document-shaped content, isomorphic to the kb seam's ingest input minus the
 * tenant binding (the transfer request carries the tenant).
 */
export interface ConnectorDocumentContent {
  /** Stable source identity used in citations and overwrite matching. */
  readonly sourcePath: string
  readonly title?: string
  readonly docKind: KbDocKind
  /** Collection date (ISO-8601) for recency disambiguation. */
  readonly collectedAt?: string
  /** Full UTF-8 document text. */
  readonly content: string
}

/**
 * Raw file content. Transfer classifies it through the lakehouse seam's
 * shared data router (extension whitelist → mime fallback → magic number),
 * so connector transfers and workbench uploads route by one truth.
 */
export interface ConnectorFileContent {
  /** File name; only its extension and bytes matter to routing. */
  readonly filename: string
  readonly bytes: Uint8Array
  /** Declared content type, consulted when the extension is outside the whitelist. */
  readonly mime?: string
}

/**
 * One serviceable expert offering. The reference is citation-shaped on
 * purpose: discovery shows it, ordering (a later batch) consumes
 * `serviceId`, and no data payload lands in the kb or lakehouse.
 */
export interface ExpertServiceRef {
  /** Source-stable service identity. */
  readonly serviceId: string
  /** Owning expert's dataset id within the same provider, when known. */
  readonly expertId?: string
  /** Human-facing service name (for example「中亚货运动线方案」). */
  readonly name: string
  /** Deliverable form (for example `PDF 方案`). */
  readonly deliverable?: string
  /** Pricing line for the offering (for example `¥8,800/份`), when published. */
  readonly price?: string
  /** One-line summary of what the service covers. */
  readonly summary?: string
}

/**
 * Structured expert-card fields an expert-profile listing entry carries
 * beyond its title: the affiliation and the domain tags the card renders.
 */
export interface ConnectorExpertDetail {
  /** Affiliation line (for example「漯河市电子商务协会（会长）」). */
  readonly org?: string
  /** Domain tags, already split from the source's tag string. */
  readonly domains: readonly string[]
}

/** Fields every dataset carries regardless of content kind. */
interface ConnectorDatasetBase {
  /** Dataset identity within its provider; unique per provider. */
  readonly id: string
  /** Human-facing dataset title. */
  readonly title: string
  readonly manifest: ConnectorManifest
}

/**
 * The unified dataset packet: one content discriminant keyed by `kind`.
 * `tabular` content may carry a `tableName` hint — the provider-owned,
 * already-sanitized lakehouse table name for transfers (explicit at the
 * package boundary; without it the seam derives a plain SQL identifier from
 * the dataset id).
 */
export type ConnectorDataset =
  | (ConnectorDatasetBase & { readonly kind: 'tabular'; readonly tabular: TabularData; readonly tableName?: string })
  | (ConnectorDatasetBase & { readonly kind: 'file'; readonly file: ConnectorFileContent })
  | (ConnectorDatasetBase & { readonly kind: 'document' | 'expert-profile'; readonly ingest: ConnectorDocumentContent })
  | (ConnectorDatasetBase & { readonly kind: 'service'; readonly service: ExpertServiceRef })

/** One dataset listing entry — discover output without content. */
export interface ConnectorDatasetSummary {
  /** Dataset identity within its provider. */
  readonly id: string
  readonly title: string
  readonly kind: ConnectorDatasetKind
  readonly manifest: ConnectorManifest
  /** Present on expert-profile entries: the structured card fields. */
  readonly expert?: ConnectorExpertDetail
  /** Present on service entries: the full service reference for card assembly. */
  readonly service?: ExpertServiceRef
}

/** One registered provider's observability projection: identity plus live availability. */
export interface ConnectorProviderView {
  /** Stable string, unique among registered providers. */
  readonly id: string
  /** The provider's cheap local usability check (credential presence). */
  readonly available: boolean
  /** Capabilities declared at startup. */
  readonly capabilities: readonly ConnectorCapability[]
}

/** One discover request fanned out to every usable provider. */
export interface ConnectorDiscoverRequest {
  /** Free-text query; providers match it against their own searchable fields. */
  readonly query?: string
  /** Restrict results to these content kinds. */
  readonly kinds?: readonly ConnectorDatasetKind[]
}

/** One dataset address across the seam. */
export interface ConnectorDatasetRef {
  readonly providerId: string
  readonly datasetId: string
}

/**
 * Typed connector error with a machine-routable, open-string `code` and
 * chained `cause`. Shared codes cover duplicate registration, provider
 * selection (missing, unavailable, capability-absent), routing refusals
 * (mirroring the data router's reasons), target disagreement, absent file
 * handlers, absent destination seams, and confirm failures.
 */
export class ConnectorError extends HarnessError {}

/**
 * A connector provider — the seam's Service Provider role. Registered with
 * `ctx.connector.registerProvider`; an unavailable provider (for example a
 * missing credential) is skipped by discover and fails loud on direct fetch
 * (the documented degraded mode).
 */
export interface ConnectorProvider {
  /** Stable string, unique among registered providers. */
  readonly id: string
  /** Cheap local usability check (credential presence); must not perform I/O. */
  available(): boolean
  /** Capabilities declared at startup; the seam refuses calls outside them. */
  readonly capabilities: readonly ConnectorCapability[]
  /**
   * List datasets matching the request.
   * @param request - query text and optional kind restriction.
   * @param signal - cancellation signal honored across provider I/O.
   */
  discover(request: ConnectorDiscoverRequest, signal?: AbortSignal): Promise<readonly ConnectorDatasetSummary[]>
  /**
   * Pull one dataset's full content packet.
   * @param ref - the dataset address; `providerId` names this provider.
   * @param signal - cancellation signal honored across provider I/O.
   */
  fetch(ref: ConnectorDatasetRef, signal?: AbortSignal): Promise<ConnectorDataset>
}

/** Where a transfer lands: the classified destination, or an explicit pin. */
export type ConnectorTransferTarget = 'auto' | 'kb' | 'lakehouse'

/**
 * One resolved delivery — the classify step's output. The lakehouse arm
 * carries the parsed tabular payload and its table identity; the kb arm
 * carries a complete ingest request (tenant included).
 */
export type TabularDelivery =
  | {
    readonly destination: 'lakehouse'
    readonly datasetId: string
    readonly tenantId: string
    /** Lakehouse table identity for the load (a plain SQL identifier). */
    readonly tableName: string
    readonly tabular: TabularData
  }
  | {
    readonly destination: 'kb'
    readonly datasetId: string
    readonly tenantId: string
    readonly ingest: KbIngestRequest
  }

/** One transfer request through the seam's five-step orchestration. */
export interface ConnectorTransferRequest {
  /** Source provider id. */
  readonly providerId: string
  /** Dataset identity within the provider. */
  readonly datasetId: string
  /** Tenant that owns the landed data (the hard isolation key downstream). */
  readonly tenantId: string
  /** `auto` follows the classified destination; `kb`/`lakehouse` pin it and disagreements refuse. */
  readonly target: ConnectorTransferTarget
}

/** Landing summary of the stored document on kb destinations. */
export interface ConnectorKbLanding {
  readonly docId: number
  readonly chunks: number
  readonly embedded: boolean
}

/** One completed transfer: where the dataset landed and the confirm trail. */
export interface ConnectorTransferResult {
  readonly datasetId: string
  readonly datasetKind: ConnectorDatasetKind
  readonly destination: 'kb' | 'lakehouse'
  /** Landed rows (a kb landing counts its one document). */
  readonly rows: number
  /**
   * True when the same lakehouse table identity already held a prior
   * registration; kb landings always read false (the kb seam does not
   * surface replacement — re-ingesting the same source path replaces).
   */
  readonly replaced: boolean
  /** Lakehouse table name, present on lakehouse destinations. */
  readonly table?: string
  /** Stored document summary, present on kb destinations. */
  readonly document?: ConnectorKbLanding
  /** Catalog transfer-record id (the confirm step's receipt). */
  readonly transferRecordId: number
}
