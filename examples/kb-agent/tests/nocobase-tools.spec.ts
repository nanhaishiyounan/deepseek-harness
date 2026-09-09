/**
 * Keyless nocobase-tools snapshot over the real Loader composition: a mock
 * NocoBase server (real HTTP on 127.0.0.1, the resourcer's wire semantics)
 * backs the nb_* suite, and one business journey runs through the real tool
 * registry — schema discovery, filtered row reads, the pre-change current
 * read, the confirmed update's before→after diff receipt, and the create
 * receipt — with the no-write-before-confirmation fact asserted on the mock
 * between the reads and the writes. Hermetic by construction (every path
 * and the mock server's url are test-provided). Refresh with
 * `DSH_SNAPSHOT=refresh pnpm vitest run <this file>`.
 */

import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolNocoBase from '@deepseek-ai/dsh-tool-nocobase'
import { closeHttpServer } from '../scripts/nocobase-workflow.ts'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/nocobase-tools.cordis.yml')
const snapshotsDir = join(here, 'snapshots/nocobase-tools')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal
const NC_TOKEN = 'nocobase-tools-snapshot-token'

/** The mock backend's collection definitions (mirrors the seeded instance's five). */
const META: readonly object[] = [
  { name: 'experts', title: '专家', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'name', type: 'string', title: '姓名' },
    { name: 'org', type: 'string', title: '机构' },
  ] },
  { name: 'orders', title: '专家服务订单', filterTargetKey: 'id', fields: [
    { name: 'id', type: 'bigInt' },
    { name: 'orderNo', type: 'string', title: '订单号' },
    { name: 'serviceName', type: 'string', title: '服务名' },
    { name: 'status', type: 'string', title: '状态' },
  ] },
]

/** The seeded journey rows (module-level so create/update mutate one store per boot). */
const ROWS = new Map<string, Array<Record<string, unknown>>>([
  ['experts', [{ id: 1, name: '张红喜', org: '漯河市电子商务协会' }]],
  ['orders', [
    { id: 101, orderNo: 'ORD-101', serviceName: '中亚货运动线方案', status: 'pending' },
    { id: 102, orderNo: 'ORD-102', serviceName: '出口合规审查', status: 'delivered' },
  ]],
])

let root: string | undefined
let ctx: Context | undefined
let ncServer: Server | undefined
let counter = 0
/** Paths the mock served, for the no-write-before-confirmation assertion. */
let servedPaths: string[] = []

beforeEach(() => {
  // Reset the per-boot store so a re-run mutates from the seed, not leftovers.
  ROWS.set('experts', [{ id: 1, name: '张红喜', org: '漯河市电子商务协会' }])
  ROWS.set('orders', [
    { id: 101, orderNo: 'ORD-101', serviceName: '中亚货运动线方案', status: 'pending' },
    { id: 102, orderNo: 'ORD-102', serviceName: '出口合规审查', status: 'delivered' },
  ])
  servedPaths = []
})

afterEach(async () => {
  delete process.env.NB_TEST_NC_URL
  delete process.env.NB_TEST_NC_TOKEN
  await ctx?.fiber.dispose()
  ctx = undefined
  await closeHttpServer(ncServer)
  ncServer = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the mock NocoBase on an ephemeral local port with the resourcer's wire semantics. */
async function bootMockNocoBase(): Promise<string> {
  let idSeq = 200
  const server: Server = createServer((request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://mock-nocobase')
    const finish = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const raw = Buffer.concat(chunks)
      const body = raw.length === 0 ? undefined : JSON.parse(raw.toString('utf8')) as unknown
      servedPaths.push(url.pathname)
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
        const rows = ROWS.get(listMatch[1] as string)
        if (rows === undefined) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        let filtered = [...rows]
        const filterRaw = url.searchParams.get('filter')
        if (filterRaw !== null) {
          const filter = JSON.parse(filterRaw) as Record<string, Record<string, unknown>>
          for (const [field, cell] of Object.entries(filter)) {
            if ('$eq' in cell) filtered = filtered.filter(row => row[field] === cell.$eq)
          }
        }
        const page = Number(url.searchParams.get('page') ?? 1)
        const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
        finish(200, { data: filtered.slice((page - 1) * pageSize, page * pageSize), meta: { count: filtered.length, page, pageSize } })
        return
      }
      const createMatch = /^\/api\/([^/:]+):create$/u.exec(url.pathname)
      if (request.method === 'POST' && createMatch !== null) {
        const rows = ROWS.get(createMatch[1] as string)
        if (rows === undefined || typeof body !== 'object' || body === null) {
          finish(404, { error: { code: 'NOT_FOUND' } })
          return
        }
        const created = { ...(body as Record<string, unknown>), id: ++idSeq }
        rows.push(created)
        finish(200, { data: created })
        return
      }
      const updateMatch = /^\/api\/([^/:]+):update$/u.exec(url.pathname)
      if (request.method === 'POST' && updateMatch !== null) {
        const rows = ROWS.get(updateMatch[1] as string)
        const byTk = url.searchParams.get('filterByTk')
        const row = rows?.find(entry => String(entry.id) === byTk)
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
        const rows = ROWS.get(getMatch[1] as string)
        const row = rows?.find(entry => String(entry.id) === getMatch[2])
        finish(200, { data: row ?? null })
        return
      }
      finish(404, { error: { code: 'NOT_FOUND' } })
    })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  ncServer = server
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  return `http://127.0.0.1:${address.port}`
}

/** Compose the fixture through the real Loader over the in-process modules. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'nocobase-tools-'))
  process.env.NB_TEST_NC_URL = await bootMockNocoBase()
  process.env.NB_TEST_NC_TOKEN = NC_TOKEN
  const context = new Context()
  ctx = context
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-tool-nocobase', ToolNocoBase],
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
  return context
}

/** Execute one tool through the real registry and return its model-facing text. */
async function callText(name: string, args: unknown): Promise<string> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return text?.type === 'text' ? text.text : ''
}

describe('kb-agent nocobase tools (keyless)', () => {
  it('runs the business journey: schema, filtered reads, confirmed diff update, create receipt', async () => {
    await boot()
    const out: string[] = ['# kb-agent nocobase tools (keyless)', '']

    out.push('## nb_collections()')
    out.push(await callText('nb_collections', {}))
    out.push('')

    out.push('## nb_list(orders, status eq pending)')
    out.push(await callText('nb_list', { collection: 'orders', filter: [{ field: 'status', op: 'eq', value: 'pending' }] }))
    out.push('')

    out.push('## nb_get(orders, 101) — the pre-change read')
    out.push(await callText('nb_get', { collection: 'orders', id: 101 }))
    out.push('')

    // The conversation has only READ so far: no create or update reached the
    // backend — writes wait for the user's explicit go-ahead (the persona's
    // confirmed-change contract; the tools themselves carry no state).
    expect(servedPaths.some(path => path.endsWith(':create') || path.endsWith(':update'))).toBe(false)

    out.push('## nb_update(orders, 101, status → shipped) — the confirmed diff receipt')
    out.push(await callText('nb_update', { collection: 'orders', id: 101, values: { status: 'shipped' } }))
    out.push('')

    // The confirmed change landed and is observable.
    expect(ROWS.get('orders')?.find(row => row.id === 101)).toMatchObject({ status: 'shipped' })

    out.push('## nb_get(orders, 101) — the follow-up read')
    out.push(await callText('nb_get', { collection: 'orders', id: 101 }))
    out.push('')

    out.push('## nb_create(orders, ORD-103) — the confirmed create receipt')
    const createReceipt = await callText('nb_create', { collection: 'orders', values: { orderNo: 'ORD-103', serviceName: '中亚市场准入咨询', status: 'pending' } })
    out.push(createReceipt)
    out.push('')

    // The created row is durable on the mock's collection.
    expect(ROWS.get('orders')?.some(row => row.orderNo === 'ORD-103' && row.status === 'pending')).toBe(true)
    expect(createReceipt).toMatch(/已在 orders 创建第 \d+ 行/u)

    while (out.at(-1) === '') out.pop()
    const actual = `${out.join('\n')}\n`
    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      await writeFile(expectedPath, actual)
    }
    const expected = await import('node:fs').then(fs => fs.readFileSync(expectedPath, 'utf8'))
    expect(actual).toBe(expected)
  })
})
