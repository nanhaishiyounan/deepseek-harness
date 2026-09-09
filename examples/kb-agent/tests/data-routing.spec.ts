/**
 * Keyless data-routing snapshot over the real Loader composition: one
 * structured csv and one markdown document go through the gateway's unified
 * `data.upload`; the csv lands as a lakehouse table (listed by
 * `lakehouse_tables`, aggregated by `lakehouse_query` with attribution) while
 * the markdown ingests into the kb and stays retrievable through `kb_search`.
 * The transcript locks the whole routing loop. Hermetic by construction: the
 * fixture pins the embed credential reference to a name nothing sets and
 * every data path to a temp root. Refresh with
 * `DSH_SNAPSHOT=refresh pnpm vitest run <this file>`.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { CallId } from '@deepseek-ai/dsh-llm'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import * as KbEmbedMiniMax from '@deepseek-ai/dsh-kb-embed-minimax'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as ToolKb from '@deepseek-ai/dsh-tool-kb'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import * as ToolLakehouse from '@deepseek-ai/dsh-tool-lakehouse'
import { createApiProxy } from '@deepseek-ai/dsh-host-apiproxy'
import type { ApiProxy } from '@deepseek-ai/dsh-host-apiproxy'

const here = dirname(fileURLToPath(import.meta.url))
const configPath = join(here, 'fixtures/data-routing.cordis.yml')
const snapshotsDir = join(here, 'snapshots/data-routing')
const expectedPath = join(snapshotsDir, 'expected.md')
const refreshing = process.env.DSH_SNAPSHOT === 'refresh'

const signal = new AbortController().signal

/** A customs-style export ledger: region × month with amounts. */
const EXPORT_CSV = [
  'region,month,amount_t',
  '中亚,2026-07,120.5',
  '中亚,2026-08,98.25',
  '东南亚,2026-07,310',
  '东南亚,2026-08,285.75',
  '欧盟,2026-07,402',
  '欧盟,2026-08,388.5',
].join('\n')

const VISIT_NOTE = [
  '# 宏发食品八月走访纪要',
  '',
  '宏发食品八月出口以中亚方向为主，琥珀麦芽与烘焙配料两条产线满产；',
  '东南亚订单因雨季物流延迟，交付周期拉长约两周。',
].join('\n')

let root: string | undefined
let ctx: Context | undefined
let api: ApiProxy | undefined
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
  await ctx?.fiber.dispose()
  ctx = undefined
  api = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Boot the fixture composition through the real Loader with an in-process import map. */
async function boot(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'kb-agent-data-routing-'))
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
    ['@deepseek-ai/dsh-fs-local', LocalFileSystem],
    ['@deepseek-ai/dsh-system-prompt', SystemPrompt],
    ['@deepseek-ai/dsh-kb', KbRuntime],
    ['@deepseek-ai/dsh-kb-sqlite', KbSqlite],
    ['@deepseek-ai/dsh-kb-embed-minimax', KbEmbedMiniMax],
    ['@deepseek-ai/dsh-tools', ToolRuntime],
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
  // The gateway is constructed directly (its service plugin carries host-spine
  // injects the example does not need for this loop).
  await context.plugin(AgentRegistry)
  await context.plugin(SessionStore)
  await context.plugin(UserQuestionService)
  api = createApiProxy(context, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd: root,
    kbTenant: 'demo-food-co',
    dataUploadEnabled: true,
  })
  return context
}

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): { rpcId: never; payload: P } {
  return { rpcId: 'data-routing-snapshot' as never, payload }
}

/** Upload one file body through the unified channel and report the receipt line. */
async function uploadLine(name: string, bytes: Uint8Array, mime: string): Promise<string> {
  const response = await api!.data.upload(request({ filename: name, data: Buffer.from(bytes).toString('base64'), mime }))
  if (!response.result.ok) return `!! ${name}: ${response.result.error.code} — ${response.result.error.message}`
  const value = response.result.value
  return value.destination === 'lakehouse'
    ? `${name} → lakehouse table ${value.table} (${value.rows} rows, replaced=${value.replaced})`
    : `${name} → kb document ${value.document.doc_id} (${value.document.chunks} chunks, embedded=${value.document.embedded})`
}

/** Execute one tool through the real registry and return its model-facing text. */
async function callText(name: string, args: unknown): Promise<string> {
  const result = await ctx!.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return text?.type === 'text' ? text.text : ''
}

describe('kb-agent data routing (keyless)', () => {
  it('routes a csv to the lakehouse and a document to the kb, then answers from both', async () => {
    await boot()
    const out: string[] = ['# kb-agent data routing (keyless)', '']

    out.push('## data.upload')
    out.push(`- ${await uploadLine('customs-export.csv', new TextEncoder().encode(EXPORT_CSV), 'text/csv')}`)
    out.push(`- ${await uploadLine('visit-note.md', new TextEncoder().encode(VISIT_NOTE), 'text/markdown')}`)
    out.push('')

    out.push('## lakehouse_tables')
    // The registration timestamp is wall-clock; pin it so the snapshot is stable.
    out.push((await callText('lakehouse_tables', {})).replace(/\(updated [^)]+\)/u, '(updated <ts>)'))
    out.push('')

    out.push('## lakehouse_query')
    out.push(await callText('lakehouse_query', { sql: 'SELECT region, SUM(amount_t) AS total_amount FROM customs_export GROUP BY region ORDER BY region' }))
    out.push('')

    out.push('## kb_search')
    const searched = await callText('kb_search', { query: '东南亚订单 物流延迟' })
    out.push(searched)
    out.push('')

    // The routing facts are observable in the canonical values, not just prose.
    const csvReceipt = await api!.data.upload(request({
      filename: 'customs-export.csv',
      data: Buffer.from(EXPORT_CSV, 'utf8').toString('base64'),
      mime: 'text/csv',
    }))
    expect(csvReceipt.result.ok && csvReceipt.result.value.destination === 'lakehouse' && csvReceipt.result.value.replaced).toBe(true)
    expect(searched).toMatch(/\[1\]/u)

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
