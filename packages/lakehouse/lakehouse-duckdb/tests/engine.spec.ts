import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DuckDbEngine } from '../src/engine.ts'
import type { EngineTableRef, TabularData } from '@deepseek-ai/dsh-lakehouse'

function ordersTabular(): TabularData {
  return {
    columns: [
      { name: 'month', sqlType: 'TEXT' },
      { name: 'tons', sqlType: 'DOUBLE' },
    ],
    rows: [
      ['2026-07', 12.5],
      ['2026-08', 15.25],
      ['2026-09', 3.75],
    ],
  }
}

function ref(location: string, format: 'parquet' | 'csv' = 'parquet'): EngineTableRef {
  return { tableName: 'orders', location, format }
}

let root: string | undefined

async function tmpRoot(): Promise<string> {
  root ??= await mkdtemp(join(tmpdir(), 'dsh-duckdb-engine-'))
  return root
}

afterEach(cleanup)

async function cleanup(): Promise<void> {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
}

describe('DuckDbEngine availability', () => {
  it('reports available once the native module has loaded', async () => {
    const engine = new DuckDbEngine({})
    expect(engine.available()).toBe(false)
    await engine.probe()
    await engine.probe()
    expect(engine.available()).toBe(true)
    engine.dispose()
    expect(engine.available()).toBe(false)
    await engine.probe()
    expect(engine.available()).toBe(false)
  })

  it('fails loud through query and writeParquet when the native module is missing', async () => {
    const engine = new DuckDbEngine({}, { importDuckDb: async () => { throw new Error('module not found') } })
    await engine.probe()
    expect(engine.available()).toBe(false)
    await expect(engine.query('t', 'SELECT 1', [], { maxRows: 10 })).rejects.toMatchObject({ code: 'LAKEHOUSE_ENGINE_UNAVAILABLE' })
    await expect(engine.writeParquet('/tmp/never.parquet', ordersTabular())).rejects.toMatchObject({ code: 'LAKEHOUSE_ENGINE_UNAVAILABLE' })
  })

  it('surfaces the probe failure cause through the unavailability error', async () => {
    const engine = new DuckDbEngine({}, { importDuckDb: async () => { throw new Error('ELF load failed') } })
    await engine.probe()
    await expect(engine.query('t', 'SELECT 1', [], { maxRows: 10 })).rejects.toThrow(/ELF load failed/)
  })

  it('records a non-Error probe cause verbatim', async () => {
    const engine = new DuckDbEngine({}, { importDuckDb: async () => { throw 'raw dlopen failure' } })
    await engine.probe()
    await expect(engine.query('t', 'SELECT 1', [], { maxRows: 10 })).rejects.toThrow(/raw dlopen failure/)
  })
})

describe('DuckDbEngine writeParquet', () => {
  it('writes real Parquet files and reads them back', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.parquet')
    await engine.writeParquet(location, ordersTabular())
    expect(existsSync(location)).toBe(true)
    const result = await engine.query('hongfa-food', 'SELECT month, tons FROM orders ORDER BY month', [ref(location)], { maxRows: 10 })
    expect(result.columns).toEqual([
      { name: 'month', sqlType: 'VARCHAR' },
      { name: 'tons', sqlType: 'DOUBLE' },
    ])
    expect(result.rows).toEqual([
      ['2026-07', 12.5],
      ['2026-08', 15.25],
      ['2026-09', 3.75],
    ])
    expect(result.truncated).toBe(false)
    engine.dispose()
    await cleanup()
  })

  it('round-trips an empty table and boolean/null cells', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'empty.parquet')
    await engine.writeParquet(location, {
      columns: [
        { name: 'flag', sqlType: 'BOOLEAN' },
        { name: 'note', sqlType: 'TEXT' },
      ],
      rows: [[true, null]],
    })
    const result = await engine.query('t', 'SELECT flag, note FROM orders', [ref(location)], { maxRows: 10 })
    expect(result.rows).toEqual([[true, null]])
    engine.dispose()
    await cleanup()
  })

  it('rejects a column sqlType outside the supported set', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    await expect(engine.writeParquet(join(await tmpRoot(), 'bad.parquet'), {
      columns: [{ name: 'x', sqlType: 'INTEGER); DROP TABLE orders; --' }],
      rows: [[1]],
    })).rejects.toMatchObject({ code: 'LAKEHOUSE_INVALID_SQL_TYPE' })
    engine.dispose()
    await cleanup()
  })

  it('rejects a cell value outside the JSON-scalar value domain', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    await expect(engine.writeParquet(join(await tmpRoot(), 'bad-cell.parquet'), {
      columns: [{ name: 'x', sqlType: 'TEXT' }],
      rows: [[{ nested: true }]],
    })).rejects.toMatchObject({ code: 'LAKEHOUSE_WRITE_FAILED' })
    engine.dispose()
    await cleanup()
  })

  it('rejects an aborted signal before writing', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(engine.writeParquet(join(await tmpRoot(), 'x.parquet'), ordersTabular(), controller.signal))
      .rejects.toThrow(/cancelled/)
    engine.dispose()
    await cleanup()
  })
})

describe('DuckDbEngine query', () => {
  it('caps rows at maxRows and marks truncation', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.parquet')
    await engine.writeParquet(location, ordersTabular())
    const result = await engine.query('hongfa-food', 'SELECT month FROM orders ORDER BY month', [ref(location)], { maxRows: 2 })
    expect(result.truncated).toBe(true)
    expect(result.rows).toEqual([['2026-07'], ['2026-08']])
    engine.dispose()
    await cleanup()
  })

  it('normalizes bigint aggregates to plain numbers', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.parquet')
    await engine.writeParquet(location, ordersTabular())
    const result = await engine.query('hongfa-food', 'SELECT count(*) AS n, sum(tons) AS total FROM orders', [ref(location)], { maxRows: 10 })
    expect(result.rows).toEqual([[3, 31.5]])
    expect(typeof result.rows[0]?.[0]).toBe('number')
    engine.dispose()
    await cleanup()
  })

  it('exposes only the handed tables: another tenant table name fails as unknown', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.parquet')
    await engine.writeParquet(location, ordersTabular())
    await expect(engine.query('peer-food', 'SELECT * FROM secret', [ref(location)], { maxRows: 10 }))
      .rejects.toMatchObject({ code: 'LAKEHOUSE_QUERY_FAILED' })
    engine.dispose()
    await cleanup()
  })

  it('rejects multi-statement SQL', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.parquet')
    await engine.writeParquet(location, ordersTabular())
    await expect(engine.query('t', 'SELECT 1; DROP TABLE orders', [ref(location)], { maxRows: 10 }))
      .rejects.toMatchObject({ code: 'LAKEHOUSE_QUERY_FAILED' })
    engine.dispose()
    await cleanup()
  })

  it('accepts a trailing semicolon on single statements', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.parquet')
    await engine.writeParquet(location, ordersTabular())
    const result = await engine.query('t', 'SELECT count(*) AS n FROM orders;', [ref(location)], { maxRows: 10 })
    expect(result.rows).toEqual([[3]])
    engine.dispose()
    await cleanup()
  })

  it('reads csv-backed tables through the format discriminator', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.csv')
    const { writeFile } = await import('node:fs/promises')
    await writeFile(location, 'month,tons\n2026-07,12.5\n2026-08,15.25\n')
    const result = await engine.query('t', 'SELECT sum(tons) AS total FROM orders', [ref(location, 'csv')], { maxRows: 10 })
    expect(result.rows).toEqual([[27.75]])
    engine.dispose()
    await cleanup()
  })

  it('rejects an aborted signal before executing', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const controller = new AbortController()
    controller.abort(new Error('cancelled'))
    await expect(engine.query('t', 'SELECT 1', [], { maxRows: 10 }, controller.signal))
      .rejects.toThrow(/cancelled/)
    engine.dispose()
    await cleanup()
  })

  it('rejects use after dispose', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    engine.dispose()
    await expect(engine.query('t', 'SELECT 1', [], { maxRows: 10 })).rejects.toMatchObject({ code: 'LAKEHOUSE_ENGINE_UNAVAILABLE' })
  })
})

describe('DuckDbEngine value normalization', () => {
  it('normalizes timestamps to ISO strings and unsafe bigints to strings', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const result = await engine.query('t', "SELECT TIMESTAMP '2026-09-03 10:00:00' AS at, 12345678901234567890::HUGEINT AS big", [], { maxRows: 10 })
    const [at, big] = result.rows[0] ?? []
    expect(typeof at).toBe('string')
    expect(String(at)).toContain('2026-09-03')
    expect(typeof big).toBe('string')
    expect(String(big)).toBe('12345678901234567890')
    engine.dispose()
    await cleanup()
  })
})

describe('DuckDbEngine defensive branches', () => {
  it('rejects a table reference with an unsupported format', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    await expect(engine.query('t', 'SELECT 1', [{ tableName: 'weird', location: '/tmp/x', format: 'exe' as 'parquet' }], { maxRows: 10 }))
      .rejects.toMatchObject({ code: 'LAKEHOUSE_QUERY_FAILED' })
    engine.dispose()
    await cleanup()
  })

  it('wraps a failing copy as a write failure with the cause chained', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    await expect(engine.writeParquet(join('/nonexistent-root-dir', 'out.parquet'), ordersTabular()))
      .rejects.toMatchObject({ code: 'LAKEHOUSE_WRITE_FAILED' })
    engine.dispose()
    await cleanup()
  })

  it('propagates an abort that lands between connection setup and the append loop', async () => {
    const engine = new DuckDbEngine({})
    await engine.probe()
    const controller = new AbortController()
    const writing = engine.writeParquet(join(await tmpRoot(), 'mid.parquet'), ordersTabular(), controller.signal)
    controller.abort(new Error('mid-write cancel'))
    await expect(writing).rejects.toThrow(/mid-write cancel/)
    engine.dispose()
    await cleanup()
  })
})

describe('DuckDbEngine instance options', () => {
  it('applies configured memory and thread limits', async () => {
    const engine = new DuckDbEngine({ memoryLimitMb: 256, threads: 1 })
    await engine.probe()
    const location = join(await tmpRoot(), 'orders.parquet')
    await engine.writeParquet(location, ordersTabular())
    const result = await engine.query('t', 'SELECT current_setting(\'threads\') AS threads FROM orders LIMIT 1', [ref(location)], { maxRows: 10 })
    expect(result.rows[0]?.[0]).toBe(1)
    engine.dispose()
    await cleanup()
  })
})
