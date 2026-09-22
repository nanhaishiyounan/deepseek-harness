// @vitest-environment jsdom
// The sidebar entry and the session-header button: badge states (loading,
// ready, error), the wide/rail shapes, the click dispatch (any session, blank
// included, asks the bridge for the kb tab; no session at all refreshes the
// portal stats), and the header button's own switch plus its bridge
// publication.

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionListState } from '@deepseek-ai/dsh-client-runtime/client'
import type { KbClientState } from '../src/client/kbStore.ts'
import { KbEntry } from '../src/client/KbEntry.tsx'
import { KbHeaderButton } from '../src/client/KbHeaderButton.tsx'
import { zh } from '../src/client/locales.ts'
import { bindStoreHook, GLOBAL_KIT, READY_USAGE, SESSION_KIT, sessionListState } from './kb-fixture.client.ts'

/** The zh dictionary as the surfaces' t. */
const t = ((key: string) => zh[key as keyof typeof zh] ?? key) as never

function mountEntry(state: KbClientState, options: {
  wide?: boolean
  current?: { id: string; blank: boolean }
} = {}) {
  const store = createSnapshotStore<KbClientState>(state)
  const sessions = createSnapshotStore<SessionListState>(sessionListState(options.current ?? { id: 's1', blank: true }))
  const refresh = vi.fn()
  const requestKbView = vi.fn()
  render(
    <KbEntry
      wide={options.wide ?? true}
      {...GLOBAL_KIT}
      useSessions={bindStoreHook(sessions) as never}
      useKb={bindStoreHook(store) as never}
      refresh={refresh}
      requestKbView={requestKbView}
      t={t}
    />,
  )
  return { refresh, requestKbView }
}

afterEach(cleanup)

describe('KbEntry', () => {
  it('loads stats on mount and hides the badge while loading', () => {
    const { refresh } = mountEntry({ stats: undefined, records: [] })
    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByText('12')).toBeNull()
    expect(screen.getByRole('button', { name: zh['entry.documentsBadge'] })).toBeTruthy()
  })

  it('shows the document-count badge when ready and the question mark on error', () => {
    mountEntry({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(screen.getByText('12')).toBeTruthy()
    cleanup()
    mountEntry({ stats: { status: 'error', error: 'kb-not-composed' }, records: [] })
    expect(screen.getByText('?')).toBeTruthy()
  })

  it('hides the label in the collapsed rail and shows it wide', () => {
    mountEntry({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { wide: false })
    expect(screen.queryByText(zh['entry.label'])).toBeNull()
    cleanup()
    mountEntry({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, { wide: true })
    expect(screen.getByText(zh['entry.label'])).toBeTruthy()
  })

  it('requests the kb tab on click for every session and refreshes only with none', () => {
    const blank = mountEntry({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      current: { id: 's1', blank: true },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['entry.documentsBadge'] }))
    // A blank session keeps its view ring, so the click jumps straight to the
    // workbench tab instead of only refreshing the portal stats.
    expect(blank.requestKbView).toHaveBeenCalled()
    expect(blank.refresh).not.toHaveBeenCalled()
    cleanup()

    const active = mountEntry({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, {
      current: { id: 's1', blank: false },
    })
    fireEvent.click(screen.getByRole('button', { name: zh['entry.documentsBadge'] }))
    expect(active.requestKbView).toHaveBeenCalled()
    expect(active.refresh).not.toHaveBeenCalled()
  })

  it('treats a missing current session as blank and an unknown row as active', () => {
    // No current session at all: the portal is on screen, so the click refreshes.
    const store = createSnapshotStore<KbClientState>({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    const none = createSnapshotStore<SessionListState>({
      ids: [], byId: {}, current: undefined,
      phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    const refresh = vi.fn()
    const requestKbView = vi.fn()
    render(
      <KbEntry
        wide
        {...GLOBAL_KIT}
        useSessions={bindStoreHook(none) as never}
        useKb={bindStoreHook(store) as never}
        refresh={refresh}
        requestKbView={requestKbView}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: zh['entry.documentsBadge'] }))
    expect(refresh).toHaveBeenCalled()
    expect(requestKbView).not.toHaveBeenCalled()
    cleanup()

    // A current id with no row in the map reads as an active session.
    const ghost = createSnapshotStore<SessionListState>({
      ids: [], byId: {}, current: 's-ghost' as never,
      phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined,
    })
    render(
      <KbEntry
        wide
        {...GLOBAL_KIT}
        useSessions={bindStoreHook(ghost) as never}
        useKb={bindStoreHook(store) as never}
        refresh={vi.fn()}
        requestKbView={requestKbView}
        t={t}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: zh['entry.documentsBadge'] }))
    expect(requestKbView).toHaveBeenCalled()
  })
})

describe('KbHeaderButton', () => {
  function mountButton(state: KbClientState, setView?: (view: string) => void) {
    const store = createSnapshotStore<KbClientState>(state)
    const publishViewSwitch = vi.fn((next: (view: string) => void) => () => { next('') })
    render(
      <KbHeaderButton
        {...SESSION_KIT}
        {...setView === undefined ? {} : { setView }}
        useKb={bindStoreHook(store) as never}
        publishViewSwitch={publishViewSwitch}
        t={t}
      />,
    )
    return { publishViewSwitch }
  }

  it('switches to the kb tab on click and publishes the switch to the bridge', () => {
    const setView = vi.fn()
    const { publishViewSwitch } = mountButton({ stats: { status: 'ready', usage: READY_USAGE }, records: [] }, setView)
    expect(publishViewSwitch).toHaveBeenCalledWith(setView)
    fireEvent.click(screen.getByRole('button', { name: zh['entry.label'] }))
    expect(setView).toHaveBeenCalledWith('kb')
  })

  it('renders without the owner switch (the degradation) and never publishes', () => {
    const { publishViewSwitch } = mountButton({ stats: { status: 'ready', usage: READY_USAGE }, records: [] })
    expect(publishViewSwitch).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: zh['entry.label'] }))
    expect(screen.getByText('12')).toBeTruthy()
  })

  it('hides the badge while loading and shows the question mark on error', () => {
    mountButton({ stats: { status: 'loading' }, records: [] })
    expect(screen.queryByText('12')).toBeNull()
    cleanup()
    mountButton({ stats: { status: 'error', error: 'kb-not-composed' }, records: [] })
    expect(screen.getByText('?')).toBeTruthy()
  })
})
