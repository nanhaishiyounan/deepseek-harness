/**
 * The data domain's unified upload channel: the five-format routing matrix
 * (csv/xlsx/json → lakehouse tables; md/pdf → kb documents), the write gate
 * and tenant binding, the loud refusals (unsupported type, magic-number
 * mismatch, empty body, oversized), the no-lakehouse composition, and the
 * replacement fact on both routes.
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ViewActionService from '@deepseek-ai/dsh-view-actions'
import LakehouseRuntime from '@deepseek-ai/dsh-lakehouse'
import type { CatalogStore, EngineTableRef, LakehouseTable, LakehouseTransferEntry, QueryProvider, TabularData } from '@deepseek-ai/dsh-lakehouse'
import { createApiProxy } from '../src/api-proxy.ts'
import { dataUploadRequestSchema, dataUploadValueSchema } from '../src/api/data.schema.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

/** A kb seam stub recording the tenant each ingest lands on. */
function kbStub() {
  const ingestArgs: { tenantId: string; sourcePath: string; content: string }[] = []
  const kb = {
    stats: vi.fn(async () => ({ documents: 0, chunks: 0, embeddedChunks: 0, embedAvailable: false })),
    usage: vi.fn(async () => ({ searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 })),
    search: vi.fn(async () => ({ mode: 'text', results: [] })),
    ingest: vi.fn(async (request: { tenantId: string; sourcePath: string; content: string }) => {
      ingestArgs.push(request)
      return { docId: 1, chunks: 1, embedded: false }
    }),
  }
  return { kb, ingestArgs }
}

/** In-memory catalog stand-in (the real runtime registers it as its store). */
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

/** Engine stand-in: records parquet writes, never queried here. */
class MemoryEngine implements QueryProvider {
  readonly id = 'memory-engine'
  readonly parquetWrites: Array<{ location: string; tabular: TabularData }> = []

  available(): boolean {
    return true
  }

  async writeParquet(location: string, tabular: TabularData): Promise<void> {
    this.parquetWrites.push({ location, tabular })
  }

  async query(_t: string, _s: string, _tables: readonly EngineTableRef[]): Promise<never> {
    throw new Error('not used')
  }
}

async function harness(defaults: {
  dataUploadEnabled?: boolean
  kbTenant?: string
  mountLakehouse?: boolean
}) {
  const stub = kbStub()
  const cwd = mkdtempSync(join(tmpdir(), 'dsh-data-domain-'))
  uploadRoots.push(cwd)
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ViewActionService)
  await ctx.plugin(AgentRegistry)
  ctx.provide('kb', stub.kb as never)
  const catalog = new MemoryCatalog()
  const engine = new MemoryEngine()
  if (defaults.mountLakehouse !== false) {
    await ctx.plugin(LakehouseRuntime, { dataRoot: join(cwd, 'lakehouse') })
    ctx.lakehouse.registerCatalogStore(catalog)
    ctx.lakehouse.registerQueryProvider(engine)
  }
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd,
    ...defaults.kbTenant === undefined ? {} : { kbTenant: defaults.kbTenant },
    ...defaults.dataUploadEnabled === undefined ? {} : { dataUploadEnabled: defaults.dataUploadEnabled },
  })
  return { api, ctx, cwd, ingestArgs: stub.ingestArgs, catalog, engine }
}

const uploadRoots: string[] = []

afterEach(() => {
  while (uploadRoots.length > 0) rmSync(uploadRoots.pop()!, { recursive: true, force: true })
})

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: 'r' as never, payload }
}

/** One upload call with inline base64 bytes. */
function upload(filename: string, bytes: Uint8Array | string, extra: Record<string, string> = {}) {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  return { filename, data: Buffer.from(data).toString('base64'), ...extra }
}

describe('data upload routing', () => {
  it('refuses until the deployment opts into data writes and binds a tenant', async () => {
    const gated = await harness({ kbTenant: 'demo-food-co' })
    const refused = await gated.api.data.upload(request(upload('orders.csv', 'id\n1\n')))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'data-write-disabled' } })
    await gated.ctx.fiber.dispose()

    const unbound = await harness({ dataUploadEnabled: true })
    const tenantless = await unbound.api.data.upload(request(upload('orders.csv', 'id\n1\n')))
    expect(tenantless.result).toMatchObject({ ok: false, error: { code: 'kb-tenant-unbound' } })
    await unbound.ctx.fiber.dispose()
  })

  it('routes csv to the lakehouse as a typed table with a replacement fact', async () => {
    const { api, ctx, catalog, engine } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const csv = 'region,units\n中亚,120\n东南亚,98\n'
    const first = await api.data.upload(request(upload('customs-2026.csv', csv)))
    expect(first.result).toEqual({
      ok: true,
      value: { destination: 'lakehouse', replaced: false, table: 'customs_2026', rows: 2 },
    })
    expect(engine.parquetWrites[0]?.tabular.columns).toEqual([
      { name: 'region', sqlType: 'TEXT' },
      { name: 'units', sqlType: 'INTEGER' },
    ])
    expect(catalog.tables.get('demo-food-co\u0000customs_2026')?.rowCount).toBe(2)
    const second = await api.data.upload(request(upload('customs-2026.csv', 'region,units\n中亚,1\n')))
    expect(second.result).toMatchObject({ ok: true, value: { replaced: true, rows: 1 } })
    await ctx.fiber.dispose()
  })

  it('routes a json row array to the lakehouse', async () => {
    const { api, ctx, catalog } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const result = await api.data.upload(request(upload('orders.json', '[{"region":"中亚","amount":12.5}]')))
    expect(result.result).toMatchObject({ ok: true, value: { destination: 'lakehouse', table: 'orders', rows: 1 } })
    expect(catalog.tables.get('demo-food-co\u0000orders')?.columns.map(column => `${column.name}:${column.sqlType}`)).toEqual(['region:TEXT', 'amount:DOUBLE'])
    await ctx.fiber.dispose()
  })

  it('routes a real xlsx body to the lakehouse through exceljs', async () => {
    const { Workbook } = await import('exceljs')
    const workbook = new Workbook()
    const sheet = workbook.addWorksheet('orders')
    sheet.addRow(['region', 'units'])
    sheet.addRow(['中亚', 120])
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer())
    const { api, ctx, catalog } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const result = await api.data.upload(request(upload('exports.xlsx', bytes)))
    expect(result.result).toMatchObject({ ok: true, value: { destination: 'lakehouse', table: 'exports', rows: 1 } })
    expect(catalog.tables.get('demo-food-co\u0000exports')?.columns).toEqual([
      { name: 'region', sqlType: 'TEXT' },
      { name: 'units', sqlType: 'INTEGER' },
    ])
    await ctx.fiber.dispose()
  })

  it('routes markdown to the kb with the shared ingest pipeline', async () => {
    const { api, ctx, ingestArgs } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const result = await api.data.upload(request(upload('visit-note.md', '# 走访纪要\n琥珀麦芽。')))
    expect(result.result).toEqual({
      ok: true,
      value: { destination: 'kb', replaced: false, document: { doc_id: 1, chunks: 1, embedded: false } },
    })
    expect(ingestArgs).toEqual([{ tenantId: 'demo-food-co', sourcePath: 'workspace/data/uploads/visit-note.md', docKind: 'other', content: '# 走访纪要\n琥珀麦芽。' }])
    const again = await api.data.upload(request(upload('visit-note.md', '# 走访纪要（二）')))
    expect(again.result).toMatchObject({ ok: true, value: { destination: 'kb', replaced: true } })
    await ctx.fiber.dispose()
  })

  it('routes a real pdf to the kb and reports its replacement fact', async () => {
    const pdf = readFileSync(fileURLToPath(new URL('../../../kb/tool-kb/tests/fixtures/docs/sample.pdf', import.meta.url)))
    const { api, ctx, ingestArgs } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const result = await api.data.upload(request(upload('visit-report.pdf', pdf)))
    expect(result.result).toMatchObject({ ok: true, value: { destination: 'kb', replaced: false, document: { doc_id: 1 } } })
    expect(ingestArgs[0]?.sourcePath).toBe('workspace/data/uploads/visit-report.pdf')
    expect(ingestArgs[0]?.content.length).toBeGreaterThan(0)
    await ctx.fiber.dispose()
  })
})

describe('data upload refusals', () => {
  it('refuses an unsupported extension with the supported set in the message', async () => {
    const { api, ctx } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const refused = await api.data.upload(request(upload('archive.zip', 'PK\u0003\u0004whatever')))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'data-unsupported-type', details: { filename: 'archive.zip' } } })
    expect((refused.result as { ok: false; error: { message: string } }).error.message).toContain('.csv')
    await ctx.fiber.dispose()
  })

  it('refuses an empty body and a magic number contradicting the extension', async () => {
    const { api, ctx } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const empty = await api.data.upload(request(upload('orders.csv', '')))
    expect(empty.result).toMatchObject({ ok: false, error: { code: 'data-empty-file' } })
    const mismatch = await api.data.upload(request(upload('report.pdf', '<html>not a pdf</html>')))
    expect(mismatch.result).toMatchObject({ ok: false, error: { code: 'data-type-mismatch' } })
    const jsonMismatch = await api.data.upload(request(upload('orders.json', '{"id":1}')))
    expect(jsonMismatch.result).toMatchObject({ ok: false, error: { code: 'data-type-mismatch' } })
    await ctx.fiber.dispose()
  })

  it('refuses a lakehouse-routed upload when no lakehouse is composed', async () => {
    const { api, ctx } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co', mountLakehouse: false })
    const refused = await api.data.upload(request(upload('orders.csv', 'id\n1\n')))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'data-lakehouse-unavailable' } })
    await ctx.fiber.dispose()
  })

  it('shapes a parse failure as data-ingest-failed with the landing path', async () => {
    const { api, ctx } = await harness({ dataUploadEnabled: true, kbTenant: 'demo-food-co' })
    const broken = await api.data.upload(request(upload('orders.csv', 'a,b\n1\n')))
    expect(broken.result).toMatchObject({
      ok: false,
      error: { code: 'data-ingest-failed', details: { path: 'workspace/data/uploads/orders.csv' } },
    })
    await ctx.fiber.dispose()
  })
})

describe('data upload wire schemas', () => {
  it('reuses the stack-safe canonical base64 gate', () => {
    const big = Buffer.alloc(1024 * 1024, 97).toString('base64')
    expect(dataUploadRequestSchema.safeParse({ filename: 'big.csv', data: big }).success).toBe(true)
    for (const data of ['eA', 'eA=', 'aGVsbG8 ', 'aGVsbG8-']) {
      expect(dataUploadRequestSchema.safeParse({ filename: 'a.csv', data }).success, JSON.stringify(data)).toBe(false)
    }
  })

  it('validates the discriminated response value on both branches', () => {
    expect(dataUploadValueSchema.safeParse({ destination: 'kb', replaced: false, document: { doc_id: 1, chunks: 2, embedded: false } }).success).toBe(true)
    expect(dataUploadValueSchema.safeParse({ destination: 'lakehouse', replaced: true, table: 'orders', rows: 5 }).success).toBe(true)
    expect(dataUploadValueSchema.safeParse({ destination: 'nowhere', replaced: false }).success).toBe(false)
    expect(dataUploadValueSchema.safeParse({ destination: 'lakehouse', replaced: false, table: 'orders' }).success).toBe(false)
  })
})
