/**
 * With-key expert-discovery e2e against the real MiniMax endpoint: the
 * acceptance scenario「俄罗斯的仓库被乌克兰炸了怎么办」runs with live
 * embo-01 embeddings over the export-risk corpus and a mock NocoBase serving
 * the authoritative expert dataset — `kb_search` retrieves the
 * warehouse-emergency playbook hybrid (the colloquial question rides the
 * vector path), `connector_discover` returns 张红喜's expert card, and one
 * real MiniMax-M3 answer restates the actionable playbook with [n] citations
 * and recommends the expert by his card fields (affiliation, service,
 * pricing). Self-skips without MINIMAX_API_KEY.
 * Run: MINIMAX_API_KEY=... pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent
 */

import { createServer } from 'node:http'
import type { Server } from 'node:http'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { closeHttpServer } from '../scripts/nocobase-workflow.ts'
import { resolveEnv } from '../scripts/resolve-env.ts'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { BlockAssembler, CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
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

const here = dirname(fileURLToPath(import.meta.url))
const exampleRoot = join(here, '..')
const configPath = join(here, 'fixtures/expert-discovery-e2e.cordis.yml')
const apiKey = resolveEnv('MINIMAX_API_KEY')

/** The mock NocoBase's accepted bearer token. */
const NC_TOKEN = 'expert-discovery-e2e-token'

/** The acceptance scenario question. */
const QUESTION = '俄罗斯的仓库被乌克兰炸了怎么办'

let root: string | undefined
let ctx: Context | undefined
let ncServer: Server | undefined
let counter = 0

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.ED_TEST_NC_URL
  delete process.env.ED_TEST_NC_TOKEN
  await ctx?.fiber.dispose()
  ctx = undefined
  await closeHttpServer(ncServer)
  ncServer = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'kb-agent-expert-e2e' } })
}

/** Boot the mock NocoBase serving the authoritative expert-dataset fixture source. */
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

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-expert-e2e-'))
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

describe.skipIf(apiKey === undefined)('kb-agent expert discovery (with key, hybrid retrieval + real answer)', () => {
  it('answers the warehouse-strike scenario with playbook citations and 张红喜\'s expert card', async () => {
    const context = await boot()

    // Ingest the risk corpus with live embeddings.
    const exportRisk = join(exampleRoot, 'workspace/data/export-risk')
    for (const file of (await readdir(exportRisk)).sort()) {
      if (!file.endsWith('.md')) continue
      const { text } = await callText('kb_ingest', { path: `workspace/data/export-risk/${file}`, doc_kind: 'report' })
      expect(text).toMatch(/embedded via minimax:embo-01/u)
    }
    for (const file of ['2026-08-cim-cmr-force-majeure-excerpt.md', '2026-08-contract-force-majeure-clause.md']) {
      const { text } = await callText('kb_ingest', { path: `workspace/data/regulations/${file}`, doc_kind: 'regulation' })
      expect(text).toMatch(/embedded via minimax:embo-01/u)
    }

    // The colloquial question retrieves hybrid: the vector path carries it.
    const search = await callText('kb_search', { query: QUESTION })
    expect((search.value as { mode: string }).mode).toBe('hybrid')
    expect(search.text).toMatch(/\[1\]/u)

    // Discovery returns 张红喜's expert card with an orderable service.
    const discover = await callText('connector_discover', { query: '海外仓' })
    expect(discover.text).toContain('### 张红喜 — 漯河市电子商务协会（会长）')
    expect(discover.text).toContain('海外仓风险应对咨询（PDF 方案，¥6,800/份）')

    // One real grounded answer: both tool results ride the user turn.
    const assembler = new BlockAssembler()
    for await (const chunk of context.llm.stream({
      provider: 'minimax',
      model: 'MiniMax-M3',
      system: '你是食品行业出海顾问。依据用户提供的检索材料与专家发现结果回答：先用编号 [n] 引用检索材料给出可执行的应对要点，再依据专家卡字段推荐专家（姓名、机构、可下单的服务与定价）。',
      messages: [user(`检索材料：\n\n${search.text}\n\n专家发现结果：\n\n${discover.text}\n\n问题：${QUESTION}`)],
    })) assembler.push(chunk)
    expect(assembler.finish.kind).toBe('stop')
    const answer = assembler.message({ kind: 'model', provider: 'minimax', model: 'MiniMax-M3' })
    const visible = answer.content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('')

    // The answer restates the playbook with citations...
    expect(visible).toMatch(/\[\d+\]/u)
    expect(visible).toMatch(/转移|备份仓|备仓/u)
    expect(visible).toMatch(/保险|报案|理赔/u)
    // ...and recommends the expert by his card fields.
    expect(visible).toMatch(/张红喜/u)
    expect(visible).toMatch(/漯河/u)
    expect(visible).toMatch(/海外仓风险应对咨询/u)
  }, 240_000)
})
