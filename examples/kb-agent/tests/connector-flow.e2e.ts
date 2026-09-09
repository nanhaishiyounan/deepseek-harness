/**
 * With-key connector-flow e2e against the real MiniMax endpoint: the
 * file-set connector supplies real datasets, connector_transfer lands the
 * customs csv as a lakehouse table and the visit note in the kb (live
 * embeddings), the connector and lakehouse tools answer over both landings,
 * and one real MiniMax-M3 answer restates the queried numbers with
 * source-table attribution. The NocoBase provider stays credential-less
 * (unavailable) in this lane — the keyless snapshot covers its mock path.
 * Self-skips without MINIMAX_API_KEY.
 * Run: MINIMAX_API_KEY=... pnpm vitest run --config vitest.e2e.config.ts examples/kb-agent
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
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
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorFile from '@deepseek-ai/dsh-connector-file'
import * as ConnectorNocoBase from '@deepseek-ai/dsh-connector-nocobase'
import * as ToolConnector from '@deepseek-ai/dsh-tool-connector'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/connector-flow-e2e.cordis.yml')
const apiKey = process.env.MINIMAX_API_KEY

const FILE_CSV = 'region,month,amount_t\n中亚,2026-07,120.5\n中亚,2026-08,98.25\n欧盟,2026-07,402\n'
const FILE_NOTE = '# 东南亚走访纪要（e2e）\n\n东南亚订单因雨季物流延迟，交付周期拉长约两周；中亚方向回款正常。'

let root: string | undefined
let ctx: Context | undefined
let counter = 0

afterEach(async () => {
  delete process.env.KB_TEST_ROOT
  delete process.env.KB_TEST_DB
  delete process.env.LH_TEST_ROOT
  delete process.env.LH_TEST_DB
  delete process.env.CF_TEST_FILES
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

function user(text: string): Message {
  return createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'plugin', plugin: 'kb-agent-connector-e2e' } })
}

async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-connector-e2e-'))
  process.env.KB_TEST_ROOT = root
  process.env.KB_TEST_DB = join(root, 'kb.sqlite')
  process.env.LH_TEST_ROOT = join(root, 'lakehouse')
  process.env.LH_TEST_DB = join(root, 'catalog.sqlite')
  const filesRoot = join(root, 'connector-files')
  await mkdir(filesRoot, { recursive: true })
  await writeFile(join(filesRoot, 'customs-export.csv'), FILE_CSV)
  await writeFile(join(filesRoot, 'visit-note.md'), FILE_NOTE)
  process.env.CF_TEST_FILES = filesRoot
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

async function callText(name: string, args: unknown): Promise<string> {
  const result = await ctx!.tools.execute({ signal: new AbortController().signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return text?.type === 'text' ? text.text : ''
}

describe.skipIf(apiKey === undefined)('kb-agent connector flow (with key, real transfers + real answer)', () => {
  it('discovers the file connector, lands csv→lakehouse and md→kb, then answers through MiniMax-M3', async () => {
    const context = await boot()

    // Discovery lists the file-set datasets through the real provider.
    const discovered = await callText('connector_discover', { query: 'customs' })
    expect(discovered).toContain('customs-export.csv')
    expect(discovered).toContain('connector-file')

    // The csv lands as a typed lakehouse table through the five-step transfer.
    const csvReceipt = await callText('connector_transfer', { dataset_id: 'customs-export.csv' })
    expect(csvReceipt).toContain('customs_export')
    expect(csvReceipt).toContain('transfer record')

    // The markdown lands in the kb with live embeddings.
    const mdReceipt = await callText('connector_transfer', { dataset_id: 'visit-note.md' })
    expect(mdReceipt).toContain('knowledge base')

    // The connector landing answers through the lakehouse tools.
    const query = await callText('lakehouse_query', { sql: 'SELECT region, SUM(amount_t) AS total FROM customs_export GROUP BY region ORDER BY region' })
    expect(query).toContain('Data source: lakehouse table customs_export')

    // The kb landing answers with a live-embedding hybrid search.
    const search = await callText('kb_search', { query: '东南亚 物流延迟' })
    expect(search).toMatch(/\[1\]/u)

    // One real grounded answer: the connector landing's query result rides in the user turn.
    const question = '中亚方向两个月合计出口多少吨？数据来自哪张表？'
    const assembler = new BlockAssembler()
    for await (const chunk of context.llm.stream({
      provider: 'minimax',
      model: 'MiniMax-M3',
      system: '你是企业数据助手。只依据用户提供的查询结果回答，金额保留原数，并注明数据来自连接器落入的湖仓表名。',
      messages: [user(`查询结果：\n\n${query}\n\n问题：${question}`)],
    })) assembler.push(chunk)
    expect(assembler.finish.kind).toBe('stop')
    const answer = assembler.message({ kind: 'model', provider: 'minimax', model: 'MiniMax-M3' })
    const visible = answer.content.filter(block => block.type === 'text').map(block => block.type === 'text' ? block.text : '').join('')
    expect(visible).toMatch(/218\.75/u)
    expect(visible).toMatch(/customs_export/u)
  }, 180_000)
})
