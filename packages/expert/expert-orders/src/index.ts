/**
 * @deepseek-ai/dsh-expert-orders — the expert-service order lifecycle over
 * the NocoBase source of truth (`orders` rows; a deployment without NocoBase
 * resolves no client and every call fails loud). Creation resolves the
 * ordered service and snapshots identity and pricing; fulfillment runs the
 * deliverable pipeline — kb-referenced model drafting (or the named template
 * fallback when no draft key resolves), expert-pdf typesetting, the real PDF
 * landing under the configured deliverables directory, and status write-back
 * through the order state machine (`pending → generating → delivered`, with
 * `failed` recording the cause and retrying). Consumed by the order tools
 * (`tool-connector`) and the gateway's orders domain (`host/apiproxy`).
 * @module @deepseek-ai/dsh-expert-orders
 */

import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { NocoBaseClient, DEFAULT_NOCOBASE_TIMEOUT_MS } from '@deepseek-ai/dsh-connector-nocobase'
import type { NocoBaseExpertRow, NocoBaseServiceRow } from '@deepseek-ai/dsh-connector-nocobase'
import { renderPdf } from '@deepseek-ai/dsh-expert-pdf'
import type { DraftSpec } from '@deepseek-ai/dsh-expert-pdf'
import { BlockAssembler, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import { buildDraftMessages, parseDraftResponse, templateDraftSpec, TEMPLATE_FALLBACK_NOTE } from './draft.ts'
import type { DraftingInput } from './draft.ts'
import { assertOrderStatus, canTransition } from './state-machine.ts'
import { OrdersError } from './types.ts'
import type { OrderCreateRequest, OrderDeliverableFile, OrderRecord, OrdersSeam } from './types.ts'

export { ORDER_STATUSES, assertOrderStatus, canTransition } from './state-machine.ts'
export { buildDraftMessages, parseDraftResponse, templateDraftSpec, TEMPLATE_FALLBACK_NOTE } from './draft.ts'
export type { DraftExpertInput, DraftMessages, DraftResponseBody, DraftServiceInput, DraftingInput } from './draft.ts'
export { OrdersError } from './types.ts'
export type { OrderCreateRequest, OrderDeliverableFile, OrderRecord, OrderStatus, OrdersSeam } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    orders: OrdersRuntime
  }
}

/** Environment variable the NocoBase base url falls back to when config omits it. */
const NOCOBASE_BASE_URL_ENV = 'NOCOBASE_BASE_URL'

/** Default credential reference for the NocoBase token. */
const DEFAULT_API_KEY_ENV = 'NOCOBASE_API_KEY'

/** Default credential reference the draft model key resolves through. */
const DEFAULT_DRAFT_API_KEY_ENV = 'MINIMAX_API_KEY'

/** Default draft model route (MiniMax-M3, the composition's chat route). */
const DEFAULT_DRAFT_PROVIDER = 'minimax'
const DEFAULT_DRAFT_MODEL = 'MiniMax-M3'

/** Default draft output-token budget. */
const DEFAULT_DRAFT_MAX_TOKENS = 4096

/** Default draft call deadline (ms), sized under the order_create tool budget. */
const DEFAULT_DRAFT_TIMEOUT_MS = 55_000

/** Default workspace-relative directory deliverables land under. */
const DEFAULT_DELIVERABLES_DIR = 'workspace/deliverables'

/** kb reference lines retrieved per fulfill run. */
const REF_HITS = 5

/** Plugin configuration. */
export interface Config {
  /** NocoBase server origin; omitted = the `NOCOBASE_BASE_URL` environment variable. */
  baseUrl?: string
  /** Credential reference for the NocoBase token; defaults to `NOCOBASE_API_KEY`. */
  apiKeyEnv?: string
  /** kb tenant binding for reference retrieval (the deployment's shared tenant). */
  tenant: string
  /** Credential reference the draft model key resolves through; defaults to `MINIMAX_API_KEY`. Unresolved = the named template fallback. */
  draftApiKeyEnv?: string
  /** Draft model provider route; defaults to `minimax`. */
  draftProvider?: string
  /** Draft model id; defaults to `MiniMax-M3`. */
  draftModel?: string
  /** Draft output-token budget; defaults to 4096. */
  draftMaxTokens?: number
  /** Draft call deadline (ms); defaults to 55000. */
  draftTimeoutMs?: number
  /** Per-request NocoBase timeout (ms); defaults to 15000. */
  timeoutMs?: number
  /** Directory deliverables land under (workspace-relative or absolute); defaults to `workspace/deliverables`. */
  deliverablesDir?: string
}

export const Config: z<Config> = z.object({
  baseUrl: z.string(),
  apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV),
  tenant: z.string().required(),
  draftApiKeyEnv: z.string().role('credential-ref').default(DEFAULT_DRAFT_API_KEY_ENV),
  draftProvider: z.string().default(DEFAULT_DRAFT_PROVIDER),
  draftModel: z.string().default(DEFAULT_DRAFT_MODEL),
  draftMaxTokens: z.number().step(1).min(1).default(DEFAULT_DRAFT_MAX_TOKENS),
  draftTimeoutMs: z.number().step(1).min(1).default(DEFAULT_DRAFT_TIMEOUT_MS),
  timeoutMs: z.number().step(1).min(1).default(DEFAULT_NOCOBASE_TIMEOUT_MS),
  deliverablesDir: z.string().default(DEFAULT_DELIVERABLES_DIR),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

/**
 * The orders service: order lifecycle plus the deliverable pipeline, bound
 * to one NocoBase source of truth. Registered as `ctx.orders`.
 */
export class OrdersRuntime extends Service implements OrdersSeam {
  static inject: string[] = []

  static Config = Config

  /** The resolved NocoBase client, or the structured refusal why none exists. */
  private client: NocoBaseClient | undefined
  private readonly resolved: ResolvedConfig

  constructor(ctx: Context, config: Config) {
    super(ctx, 'orders')
    this.resolved = config as ResolvedConfig
    ctx.effect(() => () => { this.client = undefined }, 'expert-orders.client-cache')
  }

  /** Resolve one credential: the credentials seam first, then the launch environment and process env. */
  private async resolveToken(ref: string): Promise<string | undefined> {
    const credentials = this.ctx.get('credentials')
    if (credentials !== undefined) {
      const stored = await credentials.resolve(credentialRef(ref))
      if (stored?.value !== undefined) return stored.value
    }
    const ambient = launchEnvironmentOf(this.ctx).get(ref)
    return (ambient == null ? undefined : ambient.value) ?? process.env[ref]
  }

  /** Resolve the base url and token and build the client; unresolved credentials refuse loudly. */
  private async ensureClient(signal: AbortSignal | undefined): Promise<NocoBaseClient> {
    signal?.throwIfAborted()
    if (this.client !== undefined) return this.client
    const baseUrl = this.resolved.baseUrl || process.env[NOCOBASE_BASE_URL_ENV]
    const token = await this.resolveToken(this.resolved.apiKeyEnv)
    if (typeof baseUrl !== 'string' || baseUrl.length === 0 || token === undefined || token.length === 0) {
      throw new OrdersError(
        `no NocoBase source of truth resolved (baseUrl from config or ${NOCOBASE_BASE_URL_ENV}, token from ${this.resolved.apiKeyEnv}); orders cannot run`,
        'ORDERS_SOURCE_UNAVAILABLE',
      )
    }
    this.client = new NocoBaseClient({ baseUrl, token, timeoutMs: this.resolved.timeoutMs })
    return this.client
  }

  /**
   * Read one order row. The v2 wire answers a missing row with
   * `{data: null}`, which the client already resolves to `undefined`; served
   * rows pass through {@link normalizeOrderRow}.
   */
  private async readOrder(orderId: number | string, signal?: AbortSignal): Promise<OrderRecord | undefined> {
    const client = await this.ensureClient(signal)
    const row = await client.get<OrderRecord>('orders', orderId, undefined, signal)
    return row === undefined ? undefined : normalizeOrderRow(row)
  }

  /**
   * Resolve the ordered service row and its expert, refusing foreign id
   * shapes and ids the backend does not serve.
   */
  private async resolveService(
    serviceId: string,
    signal?: AbortSignal,
  ): Promise<{ service: NocoBaseServiceRow; expert?: NocoBaseExpertRow }> {
    const prefix = 'expert_services/'
    if (!serviceId.startsWith(prefix) || serviceId.length === prefix.length) {
      throw new OrdersError(`service id "${serviceId}" is not an expert_services address connector_discover issued`, 'ORDERS_SERVICE_INVALID')
    }
    const rowId = serviceId.slice(prefix.length)
    if (!/^\d+$/u.test(rowId)) {
      throw new OrdersError(`service id "${serviceId}" is not an expert_services address connector_discover issued`, 'ORDERS_SERVICE_INVALID')
    }
    const client = await this.ensureClient(signal)
    const { rows } = await client.list<NocoBaseServiceRow>('expert_services', { filter: { id: { $eq: Number(rowId) } }, page: 1, pageSize: 1 }, signal)
    const service = rows[0]
    if (service === undefined) {
      throw new OrdersError(`no expert service matches "${serviceId}" at the orders source of truth`, 'ORDERS_SERVICE_MISSING')
    }
    if (service.expertId === undefined) return { service }
    const expert = await client.get<NocoBaseExpertRow>('experts', service.expertId, undefined, signal)
    return { service, ...(expert === undefined ? {} : { expert }) }
  }

  /** Generate one order number: ORD-YYYYMMDD-xxxxxxxx (random 8 hex — the
   * same-day collision space is 2^32, so two orders created the same UTC day
   * cannot realistically share a number). */
  private orderNoOf(): string {
    const now = new Date()
    const date = `${String(now.getUTCFullYear())}${String(now.getUTCMonth() + 1).padStart(2, '0')}${String(now.getUTCDate()).padStart(2, '0')}`
    return `ORD-${date}-${randomUUID().slice(0, 8)}`
  }

  /**
   * Resolve the ordered service, snapshot identity and pricing, and land a
   * `pending` order at the source of truth.
   * @param request - the ordered service, brief, and optional client name.
   * @param signal - caller cancellation.
   * @returns the stored pending order.
   */
  async create(request: OrderCreateRequest, signal?: AbortSignal): Promise<OrderRecord> {
    const { service, expert } = await this.resolveService(request.serviceId, signal)
    const client = await this.ensureClient(signal)
    const values: Record<string, unknown> = {
      orderNo: this.orderNoOf(),
      serviceId: request.serviceId,
      serviceName: service.name,
      ...(service.price === undefined ? {} : { price: service.price }),
      brief: request.brief,
      ...(request.clientName === undefined ? {} : { clientName: request.clientName }),
      ...(expert === undefined ? {} : { expertName: expert.name, ...(expert.org === undefined ? {} : { expertOrg: expert.org }) }),
      status: 'pending',
      createdAt: new Date().toISOString(),
    }
    const stored = await client.create<OrderRecord>('orders', values as unknown as OrderRecord, signal)
    return normalizeOrderRow(stored)
  }

  /**
   * Read one order by its primary key.
   * @param orderId - the NocoBase orders row id.
   * @param signal - caller cancellation.
   * @returns the stored order, or `undefined` when the source has no such row.
   */
  async get(orderId: number | string, signal?: AbortSignal): Promise<OrderRecord | undefined> {
    return this.readOrder(orderId, signal)
  }

  /**
   * List orders (newest rows last, source order, one page).
   * @param signal - caller cancellation.
   * @returns every stored order row on the page.
   */
  async list(signal?: AbortSignal): Promise<readonly OrderRecord[]> {
    const client = await this.ensureClient(signal)
    const { rows } = await client.list<OrderRecord>('orders', { page: 1, pageSize: 100 }, signal)
    return rows.map(row => normalizeOrderRow(row))
  }

  /** Retrieve kb reference lines for the brief; a composed kb absent or empty leaves none. */
  private async retrieveRefs(brief: string, signal: AbortSignal | undefined): Promise<readonly string[]> {
    const kb = this.ctx.get('kb')
    if (kb === undefined) return []
    const result = await kb.search({ query: brief, tenantId: this.resolved.tenant, maxResults: REF_HITS }, signal)
    return result.results.map(hit => `${hit.title ?? hit.sourcePath}${hit.headingPath === undefined ? '' : ` → ${hit.headingPath}`}`)
  }

  /**
   * Draft the proposal spec: the model stream when the llm service and the
   * draft key both resolve, otherwise the named template fallback. An
   * unparseable model output is retried once with the parse error carried
   * into the retry prompt; each attempt gets its own deadline.
   * @param input - the resolved drafting input.
   * @param orderNo - the order number for the cover.
   * @param signal - caller cancellation.
   * @returns the spec plus the fallback note when the template drafted it.
   */
  private async draftSpec(
    input: DraftingInput,
    orderNo: string,
    signal: AbortSignal | undefined,
  ): Promise<{ spec: DraftSpec; note?: string }> {
    const llm = this.ctx.get('llm')
    const key = await this.resolveToken(this.resolved.draftApiKeyEnv)
    const date = new Date().toISOString().slice(0, 10)
    if (llm === undefined || key === undefined || key.length === 0) {
      return { spec: templateDraftSpec(input, orderNo, date), note: TEMPLATE_FALLBACK_NOTE }
    }
    const { system, user } = buildDraftMessages(input)
    let parseError: Error | undefined
    for (let attempt = 0; ; attempt++) {
      const deadline = new AbortController()
      const timer = setTimeout(() => { deadline.abort() }, this.resolved.draftTimeoutMs)
      const timed = signal === undefined ? deadline.signal : AbortSignal.any([signal, deadline.signal])
      try {
        const prompt = attempt === 0 ? user : `${user}\n\n上一次输出不是合法 JSON（${(parseError as Error).message}）。重新输出完整合法的 JSON 对象，不要任何其他文字。`
        const messages: Message[] = [createUserMessage({
          content: [{ type: 'text', text: prompt }],
          source: { kind: 'plugin', plugin: 'dsh-expert-orders' },
        })]
        const options: GenerateOptions = {
          provider: this.resolved.draftProvider,
          model: this.resolved.draftModel,
          messages,
          system,
          maxTokens: this.resolved.draftMaxTokens,
          signal: timed,
        }
        const assembler = new BlockAssembler()
        for await (const chunk of llm.stream(options)) {
          timed.throwIfAborted()
          assembler.push(chunk)
        }
        timed.throwIfAborted()
        if (assembler.finish.kind !== 'stop') {
          throw new OrdersError(`draft model finished with "${assembler.finish.kind}" instead of stop`, 'ORDERS_DRAFT_FAILED')
        }
        const text = assembler.blocks()
          .filter((block): block is Extract<(ReturnType<typeof assembler.blocks>)[number], { type: 'text' }> => block.type === 'text')
          .map(block => block.text)
          .join('')
        try {
          const drafted = parseDraftResponse(text)
          return {
            spec: {
              orderNo,
              title: drafted.title,
              client: input.clientName ?? '委托客户',
              expert: { name: input.expert.name, ...(input.expert.org === undefined ? {} : { org: input.expert.org }) },
              date,
              sections: [...drafted.sections],
            },
          }
        } catch (error) {
          // parseDraftResponse's documented contract: it throws Error instances.
          parseError = error as Error
          if (attempt > 0) {
            throw new OrdersError(`draft output failed to parse twice: ${parseError.message}`, 'ORDERS_DRAFT_FAILED', { cause: error })
          }
        }
      } finally {
        clearTimeout(timer)
      }
    }
  }

  /**
   * Run the deliverable pipeline for one order: transition to `generating`,
   * retrieve kb references, draft the proposal (model stream or the named
   * template fallback), typeset it through expert-pdf, land the PDF under
   * the configured deliverables directory, and write `delivered` with the
   * path back at the source. A failure writes `failed` with the cause and
   * rethrows; a `failed` order may be fulfilled again (retry).
   * @param orderId - the NocoBase orders row id.
   * @param signal - caller cancellation.
   * @returns the stored order in `delivered` status.
   */
  async fulfill(orderId: number | string, signal?: AbortSignal): Promise<OrderRecord> {
    const order = await this.readOrder(orderId, signal)
    if (order === undefined) {
      throw new OrdersError(`no order ${orderId} exists at the orders source of truth`, 'ORDERS_ORDER_MISSING')
    }
    const status = assertOrderStatus(order.status)
    if (!canTransition(status, 'generating')) {
      throw new OrdersError(`order ${orderId} is "${status}"; only pending or failed orders can enter generating`, 'ORDERS_INVALID_TRANSITION')
    }
    const client = await this.ensureClient(signal)
    await client.update('orders', orderId, { status: 'generating' }, signal)
    try {
      const refs = await this.retrieveRefs(order.brief, signal)
      const input: DraftingInput = {
        brief: order.brief,
        ...(order.clientName === undefined ? {} : { clientName: order.clientName }),
        service: {
          serviceId: order.serviceId,
          name: order.serviceName,
          ...(order.price === undefined ? {} : { price: order.price }),
        },
        expert: {
          name: order.expertName ?? '专家顾问',
          ...(order.expertOrg === undefined ? {} : { org: order.expertOrg }),
        },
        refs,
      }
      const { spec, note } = await this.draftSpec(input, order.orderNo, signal)
      const bytes = await renderPdf(spec)
      const path = join(this.resolved.deliverablesDir, `${order.orderNo}.pdf`)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, bytes)
      // The NocoBase order row is the source of truth for the deliverable:
      // stream the PDF through attachments:upload, then hang the returned
      // attachment off the order's `deliverable` attachment field while the
      // landed file stays a local cache copy. An upload or attach refusal
      // fails the whole run (the catch below writes `failed`) — a delivered
      // order without its attachment at the source would be a lie.
      const attachment = await client.upload(`${order.orderNo}.pdf`, bytes, 'application/pdf', signal)
      const settled = await client.update<OrderRecord>('orders', orderId, {
        status: 'delivered',
        deliverablePath: path,
        ...(attachment.url === undefined ? {} : { deliverableUrl: attachment.url }),
        deliverable: [attachment.id],
        generatedAt: new Date().toISOString(),
        ...(note === undefined ? {} : { note }),
      }, signal)
      // The wire row carries SQL NULL for unset columns (`note` when the
      // model drafted); normalize so callers and the tool output schema see
      // the contract-shaped record every other read path returns.
      return normalizeOrderRow(settled)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      try {
        await client.update('orders', orderId, { status: 'failed', error: message.slice(0, 500) }, signal)
      } catch (writeBack: unknown) {
        // Swallow only the failed-status write-back's own refusal: the
        // pipeline error rethrown below is the root cause, and surfacing the
        // second failure would mask it.
        void writeBack
      }
      if (error instanceof OrdersError) throw error
      throw new OrdersError(`fulfilling order ${orderId} failed: ${message}`, 'ORDERS_FULFILL_FAILED', { cause: error })
    }
  }

  /**
   * Read one delivered order's PDF deliverable.
   * @param orderId - the NocoBase orders row id.
   * @param signal - caller cancellation.
   * @returns the landed file's path and bytes.
   */
  async readDeliverable(orderId: number | string, signal?: AbortSignal): Promise<OrderDeliverableFile> {
    const order = await this.readOrder(orderId, signal)
    if (order === undefined) {
      throw new OrdersError(`no order ${orderId} exists at the orders source of truth`, 'ORDERS_ORDER_MISSING')
    }
    if (order.status !== 'delivered' || order.deliverablePath === undefined) {
      throw new OrdersError(`order ${orderId} is "${order.status}"; no deliverable has landed yet`, 'ORDERS_NOT_DELIVERED')
    }
    try {
      return { path: order.deliverablePath, bytes: await readFile(order.deliverablePath) }
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new OrdersError(`order ${orderId}'s deliverable ${order.deliverablePath} is missing on disk`, 'ORDERS_DELIVERABLE_MISSING')
      }
      throw error
    }
  }
}

/**
 * Normalize one orders wire row to the {@link OrderRecord} contract: the
 * resourcer serves SQL NULL for unset optional columns (`error`, `note`) and
 * the orders collection carries no `createdAt` column (creation time rides
 * the create payload only; the row gains `generatedAt` at delivery), so NULL
 * collapses away and a missing `createdAt` falls back to the delivered
 * timestamp, then the empty string when neither exists.
 * @param row - the orders row as the wire served it.
 * @returns the contract-shaped record with no null or undefined fields.
 */
export function normalizeOrderRow(row: OrderRecord): OrderRecord {
  const text = (value: string | null | undefined): string | undefined => typeof value === 'string' ? value : undefined
  const price = text(row.price)
  const clientName = text(row.clientName)
  const expertName = text(row.expertName)
  const expertOrg = text(row.expertOrg)
  const error = text(row.error)
  const deliverablePath = text(row.deliverablePath)
  const deliverableUrl = text(row.deliverableUrl)
  const generatedAt = text(row.generatedAt)
  const note = text(row.note)
  return {
    id: row.id,
    orderNo: row.orderNo,
    serviceId: row.serviceId,
    serviceName: row.serviceName,
    ...price === undefined ? {} : { price },
    brief: row.brief,
    ...clientName === undefined ? {} : { clientName },
    ...expertName === undefined ? {} : { expertName },
    ...expertOrg === undefined ? {} : { expertOrg },
    status: row.status,
    ...error === undefined ? {} : { error },
    ...deliverablePath === undefined ? {} : { deliverablePath },
    ...deliverableUrl === undefined ? {} : { deliverableUrl },
    ...generatedAt === undefined ? {} : { generatedAt },
    ...note === undefined ? {} : { note },
    createdAt: text(row.createdAt) ?? generatedAt ?? '',
  }
}

export default OrdersRuntime
