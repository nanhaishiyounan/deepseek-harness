/**
 * Carbon connector provider plugin (`ctx.carbon`): resolves the gateway url
 * and the GoTrue service-account credentials once at load (credentials seam
 * first, then the trusted launch environment, then process env), builds the
 * PostgREST session client, and registers the capability service. Missing
 * credentials degrade the service to unavailable — every method fails loud
 * with the structured no-credentials refusal — instead of failing the
 * composition; a changed key needs a composition reload.
 * @module @deepseek-ai/dsh-connector-carbon
 */

import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { CarbonClient, DEFAULT_CARBON_REFRESH_SKEW_MS, DEFAULT_CARBON_TIMEOUT_MS } from './client.ts'
import type { CarbonListOptions, CarbonSession } from './client.ts'
import { CARBON_MODULES, CARBON_TABLES, carbonTableOf } from './catalog.ts'
import type { CarbonTableMeta } from './catalog.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'connector-carbon'

/** No hard service requirements: the credentials seam is optional at load. */
export const inject: string[] = []

export {
  CarbonClient,
  CarbonError,
  compileCarbonFilter,
  DEFAULT_CARBON_REFRESH_SKEW_MS,
  DEFAULT_CARBON_TIMEOUT_MS,
  CARBON_LIST_MAX_LIMIT,
} from './client.ts'
export type {
  CarbonClientOptions,
  CarbonFilterCondition,
  CarbonListOptions,
  CarbonListResult,
  CarbonSession,
} from './client.ts'
export { CARBON_MODULES, CARBON_TABLES, carbonTableOf } from './catalog.ts'
export type { CarbonModuleId, CarbonTableMeta, CarbonTableRisk } from './catalog.ts'

/** Environment variables the gateway url and credentials fall back to when config omits them. */
export const CARBON_URL_ENV = 'CARBON_URL'
export const CARBON_ANON_KEY_ENV = 'CARBON_ANON_KEY'
export const CARBON_EMAIL_ENV = 'CARBON_EMAIL'
export const CARBON_PASSWORD_ENV = 'CARBON_PASSWORD'

/** Plugin configuration. */
export interface Config {
  /**
   * Carbon gateway origin (the kong API entrypoint, for example
   * `http://127.0.0.1:54321`). Omitted = the `CARBON_URL` environment
   * variable; neither present degrades the service to unavailable.
   */
  url?: string
  /** Credential reference (environment-variable name) the GoTrue anon key resolves through; defaults to `CARBON_ANON_KEY`. */
  anonKeyEnv?: string
  /** Credential reference (environment-variable name) the service-account email resolves through; defaults to `CARBON_EMAIL`. */
  emailEnv?: string
  /** Credential reference (environment-variable name) the service-account password resolves through; defaults to `CARBON_PASSWORD`. */
  passwordEnv?: string
  /**
   * Deployment-side tenant override: pins the companyId every insert
   * carries. Omitted = resolve once from the signed-in employee row (the
   * RLS WITH CHECK stays the enforcement floor either way).
   */
  companyId?: string
  /** Per-request timeout (ms); defaults to 15000. */
  timeoutMs?: number
  /** Refresh lead before JWT expiry (ms); defaults to 120000. */
  refreshSkewMs?: number
}

export const Config: z<Config> = z.object({
  url: z.string(),
  anonKeyEnv: z.string().role('credential-ref').default(CARBON_ANON_KEY_ENV),
  emailEnv: z.string().role('credential-ref').default(CARBON_EMAIL_ENV),
  passwordEnv: z.string().role('credential-ref').default(CARBON_PASSWORD_ENV),
  companyId: z.string(),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_CARBON_TIMEOUT_MS),
  refreshSkewMs: z.number().step(1).min(1).default(DEFAULT_CARBON_REFRESH_SKEW_MS),
})

/**
 * The carbon capability surface (`ctx.carbon`): the catalog projection plus
 * the table CRUD over the live session client. The service stays registered
 * without credentials; every data method then throws the structured
 * no-credentials refusal (the documented degraded mode).
 */
export class CarbonService extends Service {
  readonly client: CarbonClient | undefined

  /**
   * @param ctx - the owning context.
   * @param client - the session client, or `undefined` in the degraded mode.
   * @param companyId - the deployment-side tenant pin, when configured.
   */
  constructor(ctx: Context, client: CarbonClient | undefined, companyId?: string) {
    super(ctx, 'carbon')
    this.client = client
    if (client !== undefined && companyId !== undefined) client.pinCompanyId(companyId)
  }

  /** The credential-backed usability check; `false` in the degraded mode. */
  available(): boolean {
    return this.client !== undefined
  }

  /** The live session (authenticating on demand); refused in the degraded mode. */
  async session(signal?: AbortSignal): Promise<CarbonSession> {
    return await this.requireClient().ensureSession(signal)
  }

  /** The business-table catalog projection (module groups in navigation order). */
  catalog(): { modules: readonly { id: string; label: string }[]; tables: readonly CarbonTableMeta[] } {
    return { modules: CARBON_MODULES, tables: CARBON_TABLES }
  }

  /**
   * Query one catalog table's rows.
   * @param table - the camelCase table name (must be on the catalog).
   * @param options - filters, ordering, paging.
   * @param signal - caller cancellation.
   */
  async list(
    table: string,
    options: CarbonListOptions = {},
    signal?: AbortSignal,
  ): Promise<{ count: number; rows: Record<string, unknown>[] }> {
    const meta = requireTable(table)
    const result = await this.requireClient().list<Record<string, unknown>>(table, {
      ...options,
      order: options.order ?? [...meta.order],
    }, signal)
    return { count: result.count, rows: result.rows }
  }

  /**
   * Read one catalog row by its key column value (the composite-key stock
   * table addresses by `itemId`; every other table by its prefixed `id`).
   * @param table - the camelCase table name (must be on the catalog).
   * @param id - the row key (`item_WgSb…`, or an itemId for the stock table).
   * @param signal - caller cancellation.
   */
  async get(table: string, id: string, signal?: AbortSignal): Promise<Record<string, unknown> | undefined> {
    const meta = requireTable(table)
    const client = this.requireClient()
    if (meta.idColumn === 'id') return await client.get<Record<string, unknown>>(table, id, signal)
    const result = await client.list<Record<string, unknown>>(table, { filter: [{ field: meta.idColumn, op: 'eq', value: id }], limit: 1 }, signal)
    return result.rows[0]
  }

  /**
   * Insert one row into a `write`-risk catalog table (read-tier tables
   * refuse: postings like stock movements belong to composite
   * server-functions with no Data API surface).
   * @param table - the camelCase table name (must be on the catalog at write risk).
   * @param values - the row's column values (companyId injected when absent).
   * @param signal - caller cancellation.
   */
  async create(table: string, values: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const meta = requireTable(table)
    if (meta.risk !== 'write') {
      throw new Error(`carbon: table ${table} is read-tier (${meta.label}); writes stay on the carbon UI or the composite posting API`)
    }
    return await this.requireClient().create<Record<string, unknown>>(table, values, signal)
  }

  /**
   * Patch one row of a `write`-risk catalog table.
   * @param table - the camelCase table name (must be on the catalog at write risk).
   * @param id - the row id.
   * @param values - the columns to change.
   * @param signal - caller cancellation.
   */
  async update(table: string, id: string, values: Record<string, unknown>, signal?: AbortSignal): Promise<Record<string, unknown>> {
    const meta = requireTable(table)
    if (meta.risk !== 'write') {
      throw new Error(`carbon: table ${table} is read-tier (${meta.label}); writes stay on the carbon UI or the composite posting API`)
    }
    return await this.requireClient().update<Record<string, unknown>>(table, id, values, signal)
  }

  /** The structured no-credentials refusal text. */
  static readonly NO_CREDENTIALS = 'carbon: this deployment resolves no carbon credentials (CARBON_URL/CARBON_ANON_KEY/CARBON_EMAIL/CARBON_PASSWORD); the carbon capability is unavailable'

  /** Narrow to the live client or throw the degraded-mode refusal. */
  private requireClient(): CarbonClient {
    if (this.client === undefined) throw new Error(CarbonService.NO_CREDENTIALS)
    return this.client
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** The carbon business capability surface (this plugin's Service). */
    carbon: CarbonService
  }
}

/**
 * Resolve the gateway url and service-account credentials, build the client,
 * and register `ctx.carbon`. Registration happens even without credentials —
 * an unavailable service is the documented degraded mode.
 * @param ctx - context whose `carbon` service this registers.
 * @param config - validated plugin configuration.
 */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const launch = launchEnvironmentOf(ctx)
  const ambient = (key: string): string | undefined => {
    const entry = launch.get(key)
    return (entry == null ? undefined : entry.value) ?? process.env[key]
  }
  const url = config.url || ambient(CARBON_URL_ENV)
  const credentials = ctx.get('credentials')
  const resolve = async (ref: string): Promise<string | undefined> => {
    if (credentials !== undefined) {
      const value = await credentials.resolve(credentialRef(ref))
      return value?.value
    }
    return ambient(ref)
  }
  const [anonKey, email, password] = await Promise.all([
    resolve(config.anonKeyEnv ?? CARBON_ANON_KEY_ENV),
    resolve(config.emailEnv ?? CARBON_EMAIL_ENV),
    resolve(config.passwordEnv ?? CARBON_PASSWORD_ENV),
  ])
  const resolved: readonly string[] = [url, anonKey, email, password].map(value => value ?? '')
  const usable = [url, anonKey, email, password].every(value => typeof value === 'string' && value.length > 0)
  const pick = (index: number): string => resolved[index] ?? ''
  const client = usable
    ? new CarbonClient({
      baseUrl: pick(0),
      anonKey: pick(1),
      email: pick(2),
      password: pick(3),
      ...config.timeoutMs === undefined ? {} : { timeoutMs: config.timeoutMs },
      ...config.refreshSkewMs === undefined ? {} : { refreshSkewMs: config.refreshSkewMs },
    })
    : undefined
  // Service construction registers it (`super(ctx, 'carbon')` provides the
  // ctx.carbon accessor); context disposal carries the service away.
  new CarbonService(ctx, client, config.companyId)
}

/** Validate one table name against the catalog or throw. */
function requireTable(table: string): CarbonTableMeta {
  const meta = carbonTableOf(table)
  if (meta === undefined) {
    throw new Error(`carbon: table ${table} is not on the business catalog (see CARBON_TABLES)`)
  }
  return meta
}
