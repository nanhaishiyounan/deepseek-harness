/**
 * The nb_* tool suite's behavior over the real tool runtime with a local
 * mock NocoBase server: schema discovery and the hidden filter, the
 * restricted filter vocabulary's wire compilation (eq/in/gt/lt, and/or
 * joins), sorting/projection/paging, single-row reads and their
 * missing-row refusal, the write receipts (nb_create's landing, nb_update's
 * before→after diff), the model-supplied-tenant refusal on every tool, the
 * no-credentials degraded mode, and the presentation projections.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolNocoBase from '../src/index.ts'

const signal = new AbortController().signal
const NC_TOKEN = 'tool-nocobase-spec-token'
const KEY_ENV = 'TOOL_NC_SPEC_KEY'

/** The mock backend's collection definitions (the listMeta answer). */
const META: readonly import('@deepseek-ai/dsh-connector-nocobase').NocoBaseCollectionMeta[] = [
  { name: 'experts', title: '专家', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'name', type: 'string', title: '姓名' },
    { name: 'org', type: 'string', title: '机构' },
  ] },
  { name: 'orders', title: '订单', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'orderNo', type: 'string', title: '订单号' },
    { name: 'status', type: 'string', title: '状态' },
    { name: 'amount', type: 'float', title: '金额' },
  ] },
  { name: 'pur_orders', title: '采购单', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'code', type: 'string', title: '订单号' },
    { name: 'doc_status', type: 'string', title: '审批状态' },
  ] },
  { name: 'auditLog', title: '审计日志', hidden: true, fields: [{ name: 'id', type: 'bigInt' }] },
]

interface MockServer {
  url: string
  readonly served: Array<{ method: string; path: string; query: URLSearchParams; body?: unknown }>
  readonly rows: Map<string, Array<Record<string, unknown>>>
  close: () => Promise<void>
}

/** Boot the mock NocoBase on an ephemeral port with the resourcer's wire semantics. */
async function bootMock(): Promise<MockServer> {
  const served: Array<{ method: string; path: string; query: URLSearchParams; body?: unknown }> = []
  const rows = new Map<string, Array<Record<string, unknown>>>([
    ['experts', [{ id: 1, name: '张红喜', org: '漯河市电子商务协会' }, { id: 2, name: '王顾问', org: '测试机构' }]],
    ['orders', [
      { id: 11, orderNo: 'ORD-1', status: 'pending', amount: 100 },
      { id: 12, orderNo: 'ORD-2', status: 'shipped', amount: 250 },
      { id: 13, orderNo: 'ORD-3', status: 'pending', amount: 400 },
    ]],
    ['pur_orders', [
      { id: 21, code: 'PO-2026-0001', doc_status: 'approved' },
      { id: 22, code: 'PO-2026-0002', doc_status: 'draft' },
    ]],
  ])
  let idSeq = 100
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://mock-nocobase')
    const finish = (status: number, payload: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const raw = Buffer.concat(chunks)
      const body = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8')) as unknown
      served.push({ method: request.method ?? 'GET', path: url.pathname, query: url.searchParams, ...(body === undefined ? {} : { body }) })
      if (request.headers.authorization !== `Bearer ${NC_TOKEN}`) {
        finish(401, { error: { code: 'INVALID_TOKEN' } })
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/collections:listMeta') {
        finish(200, { data: META })
        return
      }
      const listMatch = /^\/api\/([^/:]+):list$/u.exec(url.pathname)
      if (request.method === 'GET' && listMatch !== null) {
        const collection = rows.get(listMatch[1] as string)
        if (collection === undefined) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        let filtered = [...collection]
        const filterRaw = url.searchParams.get('filter')
        if (filterRaw !== null) {
          filtered = filtered.filter(row => matchesFilter(row, JSON.parse(filterRaw) as Record<string, unknown>))
        }
        const page = Number(url.searchParams.get('page') ?? 1)
        const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
        finish(200, { data: filtered.slice((page - 1) * pageSize, page * pageSize), meta: { count: filtered.length, page, pageSize } })
        return
      }
      const createMatch = /^\/api\/([^/:]+):create$/u.exec(url.pathname)
      if (request.method === 'POST' && createMatch !== null) {
        const collection = rows.get(createMatch[1] as string)
        if (collection === undefined || typeof body !== 'object' || body === null) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        const created = { ...(body as Record<string, unknown>), id: ++idSeq }
        collection.push(created)
        finish(200, { data: created })
        return
      }
      const updateMatch = /^\/api\/([^/:]+):update$/u.exec(url.pathname)
      if (request.method === 'POST' && updateMatch !== null) {
        const collection = rows.get(updateMatch[1] as string)
        const byTk = url.searchParams.get('filterByTk')
        const row = collection?.find(entry => String(entry.id) === byTk)
        if (row === undefined || typeof body !== 'object' || body === null) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        Object.assign(row, body as Record<string, unknown>)
        finish(200, { data: [row] })
        return
      }
      const getMatch = /^\/api\/([^/]+)\/([^/]+)$/u.exec(url.pathname)
      if (request.method === 'GET' && getMatch !== null) {
        const collection = rows.get(getMatch[1] as string)
        const row = collection?.find(entry => String(entry.id) === getMatch[2])
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
    rows,
    close: () => new Promise<void>((resolve) => { server.close(() => { resolve() }) }),
  }
}

/** Apply one mock-side filter tree: top-level keys AND, `$or` any-clause, `$eq`/`$in`/`$gt`/`$lt`/`$includes` operators. */
function matchesFilter(row: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [field, cell] of Object.entries(filter)) {
    if (field === '$or') {
      const clauses = cell as Array<Record<string, unknown>>
      if (!clauses.some(clause => matchesFilter(row, clause))) return false
      continue
    }
    if (typeof cell !== 'object' || cell === null) {
      if (row[field] !== cell) return false
      continue
    }
    const operators = cell as Record<string, unknown>
    if ('$eq' in operators && row[field] !== operators.$eq) return false
    if ('$in' in operators && !Array.isArray(operators.$in)) return false
    if ('$in' in operators && Array.isArray(operators.$in) && !operators.$in.includes(row[field])) return false
    if ('$gt' in operators && !(typeof row[field] === 'number' && row[field] > (operators.$gt as number))) return false
    if ('$lt' in operators && !(typeof row[field] === 'number' && row[field] < (operators.$lt as number))) return false
    if ('$includes' in operators && !(typeof row[field] === 'string' && row[field].includes(operators.$includes as string))) return false
    if ('$like' in operators && !(typeof row[field] === 'string' && row[field].startsWith(String(operators.$like).replaceAll('%', '')))) return false
  }
  return true
}

const contexts: Context[] = []
const servers: Array<{ close: () => Promise<void> }> = []

afterEach(async () => {
  Reflect.deleteProperty(process.env, KEY_ENV)
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
  await Promise.all(servers.splice(0).map(server => server.close()))
})

let counter = 0

interface ExecuteResult {
  isError: boolean
  value: unknown
  text: string
  meta?: unknown
}

type Execute = (name: string, args: unknown) => Promise<ExecuteResult>

/** One mounted suite over the mock backend (or without credentials for the degraded mode). */
interface Mount {
  execute: Execute
  mock: MockServer | undefined
}

async function mount(options: { degraded?: boolean } = {}): Promise<Mount> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  let mock: MockServer | undefined
  if (options.degraded !== true) {
    mock = await bootMock()
    process.env[KEY_ENV] = NC_TOKEN
    await ctx.plugin(ToolNocoBase, { baseUrl: mock.url, apiKeyEnv: KEY_ENV })
  } else {
    // No baseUrl config and no ambient env: the credential resolution degrades.
    delete process.env.NOCOBASE_BASE_URL
    await ctx.plugin(ToolNocoBase, { apiKeyEnv: KEY_ENV })
  }
  const execute = async (name: string, args: unknown): Promise<ExecuteResult> => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '', meta: result.meta }
  }
  return { execute, mock }
}

describe('nb_collections', () => {
  it('lists the visible collections with their fields and drops hidden ones unless asked', async () => {
    const { execute } = await mount()
    const result = await execute('nb_collections', {})
    expect(result.isError).toBe(false)
    expect(result.text).toContain('### experts（专家）')
    expect(result.text).toContain('- name 姓名: string')
    expect(result.text).toContain('### orders（订单）')
    expect(result.text).not.toContain('auditLog')
    expect(result.value).toMatchObject({ collections: [
      { name: 'experts', title: '专家' },
      { name: 'orders', title: '订单' },
      { name: 'pur_orders', title: '采购单' },
    ] })
    expect(result.meta).toEqual({ collections: 3 })
    const hidden = await execute('nb_collections', { include_hidden: true })
    expect(hidden.text).toContain('auditLog')
    expect(hidden.meta).toEqual({ collections: 4 })
  })

  it('rejects a model-supplied tenant', async () => {
    const { execute } = await mount()
    const result = await execute('nb_collections', { tenant: 'evil' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('a tenant argument is not accepted')
  })
})

describe('nb_list', () => {
  it('compiles eq conditions to the wire filter and answers the page', async () => {
    const { execute, mock } = await mount()
    const result = await execute('nb_list', { collection: 'orders', filter: [{ field: 'status', op: 'eq', value: 'pending' }] })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ collection: 'orders', count: 2, page: 1, page_size: 20 })
    expect(JSON.parse(mock!.served[0]!.query.get('filter') ?? 'null')).toEqual({ status: { $eq: 'pending' } })
    expect(result.meta).toMatchObject({ collection: 'orders', count: 2, filters: ['status eq pending'] })
  })

  it('joins conditions with and by merging same-field operators and with or via $or clauses', async () => {
    const { execute, mock } = await mount()
    await execute('nb_list', {
      collection: 'orders',
      filter: [{ field: 'amount', op: 'gt', value: 150 }, { field: 'amount', op: 'lt', value: 300 }],
    })
    expect(JSON.parse(mock!.served[0]!.query.get('filter') ?? 'null')).toEqual({ amount: { $gt: 150, $lt: 300 } })
    await execute('nb_list', {
      collection: 'orders',
      match: 'or',
      filter: [{ field: 'status', op: 'in', value: ['shipped'] }, { field: 'amount', op: 'gt', value: 300 }],
    })
    expect(JSON.parse(mock!.served[1]!.query.get('filter') ?? 'null')).toEqual({ $or: [{ status: { $in: ['shipped'] } }, { amount: { $gt: 300 } }] })
    const rows = await execute('nb_list', { collection: 'orders', match: 'or', filter: [{ field: 'status', op: 'in', value: ['shipped'] }] })
    expect(rows.value).toMatchObject({ count: 1 })
  })

  it('passes sort and fields through and bounds the page size', async () => {
    const { execute, mock } = await mount()
    await execute('nb_list', { collection: 'orders', sort: ['-amount'], fields: ['orderNo'], page_size: 2 })
    expect(mock!.served[0]!.query.get('sort')).toBe('-amount')
    expect(mock!.served[0]!.query.get('fields')).toBe('orderNo')
    expect(mock!.served[0]!.query.get('pageSize')).toBe('2')
    const oversized = await execute('nb_list', { collection: 'orders', page_size: 101 })
    expect(oversized.isError).toBe(true)
    expect(oversized.text).toContain('between 1 and 100')
  })

  it('refuses malformed conditions: non-empty collection, in without an array, scalar ops fed arrays', async () => {
    const { execute } = await mount()
    const empty = await execute('nb_list', { collection: '  ' })
    expect(empty.isError).toBe(true)
    const inScalar = await execute('nb_list', { collection: 'orders', filter: [{ field: 'status', op: 'in', value: 'pending' }] })
    expect(inScalar.isError).toBe(true)
    expect(inScalar.text).toContain('op "in" needs a non-empty array')
    const eqArray = await execute('nb_list', { collection: 'orders', filter: [{ field: 'status', op: 'eq', value: ['pending'] }] })
    expect(eqArray.isError).toBe(true)
    expect(eqArray.text).toContain('needs a scalar value')
  })

  it('compiles includes to the $includes wire operator for fuzzy matching', async () => {
    const { execute, mock } = await mount()
    const result = await execute('nb_list', { collection: 'experts', filter: [{ field: 'name', op: 'includes', value: '红喜' }] })
    expect(result.isError).toBe(false)
    expect(JSON.parse(mock!.served[0]!.query.get('filter') ?? 'null')).toEqual({ name: { $includes: '红喜' } })
    expect(result.value).toMatchObject({ collection: 'experts', count: 1 })
    expect(result.meta).toMatchObject({ filters: ['name includes 红喜'] })
  })

  it('refuses like, naming the supported operators (including includes) in the refusal', async () => {
    const { execute } = await mount()
    const result = await execute('nb_list', { collection: 'experts', filter: [{ field: 'name', op: 'like', value: '张%' }] })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('must be one of')
    expect(result.text).toContain('includes')
  })

  it('rejects a model-supplied tenant', async () => {
    const { execute } = await mount()
    const result = await execute('nb_list', { collection: 'orders', tenant: 'evil' })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('a tenant argument is not accepted')
  })
})

describe('nb_get', () => {
  it('reads one row and reports a missing row loudly', async () => {
    const { execute } = await mount()
    const result = await execute('nb_get', { collection: 'orders', id: 12 })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({ collection: 'orders', row: { id: 12, orderNo: 'ORD-2', status: 'shipped' } })
    expect(result.meta).toEqual({ collection: 'orders', id: 12 })
    const missing = await execute('nb_get', { collection: 'orders', id: 999 })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('no row 999 exists in orders')
  })

  it('rejects a non-positive id and a model-supplied tenant', async () => {
    const { execute } = await mount()
    const bad = await execute('nb_get', { collection: 'orders', id: 0 })
    expect(bad.isError).toBe(true)
    const tenant = await execute('nb_get', { collection: 'orders', id: 1, tenant: 'evil' })
    expect(tenant.isError).toBe(true)
  })
})

describe('nb_create', () => {
  it('lands the row and answers the receipt with the server-assigned id', async () => {
    const { execute, mock } = await mount()
    const result = await execute('nb_create', { collection: 'orders', values: { orderNo: 'ORD-9', status: 'pending', amount: 88 } })
    expect(result.isError).toBe(false)
    const value = result.value as { id: number; row: Record<string, unknown> }
    expect(value.row).toMatchObject({ orderNo: 'ORD-9', status: 'pending', amount: 88 })
    // Durable on the collection the mock serves.
    expect(mock!.rows.get('orders')?.some(row => row.id === value.id && row.orderNo === 'ORD-9')).toBe(true)
    expect(result.text).toContain(`已在 orders 创建第 ${value.id} 行`)
    expect(result.meta).toEqual({ collection: 'orders', id: value.id })
  })

  it('refuses values without fields and values carrying an id, and a model-supplied tenant', async () => {
    const { execute } = await mount()
    const empty = await execute('nb_create', { collection: 'orders', values: {} })
    expect(empty.isError).toBe(true)
    expect(empty.text).toContain('at least one field')
    const withId = await execute('nb_create', { collection: 'orders', values: { id: 5, orderNo: 'X' } })
    expect(withId.isError).toBe(true)
    expect(withId.text).toContain('must not carry an id')
    const tenant = await execute('nb_create', { collection: 'orders', values: { orderNo: 'X' }, tenant: 'evil' })
    expect(tenant.isError).toBe(true)
  })

  it('refuses a duplicate code on a guarded collection before anything is written (B5 #1 anti-collision)', async () => {
    const { execute, mock } = await mount()
    const result = await execute('nb_create', { collection: 'pur_orders', values: { code: 'PO-2026-0002', doc_status: 'draft' } })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('单据编号撞号：pur_orders 已存在 code=PO-2026-0002（第 22 行）')
    // Nothing landed: the row count and the create wire call both prove it.
    expect(mock!.rows.get('pur_orders')).toHaveLength(2)
    expect(mock!.served.some(call => call.path === '/api/pur_orders:create')).toBe(false)
  })

  it('lands a free code on a guarded collection and leaves unguarded collections untouched', async () => {
    const { execute, mock } = await mount()
    const free = await execute('nb_create', { collection: 'pur_orders', values: { code: 'PO-2026-0003', doc_status: 'draft' } })
    expect(free.isError).toBe(false)
    expect(mock!.rows.get('pur_orders')).toHaveLength(3)
    // Unguarded collections never draw a number (no list read-back).
    const servedBefore = mock!.served.length
    const unguarded = await execute('nb_create', { collection: 'orders', values: { status: 'pending' } })
    expect(unguarded.isError).toBe(false)
    expect(mock!.served.slice(servedBefore).some(call => call.path === '/api/orders:list')).toBe(false)
  })

  it('server-assigns the next number when the guarded column arrives empty (W6-B1 G5)', async () => {
    const { execute, mock } = await mount()
    const year = new Date().getFullYear()
    // The mock seeds PO-YYYY-0001/0002; an empty code draws max+1 inside the
    // write path — the mobile preview number never lands.
    const drawn = await execute('nb_create', { collection: 'pur_orders', values: { code: '', doc_status: 'draft' } })
    expect(drawn.isError).toBe(false)
    const landed = drawn.value as { row: Record<string, unknown> }
    expect(landed.row['code']).toBe(`PO-${String(year)}-0003`)
    expect(mock!.rows.get('pur_orders')?.filter(row => row.code === `PO-${String(year)}-0003`)).toHaveLength(1)
    // Two concurrent empty-code drafts both land: each draw re-reads the
    // live rows, so the second draw takes the next number (no preview
    // collision, no fail-loud bounce).
    const again = await execute('nb_create', { collection: 'pur_orders', values: { code: '', doc_status: 'draft' } })
    expect(again.isError).toBe(false)
    const landedAgain = again.value as { row: Record<string, unknown> }
    expect(landedAgain.row['code']).toBe(`PO-${String(year)}-0004`)
    const codes = mock!.rows.get('pur_orders')?.map(row => String(row.code))
    expect(new Set(codes).size).toBe(codes?.length)
  })

  it('draws from the current year band even when probe numbers outrank it lexically (W6-B1 G5)', async () => {
    const { execute, mock } = await mount()
    const year = new Date().getFullYear()
    // Probe-style codes sort ABOVE PO-YYYY-… lexically; the plain descending
    // first page would miss the year's real max and restart at 0001 (the
    // live incident the closure probe exposed).
    mock!.rows.get('pur_orders')!.unshift(
      { id: 900, code: 'PO-W6B1-20261001114916', doc_status: 'approved' },
      { id: 901, code: 'PO-W6B0-20260930', doc_status: 'rejected' },
    )
    const drawn = await execute('nb_create', { collection: 'pur_orders', values: { code: '', doc_status: 'draft' } })
    expect(drawn.isError).toBe(false)
    const landed = drawn.value as { row: Record<string, unknown> }
    expect(landed.row['code']).toBe(`PO-${String(year)}-0003`)
  })
})

describe('nb_update', () => {
  it('answers the before→after diff receipt for exactly the changed fields', async () => {
    const { execute, mock } = await mount()
    const result = await execute('nb_update', { collection: 'orders', id: 11, values: { status: 'shipped', amount: 120 } })
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      collection: 'orders',
      id: 11,
      changes: [
        { field: 'status', before: 'pending', after: 'shipped' },
        { field: 'amount', before: 100, after: 120 },
      ],
    })
    expect(result.text).toContain('- status: "pending" → "shipped"')
    expect(result.text).toContain('- amount: 100 → 120')
    // The wire read the row before writing it (the diff's before source).
    const paths = mock!.served.map(call => call.path)
    expect(paths).toContain('/api/orders/11')
    expect(paths).toContain('/api/orders:update')
    // Stored on the mock's collection.
    expect(mock!.rows.get('orders')?.find(row => row.id === 11)).toMatchObject({ status: 'shipped', amount: 120 })
    expect(result.meta).toEqual({ collection: 'orders', id: 11, changed: ['status', 'amount'] })
  })

  it('reports a missing row loudly and refuses id-carrying values and a model-supplied tenant', async () => {
    const { execute } = await mount()
    const missing = await execute('nb_update', { collection: 'orders', id: 999, values: { status: 'x' } })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('no row 999 exists in orders')
    const withId = await execute('nb_update', { collection: 'orders', id: 11, values: { id: 12, status: 'x' } })
    expect(withId.isError).toBe(true)
    expect(withId.text).toContain('must not carry an id')
    const tenant = await execute('nb_update', { collection: 'orders', id: 11, values: { status: 'x' }, tenant: 'evil' })
    expect(tenant.isError).toBe(true)
  })

  it('refuses a code-changing patch that collides with another row (R3 #1: the update side door is closed)', async () => {
    const { execute, mock } = await mount()
    // Row 21 (approved) holds PO-2026-0001; drafting row 22 cannot take it.
    const result = await execute('nb_update', { collection: 'pur_orders', id: 22, values: { code: 'PO-2026-0001' } })
    expect(result.isError).toBe(true)
    expect(result.text).toContain('单据编号撞号：pur_orders 已存在 code=PO-2026-0001（第 21 行）')
    // Refused before the write: no update wire call, row 22 keeps its number.
    expect(mock!.served.some(call => call.path === '/api/pur_orders:update')).toBe(false)
    expect(mock!.rows.get('pur_orders')?.find(row => row.id === 22)).toMatchObject({ code: 'PO-2026-0002' })
  })

  it('lets a code-changing patch land a free number and re-entering the row\'s own number (excludeId)', async () => {
    const { execute, mock } = await mount()
    const freed = await execute('nb_update', { collection: 'pur_orders', id: 22, values: { code: 'PO-2026-0009' } })
    expect(freed.isError).toBe(false)
    expect(mock!.rows.get('pur_orders')?.find(row => row.id === 22)).toMatchObject({ code: 'PO-2026-0009' })
    // Re-entering the row's own number is not a collision — the guard's
    // excludeId exempts the row itself.
    const kept = await execute('nb_update', { collection: 'pur_orders', id: 22, values: { code: 'PO-2026-0009' } })
    expect(kept.isError).toBe(false)
  })

  it('leaves patches without a guarded number column untouched by the lookup', async () => {
    const { execute, mock } = await mount()
    const servedBefore = mock!.served.length
    const result = await execute('nb_update', { collection: 'pur_orders', id: 22, values: { doc_status: 'approved' } })
    expect(result.isError).toBe(false)
    expect(mock!.rows.get('pur_orders')?.find(row => row.id === 22)).toMatchObject({ doc_status: 'approved' })
    expect(mock!.served.slice(servedBefore).some(call => call.path === '/api/pur_orders:list' && call.query.get('filter')?.includes('code'))).toBe(false)
  })
})

describe('credential resolution paths', () => {
  it('resolves through the credentials seam and the ambient environment when config omits the base url', async () => {
    const mock = await bootMock()
    process.env.NOCOBASE_BASE_URL = mock.url
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    ctx.provide('credentials', { resolve: async () => ({ value: NC_TOKEN }) } as never)
    await ctx.plugin(ToolNocoBase, { apiKeyEnv: KEY_ENV })
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name: 'nb_list', arguments: { collection: 'orders' } })
    expect(result.isError).toBe(false)
    Reflect.deleteProperty(process.env, 'NOCOBASE_BASE_URL')
  })
})

describe('degraded mode and guidance', () => {
  it('fails every tool with the structured no-credentials refusal when nothing resolves', async () => {
    const { execute } = await mount({ degraded: true })
    for (const [name, args] of [
      ['nb_collections', {}],
      ['nb_list', { collection: 'orders' }],
      ['nb_get', { collection: 'orders', id: 1 }],
      ['nb_create', { collection: 'orders', values: { orderNo: 'X' } }],
      ['nb_update', { collection: 'orders', id: 1, values: { status: 'x' } }],
    ] as const) {
      const result = await execute(name, args)
      expect(result.isError).toBe(true)
      expect(result.text).toContain('resolves no NocoBase credentials')
    }
  })

  it('registers the confirmation-contract guidance sections', async () => {
    const { execute } = await mount()
    // The guidance presence is asserted on the assembled prompt text.
    const ctx = contexts.at(-1)!
    const prompt = renderPrompt(await ctx.systemPrompt.assemble())
    expect(prompt).toContain('nb_collections')
    expect(prompt).toContain('before→after diff')
    expect(prompt).toContain('only AFTER the user explicitly confirmed')
    const result = await execute('nb_list', { collection: 'orders' })
    expect(result.isError).toBe(false)
  })
})
