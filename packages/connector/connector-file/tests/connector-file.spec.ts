/**
 * The file-set provider's behavior: directory scanning with the routed
 * extension whitelist, query and kind filtering, per-file fetches with
 * traversal-proof ids and size caps, root provisioning at plugin load
 * (missing roots are created, occupied paths still fail loud), and a
 * Loader-booted composition running discover → fetch through the real plugin
 * rows.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import ConnectorRuntime from '@deepseek-ai/dsh-connector'
import { ConnectorError } from '@deepseek-ai/dsh-connector'
import { FileConnectorProvider } from '../src/provider.ts'
import * as FilePlugin from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** One temp directory holding the file set. */
async function fileRoot(): Promise<string> {
  root = await mkdtemp(join(tmpdir(), 'dsh-connector-file-'))
  await writeFile(join(root, 'customs-export.csv'), 'region,amount_t\n中亚,120.5\n东南亚,310\n')
  await writeFile(join(root, 'visit-note.md'), '# 走访纪要\n\n东南亚订单物流延迟。')
  await writeFile(join(root, 'ignored.bin'), 'not routed')
  await mkdir(join(root, 'nested-dir'))
  return root
}

describe('FileConnectorProvider discover', () => {
  it('lists only router-admitted files, skipping directories and other extensions', async () => {
    const provider = new FileConnectorProvider(await fileRoot(), 10 * 1024 * 1024)
    const found = await provider.discover({})
    expect(found.map(summary => summary.id).sort()).toEqual(['customs-export.csv', 'visit-note.md'])
    expect(found.every(summary => summary.kind === 'file' && summary.manifest.providerId === 'connector-file')).toBe(true)
  })

  it('matches the query against file names case-insensitively and honors kind restrictions', async () => {
    const provider = new FileConnectorProvider(await fileRoot(), 10 * 1024 * 1024)
    expect((await provider.discover({ query: 'VISIT' })).map(summary => summary.id)).toEqual(['visit-note.md'])
    expect(await provider.discover({ kinds: ['tabular'] })).toEqual([])
    expect((await provider.discover({ kinds: ['file'] })).map(summary => summary.id).sort()).toEqual(['customs-export.csv', 'visit-note.md'])
  })

  it('returns an empty list when the root directory disappears after load', async () => {
    const provider = new FileConnectorProvider(await fileRoot(), 10 * 1024 * 1024)
    await rm(root as string, { recursive: true, force: true })
    expect(await provider.discover({})).toEqual([])
  })
})

describe('FileConnectorProvider fetch', () => {
  it('reads one file as a file-kind dataset', async () => {
    const provider = new FileConnectorProvider(await fileRoot(), 10 * 1024 * 1024)
    const dataset = await provider.fetch({ providerId: 'connector-file', datasetId: 'customs-export.csv' })
    expect(dataset.kind).toBe('file')
    if (dataset.kind !== 'file') throw new Error('unreachable')
    expect(new TextDecoder().decode(dataset.file.bytes)).toContain('中亚,120.5')
  })

  it('refuses traversal-shaped ids, missing files, and oversized files with distinct codes', async () => {
    const provider = new FileConnectorProvider(await fileRoot(), 10 * 1024 * 1024)
    const codes: string[] = []
    for (const datasetId of ['../escape.csv', 'missing.csv', 'nested-dir']) {
      try {
        await provider.fetch({ providerId: 'connector-file', datasetId })
      } catch (error) {
        expect(error).toBeInstanceOf(ConnectorError)
        codes.push((error as ConnectorError).code)
      }
    }
    expect(codes).toEqual(['CONNECTOR_DATASET_MISSING', 'CONNECTOR_DATASET_MISSING', 'CONNECTOR_DATASET_MISSING'])

    const capped = new FileConnectorProvider(root as string, 8)
    try {
      await capped.fetch({ providerId: 'connector-file', datasetId: 'visit-note.md' })
      throw new Error('expected a size refusal')
    } catch (error) {
      expect((error as ConnectorError).code).toBe('CONNECTOR_FILE_TOO_LARGE')
    }
  })
})

describe('connector-file plugin', () => {
  it('creates a missing root at composition load and serves an empty discovery', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-connector-file-'))
    const missing = join(root, 'nested/connector-files')
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(FilePlugin, { root: missing })
    expect(ctx.connector.providerIds()).toEqual(['connector-file'])
    expect((await stat(missing)).isDirectory()).toBe(true)
    expect(await ctx.connector.discover({})).toEqual([])
    await ctx.fiber.dispose()
  })

  it('fails composition load when a regular file occupies the root path', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-connector-file-'))
    const blocker = join(root, 'blocker')
    await writeFile(blocker, 'not a directory')
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await expect(ctx.plugin(FilePlugin, { root: join(blocker, 'connector-files') })).rejects.toThrow(/ENOTDIR/u)
    expect(ctx.connector.providerIds()).toEqual([])
    await ctx.fiber.dispose()
  })

  it('applies the default fetch cap when the config carries only the root', async () => {
    await fileRoot()
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(FilePlugin, { root: root as string })
    const dataset = await ctx.connector.fetch({ providerId: 'connector-file', datasetId: 'visit-note.md' })
    expect(dataset.kind).toBe('file')
    await ctx.fiber.dispose()
  })

  it('honors an explicit maxFileBytes cap at plugin apply', async () => {
    await fileRoot()
    const ctx = new Context()
    await ctx.plugin(ConnectorRuntime)
    await ctx.plugin(FilePlugin, { root: root as string, maxFileBytes: 8 })
    await expect(ctx.connector.fetch({ providerId: 'connector-file', datasetId: 'visit-note.md' })).rejects.toMatchObject({ code: 'CONNECTOR_FILE_TOO_LARGE' })
    await ctx.fiber.dispose()
  })

  it('boots through the Loader and serves discover and fetch through the seam', async () => {
    const files = await fileRoot()
    const configPath = join(root as string, 'cordis.yml')
    await writeFile(configPath, [
      "- name: '@deepseek-ai/dsh-connector'",
      "- name: '@deepseek-ai/dsh-connector-file'",
      '  config:',
      `    root: '${files.replaceAll(String.fromCharCode(39), String.fromCharCode(39, 39))}'`,
      '',
    ].join('\n'))
    context = new Context()
    context.baseUrl = pathToFileURL(root as string).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-connector', ConnectorRuntime],
      ['@deepseek-ai/dsh-connector-file', FilePlugin],
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

    expect(context.connector.providerIds()).toEqual(['connector-file'])
    const found = await context.connector.discover({ query: 'customs' })
    expect(found.map(summary => summary.id)).toEqual(['customs-export.csv'])
    const dataset = await context.connector.fetch({ providerId: 'connector-file', datasetId: 'customs-export.csv' })
    expect(dataset.kind).toBe('file')
  })
})
