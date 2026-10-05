// @vitest-environment jsdom
/**
 * The composer's attachment lane (W11-B2): the pick-to-quote pipeline over a
 * mocked gateway rpc — an image pick rides `data.describeImage` and lands a
 * ready chip whose quote block carries the VLM description; a document pick
 * rides `data.extractText` and quotes the extracted text with its truncation
 * fact; refusals land the failed chip with the human hint; the image cap
 * counts before the upload starts; and composeWithAttachments splices the
 * ready quotes ahead of the typed text while pending and failed rows never
 * reach the wire.
 */

import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { Toast } from 'antd-mobile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { composeWithAttachments, useAttachments } from '../src/client/messages/chat/attachments.ts'

const rpcMock = vi.hoisted(() => vi.fn())
vi.mock('../src/client/rpc.ts', () => ({ rpc: rpcMock }))

/** One pick's ready/failed assertion base. */
function pngFile(name = 'shelf.png'): File {
  return new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' })
}

beforeEach(() => {
  rpcMock.mockReset()
  vi.spyOn(Toast, 'show').mockImplementation(() => ({ close: () => {} }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('useAttachments — image lane', () => {
  it('uploads through data.describeImage and lands a ready chip with the description quote', async () => {
    rpcMock.mockResolvedValue({ attachmentId: 'att_9', name: 'shelf.png', description: '一排酱油礼盒' })
    const { result } = renderHook(() => useAttachments())
    await act(async () => { await result.current.pickImage(pngFile()) })
    await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('ready') })
    expect(rpcMock).toHaveBeenCalledWith('data.describeImage', expect.objectContaining({ mediaType: 'image/png', name: 'shelf.png' }))
    expect(result.current.attachments[0]?.quote).toBe('📎 shelf.png\n【图片内容】一排酱油礼盒')
  })

  it('lands the failed chip with the human hint on a gateway refusal', async () => {
    rpcMock.mockRejectedValue({ code: 'data-vision-failed', message: 'endpoint 503' })
    const { result } = renderHook(() => useAttachments())
    await act(async () => { await result.current.pickImage(pngFile()) })
    await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('failed') })
    expect(result.current.attachments[0]?.error).toBe('图片识别失败，请重试')
  })

  it('refuses unsupported image types before any upload', async () => {
    const { result } = renderHook(() => useAttachments())
    await act(async () => { await result.current.pickImage(new File([new Uint8Array([1])], 'film.tiff', { type: 'image/tiff' })) })
    expect(rpcMock).not.toHaveBeenCalled()
    expect(result.current.attachments).toHaveLength(0)
    const shown = vi.mocked(Toast.show).mock.calls.at(-1)?.[0]
    expect(typeof shown === 'string' ? shown : shown?.content).toContain('不支持的图片格式')
  })

  it('caps the strip at six images with the counter toast', async () => {
    rpcMock.mockResolvedValue({ attachmentId: 'att', name: 'x', description: 'd' })
    const { result } = renderHook(() => useAttachments())
    for (let index = 0; index < 7; index++) {
      await act(async () => { await result.current.pickImage(pngFile(`p${String(index)}.png`)) })
    }
    expect(result.current.attachments).toHaveLength(6)
    const capped = vi.mocked(Toast.show).mock.calls.at(-1)?.[0]
    expect(typeof capped === 'string' ? capped : capped?.content).toBe('一次最多带 6 张图片')
  })
})

describe('useAttachments — document lane', () => {
  it('extracts through data.extractText and quotes the text with the truncation fact', async () => {
    rpcMock.mockResolvedValue({ text: '第一章 总则', truncated: true })
    const { result } = renderHook(() => useAttachments())
    const doc = new File([new Uint8Array([1])], 'regime.pdf', { type: 'application/pdf' })
    await act(async () => { await result.current.pickDoc(doc) })
    await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('ready') })
    expect(rpcMock).toHaveBeenCalledWith('data.extractText', expect.objectContaining({ filename: 'regime.pdf' }))
    expect(result.current.attachments[0]?.quote).toBe('📎 regime.pdf\n【文件内容】第一章 总则\n（原文过长，已截断）')
  })

  it('removes one chip by id', async () => {
    rpcMock.mockResolvedValue({ text: 'ok', truncated: false })
    const { result } = renderHook(() => useAttachments())
    await act(async () => { await result.current.pickDoc(new File([new Uint8Array([1])], 'a.txt', { type: 'text/plain' })) })
    await waitFor(() => { expect(result.current.attachments).toHaveLength(1) })
    act(() => { result.current.remove(result.current.attachments[0]!.id) })
    expect(result.current.attachments).toHaveLength(0)
  })

  it('clear drops every chip at once (the post-send reset)', async () => {
    rpcMock.mockResolvedValue({ attachmentId: 'a', name: 'n', description: 'd' })
    const { result } = renderHook(() => useAttachments())
    await act(async () => { await result.current.pickImage(pngFile()) })
    rpcMock.mockResolvedValue({ text: 'ok', truncated: false })
    await act(async () => { await result.current.pickDoc(new File([new Uint8Array([1])], 'b.md', { type: 'text/markdown' })) })
    await waitFor(() => { expect(result.current.attachments).toHaveLength(2) })
    act(() => { result.current.clear() })
    expect(result.current.attachments).toHaveLength(0)
  })
})

describe('composeWithAttachments', () => {
  const ready = (quote: string) => ({
    id: 'x', kind: 'doc' as const, name: 'n', sizeBytes: 1, thumbUrl: undefined,
    status: 'ready' as const, quote, error: undefined,
  })
  const pending = {
    id: 'p', kind: 'image' as const, name: 'p', sizeBytes: 1, thumbUrl: undefined,
    status: 'uploading' as const, quote: undefined, error: undefined,
  }
  const failed = {
    id: 'f', kind: 'image' as const, name: 'f', sizeBytes: 1, thumbUrl: undefined,
    status: 'failed' as const, quote: undefined, error: 'x',
  }

  it('leads with the quote blocks and follows with the typed text', () => {
    expect(composeWithAttachments([ready('📎 a\n【文件内容】x'), ready('📎 b\n【图片内容】y')], '这是什么？')).toBe(
      '📎 a\n【文件内容】x\n\n📎 b\n【图片内容】y\n\n这是什么？',
    )
  })

  it('sends quotes alone when nothing is typed, and the bare text when no attachment is ready', () => {
    expect(composeWithAttachments([ready('📎 a\n【文件内容】x')], '  ')).toBe('📎 a\n【文件内容】x')
    expect(composeWithAttachments([pending, failed], '普通消息')).toBe('普通消息')
    expect(composeWithAttachments([pending], '   ')).toBe('')
  })
})
