/**
 * @deepseek-ai/dsh-host-apiproxy — the API gateway every client shape shares:
 * the ApiProxy contract (api/: types + zod schemas, browser-safe), the fetch
 * carrier pair (fetch/: toFetchHandler on the host side, AbstractApiClient +
 * platform subclasses on the client side), and the host-side implementation
 * (api-proxy.ts: createApiProxy + the ApiProxyService gateway plugin providing
 * `ctx.apiProxy`). Transport-agnostic by design: this package registers no
 * routes — physical carriers wrap `ctx.apiProxy` themselves.
 *
 * The gateway consumes `ctx.agentDefaultModel`, the transport-independent default
 * shared with direct entry points. Switching models persists through that
 * service; sessions that have already logged a selection remain unchanged.
 */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type { ApiProxy } from './api/index.ts'
import { createApiProxy, DEFAULT_COLD_BLANK_PROBE_MAX_BYTES } from './api-proxy.ts'
import {
  DEFAULT_SESSION_LOG_COMPRESSION_LEVEL,
  type SessionLogCompressionLevel,
} from './session-export.ts'

export type * from './api/index.ts'
export { RpcId } from './api/rpc.ts'
export { toFetchHandler } from './fetch/handler.ts'
export { AbstractApiClient, InProcessApiClient } from './fetch/client.ts'
export type { IApiClient } from './fetch/client.ts'
export { createApiProxy } from './api-proxy.ts'
export type { ApiProxyDefaults } from './api-proxy.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The host-side ApiProxy implementation (the transport-agnostic gateway face). */
    apiProxy: ApiProxy
  }
}

/** Gateway plugin configuration. */
export interface Config {
  /**
   * Whether the unified data-upload surface (`data.upload`) answers.
   * Absent means refused: the gateway is unauthenticated, and a unified
   * upload writes into the kb or the lakehouse, so it needs an explicit
   * per-deployment opt-in independent of `kbWriteEnabled`.
   */
  dataUploadEnabled?: boolean
  /**
   * Whether the orders domain's write methods (`orders.create`,
   * `orders.fulfill`) answer. Absent means refused: an order is a real
   * transaction against a priced expert service, so the unauthenticated
   * gateway needs an explicit per-deployment opt-in; reads (get/list) and
   * the deliverable download stay open.
   */
  ordersEnabled?: boolean
  /**
   * Whether the nocobase domain's read methods (`nocobase.listMeta`,
   * `nocobase.list`, `nocobase.get`) answer. Absent means refused: business
   * reads run against the deployment's NocoBase under a service account, so
   * the unauthenticated gateway needs an explicit per-deployment opt-in.
   */
  nocobaseEnabled?: boolean
  /**
   * NocoBase server origin for the domain; omitted = the
   * `NOCOBASE_BASE_URL` environment variable.
   */
  nocobaseBaseUrl?: string
  /** Credential reference (environment-variable name) the API token resolves through; defaults to `NOCOBASE_API_KEY`. */
  nocobaseApiKeyEnv?: string
  /**
   * Whether the data-asset market domain (`assets.list/detail/stats`) answers;
   * absent means refused (the unauthenticated gateway opts in per deployment).
   */
  assetsEnabled?: boolean
  /** Market seed file (featured cards + board copy); absent means no featured rail. */
  assetsSeedPath?: string
  /**
   * Overview-home KPI seed file (id/label/unit/SQL definitions) evaluated
   * live against the lakehouse seam by `lakehouse.overview`; absent means
   * the read is refused.
   */
  lakehouseOverviewPath?: string
  /**
   * Whether the connector-page domain (`connectors.list/connections/transfers`)
   * answers; absent means refused, same stance as `assetsEnabled`.
   */
  connectorsEnabled?: boolean
  /**
   * Whether the business page's inline record write (`nocobase.update`) answers;
   * absent means every record change routes through the agent's nb_update
   * confirmation flow.
   */
  nocobaseWriteEnabled?: boolean
  /**
   * Per-username collection whitelists enforced server-side on
   * `nocobase.list/get/update` for signed-in callers (the docs deep-link
   * guard's server layer). A username absent from the table has no
   * configured scope; anonymous calls stay open.
   */
  nocobaseCollectionScopes?: Readonly<Record<string, readonly string[]>> | undefined
  /**
   * Per-username wfl_ collection whitelists for `nocobase.update` (engine
   * tables default to write-refused — their state machines own the
   * transitions; the alert flow rides `nocobase.alertAct`).
   */
  nocobaseWflWriteScopes?: Readonly<Record<string, readonly string[]>> | undefined
  /**
   * The alert engine's base URL `nocobase.alertAct` forwards to
   * (`POST /alerts/act`); omitted = the `W6_ALERT_ENGINE_URL` environment
   * variable, both absent = the method refuses `alert-engine-unconfigured`.
   */
  alertEngineUrl?: string | undefined
  /**
   * Whether the graph-page domain (`kg.schema/search/subgraph/expand/stats`)
   * answers; absent means refused, same stance as `assetsEnabled`.
   */
  kgEnabled?: boolean
  /**
   * The tenant the kg domain operates on — the deployment-side binding for
   * every graph read, mirroring `kbTenant`'s stance (never wire input).
   * Required when `kgEnabled` is true; a missing binding fails every kg
   * method with `kg-tenant-unbound`.
   */
  kgTenant?: string
  /**
   * The tenant the kb workbench domain operates on — the deployment-side
   * binding for stats/search/ingest, mirroring the `tool-kb` row's `tenant`.
   * Required: a missing binding fails load instead of silently landing on a
   * default tenant.
   */
  kbTenant: string
  /**
   * Whether the kb workbench's write methods (`kb.ingest`, `kb.ingestUrl`,
   * `kb.upload`) answer. Absent means read-only: the gateway is
   * unauthenticated, and `kb.ingest` reads whatever path it is handed, so
   * writes need an explicit per-deployment opt-in.
   */
  kbWriteEnabled?: boolean
  /**
   * Whether this deployment can hand paths to a native desktop opener —
   * the `hasDocument` capability the agent-preset roster reports. Absent,
   * the platform is asked (macOS/Windows/WSL yes; Linux only with a display
   * server); set it explicitly where detection misleads, e.g. `false` in a
   * container whose DISPLAY points nowhere a user can see.
   */
  nativeOpen?: boolean
  /**
   * DEFLATE level for every session-log ZIP entry: `0` stores without
   * compression, `1` favors CPU/latency, and `9` favors archive size.
   * @default 6
   */
  sessionExportCompressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
  /**
   * Maximum physical size of a cold Session artifact eligible for blankness
   * verification. Zero disables probes.
   * @default 1024
   */
  coldBlankProbeMaxBytes?: number
  /**
   * Per-apply timeout waiting for the browser to execute a view action before
   * the pending apply rejects with APPLY_TIMEOUT.
   * @default 30000
   */
  viewActionTimeoutMs?: number
}

/**
 * The API gateway service: implements the ApiProxy contract over the composed
 * host context and provides it as `ctx.apiProxy`. The Host cwd is the default
 * project directory.
 */
export class ApiProxyService extends Service implements ApiProxy {
  static inject = [
    'agentDefaultModel', 'agents', 'attachments', 'directoryPicker', 'llm', 'sessions', 'subagents', 'sessionQuery',
    'tools', 'userQuestions', 'workspaceRegistry',
  ]

  static Config: z<Config> = z.object({
    nativeOpen: z.boolean(),
    sessionExportCompressionLevel: z.number().step(1).min(0).max(9)
      .default(DEFAULT_SESSION_LOG_COMPRESSION_LEVEL) as z<SessionLogCompressionLevel>,
    coldBlankProbeMaxBytes: z.natural().default(DEFAULT_COLD_BLANK_PROBE_MAX_BYTES),
    kbTenant: z.string().required(),
    kbWriteEnabled: z.boolean(),
    dataUploadEnabled: z.boolean(),
    ordersEnabled: z.boolean(),
    nocobaseEnabled: z.boolean(),
    nocobaseWriteEnabled: z.boolean(),
    nocobaseCollectionScopes: z.dict(z.array(z.string())),
    nocobaseWflWriteScopes: z.dict(z.array(z.string())),
    alertEngineUrl: z.string(),
    nocobaseBaseUrl: z.string(),
    nocobaseApiKeyEnv: z.string().role('credential-ref'),
    assetsEnabled: z.boolean(),
    assetsSeedPath: z.string(),
    lakehouseOverviewPath: z.string(),
    connectorsEnabled: z.boolean(),
    kgEnabled: z.boolean(),
    kgTenant: z.string(),
    viewActionTimeoutMs: z.number().step(1).min(1000),
    // The dict row widens differently from Config's optional readonly map
    // under exactOptionalPropertyTypes; the parse contract is the object row.
  }) as unknown as z<Config>

  readonly sessions: ApiProxy['sessions']
  readonly subagents: ApiProxy['subagents']
  readonly workspace: ApiProxy['workspace']
  readonly host: ApiProxy['host']
  readonly goals: ApiProxy['goals']
  readonly skills: ApiProxy['skills']
  readonly agentPresets: ApiProxy['agentPresets']
  readonly settings: ApiProxy['settings']
  readonly credentials: ApiProxy['credentials']
  readonly llm: ApiProxy['llm']
  readonly data: ApiProxy['data']
  readonly orders: ApiProxy['orders']
  readonly nocobase: ApiProxy['nocobase']
  readonly assets: ApiProxy['assets']
  readonly lakehouse: ApiProxy['lakehouse']
  readonly connectors: ApiProxy['connectors']
  readonly kg: ApiProxy['kg']
  readonly kb: ApiProxy['kb']
  readonly events: ApiProxy['events']
  readonly downloads: ApiProxy['downloads']
  readonly respond: ApiProxy['respond']

  constructor(ctx: Context, config: Config) {
    super(ctx, 'apiProxy')
    const api = createApiProxy(ctx, {
      defaultModelSelection: () => ctx.agentDefaultModel.currentSelection(),
      saveDefaultModelSelection: selection => ctx.agentDefaultModel.saveSelection(selection),
      cwd: process.cwd(),
      kbTenant: config.kbTenant,
      ...config.kbWriteEnabled === undefined ? {} : { kbWriteEnabled: config.kbWriteEnabled },
      ...config.dataUploadEnabled === undefined ? {} : { dataUploadEnabled: config.dataUploadEnabled },
      ...config.ordersEnabled === undefined ? {} : { ordersEnabled: config.ordersEnabled },
      ...config.nocobaseEnabled === undefined ? {} : { nocobaseEnabled: config.nocobaseEnabled },
      ...config.nocobaseWriteEnabled === undefined ? {} : { nocobaseWriteEnabled: config.nocobaseWriteEnabled },
      ...config.nocobaseCollectionScopes === undefined ? {} : { nocobaseCollectionScopes: config.nocobaseCollectionScopes },
      ...config.nocobaseWflWriteScopes === undefined ? {} : { nocobaseWflWriteScopes: config.nocobaseWflWriteScopes },
      ...config.alertEngineUrl === undefined ? {} : { alertEngineUrl: config.alertEngineUrl },
      ...config.nocobaseBaseUrl === undefined ? {} : { nocobaseBaseUrl: config.nocobaseBaseUrl },
      ...config.nocobaseApiKeyEnv === undefined ? {} : { nocobaseApiKeyEnv: config.nocobaseApiKeyEnv },
      ...config.assetsEnabled === undefined ? {} : { assetsEnabled: config.assetsEnabled },
      ...config.assetsSeedPath === undefined ? {} : { assetsSeedPath: config.assetsSeedPath },
      ...config.lakehouseOverviewPath === undefined ? {} : { lakehouseOverviewPath: config.lakehouseOverviewPath },
      ...config.connectorsEnabled === undefined ? {} : { connectorsEnabled: config.connectorsEnabled },
      ...config.kgEnabled === undefined ? {} : { kgEnabled: config.kgEnabled },
      ...config.kgTenant === undefined ? {} : { kgTenant: config.kgTenant },
      ...config.nativeOpen === undefined ? {} : { canOpenPath: () => config.nativeOpen as boolean },
      ...(config.sessionExportCompressionLevel === undefined
        ? {}
        : { sessionExportCompressionLevel: config.sessionExportCompressionLevel }),
      ...(config.coldBlankProbeMaxBytes === undefined
        ? {}
        : { coldBlankProbeMaxBytes: config.coldBlankProbeMaxBytes }),
    })
    this.sessions = api.sessions
    this.subagents = api.subagents
    this.workspace = api.workspace
    this.host = api.host
    this.goals = api.goals
    this.skills = api.skills
    this.agentPresets = api.agentPresets
    this.settings = api.settings
    this.credentials = api.credentials
    this.llm = api.llm
    this.data = api.data
    this.orders = api.orders
    this.nocobase = api.nocobase
    this.assets = api.assets
    this.lakehouse = api.lakehouse
    this.connectors = api.connectors
    this.kg = api.kg
    this.kb = api.kb
    this.events = api.events
    this.downloads = api.downloads
    // createApiProxy returns closures (no `this` capture), so the bind is
    // behavior-neutral.
    this.respond = api.respond.bind(api)
  }
}

export default ApiProxyService
