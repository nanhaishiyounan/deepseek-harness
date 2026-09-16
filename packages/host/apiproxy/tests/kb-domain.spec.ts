/**
 * The kb workbench domain's deployment-side gates: an unbound tenant refuses
 * every method loudly, and the write methods stay refused until the
 * deployment opts in through `kbWriteEnabled`. The upload channel's own
 * matrix — file-name sanitizing, byte cap, extension and encoding refusals,
 * and the uploads-directory landing — runs over the same gates.
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
import { createApiProxy } from '../src/api-proxy.ts'
import { kbUploadRequestSchema } from '../src/api/kb.schema.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

/** A kb seam stub recording the tenant each call lands on. */
function kbStub(options: { ingestFailure?: Error } = {}) {
  const calls: string[] = []
  /** The full ingest requests the seam saw (the upload channel's source paths). */
  const ingestArgs: { tenantId: string; sourcePath: string; content: string }[] = []
  const kb = {
    stats: vi.fn(async (tenantId: string) => {
      calls.push(`stats:${tenantId}`)
      return { documents: 0, chunks: 0, embeddedChunks: 0, embedAvailable: false }
    }),
    usage: vi.fn(async (tenantId: string) => {
      calls.push(`usage:${tenantId}`)
      return { searches: 0, ingestedDocuments: 0, ingestedChunks: 0, embedTexts: 0, embedTokens: 0 }
    }),
    search: vi.fn(async (tenantId: string) => {
      calls.push(`search:${tenantId}`)
      return { mode: 'text', results: [] }
    }),
    ingest: vi.fn(async (request: { tenantId: string; sourcePath: string; content: string }) => {
      calls.push(`ingest:${request.tenantId}`)
      ingestArgs.push(request)
      if (options.ingestFailure !== undefined) throw options.ingestFailure
      return { docId: 1, chunks: 1, embedded: false }
    }),
  }
  return { kb, calls, ingestArgs }
}

async function harness(defaults: {
  kbTenant?: string
  kbWriteEnabled?: boolean
  ingestFailure?: Error
  cwd?: string
  webFetch?: (request: { url: string; pinnedAddresses?: readonly string[] }) => Promise<{
    statusCode: number
    body: { kind: 'html' | 'text'; content: string }
    truncated: boolean
  }>
}) {
  const stub = kbStub(
    defaults.ingestFailure === undefined ? {} : { ingestFailure: defaults.ingestFailure },
  )
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ViewActionService)
  await ctx.plugin(AgentRegistry)
  ctx.provide('kb', stub.kb as never)
  ctx.provide('fs', { resolve: async (path: string) => path, readText: async () => '# 走访纪要' } as never)
  if (defaults.webFetch !== undefined) {
    const fetch = defaults.webFetch
    ctx.provide('web', { fetch: async (request: { url: string; pinnedAddresses?: readonly string[] }) => ({
      url: request.url,
      ...await fetch(request),
    }) } as never)
  }
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd: defaults.cwd ?? '/tmp',
    ...defaults.kbTenant === undefined ? {} : { kbTenant: defaults.kbTenant },
    ...defaults.kbWriteEnabled === undefined ? {} : { kbWriteEnabled: defaults.kbWriteEnabled },
  })
  return { api, calls: stub.calls, ingestArgs: stub.ingestArgs, ctx }
}

/** Temp roots created by the upload cases; removed after each test. */
const uploadRoots: string[] = []

afterEach(() => {
  while (uploadRoots.length > 0) rmSync(uploadRoots.pop()!, { recursive: true, force: true })
})

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(rpcId: string, payload: P): RpcRequest<P> {
  return { rpcId: rpcId as never, payload }
}

describe('kb workbench deployment gates', () => {
  it('refuses reads loudly when no tenant is bound and writes when writes are not opted in', async () => {
    const { api, ctx } = await harness({})
    const stats = await api.kb.stats(request('r', {}))
    expect(stats.result).toEqual({ ok: false, error: { code: 'kb-tenant-unbound', message: "the api-gateway config kbTenant is not set; bind the deployment's kb tenant explicitly", details: {} } })
    const search = await api.kb.search(request('r', { query: '酱油' }))
    expect(search.result.ok).toBe(false)
    const ingest = await api.kb.ingest(request('r', { path: 'workspace/data/a.md' }))
    expect(ingest.result).toEqual({ ok: false, error: { code: 'kb-write-disabled', message: 'the kb workbench is read-only; set the api-gateway config kbWriteEnabled: true to allow ingest', details: {} } })
    const upload = await api.kb.upload(request('r', { filename: 'a.md', data: 'IyB4' }))
    expect(upload.result).toEqual({ ok: false, error: { code: 'kb-write-disabled', message: 'the kb workbench is read-only; set the api-gateway config kbWriteEnabled: true to allow ingest', details: {} } })
    await ctx.fiber.dispose()
  })

  it('answers reads on the bound tenant and writes only after the opt-in', async () => {
    const { api, calls, ctx } = await harness({ kbTenant: 'demo-food-co' })
    const refused = await api.kb.ingest(request('r', { path: 'workspace/data/a.md' }))
    expect(refused.result).toEqual({ ok: false, error: { code: 'kb-write-disabled', message: 'the kb workbench is read-only; set the api-gateway config kbWriteEnabled: true to allow ingest', details: {} } })
    const urlRefused = await api.kb.ingestUrl(request('r', { url: 'https://example.com/a' }))
    expect(urlRefused.result.ok).toBe(false)
    // Reads answer on the bound tenant while writes stay refused.
    const stats = await api.kb.stats(request('r', {}))
    expect(stats.result.ok).toBe(true)
    expect(calls).toEqual(['stats:demo-food-co', 'usage:demo-food-co'])
    await ctx.fiber.dispose()

    const writable = await harness({ kbTenant: 'demo-food-co', kbWriteEnabled: true })
    const ingested = await writable.api.kb.ingest(request('r', { path: 'workspace/data/a.md', doc_kind: 'regulation' }))
    expect(ingested.result.ok).toBe(true)
    expect(writable.calls.at(-1)).toBe('ingest:demo-food-co')
    await writable.ctx.fiber.dispose()
  })

  it('shapes a seam ingest refusal as the kb-ingest-failed wire error', async () => {
    const { api, ctx } = await harness({
      kbTenant: 'demo-food-co',
      kbWriteEnabled: true,
      ingestFailure: new Error('embed provider "minimax:embo-01" failed while embedding an ingest'),
    })
    const failed = await api.kb.ingest(request('r', { path: 'workspace/data/a.md' }))
    expect(failed.result).toMatchObject({
      ok: false,
      error: { code: 'kb-ingest-failed' },
    })
    await ctx.fiber.dispose()
  })

  it('refuses the upload channel until writes are opted in', async () => {
    const { api, ctx } = await harness({ kbTenant: 'demo-food-co' })
    const refused = await api.kb.upload(request('r', { filename: 'a.md', data: 'IyB4' }))
    expect(refused.result).toEqual({ ok: false, error: { code: 'kb-write-disabled', message: 'the kb workbench is read-only; set the api-gateway config kbWriteEnabled: true to allow ingest', details: {} } })
    await ctx.fiber.dispose()
  })
})

describe('kb URL ingest', () => {
  it('pins the workbench URL fetch to the addresses the SSRF gate admitted', async () => {
    const pins: (readonly string[] | undefined)[] = []
    const { api, ingestArgs, ctx } = await harness({
      kbTenant: 'demo-food-co',
      kbWriteEnabled: true,
      webFetch: async (request) => {
        pins.push(request.pinnedAddresses)
        return { statusCode: 200, body: { kind: 'text', content: 'pinned workbench page' }, truncated: false }
      },
    })
    const ingested = await api.kb.ingestUrl(request('r', { url: 'http://8.8.8.8/docs' }))
    expect(ingested.result.ok).toBe(true)
    // The literal public host's admitted address rode the fetch request, so
    // DNS cannot re-answer between the gate and the connect.
    expect(pins).toEqual([['8.8.8.8']])
    expect(ingestArgs.at(-1)).toMatchObject({ sourcePath: 'http://8.8.8.8/docs', content: 'pinned workbench page' })
    await ctx.fiber.dispose()
  })
})

describe('kb upload request schema', () => {
  it('accepts a multi-megabyte canonical base64 body without exhausting the validation stack', () => {
    // The wire gate must hold for the channel's normal payload size (the cap
    // is 64 MiB); the previous whole-string regex threw "Maximum call stack
    // size exceeded" from ~3.5 MB of input.
    const data = Buffer.alloc(20 * 1024 * 1024, 97).toString('base64')
    expect(kbUploadRequestSchema.safeParse({ filename: 'big.md', data }).success).toBe(true)
  })

  it('keeps refusing lenient base64 shapes Node would silently mis-decode', () => {
    for (const data of [
      'eA', // missing padding
      'eA=', // one-character padding never exists in RFC-4648
      'A===', // one alphabet byte plus three padding
      'aGVsbG8', // unpadded tail
      'aGVsbG8 ', // whitespace the Node decoder would drop
      'aGVsbG8\n', // newline the Node decoder would drop
      'aGVsbG8-', // URL-safe alphabet
      'eXA=eA==', // a second quartet after the padded one
    ]) {
      expect(kbUploadRequestSchema.safeParse({ filename: 'a.md', data }).success, JSON.stringify(data)).toBe(false)
    }
  })

  it('keeps accepting the canonical quartet forms including the empty body', () => {
    for (const data of ['', 'eA==', 'eXA=', 'aGVsbG8=']) {
      expect(kbUploadRequestSchema.safeParse({ filename: 'a.md', data }).success, JSON.stringify(data)).toBe(true)
    }
  })
})

describe('kb upload channel', () => {
  /** A writable harness over a fresh temp host cwd, so landings are observable. */
  async function uploadHarness() {
    const cwd = mkdtempSync(join(tmpdir(), 'dsh-kb-upload-'))
    uploadRoots.push(cwd)
    const made = await harness({ kbTenant: 'demo-food-co', kbWriteEnabled: true, cwd })
    return { ...made, cwd }
  }

  it('lands the bytes under workspace uploads and stores the parsed document on the bound tenant', async () => {
    const { api, calls, ingestArgs, ctx, cwd } = await uploadHarness()
    const uploaded = await api.kb.upload(request('r', {
      filename: 'visit-note.md',
      data: Buffer.from('# 走访纪要\n宏达塑业准时率 96%。').toString('base64'),
    }))
    expect(uploaded.result.ok).toBe(true)
    expect(calls.at(-1)).toBe('ingest:demo-food-co')
    expect(ingestArgs.at(-1)).toMatchObject({
      tenantId: 'demo-food-co',
      sourcePath: 'workspace/data/uploads/visit-note.md',
      content: '# 走访纪要\n宏达塑业准时率 96%。',
    })
    // The durable landing is byte-identical to what the browser sent.
    expect(readFileSync(join(cwd, 'workspace/data/uploads/visit-note.md'), 'utf8')).toBe('# 走访纪要\n宏达塑业准时率 96%。')
    await ctx.fiber.dispose()
  })

  it('reports whether a same-name re-upload replaced the prior landing', async () => {
    const { api, ctx } = await uploadHarness()
    const first = await api.kb.upload(request('r', {
      filename: 'note.md',
      data: Buffer.from('# v1').toString('base64'),
    }))
    expect(first.result).toMatchObject({ ok: true, value: { replaced: false } })
    const second = await api.kb.upload(request('r', {
      filename: 'note.md',
      data: Buffer.from('# v2').toString('base64'),
    }))
    expect(second.result).toMatchObject({ ok: true, value: { replaced: true } })
    await ctx.fiber.dispose()
  })

  it('parses an uploaded PDF through the same extractor as the file channel', async () => {
    const { api, ingestArgs, ctx } = await uploadHarness()
    const pdf = readFileSync(fileURLToPath(new URL('../../../kb/tool-kb/tests/fixtures/docs/sample.pdf', import.meta.url)))
    const uploaded = await api.kb.upload(request('r', { filename: 'sample.pdf', data: pdf.toString('base64') }))
    expect(uploaded.result.ok, JSON.stringify(uploaded.result)).toBe(true)
    expect(ingestArgs.at(-1)?.sourcePath).toBe('workspace/data/uploads/sample.pdf')
    expect(ingestArgs.at(-1)?.content.length).toBeGreaterThan(0)
    await ctx.fiber.dispose()
  })

  it('sanitizes traversal-shaped names down to their final segment', async () => {
    const { api, ingestArgs, ctx, cwd } = await uploadHarness()
    const uploaded = await api.kb.upload(request('r', {
      filename: '../../escape/evil-plan.md',
      data: Buffer.from('内容').toString('base64'),
    }))
    expect(uploaded.result.ok).toBe(true)
    expect(ingestArgs.at(-1)?.sourcePath).toBe('workspace/data/uploads/evil-plan.md')
    expect(readFileSync(join(cwd, 'workspace/data/uploads/evil-plan.md'), 'utf8')).toBe('内容')
    await ctx.fiber.dispose()
  })

  it('refuses names with no safe single segment', async () => {
    const { api, ctx } = await uploadHarness()
    for (const filename of ['..', '   ', 'a/b/', 'evil\u0000.md']) {
      const refused = await api.kb.upload(request('r', { filename, data: 'eA' }))
      expect(refused.result).toMatchObject({ ok: false, error: { code: 'kb-invalid-filename' } })
    }
    await ctx.fiber.dispose()
  })

  it('refuses an unaccepted extension and an invalid doc_kind before any landing', async () => {
    const { api, ctx, cwd } = await uploadHarness()
    const extension = await api.kb.upload(request('r', { filename: 'photo.png', data: 'eA' }))
    expect(extension.result).toMatchObject({ ok: false, error: { code: 'kb-invalid-path' } })
    const kind = await api.kb.upload(request('r', { filename: 'a.md', data: 'eA', doc_kind: 'nope' }))
    expect(kind.result).toMatchObject({ ok: false, error: { code: 'kb-invalid-doc-kind' } })
    // Neither refusal created the uploads directory.
    expect(() => readFileSync(join(cwd, 'workspace/data/uploads'))).toThrow()
    await ctx.fiber.dispose()
  })

  it('refuses a file past the 64 MiB workbench byte cap', async () => {
    const { api, ctx } = await uploadHarness()
    const oversized = Buffer.alloc(64 * 1024 * 1024 + 1, 97).toString('base64')
    const refused = await api.kb.upload(request('r', { filename: 'huge.md', data: oversized }))
    expect(refused.result).toMatchObject({
      ok: false,
      error: { code: 'kb-upload-too-large', details: { filename: 'huge.md', maxBytes: 64 * 1024 * 1024 } },
    })
    await ctx.fiber.dispose()
  })

  it('refuses a text upload that is not valid UTF-8, like the file channel readText', async () => {
    const { api, ctx } = await uploadHarness()
    const refused = await api.kb.upload(request('r', {
      filename: 'gbk.txt',
      data: Buffer.from([0xd6, 0xd0, 0xce, 0xc4]).toString('base64'),
    }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'kb-ingest-failed' } })
    await ctx.fiber.dispose()
  })
})
