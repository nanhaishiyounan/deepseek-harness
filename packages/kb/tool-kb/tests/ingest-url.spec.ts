/**
 * The `kb_ingest_url` channel: fetch one page through the optional `ctx.web`
 * service, convert the HTML body to structured text, and store it under the
 * deployment's bound tenant with the URL as the citation identity. SSRF
 * posture: http(s) only, and every resolved address must be public unless the
 * composition explicitly opts into private networks.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { CallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import KbRuntime from '@deepseek-ai/dsh-kb'
import * as KbSqlite from '@deepseek-ai/dsh-kb-sqlite'
import LocalFileSystem from '@deepseek-ai/dsh-fs-local'
import WebRuntime from '@deepseek-ai/dsh-web'
import type { WebFetchProvider } from '@deepseek-ai/dsh-web'
import * as WebFetchHttp from '@deepseek-ai/dsh-web-fetch-http'
import * as ToolKb from '../src/index.ts'
import { isPrivateAddress, parseIngestUrlArgs } from '../src/url-policy.ts'

const signal = new AbortController().signal
const here = import.meta.dirname

const roots: string[] = []
const servers: Server[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => { resolve() }))))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

interface MountOptions {
  allowPrivateNetworks?: boolean
  fetchProvider?: WebFetchProvider
  realFetch?: boolean
  withWeb?: boolean
}

async function mount(options: MountOptions = {}): Promise<{
  ctx: Context
  execute: (name: string, args: unknown) => Promise<{ isError: boolean; value: unknown; text: string }>
}> {
  const root = await mkdtemp(join(tmpdir(), 'tool-kb-url-'))
  roots.push(root)
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(KbRuntime)
  await ctx.plugin(KbSqlite, { path: ':memory:' })
  await ctx.plugin(LocalFileSystem, { cwd: root })
  if (options.withWeb !== false) await ctx.plugin(WebRuntime)
  if (options.realFetch === true) await ctx.plugin(WebFetchHttp, {})
  if (options.fetchProvider !== undefined) ctx.web.registerFetchProvider(options.fetchProvider)
  await ctx.plugin(ToolKb, { tenant: 'demo-food-co', ...options.allowPrivateNetworks === undefined ? {} : { allowPrivateNetworks: options.allowPrivateNetworks } })
  let counter = 0
  const execute = async (name: string, args: unknown) => {
    const result = await ctx.tools.execute({ signal, callId: CallId(`call-${++counter}`), name, arguments: args })
    const text = result.content.find(block => block.type === 'text')
    return { isError: result.isError, value: result.value, text: text?.type === 'text' ? text.text : '' }
  }
  return { ctx, execute }
}

/** A local http server on 127.0.0.1 serving the HTML fixture. */
async function localPageServer(): Promise<{ url: string }> {
  const body = await readFile(join(here, 'fixtures/docs/page.html'), 'utf8')
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(body)
  })
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('no server address')
  return { url: `http://127.0.0.1:${address.port}/gb2760` }
}

function fakeFetchProvider(result: { statusCode?: number; kind?: 'html' | 'text'; content?: string; truncated?: boolean }): WebFetchProvider {
  return {
    id: 'fake-fetch',
    available: () => true,
    fetch: async () => ({
      url: 'http://example.test/page',
      statusCode: result.statusCode ?? 200,
      body: { kind: result.kind ?? 'html', content: result.content ?? '' },
      truncated: result.truncated ?? false,
    }),
  }
}

describe('isPrivateAddress', () => {
  it('classifies loopback, private, link-local, CGNAT, and unique-local ranges as private', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.16.0.9', '172.31.255.1', '192.168.1.4', '169.254.7.7', '100.64.0.1', '0.0.0.0', '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1']) {
      expect(isPrivateAddress(address), address).toBe(true)
    }
  })

  it('classifies public addresses as public', () => {
    for (const address of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isPrivateAddress(address), address).toBe(false)
    }
  })

  it('unwraps IPv4-mapped IPv6 addresses before classifying', () => {
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false)
  })
})

describe('parseIngestUrlArgs', () => {
  it('accepts an http URL and rejects a model-supplied tenant', () => {
    expect(parseIngestUrlArgs({ url: 'http://example.test/a' })).toMatchObject({ url: 'http://example.test/a' })
    expect(() => parseIngestUrlArgs({ url: 'http://example.test/a', tenant: 'x' })).toThrow(/tenant/u)
  })

  it('rejects blank URLs and non-http(s) schemes', () => {
    expect(() => parseIngestUrlArgs({ url: '   ' })).toThrow(/url/u)
    expect(() => parseIngestUrlArgs({ url: 'ftp://example.test/a' })).toThrow(/scheme/u)
    expect(() => parseIngestUrlArgs({ url: 'file:///etc/passwd' })).toThrow(/scheme/u)
  })

  it('rejects an over-long URL, an unparseable URL, embedded credentials, a bad doc_kind, and a bad collected_at', () => {
    expect(() => parseIngestUrlArgs({ url: `http://example.test/${'a'.repeat(2_100)}` })).toThrow(/length/u)
    expect(() => parseIngestUrlArgs({ url: 'http://' })).toThrow(/invalid url/u)
    expect(() => parseIngestUrlArgs({ url: 'http://user:pass@example.test/' })).toThrow(/credentials/u)
    expect(() => parseIngestUrlArgs({ url: 'http://example.test/', doc_kind: 'poem' })).toThrow(/doc_kind/u)
    expect(() => parseIngestUrlArgs({ url: 'http://example.test/', collected_at: 'soon' })).toThrow(/collected_at/u)
  })

  it('applies doc_kind, a non-blank title, and collected_at', () => {
    expect(parseIngestUrlArgs({ url: 'http://example.test/a', doc_kind: 'regulation', title: '标题', collected_at: '2026-08-30' })).toEqual({
      url: 'http://example.test/a',
      docKind: 'regulation',
      title: '标题',
      collectedAt: '2026-08-30',
    })
    expect(parseIngestUrlArgs({ url: 'http://example.test/a', title: '   ' }).title).toBeUndefined()
  })
})

describe('kb_ingest_url through the real seam', () => {
  it('fetches a local page, stores it under the bound tenant, and makes it searchable', async () => {
    const { url } = await localPageServer()
    const { execute } = await mount({ allowPrivateNetworks: true, realFetch: true })
    const result = await execute('kb_ingest_url', { url })
    expect(result.isError).toBe(false)
    const value = result.value as { url: string; tenant: string; chunks: number }
    expect(value.tenant).toBe('demo-food-co')
    expect(value.url).toBe(url)
    expect(value.chunks).toBeGreaterThan(0)
    const search = await execute('kb_search', { query: 'mask spoilage' })
    expect(search.isError).toBe(false)
    expect((search.value as { results: Array<{ source_path: string }> }).results[0]?.source_path).toBe(url)
  })

  it('re-ingests the same URL as a replacement', async () => {
    const provider = fakeFetchProvider({ content: '<h1>Version one</h1><p>first body text.</p>' })
    const { ctx, execute } = await mount({ fetchProvider: provider })
    await execute('kb_ingest_url', { url: 'http://example.test/page' })
    await execute('kb_ingest_url', { url: 'http://example.test/page' })
    const stats = await ctx.kb.stats('demo-food-co')
    expect(stats.documents).toBe(1)
  })

  it('stores a plain-text body directly', async () => {
    const provider = fakeFetchProvider({ kind: 'text', content: 'Plain text regulation excerpt about sorghum.' })
    const { execute } = await mount({ fetchProvider: provider })
    const result = await execute('kb_ingest_url', { url: 'http://example.test/notes.txt' })
    expect(result.isError).toBe(false)
    const search = await execute('kb_search', { query: 'sorghum' })
    expect((search.value as { results: unknown[] }).results.length).toBeGreaterThan(0)
  })

  it('carries title, collected_at, and the embed identity through the pipeline', async () => {
    const provider = fakeFetchProvider({ content: '<h1>Full-field page</h1><p>carries every optional field.</p>' })
    const { ctx, execute } = await mount({ fetchProvider: provider })
    ctx.kb.registerEmbedProvider({
      id: 'stub-embed', modelId: 'stub-model', dimensions: 2,
      available: () => true,
      embed: async (texts: readonly string[]) => texts.map(() => new Float32Array([0.25, 0.5])),
    })
    const result = await execute('kb_ingest_url', { url: 'http://example.test/full', title: '全字段', collected_at: '2026-08-30' })
    expect(result.isError).toBe(false)
    const value = result.value as { embed_model: string; chunks: number }
    expect(value.embed_model).toBe('stub-embed:stub-model')
    expect(value.chunks).toBeGreaterThan(0)
  })

  it('rejects a private-network URL unless the composition opts in', async () => {
    const { url } = await localPageServer()
    const { execute } = await mount({ allowPrivateNetworks: false })
    const result = await execute('kb_ingest_url', { url })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/private|internal/iu)
  })

  it('rejects a non-2xx response instead of storing an error page', async () => {
    const provider = fakeFetchProvider({ statusCode: 404, content: 'Not Found' })
    const { execute } = await mount({ fetchProvider: provider })
    const result = await execute('kb_ingest_url', { url: 'http://example.test/missing' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/404/u)
  })

  it('rejects a truncated body instead of storing a partial corpus', async () => {
    const provider = fakeFetchProvider({ content: '<p>partial</p>', truncated: true })
    const { execute } = await mount({ fetchProvider: provider })
    const result = await execute('kb_ingest_url', { url: 'http://example.test/page' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/truncated/iu)
  })

  it('fails with a structured error when no web service is composed', async () => {
    const { execute } = await mount({ withWeb: false })
    const result = await execute('kb_ingest_url', { url: 'http://example.test/page' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/web/iu)
  })

  it('fails with a structured error when no fetch provider is usable', async () => {
    const { execute } = await mount()
    const result = await execute('kb_ingest_url', { url: 'http://example.test/page' })
    expect(result.isError).toBe(true)
  })

  it('rejects a page whose extracted text is empty', async () => {
    const provider = fakeFetchProvider({ kind: 'text', content: '   ' })
    const { execute } = await mount({ fetchProvider: provider })
    const result = await execute('kb_ingest_url', { url: 'http://example.test/blank' })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/no extractable text/u)
  })
})

describe('ingest-url presentation and formatting', () => {
  it('names the fallback embed provider when a hybrid ingest reports no model', async () => {
    const { formatIngestUrlOutput } = await import('../src/ingest-url.ts')
    const out = formatIngestUrlOutput({ url: 'http://example.test/a', doc_id: 1, chunks: 1, embedded: true, tenant: 'demo-food-co' })
    expect(out).toContain('unknown embed provider')
  })
  it('wraps the presenters through the registry', async () => {
    const { ctx } = await mount()
    const tool = ctx.tools.get('kb_ingest_url')
    expect(tool?.presentCall?.({ url: 'http://example.test/a' })).toMatchObject({ card: 'generic', title: 'kb_ingest_url http://example.test/a' })
    expect(tool?.presentResult?.({ url: 'http://example.test/a' }, { content: [{ type: 'text', text: 'stored' }], isError: false })).toMatchObject({ card: 'generic' })
  })
  it('renders the stored summary and the pending/completed cards', async () => {
    const { formatIngestUrlOutput, presentIngestUrlCall, presentIngestUrlResult } = await import('../src/ingest-url.ts')
    const text = formatIngestUrlOutput({ url: 'http://example.test/a', doc_id: 1, chunks: 2, embedded: true, embed_model: 'minimax:embo-01', tenant: 'demo-food-co' })
    expect(text).toContain('http://example.test/a')
    expect(text).toContain('minimax:embo-01')
    expect(text).toContain('demo-food-co')
    expect(presentIngestUrlCall({ url: 'http://example.test/a' })).toMatchObject({ card: 'generic', title: 'kb_ingest_url http://example.test/a' })
    expect(presentIngestUrlResult({ url: 'http://example.test/a' }, { content: [{ type: 'text', text: 'stored' }], isError: false })).toMatchObject({ card: 'generic' })
    expect(presentIngestUrlResult({ url: 'http://example.test/a' }, { content: [], isError: true })).toBeUndefined()
    expect(presentIngestUrlResult({ url: 'http://example.test/a' }, { content: [], isError: false })).toMatchObject({ card: 'generic' })
  })
})
