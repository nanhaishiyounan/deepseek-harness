/**
 * NocoBase connector provider plugin: resolves the base url and API token
 * once at load (credentials seam first, then the trusted launch
 * environment), builds the REST client, and registers the provider on
 * `ctx.connector`. Missing credentials degrade the provider to unavailable —
 * discovery skips it and direct fetch fails loud — instead of failing the
 * composition; a changed key needs a composition reload (the registry's
 * availability gate is load-time by design, `available()` performs no I/O).
 * @module @deepseek-ai/dsh-connector-nocobase
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { NocoBaseClient, DEFAULT_NOCOBASE_TIMEOUT_MS } from './client.ts'
import { NocoBaseConnectorProvider } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'connector-nocobase'
/** Services required by the NocoBase provider (the credentials seam is optional). */
export const inject = ['connector']

export { NocoBaseClient, NocoBaseError, DEFAULT_NOCOBASE_TIMEOUT_MS, unwrapNbTitle } from './client.ts'
export type {
  NocoBaseAttachmentRow,
  NocoBaseClientOptions,
  NocoBaseCollectionMeta,
  NocoBaseFieldMeta,
  NocoBaseListOptions,
  NocoBaseListResult,
} from './client.ts'
export { clearSessionActingUser, sessionActingUserOf, setSessionActingUser } from './acting-user.ts'
export type { ActingUser } from './acting-user.ts'
export { compileNbFilter, describeNbFilterCondition, parseNbFilterCondition } from './filter.ts'
export type { NbFilterCondition, NbFilterConditionInput, NbFilterMatch, NbFilterOp } from './filter.ts'
export { NocoBaseConnectorProvider, NOCOBASE_PROVIDER_ID } from './provider.ts'
export type { NocoBaseDatasetRow, NocoBaseExpertRow, NocoBaseServiceRow, NocoBaseSourceRow } from './provider.ts'

/** Environment variable the base url falls back to when config omits it. */
export const NOCOBASE_BASE_URL_ENV = 'NOCOBASE_BASE_URL'

/** Default credential reference (environment-variable name) the token resolves through. */
export const DEFAULT_API_KEY_ENV = 'NOCOBASE_API_KEY'

/** Default page size for discovery lists. */
export const DEFAULT_LIST_PAGE_SIZE = 100

/** Default row cap for one tabular dataset fetch. */
export const DEFAULT_FETCH_ROWS_CAP = 1000

/** Plugin configuration. */
export interface Config {
  /**
   * NocoBase server origin (for example `http://127.0.0.1:13000`). Omitted =
   * the `NOCOBASE_BASE_URL` environment variable; neither present degrades
   * the provider to unavailable.
   */
  baseUrl?: string
  /** Credential reference (environment-variable name) the API token resolves through; defaults to `NOCOBASE_API_KEY`. */
  apiKeyEnv?: string
  /** Per-request timeout (ms); defaults to 15000. */
  timeoutMs?: number
  /** Discovery page size per collection; defaults to 100. */
  listPageSize?: number
  /** Row cap for one tabular dataset fetch; defaults to 1000. */
  fetchRowsCap?: number
}

export const Config: z<Config> = z.object({
  baseUrl: z.string(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_NOCOBASE_TIMEOUT_MS),
  listPageSize: z.number().step(1).min(1).default(DEFAULT_LIST_PAGE_SIZE),
  fetchRowsCap: z.number().step(1).min(1).default(DEFAULT_FETCH_ROWS_CAP),
})

/**
 * Resolve the base url and token, build the client, and register the
 * provider. Registration happens even without credentials — an unavailable
 * provider is the documented degraded mode.
 * @param ctx - context whose `connector` service receives the registration.
 * @param config - validated plugin configuration.
 */
/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

export async function apply(ctx: Context, config: Config): Promise<void> {
  // schemastery (the exported Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  const ambientBase = launchEnvironmentOf(ctx).get(NOCOBASE_BASE_URL_ENV)
  const ambientBaseUrl = ambientBase == null ? undefined : ambientBase.value
  const baseUrl = resolved.baseUrl || ambientBaseUrl || process.env[NOCOBASE_BASE_URL_ENV]
  const ref = credentialRef(resolved.apiKeyEnv)
  let token: string | undefined
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    token = (await credentials.resolve(ref))?.value
  } else {
    const ambient = launchEnvironmentOf(ctx).get(ref)
    token = (ambient == null ? undefined : ambient.value) ?? process.env[resolved.apiKeyEnv]
  }
  const usable = typeof baseUrl === 'string' && baseUrl.length > 0 && typeof token === 'string' && token.length > 0
  const provider = new NocoBaseConnectorProvider({
    // Without credentials the client is never exercised (available() gates
    // every seam entry point), so the placeholder origin keeps construction total.
    client: new NocoBaseClient({
      baseUrl: baseUrl && baseUrl.length > 0 ? baseUrl : 'http://nocobase.invalid',
      token: token && token.length > 0 ? token : '',
      timeoutMs: resolved.timeoutMs,
    }),
    available: usable,
    listPageSize: resolved.listPageSize,
    fetchRowsCap: resolved.fetchRowsCap,
  })
  const unregister = ctx.connector.registerProvider(provider)
  ctx.effect(() => unregister, 'connector-nocobase.provider')
}
