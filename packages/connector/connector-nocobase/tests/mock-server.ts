import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The bearer token the mock server accepts. */
export const MOCK_TOKEN = 'mock-nocobase-token'

/**
 * Every request the mock server served, for wire-shape assertions; `body`
 * carries the decoded JSON body on `:create` posts.
 */
interface ServedRequest {
  readonly method: string
  readonly path: string
  readonly query: URLSearchParams
  readonly authorization?: string
  readonly body?: unknown
}

export interface MockNocoBase {
  url: string
  readonly served: ServedRequest[]
  close(): Promise<void>
}

/**
 * The 张红喜 expert dataset's authoritative fixture source: the same JSON
 * `examples/kb-agent/scripts/seed-experts.mts` seeds real NocoBase instances
 * from, so the mock wire and the seeded backend can never drift apart.
 */
const FIXTURE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../examples/kb-agent/workspace/data/experts/dataset.json',
)

interface ExpertFixtures {
  experts: import('../src/provider.ts').NocoBaseExpertRow[]
  expert_services: import('../src/provider.ts').NocoBaseServiceRow[]
  datasets: import('../src/provider.ts').NocoBaseDatasetRow[]
  customs_export: import('../src/provider.ts').NocoBaseSourceRow[]
  /** Orders start empty: specs create them through `orders:create`. */
  orders: object[]
}

const fixtures = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as ExpertFixtures

/** The expert rows (张红喜's real seeded profile; specs may push extras). */
export const EXPERT_ROWS: import('../src/provider.ts').NocoBaseExpertRow[] = fixtures.experts

/** Registered datasets: the customs ledger, the guide, and the expert's own risk handbook. */
export const DATASET_ROWS: import('../src/provider.ts').NocoBaseDatasetRow[] = fixtures.datasets

/** The expert service catalog rows (deliverable + pricing). */
export const SERVICE_ROWS: import('../src/provider.ts').NocoBaseServiceRow[] = fixtures.expert_services

/** Rows of the tabular dataset's source collection. */
export const CUSTOMS_EXPORT_ROWS: import('../src/provider.ts').NocoBaseSourceRow[] = fixtures.customs_export

/** The empty orders ledger the mock serves (created through `orders:create`). */
const ORDER_ROWS: object[] = fixtures.orders

/** All collections the mock server serves, keyed by name; rows stay opaque until the JSON boundary. */
const COLLECTIONS: Readonly<Record<string, readonly object[]>> = {
  experts: EXPERT_ROWS,
  datasets: DATASET_ROWS,
  expert_services: SERVICE_ROWS,
  customs_export: CUSTOMS_EXPORT_ROWS,
  orders: ORDER_ROWS,
}

/**
 * The collection definitions `collections:listMeta` serves: the same five
 * collections `setup-nocobase.mts` declares on real backends, so the mock wire
 * and the seeded instance can never drift apart.
 */
const LIST_META: readonly import('../src/client.ts').NocoBaseCollectionMeta[] = [
  { name: 'experts', title: '专家', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'name', type: 'string', title: '姓名' },
    { name: 'org', type: 'string', title: '机构' },
    { name: 'domains', type: 'string', title: '领域' },
    { name: 'bio', type: 'text', title: '简介' },
  ] },
  { name: 'expert_services', title: '专家服务', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'expertId', type: 'integer', title: '专家' },
    { name: 'name', type: 'string', title: '名称' },
    { name: 'deliverable', type: 'string', title: '交付物' },
    { name: 'price', type: 'string', title: '价格' },
    { name: 'summary', type: 'text', title: '摘要' },
  ] },
  { name: 'datasets', title: '知识资产登记', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'kind', type: 'string', title: '类别' },
    { name: 'title', type: 'string', title: '标题' },
    { name: 'collection', type: 'string', title: '源集合' },
    { name: 'tableName', type: 'string', title: '表名' },
    { name: 'content', type: 'text', title: '内容' },
  ] },
  { name: 'customs_export', title: '海关出口台账', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'region', type: 'string', title: '地区' },
    { name: 'month', type: 'string', title: '月份' },
    { name: 'amount_t', type: 'float', title: '金额（吨）' },
  ] },
  { name: 'orders', title: '专家服务订单', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'orderNo', type: 'string', title: '订单号' },
    { name: 'serviceId', type: 'string', title: '服务' },
    { name: 'serviceName', type: 'string', title: '服务名' },
    { name: 'price', type: 'string', title: '价格' },
    { name: 'brief', type: 'text', title: '需求' },
    { name: 'clientName', type: 'string', title: '客户' },
    { name: 'status', type: 'string', title: '状态' },
  ] },
]

const servers: Server[] = []

/** Close every mock server opened since the last call; run from each spec's afterEach. */
export async function closeMockServers(): Promise<void> {
  await Promise.all(servers.splice(0).map(server => new Promise(resolve => server.close(resolve))))
}

/**
 * Read one request's body: JSON bodies decode (an empty body reads as
 * undefined); every other media type (the upload action's multipart) hands
 * the raw buffer over undecoded.
 */
function readBody(
  request: IncomingMessage,
  onBody: (body: unknown, raw: Buffer, contentType: string) => void,
): void {
  const chunks: Buffer[] = []
  request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
  request.on('end', () => {
    const raw = Buffer.concat(chunks)
    const contentType = request.headers['content-type'] ?? ''
    if (contentType.startsWith('application/json')) {
      onBody(raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8')), raw, contentType)
      return
    }
    onBody(undefined, raw, contentType)
  })
}

/**
 * One `$or` clause: true when any field's string cell includes the condition
 * (`$includes`) or any cell equals the condition (`$eq` / a bare value).
 */
function matchesClause(row: object, clause: Record<string, unknown>): boolean {
  const record = row as Record<string, unknown>
  for (const [field, rawCondition] of Object.entries(clause)) {
    if (rawCondition !== null && typeof rawCondition === 'object' && '$includes' in (rawCondition as Record<string, unknown>)) {
      const cell = record[field]
      if (typeof cell === 'string' && cell.includes((rawCondition as { $includes?: string }).$includes ?? '')) return true
      continue
    }
    const expected = rawCondition !== null && typeof rawCondition === 'object' && '$eq' in (rawCondition as Record<string, unknown>)
      ? (rawCondition as { $eq?: unknown }).$eq
      : rawCondition
    if (record[field] === expected) return true
  }
  return false
}

/**
 * Apply a NocoBase filter tree: top-level `$or` matches any clause; every
 * other top-level key is an equality conjunction over bare values and
 * `$eq`/`$includes` conditions.
 */
function applyFilter(rows: readonly object[], filterRaw: string): readonly object[] {
  const filter = JSON.parse(filterRaw) as Record<string, unknown>
  let filtered = rows
  const orClauses = filter.$or
  if (Array.isArray(orClauses)) {
    filtered = filtered.filter(row => orClauses.some(clause => matchesClause(row, clause as Record<string, unknown>)))
  }
  for (const [field, rawCondition] of Object.entries(filter)) {
    if (field === '$or') continue
    const expected = expectedOf(rawCondition)
    filtered = expected === undefined
      ? filtered.filter(row => includesCell(row, field, rawCondition as { $includes?: string }))
      : filtered.filter(row => (row as Record<string, unknown>)[field] === expected)
  }
  return filtered
}

/** The equality operand a condition cell carries: `$eq`'s value, a bare value, or `$includes`-shaped undefined. */
function expectedOf(rawCondition: unknown): unknown {
  if (rawCondition !== null && typeof rawCondition === 'object' && '$eq' in (rawCondition as Record<string, unknown>)) {
    return (rawCondition as { $eq?: unknown }).$eq
  }
  if (rawCondition !== null && typeof rawCondition === 'object' && '$includes' in (rawCondition as Record<string, unknown>)) {
    return undefined
  }
  return rawCondition
}

/** Apply the resourcer's comma-joined sort keys; a leading `-` marks descending. */
function applySort(rows: readonly object[], sortRaw: string | null): readonly object[] {
  if (sortRaw === null) return rows
  const keys = sortRaw.split(',').map(key => key.trim()).filter(key => key.length > 0)
  if (keys.length === 0) return rows
  const sorted = [...rows]
  sorted.sort((left, right) => {
    for (const key of keys) {
      const descending = key.startsWith('-')
      const field = descending ? key.slice(1) : key
      const compared = compareCells((left as Record<string, unknown>)[field], (right as Record<string, unknown>)[field])
      if (compared !== 0) return descending ? -compared : compared
    }
    return 0
  })
  return sorted
}

/** Compare two cells for sorting: defined ordering with undefined/null last; numbers numerically, everything else as text. */
function compareCells(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === undefined || a === null) return 1
  if (b === undefined || b === null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : 1
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : 1
  return JSON.stringify(a) < JSON.stringify(b) ? -1 : 1
}

/** Apply the resourcer's comma-joined field projection; the primary key always survives. */
function applyFields(rows: readonly object[], fieldsRaw: string | null): readonly object[] {
  if (fieldsRaw === null) return rows
  const fields = fieldsRaw.split(',').map(field => field.trim()).filter(field => field.length > 0)
  if (fields.length === 0) return rows
  const keep = new Set([...fields, 'id'])
  return rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => keep.has(key))))
}

/** True when the row's cell is a string including the condition's `$includes` operand. */
function includesCell(row: object, field: string, condition: { $includes?: string }): boolean {
  const cell = (row as Record<string, unknown>)[field]
  return typeof cell === 'string' && cell.includes(condition.$includes ?? '')
}

/**
 * A local NocoBase stand-in serving the mapped collections with the
 * resourcer's wire semantics: action-style `GET /api/<collection>:list`
 * (URL-encoded JSON `filter` with `$or`/`$includes`/`$eq`, `page`,
 * `pageSize`, envelope `{count, rows, page, pageSize}`), action-style
 * `POST /api/<collection>:create` (body `{values}` → server-assigned id),
 * REST-style `GET /api/<collection>/<id>` (404 for unknown ids), the
 * file-manager's multipart `POST /api/attachments:upload` (the `file`
 * part's filename becomes the identity; the served url stays
 * storage-relative), and `401` without the bearer token.
 */
export async function mockNocoBaseServer(): Promise<MockNocoBase> {
  const served: ServedRequest[] = []
  let attachmentSeq = 0
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://mock-nocobase')
    const path = url.pathname
    const query = url.searchParams
    const finish = (status: number, payload: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
    }
    // POST bodies stream in; the request log and every route run from `end`.
    readBody(request, (body, raw, contentType) => {
      served.push({
        method: request.method ?? 'GET',
        path,
        query,
        ...(request.headers.authorization === undefined ? {} : { authorization: request.headers.authorization }),
        ...(body === undefined ? {} : { body }),
      })
      if (request.headers.authorization !== `Bearer ${MOCK_TOKEN}`) {
        finish(401, { error: { code: 'INVALID_TOKEN', message: 'token invalid' } })
        return
      }
      if (request.method === 'POST' && path === '/api/attachments:upload') {
        if (!contentType.startsWith('multipart/form-data')) {
          finish(400, { error: { code: 'BAD_REQUEST', message: 'upload expects multipart/form-data with a file field' } })
          return
        }
        // The stored row mirrors the file-manager's: the multipart filename
        // becomes the identity and the served url stays storage-relative (a
        // deterministic value, so transcript snapshots never see the port).
        const named = /filename="([^"]+)"/u.exec(raw.toString('utf8'))
        const filename = named?.[1] ?? 'upload.bin'
        attachmentSeq += 1
        finish(200, { data: { id: attachmentSeq, title: filename, filename, mimetype: 'application/pdf', size: raw.length, url: `/storage/uploads/${filename}` } })
        return
      }
      const listMatch = /^\/api\/([^/:]+):list$/u.exec(path)
      if (request.method === 'GET' && listMatch !== null) {
        const rows = COLLECTIONS[listMatch[1] as string]
        if (rows === undefined) {
          finish(404, { error: { code: 'NOT_FOUND', message: `collection ${listMatch[1]} not found` } })
          return
        }
        const page = Number(query.get('page') ?? 1)
        const pageSize = Number(query.get('pageSize') ?? 20)
        const filterRaw = query.get('filter')
        const filtered = filterRaw === null ? rows : applyFilter(rows, filterRaw)
        const sorted = applySort(filtered, query.get('sort'))
        const projected = applyFields(sorted, query.get('fields'))
        // v2 wire: `{data: rows, meta: {count, page, pageSize, totalPage}}`.
        const pageRows = projected.slice((page - 1) * pageSize, page * pageSize)
        const totalPage = Math.ceil(projected.length / pageSize)
        finish(200, { data: pageRows, meta: { count: projected.length, page, pageSize, totalPage } })
        return
      }
      if (request.method === 'GET' && path === '/api/collections:listMeta') {
        finish(200, { data: LIST_META })
        return
      }
      const createMatch = /^\/api\/([^/:]+):create$/u.exec(path)
      if (request.method === 'POST' && createMatch !== null) {
        const rows = COLLECTIONS[createMatch[1] as string]
        if (rows === undefined) {
          finish(404, { error: { code: 'NOT_FOUND', message: `collection ${createMatch[1]} not found` } })
          return
        }
        // v2 wire: the POST body's top level IS the action's values.
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          finish(400, { error: { code: 'BAD_REQUEST', message: 'create expects the row fields at the body top level' } })
          return
        }
        const values = body as Record<string, unknown>
        const maxId = rows.reduce((best, row) => {
          const id = (row as Record<string, unknown>).id
          return typeof id === 'number' && id > best ? id : best
        }, 0)
        const created = { ...values, id: maxId + 1 }
        ;(rows as object[]).push(created)
        finish(200, { data: created })
        return
      }
      const updateMatch = /^\/api\/([^/:]+):update$/u.exec(path)
      if (request.method === 'POST' && updateMatch !== null) {
        const rows = COLLECTIONS[updateMatch[1] as string]
        if (rows === undefined) {
          finish(404, { error: { code: 'NOT_FOUND', message: `collection ${updateMatch[1]} not found` } })
          return
        }
        const byTk = query.get('filterByTk')
        const row = byTk === null ? undefined : rows.find(entry => String((entry as Record<string, unknown>).id) === byTk)
        if (row === undefined) {
          finish(404, { error: { code: 'NOT_FOUND', message: 'record not found' } })
          return
        }
        // v2 wire: the row is addressed by the filterByTk query parameter and
        // the POST body's top level IS the changed fields; the answer wraps
        // the stored row in a one-element data array.
        if (typeof body !== 'object' || body === null || Array.isArray(body)) {
          finish(400, { error: { code: 'BAD_REQUEST', message: 'update expects the changed fields at the body top level' } })
          return
        }
        const stored = row as Record<string, unknown>
        for (const [key, value] of Object.entries(body as Record<string, unknown>)) stored[key] = value
        finish(200, { data: [stored] })
        return
      }
      const getMatch = /^\/api\/([^/]+)\/([^/]+)$/u.exec(path)
      if (request.method === 'GET' && getMatch !== null) {
        const rows = COLLECTIONS[getMatch[1] as string]
        const row = rows?.find(entry => String((entry as Record<string, unknown>).id) === getMatch[2])
        // v2 wire: a missing row answers 200 with `{data: null}`, not a 404.
        finish(200, { data: row ?? null })
        return
      }
      finish(404, { error: { code: 'NOT_FOUND', message: `no route for ${path}` } })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  servers.push(server)
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  return {
    url: `http://127.0.0.1:${address.port}`,
    served,
    close: async () => { await new Promise(resolve => server.close(resolve)) },
  }
}
