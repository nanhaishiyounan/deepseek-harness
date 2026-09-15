/**
 * The orders runtime over a mock NocoBase (the resourcer's list/create/get/
 * update wire) with injectable kb and llm services: creation resolves the
 * service row and lands a pending order at the source of truth; fulfill runs
 * the whole pipeline (state transitions at the source, kb-referenced model
 * drafting or the named template fallback, real PDF landing, delivered
 * write-back) with retry-after-failure semantics; deliverable reads 404 and
 * pre-delivery states loudly.
 */

import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { KbSearchResult } from '@deepseek-ai/dsh-kb'
import { OrdersRuntime, normalizeOrderRow } from '../src/index.ts'
import { OrdersError } from '../src/types.ts'
import type { OrderRecord } from '../src/types.ts'

const here = dirname(fileURLToPath(import.meta.url))
const NC_TOKEN = 'orders-mock-token'

/** The authoritative expert dataset rows the mock NocoBase serves. */
const fixtures = JSON.parse(await readFile(join(here, '../../../../examples/kb-agent/workspace/data/experts/dataset.json'), 'utf8')) as {
  experts: Array<Record<string, unknown>>
  expert_services: Array<Record<string, unknown>>
  orders: Array<Record<string, unknown>>
}

interface MockNocoBase {
  url: string
  readonly served: Array<{ method: string; path: string; query?: URLSearchParams; body?: unknown }>
  readonly orders: Array<Record<string, unknown>>
  close(): Promise<void>
}

/**
 * Boot the mock NocoBase speaking the v2 wire: action paths, POST bodies
 * whose top level IS the action's values, `{data}`-wrapped responses,
 * `{data: rows, meta}` list envelopes, `{data: null}` for missing rows, and
 * the multipart `attachments:upload`.
 */
async function bootMockNocoBase(): Promise<MockNocoBase> {
  const experts = [...fixtures.experts]
  const services = [...fixtures.expert_services]
  const orders = [...fixtures.orders]
  const served: MockNocoBase['served'] = []
  const collections: Record<string, Array<Record<string, unknown>>> = { experts, expert_services: services, orders }
  let attachmentSeq = 0
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock-nocobase')
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const raw = Buffer.concat(chunks)
      const contentType = request.headers['content-type'] ?? ''
      const body: unknown = contentType.startsWith('application/json') && raw.length > 0 ? JSON.parse(raw.toString('utf8')) as unknown : undefined
      served.push({ method: request.method ?? 'GET', path: url.pathname, query: url.searchParams, ...(body === undefined ? {} : { body }) })
      const finish = (status: number, payload: unknown): void => {
        response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
      }
      if (request.headers.authorization !== `Bearer ${NC_TOKEN}`) {
        finish(401, { error: { code: 'INVALID_TOKEN' } })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/attachments:upload') {
        const named = /filename="([^"]+)"/u.exec(raw.toString('utf8'))
        attachmentSeq += 1
        finish(200, { data: { id: attachmentSeq, filename: named?.[1] ?? 'upload.bin', url: `/storage/uploads/${named?.[1] ?? 'upload.bin'}` } })
        return
      }
      const listMatch = /^\/api\/([^/:]+):list$/u.exec(url.pathname)
      if (request.method === 'GET' && listMatch !== null) {
        let rows = collections[listMatch[1] as string] ?? []
        const filterRaw = url.searchParams.get('filter')
        if (filterRaw !== null) {
          const filter = JSON.parse(filterRaw) as { id?: { $eq?: unknown } }
          if (filter.id?.$eq !== undefined) rows = rows.filter(row => row.id === filter.id?.$eq)
        }
        finish(200, { data: rows, meta: { count: rows.length, page: 1, pageSize: 100, totalPage: 1 } })
        return
      }
      const createMatch = /^\/api\/([^/:]+):create$/u.exec(url.pathname)
      if (request.method === 'POST' && createMatch !== null) {
        const created = { ...(body as Record<string, unknown>), id: 101 }
        ;(collections[createMatch[1] as string] as Array<Record<string, unknown>>).push(created)
        finish(200, { data: created })
        return
      }
      const updateMatch = /^\/api\/([^/:]+):update$/u.exec(url.pathname)
      if (request.method === 'POST' && updateMatch !== null) {
        const rows = collections[updateMatch[1] as string] ?? []
        const byTk = url.searchParams.get('filterByTk')
        const row = byTk === null ? undefined : rows.find(entry => String(entry.id) === byTk)
        if (row === undefined) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        Object.assign(row, body as Record<string, unknown>)
        finish(200, { data: [row] })
        return
      }
      const getMatch = /^\/api\/([^/]+)\/([^/]+)$/u.exec(url.pathname)
      if (request.method === 'GET' && getMatch !== null) {
        const rows = collections[getMatch[1] as string] ?? []
        const row = rows.find(entry => String(entry.id) === getMatch[2])
        finish(200, { data: row ?? null })
        return
      }
      finish(404, { error: { code: 'NOT_FOUND' } })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    served,
    orders,
    close: async () => { await new Promise(resolve => server.close(resolve)) },
  }
}

/** A fake llm service streaming one canned text per call (the last repeats)
 * and an optional refusal, finish reason, and pre-stream delay; records
 * every user prompt it saw. */
class FakeLlm extends Service {
  error: Error | undefined
  readonly prompts: string[] = []
  constructor(
    ctx: Context,
    private readonly replies: readonly string[],
    private readonly behavior: { finish?: 'stop' | 'max-tokens'; delayMs?: number } = {},
  ) {
    super(ctx, 'llm')
  }
  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    if (this.behavior.delayMs !== undefined) await new Promise(resolve => setTimeout(resolve, this.behavior.delayMs))
    if (this.error !== undefined) throw this.error
    const first = options.messages[0]
    const block = Array.isArray(first?.content) ? (first.content[0] as { type?: string; text?: string } | undefined) : undefined
    this.prompts.push(block?.type === 'text' ? block.text ?? '' : '')
    const text = this.replies[Math.min(this.prompts.length - 1, this.replies.length - 1)] ?? ''
    yield { type: 'text-delta', index: 0, text }
    yield { type: 'finish', reason: { kind: this.behavior.finish ?? 'stop' } }
  }
}

/** A fake kb service answering one fixed warehouse playbook hit. */
class FakeKb extends Service {
  readonly queries: string[] = []
  constructor(ctx: Context) {
    super(ctx, 'kb')
  }
  async search(request: { query: string }): Promise<KbSearchResult> {
    this.queries.push(request.query)
    return {
      mode: 'text',
      results: [{
        chunkId: 1, docId: 3, tenantId: 'demo-food-co', sourcePath: 'workspace/data/experts/dataset-3.md',
        title: '俄罗斯·中亚海外仓风险应对手册（专家知识资产）', docKind: 'report', chunkIdx: 0,
        headingPath: '二、应急预案要点', content: '启用备份仓……',
      }],
    }
  }
}

const DRAFT_JSON = JSON.stringify({
  title: '中亚货运风险应对方案',
  sections: [
    { heading: '背景与问题', paragraphs: ['客户主运力经霍尔果斯口岸，近期受阻风险上升。'] },
    { heading: '风险分析', paragraphs: ['二级风险：单一口岸停摆影响 30 日内交付。'], refs: ['俄罗斯·中亚海外仓风险应对手册（专家知识资产） → 二、应急预案要点'] },
    { heading: '解决方案', paragraphs: ['货运：霍尔果斯与阿拉山口双口岸互备，受阻时切换公路 TIR。', '仓库：启用阿拉木图备仓承接转移库存。'] },
    { heading: '实施路线图', paragraphs: ['第一周完成备仓协议与保险批改；第二周完成库存分区与转运排程。'] },
  ],
})

let nc: MockNocoBase | undefined
let root: string | undefined
let ctx: Context | undefined

beforeEach(() => {
  process.env.EO_TEST_NC_URL = 'placeholder'
  process.env.EO_TEST_DRAFT_KEY = 'test-draft-key'
})

afterEach(async () => {
  delete process.env.EO_TEST_NC_URL
  delete process.env.EO_TEST_DRAFT_KEY
  await ctx?.fiber.dispose()
  ctx = undefined
  await nc?.close()
  nc = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the runtime with resolved NocoBase credentials and a tmp deliverables dir. */
async function boot(options?: {
  draftKeyEnv?: string
  llmText?: string | readonly string[]
  llmFinish?: 'stop' | 'max-tokens'
  llmDelayMs?: number
  draftTimeoutMs?: number
  kb?: boolean
}): Promise<OrdersRuntime> {
  nc = await bootMockNocoBase()
  process.env.EO_TEST_NC_URL = nc.url
  root = await mkdtemp(join(tmpdir(), 'expert-orders-'))
  ctx = new Context()
  if (options?.llmText !== undefined) {
    new FakeLlm(ctx, typeof options.llmText === 'string' ? [options.llmText] : options.llmText, {
      ...(options?.llmFinish === undefined ? {} : { finish: options.llmFinish }),
      ...(options?.llmDelayMs === undefined ? {} : { delayMs: options.llmDelayMs }),
    })
  }
  if (options?.kb) new FakeKb(ctx)
  const runtime = new OrdersRuntime(ctx, {
    baseUrl: nc.url,
    apiKeyEnv: 'EO_TEST_NC_TOKEN',
    draftApiKeyEnv: options?.draftKeyEnv ?? 'EO_TEST_DRAFT_KEY',
    tenant: 'demo-food-co',
    deliverablesDir: join(root, 'deliverables'),
    ...(options?.draftTimeoutMs === undefined ? {} : { draftTimeoutMs: options.draftTimeoutMs }),
  })
  // The plugin constructor leaves the token to apply-time resolution; tests
  // inject it through the environment like a deployment export would.
  process.env.EO_TEST_NC_TOKEN = NC_TOKEN
  return runtime
}

describe('OrdersRuntime.create', () => {
  it('resolves the service row, snapshots pricing, and lands a pending order at the source', async () => {
    const runtime = await boot()
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓被炸后的库存转移与履约方案。', clientName: '漯河宏发食品有限公司' })
    expect(order.status).toBe('pending')
    expect(order.serviceName).toBe('海外仓风险应对咨询')
    expect(order.price).toBe('¥6,800/份')
    expect(order.expertName).toBe('张红喜')
    expect(order.expertOrg).toBe('漯河市电子商务协会（会长）')
    expect(order.orderNo).toMatch(/^ORD-\d{8}-[0-9a-f]{8}$/u)
    const createWire = nc!.served.find(request => request.path === '/api/orders:create')
    expect(createWire?.body).toMatchObject({ status: 'pending', serviceId: 'expert_services/2' })
  })

  it('refuses a service id this backend does not serve', async () => {
    const runtime = await boot()
    await expect(runtime.create({ serviceId: 'expert_services/999', brief: 'b' })).rejects.toBeInstanceOf(OrdersError)
  })

  it('refuses a service id whose shape is foreign', async () => {
    const runtime = await boot()
    await expect(runtime.create({ serviceId: 'experts/1', brief: 'b' })).rejects.toMatchObject({ code: 'ORDERS_SERVICE_INVALID' })
  })
})

describe('OrdersRuntime.fulfill (keyless template fallback)', () => {
  it('runs the pipeline: generating → template draft → real PDF landing → attachment upload → delivered', async () => {
    const runtime = await boot({ draftKeyEnv: 'EO_TEST_ABSENT_KEY', kb: true })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓被炸后的库存转移与履约方案。' })
    const delivered = await runtime.fulfill(order.id)
    expect(delivered.status).toBe('delivered')
    expect(delivered.deliverablePath).toBe(join(root!, 'deliverables', `${order.orderNo}.pdf`))
    expect(delivered.note).toContain('未配置模型服务')
    const bytes = await readFile(delivered.deliverablePath as string)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-')
    // The deliverable is attached at the source: one multipart upload, then
    // the delivered write-back hangs the attachment id off the order row.
    const uploadWire = nc!.served.find(request => request.path === '/api/attachments:upload')
    expect(uploadWire).toBeDefined()
    // fulfill returns the contract-shaped record (normalizeOrderRow), not the
    // raw wire row: the attachment linkage is asserted on the update wire
    // below, and unset columns (SQL NULL on the wire) must not survive into
    // the returned record — the tool output schema rejects them.
    expect(delivered).not.toHaveProperty('deliverable')
    expect(delivered.deliverableUrl).toBe(`/storage/uploads/${order.orderNo}.pdf`)
    const updates = nc!.served.filter(request => request.path === '/api/orders:update' && request.query?.get('filterByTk') === String(order.id))
    expect(updates.map(request => (request.body as { status: string }).status)).toEqual(['generating', 'delivered'])
    expect((updates[1]?.body as { deliverable?: number[] }).deliverable).toEqual([1])
  })

  it('reads the deliverable back by order id', async () => {
    const runtime = await boot({ draftKeyEnv: 'EO_TEST_ABSENT_KEY' })
    const order = await runtime.create({ serviceId: 'expert_services/1', brief: '中亚货运动线设计。' })
    await runtime.fulfill(order.id)
    const file = await runtime.readDeliverable(order.id)
    expect(Buffer.from(file.bytes.slice(0, 5)).toString('ascii')).toBe('%PDF-')
    expect(file.path).toContain(`${order.orderNo}.pdf`)
  })
})

describe('OrdersRuntime.fulfill (model drafting)', () => {
  it('drafts sections from the model stream and typesets the cited headings', async () => {
    const runtime = await boot({ llmText: DRAFT_JSON, kb: true })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓应急方案。' })
    const delivered = await runtime.fulfill(order.id)
    expect(delivered.status).toBe('delivered')
    expect(delivered.note).toBeUndefined()
    const { text } = await extracted(delivered.deliverablePath as string)
    for (const expected of ['风险分析', '解决方案', '实施路线图', '双口岸互备', '海外仓风险应对手册']) {
      expect(text).toContain(expected)
    }
  })

  it('repairs noisy model JSON without spending the retry', async () => {
    const noisy = '好的，以下是方案：\n{"title":"中亚货运风险应对方案","sections":[{"heading":"背景与问题","paragraphs":["客户主运力经霍尔果斯口岸。",],"refs":["手册",]}]}'
    const runtime = await boot({ llmText: noisy, kb: true })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓应急方案。' })
    const delivered = await runtime.fulfill(order.id)
    expect(delivered.status).toBe('delivered')
    const llm = (ctx as unknown as { llm: FakeLlm }).llm
    expect(llm.prompts).toHaveLength(1)
  })

  it('fails the order when the draft stream outlives its deadline', async () => {
    const runtime = await boot({ llmText: DRAFT_JSON, draftTimeoutMs: 20, llmDelayMs: 500 })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓应急方案。' })
    const failure = await runtime.fulfill(order.id).then(
      () => { throw new Error('expected a failure') },
      (thrown: unknown) => thrown,
    )
    expect(failure).toBeInstanceOf(OrdersError)
    const failed = await runtime.get(order.id)
    expect(failed?.status).toBe('failed')
  })

  it('fails the order when the model finishes with max-tokens instead of stop', async () => {
    const runtime = await boot({ llmText: DRAFT_JSON, llmFinish: 'max-tokens' })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓应急方案。' })
    const failure = await runtime.fulfill(order.id).then(
      () => { throw new Error('expected a failure') },
      (thrown: unknown) => thrown,
    )
    expect(failure).toMatchObject({ code: 'ORDERS_DRAFT_FAILED' })
    const failed = await runtime.get(order.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toContain('max-tokens')
  })

  it('retries once on an unparseable draft, carrying the parse error into the retry prompt', async () => {
    const runtime = await boot({ llmText: ['抱歉，无法提供方案。', DRAFT_JSON], kb: true })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓应急方案。' })
    const delivered = await runtime.fulfill(order.id)
    expect(delivered.status).toBe('delivered')
    const llm = (ctx as unknown as { llm: FakeLlm }).llm
    expect(llm.prompts).toHaveLength(2)
    expect(llm.prompts[1]).toContain('JSON')
    expect(llm.prompts[1]).toContain(llm.prompts[0])
  })

  it('fails the order after the second unparseable draft', async () => {
    const runtime = await boot({ llmText: ['第一次不是 JSON。', '第二次也不是 JSON。'] })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓应急方案。' })
    const failure = await runtime.fulfill(order.id).then(
      () => { throw new Error('expected a failure') },
      (thrown: unknown) => thrown,
    )
    expect(failure).toBeInstanceOf(OrdersError)
    const failed = await runtime.get(order.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toContain('JSON')
    const llm = (ctx as unknown as { llm: FakeLlm }).llm
    expect(llm.prompts).toHaveLength(2)
  })

  it('records failed with the cause and a retry converges to delivered', async () => {
    const runtime = await boot({ llmText: DRAFT_JSON })
    const order = await runtime.create({ serviceId: 'expert_services/2', brief: '海外仓应急方案。' })
    const llm = (ctx as unknown as { llm: FakeLlm }).llm
    llm.error = new Error('provider 503')
    const failure = await runtime.fulfill(order.id).then(
      () => { throw new Error('expected a failure') },
      (thrown: unknown) => thrown,
    )
    expect(failure).toBeInstanceOf(OrdersError)
    const failed = await runtime.get(order.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toContain('provider 503')
    llm.error = undefined
    const delivered = await runtime.fulfill(order.id)
    expect(delivered.status).toBe('delivered')
    const statuses = nc!.served
      .filter(request => request.path === '/api/orders:update')
      .map(request => (request.body as { status: string }).status)
    expect(statuses).toEqual(['generating', 'failed', 'generating', 'delivered'])
  })
})

describe('OrdersRuntime guards', () => {
  it('refuses to re-fulfill a delivered order', async () => {
    const runtime = await boot({ draftKeyEnv: 'EO_TEST_ABSENT_KEY' })
    const order = await runtime.create({ serviceId: 'expert_services/1', brief: '中亚货运动线。' })
    await runtime.fulfill(order.id)
    await expect(runtime.fulfill(order.id)).rejects.toMatchObject({ code: 'ORDERS_INVALID_TRANSITION' })
  })

  it('refuses fulfill for an unknown order', async () => {
    const runtime = await boot()
    await expect(runtime.fulfill(99_999)).rejects.toMatchObject({ code: 'ORDERS_ORDER_MISSING' })
  })

  it('returns undefined from get for an unknown order and lists what exists', async () => {
    const runtime = await boot()
    expect(await runtime.get(99_999)).toBeUndefined()
    const order = await runtime.create({ serviceId: 'expert_services/3', brief: '合规咨询。' })
    const list = await runtime.list()
    expect(list.map(entry => entry.id)).toContain(order.id)
  })

  it('refuses deliverable reads before delivery', async () => {
    const runtime = await boot()
    const order = await runtime.create({ serviceId: 'expert_services/3', brief: '合规咨询。' })
    await expect(runtime.readDeliverable(order.id)).rejects.toMatchObject({ code: 'ORDERS_NOT_DELIVERED' })
  })
})

describe('orders wire-row normalization (real-track row shapes)', () => {
  it('collapses NULL optional columns, drops appended attachment rows, and backfills createdAt from generatedAt', async () => {
    const runtime = await boot()
    // The shape the real NocoBase serves: SQL NULL for unset optional
    // columns, no createdAt column (creation time rides the create payload
    // only), generatedAt after delivery, and attachment row objects appended
    // under deliverable by the wire.
    nc!.orders.push({
      id: 77,
      orderNo: 'ORD-20260905-real',
      serviceId: 'expert_services/2',
      serviceName: '海外仓风险应对咨询',
      price: '¥6,800/份',
      brief: '俄罗斯海外仓受损应急。',
      clientName: '漯河宏发食品有限公司',
      expertName: '张红喜',
      expertOrg: '漯河市电子商务协会（会长）',
      status: 'delivered',
      error: null,
      deliverablePath: '/tmp/deliverables/ORD-20260905-real.pdf',
      deliverableUrl: '/files/main/main/attachments/14.pdf',
      generatedAt: '2026-09-05T14:52:18.742Z',
      note: null,
      deliverable: [{ id: 14, url: '/files/main/main/attachments/14.pdf' }],
    })
    const record = await runtime.get(77)
    expect(record).toBeDefined()
    expect(record?.error).toBeUndefined()
    expect(record?.note).toBeUndefined()
    expect('error' in (record ?? {})).toBe(false)
    expect(record?.deliverable).toBeUndefined()
    expect(record?.createdAt).toBe('2026-09-05T14:52:18.742Z')
    // No explicit null or undefined fields: the record survives a lossless
    // JSON round trip, which is what the order tools' output check requires.
    expect(JSON.parse(JSON.stringify(record ?? {}))).toEqual(record)
    const listed = await runtime.list()
    expect(listed.find(entry => entry.id === 77)?.createdAt).toBe('2026-09-05T14:52:18.742Z')
  })

  it('falls back to the empty string when neither createdAt nor generatedAt exists', () => {
    const normalized = normalizeOrderRow({
      id: 78,
      orderNo: 'ORD-20260905-pending',
      serviceId: 'expert_services/1',
      serviceName: '中亚货运动线方案',
      brief: '中亚货运动线。',
      status: 'pending',
      error: null,
      note: null,
    } as unknown as OrderRecord)
    expect(normalized.createdAt).toBe('')
    expect(normalized.error).toBeUndefined()
    expect('note' in normalized).toBe(false)
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(normalized)
  })
})

/** Extract text from a landed PDF through unpdf. */
async function extracted(path: string): Promise<{ text: string }> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(await readFile(path)))
  return extractText(pdf, { mergePages: true })
}
