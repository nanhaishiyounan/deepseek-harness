/**
 * The lakehouse tool suite's behavior over the real engine: the three-tool
 * registration, the listing and schema projections, the query round trip
 * with attribution and truncation, the read-only defense (DML/DDL/ATTACH and
 * multi-statement injections rejected with structured errors), config
 * gating, and the degraded engine (queries fail structured while tool
 * registration stays intact).
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import * as LakehouseEngine from '@deepseek-ai/dsh-lakehouse-engine'
import * as ToolLakehouse from '../src/index.ts'

const signal = new AbortController().signal
let counter = 0

async function setup(root: string, toolConfig?: Parameters<typeof ToolLakehouse.apply>[1]): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LakehouseEngine, {
    catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake'), dataPath: join(root, 'files') },
    maxRows: 5,
  })
  await ctx.lakehouseEngine.createSchema('legacy_nocobase')
  await ctx.lakehouseEngine.execInternal(
    'CREATE TABLE lake.legacy_nocobase.orders AS '
    + "SELECT range AS id, 'c' || CAST(range AS VARCHAR) AS customer FROM range(7)",
  )
  await ctx.plugin(ToolLakehouse, toolConfig)
  return ctx
}

/** Invoke one registered tool through the tools runtime, like a model round. */
async function call(ctx: Context, name: string, args: Record<string, unknown>): Promise<{ isError: boolean; value: unknown; text: string }> {
  const result = await ctx.tools.execute({ signal, callId: CallId(`call-${String(++counter)}`), name, arguments: args as never })
  const text = result.content.find(block => block.type === 'text')
  return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '' }
}

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => {
    await rm(root, { recursive: true, force: true })
  }))
})

async function freshRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'dsh-tool-lakehouse-'))
  roots.push(root)
  return root
}

describe('lakehouse tool suite', () => {
  it('registers the three tools by default', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      expect(ctx.tools.get('lakehouse_list_tables')).toBeDefined()
      expect(ctx.tools.get('lakehouse_query')).toBeDefined()
      expect(ctx.tools.get('lakehouse_schema')).toBeDefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('respects per-tool config gating', async () => {
    const root = await freshRoot()
    const ctx = await setup(root, { listTables: false, schema: false })
    try {
      expect(ctx.tools.get('lakehouse_list_tables')).toBeUndefined()
      expect(ctx.tools.get('lakehouse_query')).toBeDefined()
      expect(ctx.tools.get('lakehouse_schema')).toBeUndefined()
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('lists tables with live row counts and reference forms', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      const result = await call(ctx, 'lakehouse_list_tables', {})
      expect(result.isError, result.text).not.toBe(true)
      const value = result.value as { tables: Array<{ ref: string; schema: string; table: string; row_count: number }> }
      expect(value.tables).toEqual([
        { ref: 'lake.legacy_nocobase.orders', schema: 'legacy_nocobase', table: 'orders', row_count: 7 },
      ])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('describes one table with columns, count, and sample rows', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      const result = await call(ctx, 'lakehouse_schema', { schema: 'legacy_nocobase', table: 'orders' })
      expect(result.isError, result.text).not.toBe(true)
      const value = result.value as {
        ref: string
        columns: Array<{ name: string; type: string }>
        row_count: number
        sample_rows: number[][]
      }
      expect(value.ref).toBe('lake.legacy_nocobase.orders')
      expect(value.columns.map(column => column.name)).toEqual(['id', 'customer'])
      expect(value.row_count).toBe(7)
      expect(value.sample_rows).toHaveLength(5)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('runs a read query with attribution and the row cap', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      const result = await call(ctx, 'lakehouse_query', { sql: 'SELECT count(*) AS n FROM lake.legacy_nocobase.orders' })
      expect(result.isError, result.text).not.toBe(true)
      const value = result.value as { tables_used: string[]; rows: number[][]; row_count: number; truncated: boolean }
      expect(value.rows).toEqual([[7]])
      expect(value.tables_used).toEqual(['legacy_nocobase.orders'])
      const capped = await call(ctx, 'lakehouse_query', { sql: 'SELECT id FROM lake.legacy_nocobase.orders' })
      const cappedValue = capped.value as { row_count: number; truncated: boolean }
      expect(cappedValue.row_count).toBe(5)
      expect(cappedValue.truncated).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects DML, DDL, ATTACH, and multi-statement injections with structured errors', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      const injections: ReadonlyArray<readonly [string, string]> = [
        ['INSERT', "INSERT INTO lake.legacy_nocobase.orders VALUES (99, 'evil')"],
        ['UPDATE', "UPDATE lake.legacy_nocobase.orders SET customer = 'evil' WHERE id = 1"],
        ['DELETE', 'DELETE FROM lake.legacy_nocobase.orders'],
        ['DROP', 'DROP TABLE lake.legacy_nocobase.orders'],
        ['ATTACH', "ATTACH 'ducklake:/tmp/evil.ducklake' AS evil"],
        ['multi-statement', 'SELECT 1; DROP TABLE lake.legacy_nocobase.orders'],
        ['payload-in-string', "SELECT 'x' ; DELETE FROM lake.legacy_nocobase.orders"],
        ['copy-out', "COPY (SELECT 1) TO '/tmp/evil.parquet'"],
      ]
      for (const [label, sql] of injections) {
        const result = await call(ctx, 'lakehouse_query', { sql })
        expect(result.isError, `the ${label} injection must fail`).toBe(true)
        expect(result.text, `the ${label} rejection must carry its reason`).toMatch(/not read-only|multiple SQL statements|blank/u)
      }
      // The engine's tables survive every injection.
      const after = await call(ctx, 'lakehouse_list_tables', {})
      const afterValue = after.value as { tables: Array<{ row_count: number }> }
      expect(afterValue.tables[0]?.row_count).toBe(7)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects blank SQL and decorated schema arguments at parse time', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      const blank = await call(ctx, 'lakehouse_query', { sql: '   ' })
      expect(blank.isError).toBe(true)
      const decorated = await call(ctx, 'lakehouse_schema', { schema: 'legacy_nocobase"; --', table: 'orders' })
      expect(decorated.isError).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('rejects unexpected arguments on the listing tool', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      const result = await call(ctx, 'lakehouse_list_tables', { tenant: 'evil' })
      expect(result.isError).toBe(true)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('fails structured on an unavailable engine while registration stays intact', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      ctx.lakehouseEngine.close()
      expect(ctx.tools.get('lakehouse_query')).toBeDefined()
      const result = await call(ctx, 'lakehouse_query', { sql: 'SELECT 1' })
      expect(result.isError).toBe(true)
      expect(result.text).toMatch(/unavailable/u)
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('renders the query output with the attribution line the source trail parses', async () => {
    const root = await freshRoot()
    const ctx = await setup(root)
    try {
      const outcome = await ctx.lakehouseEngine.query('SELECT count(*) AS n FROM lake.legacy_nocobase.orders')
      const value = ToolLakehouse.queryValueFromOutcome(
        { sql: 'SELECT count(*) AS n FROM lake.legacy_nocobase.orders' },
        outcome,
        [{ schema: 'legacy_nocobase', table: 'orders', rowCount: 7 }],
      )
      const text = ToolLakehouse.formatQueryOutput(value)
      expect(text).toContain('| n |')
      expect(text).toContain('Data source: lakehouse table legacy_nocobase.orders')
      expect(text).toContain('Answer from the rows above')
    } finally {
      await ctx.fiber.dispose()
    }
  })
})
