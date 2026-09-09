/**
 * NocoBase connector provider: maps three collections onto connector
 * datasets — `experts` rows become expert-profile datasets (kb-landing
 * profile documents), `datasets` rows become tabular datasets (rows pulled
 * from the source collection the row names) or document datasets by the
 * row's own kind, and `expert_services` rows become service datasets for
 * discovery and later ordering. Credentials resolve once at plugin load;
 * their absence degrades the provider to unavailable instead of failing the
 * composition.
 * @module @deepseek-ai/dsh-connector-nocobase/provider
 */

import { ConnectorError } from '@deepseek-ai/dsh-connector'
import type { ConnectorDataset, ConnectorDatasetKind, ConnectorDatasetRef, ConnectorDatasetSummary, ConnectorDiscoverRequest, ConnectorExpertDetail, ConnectorProvider, ExpertServiceRef } from '@deepseek-ai/dsh-connector'
import { parseJsonTabular } from '@deepseek-ai/dsh-lakehouse/tabular'
import type { TabularData } from '@deepseek-ai/dsh-lakehouse'
import { NocoBaseError } from './client.ts'
import type { NocoBaseClient } from './client.ts'

/** Provider id, also the provenance namespace (`connector:connector-nocobase`). */
export const NOCOBASE_PROVIDER_ID = 'connector-nocobase'

/** One `experts` row as NocoBase stores it (N4 seeds the real profile). */
export interface NocoBaseExpertRow {
  readonly id: number
  readonly name: string
  readonly org?: string
  readonly domains?: string
  readonly bio?: string
  readonly updatedAt?: string
}

/** One `datasets` row: kind discriminates tabular (source collection) from document (inline text). */
export interface NocoBaseDatasetRow {
  readonly id: number
  readonly kind: 'tabular' | 'document'
  readonly title: string
  /** Tabular datasets: the source collection rows are pulled from. */
  readonly collection?: string
  /** Tabular datasets: the sanitized lakehouse table-name hint. */
  readonly tableName?: string
  /** Document datasets: the full document text. */
  readonly content?: string
  readonly updatedAt?: string
}

/** One `expert_services` row. */
export interface NocoBaseServiceRow {
  readonly id: number
  readonly expertId?: number
  readonly name: string
  readonly deliverable?: string
  /** Pricing line (for example `¥8,800/份`), when published. */
  readonly price?: string
  readonly summary?: string
  readonly updatedAt?: string
}

/** One generic source-collection row (tabular dataset content). */
export type NocoBaseSourceRow = Record<string, null | boolean | number | string | object>

/** Collections the provider reads, with their dataset kind and searchable fields. */
const COLLECTIONS: ReadonlyArray<{
  readonly name: string
  readonly kind: ConnectorDatasetKind
  readonly searchable: readonly string[]
  readonly titleField: string
  readonly descriptionFields: readonly string[]
}> = [
  // Market-asset rows carry their own summary plus the catalog metadata
  // fields (domain/source/pricing) the batch-5 seeder lands; search matches
  // them all so the catalog filter reaches domain labels.
  { name: 'datasets', kind: 'tabular', searchable: ['title', 'domain', 'source', 'summary'], titleField: 'title', descriptionFields: ['summary'] },
  { name: 'expert_services', kind: 'service', searchable: ['name', 'summary'], titleField: 'name', descriptionFields: ['deliverable', 'summary'] },
  { name: 'experts', kind: 'expert-profile', searchable: ['name', 'org', 'domains', 'bio'], titleField: 'name', descriptionFields: ['org', 'domains'] },
]

/** Dataset ids are `<collection>/<row id>`. */
function datasetId(collection: string, rowId: number | string): string {
  return `${collection}/${rowId}`
}

/** Split a dataset id back into its collection and row id, refusing foreign shapes. */
function splitDatasetId(datasetId: string): { collection: string; rowId: string } {
  const slash = datasetId.indexOf('/')
  if (slash <= 0 || slash === datasetId.length - 1 || datasetId.indexOf('/', slash + 1) !== -1) {
    throw new ConnectorError(
      `dataset id "${datasetId}" is not a "<collection>/<id>" address this provider issued`,
      'CONNECTOR_DATASET_MISSING',
    )
  }
  return { collection: datasetId.slice(0, slash), rowId: datasetId.slice(slash + 1) }
}

/** True when the collection belongs to this provider's mapping. */
function isKnownCollection(collection: string): boolean {
  return COLLECTIONS.some(entry => entry.name === collection)
}

/** Translate one NocoBase failure into the connector taxonomy; a 404 read is a missing dataset. */
function translate(error: unknown): never {
  if (error instanceof NocoBaseError && error.status === 404) {
    throw new ConnectorError(error.message, 'CONNECTOR_DATASET_MISSING', error)
  }
  throw error
}

/** Flatten one source-row value to the JSON-scalar vocabulary (nested values read back as JSON text). */
function scalarOf(value: null | boolean | number | string | object): null | boolean | number | string {
  if (value === null || typeof value !== 'object') return value
  return JSON.stringify(value)
}

/** Convert source-collection rows to tabular data through the shared row-array parser. */
function tabularOfRows(rows: readonly NocoBaseSourceRow[]): TabularData {
  const flattened = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, scalarOf(value)])))
  return parseJsonTabular(JSON.stringify(flattened))
}

/** Split a source domain tag string (comma-separated) into display tags. */
function domainsOf(raw: string | undefined): readonly string[] {
  if (raw === undefined) return []
  return raw.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0)
}

/** Assemble one expert_services row into the seam's service reference. */
function serviceRefOf(row: NocoBaseServiceRow): ExpertServiceRef {
  return {
    serviceId: datasetId('expert_services', row.id),
    ...(row.expertId === undefined ? {} : { expertId: datasetId('experts', row.expertId) }),
    name: row.name,
    ...(row.deliverable === undefined ? {} : { deliverable: row.deliverable }),
    ...(row.price === undefined ? {} : { price: row.price }),
    ...(row.summary === undefined ? {} : { summary: row.summary }),
  }
}

/** Read one row field as display text; anything but non-empty text falls back to the address. */
function textOf(value: NocoBaseSourceRow[string] | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

/**
 * One description cell as display text: the comma-separated domain tag
 * string becomes interpunct-separated labels; anything but non-empty text
 * drops out of the description.
 */
function descriptionTextOf(field: string, value: NocoBaseSourceRow[string] | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  return field === 'domains' ? domainsOf(value).join(' · ') : value
}

/** The NocoBase connector provider. */
export class NocoBaseConnectorProvider implements ConnectorProvider {
  readonly id = NOCOBASE_PROVIDER_ID
  readonly capabilities = ['discover', 'fetch'] as const
  private readonly client: NocoBaseClient
  private readonly usable: boolean
  private readonly listPageSize: number
  private readonly fetchRowsCap: number

  constructor(options: {
    client: NocoBaseClient
    available: boolean
    listPageSize: number
    fetchRowsCap: number
  }) {
    this.client = options.client
    this.usable = options.available
    this.listPageSize = options.listPageSize
    this.fetchRowsCap = options.fetchRowsCap
  }

  available(): boolean {
    return this.usable
  }

  /**
   * List every mapped collection the request admits, translating query text
   * into NocoBase `$includes` filters over each collection's searchable
   * fields and honoring the kind restriction.
   * @param request - query text and optional kind restriction.
   * @param signal - cancellation signal forwarded to every list call.
   */
  async discover(request: ConnectorDiscoverRequest, signal?: AbortSignal): Promise<readonly ConnectorDatasetSummary[]> {
    const summaries: ConnectorDatasetSummary[] = []
    for (const entry of COLLECTIONS) {
      if (!collectionMatchesKinds(entry, request.kinds)) continue
      const filter = request.query === undefined
        ? undefined
        : { $or: entry.searchable.map(field => ({ [field]: { $includes: request.query } })) }
      const listOptions = { ...(filter === undefined ? {} : { filter }), page: 1, pageSize: this.listPageSize }
      const { rows } = await this.client.list<NocoBaseSourceRow>(entry.name, listOptions, signal)
      for (const row of rows) {
        const kind = datasetKindOf(entry.name, row)
        /* v8 ignore next 2 -- only a NocoBase kind outside the closed union lands here; discovery skips it. */
        if (kind === undefined) continue
        if (request.kinds !== undefined && !request.kinds.includes(kind)) continue
        const fallbackId = datasetId(entry.name, row.id as number)
        const card = cardDetailOf(entry.name, row)
        summaries.push({
          id: fallbackId,
          title: textOf(row[entry.titleField], fallbackId),
          kind,
          manifest: {
            providerId: this.id,
            ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
            ...(entry.descriptionFields.length === 0
              ? {}
              : {
                description: entry.descriptionFields
                  .map(field => descriptionTextOf(field, row[field]))
                  .filter(isText)
                  .join(' · '),
              }),
          },
          ...(card === undefined ? {} : card),
        })
      }
    }
    return summaries
  }

  /**
   * Pull one dataset's content packet by its `<collection>/<id>` address.
   * @param ref - the dataset address.
   * @param signal - cancellation signal forwarded to every call.
   */
  async fetch(ref: ConnectorDatasetRef, signal?: AbortSignal): Promise<ConnectorDataset> {
    if (!this.usable) {
      throw new ConnectorError('connector provider "connector-nocobase" is unavailable (no base url or API key resolved)', 'CONNECTOR_PROVIDER_UNAVAILABLE')
    }
    const { collection, rowId } = splitDatasetId(ref.datasetId)
    if (!isKnownCollection(collection)) {
      throw new ConnectorError(`collection "${collection}" is not mapped by this provider`, 'CONNECTOR_DATASET_MISSING')
    }
    if (collection === 'experts') return this.fetchExpert(rowId, signal)
    if (collection === 'expert_services') return this.fetchService(rowId, signal)
    return this.fetchDataset(rowId, signal)
  }

  /**
   * Read one source row, refusing the v2 wire's `{data: null}` (a missing
   * row) as the provider's missing-dataset error.
   */
  private async requireRow<Row>(collection: string, rowId: string, signal?: AbortSignal): Promise<Row> {
    const row = await this.client.get<Row>(collection, rowId, undefined, signal).catch(translate)
    if (row === undefined) {
      throw new ConnectorError(`no row ${rowId} exists in collection "${collection}"`, 'CONNECTOR_DATASET_MISSING')
    }
    return row
  }

  /** Assemble one expert profile as a kb-landing markdown document with the expert's service catalog. */
  private async fetchExpert(rowId: string, signal?: AbortSignal): Promise<ConnectorDataset> {
    const row = await this.requireRow<NocoBaseExpertRow>('experts', rowId, signal)
    const lines = [`# ${row.name}`]
    if (row.org !== undefined) lines.push(`- 机构：${row.org}`)
    const domains = domainsOf(row.domains)
    if (domains.length > 0) lines.push(`- 领域：${domains.join(' · ')}`)
    if (row.bio !== undefined) lines.push('', row.bio)
    const { rows: services } = await this.client
      .list<NocoBaseServiceRow>('expert_services', { filter: { expertId: { $eq: row.id } }, page: 1, pageSize: this.fetchRowsCap }, signal)
      .catch(translate)
    if (services.length > 0) {
      lines.push('', '## 可服务项（可下单）')
      for (const service of services) {
        const spec = [service.deliverable, service.price].filter(part => part !== undefined && part.length > 0).join('，')
        lines.push(`- ${service.name}${spec.length === 0 ? '' : `（${spec}）`}${service.summary === undefined ? '' : `：${service.summary}`}`)
      }
    }
    return {
      kind: 'expert-profile',
      id: datasetId('experts', row.id),
      title: row.name,
      manifest: {
        providerId: this.id,
        ...(row.updatedAt === undefined ? {} : { updatedAt: row.updatedAt }),
        ...(row.domains === undefined ? {} : { description: row.domains }),
      },
      ingest: {
        sourcePath: `workspace/data/connectors/connector-nocobase/experts/${row.id}.md`,
        title: row.name,
        docKind: 'profile',
        content: `${lines.join('\n')}\n`,
      },
    }
  }

  /** Pull one datasets row: tabular source collection or inline document. */
  private async fetchDataset(rowId: string, signal?: AbortSignal): Promise<ConnectorDataset> {
    const row = await this.requireRow<NocoBaseDatasetRow>('datasets', rowId, signal)
    if (row.kind === 'document') {
      return {
        kind: 'document',
        id: datasetId('datasets', row.id),
        title: row.title,
        manifest: { providerId: this.id, ...(row.updatedAt === undefined ? {} : { updatedAt: row.updatedAt }) },
        ingest: {
          sourcePath: `workspace/data/connectors/connector-nocobase/datasets/${row.id}.md`,
          title: row.title,
          docKind: 'other',
          content: row.content ?? '',
        },
      }
    }
    const source = row.collection
    if (source === undefined) {
      throw new ConnectorError(`tabular dataset "${row.id}" names no source collection`, 'CONNECTOR_DATASET_MISSING')
    }
    const { rows } = await this.client
      .list<NocoBaseSourceRow>(source, { page: 1, pageSize: this.fetchRowsCap }, signal)
      .catch(translate)
    return {
      kind: 'tabular',
      id: datasetId('datasets', row.id),
      title: row.title,
      manifest: { providerId: this.id, ...(row.updatedAt === undefined ? {} : { updatedAt: row.updatedAt }) },
      tableName: row.tableName ?? source,
      tabular: tabularOfRows(rows),
    }
  }

  /** Read one expert_services row as a service dataset. */
  private async fetchService(rowId: string, signal?: AbortSignal): Promise<ConnectorDataset> {
    const row = await this.requireRow<NocoBaseServiceRow>('expert_services', rowId, signal)
    return {
      kind: 'service',
      id: datasetId('expert_services', row.id),
      title: row.name,
      manifest: {
        providerId: this.id,
        ...(row.updatedAt === undefined ? {} : { updatedAt: row.updatedAt }),
        ...(row.summary === undefined ? {} : { description: row.summary }),
      },
      service: serviceRefOf(row),
    }
  }
}

/** Resolve one listed row's dataset kind; `datasets` rows carry their own, unknown values skip. */
function datasetKindOf(collection: string, row: NocoBaseSourceRow): ConnectorDatasetKind | undefined {
  const entry = COLLECTIONS.find(item => item.name === collection)
  /* v8 ignore next 2 -- only mapped collections call here; the guard totals the helper. */
  if (entry === undefined) return undefined
  if (collection !== 'datasets') return entry.kind
  const kind = row.kind
  /* v8 ignore next 1 -- the undefined arm totals the ternary for kinds outside the union. */
  return kind === 'tabular' || kind === 'document' ? kind : undefined
}

/** True when one string-valued cell is usable display text. */
function isText(value: NocoBaseSourceRow[string] | undefined): value is string {
  return typeof value === 'string' && value.length > 0
}

/**
 * Assemble the kind-specific card detail a discover summary carries: the
 * expert-card fields on experts rows and the full service reference on
 * expert_services rows; every other collection carries none.
 * @param collection - the listed collection's name.
 * @param row - the listed row.
 * @returns the card field(s), or `undefined` when the collection carries none.
 */
function cardDetailOf(
  collection: string,
  row: NocoBaseSourceRow,
): { expert?: ConnectorExpertDetail; service?: ExpertServiceRef } | undefined {
  if (collection === 'experts') {
    // Source cells stay opaque until this boundary; only string cells become card fields.
    const domains = typeof row.domains === 'string' ? domainsOf(row.domains) : []
    const org = typeof row.org === 'string' && row.org.length > 0 ? row.org : undefined
    return org === undefined && domains.length === 0 ? undefined : { expert: { ...(org === undefined ? {} : { org }), domains } }
  }
  if (collection === 'expert_services') {
    return { service: serviceRefOf(row as unknown as NocoBaseServiceRow) }
  }
  return undefined
}

/** True when the collection can answer the request's kind restriction (datasets split across two kinds; rows filter by their own kind). */
function collectionMatchesKinds(entry: (typeof COLLECTIONS)[number], kinds: readonly ConnectorDatasetKind[] | undefined): boolean {
  if (kinds === undefined) return true
  if (kinds.includes(entry.kind)) return true
  return entry.name === 'datasets' && (kinds.includes('tabular') || kinds.includes('document'))
}
