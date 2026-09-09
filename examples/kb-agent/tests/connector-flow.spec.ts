/**
 * Keyless connector-flow snapshot over the real Loader composition: a mock
 * NocoBase server (real HTTP on 127.0.0.1) and the file-set provider join
 * the kb/lakehouse/connector seams; discovery lists 张会长 and the datasets,
 * a transfer lands the customs csv as a lakehouse table (aggregated by
 * lakehouse_query), the expert profile and the visit note land in the kb
 * (retrieved by kb_search) — the whole inter-connector transfer loop locked
 * in one transcript. Hermetic by construction: the embed credential
 * reference is pinned to a name nothing sets and every data path (including
 * the file-set root and the mock server's url) is test-provided. Refresh
 * with `DSH_SNAPSHOT=refresh pnpm vitest run <this file>`.
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { closeHttpServer } from '../scripts/nocobase-workflow.ts'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import * as ToolLakehouse from '@deepseek-ai/dsh-tool-lakehouse'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorFile from '@deepseek-ai/dsh-connector-file'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import * as ToolConnector from '@deepseek-ai/dsh-tool-connector'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/connector-flow.cordis.yml')
const snapshotsDir = join(here, 'snapshots/connector-flow')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal

/** The mock server's accepted bearer token. */
const NC_TOKEN = 'connector-flow-mock-token'

/**
 * The collections the mock NocoBase serves: the authoritative 张红喜 expert
 * dataset fixture source (the same JSON seed-experts.mts seeds real backends
 * from), so this snapshot and the seeded backend can never drift apart.
 */
const NC_COLLECTIONS = JSON.parse(await readFile(join(here, '../workspace/data/experts/dataset.json'), 'utf8')) as
  Readonly<Record<string, Array<Record<string, unknown>>>>

/** The file-set provider's drop-in directory: one csv and one markdown note. */
const FILE_CSV = 'region,month,amount_t\n中亚,2026-07,120.5\n中亚,2026-08,98.25\n欧盟,2026-07,402\n'
const FILE_NOTE = '# 东南亚走访纪要\n\n东南亚订单因雨季物流延迟，交付周期拉长约两周。'

let root: string | undefined
let ctx: Context | undefined
let ncServer: Server | undefined
let counter = 0

beforeEach(() => {
  // Pin the embed credential reference to a name nothing supplies: the run
  // stays keyless even when the host exports a real MINIMAX_API_KEY.
  process.env.KB_TEST_EMBED_ENV = 'KB_TEST_EMBED_ENV_ABSENT'
})

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.KB_TEST_EMBED_ENV
  delete process.env.LH_TEST_ROOT
  delete process.env.LH_TEST_DB
  delete process.env.CF_TEST_FILES
  delete process.env.CF_TEST_NC_URL
  delete process.env.CF_TEST_NC_TOKEN
  await ctx?.fiber.dispose()
  ctx = undefined
  await closeHttpServer(ncServer)
  ncServer = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the mock NocoBase on an ephemeral local port with the resourcer's wire semantics. */
async function bootMockNocoBase(): Promise<string> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://mock-nocobase')
    const finish = (status: number, body: unknown): void => {
      response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
    }
    if (request.headers.authorization !== `Bearer ${NC_TOKEN}`) {
      finish(401, { error: { code: 'INVALID_TOKEN' } })
      return
    }
    const listMatch = /^\/api\/([^/:]+):list$/u.exec(url.pathname)
    if (request.method === 'GET' && listMatch !== null) {
      const rows = NC_COLLECTIONS[listMatch[1] as string] ?? []
      const page = Number(url.searchParams.get('page') ?? 1)
      const pageSize = Number(url.searchParams.get('pageSize') ?? 20)
      const filterRaw = url.searchParams.get('filter')
      let filtered = rows
      if (filterRaw !== null) {
        const filter = JSON.parse(filterRaw) as {
          $or?: Array<Record<string, { $includes?: string }>>
          expertId?: { $eq?: unknown }
        }
        if (filter.$or !== undefined) {
          filtered = filtered.filter(row => filter.$or!.some((clause) => {
            const [field, condition] = Object.entries(clause)[0] as [string, { $includes?: string }]
            return typeof row[field] === 'string' && (row[field]).includes(condition.$includes ?? '')
          }))
        }
        if (filter.expertId !== undefined) {
          filtered = filtered.filter(row => row.expertId === (filter.expertId!.$eq ?? undefined))
        }
      }
      // v2 wire: `{data: rows, meta: {...}}` and `{data: null}` misses.
      const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize)
      finish(200, { data: pageRows, meta: { count: filtered.length, page, pageSize, totalPage: Math.ceil(filtered.length / pageSize) } })
      return
    }
    const getMatch = /^\/api\/([^/]+)\/([^/]+)$/u.exec(url.pathname)
    if (request.method === 'GET' && getMatch !== null) {
      const row = NC_COLLECTIONS[getMatch[1] as string]?.find(entry => String(entry.id) === getMatch[2])
      finish(200, { data: row ?? null })
      return
    }
    finish(404, { error: { code: 'NOT_FOUND' } })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  ncServer = server
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('mock server has no address')
  return `http://127.0.0.1:${address.port}`
}

/** Boot the fixture composition through the real Loader with an in-process import map. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-connector-flow-'))
  process.env.KB_TEST_ROOT = root
  process.env.KB_TEST_DB = join(root, 'kb.sqlite')
  process.env.LH_TEST_ROOT = join(root, 'lakehouse')
  process.env.LH_TEST_DB = join(root, 'catalog.sqlite')
  const filesRoot = join(root, 'connector-files')
  await mkdir(filesRoot, { recursive: true })
  await writeFile(join(filesRoot, 'customs-export.csv'), FILE_CSV)
  await writeFile(join(filesRoot, 'visit-note.md'), FILE_NOTE)
  process.env.CF_TEST_FILES = filesRoot
  process.env.CF_TEST_NC_URL = await bootMockNocoBase()
  process.env.CF_TEST_NC_TOKEN = NC_TOKEN
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
    ['@deepseek-ai/dsh-lakehouse', LakehouseRuntime],
    ['@deepseek-ai/dsh-lakehouse-sqlite-catalog', LakehouseSqliteCatalog],
    ['@deepseek-ai/dsh-lakehouse-duckdb', LakehouseDuckDb],
    ['@deepseek-ai/dsh-tool-lakehouse', ToolLakehouse],
    ['@deepseek-ai/dsh-connector', ConnectorRuntime],
    ['@deepseek-ai/dsh-connector-file', ConnectorFile],
    ['@deepseek-ai/dsh-connector-nocobase', ConnectorNocoBase],
    ['@deepseek-ai/dsh-tool-connector', ToolConnector],
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

describe('kb-agent connector flow (keyless)', () => {
  it('discovers across providers, transfers to the lakehouse and the kb, and answers from both landings', async () => {
    await boot()
    const out: string[] = ['# kb-agent connector flow (keyless)', '']

    out.push('## connector_discover("中亚")')
    out.push(await callText('connector_discover', { query: '中亚' }))
    out.push('')

    out.push('## connector_fetch(datasets/1)')
    out.push(await callText('connector_fetch', { dataset_id: 'datasets/1' }))
    out.push('')

    out.push('## connector_transfer(datasets/1)')
    out.push(await callText('connector_transfer', { dataset_id: 'datasets/1' }))
    out.push('')

    out.push('## lakehouse_query')
    out.push(await callText('lakehouse_query', { sql: 'SELECT region, SUM(amount_t) AS total_amount FROM customs_export GROUP BY region ORDER BY region' }))
    out.push('')

    out.push('## connector_transfer(experts/1)')
    out.push(await callText('connector_transfer', { dataset_id: 'experts/1' }))
    out.push('')

    out.push('## kb_search("漯河 电商协会 会长")')
    out.push(await callText('kb_search', { query: '漯河 电商协会 会长' }))
    out.push('')

    out.push('## connector_transfer(visit-note.md)')
    out.push(await callText('connector_transfer', { dataset_id: 'visit-note.md' }))
    out.push('')

    out.push('## kb_search("东南亚 物流延迟")')
    const searchNote = await callText('kb_search', { query: '东南亚 物流延迟' })
    out.push(searchNote)
    out.push('')

    // The landing facts are observable in the canonical surfaces, not just prose.
    const registered = await ctx!.lakehouse.listTables('demo-food-co')
    expect(registered.map(table => table.tableName)).toEqual(['customs_export'])
    expect(registered[0]?.provenance).toEqual({ provider: 'connector:connector-nocobase', collectedSource: 'datasets/1' })
    expect(searchNote).toMatch(/\[1\]/u)

    while (out.at(-1) === '') out.pop()
    const actual = `${out.join('\n')}\n`
    if (refreshing) {
      await mkdir(snapshotsDir, { recursive: true })
      await writeFile(expectedPath, actual)
    }
    const expected = await readFile(expectedPath, 'utf8')
    expect(actual).toBe(expected)
  })
})
