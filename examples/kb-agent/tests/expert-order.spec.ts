/**
 * Keyless expert-order snapshot over the real Loader composition: the
 * acceptance scenario「请安排张会长出一份中亚货运风险应对方案」runs as a tool-call
 * transcript — the export-risk corpus ingests into the kb in text-only
 * degraded mode, `connector_discover` surfaces the expert card with the
 * orderable service, `order_create` places the order against a mock NocoBase
 * (the same authoritative dataset.json the seed script uses) and generates
 * the proposal PDF through the named template fallback (the draft credential
 * reference is pinned to a name nothing sets), landing a REAL file whose
 * bytes load back as a multi-page PDF with the expected chapter headings,
 * and `order_status` reports the delivered order. Hermetic by construction.
 * Non-deterministic ids (order numbers, temp paths) are normalized before
 * the transcript is compared. Refresh with
 * `DSH_SNAPSHOT=refresh pnpm vitest run <this file>`.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { closeHttpServer } from '../scripts/nocobase-workflow.ts'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import * as ToolConnector from '@deepseek-ai/dsh-tool-connector'
import ExpertOrdersRuntime from '@deepseek-ai/dsh-expert-orders'
import { PDFDocument } from 'pdf-lib'

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const configPath = join(here, 'fixtures/expert-order.cordis.yml')
const snapshotsDir = join(here, 'snapshots/expert-order')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal

/** The mock NocoBase's accepted bearer token. */
const NC_TOKEN = 'expert-order-mock-token'

/** The scenario request the transcript answers. */
const REQUEST = '请安排张会长出一份中亚货运风险应对方案，重点是主运力受阻后的切换。'

let root: string | undefined
let ctx: Context | undefined
let ncServer: Server | undefined
let counter = 0

beforeEach(() => {
  // Pin the embed and draft credential references to names nothing supplies:
  // the run stays keyless even when the host exports a real MINIMAX_API_KEY.
  process.env.KB_TEST_EMBED_ENV = 'KB_TEST_EMBED_ENV_ABSENT'
  delete process.env.EO_TEST_DRAFT_ABSENT
})

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.KB_TEST_EMBED_ENV
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

/**
 * Boot the mock NocoBase on an ephemeral port: the authoritative expert
 * dataset (experts / expert_services, the same JSON seed-experts.mts seeds
 * real backends from) plus a mutable empty orders collection with the
 * resourcer's create/update semantics.
 */
async function bootMockNocoBase(): Promise<string> {
  const fixtures = JSON.parse(await readFile(join(exampleRoot, 'workspace/data/experts/dataset.json'), 'utf8')) as
    Record<string, Array<Record<string, unknown>>>
  const collections: Record<string, Array<Record<string, unknown>>> = {
    experts: [...fixtures.experts ?? []],
    expert_services: [...fixtures.expert_services ?? []],
    orders: [],
  }
  // The mock speaks the v2 wire the live NocoBase 2.2.6 verified: top-level
  // POST bodies, `{data}`-wrapped responses, `{data, meta}` lists,
  // `{data: null}` misses, and the multipart attachments:upload.
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

/** Boot the fixture composition through the real Loader with an in-process import map. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-expert-order-'))
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
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-kb', KbRuntime],
    ['@deepseek-ai/dsh-kb-sqlite', KbSqlite],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
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

/** Execute one tool through the real registry and return its model-facing text. */
async function callText(name: string, args: unknown): Promise<{ text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { text: text?.type === 'text' ? text.text : '', value: result.value }
}

/** The export-risk corpus documents for retrieval grounding. */
async function riskCorpus(): Promise<Array<{ path: string; docKind: string }>> {
  const docs: Array<{ path: string; docKind: string }> = []
  const exportRisk = join(exampleRoot, 'workspace/data/export-risk')
  for (const file of (await readdir(exportRisk)).sort()) {
    if (file.endsWith('.md')) docs.push({ path: `workspace/data/export-risk/${file}`, docKind: 'report' })
  }
  return docs
}

/** Normalize the non-deterministic ids (order numbers, temp paths) out of a transcript. */
function normalize(transcript: string): string {
  return transcript
    .replaceAll(root as string, '<root>')
    .replace(/ORD-\d{8}-[0-9a-f]{8}/gu, 'ORD-<date>-<no>')
}

describe('kb-agent expert order (keyless, template drafting)', () => {
  it('runs the order journey: discover → order_create → real PDF → order_status delivered', async () => {
    await boot()
    const out: string[] = ['# kb-agent expert order (keyless template drafting)', '', `## 需求：${REQUEST}`, '']

    out.push('## kb_ingest（出海风险语料）')
    for (const doc of await riskCorpus()) {
      const { text } = await callText('kb_ingest', { path: doc.path, doc_kind: doc.docKind })
      out.push(`- ${doc.path.split('/').at(-1)}: ${text}`)
    }
    out.push('')

    out.push('## connector_discover("中亚")')
    const discover = await callText('connector_discover', { query: '中亚' })
    out.push(discover.text)
    out.push('')

    out.push('## order_create（下单并生成方案 PDF）')
    const order = await callText('order_create', {
      service_id: 'expert_services/1',
      brief: '中亚货运风险应对：主运力经霍尔果斯受阻后的切换与备仓安排。',
      client_name: '漯河宏发食品有限公司',
    })
    out.push(order.text)
    out.push('')

    out.push('## order_status()')
    const status = await callText('order_status', {})
    out.push(status.text)
    out.push('')

    // The scenario facts are observable in the canonical outputs, not just prose.
    expect(discover.text).toContain('### 张红喜 — 漯河市电子商务协会（会长）')
    expect(discover.text).toContain('中亚货运动线方案（PDF 方案，¥8,800/份）')
    const orderValue = order.value as { order_no: string; status: string; deliverable_path?: string; note?: string }
    expect(orderValue.status).toBe('delivered')
    expect(orderValue.note).toContain('未配置模型服务')
    expect(status.text).toContain('已交付')

    // The deliverable is a REAL multi-page PDF with the expected chapters.
    const path = orderValue.deliverable_path as string
    const bytes = await readFile(path)
    expect(Buffer.from(bytes.subarray(0, 5)).toString('ascii')).toBe('%PDF-')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBeGreaterThan(1)
    const { extractText, getDocumentProxy } = await import('unpdf')
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    for (const expected of ['背景与问题', '风险分析', '解决方案', '实施路线图', '参考来源', '漯河宏发食品有限公司', '张红喜', '霍尔果斯']) {
      expect(text).toContain(expected)
    }

    while (out.at(-1) === '') out.pop()
    const actual = normalize(`${out.join('\n')}\n`)
    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      await writeFile(expectedPath, actual)
    }
    const expected = await readFile(expectedPath, 'utf8')
    expect(actual).toBe(expected)
  })
})
