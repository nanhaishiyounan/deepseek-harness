/**
 * The non-Error throw arms of the loader and scan catches: `yaml` parse,
 * `node:fs` readFileSync, and the corpus manifest directory scan rejecting
 * with a non-Error value still surface as KgBuildError messages (the
 * `String(error)` leg of each instanceof conditional). Module mocks inject
 * the hostile throws; everything else delegates to the real implementations.
 */

import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import KbGraphRuntime from '@deepseek-ai/dsh-kb-graph'
import * as KbGraphSqlite from '@deepseek-ai/dsh-kb-graph-sqlite'
import KgBuildRuntime from '../src/index.ts'

vi.mock('yaml', async (importOriginal) => {
  const actual = await importOriginal<typeof import('yaml')>()
  return {
    ...actual,
    parse: (text: string): unknown => {
      if (text === 'die: yaml') throw 'yaml died'
      return actual.parse(text)
    },
  }
})

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    readFileSync: (path: string, options: unknown): string => {
      if (path.includes('die-on-read')) throw 'fs died'
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- selects the overload union for tsc.
      return String(actual.readFileSync(path as never, options as never))
    },
  }
})

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    readdir: ((path: string, options?: unknown) => {
      // The hostile rejection IS the fixture: the scan catch must stringify non-Error throws.
      // oxlint-disable-next-line typescript/prefer-promise-reject-errors
      if (path.endsWith('boom-dir')) return Promise.reject('scan died')
      // oxlint-disable-next-line typescript/no-unnecessary-type-assertion -- selects the readdir overload for tsc.
      return actual.readdir(path as never, options as never) as Promise<unknown>
    }) as typeof actual.readdir,
  }
})

class FakeLlm extends Service {
  constructor(ctx: Context) { super(ctx, 'llm') }
  async *stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    yield { type: 'text-delta', index: 0, text: '{}' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

describe('loader and scan catches stringify non-Error throws', () => {
  it('reports a non-Error yaml parse failure through both parsers', async () => {
    const { parseMappings } = await import('../src/mappings.ts')
    const { parseCorpusManifest } = await import('../src/corpus-manifest.ts')
    expect(() => parseMappings('die: yaml', 'm.yml')).toThrow('YAML parse failed: yaml died')
    expect(() => parseCorpusManifest('die: yaml', 'c.yml')).toThrow('YAML parse failed: yaml died')
  })

  it('reports a non-Error manifest and mappings read failure from disk', async () => {
    const { loadMappingsFile } = await import('../src/mappings.ts')
    const { loadCorpusManifest } = await import('../src/corpus-manifest.ts')
    expect(() => loadMappingsFile('/tmp/die-on-read-mappings.yml')).toThrow('fs died')
    expect(() => loadCorpusManifest('/tmp/die-on-read-corpus.yml')).toThrow('fs died')
  })

  it('reports a non-Error manifest directory scan failure through the corpus leg', async () => {
    const scratch = await mkdtemp(join(tmpdir(), 'kg-build-scan-'))
    const manifestPath = join(scratch, 'corpus-manifest.yml')
    await writeFile(manifestPath, 'version: 1\ndirs:\n  - dir: boom-dir\n    kind: document\n', 'utf8')
    const ctx = new Context()
    try {
      await ctx.plugin(KbGraphRuntime)
      await ctx.plugin(KbGraphSqlite, { path: ':memory:' })
      new FakeLlm(ctx)
      await ctx.plugin(KgBuildRuntime, {
        tenant: 't',
        corpus: { root: scratch, manifestFile: manifestPath },
        lakehouse: false,
        connector: false,
        foodon: false,
        crossSourceAlign: { enabled: false },
      })
      await expect(ctx.kgBuild.run()).rejects.toThrow('scan died')
    } finally {
      await ctx.fiber.dispose()
    }
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })
})
