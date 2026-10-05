// @vitest-environment jsdom
/**
 * The composer's send gate and failure surface (W11-R1): the send stamp and
 * the Enter path bind one `canSend` flag — a ready attachment alone arms the
 * send (an uploading or failed row never reaches the wire, so it never arms
 * the send either), and a pick that lands failed toasts once naming the
 * attachment and its reason (the chip's own error line carries the detail
 * afterwards; a repeat toast on every render would nag).
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Toast } from 'antd-mobile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftAttachment } from '../src/client/messages/chat/attachments.ts'
import { Composer, type ComposerProps } from '../src/client/messages/chat/Composer.tsx'

/** One draft attachment row with per-case overrides. */
function attachment(overrides: Partial<DraftAttachment> = {}): DraftAttachment {
  return {
    id: 'a1', kind: 'image', name: 'shelf.png', sizeBytes: 12, thumbUrl: undefined,
    status: 'ready', quote: '📎 shelf.png\n【图片内容】一排酱油礼盒', error: undefined,
    ...overrides,
  }
}

/** The full composer props with view defaults; `overrides` patch any prop. */
function baseProps(overrides: Partial<ComposerProps> = {}): ComposerProps {
  return {
    chips: [], chipsDisabled: false, draft: '', onDraftChange: () => {}, sending: false,
    running: false, onSend: () => {}, onFill: () => {}, filledAt: 0, onStop: () => {}, error: undefined,
    panelOpen: false, panel: null, onTogglePanel: () => {}, inputRef: { current: null },
    attachments: [] as readonly DraftAttachment[], onRemoveAttachment: () => {},
    listening: false, interim: '', onStopListening: () => {},
    ...overrides,
  }
}

/** Mount the composer with view defaults; `overrides` patch any prop. */
function mountComposer(overrides: Partial<ComposerProps> = {}): { readonly onSend: ReturnType<typeof vi.fn> } {
  const onSend = vi.fn()
  render(<Composer {...baseProps({ ...overrides, onSend })} />)
  return { onSend }
}

beforeEach(() => {
  vi.spyOn(Toast, 'show').mockImplementation(() => ({ close: () => {} }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('composer send gate (canSend single source, W11-R1)', () => {
  it('arms the send stamp for a ready attachment with an empty draft', () => {
    mountComposer({ attachments: [attachment()] })
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('keeps the send stamp disabled with an empty draft and no attachment', () => {
    mountComposer()
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps the send stamp disabled while the only attachment is still uploading', () => {
    mountComposer({ attachments: [attachment({ status: 'uploading', quote: undefined })] })
    expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Enter sends the ready-attachment draft through the same flag', () => {
    const { onSend } = mountComposer({ attachments: [attachment()] })
    fireEvent.keyDown(screen.getByPlaceholderText('问我任何经营问题...'), { key: 'Enter' })
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('Enter stays silent for an uploading-only strip', () => {
    const { onSend } = mountComposer({ attachments: [attachment({ status: 'uploading', quote: undefined })] })
    fireEvent.keyDown(screen.getByPlaceholderText('问我任何经营问题...'), { key: 'Enter' })
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('composer failed-attachment toast (W11-R1)', () => {
  it('toasts once naming the failed attachment and its reason', () => {
    mountComposer({ attachments: [attachment({ status: 'failed', quote: undefined, error: '图片识别失败，请重试' })] })
    const shown = vi.mocked(Toast.show).mock.calls.at(-1)?.[0]
    const content = typeof shown === 'string' ? shown : shown?.content
    expect(content).toContain('shelf.png')
    expect(content).toContain('图片识别失败，请重试')
  })

  it('does not re-toast the same failed row on re-renders', () => {
    const row = attachment({ id: 'f9', status: 'failed', quote: undefined, error: '文件超过大小限制' })
    const initial = baseProps({ attachments: [row] })
    const { rerender } = render(<Composer {...initial} />)
    const toastsAfterMount = vi.mocked(Toast.show).mock.calls.length
    rerender(<Composer {...initial} draft="再打几个字" />)
    expect(vi.mocked(Toast.show).mock.calls.length).toBe(toastsAfterMount)
  })
})
