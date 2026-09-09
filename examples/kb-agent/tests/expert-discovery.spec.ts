/**
 * Keyless expert-discovery snapshot over the real Loader composition: the
 * acceptance scenario「俄罗斯的仓库被乌克兰炸了怎么办」runs as a tool-call
 * transcript — the export-risk corpus (plus the two force-majeure regulation
 * excerpts) ingests into the kb in text-only degraded mode, `kb_search`
 * retrieves the warehouse-emergency playbook with a numbered citation, and
 * `connector_discover` over a mock NocoBase (serving the same authoritative
 * dataset.json the seed script uses) returns 张红喜's expert card with
 * affiliation, domains, and the orderable service catalog. Hermetic by
 * construction: the embed credential reference is pinned to a name nothing
 * sets and the mock server's url rides the environment. Refresh with
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

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const configPath = join(here, 'fixtures/expert-discovery.cordis.yml')
const snapshotsDir = join(here, 'snapshots/expert-discovery')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal

/** The mock NocoBase's accepted bearer token. */
const NC_TOKEN = 'expert-discovery-mock-token'

/** The scenario question the transcript answers. */
const QUESTION = '俄罗斯的仓库被乌克兰炸了怎么办'

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
  delete process.env.ED_TEST_NC_URL
  delete process.env.ED_TEST_NC_TOKEN
  await ctx?.fiber.dispose()
  ctx = undefined
  await closeHttpServer(ncServer)
  ncServer = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/**
 * Boot the mock NocoBase on an ephemeral port serving the authoritative
 * expert-dataset fixture source (the same JSON seed-experts.mts seeds real
 * backends from), with the resourcer's `$or`/`$includes` list semantics.
 */
async function bootMockNocoBase(): Promise<string> {
  const collections = JSON.parse(await readFile(join(exampleRoot, 'workspace/data/experts/dataset.json'), 'utf8')) as
    Record<string, Array<Record<string, unknown>>>
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
      const rows = collections[listMatch[1] as string] ?? []
      const filterRaw = url.searchParams.get('filter')
      let filtered = rows
      if (filterRaw !== null) {
        const filter = JSON.parse(filterRaw) as { $or?: Array<Record<string, { $includes?: string }>> }
        if (filter.$or !== undefined) {
          filtered = rows.filter(row => filter.$or!.some((clause) => {
            const [field, condition] = Object.entries(clause)[0] as [string, { $includes?: string }]
            return typeof row[field] === 'string' && row[field].includes(condition.$includes ?? '')
          }))
        }
      }
      // v2 wire: `{data: rows, meta: {...}}` and `{data: null}` misses.
      finish(200, { data: filtered, meta: { count: filtered.length, page: 1, pageSize: 100, totalPage: 1 } })
      return
    }
    const getMatch = /^\/api\/([^/]+)\/([^/]+)$/u.exec(url.pathname)
    if (request.method === 'GET' && getMatch !== null) {
      const row = collections[getMatch[1] as string]?.find(entry => String(entry.id) === getMatch[2])
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
  root = await mkdtemp(join(tmpdir(), 'kb-agent-expert-discovery-'))
  process.env.KB_TEST_ROOT = exampleRoot
  process.env.KB_TEST_DB = join(root, 'kb.sqlite')
  process.env.ED_TEST_NC_URL = await bootMockNocoBase()
  process.env.ED_TEST_NC_TOKEN = NC_TOKEN
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

/** Every export-risk corpus document plus the two force-majeure regulation excerpts. */
async function riskCorpus(): Promise<Array<{ path: string; docKind: string }>> {
  const docs: Array<{ path: string; docKind: string }> = []
  const exportRisk = join(exampleRoot, 'workspace/data/export-risk')
  for (const file of (await readdir(exportRisk)).sort()) {
    if (file.endsWith('.md')) docs.push({ path: `workspace/data/export-risk/${file}`, docKind: 'report' })
  }
  for (const file of ['2026-08-cim-cmr-force-majeure-excerpt.md', '2026-08-contract-force-majeure-clause.md']) {
    docs.push({ path: `workspace/data/regulations/${file}`, docKind: 'regulation' })
  }
  return docs
}

describe('kb-agent expert discovery (keyless, text-only degraded mode)', () => {
  it('answers the warehouse-strike scenario with risk-corpus citations and 张红喜\'s expert card', async () => {
    await boot()
    const out: string[] = ['# kb-agent expert discovery (text-only degraded mode)', '', `## 问题：${QUESTION}`, '']

    out.push('## kb_ingest（出海风险语料）')
    for (const doc of await riskCorpus()) {
      const { text } = await callText('kb_ingest', { path: doc.path, doc_kind: doc.docKind })
      out.push(`- ${doc.path.split('/').at(-1)}: ${text}`)
    }
    out.push('')

    // The retrieval step uses the question's salient terms, the way the
    // persona instructs the model to phrase kb_search queries; the raw
    // colloquial question itself stays as the transcript's scenario title.
    const retrievalQuery = '俄罗斯 海外仓 受损 应急 库存转移'
    out.push(`## kb_search("${retrievalQuery}")`)
    const search = await callText('kb_search', { query: retrievalQuery })
    out.push(search.text)
    out.push('')

    out.push('## connector_discover("海外仓")')
    const discover = await callText('connector_discover', { query: '海外仓' })
    out.push(discover.text)
    out.push('')

    // The scenario facts are observable in the canonical outputs, not just prose.
    expect(search.text).toMatch(/\[1\]/u)
    expect(search.text).toContain('俄罗斯海外仓受损应急处理指引')
    const discoverValue = discover.value as { datasets: Array<{ kind: string; expert?: { org?: string }; service?: { price?: string } }> }
    expect(discoverValue.datasets.some(entry => entry.kind === 'expert-profile' && entry.expert?.org === '漯河市电子商务协会（会长）')).toBe(true)
    expect(discover.text).toContain('### 张红喜 — 漯河市电子商务协会（会长）')
    expect(discover.text).toContain('领域：食品出海 · 中亚五国 · 俄罗斯 · 跨境电商 · 海外仓')
    expect(discover.text).toContain('海外仓风险应对咨询（PDF 方案，¥6,800/份）')
    expect(discover.text).toContain('可服务项（可下单）')
    expect(discover.text).toContain('俄罗斯·中亚海外仓风险应对手册（专家知识资产）')

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
