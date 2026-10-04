/**
 * Model-facing NocoBase business tools: `nb_collections` (schema discovery),
 * `nb_list`/`nb_get` (reads), `nb_create`/`nb_update` (writes with the
 * in-conversation confirmation contract, the downstream approval gate, and
 * the edit lock), and `nb_approve` (the general approval engine driver). The
 * plugin resolves the deployment's service-account credentials once at load
 * (credentials seam first, then the trusted launch environment) and builds
 * one REST client every tool shares. Missing credentials register the tools
 * anyway — an enabled tool that fails with a structured error at execution
 * time is the suite's documented degraded mode — instead of failing the
 * composition; a changed key needs a composition reload. The tenant is never
 * model input: every tool rejects a `tenant` argument, and the service
 * account the client runs under is the permission boundary.
 * @module @deepseek-ai/dsh-tool-nocobase
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { NocoBaseClient, DEFAULT_NOCOBASE_TIMEOUT_MS } from '@deepseek-ai/dsh-connector-nocobase'
import { applyNbCollectionsTool, applyNbGetTool, applyNbListTool } from './read.ts'
import { applyNbApproveTool, applyNbCreateTool, applyNbUpdateTool } from './write.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'tool-nocobase'

/** Services required by the NocoBase tool suite (the credentials seam is optional). */
export const inject = ['tools', 'systemPrompt']

/** Environment variable the base url falls back to when config omits it. */
export const NOCOBASE_BASE_URL_ENV = 'NOCOBASE_BASE_URL'

/** Default credential reference (environment-variable name) the token resolves through. */
export const DEFAULT_API_KEY_ENV = 'NOCOBASE_API_KEY'

/** Default cooperative tool-call timeout budget (ms) for the read tools. */
export const DEFAULT_READ_TIMEOUT_MS = 10_000

/** Default cooperative tool-call timeout budget (ms) for the write tools (covers the get+write pair nb_update runs). */
export const DEFAULT_WRITE_TIMEOUT_MS = 60_000

export {
  compileFilter,
  describeFilterCondition,
  parseFilterCondition,
} from './filter.ts'
export type { NbFilterCondition, NbFilterMatch, NbFilterOp } from './filter.ts'
export {
  collectionCardsOf,
  formatNbCollectionsOutput,
  formatNbGetOutput,
  formatNbListOutput,
  NB_LIST_DEFAULT_PAGE_SIZE,
  NB_LIST_MAX_PAGE_SIZE,
  parseNbCollectionsArgs,
  parseNbGetArgs,
  parseNbListArgs,
} from './read.ts'
export type {
  CollectionCardView,
  NbCollectionsArgs,
  NbCollectionsMetaView,
  NbCollectionsToolValue,
  NbGetArgs,
  NbGetToolValue,
  NbListArgs,
  NbListToolValue,
  NbRow,
} from './read.ts'
export {
  ACTING_USER_COLUMNS,
  applyActingUserColumns,
  assertActingUserHoldsTodo,
  fieldChangesOf,
  formatNbApproveOutput,
  formatNbCreateOutput,
  formatNbUpdateOutput,
  nbApproveEngine,
  parseNbApproveArgs,
  parseNbCreateArgs,
  parseNbUpdateArgs,
} from './write.ts'
export type {
  FieldChangeView,
  NbApproveArgs,
  NbApproveToolValue,
  NbCreateArgs,
  NbCreateToolValue,
  NbUpdateArgs,
  NbUpdateToolValue,
} from './write.ts'
export {
  ADMISSION_EFFECTIVE_STATE,
  DEFAULT_AMOUNT_THRESHOLD,
  DOC_FLOW_VOCABULARY,
  DOC_STATUS_ANCHORS,
  EDIT_LOCKED_STATES,
  STATE_LABELS,
  SUPPLIER_ADMISSION_ANCHORS,
  SUPPLIER_ADMISSION_LABELS,
  SUPPLIER_ADMISSION_STATE_FIELD,
  SUPPLIER_ADMISSION_STATES,
  WORKFLOW_STATES,
  approversOfRole,
  conditionApplies,
  extendVocabulary,
  flowStateLabel,
  gateNotAdmittedMessage,
  gateNotEffectiveMessage,
  isEffectiveState,
  isSupplierAdmissionState,
  isWorkflowState,
  illegalTransitionMessage,
  nextAdmissionStateOf,
  nextStateOf,
  parseRequiredStatuses,
  thresholdOf,
  vocabularyForStateField,
} from './approval-rules.ts'
export type { ApprovalAction, FlowVocabulary, SupplierAdmissionState, ThresholdExtras, WorkflowState } from './approval-rules.ts'

/** Plugin config: which nb_* tools to register, the credential references, and per-tool budgets. */
export interface Config {
  /** Register `nb_collections`. Defaults to true. */
  collections?: boolean
  /** Register `nb_list`/`nb_get`. Defaults to true. */
  reads?: boolean
  /** Register `nb_create`/`nb_update`. Defaults to true. */
  writes?: boolean
  /** Register `nb_approve` (the approval engine driver). Defaults to true. */
  approvals?: boolean
  /**
   * NocoBase server origin (for example `http://127.0.0.1:13000`). Omitted =
   * the `NOCOBASE_BASE_URL` environment variable; neither present degrades
   * every tool to the structured no-credentials failure.
   */
  baseUrl?: string
  /** Credential reference (environment-variable name) the API token resolves through; defaults to `NOCOBASE_API_KEY`. */
  apiKeyEnv?: string
  /** Per-request REST timeout (ms); defaults to 15000. */
  timeoutMs?: number
  /** Cooperative timeout budget (ms) for the read tools; defaults to 10000. */
  readTimeoutMs?: number
  /** Cooperative timeout budget (ms) for the write tools; defaults to 60000. */
  writeTimeoutMs?: number
}

export const Config: z<Config> = z.object({
  collections: z.boolean().default(true),
  reads: z.boolean().default(true),
  writes: z.boolean().default(true),
  approvals: z.boolean().default(true),
  baseUrl: z.string(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_NOCOBASE_TIMEOUT_MS),
  readTimeoutMs: z.number().step(1).min(1).default(DEFAULT_READ_TIMEOUT_MS),
  writeTimeoutMs: z.number().step(1).min(1).default(DEFAULT_WRITE_TIMEOUT_MS),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * Resolve the service-account credentials and register the enabled nb_*
 * tools over one shared REST client. The tools register even without
 * credentials — the structured execution-time refusal is the documented
 * degraded mode.
 * @param ctx - context whose registries receive the registrations.
 * @param config - validated plugin configuration.
 */
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
  // Without credentials the client is never exercised (every tool's
  // no-credentials refusal gates the wire), so the placeholder origin keeps
  // construction total.
  const client = usable
    ? new NocoBaseClient({
      baseUrl: baseUrl && baseUrl.length > 0 ? baseUrl : 'http://nocobase.invalid',
      token: token && token.length > 0 ? token : '',
      timeoutMs: resolved.timeoutMs,
    })
    : undefined
  if (resolved.collections) {
    applyNbCollectionsTool(ctx, client, resolved.readTimeoutMs)
  }
  if (resolved.reads) {
    applyNbListTool(ctx, client, resolved.readTimeoutMs)
    applyNbGetTool(ctx, client, resolved.readTimeoutMs)
  }
  if (resolved.writes) {
    applyNbCreateTool(ctx, client, resolved.writeTimeoutMs)
    applyNbUpdateTool(ctx, client, resolved.writeTimeoutMs)
  }
  if (resolved.approvals) {
    applyNbApproveTool(ctx, client, resolved.writeTimeoutMs)
  }
}
