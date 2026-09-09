/**
 * With-key expert-order e2e against the real MiniMax endpoint: the acceptance
 * scenario「请安排张会长出一份中亚货运风险应对方案」runs end to end — live
 * embo-01 embeddings over the export-risk corpus, `connector_discover` over a
 * mock NocoBase serving the authoritative expert dataset, and `order_create`
 * drafting the proposal sections through the REAL MiniMax-M3 stream
 * (kb-referenced, strict-JSON DraftSpec), expert-pdf typesetting the real
 * deliverable, and `order_status` reporting the delivered order with the PDF
 * path. The landed PDF is asserted to load back, span multiple pages, carry
 * the drafted chapter headings and concrete measures, and name the client and
 * expert. Self-skips without MINIMAX_API_KEY (the root .env counts).
 * Run: pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent/tests/expert-order.e2e.ts
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import * as ToolConnector from '@deepseek-ai/dsh-tool-connector'
import ExpertOrdersRuntime from '@deepseek-ai/dsh-expert-orders'
import { PDFDocument } from 'pdf-lib'
import { closeHttpServer } from '../scripts/nocobase-workflow.ts'
import { resolveEnv } from '../scripts/resolve-env.ts'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const configPath = join(here, 'fixtures/expert-order-e2e.cordis.yml')

const apiKey = resolveEnv('MINIMAX_API_KEY')

/** The mock NocoBase's accepted bearer token. */
const NC_TOKEN = 'expert-order-e2e-token'

/** The acceptance scenario request. */
const REQUEST = '请安排张会长出一份中亚货运风险应对方案，重点是主运力受阻后的切换。'

let root: string | undefined
let ctx: Context | undefined
let ncServer: Server | undefined
let counter = 0

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.EO_TEST_NC_URL
  delete process.env.EO_TEST_NC_TOKEN
  delete process.env.EO_TEST_DELIVERABLES
  await ctx?.fiber.dispose()
  ctx = undefined
  await closeHttpServer(ncServer)
  ncServer = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the mock NocoBase: the authoritative dataset plus a mutable orders collection. */
async function bootMockNocoBase(): Promise<string> {
  const fixtures = JSON.parse(await readFile(join(exampleRoot, 'workspace/data/experts/dataset.json'), 'utf8')) as
    Record<string, Array<Record<string, unknown>>>
  const collections: Record<string, Array<Record<string, unknown>>> = {
    experts: [...fixtures.experts ?? []],
    expert_services: [...fixtures.expert_services ?? []],
    orders: [],
  }
  // The mock speaks the v2 wire the live NocoBase 2.2.6 verified (see
  // nocobase-track.e2e.ts for the real-backend counterpart).
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock-nocobase')
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      const raw = Buffer.concat(chunks)
      const contentType = request.headers['content-type'] ?? ''
      const body: unknown = contentType.startsWith('application/json') && raw.length > 0 ? JSON.parse(raw.toString('utf8')) as unknown : undefined
      const finish = (status: number, payload: unknown): void => {
        response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(payload))
      }
      if (request.headers.authorization !== `Bearer ${NC_TOKEN}`) {
        finish(401, { error: { code: 'INVALID_TOKEN' } })
        return
      }
      if (request.method === 'POST' && url.pathname === '/api/attachments:upload') {
        const named = /filename="([^"]+)"/u.exec(raw.toString('utf8'))
        finish(200, { data: { id: 1, filename: named?.[1] ?? 'upload.pdf', url: `/storage/uploads/${named?.[1] ?? 'upload.pdf'}` } })
        return
      }
      const listMatch = /^\/api\/([^/:]+):list$/u.exec(url.pathname)
      if (request.method === 'GET' && listMatch !== null) {
        let rows = collections[listMatch[1] as string] ?? []
        const filterRaw = url.searchParams.get('filter')
        if (filterRaw !== null) {
          const filter = JSON.parse(filterRaw) as { $or?: Array<Record<string, { $includes?: string }>>; id?: { $eq?: unknown } }
          if (filter.$or !== undefined) {
            rows = rows.filter(row => filter.$or!.some((clause) => {
              const entry = Object.entries(clause)[0]
              if (entry === undefined) return false
              const [field, condition] = entry
              return typeof row[field] === 'string' && row[field].includes(condition.$includes ?? '')
            }))
          }
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
        const row = (collections[getMatch[1] as string] ?? []).find(entry => String(entry.id) === getMatch[2])
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

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-expert-order-e2e-'))
  process.env.KB_TEST_ROOT = exampleRoot
  process.env.KB_TEST_DB = join(root, 'kb.sqlite')
  process.env.EO_TEST_NC_URL = await bootMockNocoBase()
  process.env.EO_TEST_NC_TOKEN = NC_TOKEN
  process.env.EO_TEST_DELIVERABLES = join(root, 'deliverables')
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
    ['@deepseek-ai/dsh-kb', KbRuntime],
    ['@deepseek-ai/dsh-kb-sqlite', KbSqlite],
    ['@deepseek-ai/dsh-kb-embed-minimax', KbEmbedMiniMax],
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-tool-kb', ToolKb],
    ['@deepseek-ai/dsh-connector', ConnectorRuntime],
    ['@deepseek-ai/dsh-connector-nocobase', ConnectorNocoBase],
    ['@deepseek-ai/dsh-tool-connector', ToolConnector],
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
  return context
}

async function callText(name: string, args: unknown): Promise<{ text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal: new AbortController().signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { text: text?.type === 'text' ? text.text : '', value: result.value }
}

describe.skipIf(apiKey === undefined)('kb-agent expert order (with key, real MiniMax-M3 drafting)', () => {
  it('delivers a real drafted, typeset PDF for the ordered expert service', async () => {
    await boot()

    // Ground the drafting with a representative slice of the risk corpus.
    const exportRisk = join(exampleRoot, 'workspace/data/export-risk')
    const files = (await readdir(exportRisk)).filter(file => file.endsWith('.md')).sort().slice(0, 4)
    expect(files.length).toBeGreaterThan(0)
    for (const file of files) {
      const { text } = await callText('kb_ingest', { path: `workspace/data/export-risk/${file}`, doc_kind: 'report' })
      expect(text).toMatch(/embedded via minimax:embo-01/u)
    }

    const discover = await callText('connector_discover', { query: '中亚' })
    expect(discover.text).toContain('### 张红喜 — 漯河市电子商务协会（会长）')
    expect(discover.text).toContain('中亚货运动线方案（PDF 方案，¥8,800/份）')

    const order = await callText('order_create', {
      service_id: 'expert_services/1',
      brief: REQUEST,
      client_name: '漯河宏发食品有限公司',
    })
    const value = order.value as { order_no: string; status: string; deliverable_path: string; note?: string }
    expect(value.order_no).toMatch(/^ORD-/u)
    expect(value.status).toBe('delivered')
    // Real drafting leaves no fallback note.
    expect(value.note).toBeUndefined()
    expect(order.text).toContain(value.order_no)

    const listed = await callText('order_status', {})
    expect(listed.text).toContain(value.order_no)
    expect(listed.text).toContain('已交付')
    expect(listed.text).toContain(value.deliverable_path.split('/').at(-1) as string)

    // The deliverable is a real multi-page PDF carrying the drafted chapters.
    const bytes = await readFile(value.deliverable_path)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    for (const expected of ['风险分析', '解决方案', '漯河宏发食品有限公司', '张红喜']) {
      expect(text).toContain(expected)
    }
    // Concrete measures the corpus and the service summary ground the drafting in.
    const measures = /班列|口岸|TIR|备仓|保险/u
    expect(text).toMatch(measures)
  }, 180_000)
})
