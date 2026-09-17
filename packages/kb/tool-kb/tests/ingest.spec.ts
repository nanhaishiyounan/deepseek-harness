import { afterEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import type { ToolResult } from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import {
  formatIngestOutput,
  INGEST_EXTENSIONS,
  parseIngestArgs,
  presentIngestCall,
  presentIngestResult,
} from '../src/ingest.ts'
import { applyKbIngestTool } from '../src/ingest.ts'

const signal = new AbortController().signal
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

/** Mount tools + system prompt + kb seam + sqlite store + a tmpdir local fs. */
async function mount(): Promise<{
  ctx: Context
  root: string
  call: (name: string, args: unknown) => Promise<Record<string, unknown>>
}> {
  const root = await mkdtemp(join(tmpdir(), 'tool-kb-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: ':memory:' })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  applyKbIngestTool(ctx, 'demo-food-co', 300_000)
  let counter = 0
  const call = async (name: string, args: unknown) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    if (result.isError) throw new Error(result.content[0]?.type === 'text' ? result.content[0].text : 'tool error')
    return result.value as Record<string, unknown>
  }
  return { ctx, root, call }
}

describe('parseIngestArgs', () => {
  it('accepts a bare path and applies the bound tenant and default doc kind', () => {
    expect(parseIngestArgs({ path: 'notes/visit.md' }, 'demo-food-co')).toEqual({
      path: 'notes/visit.md',
      tenant: 'demo-food-co',
      docKind: 'other',
      title: undefined,
      collectedAt: undefined,
    })
  })

  it('rejects a model-supplied tenant argument', () => {
    expect(() => parseIngestArgs({ path: 'a.md', tenant: 'demo-food-co' }, 'demo-food-co')).toThrow(/tenant/u)
  })

  it('rejects a blank path', () => {
    expect(() => parseIngestArgs({ path: '  ' }, 't')).toThrow(/path/u)
  })

  it('rejects a disallowed extension', () => {
    expect(() => parseIngestArgs({ path: 'doc.html' }, 't')).toThrow(/\.md|\.txt|\.pdf|\.docx/u)
    expect(INGEST_EXTENSIONS).toEqual(['.md', '.txt', '.pdf', '.docx'])
  })

  it('rejects a blank tenant binding', () => {
    expect(() => parseIngestArgs({ path: 'a.md' }, '  ')).toThrow(/tenant/u)
  })

  it('rejects an unknown doc_kind', () => {
    expect(() => parseIngestArgs({ path: 'a.md', doc_kind: 'poem' }, 't')).toThrow(/doc_kind/u)
  })

  it('rejects a malformed collected_at', () => {
    expect(() => parseIngestArgs({ path: 'a.md', collected_at: 'yesterday' }, 't')).toThrow(/collected_at/u)
  })

  it('accepts an ISO-8601 collected_at', () => {
    expect(parseIngestArgs({ path: 'a.md', collected_at: '2026-08-27' }, 't').collectedAt).toBe('2026-08-27')
    expect(parseIngestArgs({ path: 'a.md', collected_at: '2026-08-27T10:30:00+08:00' }, 't').collectedAt).toBe('2026-08-27T10:30:00+08:00')
  })
})

describe('formatIngestOutput and presentation', () => {
  it('renders the stored summary', () => {
    const out = formatIngestOutput({
      doc_id: 1, chunks: 4, embedded: false, path: 'notes/visit.md', tenant: 'demo-food-co',
    })
    expect(out).toContain('notes/visit.md')
    expect(out).toContain('4')
    expect(out).toContain('demo-food-co')
  })

  it('mentions the embed model when embeddings landed', () => {
    const out = formatIngestOutput({
      doc_id: 1, chunks: 4, embedded: true, embed_model: 'minimax:embo-01', path: 'a.md', tenant: 't',
    })
    expect(out).toContain('minimax:embo-01')
    const unnamed = formatIngestOutput({
      doc_id: 2, chunks: 1, embedded: true, path: 'b.md', tenant: 't',
    })
    expect(unnamed).toContain('unknown embed provider')
  })

  it('presents the pending call as a generic card titled by the path', () => {
    const view = presentIngestCall({ path: 'notes/visit.md' })
    expect(view.card).toBe('generic')
    expect(view.title).toContain('notes/visit.md')
  })

  it('presents the completed call from the result content', () => {
    const result: ToolResult = { content: [{ type: 'text', text: 'stored' }], isError: false }
    const view = presentIngestResult({ path: 'a.md' }, result)
    expect(view).toBeDefined()
    expect(view?.card).toBe('generic')
  })
})

describe('kb_ingest through the real seam', () => {
  it('reads a workspace file and stores it under the default tenant', async () => {
    const { ctx, root, call } = await mount()
    await mkdir(join(root, 'notes'), { recursive: true })
    await writeFile(join(root, 'notes/visit.md'), '# 走访\n\n白糖价格上行。', { encoding: 'utf8' })
    const value = await call('kb_ingest', { path: 'notes/visit.md', doc_kind: 'meeting', title: '走访纪要' })
    expect(value.doc_id).toBeGreaterThan(0)
    expect(value.chunks).toBeGreaterThan(0)
    expect(value.embedded).toBe(false)
    expect(value.path).toBe('notes/visit.md')
    expect(value.tenant).toBe('demo-food-co')
    const stats = await ctx.kb.stats('demo-food-co')
    expect(stats.documents).toBe(1)
    expect(stats.embedAvailable).toBe(false)
  })

  it('re-ingests the same path as a replacement, not a duplicate', async () => {
    const { ctx, root, call } = await mount()
    await writeFile(join(root, 'a.md'), '第一版内容', { encoding: 'utf8' })
    await call('kb_ingest', { path: 'a.md' })
    await writeFile(join(root, 'a.md'), '第二版内容，更长一些以便重新切片。', { encoding: 'utf8' })
    await call('kb_ingest', { path: 'a.md' })
    const stats = await ctx.kb.stats('demo-food-co')
    expect(stats.documents).toBe(1)
  })

  it('carries a collection date through the pipeline under the bound tenant', async () => {
    const { ctx, root, call } = await mount()
    await writeFile(join(root, 'a.md'), '带采集日期的文档', { encoding: 'utf8' })
    const value = await call('kb_ingest', { path: 'a.md', collected_at: '2026-08-20' })
    expect(value.tenant).toBe('demo-food-co')
    const stats = await ctx.kb.stats('demo-food-co')
    expect(stats.documents).toBe(1)
  })

  it('reports the embed model when a usable embed provider participated', async () => {
    const { ctx, root, call } = await mount()
    ctx.kb.registerEmbedProvider({
      id: 'stub-embed',
      modelId: 'stub-model',
      dimensions: 2,
      available: () => true,
      embed: async (texts: readonly string[]) => texts.map(() => new Float32Array([0.25, 0.5])),
    })
    await writeFile(join(root, 'a.md'), '需要向量化的文档内容', { encoding: 'utf8' })
    const value = await call('kb_ingest', { path: 'a.md' })
    expect(value.embedded).toBe(true)
    expect(value.embed_model).toBe('stub-embed:stub-model')
  })

  it('resolves a relative path against the per-session cwd, not the backend default', async () => {
    const { ctx, root } = await mount()
    // The backend default (config.cwd) is `root`; the session workspace is a
    // different directory holding the document — only session-cwd resolution
    // (the same basis read/write/edit use) finds it.
    const sessionDir = await mkdtemp(join(tmpdir(), 'tool-kb-session-cwd-'))
    roots.push(sessionDir)
    await writeFile(join(sessionDir, 'export-note.md'), '# 出海风险\n\n莫斯科主仓断电，启用阿拉木图备仓。', { encoding: 'utf8' })
    const result = await ctx.tools.execute({
      signal,
      callId: CallId('c-session-cwd'),
      name: 'kb_ingest',
      arguments: { path: 'export-note.md' },
      agent: { session: { header: { cwd: sessionDir } } } as never,
    })
    expect(result.isError).toBe(false)
    const hits = await ctx.kb.search({ query: '莫斯科主仓', tenantId: 'demo-food-co' })
    expect(hits.results[0]?.sourcePath).toBe('export-note.md')
    // The read basis was the session dir: the backend-default dir never held the file.
    const atDefault = await (await import('node:fs/promises')).readFile(join(root, 'export-note.md'), 'utf8').catch(() => 'missing')
    expect(atDefault).toBe('missing')
  })

  it('ingests a PDF fixture through the text extractor', async () => {
    const { ctx, call } = await mount()
    const { copyFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    await copyFile(fileURLToPath(new URL('./fixtures/docs/sample.pdf', import.meta.url)), join(roots[roots.length - 1]!, 'visit.pdf'))
    const value = await call('kb_ingest', { path: 'visit.pdf', doc_kind: 'meeting' })
    expect(value.chunks).toBeGreaterThan(0)
    const hits = await ctx.kb.search({ query: 'White sugar procurement', tenantId: 'demo-food-co' })
    expect(hits.results[0]?.sourcePath).toBe('visit.pdf')
  })

  it('ingests a docx fixture through the text extractor', async () => {
    const { ctx, call } = await mount()
    const { copyFile } = await import('node:fs/promises')
    const { fileURLToPath } = await import('node:url')
    await copyFile(fileURLToPath(new URL('./fixtures/docs/sample.docx', import.meta.url)), join(roots[roots.length - 1]!, 'audit.docx'))
    const value = await call('kb_ingest', { path: 'audit.docx', doc_kind: 'report' })
    expect(value.chunks).toBeGreaterThan(0)
    const hits = await ctx.kb.search({ query: 'Sorghum protein', tenantId: 'demo-food-co' })
    expect(hits.results[0]?.sourcePath).toBe('audit.docx')
  })

  it('fails with a structured error when the file is missing', async () => {
    const { call } = await mount()
    await expect(call('kb_ingest', { path: 'no-such.md' })).rejects.toThrow()
  })

  it('fails with a structured error when no store is registered', async () => {
    const root = await mkdtemp(join(tmpdir(), 'tool-kb-nostore-'))
    roots.push(root)
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(KbRuntime)
    await ctx.plugin(LocalFileSystem, { cwd: root })
    applyKbIngestTool(ctx, 't', 300_000)
    await writeFile(join(root, 'a.md'), 'x', { encoding: 'utf8' })
    const result = await ctx.tools.execute({ signal, callId: CallId('c1'), name: 'kb_ingest', arguments: { path: 'a.md' } })
    expect(result.isError).toBe(true)
  })
})

describe('parseIngestArgs extension arms', () => {
  it('accepts an uppercase extension', () => {
    expect(parseIngestArgs({ path: 'notes/VISIT.MD' }, 'demo-food-co')).toMatchObject({
      path: 'notes/VISIT.MD',
      tenant: 'demo-food-co',
    })
  })
})
