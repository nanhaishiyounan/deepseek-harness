/**
 * The lakehouse tool suite's behavior over the real runtime with in-memory
 * providers: the table inventory projection, the query round trip with
 * attribution and truncation, the server-side tenant binding (model-supplied
 * tenant rejected, another tenant's tables invisible), the degraded engine
 * (queries fail structured while the table listing keeps answering), and the
 * model-facing surface (no tenant parameter, config requires the binding).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import type {
  CatalogStore, EngineTableRef, LakehouseTable, LakehouseTransferEntry, QueryProvider,
} from '@deepseek-ai/dsh-lakehouse'
import * as ToolLakehouse from '../src/index.ts'

const signal = new AbortController().signal

/** In-memory catalog stand-in (tenant-filtered like the sqlite store). */
class MemoryCatalog implements CatalogStore {
  readonly id = 'memory-catalog'
  readonly tables = new Map<string, LakehouseTable>()

  available(): boolean {
    return true
  }

  async registerTable(table: LakehouseTable): Promise<{ replaced: boolean }> {
    const key = `${table.tenantId}\u0000${table.tableName}`
    const replaced = this.tables.has(key)
    this.tables.set(key, table)
    return { replaced }
  }

  async listTables(tenantId: string): Promise<readonly LakehouseTable[]> {
    return [...this.tables.values()].filter(table => table.tenantId === tenantId)
  }

  async describeTable(tenantId: string, tableName: string): Promise<LakehouseTable | undefined> {
    return this.tables.get(`${tenantId}\u0000${tableName}`)
  }

  async dropTable(): Promise<boolean> {
    return false
  }

  async recordTransfer(): Promise<{ transferId: number }> {
    return { transferId: 1 }
  }

  async listTransfers(): Promise<readonly LakehouseTransferEntry[]> {
    return []
  }

  async recordUsage(): Promise<void> {}

  async usage(): Promise<{ loadedTables: number; lakehouseQueries: number }> {
    return { loadedTables: 0, lakehouseQueries: 0 }
  }
}

/** Engine stand-in: records the table refs it was handed and replays rows. */
class MemoryEngine implements QueryProvider {
  readonly id = 'memory-engine'
  engineUp: boolean
  readonly seenTableRefs: EngineTableRef[][] = []
  readonly queries: string[] = []
  result: {
    columns: Array<{ name: string; sqlType: string }>
    rows: readonly (readonly unknown[])[]
    truncated: boolean
  } = { columns: [], rows: [], truncated: false }

  constructor(engineUp = true) {
    this.engineUp = engineUp
  }

  available(): boolean {
    return this.engineUp
  }

  async writeParquet(): Promise<void> {}

  async query(
    _tenantId: string,
    sql: string,
    tables: readonly EngineTableRef[],
    options: { maxRows: number },
  ): Promise<{ columns: Array<{ name: string; sqlType: string }>; rows: readonly (readonly unknown[])[]; truncated: boolean }> {
    this.queries.push(sql)
    this.seenTableRefs.push([...tables])
    const rows = this.result.rows.slice(0, options.maxRows)
    return { columns: this.result.columns, rows, truncated: this.result.truncated }
  }
}

const contexts: Context[] = []

afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

/** Mount the tool suite over the real runtime with the given engine state. */
async function mount(options: { engineUp?: boolean; tables?: boolean; query?: boolean } = {}): Promise<{
  ctx: Context
  engine: MemoryEngine
  catalog: MemoryCatalog
  execute: (name: string, args: unknown) => Promise<{ isError: boolean; value: unknown; text: string }>
}> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LakehouseRuntime, { dataRoot: '/tmp/lakehouse-tool-test' })
  const catalog = new MemoryCatalog()
  const engine = new MemoryEngine(options.engineUp ?? true)
  ctx.lakehouse.registerCatalogStore(catalog)
  ctx.lakehouse.registerQueryProvider(engine)
  await ctx.plugin(ToolLakehouse, {
    tenant: 'bound-tenant',
    ...options.tables === undefined ? {} : { tables: options.tables },
    ...options.query === undefined ? {} : { query: options.query },
  })
  let counter = 0
  const execute = async (name: string, args: unknown) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '' }
  }
  return { ctx, engine, catalog, execute }
}

/** One registered-table record. */
function registeredTable(
  tenantId: string,
  tableName: string,
  columns: Array<{ name: string; sqlType: string }>,
  rowCount: number,
): LakehouseTable {
  return {
    tenantId,
    tableName,
    columns,
    format: 'parquet',
    location: `workspace/lakehouse/${tenantId}/${tableName}.parquet`,
    rowCount,
    createdAt: '2026-09-03T00:00:00.000Z',
    updatedAt: '2026-09-03T00:00:00.000Z',
  }
}

describe('lakehouse_tables', () => {
  it('lists the bound tenant\'s tables with columns, types, and row counts', async () => {
    const { catalog, execute } = await mount()
    await catalog.registerTable(registeredTable('bound-tenant', 'orders', [
      { name: 'id', sqlType: 'INTEGER' },
      { name: 'amount', sqlType: 'DOUBLE' },
    ], 12))
    await catalog.registerTable(registeredTable('bound-tenant', 'skus', [{ name: 'sku', sqlType: 'TEXT' }], 3))
    await catalog.registerTable(registeredTable('other-co', 'secret', [{ name: 'x', sqlType: 'TEXT' }], 99))
    const result = await execute('lakehouse_tables', {})
    expect(result.isError).toBe(false)
    const value = result.value as { tables: Array<{ name: string; rows: number; columns: Array<{ name: string; type: string }> }> }
    expect(value.tables.map(table => table.name)).toEqual(['orders', 'skus'])
    expect(value.tables[0]?.columns).toEqual([{ name: 'id', type: 'INTEGER' }, { name: 'amount', type: 'DOUBLE' }])
    expect(value.tables[0]?.rows).toBe(12)
    expect(result.text).toContain('orders — 12 rows')
    expect(result.text).toContain('amount DOUBLE')
    expect(result.text).not.toContain('secret')
  })

  it('narrows to one asked table and fails loudly on an unknown name', async () => {
    const { catalog, execute } = await mount()
    await catalog.registerTable(registeredTable('bound-tenant', 'orders', [{ name: 'id', sqlType: 'INTEGER' }], 5))
    const narrowed = await execute('lakehouse_tables', { table: 'orders' })
    expect(narrowed.isError).toBe(false)
    expect((narrowed.value as { tables: unknown[] }).tables).toHaveLength(1)
    const missing = await execute('lakehouse_tables', { table: 'nope' })
    expect(missing.isError).toBe(true)
    expect(missing.text).toContain('nope')
  })

  it('answers with the empty-inventory copy when no table is registered', async () => {
    const { execute } = await mount()
    const result = await execute('lakehouse_tables', {})
    expect(result.isError).toBe(false)
    expect(result.text).toMatch(/no lakehouse tables/iu)
    expect((result.value as { tables: unknown[] }).tables).toEqual([])
  })

  it('rejects a model-supplied tenant even when it matches the binding', async () => {
    const { execute } = await mount()
    const result = await execute('lakehouse_tables', { tenant: 'bound-tenant' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/tenant/u)
  })
})

describe('lakehouse_query', () => {
  it('returns columns, rows, attribution, and renders a markdown table', async () => {
    const { catalog, engine, execute } = await mount()
    await catalog.registerTable(registeredTable('bound-tenant', 'orders', [
      { name: 'region', sqlType: 'TEXT' },
      { name: 'total', sqlType: 'DOUBLE' },
    ], 2))
    await catalog.registerTable(registeredTable('bound-tenant', 'skus', [{ name: 'sku', sqlType: 'TEXT' }], 1))
    engine.result = {
      columns: [{ name: 'region', sqlType: 'TEXT' }, { name: 'total', sqlType: 'DOUBLE' }],
      rows: [['中亚', 1200.5], ['东南亚', 980]],
      truncated: false,
    }
    const result = await execute('lakehouse_query', { sql: 'SELECT region, SUM(amount) AS total FROM orders GROUP BY region' })
    expect(result.isError).toBe(false)
    const value = result.value as {
      sql: string
      tables_used: string[]
      columns: unknown[]
      rows: unknown[][]
      row_count: number
      truncated: boolean
    }
    expect(value.sql).toContain('FROM orders')
    expect(value.tables_used).toEqual(['orders'])
    expect(value.rows).toEqual([['中亚', 1200.5], ['东南亚', 980]])
    expect(value.row_count).toBe(2)
    expect(value.truncated).toBe(false)
    expect(result.text).toContain('| region | total |')
    expect(result.text).toContain('Data source: lakehouse table orders')
    // The engine only saw this tenant's tables (both are the tenant's here).
    expect(engine.seenTableRefs.at(-1)?.map(ref => ref.tableName).sort()).toEqual(['orders', 'skus'])
  })

  it('does not attribute substring- or prefix-matched table names', async () => {
    const { catalog, engine, execute } = await mount()
    await catalog.registerTable(registeredTable('bound-tenant', 'orders', [{ name: 'id', sqlType: 'INTEGER' }], 1))
    await catalog.registerTable(registeredTable('bound-tenant', 'orders_archive', [{ name: 'id', sqlType: 'INTEGER' }], 1))
    engine.result = { columns: [{ name: 'n', sqlType: 'BIGINT' }], rows: [[1]], truncated: false }
    const result = await execute('lakehouse_query', { sql: 'SELECT COUNT(*) AS n FROM "orders"' })
    const value = result.value as { tables_used: string[] }
    expect(value.tables_used).toEqual(['orders'])
  })

  it('carries the truncation marker into the value and the rendered note', async () => {
    const { catalog, engine, execute } = await mount()
    await catalog.registerTable(registeredTable('bound-tenant', 'orders', [{ name: 'id', sqlType: 'INTEGER' }], 500))
    engine.result = { columns: [{ name: 'id', sqlType: 'INTEGER' }], rows: [[1], [2]], truncated: true }
    const result = await execute('lakehouse_query', { sql: 'SELECT id FROM orders' })
    expect(result.isError).toBe(false)
    expect((result.value as { truncated: boolean }).truncated).toBe(true)
    expect(result.text).toMatch(/truncated at 2 rows/u)
  })

  it('rejects blank SQL and a model-supplied tenant', async () => {
    const { execute } = await mount()
    const blank = await execute('lakehouse_query', { sql: '   ' })
    expect(blank.isError).toBe(true)
    expect(blank.text).toMatch(/non-empty/u)
    const tenant = await execute('lakehouse_query', { sql: 'SELECT 1', tenant: 'other-co' })
    expect(tenant.isError).toBe(true)
    expect(tenant.text).toMatch(/tenant/u)
  })

  it('exposes another tenant\'s tables to the engine as absent, so cross-tenant SQL fails there', async () => {
    const { catalog, engine, execute } = await mount()
    await catalog.registerTable(registeredTable('other-co', 'secret', [{ name: 'x', sqlType: 'TEXT' }], 9))
    engine.result = { columns: [], rows: [], truncated: false }
    await execute('lakehouse_query', { sql: 'SELECT * FROM secret' })
    expect(engine.seenTableRefs.at(-1)).toEqual([])
  })

  it('fails structured when no engine is usable while the table listing keeps answering', async () => {
    const { catalog, execute } = await mount({ engineUp: false })
    await catalog.registerTable(registeredTable('bound-tenant', 'orders', [{ name: 'id', sqlType: 'INTEGER' }], 7))
    const listed = await execute('lakehouse_tables', {})
    expect(listed.isError).toBe(false)
    expect((listed.value as { tables: unknown[] }).tables).toHaveLength(1)
    const queried = await execute('lakehouse_query', { sql: 'SELECT id FROM orders' })
    expect(queried.isError).toBe(true)
    expect(queried.text).toMatch(/no usable lakehouse engine provider/iu)
  })
})

describe('registration surface', () => {
  it('honors the tables/query enablement switches', async () => {
    const { ctx } = await mount({ tables: false, query: false })
    expect(ctx.tools.get('lakehouse_tables')).toBeUndefined()
    expect(ctx.tools.get('lakehouse_query')).toBeUndefined()
  })

  it('fails config validation at load when no tenant is bound', () => {
    expect(() => ToolLakehouse.Config({} as unknown as ToolLakehouse.Config)).toThrow(/tenant/u)
  })

  it('exposes no tenant parameter in the model-facing schemas', async () => {
    const { ctx } = await mount()
    for (const name of ['lakehouse_tables', 'lakehouse_query']) {
      const tool = ctx.tools.get(name)
      const properties = (tool?.parameters as { properties?: Record<string, unknown> })?.properties ?? {}
      expect(properties.tenant, `${name} must not declare a tenant parameter`).toBeUndefined()
    }
  })
})

describe('value projection helpers', () => {
  it('renders the NULL cell and escapes pipes in the markdown table', async () => {
    const text = ToolLakehouse.formatQueryOutput({
      sql: 'SELECT note FROM orders',
      tables_used: ['orders'],
      columns: [{ name: 'note', type: 'TEXT' }],
      rows: [[null], ['a|b\nc']],
      row_count: 2,
      truncated: false,
    })
    expect(text).toContain('| NULL |')
    expect(text).toContain('a\\|b c')
    expect(text).toContain('Data source: lakehouse table orders')
  })

  it('renders the unattributed note for a statement naming no registered table', () => {
    const text = ToolLakehouse.formatQueryOutput({
      sql: 'SELECT 1',
      tables_used: [],
      columns: [{ name: '1', type: 'INTEGER' }],
      rows: [[1]],
      row_count: 1,
      truncated: false,
    })
    expect(text).toContain('Data source: lakehouse (no registered table named by the statement)')
  })

  it('narrows replayed presentation metadata and rejects malformed shapes', () => {
    expect(ToolLakehouse.queryMetaFromResult({ rows: 2, truncated: false, tablesUsed: ['orders'] })).toEqual({ rows: 2, truncated: false, tablesUsed: ['orders'] })
    expect(ToolLakehouse.queryMetaFromResult({ rows: -1, truncated: false, tablesUsed: [] })).toBeUndefined()
    expect(ToolLakehouse.queryMetaFromResult('nope')).toBeUndefined()
    expect(ToolLakehouse.tablesMetaFromResult({ tables: 1, rows: 5 })).toEqual({ tables: 1, rows: 5 })
    expect(ToolLakehouse.tablesMetaFromResult({ tables: 1, rows: 'x' })).toBeUndefined()
  })

  it('titles the pending query card by the first SQL line and caps long statements', () => {
    expect(ToolLakehouse.presentQueryCall({ sql: 'SELECT id\nFROM orders' }).title).toBe('SELECT id')
    expect(ToolLakehouse.presentQueryCall({ sql: `SELECT ${'x'.repeat(100)} FROM t` }).title.length).toBeLessThanOrEqual(80)
  })

  it('answers two concurrent queries (the concurrency-safe flags hold)', async () => {
    const { catalog, engine, execute } = await mount()
    await catalog.registerTable(registeredTable('bound-tenant', 'orders', [{ name: 'id', sqlType: 'INTEGER' }], 1))
    engine.result = { columns: [{ name: 'id', sqlType: 'INTEGER' }], rows: [[1]], truncated: false }
    const [a, b] = await Promise.all([
      execute('lakehouse_query', { sql: 'SELECT id FROM orders' }),
      execute('lakehouse_tables', {}),
    ])
    expect(a.isError || b.isError).toBe(false)
  })

  it('declares both tools concurrency-safe', async () => {
    const { ctx } = await mount()
    expect(ctx.tools.get('lakehouse_tables')?.isConcurrencySafe?.({})).toBe(true)
    expect(ctx.tools.get('lakehouse_query')?.isConcurrencySafe?.({ sql: 'SELECT 1' })).toBe(true)
  })

  it('covers the tables presenters and the remaining query-presentation branches', () => {
    expect(ToolLakehouse.presentTablesCall({}).title).toBe('lakehouse_tables')
    expect(ToolLakehouse.presentTablesCall({ table: ' orders ' }).title).toBe('orders')
    const tablesOk = ToolLakehouse.presentTablesResult({ table: 'orders' }, {
      isError: false, content: [], meta: { tables: 1, rows: 5 },
    })
    expect(tablesOk?.content?.[0]).toMatchObject({ type: 'text', text: '1 lakehouse table, 5 rows total' })
    expect(ToolLakehouse.presentTablesResult({}, { isError: true, content: [] })).toBeUndefined()
    expect(ToolLakehouse.presentTablesResult({}, { isError: false, content: [], meta: { tables: 1, rows: 'x' } })).toBeUndefined()
    expect(ToolLakehouse.presentTablesResult({}, { isError: false, content: [], meta: 'nope' })).toBeUndefined()
    // Blank SQL titles the cards with the tool name; a single untruncated row reads naturally.
    expect(ToolLakehouse.presentQueryCall({ sql: '  ' }).title).toBe('lakehouse_query')
    const single = ToolLakehouse.presentQueryResult({ sql: ' ' }, {
      isError: false, content: [], meta: { rows: 1, truncated: false, tablesUsed: [] },
    })
    expect(single?.content?.[0]).toMatchObject({ type: 'text', text: '1 row from lakehouse' })
    expect(ToolLakehouse.queryMetaFromResult({ rows: 1, truncated: 'yes', tablesUsed: [] })).toBeUndefined()
    expect(ToolLakehouse.queryMetaFromResult({ rows: 1, truncated: false, tablesUsed: 'orders' })).toBeUndefined()
    expect(ToolLakehouse.queryMetaFromResult({ rows: 1, truncated: false, tablesUsed: [3] })).toBeUndefined()
    expect(ToolLakehouse.queryMetaFromResult(null)).toBeUndefined()
  })

  it('covers the remaining tables-meta refusals, the plural row, and malformed query results', () => {
    expect(ToolLakehouse.tablesMetaFromResult({ tables: 2, rows: 'x' })).toBeUndefined()
    expect(ToolLakehouse.tablesMetaFromResult({ tables: 'x', rows: 1 })).toBeUndefined()
    expect(ToolLakehouse.tablesMetaFromResult([])).toBeUndefined()
    const plural = ToolLakehouse.presentTablesResult({}, {
      isError: false, content: [], meta: { tables: 2, rows: 7 },
    })
    expect(plural?.content?.[0]).toMatchObject({ type: 'text', text: '2 lakehouse tables, 7 rows total' })
    expect(ToolLakehouse.presentQueryResult({ sql: 'SELECT 1' }, {
      isError: false, content: [], meta: 'malformed',
    })).toBeUndefined()
    const longTitle = ToolLakehouse.presentQueryResult({ sql: `SELECT ${'x'.repeat(90)}` }, {
      isError: false, content: [], meta: { rows: 1, truncated: false, tablesUsed: [] },
    })
    expect(longTitle?.title === undefined ? 0 : longTitle.title.length).toBeLessThanOrEqual(80)
  })

  it('renders the plural attribution and multiple named tables', () => {
    const text = ToolLakehouse.formatQueryOutput({
      sql: 'SELECT 1',
      tables_used: ['orders', 'skus'],
      columns: [{ name: 'n', type: 'BIGINT' }],
      rows: [[1]],
      row_count: 1,
      truncated: false,
    })
    expect(text).toContain('Data source: lakehouse tables orders, skus')
  })

  it('presents the completed call and stays silent on failures', () => {
    const ok = ToolLakehouse.presentQueryResult({ sql: 'SELECT 1' }, {
      isError: false,
      content: [],
      meta: { rows: 3, truncated: true, tablesUsed: ['orders'] },
    })
    expect(ok?.content?.[0]).toMatchObject({ type: 'text', text: '3 rows (truncated) from orders' })
    const failed: ToolResult = { isError: true, content: [{ type: 'text', text: 'Error: boom' }] }
    expect(ToolLakehouse.presentQueryResult({ sql: 'SELECT 1' }, failed)).toBeUndefined()
  })
})
