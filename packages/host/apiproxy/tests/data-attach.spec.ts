/**
 * The composer-attachment pair on the data domain: `describeImage` (vision
 * gate, credential resolution, durable admission, the VLM round trip, the
 * loud refusals) and `extractText` (pdf/md/txt only, the wire bound and its
 * truncation fact, the unsupported-extension and empty-text-layer refusals).
 * The upstream VLM endpoint is stubbed at the fetch boundary — the live
 * service contract (data-URL image form, base_resp status gate) is recorded
 * in the W11 research card this file's companion change landed with.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import ViewActionService from '@deepseek-ai/dsh-view-actions'
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import { createApiProxy } from '../src/api-proxy.ts'
import type { RpcRequest } from '../src/api/rpc.ts'

/** A one-byte png: the admission stub never decodes, only records. */
const PNG_B64 = Buffer.from('89504e470d0a1a0a', 'hex').toString('base64')

/** The admission stub: one durable ref per admitted image, ids in order. */
function attachmentsStub() {
  const admitted: { mediaType: ImageAttachmentRef['mediaType']; name?: string }[] = []
  const store = {
    saveImages: vi.fn(async (images: readonly { data: Uint8Array; mediaType: ImageAttachmentRef['mediaType']; name?: string }[]) =>
      images.map((image): ImageAttachmentRef => {
        admitted.push({ mediaType: image.mediaType, ...image.name === undefined ? {} : { name: image.name } })
        return {
          attachmentId: `att_${admitted.length}` as never,
          mediaType: image.mediaType,
          bytes: image.data.byteLength,
          width: 1,
          height: 1,
          ...image.name === undefined ? {} : { name: image.name },
        }
      })),
  }
  return { store, admitted }
}

type FetchStub = ReturnType<typeof vi.fn>

async function harness(defaults: {
  visionDescribeEnabled?: boolean
  visionApiKeyEnv?: string
  visionBaseUrl?: string
} = {}) {
  const { store, admitted } = attachmentsStub()
  const cwd = mkdtempSync(join(tmpdir(), 'dsh-data-attach-'))
  roots.push(cwd)
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(ViewActionService)
  await ctx.plugin(AgentRegistry)
  ctx.provide('attachments', store as never)
  const api = createApiProxy(ctx, {
    defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
    saveDefaultModelSelection: async () => {},
    cwd,
    kbTenant: 'demo-food-co',
    ...defaults.visionDescribeEnabled === undefined ? {} : { visionDescribeEnabled: defaults.visionDescribeEnabled },
    ...defaults.visionApiKeyEnv === undefined ? {} : { visionApiKeyEnv: defaults.visionApiKeyEnv },
    ...defaults.visionBaseUrl === undefined ? {} : { visionBaseUrl: defaults.visionBaseUrl },
  })
  return { api, ctx, admitted }
}

const roots: string[] = []

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
  vi.unstubAllGlobals()
  delete process.env.MINIMAX_API_KEY
  delete process.env.MM_TEST_KEY
})

/** One typed RPC request envelope (the rpcId is branded on the wire contract). */
function request<P>(payload: P): RpcRequest<P> {
  return { rpcId: 'r' as never, payload }
}

/** Stub global fetch to answer the vlm endpoint once. */
function stubVlm(answer: (body: Record<string, unknown>) => unknown) {
  const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = []
  const fetchStub: FetchStub = vi.fn(async (url: string | URL, init: RequestInit) => {
    const rawBody = typeof init.body === 'string' ? init.body : ''
    const body = JSON.parse(rawBody) as Record<string, unknown>
    calls.push({ url: String(url), body, headers: new Headers(init.headers) })
    const payload = answer(body)
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fetchStub)
  return { calls, fetchStub }
}

describe('data.describeImage', () => {
  it('refuses until the deployment opts in', async () => {
    const { api, ctx } = await harness({})
    process.env.MINIMAX_API_KEY = 'k'
    const refused = await api.data.describeImage(request({ image: PNG_B64, mediaType: 'image/png' }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'data-vision-disabled' } })
    await ctx.fiber.dispose()
  })

  it('refuses when no credential resolves through the configured env', async () => {
    const { api, ctx } = await harness({ visionDescribeEnabled: true, visionApiKeyEnv: 'MM_TEST_KEY' })
    const refused = await api.data.describeImage(request({ image: PNG_B64, mediaType: 'image/png' }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'data-vision-unavailable', details: { apiKeyEnv: 'MM_TEST_KEY' } } })
    await ctx.fiber.dispose()
  })

  it('admits the image durably and returns the endpoint description', async () => {
    process.env.MINIMAX_API_KEY = 'k'
    const { api, ctx, admitted } = await harness({ visionDescribeEnabled: true })
    const { calls } = stubVlm(() => ({ content: '一张库存照片', base_resp: { status_code: 0, status_msg: 'success' } }))
    const described = await api.data.describeImage(request({ image: PNG_B64, mediaType: 'image/png', name: 'shelf.png' }))
    expect(described.result).toEqual({
      ok: true,
      value: { attachmentId: 'att_1', name: 'shelf.png', description: '一张库存照片' },
    })
    expect(admitted).toEqual([{ mediaType: 'image/png', name: 'shelf.png' }])
    expect(calls[0]?.url).toBe('https://api.minimaxi.com/v1/coding_plan/vlm')
    expect(calls[0]?.body.image_url).toBe(`data:image/png;base64,${PNG_B64}`)
    expect(calls[0]?.headers.get('Authorization')).toBe('Bearer k')
    await ctx.fiber.dispose()
  })

  it('fails loud when the endpoint answers a non-zero status code', async () => {
    process.env.MINIMAX_API_KEY = 'k'
    const { api, ctx } = await harness({ visionDescribeEnabled: true })
    stubVlm(() => ({ base_resp: { status_code: 2013, status_msg: 'invalid image_url' } }))
    const failed = await api.data.describeImage(request({ image: PNG_B64, mediaType: 'image/png' }))
    expect(failed.result).toMatchObject({ ok: false, error: { code: 'data-vision-failed', details: { reason: 'vlm-request-failed' } } })
    await ctx.fiber.dispose()
  })

  it('honors the configured base url', async () => {
    process.env.MINIMAX_API_KEY = 'k'
    const { api, ctx } = await harness({ visionDescribeEnabled: true, visionBaseUrl: 'https://vision.example/v1' })
    const { calls } = stubVlm(() => ({ content: 'ok', base_resp: { status_code: 0 } }))
    await api.data.describeImage(request({ image: PNG_B64, mediaType: 'image/jpeg' }))
    expect(calls[0]?.url).toBe('https://vision.example/v1/coding_plan/vlm')
    await ctx.fiber.dispose()
  })
})

describe('data.extractText', () => {
  it('refuses extensions outside the pdf/md/txt set', async () => {
    const { api, ctx } = await harness({})
    const refused = await api.data.extractText(request({
      filename: 'report.docx',
      data: Buffer.from('x').toString('base64'),
    }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'data-extract-unsupported', details: { filename: 'report.docx' } } })
    await ctx.fiber.dispose()
  })

  it('returns md bodies verbatim with no truncation fact', async () => {
    const { api, ctx } = await harness({})
    const text = '# 标题\n\n正文一行。'
    const extracted = await api.data.extractText(request({
      filename: 'spec.md', data: Buffer.from(text, 'utf8').toString('base64'),
    }))
    expect(extracted.result).toEqual({ ok: true, value: { text, truncated: false } })
    await ctx.fiber.dispose()
  })

  it('truncates over-bound text on a code-point boundary and reports it', async () => {
    const { api, ctx } = await harness({})
    // A surrogate pair per emoji: 8000 pairs = 8000 code points = 16000 UTF-16 units.
    const emoji = '😀'.repeat(8000)
    const extracted = await api.data.extractText(request({
      filename: 'big.txt', data: Buffer.from(emoji, 'utf8').toString('base64'),
    }))
    const value = extracted.result
    expect(value.ok).toBe(true)
    if (value.ok) {
      expect(value.value.truncated).toBe(true)
      // 6000 code points of a surrogate pair must end on a whole pair.
      expect(Array.from(value.value.text).length).toBe(6000)
      expect(value.value.text.includes('\uFFFD')).toBe(false)
    }
    await ctx.fiber.dispose()
  })

  it('fails loud on an empty extraction (a scanned pdf carries no text layer)', async () => {
    const { api, ctx } = await harness({})
    const refused = await api.data.extractText(request({
      filename: 'scan.txt', data: Buffer.from(' \n ', 'utf8').toString('base64'),
    }))
    expect(refused.result).toMatchObject({ ok: false, error: { code: 'data-extract-failed', details: { filename: 'scan.txt', reason: 'empty-text-layer' } } })
    await ctx.fiber.dispose()
  })
})
