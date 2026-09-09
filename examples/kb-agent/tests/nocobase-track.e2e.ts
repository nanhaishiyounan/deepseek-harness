/**
 * With-NocoBase real-track e2e: the expert-service order journey against a
 * LIVE NocoBase 2.x backend (the one `setup-nocobase.mts` brings up). No mock
 * stands in anywhere: connector discovery reads the real seeded collections
 * (张红喜 + services), `orders.create` lands a real row that fires the
 * approval workflow (collection trigger → manual), the test resolves the
 * manual task through the workflow-tasks API like a human approver would,
 * and the workflow's request node calls back a real DSH-side HTTP endpoint
 * serving the orders.fulfill RPC entry — the pipeline drafts (real MiniMax
 * when MINIMAX_API_KEY resolves, the named template otherwise), typesets the
 * PDF, uploads it through attachments:upload, and hangs it off the order's
 * `deliverable` attachment field. The landed bytes are compared against the
 * NocoBase-served attachment. Self-skips without reachable
 * NOCOBASE_BASE_URL/NOCOBASE_API_KEY (the root .env counts), explaining why.
 * Run: pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/nocobase-track.e2e.ts
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import ExpertOrdersRuntime from '@deepseek-ai/dsh-expert-orders'
import { NocoBaseClient } from '@deepseek-ai/dsh-connector-nocobase'
import type { OrderRecord, OrdersSeam } from '@deepseek-ai/dsh-expert-orders'
import { pathToFileURL } from 'node:url'
import { closeHttpServer, createApprovalClone, drainPendingApprovals, getJson, resolveManualApprovalTask, WorkflowLease } from '../scripts/nocobase-workflow.ts'
import { resolveEnv } from '../scripts/resolve-env.ts'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/nocobase-track.e2e.cordis.yml')
const WORKFLOW_TITLE = '专家服务订单审批交付'

const ncBaseUrl = resolveEnv('NOCOBASE_BASE_URL')
const ncApiKey = resolveEnv('NOCOBASE_API_KEY')

/** Probe the live backend: the API key must list experts successfully. */
async function backendReachable(): Promise<boolean> {
  if (ncBaseUrl === undefined || ncApiKey === undefined) return false
  try {
    const response = await fetch(`${ncBaseUrl}/api/experts:list?pageSize=1`, {
      headers: { authorization: `Bearer ${ncApiKey}` },
      signal: AbortSignal.timeout(5000),
    })
    return response.ok
  } catch {
    return false
  }
}

const reachable = await backendReachable()
const skipReason = ncBaseUrl === undefined || ncApiKey === undefined
  ? 'NOCOBASE_BASE_URL/NOCOBASE_API_KEY not set — run `node --import tsx/esm examples/kb-agent/scripts/setup-nocobase.mts` first (self-skipping, not failing)'
  : `NocoBase at ${ncBaseUrl} did not answer the API-key probe — start it with setup-nocobase.mts start (self-skipping, not failing)`

describe.skipIf(!reachable)('NocoBase real track: discover → order → approval → fulfill → attachment', () => {
  let ctx: Context | undefined
  let orders: OrdersSeam | undefined
  let client: NocoBaseClient | undefined
  let root: string | undefined
  let fulfillServer: Server | undefined
  let fulfillUrl = 'http://127.0.0.1:3080'
  let lease: WorkflowLease | undefined
  const ncEndpoint = { baseUrl: ncBaseUrl!, apiKey: ncApiKey! } as const

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'nocobase-track-'))
    process.env.NOCOBASE_API_KEY = ncApiKey
    process.env.NC_TRACK_URL = ncBaseUrl
    process.env.NC_TRACK_DELIVERABLES = join(root, 'deliverables')
    const context = new Context()
    ctx = context
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
      ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['@deepseek-ai/dsh-llm-minimax', LlmMiniMax],
      ['@deepseek-ai/dsh-connector', ConnectorRuntime],
      ['@deepseek-ai/dsh-connector-nocobase', ConnectorNocoBase],
      ['@deepseek-ai/dsh-expert-orders', ExpertOrdersRuntime],
    ])
    context.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof context.loader.internal>
    await context.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await context.loader.await()
    orders = ctx.get('orders')
    if (orders === undefined) throw new Error('orders capability did not compose')
    client = new NocoBaseClient({ baseUrl: ncBaseUrl!, token: ncApiKey!, timeoutMs: 30_000 })

    // Serve the orders.fulfill RPC entry exactly the way the gateway's fetch
    // carrier does: JSON-only POST at /api/orders.fulfill, client-request
    // envelope with the method matching the path, ok(value) server response.
    fulfillServer = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://dsh-callback')
      if (request.method !== 'POST' || url.pathname !== '/api/orders.fulfill') {
        response.writeHead(404).end('not found')
        return
      }
      let raw = ''
      request.on('data', (chunk: Buffer) => { raw += chunk.toString('utf8') })
      request.on('end', () => {
        void (async () => {
          const envelope = JSON.parse(raw) as { type?: string; rpcId?: string; method?: string; payload?: { order_id?: number } }
          if (envelope.type !== 'client-request' || envelope.method !== 'orders.fulfill' || typeof envelope.payload?.order_id !== 'number') {
            response.writeHead(200).end(JSON.stringify({ type: 'server-response', rpcId: envelope.rpcId ?? '', result: { ok: false, error: { code: 'bad-request', message: 'bad envelope', details: {} } } }))
            return
          }
          const settled = await orders!.fulfill(envelope.payload.order_id)
          const value = {
            id: settled.id,
            order_no: settled.orderNo,
            status: settled.status,
            ...(settled.deliverableUrl === undefined ? {} : { deliverable_url: settled.deliverableUrl }),
          }
          response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
            type: 'server-response',
            rpcId: envelope.rpcId,
            result: { ok: true, value },
          }))
        })().catch(() => {
          response.writeHead(200).end(JSON.stringify({ type: 'server-response', rpcId: '', result: { ok: false, error: { code: 'orders-rejected', message: 'fulfill threw', details: {} } } }))
        })
      })
    })
    // The deployment's DSH gateway may already hold 3080 (a long-running
    // `dsh web`); fall back to an ephemeral port and retarget the workflow
    // request node below.
    await new Promise<void>((resolve, reject) => {
      fulfillServer!.once('error', reject)
      fulfillServer!.listen(3080, '127.0.0.1', resolve)
    }).catch(async () => {
      await new Promise<void>(resolve => fulfillServer!.listen(0, '127.0.0.1', resolve))
      const address = fulfillServer!.address()
      if (address === null || typeof address === 'string') throw new Error('fulfill callback server has no address')
      fulfillUrl = `http://127.0.0.1:${address.port}`
    })

    // Nodes of an executed workflow are immutable, so the journey cannot
    // retarget the production workflow's request node at this ephemeral
    // callback port. Instead: pause the production workflow under a lease
    // (restored in afterAll whatever happens below), create a private clone
    // whose request node points here from birth, and drain stranded PENDING
    // approval tasks from earlier runs — each one's resume queues ahead of
    // this run's journey on the serial dispatcher, and a backlog of them
    // starves the poll loop below.
    const workflows = await client.list<{ id: number }>('workflows', { filter: { title: { $eq: WORKFLOW_TITLE } }, page: 1, pageSize: 1 })
    const productionId = workflows.rows[0]?.id
    if (productionId === undefined) throw new Error(`workflow "${WORKFLOW_TITLE}" missing — run setup-nocobase.mts init`)
    lease = new WorkflowLease(ncEndpoint, productionId)
    await lease.pause()
    const cloneId = await createApprovalClone(ncEndpoint, `${WORKFLOW_TITLE}-e2e`, fulfillUrl)
    lease.setClone(cloneId)
    await drainPendingApprovals(ncEndpoint)
  }, 120_000)

  it('runs the whole order journey on the live backend', async () => {
    // 1. Discovery over the real seeded collections (张红喜 + a service).
    const connector = ctx!.get('connector')
    expect(connector).toBeDefined()
    // Discovery translates the query into NocoBase `$includes` substring
    // filters, so the term must actually appear in the seeded fields.
    const datasets = await connector!.discover({ query: '中亚' })
    const expert = datasets.find(dataset => dataset.kind === 'expert-profile')
    expect(expert?.title).toBe('张红喜')
    const service = datasets.find(dataset => dataset.kind === 'service')
    expect(service?.id).toMatch(/^expert_services\/\d+$/u)

    // 2. A real order row (fires the collection-trigger workflow).
    const created = await orders!.create({ serviceId: service!.id, brief: '中亚货运动线：主运力经霍尔果斯受阻后的切换与备仓方案。', clientName: '漯河宏发食品有限公司' })
    expect(created.status).toBe('pending')
    expect(created.expertName).toBe('张红喜')

    // 3. The manual approval task the workflow created; resolve it the way
    // the UI approver does, re-submitting a still-pending task up to three
    // times (a lost resume would otherwise strand the order).
    const approved = await resolveManualApprovalTask(ncEndpoint)
    expect(approved).toBe(true)

    // 4. The workflow's request node calls back; poll until delivered (the
    // live MiniMax draft alone can run ~90s, and resumes queue behind it).
    let settled: OrderRecord | undefined
    for (let attempt = 0; attempt < 210 && settled === undefined; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 2000))
      const order = await client!.get<OrderRecord>('orders', created.id)
      if (order?.status === 'delivered' || order?.status === 'failed') {
        if (order.status === 'failed') throw new Error(`order ${created.id} failed at the source: ${order.error ?? '?'}`)
        settled = order
      }
    }
    expect(settled?.status).toBe('delivered')
    expect(settled?.deliverableUrl).toMatch(/^\/(files|storage\/uploads)\//u)
    expect(typeof settled?.deliverablePath).toBe('string')

    // 5. The landed deliverable is a real PDF...
    const localBytes = await readFile(settled!.deliverablePath!)
    expect(Buffer.from(localBytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-')

    // ...and the NocoBase-served attachment carries identical bytes (the url
    // answers 302 to the stored file; fetch follows it same-origin).
    const attachmentResponse = await fetch(`${ncBaseUrl}${settled!.deliverableUrl}`, {
      headers: { authorization: `Bearer ${ncApiKey}` },
      signal: AbortSignal.timeout(30_000),
    })
    expect(attachmentResponse.ok).toBe(true)
    const servedBytes = new Uint8Array(await attachmentResponse.arrayBuffer())
    expect(Buffer.from(servedBytes).equals(localBytes)).toBe(true)

    // 6. The order row carries the attachment on its deliverable field.
    const full = await getJson(ncEndpoint, `/api/orders/${created.id}?appends=deliverable`) as { data?: { deliverable?: Array<{ id?: number }> } }
    expect((full.data?.deliverable ?? []).length).toBeGreaterThan(0)
    // One attempt must absorb the live draft (~90-120s) plus the queued
    // resumes of vitest's own retries, so the budget dwarfs the poll loop.
  }, 900_000)

  afterAll(async () => {
    // Remove the private clone and re-enable the production workflow. A
    // failed restore is recorded (mirroring the demo's FAIL scenario row)
    // without aborting the remaining teardown here.
    try {
      await lease?.restore()
    } catch (error) {
      console.error(`nocobase-track e2e: workflow restore failed — enable the workflow「专家服务订单审批交付」manually in NocoBase: ${error instanceof Error ? error.message : String(error)}`)
    }
    await closeHttpServer(fulfillServer)
    fulfillServer = undefined
    await ctx?.fiber.dispose()
    ctx = undefined
    delete process.env.NC_TRACK_URL
    delete process.env.NC_TRACK_DELIVERABLES
    if (root !== undefined) await rm(root, { recursive: true, force: true })
    root = undefined
  })
})

describe.skipIf(reachable)('NocoBase real track (skipped)', () => {
  it('explains why it self-skipped', () => {
    console.info(`nocobase-track e2e: ${skipReason}`)
  })
})
