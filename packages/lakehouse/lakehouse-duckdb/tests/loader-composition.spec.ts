import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import * as CatalogPlugin from '@deepseek-ai/dsh-lakehouse-sqlite-catalog'
import * as DuckDbPlugin from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** YAML single-quote scalar: double any embedded apostrophe. */
function yamlQuote(text: string): string {
  const single = String.fromCharCode(39)
  return single + text.replaceAll(single, single + single) + single
}

async function loadComposition(dataRoot: string): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@deepseek-ai/dsh-lakehouse'",
    '  config:',
    `    dataRoot: ${yamlQuote(dataRoot)}`,
    '    maxRows: 50',
    "- name: '@deepseek-ai/dsh-lakehouse-sqlite-catalog'",
    '  config:',
    "    path: ':memory:'",
    "- name: '@deepseek-ai/dsh-lakehouse-duckdb'",
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-lakehouse', LakehouseRuntime],
    ['@deepseek-ai/dsh-lakehouse-sqlite-catalog', CatalogPlugin],
    ['@deepseek-ai/dsh-lakehouse-duckdb', DuckDbPlugin],
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

describe('lakehouse Loader composition', () => {
  it('loads the seam with both providers and runs a real load/query round trip', async () => {
    const outer = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-loader-outer-'))
    const dataRoot = join(outer, 'loaded-data')
    const ctx = await loadComposition(dataRoot)
    const unloaded = [...ctx.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])

    const result = await ctx.lakehouse.load({
      tenantId: 'hongfa-food',
      tableName: 'orders',
      tabular: {
        columns: [
          { name: 'month', sqlType: 'TEXT' },
          { name: 'tons', sqlType: 'DOUBLE' },
        ],
        rows: [
          ['2026-07', 12.5],
          ['2026-08', 15.25],
        ],
      },
    })
    expect(result.replaced).toBe(false)
    expect(result.table.location).toBe(`${dataRoot}/hongfa-food/orders.parquet`)
    const query = await ctx.lakehouse.query('hongfa-food', 'SELECT sum(tons) AS total FROM orders')
    expect(query.rows).toEqual([[27.75]])
    expect(ctx.lakehouse).toBeDefined()
    await rm(outer, { recursive: true, force: true })
  })
})
