import { describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as EnginePlugin from '../src/index.ts'
import { resolveCatalogAttach } from '../src/catalog.ts'

describe('catalog attachment resolution', () => {
  it('emits the DuckLake attach with resolved paths and no pre-attach statements', () => {
    const attach = resolveCatalogAttach(
      { kind: 'ducklake', catalogPath: '/tmp/lake/catalog.ducklake' },
      '/tmp/lake/catalog.ducklake',
      '/tmp/lake/files',
    )
    expect(attach.extensionLoads).toEqual(['LOAD ducklake'])
    expect(attach.preAttachSql).toEqual([])
    expect(attach.attachSql).toBe('ATTACH \'ducklake:/tmp/lake/catalog.ducklake\' AS lake (DATA_PATH \'/tmp/lake/files\')')
  })

  it('emits the Iceberg REST attach with the S3 secret pre-attach statement', () => {
    const attach = resolveCatalogAttach(
      {
        kind: 'iceberg-rest',
        restUri: 'http://localhost:8181/iceberg',
        warehouse: 'lakehouse',
        s3: { endpoint: 'localhost:9000', accessKeyId: 'k', secretAccessKey: 's' },
      },
      '(remote)',
      '(remote)',
    )
    expect(attach.extensionLoads).toEqual(['LOAD iceberg'])
    expect(attach.preAttachSql).toHaveLength(1)
    expect(attach.preAttachSql[0]).toContain('KEY_ID \'k\'')
    expect(attach.preAttachSql[0]).toContain('ENDPOINT \'localhost:9000\'')
    expect(attach.preAttachSql[0]).toContain('REGION \'us-east-1\'')
    expect(attach.preAttachSql[0]).toContain('URL_STYLE path')
    expect(attach.attachSql).toBe('ATTACH \'lakehouse\' AS lake (TYPE ICEBERG, ENDPOINT \'http://localhost:8181/iceberg\', AUTHORIZATION_TYPE none)')
  })
})

describe('lakehouse-engine plugin', () => {
  it('registers ctx.lakehouseEngine and the engine answers queries', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-plugin-'))
    const ctx = new Context()
    await ctx.plugin(EnginePlugin, {
      catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake'), dataPath: join(root, 'files') },
      maxRows: 50,
    })
    try {
      expect(ctx.lakehouseEngine.available()).toBe(true)
      const outcome = await ctx.lakehouseEngine.query('SELECT 41 + 1 AS answer')
      expect(outcome.rows).toEqual([[42]])
      expect(outcome.columns).toEqual([{ name: 'answer', sqlType: expect.any(String) }])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('closes the DuckDB instance with the context fiber', async () => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-lakehouse-engine-plugin-'))
    const ctx = new Context()
    await ctx.plugin(EnginePlugin, { catalog: { kind: 'ducklake', catalogPath: join(root, 'catalog.ducklake') } })
    // The context removes the service key on dispose, so hold the reference.
    const engine = ctx.lakehouseEngine
    await ctx.fiber.dispose()
    try {
      expect(engine.available()).toBe(false)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
