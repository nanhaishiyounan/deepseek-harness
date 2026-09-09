/**
 * Service Definition for the connector capability seam (`ctx.connector`):
 * the provider registry, discover/fetch routing, and the transfer
 * orchestration — pull → classify (the lakehouse seam's shared data router
 * for file bytes, kind-driven otherwise) → route → deliver (kb ingest or
 * lakehouse load) → confirm (catalog transfer record). Every step fails loud
 * with a machine-readable code; both landing seams are overwrite-shaped, so a
 * retried transfer converges instead of leaving partial work.
 * @module @deepseek-ai/dsh-connector
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { DataRouterError, resolveDataRoute } from '@deepseek-ai/dsh-lakehouse/data-router'
import type { DataRoute } from '@deepseek-ai/dsh-lakehouse/data-router'
import { parseCsvTabular, parseJsonTabular, parseXlsxTabular, tableNameFromFilename } from '@deepseek-ai/dsh-lakehouse/tabular'
import type { XlsxWorkbookLike } from '@deepseek-ai/dsh-lakehouse/tabular'
import type { TabularData } from '@deepseek-ai/dsh-lakehouse'
import type {} from '@deepseek-ai/dsh-lakehouse'
import type { KbIngestRequest } from '@deepseek-ai/dsh-kb'
import type {} from '@deepseek-ai/dsh-kb'
import { ConnectorError } from './types.ts'
import type {
  ConnectorDataset,
  ConnectorDatasetRef,
  ConnectorDatasetSummary,
  ConnectorDiscoverRequest,
  ConnectorKbLanding,
  ConnectorProvider,
  ConnectorProviderView,
  ConnectorTransferRequest,
  ConnectorTransferResult,
  ConnectorTransferTarget,
  TabularDelivery,
} from './types.ts'

export { CONNECTOR_CAPABILITIES, CONNECTOR_DATASET_KINDS, CONNECTOR_SCOPES, ConnectorError } from './types.ts'
export type {
  ConnectorCapability,
  ConnectorDataset,
  ConnectorDatasetKind,
  ConnectorDatasetRef,
  ConnectorDatasetSummary,
  ConnectorDiscoverRequest,
  ConnectorDocumentContent,
  ConnectorExpertDetail,
  ConnectorFileContent,
  ConnectorKbLanding,
  ConnectorManifest,
  ConnectorProvider,
  ConnectorProviderView,
  ConnectorScope,
  ConnectorTransferRequest,
  ConnectorTransferResult,
  ConnectorTransferTarget,
  ExpertServiceRef,
  TabularDelivery,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    connector: ConnectorRuntime
  }
}

/** Source-path namespace for kb landings of file-kind datasets. */
const FILE_SOURCE_ROOT = 'workspace/data/connectors'

/** Table-name characters that survive the lakehouse's SQL-identifier rule. */
const TABLE_NAME_FORBIDDEN = /[^A-Za-z0-9_]/gu

/**
 * The connector service. Registered as `ctx.connector` (one instance per
 * context). Discover fans out to every available provider declaring the
 * capability and skips unavailable ones (the documented degraded mode — a
 * missing credential must not fail the providers that work); fetch resolves
 * exactly one provider and fails loud when it is missing, unavailable, or
 * lacks the capability.
 */
export class ConnectorRuntime extends Service {
  static Config = z.object({})

  private readonly providers = new Map<string, ConnectorProvider>()

  constructor(ctx: Context) {
    super(ctx, 'connector')
  }

  /**
   * Register a connector provider. Throws {@link ConnectorError}
   * `CONNECTOR_DUPLICATE_PROVIDER` if its id is already registered. Returns a
   * disposer; disposed with the calling fiber.
   * @param provider - the connector provider; its `id` is the registry key.
   * @returns the disposer that unregisters the provider.
   */
  registerProvider(provider: ConnectorProvider): () => void {
    if (this.providers.has(provider.id)) {
      throw new ConnectorError(`connector provider "${provider.id}" is already registered`, 'CONNECTOR_DUPLICATE_PROVIDER')
    }
    this.providers.set(provider.id, provider)
    const dispose = this.ctx.effect(() => () => {
      this.providers.delete(provider.id)
    }, 'connector.registerProvider()')
    return () => void dispose()
  }

  /**
   * Registered provider ids in registration order, for observability surfaces.
   * @returns the registered provider ids.
   */
  providerIds(): readonly string[] {
    return [...this.providers.keys()]
  }

  /**
   * Every registered provider with its live availability and declared
   * capabilities, for connector-catalog surfaces (the connector page). A
   * provider absent from this list is not registered; an unavailable one
   * carries its credentials-missing state rather than being hidden.
   * @returns provider views ordered by id.
   */
  describeProviders(): readonly ConnectorProviderView[] {
    return [...this.providers.values()]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(provider => ({ id: provider.id, available: provider.available(), capabilities: provider.capabilities }))
  }

  /** Reject an already-aborted signal before any provider work. */
  private throwIfAborted(signal: AbortSignal | undefined): void {
    // An aborted AbortSignal always carries a reason per the WHATWG standard.
    /* v8 ignore next 2 */
    if (signal?.aborted) throw signal.reason ?? new DOMException('The operation was aborted', 'AbortError')
  }

  /** Resolve one provider by id or throw the matching {@link ConnectorError}. */
  private resolveProvider(providerId: string): ConnectorProvider {
    const provider = this.providers.get(providerId)
    if (provider === undefined) {
      throw new ConnectorError(
        `connector provider "${providerId}" is not registered (registered: ${[...this.providers.keys()].join(', ') || 'none'})`,
        'CONNECTOR_PROVIDER_MISSING',
      )
    }
    return provider
  }

  /** Throw unless the provider is usable and declares the capability. */
  private assertUsable(provider: ConnectorProvider, capability: 'discover' | 'fetch'): void {
    if (!provider.available()) {
      throw new ConnectorError(
        `connector provider "${provider.id}" is registered but unavailable (missing credentials or disabled upstream)`,
        'CONNECTOR_PROVIDER_UNAVAILABLE',
      )
    }
    if (!provider.capabilities.includes(capability)) {
      throw new ConnectorError(
        `connector provider "${provider.id}" does not declare the "${capability}" capability`,
        'CONNECTOR_CAPABILITY_MISSING',
      )
    }
  }

  /**
   * List datasets across every available provider declaring `discover`.
   * Unavailable providers are skipped (degraded, not failed); an available
   * provider that errors mid-discover fails the whole call loud.
   * @param request - query text and optional kind restriction.
   * @param signal - cancellation signal forwarded to every provider.
   * @returns merged summaries, ordered by provider id then dataset id.
   */
  async discover(request: ConnectorDiscoverRequest, signal?: AbortSignal): Promise<readonly ConnectorDatasetSummary[]> {
    this.throwIfAborted(signal)
    const merged: ConnectorDatasetSummary[] = []
    for (const provider of [...this.providers.values()].sort((a, b) => a.id.localeCompare(b.id))) {
      if (!provider.available() || !provider.capabilities.includes('discover')) continue
      const summaries = await provider.discover(request, signal)
      merged.push(...summaries)
    }
    return merged
  }

  /**
   * Pull one dataset's full content packet from its provider.
   * @param ref - the dataset address.
   * @param signal - cancellation signal forwarded to the provider.
   * @returns the unified dataset packet.
   */
  async fetch(ref: ConnectorDatasetRef, signal?: AbortSignal): Promise<ConnectorDataset> {
    this.throwIfAborted(signal)
    const provider = this.resolveProvider(ref.providerId)
    this.assertUsable(provider, 'fetch')
    return provider.fetch(ref, signal)
  }

  /**
   * Run the five-step transfer: pull the dataset, classify its destination
   * (kind-driven; file bytes go through the shared data router so connector
   * transfers and workbench uploads route by one truth), deliver to the kb
   * (`ingest`, overwrite-shaped) or the lakehouse (`load`, overwrite-shaped),
   * and confirm by appending the catalog transfer record. Usage metering rides
   * the destination seams (a load counts `loadedTables`, an ingest counts
   * `ingestedDocuments`). Both landings are idempotent under retry, so a
   * confirm failure retries the same transfer safely.
   * @param request - source address, owning tenant, and target pin.
   * @param signal - cancellation signal honored across every step.
   * @returns the landing receipt and the catalog transfer-record id.
   */
  async transfer(request: ConnectorTransferRequest, signal?: AbortSignal): Promise<ConnectorTransferResult> {
    this.throwIfAborted(signal)
    assertTenantId(request.tenantId)
    // 1. pull
    const dataset = await this.fetch({ providerId: request.providerId, datasetId: request.datasetId }, signal)
    // 2. classify (and check the target pin against the classified destination)
    const delivery = await classifyForDelivery(dataset, request.tenantId, request.target)
    // 3. route + 4. deliver
    const landing = delivery.destination === 'lakehouse'
      ? await this.deliverToLakehouse(request.providerId, delivery, signal)
      : await this.deliverToKb(request.providerId, dataset, delivery, signal)
    // 5. confirm — transfer records live in the lakehouse catalog regardless of destination
    const lakehouse = this.ctx.get('lakehouse')
    if (lakehouse === undefined) {
      throw new ConnectorError(
        `transfer of "${request.datasetId}" landed in ${delivery.destination} but no lakehouse seam is composed to confirm it; `
        + 'add the dsh-lakehouse seam and a catalog store, then retry the transfer (both landings are overwrite-shaped)',
        'CONNECTOR_LAKEHOUSE_MISSING',
      )
    }
    let transferRecordId: number
    try {
      ;({ transferId: transferRecordId } = await lakehouse.recordTransfer({
        source: request.providerId,
        destination: delivery.destination,
        datasetId: request.datasetId,
        rows: landing.rows,
        transferredAt: new Date().toISOString(),
      }, signal))
    } catch (error: unknown) {
      throw new ConnectorError(
        `transfer of "${request.datasetId}" landed in ${delivery.destination} `
        + `(${landing.summary}) but recording the catalog transfer failed: ${error instanceof Error ? error.message : String(error)}; `
        + 'retry the transfer — both landings are overwrite-shaped, so the retry converges',
        'CONNECTOR_CONFIRM_FAILED',
        error instanceof Error ? error : undefined,
      )
    }
    return {
      datasetId: request.datasetId,
      datasetKind: dataset.kind,
      destination: delivery.destination,
      rows: landing.rows,
      replaced: landing.replaced,
      ...(landing.destination === 'lakehouse' ? { table: landing.table } : {}),
      ...(landing.document === undefined ? {} : { document: landing.document }),
      transferRecordId,
    }
  }

  /**
   * Deliver one tabular payload through the lakehouse seam.
   * @param providerId - source provider, carried into the provenance triple.
   * @param delivery - the resolved lakehouse delivery.
   * @param signal - cancellation signal.
   */
  private async deliverToLakehouse(providerId: string, delivery: TabularDelivery & { destination: 'lakehouse' }, signal: AbortSignal | undefined): Promise<Landing> {
    const lakehouse = this.ctx.get('lakehouse')
    if (lakehouse === undefined) {
      throw new ConnectorError(
        'this deployment composes no lakehouse; add the dsh-lakehouse seam, a catalog store, and a query engine',
        'CONNECTOR_LAKEHOUSE_MISSING',
      )
    }
    const loaded = await lakehouse.load({
      tenantId: delivery.tenantId,
      tableName: delivery.tableName,
      tabular: delivery.tabular,
      provenance: { provider: `connector:${providerId}`, collectedSource: delivery.datasetId },
    }, signal)
    return {
      destination: 'lakehouse',
      rows: loaded.table.rowCount,
      replaced: loaded.replaced,
      table: loaded.table.tableName,
      summary: `table ${loaded.table.tableName} (${loaded.table.rowCount} rows)`,
    }
  }

  /**
   * Deliver one document payload through the kb seam.
   * @param providerId - source provider, carried into the provenance triple.
   * @param dataset - the pulled dataset (document and expert-profile kinds).
   * @param delivery - the resolved kb delivery.
   * @param signal - cancellation signal.
   */
  private async deliverToKb(
    providerId: string,
    dataset: ConnectorDataset,
    delivery: TabularDelivery & { destination: 'kb' },
    signal: AbortSignal | undefined,
  ): Promise<Landing> {
    const kb = this.ctx.get('kb')
    if (kb === undefined) {
      throw new ConnectorError(
        'this deployment composes no knowledge base; add the dsh-kb seam and a store provider',
        'CONNECTOR_KB_MISSING',
      )
    }
    const ingest: KbIngestRequest = {
      ...delivery.ingest,
      provenance: {
        provider: `connector:${providerId}`,
        collectedSource: dataset.id,
        ...(dataset.manifest.scope === undefined ? {} : { scope: dataset.manifest.scope }),
      },
    }
    const stored = await kb.ingest(ingest, signal)
    const document: ConnectorKbLanding = { docId: stored.docId, chunks: stored.chunks, embedded: stored.embedded }
    return {
      destination: 'kb',
      rows: 1,
      replaced: false,
      document,
      summary: `document ${stored.docId} (${stored.chunks} chunks)`,
    }
  }
}

/** One landing outcome, before the catalog confirm. */
interface Landing {
  readonly destination: 'kb' | 'lakehouse'
  readonly rows: number
  readonly replaced: boolean
  readonly table?: string
  readonly document?: ConnectorKbLanding
  /** Human-readable landing summary carried into confirm-failure diagnostics. */
  readonly summary: string
}

/** A tenant slug must not traverse landing paths when joined into one. */
const TENANT_FORBIDDEN = /[\\/]|\.\./u

function assertTenantId(tenantId: string): void {
  if (tenantId.length === 0 || TENANT_FORBIDDEN.test(tenantId)) {
    throw new ConnectorError(
      'tenant id must be non-empty and free of path separators and ".."',
      'CONNECTOR_INVALID_TENANT',
    )
  }
}

/** Dataset ids fold into table names by replacing forbidden characters, keeping kind prefixes readable. */
function tableNameFromDatasetId(datasetId: string): string {
  return tableNameFromFilename(datasetId.replaceAll('/', '_'))
}

/** Wrap one data-router refusal in the connector error taxonomy. */
function routeError(error: DataRouterError): ConnectorError {
  const code = `CONNECTOR_ROUTE_${error.reason.replaceAll('-', '_').toUpperCase()}`
  return new ConnectorError(error.message, code, error)
}

/** Load one xlsx workbook through exceljs; the import stays inside the call so composition startup never pays for the reader. */
async function loadXlsxWorkbook(data: Buffer): Promise<XlsxWorkbookLike> {
  const { Workbook } = await import('exceljs')
  const workbook = new Workbook()
  // The parameter cast bridges exceljs's own Buffer declaration to Node's —
  // the bytes are the same memory.
  await workbook.xlsx.load(data as unknown as ArrayBuffer)
  return workbook
}

/** Decode file bytes as strict UTF-8; invalid encodings refuse instead of storing replacement characters. */
function decodeUtf8(filename: string, bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error: unknown) {
    /* v8 ignore next 6 -- TextDecoder always throws TypeError; the String/cause arms total the catch. */
    throw new ConnectorError(
      `"${filename}" is not valid UTF-8 text; the kb landing path stores decoded text only (${error instanceof Error ? error.message : String(error)})`,
      'CONNECTOR_ROUTE_NOT_UTF8',
      error instanceof Error ? error : undefined,
    )
  }
}

/**
 * Classify one dataset into a delivery: tabular content lands in the
 * lakehouse, document and expert-profile content lands in the kb, file bytes
 * route through the shared data router (csv/xlsx/json → lakehouse, md/txt →
 * kb), and service content carries no data payload to land. A pinned target
 * that disagrees with the classified destination refuses loud.
 * @param dataset - the pulled dataset packet.
 * @param tenantId - tenant that owns the landed data.
 * @param target - `auto` follows classification; `kb`/`lakehouse` pin it.
 * @returns the resolved delivery for the destination seams.
 */
async function classifyForDelivery(dataset: ConnectorDataset, tenantId: string, target: ConnectorTransferTarget): Promise<TabularDelivery> {
  let delivery: TabularDelivery
  switch (dataset.kind) {
    case 'tabular':
      delivery = {
        destination: 'lakehouse',
        datasetId: dataset.id,
        tenantId,
        tableName: dataset.tableName ?? tableNameFromDatasetId(dataset.id),
        tabular: dataset.tabular,
      }
      break
    case 'document':
    case 'expert-profile':
      delivery = {
        destination: 'kb',
        datasetId: dataset.id,
        tenantId,
        ingest: { tenantId, ...dataset.ingest },
      }
      break
    case 'file': {
      const { filename, bytes, mime } = dataset.file
      let route: ReturnType<typeof resolveDataRoute>
      try {
        route = resolveDataRoute(filename, bytes, mime)
      } catch (error: unknown) {
        // resolveDataRoute throws only DataRouterError; the instanceof arm is
        // the only live path and the rethrow totals the catch for typing.
        /* v8 ignore start */
        if (error instanceof DataRouterError) throw routeError(error)
        throw error
        /* v8 ignore stop */
      }
      delivery = route.destination === 'lakehouse'
        ? {
          destination: 'lakehouse',
          datasetId: dataset.id,
          tenantId,
          tableName: tableNameFromFilename(filename),
          tabular: await tabularOfRoute(requireStructuredFormat(route, filename), filename, bytes),
        }
        : {
          destination: 'kb',
          datasetId: dataset.id,
          tenantId,
          ingest: {
            tenantId,
            sourcePath: `${FILE_SOURCE_ROOT}/${sanitizePathSegment(dataset.manifest.providerId)}/${filename}`,
            title: dataset.title,
            docKind: 'other',
            content: documentTextOfRoute(route.extension, filename, bytes),
          },
        }
      break
    }
    case 'service':
      throw new ConnectorError(
        `dataset "${dataset.id}" is a service offering with no data payload; discover lists it for expert answers, and ordering (a later batch) consumes its serviceId`,
        'CONNECTOR_TRANSFER_UNSUPPORTED_KIND',
      )
    /* v8 ignore next 2 -- the closed union above is exhaustive; the default totals the switch. */
    default:
      assertNeverDatasetKind(dataset)
  }
  if (target !== 'auto' && target !== delivery.destination) {
    throw new ConnectorError(
      `dataset "${dataset.id}" classifies to ${delivery.destination} but the transfer pinned target "${target}"; use target "auto" or pin the classified destination`,
      'CONNECTOR_TRANSFER_TARGET_MISMATCH',
    )
  }
  return delivery
}

/** Assert the dataset-kind union is closed. */
/* v8 ignore next 3 -- reachable only by widening the union without updating this switch. */
function assertNeverDatasetKind(dataset: never): never {
  throw new ConnectorError(`unknown dataset kind ${(dataset as ConnectorDataset).kind}`, 'CONNECTOR_TRANSFER_UNSUPPORTED_KIND')
}

/** Narrow one lakehouse route to its structured format; unreachable for router output, kept total for the type. */
/* v8 ignore next 3 */
function requireStructuredFormat(route: DataRoute, filename: string): 'csv' | 'xlsx' | 'json' {
  if (route.format === undefined) throw new ConnectorError(`"${filename}" routed to the lakehouse without a structured format`, 'CONNECTOR_ROUTE_UNSUPPORTED_TYPE')
  return route.format
}

/** Parse routed file bytes into the tabular vocabulary by structured format. */
async function tabularOfRoute(format: 'csv' | 'xlsx' | 'json', filename: string, bytes: Uint8Array): Promise<TabularData> {
  if (format === 'csv') return parseCsvTabular(decodeUtf8(filename, bytes))
  if (format === 'json') return parseJsonTabular(decodeUtf8(filename, bytes))
  return parseXlsxTabular(bytes, loadXlsxWorkbook)
}

/** Decode routed file bytes into kb document text by document extension. */
function documentTextOfRoute(extension: string | undefined, filename: string, bytes: Uint8Array): string {
  if (extension === '.md' || extension === '.txt') return decodeUtf8(filename, bytes)
  throw new ConnectorError(
    /* v8 ignore next 1 -- every kb route carries its extension; the arm totals the interpolation. */
    `"${filename}" routed to the kb as ${extension ?? 'an unrecognized document'}, but the connector transfer path decodes .md and .txt only; `
    + 'the workbench upload channel owns pdf/docx extraction today',
    'CONNECTOR_FILE_HANDLER_MISSING',
  )
}

/** Path segments must stay inside the connector namespace when joined. */
function sanitizePathSegment(segment: string): string {
  const cleaned = segment.replaceAll(TABLE_NAME_FORBIDDEN, '_')
  // A registered provider id is non-empty, so the cleaned segment never
  // collapses; the fallback only totals the function for hostile reuse.
  /* v8 ignore next 2 */
  return cleaned.length > 0 ? cleaned : 'provider'
}

export default ConnectorRuntime
