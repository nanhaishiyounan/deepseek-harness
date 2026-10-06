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
  localStorage.clear()
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

  it('picks and lands ready chips with crypto.randomUUID undefined (LAN HTTP, W11-R1)', async () => {
    const original = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID')
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      rpcMock.mockResolvedValue({ text: '冷库温控记录', truncated: false })
      const { result } = renderHook(() => useAttachments())
      await act(async () => { await result.current.pickDoc(new File([new Uint8Array([1])], 'cold.txt', { type: 'text/plain' })) })
      await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('ready') })
      expect(result.current.attachments[0]?.quote).toContain('📎 cold.txt')
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', original ?? { value: undefined, configurable: true, writable: true })
    }
  })
})

describe('useAttachments — the refresh survival (W11-R1)', () => {
  /** Flip jsdom's visibility the way a backgrounded tab reads. */
  function goHidden(): void {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }

  function goVisible(): void {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
  }

  afterEach(() => { goVisible() })

  it('persists the ready descriptors on visibilitychange→hidden (the quote rides along)', async () => {
    rpcMock.mockResolvedValue({ text: '冷库温控记录', truncated: false })
    const { result } = renderHook(() => useAttachments('keep-1'))
    await act(async () => { await result.current.pickDoc(new File([new Uint8Array([1])], 'cold.txt', { type: 'text/plain' })) })
    await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('ready') })
    goHidden()
    const stored = localStorage.getItem('dsh-mobile-attachments-keep-1')
    expect(stored).toContain('cold.txt')
    expect(stored).toContain('【文件内容】冷库温控记录')
  })

  it('persists on pagehide and rehydrates the strip on the next mount (the refresh simulation)', async () => {
    localStorage.setItem('dsh-mobile-attachments-keep-2', JSON.stringify({
      version: 2,
      savedAt: 1,
      rows: [{ id: 'r9', kind: 'doc', name: 'regime.txt', sizeBytes: 12, quote: '📎 regime.txt\n【文件内容】入库明细' }],
    }))
    const { result } = renderHook(() => useAttachments('keep-2'))
    expect(result.current.attachments).toHaveLength(1)
    expect(result.current.attachments[0]?.status).toBe('ready')
    expect(result.current.attachments[0]?.quote).toContain('入库明细')
  })

  it('clear drops the persisted strip too — a sent attachment never resurrects on refresh', async () => {
    rpcMock.mockResolvedValue({ text: '温控记录', truncated: false })
    const { result } = renderHook(() => useAttachments('keep-3'))
    await act(async () => { await result.current.pickDoc(new File([new Uint8Array([1])], 'warm.txt', { type: 'text/plain' })) })
    await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('ready') })
    act(() => { result.current.clear() })
    goHidden()
    expect(localStorage.getItem('dsh-mobile-attachments-keep-3')).toBeNull()
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

describe('useAttachments — persistence hygiene (W11-R2)', () => {
  /** The joined console.warn output so far. */
  function warned(spy: { readonly mock: { readonly calls: readonly unknown[][] } }): string {
    return spy.mock.calls.map(call => String(call[0])).join('\n')
  }

  it('drops a corrupt stored strip, removes the key, and warns naming the key', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('dsh-mobile-attachments-corrupt-1', '{not json')
    const { result } = renderHook(() => useAttachments('corrupt-1'))
    expect(result.current.attachments).toHaveLength(0)
    expect(localStorage.getItem('dsh-mobile-attachments-corrupt-1')).toBeNull()
    expect(warned(warn)).toContain('attachments.persist-corrupt')
    expect(warned(warn)).toContain('dsh-mobile-attachments-corrupt-1')
  })

  it('drops a non-conforming strip (the pre-W11-R2 version) the same way', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('dsh-mobile-attachments-corrupt-2', JSON.stringify({ version: 1, rows: [] }))
    const { result } = renderHook(() => useAttachments('corrupt-2'))
    expect(result.current.attachments).toHaveLength(0)
    expect(localStorage.getItem('dsh-mobile-attachments-corrupt-2')).toBeNull()
    expect(warned(warn)).toContain('attachments.persist-corrupt')
  })

  it('on quota exceeded evicts the oldest other strip, retries once, and keeps the chips in memory', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('dsh-mobile-attachments-old', JSON.stringify({
      version: 2, savedAt: 1,
      rows: [{ id: 'o', kind: 'doc', name: 'old.txt', sizeBytes: 1, quote: 'x' }],
    }))
    localStorage.setItem('dsh-mobile-attachments-newer', JSON.stringify({
      version: 2, savedAt: 2,
      rows: [{ id: 'n', kind: 'doc', name: 'newer.txt', sizeBytes: 1, quote: 'y' }],
    }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new DOMException('The quota has been exceeded', 'QuotaExceededError')
    })
    rpcMock.mockResolvedValue({ text: '冷库温控记录', truncated: false })
    const { result } = renderHook(() => useAttachments('quota-1'))
    await act(async () => { await result.current.pickDoc(new File([new Uint8Array([1])], 'q.txt', { type: 'text/plain' })) })
    // The chip itself lands ready in memory — a storage failure never
    // touches the lane's live state.
    await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('ready') })
    // The oldest other strip is gone, the newer one stays, this key persisted.
    expect(localStorage.getItem('dsh-mobile-attachments-old')).toBeNull()
    expect(localStorage.getItem('dsh-mobile-attachments-newer')).not.toBeNull()
    expect(localStorage.getItem('dsh-mobile-attachments-quota-1')).toContain('q.txt')
    expect(warned(warn)).toContain('attachments.persist-quota')
    expect(warned(warn)).toContain('dsh-mobile-attachments-old')
  })

  it('warns without evicting when the write fails for a non-quota reason', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage backend gone')
    })
    rpcMock.mockResolvedValue({ text: '入库明细', truncated: false })
    const { result } = renderHook(() => useAttachments('plain-1'))
    await act(async () => { await result.current.pickDoc(new File([new Uint8Array([1])], 'p.txt', { type: 'text/plain' })) })
    await waitFor(() => { expect(result.current.attachments[0]?.status).toBe('ready') })
    expect(localStorage.getItem('dsh-mobile-attachments-plain-1')).toBeNull()
    expect(warned(warn)).toContain('attachments.persist-failed')
    expect(warned(warn)).toContain('dsh-mobile-attachments-plain-1')
    expect(warned(warn)).not.toContain('attachments.persist-quota')
  })
})
