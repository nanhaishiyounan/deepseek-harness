/**
 * Server-side tenant binding: the deployment's `tenant` config is the only
 * tenant the kb tools ever read. A model-supplied `tenant` argument is
 * rejected on every tool, another tenant's corpus stays invisible to search
 * and stats, and a composition without a bound tenant fails config validation
 * at load.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import * as ToolKb from '../src/index.ts'

const signal = new AbortController().signal

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** Mount the full stack bound to `bound-tenant`, with a raw executor that surfaces errors. */
async function mount(): Promise<{
  ctx: Context
  execute: (name: string, args: unknown) => Promise<{ isError: boolean; value: unknown; text: string }>
}> {
  const root = await mkdtemp(join(tmpdir(), 'tool-kb-tenant-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: ':memory:' })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  await ctx.plugin(ToolKb, { tenant: 'bound-tenant' })
  let counter = 0
  const execute = async (name: string, args: unknown) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '' }
  }
  return { ctx, execute }
}

describe('server-side tenant binding', () => {
  it('rejects a model-supplied tenant on kb_search even when it matches the binding', async () => {
    const { execute } = await mount()
    const result = await execute('kb_search', { query: '白糖', tenant: 'bound-tenant' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/tenant/u)
  })

  it('rejects a model-supplied tenant on kb_ingest', async () => {
    const { execute } = await mount()
    const result = await execute('kb_ingest', { path: 'a.md', tenant: 'other-co' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/tenant/u)
  })

  it('rejects a model-supplied tenant on kb_stats', async () => {
    const { execute } = await mount()
    const result = await execute('kb_stats', { tenant: 'other-co' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/tenant/u)
  })

  it('cannot see another tenant\'s corpus through kb_search', async () => {
    const { ctx, execute } = await mount()
    await ctx.kb.ingest({
      tenantId: 'other-co', sourcePath: 'secret.md', docKind: 'other',
      content: '隔离租户的独家配方含独特关键词藄茋。',
    })
    const result = await execute('kb_search', { query: '藄茋' })
    expect(result.isError).toBe(false)
    expect(result.text).toMatch(/no results/iu)
  })

  it('counts only the bound tenant in kb_stats', async () => {
    const { ctx, execute } = await mount()
    await ctx.kb.ingest({ tenantId: 'bound-tenant', sourcePath: 'mine.md', docKind: 'other', content: '本租户文档。' })
    await ctx.kb.ingest({ tenantId: 'other-co', sourcePath: 'theirs.md', docKind: 'other', content: '他租户文档。' })
    const result = await execute('kb_stats', {})
    expect(result.isError).toBe(false)
    expect((result.value as { tenant: string }).tenant).toBe('bound-tenant')
    expect((result.value as { documents: number }).documents).toBe(1)
  })

  it('ingests into the bound tenant without any tenant argument', async () => {
    const { ctx, execute } = await mount()
    const root = roots[roots.length - 1]!
    await writeFile(join(root, 'a.md'), '绑定租户的入库文档。', { encoding: 'utf8' })
    const result = await execute('kb_ingest', { path: 'a.md' })
    expect(result.isError).toBe(false)
    expect((result.value as { tenant: string }).tenant).toBe('bound-tenant')
    const stats = await ctx.kb.stats('bound-tenant')
    expect(stats.documents).toBe(1)
  })

  it('fails config validation at load when no tenant is bound', () => {
    expect(() => ToolKb.Config({} as unknown as ToolKb.Config)).toThrow(/tenant/u)
  })

  it('exposes no tenant parameter in the model-facing schemas', async () => {
    const { ctx } = await mount()
    for (const name of ['kb_search', 'kb_ingest', 'kb_stats']) {
      const tool = ctx.tools.get(name)
      const properties = (tool?.parameters as { properties?: Record<string, unknown> })?.properties ?? {}
      expect(properties.tenant, `${name} must not declare a tenant parameter`).toBeUndefined()
    }
  })
})
