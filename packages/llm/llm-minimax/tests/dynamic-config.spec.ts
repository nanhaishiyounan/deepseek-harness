/**
 * Real-composition guard for the dynamic-configuration chain: LlmRuntime,
 * settings-file, and llm-minimax boot together, and a settings section that
 * fails a beyond-schema bound keeps the last good facts serving the very next
 * request instead of failing it.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import FileSettingsProvider from '@deepseek-ai/dsh-settings-file'
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local'
import * as LlmMiniMax from '@deepseek-ai/dsh-llm-minimax'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, sse, textEvents } from './mock-server.ts'

let root: string | undefined
let ctx: Context | undefined

afterEach(async () => {
  await ctx?.fiber.dispose()
  ctx = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await closeMockServers()
  vi.unstubAllEnvs()
})

describe('llm-minimax dynamic settings composition', () => {
  it('keeps the last good configuration after an invalid settings snapshot', async () => {
    root = await mkdtemp(join(tmpdir(), 'llm-minimax-settings-'))
    vi.stubEnv('DSH_HOME', root)
    const settingsPath = join(root, 'settings.yaml')
    await writeFile(settingsPath, '# personal settings\n')
    const server = await mockServer([{ kind: 'sse', events: textEvents.map(sse) }, { kind: 'sse', events: textEvents.map(sse) }])

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: settings',
      "  name: '@deepseek-ai/dsh-settings-file'",
      '  config:',
      `    path: ${JSON.stringify(settingsPath)}`,
      '    debounceMs: 10',
      '- id: llm',
      "  name: '@deepseek-ai/dsh-llm'",
      '- id: llm-minimax',
      "  name: '@deepseek-ai/dsh-llm-minimax'",
      '  config:',
      `    baseURL: ${JSON.stringify(server.url)}`,
      '',
    ].join('\n'))

    const context = new Context()
    ctx = context
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['@deepseek-ai/dsh-llm-minimax', LlmMiniMax],
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

    vi.stubEnv('MINIMAX_API_KEY', 'test-key')
    const first = await assemble(context, { model: 'MiniMax-M3', messages: [] })
    expect(first.finish.kind).toBe('stop')

    // An invalid snapshot (beyond-schema bound) must not take the route down.
    await writeFile(settingsPath, 'llm-minimax:\n  streamIdleTimeoutMs: 99999999999999999999\n')
    await new Promise(resolve => setTimeout(resolve, 120))
    const second = await assemble(context, { model: 'MiniMax-M3', messages: [] })
    expect(second.finish.kind).toBe('stop')
  }, 30_000)

  it('resolves the key through the credentials service and refreshes registration facts on a retryPolicy flip', async () => {
    root = await mkdtemp(join(tmpdir(), 'llm-minimax-credentials-'))
    vi.stubEnv('DSH_HOME', root)
    const settingsPath = join(root, 'settings.yaml')
    await writeFile(settingsPath, '# personal settings\n')
    const server = await mockServer([
      { kind: 'sse', events: textEvents.map(sse) },
      { kind: 'sse', events: textEvents.map(sse) },
      { kind: 'sse', events: textEvents.map(sse) },
    ])

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: settings',
      "  name: '@deepseek-ai/dsh-settings-file'",
      '  config:',
      `    path: ${JSON.stringify(settingsPath)}`,
      '    debounceMs: 10',
      '- id: credentials',
      "  name: '@deepseek-ai/dsh-credentials-local'",
      '- id: llm',
      "  name: '@deepseek-ai/dsh-llm'",
      '- id: llm-minimax',
      "  name: '@deepseek-ai/dsh-llm-minimax'",
      '  config:',
      `    baseURL: ${JSON.stringify(server.url)}`,
      '',
    ].join('\n'))

    const context = new Context()
    ctx = context
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-settings-file', FileSettingsProvider],
      ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
      ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['@deepseek-ai/dsh-llm-minimax', LlmMiniMax],
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

    // The credentials service resolves the reference through its environment
    // layer, so the stream authenticates without the ambient fallback.
    vi.stubEnv('MINIMAX_API_KEY', 'test-key')
    const first = await assemble(context, { model: 'MiniMax-M3', messages: [] })
    expect(first.finish.kind).toBe('stop')

    // A retryPolicy flip swaps the registration's captured facts in place.
    await writeFile(settingsPath, 'llm-minimax:\n  retryPolicy:\n    mode: always\n')
    await new Promise(resolve => setTimeout(resolve, 120))
    const second = await assemble(context, { model: 'MiniMax-M3', messages: [] })
    expect(second.finish.kind).toBe('stop')
  }, 30_000)

  it('fails loud with MISSING_CREDENTIAL when the credentials service holds no key either', async () => {
    root = await mkdtemp(join(tmpdir(), 'llm-minimax-nokey-'))
    vi.stubEnv('DSH_HOME', root)
    const server = await mockServer([])

    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: credentials',
      "  name: '@deepseek-ai/dsh-credentials-local'",
      '- id: llm',
      "  name: '@deepseek-ai/dsh-llm'",
      '- id: llm-minimax',
      "  name: '@deepseek-ai/dsh-llm-minimax'",
      '  config:',
      `    baseURL: ${JSON.stringify(server.url)}`,
      '',
    ].join('\n'))

    const context = new Context()
    ctx = context
    context.baseUrl = pathToFileURL(root).href + '/'
    await context.plugin(Loader)
    context.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['@deepseek-ai/dsh-credentials-local', LocalCredentialProvider],
      ['@deepseek-ai/dsh-llm', LlmRuntime],
      ['@deepseek-ai/dsh-llm-minimax', LlmMiniMax],
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

    // Pin the reference absent even when the host exports a real key. The
    // stream service surfaces the failure as an error finish, not a rejection.
    vi.stubEnv('MINIMAX_API_KEY', '')
    const result = await assemble(context, { model: 'MiniMax-M3', messages: [] })
    expect(result.finish.kind).toBe('error')
    if (result.finish.kind === 'error') expect(result.finish.failure.code).toBe('MISSING_CREDENTIAL')
  }, 30_000)
})
