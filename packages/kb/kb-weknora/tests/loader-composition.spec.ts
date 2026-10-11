import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import * as KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbWeknora from '@deepseek-ai/dsh-kb-weknora'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

async function loadYaml(lines: readonly string[]): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'dsh-kb-weknora-loader-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [...lines, ''].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@deepseek-ai/dsh-kb', KbRuntime],
    ['@deepseek-ai/dsh-kb-weknora', KbWeknora],
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

describe('real Loader composition', () => {
  it('registers the weknora store provider alongside the kb seam', async () => {
    const loaded = await loadYaml([
      "- name: '@deepseek-ai/dsh-kb'",
      '  config:',
      "    storeProvider: 'weknora'",
      "- name: '@deepseek-ai/dsh-kb-weknora'",
      '  config:',
      "    baseUrl: 'http://localhost:18099'",
      "    apiKey: 'test-key'",
    ])
    const unloaded = [...loaded.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])
    // The registry is private; resolution through the seam proves the store
    // is registered and selectable.
    await expect(loaded.kb.stats('demo-food-co')).rejects.toMatchObject({ code: 'KB_WEKNORA_UNAVAILABLE' })
  })

  it('fails the load when allowFallback has no fallbackPath', async () => {
    const failure = await loadYaml([
      "- name: '@deepseek-ai/dsh-kb'",
      "- name: '@deepseek-ai/dsh-kb-weknora'",
      '  config:',
      "    apiKey: 'test-key'",
      '    allowFallback: true',
    ]).then(() => undefined, (cause: unknown) => cause as Error)
    expect(failure?.message).toContain('allowFallback is set but fallbackPath is missing')
  })

  it('opens the sqlite fallback when allowFallback carries a path', async () => {
    const fallbackPath = root === undefined ? join(tmpdir(), `dsh-kb-weknora-fb-${Date.now()}.sqlite`) : join(root, 'fb.sqlite')
    const loaded = await loadYaml([
      "- name: '@deepseek-ai/dsh-kb'",
      '  config:',
      "    storeProvider: 'weknora'",
      "- name: '@deepseek-ai/dsh-kb-weknora'",
      '  config:',
      "    baseUrl: 'http://localhost:18099'",
      "    apiKey: 'test-key'",
      '    allowFallback: true',
      `    fallbackPath: '${fallbackPath.replace(/'/g, "''")}'`,
    ])
    // With the sidecar down, the fallback answers stats instead of throwing.
    await expect(loaded.kb.stats('demo-food-co')).resolves.toMatchObject({ documents: 0 })
  })
  it('loads a fully-specified row and serves sqlite fallback stats', async () => {
    const fallbackPath = join(tmpdir(), `dsh-kb-weknora-min-${Date.now()}.sqlite`)
    const loaded = await loadYaml([
      "- name: '@deepseek-ai/dsh-kb'",
      '  config:',
      "    storeProvider: 'weknora'",
      "- name: '@deepseek-ai/dsh-kb-weknora'",
      '  config:',
      "    baseUrl: 'http://localhost:18099'",
      "    apiKey: 'k'",
      '    allowFallback: true',
      `    fallbackPath: '${fallbackPath.replace(/'/g, "''")}'`,
      '    requestTimeoutMs: 5000',
      '    topK: 16',
    ])
    await expect(loaded.kb.stats('demo-food-co')).resolves.toMatchObject({ documents: 0 })
  })
})
