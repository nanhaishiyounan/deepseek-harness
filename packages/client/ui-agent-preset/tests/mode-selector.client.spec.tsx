// @vitest-environment jsdom
/**
 * The composer-card mode selector: the persistent preset picker whose posture
 * follows the flow's session — no session or a blank one picks in place, a
 * started session offers a new session on the pick (the host's agent-preset
 * lock), and an empty roster renders nothing.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { ModeSelector } from '../src/client/ModeSelector.tsx'
import type { ModeSelectorProps } from '../src/client/ModeSelector.tsx'
import type { AgentPresetSeatState } from '../src/client/seat-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const READY: AgentPresetSeatState = {
  current: 'standard',
  options: [
    { id: 'standard', trust: 'system', name: '标准模式', description: '完整的编码 agent。' },
    { id: 'minimal', trust: 'system', name: '极简模式' },
  ],
  session: undefined,
  busy: false,
  error: null,
  introduce: false,
}

function renderMode(state: Partial<AgentPresetSeatState> = {}) {
  const store = createSnapshotStore<AgentPresetSeatState>({ ...READY, ...state })
  const actions = {
    load: vi.fn(() => Promise.resolve()),
    select: vi.fn(() => Promise.resolve()),
    startSessionOn: vi.fn(),
  }
  render(<ModeSelector {...({
    ...actions,
    useAgentPresetSeat: bindSnapshotSelector(store),
    t: (key: keyof typeof en) => en[key],
  } as unknown as ModeSelectorProps)} />)
  return actions
}

/**
 * The menu row whose text carries the preset name (the trigger names the
 * current preset too, so a bare text query matches both).
 */
function menuItem(name: string): HTMLElement {
  const found = screen.getAllByRole('menuitem').filter(el => el.textContent?.includes(name))
  expect(found, `menu item ${name}`).toHaveLength(1)
  return found[0]!
}

describe('the composer mode selector', () => {
  it('renders nothing while the roster is empty', () => {
    renderMode({ options: [], current: '' })

    expect(screen.queryByRole('button')).toBeNull()
  })

  it('names the deployment default with no session and picks in place', async () => {
    const actions = renderMode()

    await waitFor(() => { expect(actions.load).toHaveBeenCalledTimes(1) })
    expect(screen.getByRole('button').textContent).toContain(en.presetStandardName)
    expect(screen.getByRole('button').getAttribute('title')).toBe(en.modeHint)

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(menuItem(en.presetMinimalName))

    expect(actions.select).toHaveBeenCalledWith('minimal')
    expect(actions.startSessionOn).not.toHaveBeenCalled()
  })

  it('picks in place on a blank session too', () => {
    const actions = renderMode({
      session: { id: 's1' as never, blank: true },
    })

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(menuItem(en.presetMinimalName))

    expect(actions.select).toHaveBeenCalledWith('minimal')
    expect(actions.startSessionOn).not.toHaveBeenCalled()
  })

  it('offers a new session on a started session and keeps its composition marked', () => {
    const actions = renderMode({
      session: { id: 's1' as never, blank: false, agentPreset: 'minimal' },
    })

    // The session's own composition outranks a stale display choice.
    expect(screen.getByRole('button').textContent).toContain(en.presetMinimalName)
    expect(screen.getByRole('button').getAttribute('title')).toBe(en.applyInNewSession)

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(menuItem(en.presetStandardName))

    expect(actions.startSessionOn).toHaveBeenCalledWith('standard')
    expect(actions.select).not.toHaveBeenCalled()
  })

  it('re-picking the running composition is a no-op, not a new session', () => {
    const actions = renderMode({
      session: { id: 's1' as never, blank: false, agentPreset: 'minimal' },
    })

    fireEvent.click(screen.getByRole('button'))
    fireEvent.click(menuItem(en.presetMinimalName))

    expect(actions.startSessionOn).not.toHaveBeenCalled()
    expect(actions.select).not.toHaveBeenCalled()
  })
})
