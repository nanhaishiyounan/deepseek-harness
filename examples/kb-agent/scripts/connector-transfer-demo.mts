/**
 * Real connector-transfer demo: the file-set connector serves a drop-in
 * directory (csv + markdown); connector_discover lists its datasets,
 * connector_transfer runs the five-step pipeline (pull → classify through
 * the shared data router → route → deliver → confirm) landing the csv as a
 * real Parquet lakehouse table and the markdown as a real kb document;
 * lakehouse_query aggregates the landed table, kb_search retrieves the
 * landed document, and the catalog's transfer records are read straight from
 * the sqlite catalog as the audit trail. Everything lives in an independent
 * temp workspace; run from the repo root:
 *   node --import tsx/esm examples/kb-agent/scripts/connector-transfer-demo.mts
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as LakehouseSqliteCatalog from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as LakehouseDuckDb from '@deepseek-ai/dsh-lakehouse-duckdb'
import * as ToolLakehouse from '@deepseek-ai/dsh-tool-lakehouse'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import * as ConnectorFile from '@deepseek-ai/dsh-connector-file'

const root = await mkdtemp(join(tmpdir(), 'kb-connector-demo-'))
const filesRoot = join(root, 'connector-files')
await mkdir(filesRoot, { recursive: true })
await writeFile(join(filesRoot, 'customs-export.csv'), 'region,month,amount_t\n中亚,2026-07,120.5\n中亚,2026-08,98.25\n欧盟,2026-07,402\n')
await writeFile(join(filesRoot, 'visit-note.md'), '# 东南亚走访纪要\n\n东南亚订单因雨季物流延迟，交付周期拉长约两周。')

const ctx = new Context()
const signal = new AbortController().signal
let counter = 0

async function callText(name: string, args: unknown): Promise<string> {
  const result = await ctx.tools.execute({ signal, callId: CallId(`demo-${++counter}`) as never, name, arguments: args })
  const text = result.content.find(block => block.type === 'text')
  return text?.type === 'text' ? text.text : ''
}

try {
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: join(root, 'kb.sqlite') })
  await ctx.plugin((await import('@deepseek-ai/dsh-tool-kb')), { tenant: 'demo-food-co' })
  await ctx.plugin(LakehouseRuntime, { dataRoot: join(root, 'lakehouse') })
  await ctx.plugin(LakehouseSqliteCatalog, { path: join(root, 'catalog.sqlite') })
  await ctx.plugin(LakehouseDuckDb)
  await ctx.plugin(ConnectorRuntime)
  await ctx.plugin(ConnectorFile, { root: filesRoot })
  await ctx.plugin(ToolLakehouse, { tenant: 'demo-food-co' })
  await ctx.plugin((await import('@deepseek-ai/dsh-tool-connector')), { tenant: 'demo-food-co' })

  console.log('== connector_discover (file connector) ==')
  console.log(await callText('connector_discover', { query: '' }))

  console.log('\n== connector_transfer(customs-export.csv) → shared data router → lakehouse ==')
  console.log(await callText('connector_transfer', { dataset_id: 'customs-export.csv' }))

  console.log('\n== connector_transfer(visit-note.md) → shared data router → kb ==')
  console.log(await callText('connector_transfer', { dataset_id: 'visit-note.md' }))

  console.log('\n== lakehouse_query over the landed table ==')
  console.log(await callText('lakehouse_query', { sql: 'SELECT region, SUM(amount_t) AS total_amount FROM customs_export GROUP BY region ORDER BY region' }))

  console.log('\n== kb_search over the landed document ==')
  console.log(await callText('kb_search', { query: '东南亚 物流延迟' }))

  console.log('\n== catalog transfer records (audit trail, read from sqlite) ==')
  const { DatabaseSync } = await import('node:sqlite')
  const catalog = new DatabaseSync(join(root, 'catalog.sqlite'))
  for (const row of catalog.prepare('SELECT id, source, destination, dataset_id, rows, transferred_at FROM lakehouse_transfers ORDER BY id').all()) {
    console.log(JSON.stringify(row))
  }
  catalog.close()
  await ctx.fiber.dispose()
  console.log('\nconnector-transfer demo: OK')
} finally {
  await rm(root, { recursive: true, force: true })
}
