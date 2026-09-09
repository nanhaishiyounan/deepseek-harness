/**
 * With-key data-routing e2e against the real MiniMax endpoint: a real csv
 * upload lands as a lakehouse table through the gateway's unified channel, a
 * real markdown upload lands in the kb with live embeddings, the lakehouse
 * tools answer an aggregate over the uploaded table, and one real MiniMax-M3
 * answer restates the queried numbers with source-table attribution.
 * Self-skips without MINIMAX_API_KEY.
 * Run: MINIMAX_API_KEY=... pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { BlockAssembler, CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import * as ToolLakehouse from '@deepseek-ai/dsh-tool-lakehouse'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/data-routing-e2e.cordis.yml')
const apiKey = process.env.MINIMAX_API_KEY

const EXPORT_CSV = [
  'region,month,amount_t',
  '中亚,2026-07,120.5',
  '东南亚,2026-07,310',
  '欧盟,2026-07,402',
].join('\n')

const VISIT_NOTE = '# 走访纪要（e2e）\n\n中亚方向出口订单七月回款正常，琥珀麦芽产线满产。'

let root: string | undefined
let ctx: Context | undefined
let api: ApiProxy | undefined
let counter = 0

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.LH_TEST_ROOT
  delete process.env.LH_TEST_DB
  await ctx?.fiber.dispose()
  ctx = undefined
  api = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'kb-agent-e2e' } })
}

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-data-e2e-'))
  process.env.KB_TEST_ROOT = root
  process.env.KB_TEST_DB = join(root, 'kb.sqlite')
  process.env.LH_TEST_ROOT = join(root, 'lakehouse')
  process.env.LH_TEST_DB = join(root, 'catalog.sqlite')
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
    ['@deepseek-ai/dsh-lakehouse', LakehouseRuntime],
    ['@deepseek-ai/dsh-lakehouse-sqlite-catalog', LakehouseSqliteCatalog],
    ['@deepseek-ai/dsh-lakehouse-duckdb', LakehouseDuckDb],
    ['@deepseek-ai/dsh-tool-lakehouse', ToolLakehouse],
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
  await context.plugin(AgentRegistry)
  await context.plugin(SessionStore)
  await context.plugin(UserQuestionService)
  api = createApiProxy(context, {
    defaultModelSelection: () => ({ provider: 'minimax', model: 'MiniMax-M3' }),
    saveDefaultModelSelection: async () => {},
    cwd: root,
    kbTenant: 'demo-food-co',
    dataUploadEnabled: true,
  })
  return context
}

async function callText(name: string, args: unknown): Promise<{ text: string; value: unknown }> {
  const result = await ctx!.tools.execute({ signal: new AbortController().signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return { text: text?.type === 'text' ? text.text : '', value: result.value }
}

/** One upload through the gateway's unified channel. */
async function upload(name: string, bytes: Uint8Array, mime: string) {
  const response = await api!.data.upload({
    rpcId: 'data-routing-e2e' as never,
    payload: { filename: name, data: Buffer.from(bytes).toString('base64'), mime },
  })
  if (!response.result.ok) throw new Error(`upload ${name} failed: ${response.result.error.code} ${response.result.error.message}`)
  return response.result.value
}

describe.skipIf(apiKey === undefined)('kb-agent data routing (with key, real uploads + real answer)', () => {
  it('routes csv→lakehouse and md→kb, then answers the aggregate through MiniMax-M3', async () => {
    const context = await boot()

    // The csv lands as a typed lakehouse table.
    const csvReceipt = await upload('customs-export.csv', new TextEncoder().encode(EXPORT_CSV), 'text/csv')
    expect(csvReceipt.destination).toBe('lakehouse')
    if (csvReceipt.destination !== 'lakehouse') return
    expect(csvReceipt.table).toBe('customs_export')
    expect(csvReceipt.rows).toBe(3)

    // The markdown lands in the kb with live embeddings.
    const mdReceipt = await upload('visit-note.md', new TextEncoder().encode(VISIT_NOTE), 'text/markdown')
    expect(mdReceipt.destination).toBe('kb')
    if (mdReceipt.destination !== 'kb') return
    expect(mdReceipt.document.embedded).toBe(true)

    // The lakehouse tools answer over the uploaded table.
    const tables = await callText('lakehouse_tables', {})
    expect(tables.text).toContain('customs_export')
    const query = await callText('lakehouse_query', { sql: 'SELECT region, SUM(amount_t) AS total FROM customs_export WHERE month = \'2026-07\' GROUP BY region ORDER BY region' })
    expect(query.text).toContain('中亚')
    expect(query.text).toContain('Data source: lakehouse table customs_export')

    // One real grounded answer: the query result rides in the user turn.
    const question = '2026年7月中亚方向的出口额是多少？数据来自哪张表？'
    const assembler = new BlockAssembler()
    for await (const chunk of context.llm.stream({
      provider: 'minimax',
      model: 'MiniMax-M3',
      system: '你是企业数据助手。只依据用户提供的查询结果回答，金额保留原数，并注明数据来源表名。',
      messages: [user(`查询结果：\n\n${query.text}\n\n问题：${question}`)],
    })) assembler.push(chunk)
    expect(assembler.finish.kind).toBe('stop')
    const answer = assembler.message({ kind: 'model', provider: 'minimax', model: 'MiniMax-M3' })
    const visible = answer.content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('')
    expect(visible).toMatch(/120\.5/u)
    expect(visible).toMatch(/customs_export/u)
  }, 180_000)
})
