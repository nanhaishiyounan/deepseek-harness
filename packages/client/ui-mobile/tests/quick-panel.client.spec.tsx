// @vitest-environment jsdom
/**
 * The quick panel's tool grid and the composer's attachment strip + listening
 * card (W11-B2): the panel renders the 2×2 lanes when voice runs, drops the
 * voice tile entirely on `no` (the WeChat webview state), and gates a broken
 * engine's tile behind the hint toast; the composer strip paints one chip per
 * attachment with the three statuses and the remove ×; the listening card
 * covers the input slot with the interim text and stops on tap.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Toast } from 'antd-mobile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QuickPanel } from '../src/client/messages/chat/QuickPanel.tsx'
import { Composer } from '../src/client/messages/chat/Composer.tsx'
import type { DraftAttachment } from '../src/client/messages/chat/attachments.ts'

beforeEach(() => {
  vi.spyOn(Toast, 'show').mockImplementation(() => ({ close: () => {} }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

/** One quick-panel render under the given voice verdict. */
function panel(voiceSupported: 'yes' | 'no' | 'broken', onToolPick = vi.fn()) {
  const onPick = vi.fn()
  render(
    <QuickPanel
      commands={[{ label: '查库存', send: '查库存' }]}
      sending={false}
      onPick={onPick}
      onToolPick={onToolPick}
      voiceSupported={voiceSupported}
    />,
  )
  return { onPick, onToolPick }
}

describe('QuickPanel tool grid (W11-B2)', () => {
  it('renders the 2×2 lanes (语音/拍照/相册/文件) and dispatches onToolPick', () => {
    const { onToolPick } = panel('yes')
    const grid = screen.getByRole('toolbar', { name: '工具' })
    for (const label of ['语音', '拍照', '相册', '文件']) {
      expect(within(grid).getByRole('button', { name: label })).toBeTruthy()
    }
    fireEvent.click(within(grid).getByRole('button', { name: '拍照' }))
    expect(onToolPick).toHaveBeenCalledWith('camera')
  })

  it('hides the voice tile on the no verdict (the WeChat webview steady state)', () => {
    panel('no')
    const grid = screen.getByRole('toolbar', { name: '工具' })
    expect(within(grid).queryByRole('button', { name: '语音' })).toBeNull()
    expect(within(grid).getAllByRole('button')).toHaveLength(3)
  })

  it('keeps a broken engine tile inert behind the hint toast', () => {
    const { onToolPick } = panel('broken')
    fireEvent.click(screen.getByRole('button', { name: '语音' }))
    const shown = vi.mocked(Toast.show).mock.calls.at(-1)?.[0]
    expect(typeof shown === 'string' ? shown : shown?.content).toContain('不支持语音')
    expect(onToolPick).not.toHaveBeenCalled()
  })

  it('still picks starter commands through onPick', () => {
    const { onPick } = panel('yes')
    fireEvent.click(screen.getByRole('button', { name: '查库存' }))
    expect(onPick).toHaveBeenCalledWith('查库存')
  })
})

/** One composer render with the given rows and listening state. */
function composer(props: Partial<Parameters<typeof Composer>[0]> = {}) {
  const base: Parameters<typeof Composer>[0] = {
    chips: [], chipsDisabled: false, draft: '', onDraftChange: () => {}, sending: false,
    running: false, onSend: () => {}, onFill: () => {}, filledAt: 0, onStop: () => {},
    error: undefined, panelOpen: false, panel: null, onTogglePanel: () => {},
    attachments: [], onRemoveAttachment: () => {}, listening: false, interim: '',
    onStopListening: () => {},
    // jsdom's antd-mobile ref contract: any object is never read in render.
    inputRef: { current: null },
    ...props,
  }
  render(<Composer {...base} />)
}

/** One attachment row factory. */
function row(overrides: Partial<DraftAttachment>): DraftAttachment {
  return {
    id: 'a1', kind: 'image', name: 'shelf.png', sizeBytes: 12, thumbUrl: undefined,
    status: 'ready', quote: undefined, error: undefined, ...overrides,
  }
}

describe('Composer attachment strip (W11-B2)', () => {
  it('renders nothing without rows', () => {
    composer()
    expect(screen.queryByRole('list', { name: '待发送附件' })).toBeNull()
  })

  it('paints one chip per row: uploading breathes, ready rests, failed wears the hint', () => {
    composer({ attachments: [
      row({ id: 'u1', name: 'cam.png', status: 'uploading' }),
      row({ id: 'r1', name: 'ok.png', status: 'ready', thumbUrl: 'blob:preview' }),
      row({ id: 'f1', kind: 'doc', name: 'scan.pdf', status: 'failed', error: '未能提取文本（扫描件可能没有文字层）' }),
    ] })
    const strip = screen.getByRole('list', { name: '待发送附件' })
    expect(within(strip).getAllByRole('listitem')).toHaveLength(3)
    // The thumbnail img carries an empty alt (decorative), so the role query
    // skips it — assert the element itself.
    expect(strip.querySelector('img')?.getAttribute('src')).toBe('blob:preview')
    expect(within(strip).getByText('未能提取文本（扫描件可能没有文字层）')).toBeTruthy()
  })

  it('hands the remove × to the sink', () => {
    const onRemoveAttachment = vi.fn()
    composer({ attachments: [row({ id: 'kill-me' })], onRemoveAttachment })
    fireEvent.click(screen.getByRole('button', { name: '移除 shelf.png' }))
    expect(onRemoveAttachment).toHaveBeenCalledWith('kill-me')
  })
})

describe('Composer listening card (W11-B2)', () => {
  it('covers the input slot while listening, shows the interim text, and stops on tap', () => {
    const onStopListening = vi.fn()
    composer({ listening: true, interim: '库存还有', onStopListening })
    const card = screen.getByRole('button', { name: '正在聆听，点击结束' })
    expect(card.textContent).toContain('库存还有')
    fireEvent.click(card)
    expect(onStopListening).toHaveBeenCalled()
  })

  it('shows the placeholder prompt before the first interim frame', () => {
    composer({ listening: true, interim: '' })
    expect(screen.getByRole('button', { name: '正在聆听，点击结束' }).textContent).toContain('正在聆听')
  })

  it('renders no card while idle', () => {
    composer({ listening: false })
    expect(screen.queryByRole('button', { name: '正在聆听，点击结束' })).toBeNull()
  })
})
