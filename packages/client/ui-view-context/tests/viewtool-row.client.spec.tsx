// @vitest-environment jsdom
/**
 * Presentation surfaces: the shared ViewToolRow chrome over every row state
 * and both dictionaries, and the invisible ViewSwitchCapture rider's
 * publish/revoke lifecycle against the real service (including through a
 * real mount, as the header seat rides it).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { Context } from '@deepseek-ai/cordis'
import type { RunningToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'
import { ViewSwitchCapture, type ViewSwitchCaptureProps } from '../src/client/ViewSwitchCapture.tsx'
import { ViewToolRow, type ViewToolRowProps } from '../src/client/ViewToolRow.tsx'
import { ViewContextService } from '../src/client/viewContextService.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
})

function running(argsRaw: string): RunningToolCall {
  return {
    callId: 'c1', name: 'view_apply', argsRaw, turn: 1, step: 1, time: 0,
    callView: null, subCalls: [],
  }
}

function settled(parts: Partial<ToolResultNode>): ToolResultNode {
  return {
    kind: 'tool-result', seq: 2, time: 0, callId: 'c1',
    call: { name: 'view_apply', argsRaw: '{}' }, callTime: 0,
    content: [], isError: false, callView: null, resultView: null, subCalls: [],
    ...parts,
  }
}

const dict = { zh, en } as const

function rowProps(toolName: string, block: RunningToolCall | ToolResultNode, lang: 'zh' | 'en' = 'en'): ViewToolRowProps {
  const table = dict[lang] as Record<string, string>
  return { toolName, block, t: (key: string) => table[key] } as unknown as ViewToolRowProps
}

describe('ViewToolRow', () => {
  it('renders each tool name with its own title and the streamed target while running', () => {
    const view = render(<ViewToolRow {...rowProps('switch_view', running('{"view":"kg"}'))} />)
    expect(view.container.textContent).toContain('Switch view · kg')
    view.rerender(<ViewToolRow {...rowProps('view_apply', running('{"view":"kg","action":"set_filter"}'))} />)
    expect(view.container.textContent).toContain('Adjust view · kg · set_filter')
    view.rerender(<ViewToolRow {...rowProps('view_state_get', running('{"view":"kg"}'))} />)
    expect(view.container.textContent).toContain('Read view state · kg')
  })

  it('an ok row shows the result\'s first line after the title', () => {
    const view = render(<ViewToolRow {...rowProps('view_apply', settled({
      content: [{ type: 'text', text: 'filtered: Supplier' }],
    }))} />)
    expect(view.container.textContent).toContain('Adjust view · filtered: Supplier')
  })

  it('error and stopped rows lead with the failure line instead of the summary', () => {
    const view = render(<ViewToolRow {...rowProps('view_apply', settled({
      isError: true, content: [{ type: 'text', text: 'boom' }],
    }))} />)
    expect(view.container.textContent).toContain('boom')
    expect(view.container.textContent).toContain('Adjust view')
    view.rerender(<ViewToolRow {...rowProps('view_apply', settled({
      error: { name: 'Cancel', code: 'interrupted' }, content: [{ type: 'text', text: 'stopped' }],
    }))} />)
    expect(view.container.textContent).toContain('stopped')
  })

  it('a stopped row without content keeps a null error line and shows the plain title', () => {
    const view = render(<ViewToolRow {...rowProps('view_apply', settled({
      error: { name: 'Cancel', code: 'interrupted' },
    }))} />)
    expect(view.container.textContent).toContain('Adjust view')
    expect(view.container.textContent).not.toContain('·')
  })

  it('the Chinese dictionary renders the same rows key-for-key', () => {
    const view = render(<ViewToolRow {...rowProps('switch_view', running('{"view":"kg"}'), 'zh')} />)
    expect(view.container.textContent).toContain('切换视图 · kg')
  })

  it('the shipped dictionaries agree on their key sets', () => {
    expect(Object.keys(en)).toEqual(Object.keys(zh))
  })
})

describe('ViewSwitchCapture', () => {
  it('renders nothing and publishes the owner switch into the service', () => {
    const ctx = new Context()
    const svc = new ViewContextService(ctx, { sessions: {} } as never)
    const setView = vi.fn()
    const props = {
      setView, publishViewSwitch: (fn: (view: string) => void) => svc.publishViewSwitch(fn),
    } as unknown as ViewSwitchCaptureProps
    const view = render(<ViewSwitchCapture {...props} />)
    expect(view.container.textContent).toBe('')
    expect(svc.switchView('kg')).toBe(true)
    expect(setView).toHaveBeenCalledWith('kg')
    // Unmount revokes: the capture no longer owns the live switch.
    view.unmount()
    expect(svc.switchView('kg')).toBe(false)
  })

  it('an absent setView publishes nothing, so switchView stays refused', () => {
    const ctx = new Context()
    const svc = new ViewContextService(ctx, { sessions: {} } as never)
    const publish = vi.fn(() => () => {})
    const props = { publishViewSwitch: publish } as unknown as ViewSwitchCaptureProps
    const view = render(<ViewSwitchCapture {...props} />)
    expect(publish).not.toHaveBeenCalled()
    expect(svc.switchView('kg')).toBe(false)
    view.unmount()
  })

  it('re-rendering with a different setView revokes the previous capture first', () => {
    const published: Array<(view: string) => void> = []
    const revoked: number[] = []
    let captures = 0
    const propsOf = (setView?: (view: string) => void): ViewSwitchCaptureProps =>
      ({
        setView,
        publishViewSwitch: (fn: (view: string) => void) => {
          published.push(fn)
          const mine = ++captures
          return () => { revoked.push(mine) }
        },
      }) as unknown as ViewSwitchCaptureProps
    const first = vi.fn()
    const second = vi.fn()
    const view = render(<ViewSwitchCapture {...propsOf(first)} />)
    view.rerender(<ViewSwitchCapture {...propsOf(second)} />)
    expect(published).toEqual([first, second])
    expect(revoked).toEqual([1])
    view.unmount()
    expect(revoked).toEqual([1, 2])
  })
})
